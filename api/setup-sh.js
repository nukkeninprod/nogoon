// /api/setup-sh — serves public/setup.sh with attribution injected.
// Looks up attribution by client IP (stored by /api/attr at page load).
// If found, sets NOGOON_ATTR in the script so /api/track call carries source data.
// If not found, serves the script unchanged (NOGOON_ATTR stays empty).

import { Redis } from '@upstash/redis';
import { readFileSync } from 'fs';
import { join } from 'path';

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) {
  redis = null;
}

// Load script once at cold start
let SCRIPT_BODY = '';
try {
  SCRIPT_BODY = readFileSync(join(process.cwd(), 'public', 'setup.sh'), 'utf8');
} catch (e) {
  console.error('[setup-sh] cannot read public/setup.sh:', e.message);
}

const ATTR_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'rdt_cid', 'ttclid', 'referrer', 'landing_path',
];

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function buildAttrQuery(attr) {
  if (!attr || typeof attr !== 'object') return '';
  const parts = [];
  for (const f of ATTR_FIELDS) {
    if (attr[f]) parts.push(`${f}=${encodeURIComponent(attr[f])}`);
  }
  return parts.join('&');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!SCRIPT_BODY) {
    res.status(500).send('# nogoon: script unavailable\nexit 1\n');
    return;
  }

  let attrQuery = '';
  const ip = getClientIp(req);

  if (redis && ip && ip !== 'unknown') {
    try {
      const raw = await redis.get(`nogoon:attr:ip:${ip}`);
      if (raw) {
        const attr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        attrQuery = buildAttrQuery(attr);
      }
    } catch (e) {
      console.error('[setup-sh] Redis lookup error:', e.message);
    }
  }

  // Inject attribution. The source script must contain: NOGOON_ATTR=""
  // We replace the empty value with the URL-encoded query string.
  // Bash-safe: no double quotes or backticks in attrQuery (encodeURIComponent handles it).
  const body = attrQuery
    ? SCRIPT_BODY.replace('NOGOON_ATTR=""', `NOGOON_ATTR="${attrQuery}"`)
    : SCRIPT_BODY;

  res.status(200).send(body);
}
