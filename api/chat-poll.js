import { Redis } from '@upstash/redis';

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) { redis = null; }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const chatId = req.query.id;
  const after = parseInt(req.query.after) || 0;
  const fromFilter = req.query.from; // 'agent' or 'user'

  if (!chatId) return res.status(400).json({ error: 'Missing id' });
  if (!redis) return res.status(200).json({ messages: [] });

  res.setHeader('Cache-Control', 'no-store');

  try {
    const raw = await redis.lrange(`chat:${chatId}:msgs`, 0, -1);
    let messages = raw.map(m => typeof m === 'string' ? JSON.parse(m) : m);

    // Filter by timestamp
    if (after > 0) {
      messages = messages.filter(m => m.ts > after);
    }

    // Filter by sender
    if (fromFilter === 'agent' || fromFilter === 'user') {
      messages = messages.filter(m => m.from === fromFilter);
    }

    return res.status(200).json({ messages });
  } catch (e) {
    console.error('Poll error:', e.message);
    return res.status(200).json({ messages: [] });
  }
}
