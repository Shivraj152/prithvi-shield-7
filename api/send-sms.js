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

  const targetPhone = body.phone || body.targetPhone || '+919933260684';
  const alertMsg = body.message || 'CRITICAL EVACUATION WARNING: Mass movements detected in East Khasi Hills. Seek high ground immediately.';
  const activeToken = (body.pushbulletToken && body.pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || process.env.VITE_PUSHBULLET_TOKEN || 'o.C8YcFNBB0RbvsHZqgpb2MomTJLjfI574';

  // PUSHBULLET GATEWAY ONLY
  try {
    // 1. Query connected Pushbullet devices to detect Android SIM phone
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

    // 2. Attempt SIM SMS dispatch if Android Phone device with SMS capability is connected
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

    // 3. Dispatch Pushbullet Note Push to account
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
