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
  const { session } = req.query;
  if (!session || typeof session !== 'string') {
    return res.status(400).json({ error: 'Missing session' });
  }
  // Only accept valid Stripe session ID format
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(session)) {
    return res.status(400).json({ error: 'Invalid session' });
  }
  if (!redis) return res.status(500).json({ error: 'Server error' });

  try {
    const key = await redis.get(`nogoon:session-license:${session}`);
    if (!key) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ key: String(key) });
  } catch (e) {
    console.error('[get-license] error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
