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

// Allowed license key format: NGON-XXXX-XXXX-XXXX (alphanumeric, no ambiguous chars)
const KEY_REGEX = /^NGON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export default async function handler(req, res) {
  // GET ?key=...&validate=true — check key validity without consuming it
  if (req.method === 'GET') {
    const key = req.query?.key;
    if (!key || typeof key !== 'string') return res.status(400).json({ ok: false, error: 'Missing key' });
    const normalized = key.trim().toUpperCase();
    if (!KEY_REGEX.test(normalized)) return res.status(400).json({ ok: false, error: 'Invalid license key format' });
    if (!redis) return res.status(500).json({ ok: false, error: 'Server error' });
    try {
      const raw = await redis.get(`nogoon:license:${normalized}`);
      if (!raw) return res.status(404).json({ ok: false, error: 'License key not found' });
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (data.used) return res.status(409).json({ ok: false, error: 'License key already used' });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[activate:validate] error:', e.message);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.body || {};
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing key' });
  }

  const normalized = key.trim().toUpperCase();
  if (!KEY_REGEX.test(normalized)) {
    return res.status(400).json({ ok: false, error: 'Invalid license key format' });
  }

  if (!redis) return res.status(500).json({ ok: false, error: 'Server error' });

  try {
    const raw = await redis.get(`nogoon:license:${normalized}`);
    if (!raw) {
      return res.status(404).json({ ok: false, error: 'License key not found' });
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data.used) {
      return res.status(409).json({ ok: false, error: 'License key already used' });
    }

    await redis.set(
      `nogoon:license:${normalized}`,
      JSON.stringify({ ...data, used: true, activatedAt: Date.now() }),
      { ex: 86400 * 365 }
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[activate] error:', e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
