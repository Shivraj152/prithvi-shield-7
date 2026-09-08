const https = require('https');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  const gateway = body.gateway || (process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'cellular_sms');
  const targetPhone = body.phone || body.targetPhone || '+919933260684';
  const alertMsg = body.message || 'CRITICAL EVACUATION WARNING: Mass movements detected in East Khasi Hills. Seek high ground immediately.';
  const activeToken = (body.pushbulletToken && body.pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || process.env.VITE_PUSHBULLET_TOKEN || 'o.C8YcFNBB0RbvsHZqgpb2MomTJLjfI574';

  // 1. TWILIO DIRECT CELLULAR SMS GATEWAY
  if (gateway === 'twilio' || (body.twilioSid || process.env.TWILIO_ACCOUNT_SID)) {
    const twSid = body.twilioSid || process.env.TWILIO_ACCOUNT_SID;
    const twToken = body.twilioToken || process.env.TWILIO_AUTH_TOKEN;
    const twPhone = body.twilioPhone || process.env.TWILIO_PHONE_NUMBER;

    if (twSid && twToken && twPhone) {
      const postData = new URLSearchParams({
        To: targetPhone,
        From: twPhone,
        Body: `[PRITHVI-SHIELD EMERGENCY ALERT]: ${alertMsg}`
      }).toString();

      try {
        const authHeader = 'Basic ' + Buffer.from(`${twSid}:${twToken}`).toString('base64');
        const twRes = await makeRequest({
          hostname: 'api.twilio.com',
          port: 443,
          path: `/2010-04-01/Accounts/${twSid}/Messages.json`,
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, postData);

        if (twRes.statusCode >= 200 && twRes.statusCode < 300) {
          return res.status(200).json({ success: true, gateway: 'twilio', message: `ALERT SENT TO RESPECTIVE NUMBER ${targetPhone}`, sid: twRes.body.sid, targetPhone, data: twRes.body });
        } else {
          return res.status(twRes.statusCode || 400).json({ success: false, gateway: 'twilio', error: twRes.body.message || 'Twilio Dispatch Error' });
        }
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }
  }

  // 2. DIRECT CELLULAR SMS GATEWAY (Textbelt Free Cellular Gateway for direct SMS delivery)
  if (gateway === 'cellular_sms') {
    const postData = new URLSearchParams({
      phone: targetPhone,
      message: `[PRITHVI-SHIELD EMERGENCY ALERT]: ${alertMsg}`,
      key: body.textbeltKey || process.env.TEXTBELT_KEY || 'textbelt'
    }).toString();

    try {
      const tbRes = await makeRequest({
        hostname: 'textbelt.com',
        port: 443,
        path: '/text',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, postData);

      if (tbRes.body && tbRes.body.success) {
        return res.status(200).json({ success: true, gateway: 'cellular_sms', message: `ALERT SENT TO RESPECTIVE NUMBER ${targetPhone}`, textId: tbRes.body.textId, targetPhone, data: tbRes.body });
      } else {
        return res.status(400).json({ success: false, gateway: 'cellular_sms', error: tbRes.body?.error || 'Cellular SMS Gateway limit reached.' });
      }
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // 3. PUSHBULLET PUSH NOTE + ANDROID SIM SMS DISPATCH
  try {
    // A. Query connected Pushbullet devices to detect Android SIM phone
    let smsDevice = null;
    try {
      const devRes = await makeRequest({
        hostname: 'api.pushbullet.com',
        port: 443,
        path: '/v2/devices',
        method: 'GET',
        headers: { 'Access-Token': activeToken }
      });
      const devices = devRes.body?.devices || [];
      smsDevice = devices.find(d => d.active && (d.has_sms || d.type === 'android' || d.icon === 'phone'));
    } catch (e) {
      console.warn('[Pushbullet Device Query Warning]', e.message);
    }

    // B. Attempt SIM SMS dispatch if Android Phone device with SMS capability is connected
    let simSmsDispatched = false;
    if (smsDevice) {
      try {
        const textPayload = JSON.stringify({
          data: {
            addresses: [targetPhone],
            message: `[PRITHVI-SHIELD EMERGENCY ALERT]: ${alertMsg}`,
            target_device_iden: smsDevice.iden
          }
        });
        const textRes = await makeRequest({
          hostname: 'api.pushbullet.com',
          port: 443,
          path: '/v2/texts',
          method: 'POST',
          headers: {
            'Access-Token': activeToken,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(textPayload)
          }
        }, textPayload);
        if (textRes.statusCode >= 200 && textRes.statusCode < 300) {
          simSmsDispatched = true;
        }
      } catch (e) {
        console.warn('[Pushbullet SIM SMS Warning]', e.message);
      }
    }

    // C. Dispatch Pushbullet Note Push to account
    const postData = JSON.stringify({
      type: 'note',
      title: '🔴 PRITHVI-SHIELD EMERGENCY ALERT',
      body: `[SMS Warning to ${targetPhone}]: ${alertMsg}`
    });

    const pRes = await makeRequest({
      hostname: 'api.pushbullet.com',
      port: 443,
      path: '/v2/pushes',
      method: 'POST',
      headers: {
        'Access-Token': activeToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData);

    if (pRes.statusCode >= 200 && pRes.statusCode < 300) {
      return res.status(200).json({
        success: true,
        gateway: 'pushbullet',
        message: `ALERT SENT TO RESPECTIVE NUMBER ${targetPhone}`,
        targetPhone,
        receiver_email: pRes.body.receiver_email,
        simSmsDispatched,
        simDeviceName: smsDevice?.nickname || smsDevice?.model || null,
        data: pRes.body
      });
    } else {
      return res.status(pRes.statusCode || 400).json({ success: false, gateway: 'pushbullet', error: pRes.body?.error?.message || 'Pushbullet API Error' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};
