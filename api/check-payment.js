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
  if (!session || typeof session !== 'string' || !session.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session' });
  }

  if (!redis) {
    return res.status(503).json({ error: 'Storage unavailable' });
  }

  try {
    const val = await redis.get(`nogoon:paid:${session}`);
    return res.status(200).json({ paid: val === '1' });
  } catch (e) {
    console.error('check-payment error:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
