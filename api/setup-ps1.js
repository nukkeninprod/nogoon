// /api/setup-ps1 — serves public/setup.ps1 with attribution injected.
// Mirror of /api/setup-sh but for Windows / PowerShell.

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

let SCRIPT_BODY = '';
try {
  SCRIPT_BODY = readFileSync(join(process.cwd(), 'scripts', 'setup.ps1'), 'utf8');
  // Strip UTF-8 BOM so `irm | iex` users get a clean string (BOM is for the
  // bundled file consumed by Windows PowerShell 5.1 only).
  if (SCRIPT_BODY.charCodeAt(0) === 0xFEFF) SCRIPT_BODY = SCRIPT_BODY.slice(1);
} catch (e) {
  console.error('[setup-ps1] cannot read scripts/setup.ps1:', e.message);
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
  // PowerShell expects UTF-8; the iex pipe handles it fine.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
      console.error('[setup-ps1] Redis lookup error:', e.message);
    }
  }

  // Source script must contain: $NOGOON_ATTR = ""
  const body = attrQuery
    ? SCRIPT_BODY.replace('$NOGOON_ATTR = ""', `$NOGOON_ATTR = "${attrQuery}"`)
    : SCRIPT_BODY;

  res.status(200).send(body);
}
