import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWindowsHandler } from '../api/windows.js';
import { recordWindowsEvent, readWindowsFunnel, validateWindowsEvent, WINDOWS_VERSION } from '../lib/windows-funnel.js';

class MemoryRedis {
  sets = new Map(); values = new Map();
  async sadd(key, value) { const set = this.sets.get(key) || new Set(); const n = set.size; set.add(value); this.sets.set(key, set); return set.size - n; }
  async scard(key) { return this.sets.get(key)?.size || 0; }
  async incr(key) { const n = (this.values.get(key) || 0) + 1; this.values.set(key, n); return n; }
  async expire() {}
}
const event = (name, client, mode = 'free') => ({ event: name, client_id: client, event_id: randomUUID(), version: WINDOWS_VERSION, mode });
const response = () => ({ headers: {}, code: 0, body: null, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, redirect(code, location) { this.code = code; this.location = location; return this; } });

test('failed and retried installs do not inflate successful free/permanent devices', async () => {
  const redis = new MemoryRedis(), id = randomUUID();
  await recordWindowsEvent(redis, event('install_failed', id));
  assert.equal((await readWindowsFunnel(redis)).counts.install_success, 0);
  const success = event('install_success', id);
  await recordWindowsEvent(redis, success); await recordWindowsEvent(redis, success);
  await recordWindowsEvent(redis, event('install_success', id, 'permanent'));
  const { counts } = await readWindowsFunnel(redis);
  assert.equal(counts.install_success, 1); assert.equal(counts.free_success, 1); assert.equal(counts.permanent_success, 1);
});
test('download request is versioned, cookie deduplicated and prefetch ignored', async () => {
  const redis = new MemoryRedis(), handler = createWindowsHandler(redis), first = response();
  await handler({ method: 'GET', query: { action: 'download' }, headers: {} }, first);
  assert.equal(first.code, 302); assert.match(first.location, /v0\.2\.0\/Nogoon-Setup-0\.2\.0\.exe$/);
  const cookie = first.headers['Set-Cookie'].split(';')[0];
  await handler({ method: 'GET', query: { action: 'download' }, headers: { cookie } }, response());
  await handler({ method: 'GET', query: { action: 'download' }, headers: { purpose: 'prefetch' } }, response());
  assert.equal((await readWindowsFunnel(redis)).counts.download, 1);
});
test('rejects invalid events and refuses stats when no admin secret is configured', async () => {
  assert.equal(validateWindowsEvent(event('install_success', 'not-an-id')), null);
  assert.equal(validateWindowsEvent({ ...event('install_success', randomUUID()), mode: 'anything' }), null);
  const old = process.env.ADMIN_SECRET; delete process.env.ADMIN_SECRET;
  const res = response(); await createWindowsHandler(new MemoryRedis())({ method: 'GET', query: { action: 'stats' }, headers: {} }, res);
  assert.equal(res.code, 401);
  if (old !== undefined) process.env.ADMIN_SECRET = old;
});
test('storage failures are retryable, never acknowledged as saved', async () => {
  const res = response();
  await createWindowsHandler({ incr: async () => { throw new Error('offline'); } })({ method: 'POST', body: event('app_open', randomUUID()), headers: {} }, res);
  assert.equal(res.code, 503);
});
