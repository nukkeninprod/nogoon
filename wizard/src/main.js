const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const sudo = require('sudo-prompt');

// ── GA4 Measurement Protocol tracking ──────────────────────────────────────
const GA_MEASUREMENT_ID = 'G-0TPCRYPNQT';
const GA_API_SECRET = 'L3ASD8VAQCakMROIphrdJg';
const SESSION_ID = Date.now(); // unique per app launch

function getClientId() {
  const dir = app.getPath('userData');
  const file = path.join(dir, 'nogoon-analytics-id');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    const id = crypto.randomUUID();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, id);
    return id;
  } catch { return 'unknown'; }
}

function getSessionNumber() {
  const dir = app.getPath('userData');
  const file = path.join(dir, 'nogoon-session-count');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const n = fs.existsSync(file) ? (parseInt(fs.readFileSync(file, 'utf8').trim(), 10) || 0) + 1 : 1;
    fs.writeFileSync(file, String(n));
    return n;
  } catch { return 1; }
}

// Initialised once on first call to track() (after app is ready)
let _sessionNumber = null;

async function track(eventName, params = {}) {
  try {
    if (_sessionNumber === null) _sessionNumber = getSessionNumber();
    const clientId = getClientId();
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          events: [{
            name: eventName,
            params: {
              session_id: String(SESSION_ID),
              session_number: _sessionNumber,
              engagement_time_msec: 1,
              ...params,
            },
          }],
        }),
      }
    );
  } catch { /* analytics failure is non-fatal */ }
}
// ───────────────────────────────────────────────────────────────────────────

// Auto-move to /Applications if running from a DMG volume
function autoMoveToApplications() {
  if (process.platform !== 'darwin') return false;
  const appPath = app.getPath('exe');
  // Running from DMG if path contains /Volumes/
  if (!appPath.includes('/Volumes/')) return false;
  // Get the .app bundle path (3 levels up from Contents/MacOS/<binary>)
  const appBundle = path.resolve(appPath, '../../..');
  const dest = `/Applications/${path.basename(appBundle)}`;
  try {
    execSync(`cp -Rf "${appBundle}" "${dest}"`, { stdio: 'ignore' });
    execSync(`xattr -rd com.apple.quarantine "${dest}"`, { stdio: 'ignore' });
    // Force Finder to refresh icon cache for the copied app
    execSync(`touch "${dest}"`, { stdio: 'ignore' });
    execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${dest}"`, { stdio: 'ignore' });
    execSync(`mdimport "${dest}"`, { stdio: 'ignore' });
    // Restart Finder so it picks up the new icon immediately
    execSync(`killall Finder`, { stdio: 'ignore' });
    execSync(`open "${dest}"`, { stdio: 'ignore' });
    app.quit();
    return true;
  } catch (e) {
    // If copy fails (e.g. permission), just continue normally
    return false;
  }
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 340,
    resizable: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Needed for Unicorn Studio (external CDN + WebGL canvas)
      webSecurity: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  if (autoMoveToApplications()) return;
  createWindow();
  track('app_open');
  // Dev shortcut: Cmd+Shift+T → back to home screen
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    win?.webContents.executeJavaScript("typeof show === 'function' && show('home')");
  });
  // When running from /Applications, self-register with Spotlight so Cmd+Space finds the app
  if (process.platform === 'darwin') {
    try {
      const exePath = app.getPath('exe');
      const appBundle = path.resolve(exePath, '../../..');
      if (appBundle.startsWith('/Applications/')) {
        execSync(`mdimport "${appBundle}"`, { stdio: 'ignore' });
      }
    } catch (e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getScriptPath() {
  // In production: extraResources copies scripts/ into Resources/
  // In dev: ../scripts/setup.sh relative to project root
  const isMac = process.platform === 'darwin';
  const scriptName = isMac ? 'setup.sh' : 'setup.ps1';
  const prodPath = path.join(process.resourcesPath, 'scripts', scriptName);
  const devPath = path.join(__dirname, '..', '..', 'scripts', scriptName);
  return fs.existsSync(prodPath) ? prodPath : devPath;
}

ipcMain.handle('install:free', async () => {
  const scriptPath = getScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Script introuvable: ${scriptPath}` };
  }

  const cmd = process.platform === 'darwin'
    ? `/bin/bash "${scriptPath}"`
    : `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;

  return new Promise((resolve) => {
    sudo.exec(cmd, { name: 'Nogoon' }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: err.message, stderr: String(stderr || '') });
      } else {
        track('install_success', { type: 'free' });
        resolve({ ok: true, stdout: String(stdout || '') });
      }
    });
  });
});

