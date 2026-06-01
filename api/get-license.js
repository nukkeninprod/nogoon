import { Redis } from '@upstash/redis';
import crypto from 'crypto';

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) {
  redis = null;
}

function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `NGON-${segment()}-${segment()}-${segment()}`;
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
    // Try direct lookup first
    let key = await redis.get(`nogoon:session-license:${session}`);
    if (key) return res.status(200).json({ key: String(key) });

    // Lazy generation: if webhook already marked this session as paid but no key yet
    const paid = await redis.get(`nogoon:paid:${session}`);
    if (!paid) return res.status(404).json({ error: 'Not found' });

    // Generate and store atomically (NX = only if not exists, to avoid race condition)
    const newKey = generateLicenseKey();
    const stored = await redis.set(
      `nogoon:session-license:${session}`,
      newKey,
      { ex: 86400 * 365, nx: true }
    );
    if (stored) {
      // Also store the full license record
      await redis.set(
        `nogoon:license:${newKey}`,
        JSON.stringify({ sessionId: session, used: false, createdAt: Date.now(), lazy: true }),
        { ex: 86400 * 365 }
      );
      return res.status(200).json({ key: newKey });
    }
    // Another request generated the key concurrently — fetch the winner
    const existing = await redis.get(`nogoon:session-license:${session}`);
    if (existing) return res.status(200).json({ key: String(existing) });

    return res.status(500).json({ error: 'Server error' });
  } catch (e) {
    console.error('[get-license] error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
