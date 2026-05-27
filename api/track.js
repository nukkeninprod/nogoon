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

const ATTR_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'rdt_cid', 'ttclid', 'referrer', 'landing_path',
];

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function deriveSource(attr) {
  if (attr.utm_source) return attr.utm_source;
  if (attr.gclid) return 'google';
  if (attr.fbclid) return 'facebook';
  if (attr.rdt_cid) return 'reddit';
  if (attr.ttclid) return 'tiktok';
  if (attr.referrer) {
    try {
      const h = new URL(attr.referrer).hostname.replace(/^www\./, '');
      if (h) return h;
    } catch (e) { /* ignore */ }
  }
  return '';
}

export default async function handler(req, res) {
  const type = req.query.t; // 'free' or 'paid'
  const os = req.query.os || 'unknown'; // 'mac' or 'win'

  if (!type || !['free', 'paid'].includes(type)) {
    res.status(200).send('ok');
    return;
  }

  const key = `nogoon:${type}:${os}`;
  const ts = new Date().toISOString();

  // Collect attribution baked into the URL by /api/setup-sh or /api/setup-ps1
  const attr = {};
  for (const f of ATTR_FIELDS) {
    const v = req.query[f];
    if (v) attr[f] = String(v).slice(0, 200);
  }

  // Fallback: if the script was fetched via the static /setup.sh (no attribution
  // baked in), try to recover attribution by client IP from /api/attr cache.
  if (Object.keys(attr).length === 0 && redis) {
    try {
      const ip = getClientIp(req);
      if (ip && ip !== 'unknown') {
        const raw = await redis.get(`nogoon:attr:ip:${ip}`);
        if (raw) {
          const fromIp = typeof raw === 'string' ? JSON.parse(raw) : raw;
          for (const f of ATTR_FIELDS) {
            if (fromIp[f]) attr[f] = fromIp[f];
          }
        }
      }
    } catch (e) {
      console.error('[track] IP attr lookup error:', e.message);
    }
  }

  const source = deriveSource(attr) || 'direct';
  const entry = { type, os, ts, source, ...attr };

  // For free trials, classify as first install vs reinstall by client IP and
  // count how many times this IP has hit /api/track?t=free. IPs on US/UK/AU
  // residential desktop ISPs are stable for weeks/months, which is plenty to
  // distinguish a reinstall after the 72h trial expires.
  if (type === 'free' && redis) {
    try {
      const ip = getClientIp(req);
      if (ip && ip !== 'unknown') {
        const countKey = `nogoon:free:ip:${ip}:count`;
        const total = await redis.incr(countKey);
        // Refresh TTL to 90 days on every call (active users stay tracked)
        await redis.expire(countKey, 60 * 60 * 24 * 90);
        const reinstallCount = total - 1; // 0 on first install
        entry.event = total === 1 ? 'free_first' : 'free_reinstall';
        entry.reinstall_count = reinstallCount;
        // Maintain a sorted set of per-IP reinstall counts for distribution.
        // Score = number of reinstalls (>=1). First installs are not added.
        if (total > 1) {
          await redis.zadd('nogoon:free:reinstall_zset', { score: reinstallCount, member: ip });
        }
      }
    } catch (e) {
      console.error('[track] reinstall check error:', e.message);
    }
  }

  console.log(`[track] ${type}${entry.event ? ':' + entry.event : ''}${entry.reinstall_count != null ? ' (#' + entry.reinstall_count + ')' : ''} ${os} src=${source} @ ${ts}`);

  if (redis) {
    try {
      await redis.incr(key);
      // Per-source counter for fast aggregation in admin
      await redis.incr(`nogoon:${type}:${os}:src:${source}`);
      // First-install vs reinstall counters for free trials
      if (type === 'free' && entry.event) {
        await redis.incr(`nogoon:${entry.event}:${os}`);
        await redis.incr(`nogoon:${entry.event}:${os}:src:${source}`);
      }
      await redis.lpush('nogoon:log', JSON.stringify(entry));
      await redis.ltrim('nogoon:log', 0, 499);
    } catch (e) {
      console.error('[track] Redis error:', e.message);
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send('ok');
}
