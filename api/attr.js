// /api/attr — capture attribution at landing.
// Stores UTM/click-id/referrer keyed by client IP in Redis (TTL 30min).
// Later, /api/setup-sh and /api/setup-ps1 look up by IP and bake the
// attribution into the script before serving it.

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

// Fields we care about (kept short to fit URL/script size limits)
const ATTR_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'rdt_cid',
  'ttclid',
  'referrer',
  'landing_path',
];

const MAX_FIELD_LEN = 200;
const TTL_SECONDS = 1800; // 30 minutes

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function sanitize(v) {
  if (v == null) return '';
  return String(v).slice(0, MAX_FIELD_LEN);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false });
    return;
  }

  // Accept either POST JSON body or GET query params
  const src = req.method === 'POST' ? (req.body || {}) : req.query;

  const attr = {};
  for (const f of ATTR_FIELDS) {
    const v = sanitize(src[f]);
    if (v) attr[f] = v;
  }

  // Nothing useful — don't store
  if (Object.keys(attr).length === 0) {
    res.status(200).json({ ok: true, stored: false });
    return;
  }

  const ip = getClientIp(req);
  attr._ts = new Date().toISOString();

  let stored = false;
  if (redis && ip && ip !== 'unknown') {
    try {
      await redis.set(`nogoon:attr:ip:${ip}`, JSON.stringify(attr), { ex: TTL_SECONDS });
      stored = true;
    } catch (e) {
      console.error('[attr] Redis error:', e.message);
    }
  }

  res.status(200).json({ ok: true, stored });
}
