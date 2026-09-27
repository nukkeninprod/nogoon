import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createTelemetry } = require('../wizard/src/desktop-telemetry.js');

test('offline events survive app restart with stable identity and event IDs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nogoon-telemetry-test-'));
  try {
    const first = createTelemetry({ directory, version: '0.2.0', fetchImpl: async () => { throw new Error('offline'); } });
    first.track('install_success', 'free');
    await new Promise(resolve => setImmediate(resolve));
    const pending = JSON.parse(fs.readFileSync(path.join(directory, 'windows-events.json')));
    assert.equal(pending.length, 1); assert.equal(pending[0].event, 'install_success');
    const sent = [];
    const second = createTelemetry({ directory, version: '0.2.0', fetchImpl: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
    assert.equal(first.clientId(), second.clientId());
    await second.flush();
    assert.deepEqual(sent, pending);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'windows-events.json'))), []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('a server outage retains the event for retry', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nogoon-telemetry-test-'));
  try {
    const telemetry = createTelemetry({ directory, version: '0.2.0', fetchImpl: async () => ({ ok: false, status: 503 }) });
    telemetry.track('app_open'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'windows-events.json'))).length, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
