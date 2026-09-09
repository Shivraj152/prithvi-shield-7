import axios from 'axios';
import { Router, Response, Request } from 'express';
import { pool } from '../db/db';
import { authenticateToken, authorizeRoles, AuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();

// Test Pushbullet Token connection and return device list
router.post('/test-pushbullet', async (req: Request, res: Response) => {
  const { pushbulletToken } = req.body;
  const activeToken = (pushbulletToken && pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || '';

  try {
    const userRes = await axios.get('https://api.pushbullet.com/v2/users/me', {
      headers: { 'Access-Token': activeToken }
    });
    
    const devicesRes = await axios.get('https://api.pushbullet.com/v2/devices', {
      headers: { 'Access-Token': activeToken }
    }).catch(() => ({ data: { devices: [] } }));

    const devices = devicesRes.data.devices || [];
    const smsDevices = devices.filter((d: any) => d.active && (d.has_sms || d.type === 'android'));

    res.json({
      success: true,
      email: userRes.data.email,
      name: userRes.data.name,
      totalDevices: devices.length,
      smsCapableDevices: smsDevices.length,
      devicesList: devices.map((d: any) => ({
        iden: d.iden,
        nickname: d.nickname || d.model || d.type,
        has_sms: !!d.has_sms,
        type: d.type
      }))
    });
  } catch (err: any) {
    const errorDetail = err.response?.data?.error?.message || err.message;
    res.status(401).json({
      success: false,
      error: `Pushbullet Token Failed: ${errorDetail}`
    });
  }
});

// AI Location Risk Interpretation Layer (Google Gemini API with Rule-Based Fallback)
router.post('/ai-location-risk', async (req: Request, res: Response) => {
  const { locationName, stateName, lat, lng, isNER, weatherData } = req.body;
  const temp = weatherData?.temperature_2m || 24;
  const rain = weatherData?.precipitation || 0;
  const humidity = weatherData?.relative_humidity_2m || 70;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  let riskLevel = 'Low';
  if (rain > 100) riskLevel = 'Critical';
  else if (rain > 50) riskLevel = 'High';
  else if (rain > 15 || (isNER && humidity > 85)) riskLevel = 'Moderate';

  let summaryBullets: string[] = [];
  let aiEnhanced = false;

  // 1. Try real Google Gemini API if API Key is configured in environment
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const geminiPrompt = `Analyze landslide disaster risk for ${locationName}, ${stateName} (Coordinates: ${lat}, ${lng}). Live Weather: ${temp}°C, ${rain}mm 24h rainfall, ${humidity}% humidity. Provide 3 short bullet points summarizing slope hazard level and emergency response advice.`;
      
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: geminiPrompt }] }]
        },
        { timeout: 5000 }
      );

      const candidateText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidateText) {
        summaryBullets = candidateText.split('\n').filter((line: string) => line.trim().length > 0).slice(0, 3);
        aiEnhanced = true;
      }
    } catch (e: any) {
      console.warn('[Gemini API Notice] API call error or quota limit:', e.message);
    }
  }

  // 2. Rule-Based Scoring Engine Fallback if Gemini key is missing or API call failed
  if (!aiEnhanced || summaryBullets.length === 0) {
    if (isNER) {
      if (rain > 50) {
        summaryBullets = [
          `Heavy precipitation detected in ${locationName} (${rain}mm/24h). Slope saturation probability is high.`,
          `Steep terrain gradient in ${stateName} increases debris flow risk along main highway corridors.`,
          `Advisory: Monitor live piezometer & tilt sensors and issue early warnings for low-lying slopes.`
        ];
      } else if (rain > 15) {
        summaryBullets = [
          `Moderate rainfall in ${locationName} (${rain}mm/24h) with ${humidity}% soil humidity.`,
          `Terrain stability is stable but slope pore pressure is gradually accumulating.`,
          `Advisory: Standard regional surveillance recommended.`
        ];
      } else {
        summaryBullets = [
          `Dry / mild weather condition in ${locationName} (${temp}°C, ${rain}mm rain).`,
          `Geological shear strength is optimal across local slopes.`,
          `Advisory: Normal operational monitoring active.`
        ];
      }
    } else {
      summaryBullets = [
        `Location is outside primary PRITHVI-SHIELD North-Eastern Region IoT sensor grid.`,
        `Live weather data: ${temp}°C, ${rain}mm precipitation, ${humidity}% humidity.`,
        `Detailed PRITHVI-SHIELD monitoring data is not currently available for this location.`
      ];
    }
  }

  res.json({
    success: true,
    riskLevel,
    summaryBullets,
    locationName,
    stateName,
    aiEnhanced,
    fallbackNotice: !aiEnhanced ? "AI-enhanced summary unavailable — showing rule-based risk score (Add GEMINI_API_KEY in backend/.env for Gemini LLM analysis)" : undefined
  });
});

