import { Redis } from '@upstash/redis';

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) { redis = null; }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { chatId, message, secret } = req.body || {};

  // Auth
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!chatId || !message) {
    return res.status(400).json({ error: 'chatId and message required' });
  }

  if (!redis) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  const ts = Date.now();
  const msg = { from: 'agent', text: message, ts };

  try {
    await redis.rpush(`chat:${chatId}:msgs`, JSON.stringify(msg));
    await redis.expire(`chat:${chatId}:msgs`, 86400 * 7);
    return res.status(200).json({ ok: true, ts });
  } catch (e) {
    console.error('Reply error:', e.message);
    return res.status(500).json({ error: 'Failed to save' });
  }
}
