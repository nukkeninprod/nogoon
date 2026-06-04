const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { exec, execSync, execFile } = require('node:child_process');
const crypto = require('node:crypto');

// On Windows, force SwiftShader software WebGL so Unicorn Studio renders
// inside VMs and on machines without hardware GPU acceleration.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
}

// Native macOS sudo via osascript — works on all CPU architectures (no binary applet)
function sudoExec(cmd) {
  return new Promise((resolve, reject) => {
    const tmpScript = path.join(app.getPath('temp'), `nogoon_sudo_${Date.now()}.sh`);
    fs.writeFileSync(tmpScript, `#!/bin/bash\n${cmd}\n`, { mode: 0o755 });
    const escaped = tmpScript.replace(/"/g, '\\"');
    const applescript = `do shell script "/bin/bash ${escaped}" with administrator privileges`;
    exec(`osascript -e '${applescript.replace(/'/g, "'\\''")}' 2>&1`, (err, stdout) => {
      try { fs.unlinkSync(tmpScript); } catch {}
      if (err) reject(new Error(stdout || err.message));
      else resolve({ stdout: stdout || '' });
    });
  });
}

// Windows elevation via UAC — runs a raw PowerShell script as admin and waits.
// Resolves with stdout; rejects on script failure or if the user cancels the UAC prompt.
function sudoExecWin(psScript) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const tmpDir = app.getPath('temp');
    const workScript = path.join(tmpDir, `nogoon_work_${ts}.ps1`);
    const errFile = path.join(tmpDir, `nogoon_err_${ts}.txt`);
    const wrapped = [
      '$ErrorActionPreference = "Stop"',
      'try {',
      psScript,
      '  exit 0',
      '} catch {',
      `  $_ | Out-String | Out-File -FilePath "${errFile}" -Encoding utf8`,
      '  exit 1',
      '}',
    ].join('\n');
    fs.writeFileSync(workScript, wrapped, 'utf8');

    // Non-elevated launcher spawns the elevated child, waits, and mirrors its exit code.
    const launcher =
      `$p = Start-Process powershell -Verb RunAs -Wait -PassThru ` +
      `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','"${workScript}"'; ` +
      `exit $p.ExitCode`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', launcher],
      (err, stdout, stderr) => {
        let errText = '';
        try {
          if (fs.existsSync(errFile)) { errText = fs.readFileSync(errFile, 'utf8').trim(); fs.unlinkSync(errFile); }
        } catch {}
        try { fs.unlinkSync(workScript); } catch {}
        if (err) reject(new Error(errText || stderr || err.message));
        else resolve({ stdout: stdout || '' });
      }
    );
  });
}

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

  try {
    const { stdout } = process.platform === 'darwin'
      ? await sudoExec(`/bin/bash "${scriptPath}"`)
      : await sudoExecWin(`& "${scriptPath}"`);
    track('install_success', { type: 'free' });
    return { ok: true, stdout: String(stdout || '') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('install:permanent', async () => {
  const scriptPath = getScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Script introuvable: ${scriptPath}` };
  }

  try {
    if (process.platform === 'darwin') {
      // If already installed (free trial active): just cancel the cleanup daemon.
      // If not installed: run setup.sh then cancel cleanup.
      const isInstalled = fs.existsSync('/Library/LaunchDaemons/io.nogoon.cleanup.plist');
      const removeCleanup = [
        'launchctl unload /Library/LaunchDaemons/io.nogoon.cleanup.plist 2>/dev/null || true',
        'rm -f /Library/LaunchDaemons/io.nogoon.cleanup.plist',
        'rm -f /usr/local/bin/nogoon-cleanup.sh'
      ].join(' && ');
      await sudoExec(isInstalled ? removeCleanup : `/bin/bash "${scriptPath}" && ${removeCleanup}`);
    } else {
      // Windows: install if needed, then delete the auto-revert task => permanent.
      const ps = [
        `$hostsPath = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"`,
        `$installed = Select-String -Path $hostsPath -Pattern '# === NOGOON.IO ===' -Quiet`,
        `if (-not $installed) { & "${scriptPath}" }`,
        `schtasks /Delete /TN "NogoonCleanup" /F 2>$null`,
        `Remove-Item "$env:ProgramData\\nogoon\\cleanup.ps1" -Force -ErrorAction SilentlyContinue`,
      ].join('\n');
      await sudoExecWin(ps);
    }
    track('install_success', { type: 'permanent' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('install:unblock', async () => {
  try {
    if (process.platform === 'darwin') {
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
      await sudoExec(script);
    } else {
      // Windows: restore hosts perms, strip NOGOON block, reset DNS, drop the task.
      const ps = [
        `$hostsPath = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"`,
        `$marker = '# === NOGOON.IO ==='`,
        `$endMarker = '# === END NOGOON.IO ==='`,
        `try {`,
        `  $acl = Get-Acl $hostsPath`,
        `  $acl.SetAccessRuleProtection($true, $false)`,
        `  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('NT AUTHORITY\\SYSTEM','FullControl','Allow')))`,
        `  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('BUILTIN\\Administrators','FullControl','Allow')))`,
        `  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('BUILTIN\\Users','ReadAndExecute','Allow')))`,
        `  Set-Acl -Path $hostsPath -AclObject $acl`,
        `  Set-ItemProperty -Path $hostsPath -Name IsReadOnly -Value $false`,
        `} catch {}`,
        `$content = Get-Content $hostsPath -Raw`,
        `$content = $content -replace "(?s)\\r?\\n?$marker.*?$endMarker\\s*", ""`,
        `Set-Content -Path $hostsPath -Value $content.TrimEnd() -Encoding ASCII`,
        `$dnsBackupFile = "$env:ProgramData\\nogoon\\dns-backup.json"`,
        `$backup = $null`,
        `if (Test-Path $dnsBackupFile) { try { $backup = Get-Content $dnsBackupFile -Raw | ConvertFrom-Json } catch {} }`,
        `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {`,
        `  $idx = $_.ifIndex`,
        `  $entry = $null`,
        `  if ($backup) { $entry = $backup | Where-Object { $_.Index -eq $idx } | Select-Object -First 1 }`,
        `  try {`,
        `    if ($entry -and ($entry.IPv4.Count -gt 0)) { Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $entry.IPv4 }`,
        `    else { Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses }`,
        `  } catch {}`,
        `  if ($entry -and ($entry.IPv6.Count -gt 0)) { try { Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $entry.IPv6 -AddressFamily IPv6 } catch {} }`,
        `}`,
        `ipconfig /flushdns | Out-Null`,
        `schtasks /Delete /TN "NogoonCleanup" /F 2>$null`,
        `Remove-Item "$env:ProgramData\\nogoon" -Recurse -Force -ErrorAction SilentlyContinue`,
      ].join('\n');
      await sudoExecWin(ps);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open:url', async (_e, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('check:state', () => {
  try {
    if (process.platform === 'darwin') {
      const hosts = fs.readFileSync('/etc/hosts', 'utf8');
      const isBlocked = hosts.includes('# === NOGOON.IO ===');
      if (!isBlocked) return { state: 'none' };
      const isPermanent = !fs.existsSync('/Library/LaunchDaemons/io.nogoon.cleanup.plist');
      return { state: isPermanent ? 'permanent' : 'free' };
    }
    // Windows
    const hostsPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
    const hosts = fs.readFileSync(hostsPath, 'utf8');
    const isBlocked = hosts.includes('# === NOGOON.IO ===');
    if (!isBlocked) return { state: 'none' };
    const cleanupScript = path.join(process.env.ProgramData || 'C:\\ProgramData', 'nogoon', 'cleanup.ps1');
    const isPermanent = !fs.existsSync(cleanupScript);
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
    const res = await fetch(`https://nogoon.io/api/checkout?json=1&app=1${testParam}`);
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