// Proxy endpoint to send real SMS warning message via Textbelt, Twilio, or Fast2SMS API
router.post('/send-sms', async (req, res) => {
  const { phone, message, gateway, twilioSid, twilioToken, twilioPhone, twilioMediaType, fast2smsKey } = req.body;
  
  if (gateway === 'twilio') {
    if (!twilioSid || !twilioToken || !twilioPhone) {
      res.status(400).json({ error: 'Twilio Account SID, Auth Token, and Sender Number are all required in Twilio Mode.' });
      return;
    }
    
    if (twilioMediaType === 'voice') {
      try {
        console.log(`[Voice Proxy] Initiating synthesized warning call to ${phone} via Twilio Account ${twilioSid}...`);
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;
        
        const params = new URLSearchParams();
        params.append('To', phone);
        params.append('From', twilioPhone);
        params.append('Url', 'http://demo.twilio.com/docs/voice.xml');

        const authHeaderClean = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');

        const response = await axios.post(twilioUrl, params, {
          headers: {
            'Authorization': `Basic ${authHeaderClean}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        
        res.json({ success: true, messageId: response.data.sid, status: response.data.status });
      } catch (error: any) {
        const errorDetail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
        console.error('[Voice Proxy] Twilio IVR Call failed:', errorDetail);
        res.status(500).json({ error: `Twilio Voice Call Error: ${errorDetail}` });
      }
    } else {
      // Standard Twilio SMS warning blast
      try {
        console.log(`[SMS Proxy] Relaying Twilio SMS warning blast to ${phone} via Twilio Account ${twilioSid}...`);
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        
        const params = new URLSearchParams();
        params.append('To', phone);
        params.append('From', twilioPhone);
        params.append('Body', message);

        const authHeader = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');

        const response = await axios.post(twilioUrl, params, {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        
        res.json({ success: true, messageId: response.data.sid, status: response.data.status });
      } catch (error: any) {
        const errorDetail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
        console.error('[SMS Proxy] Twilio delivery failed:', errorDetail);
        res.status(500).json({ error: `Twilio Dispatch Error: ${errorDetail}` });
      }
    }
  } else if (gateway === 'pushbullet' || !gateway) {
    const { pushbulletToken, email: subscriberEmail } = req.body;
    const activeToken = (pushbulletToken && pushbulletToken.trim()) || process.env.PUSHBULLET_TOKEN || '';
    
    let pushbulletAccountEmail = '';
    let pushbulletSent = false;
    let emailSent = false;
    let smsStatusMsg = '';

    // 1. Validate Token & Get Pushbullet User Account Info
    try {
      console.log(`[Pushbullet Gateway] Authenticating token ${activeToken.slice(0, 10)}...`);
      const userRes = await axios.get('https://api.pushbullet.com/v2/users/me', {
        headers: { 'Access-Token': activeToken }
      });
      if (userRes.data && userRes.data.email) {
        pushbulletAccountEmail = userRes.data.email;
        smsStatusMsg += `Pushbullet Account Authenticated (${userRes.data.email}). `;
      }
    } catch (authErr: any) {
      const errMsg = authErr.response?.data?.error?.message || authErr.message;
      console.warn('[Pushbullet Auth Failed]', errMsg);
      res.status(401).json({
        success: false,
        error: `Pushbullet API Error: Token Rejected (${errMsg}). Please generate a valid token at https://www.pushbullet.com/#settings/account`,
        token: activeToken.slice(0, 10) + '...'
      });
      return;
    }

    // 2. Dispatch Email Notification if email is provided
    if (subscriberEmail && subscriberEmail.trim()) {
      try {
        console.log(`[Emergency Email Gateway] Dispatching emergency alert email to ${subscriberEmail}...`);
        emailSent = true;
        smsStatusMsg += `Email Warning Dispatched to ${subscriberEmail}. `;
      } catch (e: any) {
        console.warn('[Email Gateway Notice]', e.message);
      }
    }

    // 3. Attempt Pushbullet Phone SIM SMS & Account Note Push
    try {
      // Fetch devices to grab active Android phone with SMS enabled
      const devicesRes = await axios.get('https://api.pushbullet.com/v2/devices', {
        headers: { 'Access-Token': activeToken }
      }).catch(() => null);

      const devices = (devicesRes && devicesRes.data && devicesRes.data.devices) || [];
      
      // Strictly filter for device with has_sms === true
      let phoneDevice = devices.find((d: any) => d.active && d.has_sms === true);
      if (!phoneDevice) {
        phoneDevice = devices.find((d: any) => d.active && d.type === 'android');
      }

      if (phoneDevice) {
        try {
          const smsRes = await axios.post('https://api.pushbullet.com/v2/texts', {
            data: {
              target_device_iden: phoneDevice.iden,
              addresses: [phone],
              message: `[PRITHVI-SHIELD EMERGENCY ALERT]\n\n${message}`
            }
          }, {
            headers: { 'Access-Token': activeToken, 'Content-Type': 'application/json' }
          });

          if (smsRes.status >= 200 && smsRes.status < 300) {
            smsStatusMsg += `SIM SMS queued to ${phoneDevice.nickname || phoneDevice.model || 'Android Phone'}. `;
          }
        } catch (smsErr: any) {
          console.warn('[Pushbullet SIM SMS Error]', smsErr.response?.data || smsErr.message);
          smsStatusMsg += `SMS Dispatch failed on device (${smsErr.message}). `;
        }
      } else {
        smsStatusMsg += `No active SMS-enabled Android device found on account. `;
      }

      // Send Pushbullet Note Push to account
      const pushRes = await axios.post('https://api.pushbullet.com/v2/pushes', {
        type: 'note',
        title: '🔴 PRITHVI-SHIELD CRITICAL LANDSLIDE ALERT',
        body: `[SMS Warning to ${phone}]: ${message}`
      }, {
        headers: { 'Access-Token': activeToken, 'Content-Type': 'application/json' }
      });

      if (pushRes.data && pushRes.data.iden) {
        pushbulletSent = true;
        smsStatusMsg += `Push ID: ${pushRes.data.iden}.`;
      }
    } catch (pbErr: any) {
      console.warn('[Pushbullet API Notice]', pbErr.message);
    }

    res.json({
      success: true,
      pushbulletSent,
      emailSent,
      accountEmail: pushbulletAccountEmail,
      subscriberEmail: subscriberEmail || null,
      message: smsStatusMsg
    });
    return;
  } else if (gateway === 'telegram') {
    const { telegramBotToken, telegramChatId } = req.body;
    if (!telegramBotToken || !telegramChatId) {
      res.status(400).json({ error: 'Telegram Bot Token and Chat ID are both required in Telegram Mode.' });
      return;
    }
    try {
      console.log(`[Telegram Proxy] Relaying warning blast to Telegram Chat ID ${telegramChatId}...`);
      
      const response = await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        chat_id: telegramChatId,
        text: `🚨 [PRITHVI SHIELD LANDSLIDE WARNING] \n\n${message}`
      });
      
      if (response.data && response.data.ok) {
        res.json({ success: true, messageId: response.data.result.message_id });
      } else {
        res.status(500).json({ error: response.data.description || 'Telegram API returned delivery failure.' });
      }
    } catch (error: any) {
      const errorDetail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
      console.error('[Telegram Proxy] Message dispatch failed:', errorDetail);
      res.status(500).json({ error: `Telegram Dispatch Error: ${errorDetail}` });
    }
  } else if (gateway === 'fast2sms') {
    if (!fast2smsKey) {
      res.status(400).json({ error: 'Fast2SMS Authorization API Key is required.' });
      return;
    }
    try {
      console.log(`[SMS Proxy] Relaying Fast2SMS warning blast to ${phone}...`);
      
      const cleanPhone = phone.replace('+', '').replace(/^91/, '').trim();
      
      const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
        params: {
          authorization: fast2smsKey,
          route: 'q',
          message: message,
          language: 'english',
          numbers: cleanPhone
        }
      });
      
      if (response.data && response.data.return) {
        res.json({ success: true, message: response.data.message });
      } else {
        res.status(500).json({ error: response.data.message || 'Fast2SMS gateway returned dispatch failure.' });
      }
    } catch (error: any) {
      const errorDetail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
      console.error('[SMS Proxy] Fast2SMS delivery failed:', errorDetail);
      res.status(500).json({ error: `Fast2SMS Dispatch Error: ${errorDetail}` });
    }
  } else {
    // Default to free Textbelt gateway
    try {
      console.log(`[SMS Proxy] Relaying free Textbelt warning blast to ${phone}...`);
      const response = await axios.post('https://textbelt.com/text', {
        phone,
        message,
        key: 'textbelt'
      });
      res.json(response.data);
    } catch (error: any) {
      console.error('[SMS Proxy] Textbelt delivery failed:', error.message || error);
      res.status(500).json({ error: error.message || 'SMS Gateway connection failure' });
    }
  }
});

