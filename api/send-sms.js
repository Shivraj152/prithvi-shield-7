export default async function handler(req, res) {
  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { phone, message, pushbulletToken } = body;
    const activeToken = (pushbulletToken && pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || 'o.4HaZWYIpJ4OLNF6FDP6YmhICrXtHGdRV';

    if (!activeToken) {
      return res.status(400).json({ error: 'Pushbullet access token is required' });
    }

    const targetPhone = phone || '+919876543210';
    const alertMsg = message || 'CRITICAL EVACUATION WARNING: Mass movements and saturated slope soils detected in East Khasi Hills. Seek high ground immediately.';

    // 1. Dispatch Pushbullet Push Note
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

    const pushData = await pushRes.json();

    if (!pushRes.ok) {
      return res.status(pushRes.status).json({
        success: false,
        error: pushData.error?.message || 'Pushbullet API rejected token'
      });
    }

    // 2. Try Pushbullet SMS device sync if phone device is connected
    try {
      const devRes = await fetch('https://api.pushbullet.com/v2/devices', {
        headers: { 'Access-Token': activeToken }
      });
      const devData = await devRes.json();
      const devices = devData.devices || [];
      const phoneDev = devices.find(d => d.active && (d.has_sms || d.kind === 'android' || d.type === 'android'));

      if (phoneDev) {
        await fetch('https://api.pushbullet.com/v2/texts', {
          method: 'POST',
          headers: {
            'Access-Token': activeToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: {
              addresses: [targetPhone],
              message: `[PRITHVI-SHIELD EMERGENCY ALERT]\n\n${alertMsg}`,
              target_device_iden: phoneDev.iden
            }
          })
        });
      }
    } catch (devErr) {
      console.warn('Device SMS sync notice:', devErr);
    }

    return res.status(200).json({
      success: true,
      message: 'Pushbullet Emergency Alert Dispatched Successfully!',
      data: pushData
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
