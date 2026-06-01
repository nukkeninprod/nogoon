import { Redis } from '@upstash/redis';

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) {
  redis = null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_REGEX = /^cs_(live|test)_[A-Za-z0-9]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { session, email } = req.body || {};

  if (!session || typeof session !== 'string' || !SESSION_REGEX.test(session)) {
    return res.status(400).json({ ok: false, error: 'Invalid session' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address' });
  }

  if (!redis) return res.status(500).json({ ok: false, error: 'Server error' });

  // Look up the license key for this session
  let key;
  try {
    key = await redis.get(`nogoon:session-license:${session}`);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Server error' });
  }

  if (!key) {
    return res.status(404).json({ ok: false, error: 'License key not found for this session' });
  }

  // Send email via Resend
  try {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Nogoon License Key</title>
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:Arial,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#F9FAFB;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:22px;font-weight:900;color:#111827;letter-spacing:-0.02em;">nogoon</span>
        </td></tr>
        <tr><td style="background:#0B1120;border-radius:16px;padding:32px 28px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#fff;">Your license key</p>
          <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">As requested — here is your Nogoon license key:</p>
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:rgba(161,234,251,0.07);border:2px solid rgba(161,234,251,0.25);border-radius:10px;margin-bottom:20px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">License key</p>
              <p style="margin:0;font-family:'Courier New',monospace;font-size:22px;font-weight:800;letter-spacing:0.1em;color:#A1EAFB;">${key}</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">Open the <strong style="color:#e2e8f0;">Nogoon app</strong>, click <strong style="color:#e2e8f0;">Block permanently</strong>, and enter this key when prompted.</p>
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Questions? <a href="mailto:support@nogoon.io" style="color:#A1EAFB;">support@nogoon.io</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Nogoon <receipt@nogoon.io>',
        to: [email],
        subject: 'Your Nogoon License Key',
        html,
      }),
    });

    if (!r.ok) {
      const body = await r.text();
      console.error('[send-license] Resend error:', r.status, body);
      return res.status(500).json({ ok: false, error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-license] error:', e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