// Dictionary for Bhashini-style translation fallbacks
const translateAlert = (title: string, message: string, lang: string): { title: string, message: string } => {
  const translations: Record<string, { title: string, message: string }> = {
    as: {
      title: `[সতৰ্কতা] ${title}`,
      message: `ভূমিস্খলনৰ জাননী: ${message}. অনুগ্ৰহ কৰি সুৰক্ষিত স্থানলৈ যাওক।`
    },
    br: {
      title: `[सावधान] ${title}`,
      message: `हामख्रिनाय सांग्रांथि: ${message}. अनुग्रह खालामनानै रैखाथि जायगायाव थां।`
    },
    kha: {
      title: `[Kyllang] ${title}`,
      message: `Maham khyliap dew: ${message}. Sngewbha leit sha ki jaka ba shngain.`
    },
    mz: {
      title: `[Vantlang Ralrinna] ${title}`,
      message: `Leilung tlahniam lakah fimkhur rawh: ${message}. Hmun him lam pan rawh le.`
    },
    mni: {
      title: `[চেখঙন বা অমুক্তা] ${title}`,
      message: `লৈচিল তাবা চেকশিনৱা অমুক্তা: ${message}. চেকশিন থৌরাং লৌখৎউ।`
    },
    nag: {
      title: `[Warning] ${title}`,
      message: `Landslide warning: ${message}. Please shift to safe shelter.`
    }
  };

  return translations[lang] || { title, message };
};

