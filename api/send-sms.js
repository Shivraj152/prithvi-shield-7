const https = require('https');

module.exports = async (req, res) => {
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

  const activeToken = (body.pushbulletToken && body.pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || 'o.4HaZWYIpJ4OLNF6FDP6YmhICrXtHGdRV';
  const targetPhone = body.phone || '+919876543210';
  const alertMsg = body.message || 'CRITICAL EVACUATION WARNING: Mass movements detected in East Khasi Hills. Seek high ground immediately.';

  const postData = JSON.stringify({
    type: 'note',
    title: '🔴 PRITHVI-SHIELD EMERGENCY ALERT',
    body: `[SMS Warning to ${targetPhone}]: ${alertMsg}`
  });

  const options = {
    hostname: 'api.pushbullet.com',
    port: 443,
    path: '/v2/pushes',
    method: 'POST',
    headers: {
      'Access-Token': activeToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const pReq = https.request(options, (pRes) => {
    let responseData = '';
    pRes.on('data', (chunk) => { responseData += chunk; });
    pRes.on('end', () => {
      try {
        const parsed = JSON.parse(responseData);
        if (pRes.statusCode >= 200 && pRes.statusCode < 300) {
          return res.status(200).json({ success: true, message: 'Pushbullet Emergency Alert Dispatched Successfully!', data: parsed });
        } else {
          return res.status(pRes.statusCode || 400).json({ success: false, error: parsed.error?.message || 'Pushbullet API Error' });
        }
      } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to parse Pushbullet response' });
      }
    });
  });

  pReq.on('error', (e) => {
    return res.status(500).json({ success: false, error: e.message });
  });

  pReq.write(postData);
  pReq.end();
};
