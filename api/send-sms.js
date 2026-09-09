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
  const activeToken = (body.pushbulletToken && body.pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || process.env.VITE_PUSHBULLET_TOKEN;

  if (!activeToken) {
    return res.status(400).json({ success: false, error: 'Pushbullet Access Token is required.' });
  }

  try {
    // 1. Fetch devices and explicitly filter for active Android devices with SMS enabled
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
      // STRICT FILTER: Must have has_sms: true
      smsDevice = devices.find(d => d.active && d.has_sms === true);
      
      // Fallback to active android if has_sms flag isn't explicitly set
      if (!smsDevice) {
        smsDevice = devices.find(d => d.active && d.type === 'android');
      }
    } catch (e) {
      console.warn('[Pushbullet Device Query Warning]', e.message);
    }

    if (!smsDevice) {
      return res.status(400).json({
        success: false,
        error: 'No active Android phone with SMS Sync enabled was found on this Pushbullet account. Open Pushbullet on your phone -> Settings -> enable SMS Syncing.'
      });
    }

    // 2. Dispatch real SMS via Pushbullet /v2/texts
    let simSmsDispatched = false;
    let smsError = null;

    try {
      const textPayload = JSON.stringify({
        data: {
          target_device_iden: smsDevice.iden,
          addresses: [targetPhone],
          message: `[PRITHVI-SHIELD EMERGENCY ALERT]: ${alertMsg}`
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
      } else {
        smsError = textRes.body;
      }
    } catch (e) {
      console.warn('[Pushbullet SIM SMS Warning]', e.message);
      smsError = e.message;
    }

    // 3. Optional: Send note push notification as fallback/mirror
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

    return res.status(200).json({
      success: true,
      gateway: 'pushbullet',
      message: simSmsDispatched 
        ? `SMS successfully queued to SIM card for ${targetPhone}` 
        : `Push notification sent, but cellular SMS failed to trigger.`,
      targetPhone,
      simSmsDispatched,
      simDeviceName: smsDevice?.nickname || smsDevice?.model || smsDevice?.iden,
      smsError
    });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};