ipcMain.handle('install:permanent', async () => {
  const scriptPath = getScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Script introuvable: ${scriptPath}` };
  }

  // Check if nogoon is already installed (hosts file is locked = free trial active)
  // If already installed: just cancel the cleanup daemon to make it permanent.
  // If not installed: run setup.sh then cancel cleanup.
  const isInstalled = fs.existsSync('/Library/LaunchDaemons/io.nogoon.cleanup.plist');

  const removeCleanup = [
    'launchctl unload /Library/LaunchDaemons/io.nogoon.cleanup.plist 2>/dev/null || true',
    'rm -f /Library/LaunchDaemons/io.nogoon.cleanup.plist',
    'rm -f /usr/local/bin/nogoon-cleanup.sh'
  ].join(' && ');

  const cmd = process.platform === 'darwin'
    ? (isInstalled ? removeCleanup : `/bin/bash "${scriptPath}" && ${removeCleanup}`)
    : `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;

  return new Promise((resolve) => {
    sudo.exec(cmd, { name: 'Nogoon' }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.message, stderr: String(stderr || '') });
      else { track('install_success', { type: 'permanent' }); resolve({ ok: true, stdout: String(stdout || '') }); }
    });
  });
});

ipcMain.handle('install:unblock', async () => {
  const script = [
    'chflags noschg /etc/hosts',
    'sed -i \"\" \"/# === NOGOON.IO ===/,/# === END NOGOON.IO ===/d\" /etc/hosts',
    'interfaces=$(networksetup -listallnetworkservices 2>/dev/null | tail -n +2 | grep -v ^\\*)',
    'while IFS= read -r iface; do networksetup -setdnsservers "$iface" Empty 2>/dev/null || true; done <<< "$interfaces"',
    'launchctl unload /Library/LaunchDaemons/io.nogoon.cleanup.plist 2>/dev/null || true',
    'rm -f /Library/LaunchDaemons/io.nogoon.cleanup.plist',
    'rm -f /usr/local/bin/nogoon-cleanup.sh',
    'dscacheutil -flushcache 2>/dev/null || true',
    'killall -HUP mDNSResponder 2>/dev/null || true'
  ].join(' && ');
  return new Promise((resolve) => {
    sudo.exec(script, { name: 'Nogoon' }, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true });
    });
  });
});

ipcMain.handle('open:url', async (_e, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('check:state', () => {
  try {
    const hosts = fs.readFileSync('/etc/hosts', 'utf8');
    const isBlocked = hosts.includes('# === NOGOON.IO ===');
    if (!isBlocked) return { state: 'none' };
    const isPermanent = !fs.existsSync('/Library/LaunchDaemons/io.nogoon.cleanup.plist');
    return { state: isPermanent ? 'permanent' : 'free' };
  } catch {
    return { state: 'none' };
  }
});

ipcMain.on('window:close', () => win?.close());
ipcMain.on('window:minimize', () => win?.minimize());

// Renderer-side analytics events
ipcMain.handle('track:event', (_e, eventName, params = {}) => track(eventName, params));

// Stripe checkout: create session and open browser
ipcMain.handle('checkout:create', async () => {
  try {
    const testParam = app.isPackaged ? '' : '&test=1';
    const res = await fetch(`https://nogoon.io/api/checkout?json=1${testParam}`);
    const data = await res.json();
    if (!data.url) return { ok: false, error: 'No checkout URL' };
    // sessionId from response body, or parse from URL (cs_live_... / cs_test_...)
    const sessionId = data.sessionId || (data.url.match(/\/(cs_(?:live|test)_[^#?/]+)/) || [])[1];
    if (!sessionId) return { ok: false, error: 'Could not get session ID' };
    track('checkout_opened');
    await shell.openExternal(data.url);
    return { ok: true, sessionId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Stripe checkout: poll payment status
ipcMain.handle('checkout:check', async (_e, sessionId) => {
  try {
    const res = await fetch(`https://nogoon.io/api/check-payment?session=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    return { paid: !!data.paid };
  } catch (e) {
    return { paid: false };
  }
});

// License key activation
// checkOnly=true: validates the key exists and is unused without consuming it (GET)
// checkOnly=false (default): marks the key as used (POST)
ipcMain.handle('license:activate', async (_e, key, checkOnly = false) => {
  try {
    let res;
    if (checkOnly) {
      res = await fetch(`https://nogoon.io/api/activate?key=${encodeURIComponent(key)}`, { method: 'GET' });
    } else {
      res = await fetch('https://nogoon.io/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
    }
    const data = await res.json();
    if (data.ok && !checkOnly) track('license_validated');
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});


