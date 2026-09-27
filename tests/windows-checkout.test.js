import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Windows attribution preserves the existing 9 USD hosted checkout', async () => {
  const fakeStripe = `class Stripe { constructor() { this.checkout = { sessions: { create: async params => { globalThis.__windowsCheckoutParams = params; return { id: 'cs_test_audit', url: 'https://checkout.stripe.com/c/pay/cs_test_audit' }; } } }; } }`;
  const source = fs.readFileSync(new URL('../api/checkout.js', import.meta.url), 'utf8')
    .replace("import Stripe from 'stripe';", fakeStripe)
    .replace("import { Redis } from '@upstash/redis';", 'class Redis { async get() { return null; } }');
  const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const res = { status(n) { this.code = n; return this; }, json(value) { this.body = value; } };
  await handler({ method: 'GET', url: '/api/checkout?json=1&app=1&os=win&app_version=0.2.0', query: { json: '1', app: '1', os: 'win', app_version: '0.2.0' }, headers: { host: 'nogoon.io' } }, res);
  assert.equal(res.code, 200);
  const params = globalThis.__windowsCheckoutParams;
  assert.equal(params.mode, 'payment');
  assert.equal(params.line_items[0].price_data.unit_amount, 900);
  assert.equal(params.line_items[0].price_data.currency, 'usd');
  assert.equal(params.metadata.platform, 'win');
  assert.equal(params.metadata.app_version, '0.2.0');
  assert.deepEqual(params.payment_intent_data.metadata, params.metadata);
  assert.match(params.success_url, /source=app/);
  delete globalThis.__windowsCheckoutParams;
});

test('legacy verification failures and reruns never increment successful install counters', async () => {
  globalThis.__legacyIncrements = 0;
  const fakeRedis = 'class Redis { async get(){return null;} async incr(){globalThis.__legacyIncrements++; return 1;} async expire(){} async lpush(){} async ltrim(){} }';
  const source = fs.readFileSync(new URL('../api/track.js', import.meta.url), 'utf8').replace("import { Redis } from '@upstash/redis';", fakeRedis);
  const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  for (const query of [{ t: 'free', os: 'win', verify: 'fail' }, { t: 'free', os: 'win', rerun: '1' }]) {
    const res = { setHeader() {}, status(n) { this.code = n; return this; }, send(value) { this.body = value; } };
    await handler({ query, headers: {} }, res);
    assert.equal(res.code, 200); assert.equal(res.body, 'ok');
    assert.equal(globalThis.__legacyIncrements, 0);
  }
});
