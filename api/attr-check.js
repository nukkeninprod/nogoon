// /api/attr-check — debug endpoint to verify what /api/setup-sh would resolve
// for the calling client's IP. Remove or restrict after debugging.

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

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ip = getClientIp(req);
  const key = `nogoon:attr:ip:${ip}`;
  let value = null;
  let err = null;
  if (redis) {
    try {
      value = await redis.get(key);
    } catch (e) { err = e.message; }
  }
  res.status(200).json({
    ip,
    key,
    redis_available: !!redis,
    value,
    value_type: typeof value,
    error: err,
    x_forwarded_for: req.headers['x-forwarded-for'] || null,
    x_real_ip: req.headers['x-real-ip'] || null,
  });
}
