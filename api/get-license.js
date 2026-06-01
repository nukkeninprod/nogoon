import { Redis } from '@upstash/redis';
import Stripe from 'stripe';
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
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(session)) {
    return res.status(400).json({ error: 'Invalid session' });
  }
  if (!redis) return res.status(500).json({ error: 'Server error' });

  try {
    // Fast path: key already stored
    const existing = await redis.get(`nogoon:session-license:${session}`);
    if (existing) return res.status(200).json({ key: String(existing) });

    // Verify payment via Stripe (handles expired Redis cache or pre-feature sessions)
    const isTest = session.startsWith('cs_test_');
    const stripeKey = isTest
      ? process.env.STRIPE_TEST_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: 'Server error' });

    const stripe = new Stripe(stripeKey);
    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(session);
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (stripeSession.status !== 'complete' || stripeSession.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    // Generate and store atomically (NX to avoid race conditions)
    const newKey = generateLicenseKey();
    const stored = await redis.set(
      `nogoon:session-license:${session}`,
      newKey,
      { ex: 86400 * 365, nx: true }
    );
    if (stored) {
      await redis.set(
        `nogoon:license:${newKey}`,
        JSON.stringify({ sessionId: session, used: false, createdAt: Date.now(), lazy: true }),
        { ex: 86400 * 365 }
      );
      return res.status(200).json({ key: newKey });
    }
    // Race: another request won — fetch its result
    const winner = await redis.get(`nogoon:session-license:${session}`);
    if (winner) return res.status(200).json({ key: String(winner) });
    return res.status(500).json({ error: 'Server error' });
  } catch (e) {
    console.error('[get-license] error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