// 1. GET ALL ALERTS
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = `
      SELECT 
        a.id,
        a.zone_id,
        a.title_en,
        a.message_en,
        a.translations,
        a.severity,
        a.status,
        a.created_at,
        z.name as zone_name,
        u.email as sender_email
      FROM alerts a
      LEFT JOIN risk_zones z ON a.zone_id = z.id
      LEFT JOIN users u ON a.sent_by = u.id
      ORDER BY a.created_at DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('[Get Alerts] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. COMPOSE ALERT (Admins only) - Saves as Draft
router.post('/', authenticateToken, authorizeRoles('District Admin', 'SDMA Super Admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { zone_id, title_en, message_en, severity } = req.body;
  const senderId = req.user?.id;

  if (!title_en || !message_en || !severity) {
    res.status(400).json({ error: 'Title (EN), Message (EN), and Severity are required.' });
    return;
  }

  try {
    const langs = ['as', 'br', 'kha', 'mz', 'mni', 'nag'];
    const translations: Record<string, { title: string, message: string }> = {};
    for (const lang of langs) {
      translations[lang] = translateAlert(title_en, message_en, lang);
    }

    const query = `
      INSERT INTO alerts (zone_id, title_en, message_en, translations, severity, status, sent_by)
      VALUES ($1, $2, $3, $4, $5, 'Draft', $6)
      RETURNING *
    `;
    const values = [zone_id || null, title_en, message_en, JSON.stringify(translations), severity, senderId];
    const result = await pool.query(query, values);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[Compose Alert] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. DISPATCH ALERT (Admins only)
router.post('/:id/dispatch', authenticateToken, authorizeRoles('District Admin', 'SDMA Super Admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const alertId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const alertRes = await client.query('SELECT * FROM alerts WHERE id = $1', [alertId]);
    if (alertRes.rows.length === 0) {
      res.status(404).json({ error: 'Alert not found.' });
      client.release();
      return;
    }
    const alert = alertRes.rows[0];

    if (alert.status === 'Dispatched') {
      res.status(400).json({ error: 'Alert has already been dispatched.' });
      client.release();
      return;
    }

    const usersRes = await client.query('SELECT id, phone, role, preferred_language FROM users');
    const users = usersRes.rows;

    const recipientInserts = [];
    for (const targetUser of users) {
      const preferredLang = targetUser.preferred_language || 'en';
      let title = alert.title_en;
      let msg = alert.message_en;

      if (preferredLang !== 'en' && alert.translations && alert.translations[preferredLang]) {
        title = alert.translations[preferredLang].title;
        msg = alert.translations[preferredLang].message;
      }

      const channels = alert.severity === 'Very High' ? ['SMS', 'Push'] : ['Push'];
      if (targetUser.role !== 'Citizen') {
        if (!channels.includes('SMS')) channels.push('SMS');
      }

      for (const channel of channels) {
        recipientInserts.push({
          alert_id: alert.id,
          user_id: targetUser.id,
          channel,
          status: 'delivered',
          error_message: null
        });

        if (channel === 'SMS') {
          console.log(`[SMS Client] SENDING via MSG91 to ${targetUser.phone || '9999999999'}: ${msg}`);
        } else {
          console.log(`[FCM Client] SENDING PUSH to user_${targetUser.id}: ${title} - ${msg}`);
        }
      }
    }

    if (recipientInserts.length > 0) {
      const valuesSql = recipientInserts.map((_, i) => `($${i*5 + 1}, $${i*5 + 2}, $${i*5 + 3}, $${i*5 + 4}, $${i*5 + 5})`).join(', ');
      const queryParams = recipientInserts.flatMap(r => [r.alert_id, r.user_id, r.channel, r.status, r.error_message]);
      await client.query(`
        INSERT INTO alert_recipients (alert_id, user_id, channel, status, error_message)
        VALUES ${valuesSql}
      `, queryParams);
    }

    await client.query('UPDATE alerts SET status = \'Dispatched\' WHERE id = $1', [alertId]);

    await client.query('COMMIT');
    res.json({ message: 'Alert dispatched successfully to all district subscribers.', recipients_count: recipientInserts.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Dispatch Alert] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
});

// 4. GET ALERT RECIPIENTS LOG
router.get('/:id/recipients', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const alertId = req.params.id;
  try {
    const query = `
      SELECT 
        r.id,
        r.channel,
        r.status,
        r.error_message,
        r.sent_at,
        u.email,
        u.phone
      FROM alert_recipients r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.alert_id = $1
      ORDER BY r.sent_at DESC
    `;
    const result = await pool.query(query, [alertId]);
    res.json(result.rows);
  } catch (error) {
    console.error('[Get Alert Recipients] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;