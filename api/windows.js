import { Redis } from '@upstash/redis';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { WINDOWS_VERSION, WINDOWS_DOWNLOAD, validClientId, validateWindowsEvent, recordWindowsEvent, readWindowsFunnel } from '../lib/windows-funnel.js';

function authorized(req) {
  const expected = process.env.ADMIN_SECRET;
  const supplied = req.headers['x-admin-secret'];
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createWindowsHandler(redis) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.query?.action === 'stats') {
      if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      if (!redis) return res.status(503).json({ error: 'Tracking unavailable' });
      try { return res.status(200).json(await readWindowsFunnel(redis)); }
      catch { return res.status(503).json({ error: 'Tracking unavailable' }); }
    }
    if (req.method === 'HEAD' && req.query?.action === 'download') return res.redirect(302, WINDOWS_DOWNLOAD);
    if (req.method === 'GET' && req.query?.action === 'download') {
      // Do not count previews/prefetches as a user download.
      const prefetch = /prefetch/i.test(`${req.headers.purpose || ''} ${req.headers['sec-purpose'] || ''}`);
      const cookie = /(?:^|;\s*)nogoon_windows_id=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const id = validClientId(cookie) ? cookie : randomUUID();
      res.setHeader('Set-Cookie', `nogoon_windows_id=${id}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
      if (redis && !prefetch) {
        try { await recordWindowsEvent(redis, { event: 'download', client_id: id, version: WINDOWS_VERSION }); }
        catch { console.error('[windows] download counter unavailable'); }
      }
      return res.redirect(302, WINDOWS_DOWNLOAD);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const event = validateWindowsEvent(req.body);
    if (!event) return res.status(400).json({ error: 'Invalid event' });
    if (!redis) return res.status(503).json({ error: 'Tracking unavailable' });
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
      const bucket = createHash('sha256').update(ip).digest('hex').slice(0, 24);
      const key = `nogoon:windows:rate:${bucket}:${Math.floor(Date.now() / 3600000)}`;
      const attempts = await redis.incr(key);
      if (attempts === 1) await redis.expire(key, 7200);
      if (attempts > 500) return res.status(429).json({ error: 'Too many events' });
      await recordWindowsEvent(redis, event);
      return res.status(200).json({ ok: true });
    } catch { return res.status(503).json({ error: 'Tracking unavailable' }); }
  };
}

let redis;
try { if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) redis = Redis.fromEnv(); } catch {}
export default createWindowsHandler(redis);
