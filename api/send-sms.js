module.exports = async (req, res) => {
  // CORS
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
  const alertMsg = body.message || 'CRITICAL EVACUATION WARNING: Mass movements and saturated slope soils detected in East Khasi Hills. Seek high ground immediately.';

  try {
    const pushRes = await fetch('https://api.pushbullet.com/v2/pushes', {
      method: 'POST',
      headers: {
        'Access-Token': activeToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'note',
        title: '🔴 PRITHVI-SHIELD EMERGENCY ALERT',
        body: `[SMS Warning to ${targetPhone}]: ${alertMsg}`
      })
    });

    const data = await pushRes.json();

    if (!pushRes.ok) {
      return res.status(pushRes.status).json({
        success: false,
        error: data.error?.message || 'Pushbullet API error'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Pushbullet Emergency Alert Dispatched Successfully!',
      data
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
