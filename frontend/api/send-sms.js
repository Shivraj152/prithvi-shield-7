const https = require('https');

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

      return new Promise((resolve) => {
        const authHeader = 'Basic ' + Buffer.from(`${twSid}:${twToken}`).toString('base64');
        const options = {
          hostname: 'api.twilio.com',
          port: 443,
          path: `/2010-04-01/Accounts/${twSid}/Messages.json`,
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const req = https.request(options, (tRes) => {
          let responseData = '';
          tRes.on('data', (chunk) => { responseData += chunk; });
          tRes.on('end', () => {
            try {
              const parsed = JSON.parse(responseData);
              if (tRes.statusCode >= 200 && tRes.statusCode < 300) {
                res.status(200).json({ success: true, gateway: 'twilio', message: `Twilio Cellular SMS Sent to ${targetPhone}`, sid: parsed.sid, data: parsed });
              } else {
                res.status(tRes.statusCode || 400).json({ success: false, gateway: 'twilio', error: parsed.message || 'Twilio Dispatch Error' });
              }
            } catch (e) {
              res.status(500).json({ success: false, error: 'Failed to parse Twilio response' });
            }
            resolve();
          });
        });

        req.on('error', (e) => {
          res.status(500).json({ success: false, error: e.message });
          resolve();
        });

        req.write(postData);
        req.end();
      });
    }
  }

  // 2. DIRECT CELLULAR SMS GATEWAY (Textbelt Free Cellular Gateway fallback for arbitrary mobile numbers)
  if (gateway === 'cellular_sms') {
    const postData = new URLSearchParams({
      phone: targetPhone,
      message: `[PRITHVI-SHIELD EMERGENCY ALERT]: ${alertMsg}`,
      key: body.textbeltKey || process.env.TEXTBELT_KEY || 'textbelt'
    }).toString();

    return new Promise((resolve) => {
      const options = {
        hostname: 'textbelt.com',
        port: 443,
        path: '/text',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (tRes) => {
        let responseData = '';
        tRes.on('data', (chunk) => { responseData += chunk; });
        tRes.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.success) {
              res.status(200).json({ success: true, gateway: 'cellular_sms', message: `Cellular SMS Sent to ${targetPhone}! (TextID: ${parsed.textId})`, textId: parsed.textId, data: parsed });
            } else {
              res.status(400).json({ success: false, gateway: 'cellular_sms', error: parsed.error || 'Cellular SMS Gateway limit reached. Configure Twilio or Pushbullet.' });
            }
          } catch (e) {
            res.status(500).json({ success: false, error: 'Failed to parse SMS gateway response' });
          }
          resolve();
        });
      });

      req.on('error', (e) => {
        res.status(500).json({ success: false, error: e.message });
        resolve();
      });

      req.write(postData);
      req.end();
    });
  }

  // 3. PUSHBULLET PUSH NOTE GATEWAY
  const activeToken = (body.pushbulletToken && body.pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || process.env.VITE_PUSHBULLET_TOKEN || 'o.4HaZWYIpJ4OLNF6FDP6YmhICrXtHGdRV';

  const postData = JSON.stringify({
    type: 'note',
    title: '🔴 PRITHVI-SHIELD EMERGENCY ALERT',
    body: `[SMS Warning to ${targetPhone}]: ${alertMsg}`
  });

  return new Promise((resolve) => {
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
            res.status(200).json({ success: true, gateway: 'pushbullet', message: 'Pushbullet Emergency Alert Dispatched Successfully!', data: parsed });
          } else {
            res.status(pRes.statusCode || 400).json({ success: false, gateway: 'pushbullet', error: parsed.error?.message || 'Pushbullet API Error' });
          }
        } catch (e) {
          res.status(500).json({ success: false, error: 'Failed to parse Pushbullet response' });
        }
        resolve();
      });
    });

    pReq.on('error', (e) => {
      res.status(500).json({ success: false, error: e.message });
      resolve();
    });

    pReq.write(postData);
    pReq.end();
  });
};
