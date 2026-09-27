// Disposable Windows runner only. Payments are mocked; packaged installation is real.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
if (process.platform !== 'win32' || process.env.CI !== 'true') throw new Error('Disposable Windows CI only');
const out = path.resolve('test-results'); fs.mkdirSync(out, { recursive: true });
const installDir = path.join(process.env.RUNNER_TEMP, 'Nogoon-installed');
const installer = path.resolve('wizard/dist/Nogoon-Setup-0.2.0.exe');
const env = { ...process.env, NOGOON_NO_TRACK: '1', NOGOON_DESKTOP: '1', NOGOON_SKIP_BROWSER_CLOSE: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const script = path.join(installDir, 'resources', 'scripts', 'setup.ps1');
let app;
function cleanup() {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', 'Cleanup'], { env, stdio: 'pipe', timeout: 120000 });
}
async function start() {
  app = await electron.launch({ executablePath: path.join(installDir, 'Nogoon.exe'), env, timeout: 60000 });
  await app.evaluate(({ shell }) => {
    shell.openExternal = async url => { globalThis.__checkoutURL = url; };
    globalThis.__licenseConsumed = false;
    globalThis.fetch = async (url, options = {}) => {
      const value = String(url);
      if (value.includes('/api/checkout?')) return { json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_nogoon_ci', sessionId: 'cs_test_nogoon_ci' }) };
      if (value.includes('/api/activate')) {
        const key = options.method === 'POST' ? JSON.parse(options.body).key : new URL(value).searchParams.get('key');
        const ok = key === 'NGON-AAAA-BBBB-CCCC';
        if (ok && options.method === 'POST') globalThis.__licenseConsumed = true;
        return { json: async () => ({ ok, ...(ok ? {} : { error: 'Invalid test license' }) }) };
      }
      throw new Error('Unexpected network request in Windows CI');
    };
  });
  const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded'); return page;
}
async function done(page, permanent) {
  await page.waitForFunction(() => ['screen-done', 'screen-error'].some(id => !document.getElementById(id).classList.contains('hidden')), null, { timeout: 120000 });
  if (await page.locator('#screen-error').isVisible()) throw new Error(await page.locator('#error-msg').innerText());
  assert.equal((await page.locator('#done-title').innerText()).includes('permanently'), permanent);
}
try {
  execFileSync(installer, ['/S', `/D=${installDir}`], { env, stdio: 'pipe', timeout: 120000 });
  assert.ok(fs.existsSync(path.join(installDir, 'Nogoon.exe'))); assert.ok(fs.existsSync(script));
  let page = await start();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(await page.locator('#win-close').isVisible(), true);
  await page.screenshot({ path: path.join(out, 'windows-home.png') });
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#btn-free').click();
  assert.equal((await page.evaluate(() => window.nogoon.checkState())).state, 'none');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#btn-free').click(); await done(page, false);
  const state = await page.evaluate(() => window.nogoon.checkState());
  assert.equal(state.state, 'free'); assert.ok(Date.parse(state.expiresAt) > Date.now());
  await page.screenshot({ path: path.join(out, 'windows-free.png') });
  await app.close(); app = null;
  page = await start(); await done(page, false);
  await page.locator('#btn-permanent-2').click();
  await page.locator('#license-key-input').fill('NGON-AAAA-BBBB-DDDD'); await page.locator('#btn-activate').click();
  await page.waitForFunction(() => document.getElementById('license-error').textContent.includes('Invalid'));
  assert.equal((await page.evaluate(() => window.nogoon.checkState())).state, 'free');
  await page.locator('#license-key-input').fill('NGON-AAAA-BBBB-CCCC');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#btn-activate').click(); await done(page, true);
  assert.equal(await app.evaluate(() => globalThis.__licenseConsumed), true);
  assert.equal((await page.evaluate(() => window.nogoon.checkState())).state, 'permanent');
  await page.screenshot({ path: path.join(out, 'windows-permanent.png') });
  await app.close(); app = null; cleanup();
  page = await start(); await page.locator('#btn-permanent').click();
  await page.locator('#license-key-input').fill('NGON-AAAA-BBBB-CCCC');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#btn-activate').click(); await done(page, true);
  assert.equal((await page.evaluate(() => window.nogoon.checkState())).state, 'permanent');
  console.log('PASS: packaged NSIS install, real UI, cancel, free install, restart, invalid license, free -> permanent, direct permanent. Payment service mocked.');
} catch (error) {
  if (app) { try { const page = await app.firstWindow(); await page.screenshot({ path: path.join(out, 'windows-failure.png') }); console.error((await page.locator('body').innerText()).slice(-3000)); } catch {} }
  throw error;
} finally {
  if (app) await app.close();
  if (fs.existsSync(script)) {
    try { cleanup(); }
    catch (error) { console.error('Final cleanup failed:', error.stderr?.toString() || error.message); process.exitCode = 1; }
  }
}
