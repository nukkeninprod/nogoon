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

const ATTR_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'rdt_cid', 'ttclid', 'referrer', 'landing_path',
];

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

async function loadAttrByIp(ip) {
  if (!redis || !ip || ip === 'unknown') return {};
  try {
    const raw = await redis.get(`nogoon:attr:ip:${ip}`);
    if (!raw) return {};
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const out = {};
    for (const f of ATTR_FIELDS) {
      if (obj[f]) out[f] = String(obj[f]).slice(0, 450); // Stripe metadata value max 500 chars
    }
    return out;
  } catch (e) {
    console.error('[checkout] attr lookup error:', e.message);
    return {};
  }
}

export default async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    const requestUrl = new URL(req.url || '', baseUrl);
    const wantsJson = req.query?.json === '1' || requestUrl.searchParams.get('json') === '1';
    const isTest = req.query?.test === '1' || requestUrl.searchParams.get('test') === '1';
    const isApp = req.query?.app === '1' || requestUrl.searchParams.get('app') === '1';

    // Use test key in test mode
    const stripeClient = isTest
      ? new Stripe(process.env.STRIPE_TEST_SECRET_KEY)
      : stripe;

    const ip = getClientIp(req);
    const attr = await loadAttrByIp(ip);
    const metadata = { ...attr, attr_ip: ip };

    const checkoutParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: isTest
                ? '[TEST] Permanent Blocker Script'
                : (isApp ? 'Nogoon — Permanent Block' : 'Permanent Blocker Script'),
              description: isApp
                ? "One-time setup. Block porn permanently on macOS. No subscription. No app to manage. Just install and it's done."
                : "One-time setup. Block it permanently on macOS & Windows. No subscription. No app to manage. Just execute a script and it's done.",
              images: [isApp
                ? 'https://nogoon.io/license-key-buy.png'
                : 'https://nogoon.io/page-success.png'],
            },
            unit_amount: isTest ? 100 : 900, // $1.00 in test, $9.00 in prod
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}${wantsJson ? '&source=app' : ''}`,
      cancel_url: `${baseUrl}/`,
      metadata,
      payment_intent_data: { metadata },
    };

    // Omit payment_method_types so Stripe Checkout uses the payment methods
    // configured in the Dashboard. Fall back to card-only if Stripe rejects it.
    let paymentMethodsMode = 'dashboard';
    let session;
    try {
      session = await stripeClient.checkout.sessions.create(checkoutParams);
    } catch (dashboardErr) {
      paymentMethodsMode = 'card_fallback';
      console.warn('Dashboard payment methods failed; falling back to card:', dashboardErr.message);
      session = await stripeClient.checkout.sessions.create({
        ...checkoutParams,
        payment_method_types: ['card'],
      });
    }

    if (wantsJson) {
      res.status(200).json({ url: session.url, sessionId: session.id, paymentMethodsMode });
      return;
    }

    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
