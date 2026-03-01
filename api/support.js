import { Redis } from '@upstash/redis';

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) { redis = null; }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chatId, message } = req.body || {};
  if (!chatId || !message) {
    return res.status(400).json({ error: 'chatId and message required' });
  }

  const ts = Date.now();
  const msg = { from: 'user', text: message, ts };

  // Detect email
  const isEmail = /^[\w.+\-]+@[\w.\-]+\.\w{2,}$/.test(message.trim());

  // Save to Redis
  if (redis) {
    try {
      await redis.rpush(`chat:${chatId}:msgs`, JSON.stringify(msg));
      await redis.expire(`chat:${chatId}:msgs`, 86400 * 7); // 7 day TTL
      if (isEmail) {
        await redis.set(`chat:${chatId}:email`, message.trim(), { ex: 86400 * 7 });
      }
    } catch (e) {
      console.error('Redis error:', e.message);
    }
  }

  // Send to Slack
  const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
  if (SLACK_WEBHOOK) {
    let email = null;
    if (redis) {
      try { email = await redis.get(`chat:${chatId}:email`); } catch {}
    }

    const replyUrl = `https://nogoon.io/reply.html?c=${encodeURIComponent(chatId)}&s=${encodeURIComponent(process.env.ADMIN_SECRET || '')}`;

    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `💬 *${email || 'Visitor'}*` }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${message}` }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `\`${chatId}\` · ${new Date(ts).toUTCString()}` }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '↩️ Reply in Chat', emoji: true },
            url: replyUrl,
            style: 'primary'
          },
          ...(email ? [{
            type: 'button',
            text: { type: 'plain_text', text: '📧 Email', emoji: true },
            url: `mailto:${email}?subject=Re: nogoon support`
          }] : [])
        ]
      }
    ];

    try {
      await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
    } catch (e) {
      console.error('Slack error:', e.message);
    }
  }

  return res.status(200).json({ ok: true });
}
