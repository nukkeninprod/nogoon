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
  // Auth check
  const secret = req.query.secret || req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    // ── Stripe: all checkout sessions ──
    const sessions = [];
    let hasMore = true;
    let startingAfter = undefined;

    while (hasMore) {
      const batch = await stripe.checkout.sessions.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const s of batch.data) {
        let redeemed = false;
        if (s.payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(s.payment_intent);
            redeemed = pi.metadata?.redeemed === 'true';
          } catch (e) { /* ignore */ }
        }
        sessions.push({
          id: s.id,
          amount: s.amount_total,
          currency: s.currency,
          status: s.payment_status,
          redeemed,
          email: s.customer_details?.email || null,
          created: new Date(s.created * 1000).toISOString(),
        });
      }
      hasMore = batch.has_more;
      if (batch.data.length > 0) {
        startingAfter = batch.data[batch.data.length - 1].id;
      }
    }

    // ── Redis counters ──
    let counters = null;
    let recentLogs = [];
    if (redis) {
      try {
        const [freeMac, freeWin, paidMac, paidWin] = await Promise.all([
          redis.get('nogoon:free:mac'),
          redis.get('nogoon:free:win'),
          redis.get('nogoon:paid:mac'),
          redis.get('nogoon:paid:win'),
        ]);
        counters = {
          free_mac: parseInt(freeMac) || 0,
          free_win: parseInt(freeWin) || 0,
          paid_mac: parseInt(paidMac) || 0,
          paid_win: parseInt(paidWin) || 0,
        };
        recentLogs = await redis.lrange('nogoon:log', 0, 49);
      } catch (e) {
        console.error('[admin] Redis error:', e.message);
      }
    }

    const paid = sessions.filter(s => s.status === 'paid');

    res.status(200).json({
      summary: {
        total_purchases: paid.length,
        total_revenue: paid.reduce((sum, s) => sum + (s.amount || 0), 0),
        redeemed: paid.filter(s => s.redeemed).length,
        not_redeemed: paid.filter(s => !s.redeemed).length,
        executions: counters || 'Redis not configured — check Vercel function logs',
      },
      purchases: paid,
      recent_executions: recentLogs,
    });
  } catch (err) {
    console.error('[admin]', err);
    res.status(500).json({ error: err.message });
  }
}
