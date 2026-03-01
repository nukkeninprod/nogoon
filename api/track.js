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

export default async function handler(req, res) {
  const type = req.query.t; // 'free' or 'paid'
  const os = req.query.os || 'unknown'; // 'mac' or 'win'

  if (!type || !['free', 'paid'].includes(type)) {
    res.status(200).send('ok');
    return;
  }

  const key = `nogoon:${type}:${os}`;
  const ts = new Date().toISOString();

  // Log to Vercel function logs (always works)
  console.log(`[track] ${type} ${os} @ ${ts}`);

  // Store in Redis if configured
  if (redis) {
    try {
      await redis.incr(key);
      await redis.lpush(`nogoon:log`, JSON.stringify({ type, os, ts }));
      // Keep only last 500 log entries
      await redis.ltrim(`nogoon:log`, 0, 499);
    } catch (e) {
      console.error('[track] Redis error:', e.message);
    }
  }

  // Return 1x1 transparent pixel (works with curl or img tags)
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send('ok');
}
