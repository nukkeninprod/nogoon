import Stripe from 'stripe';
import { Redis } from '@upstash/redis';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

  try {
    // Fast path: Redis already marked paid by webhook
    if (redis) {
      const val = await redis.get(`nogoon:paid:${session}`);
      if (val === '1') return res.status(200).json({ paid: true });
    }

    // Fallback: ask Stripe directly (handles webhook delay)
    const stripeSession = await stripe.checkout.sessions.retrieve(session);
    const paid = stripeSession.payment_status === 'paid';

    // Cache in Redis so future polls are fast
    if (paid && redis) {
      await redis.set(`nogoon:paid:${session}`, '1', { ex: 86400 }).catch(() => {});
    }

    return res.status(200).json({ paid });
  } catch (e) {
    console.error('check-payment error:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
