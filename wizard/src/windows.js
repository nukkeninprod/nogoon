const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout));
  });
}

async function readWindowsState(scriptPath) {
  const output = await runPowerShell(['-File', scriptPath, '-Action', 'State']);
  const state = JSON.parse(output.replace(/^\uFEFF/, '').trim());
  if (!['none', 'free', 'permanent'].includes(state.mode)) throw new Error('Could not read the current protection state.');
  return { state: state.mode, expiresAt: state.expiresAt };
}

async function runWindowsInstall(scriptPath, action, permanent, tempDirectory) {
  if (!['Install', 'Cleanup'].includes(action)) throw new Error('Invalid action');
  // Keep the script and error output together in a unique per-operation folder.
  const dir = fs.mkdtempSync(path.join(tempDirectory, 'nogoon-'));
  const work = path.join(dir, 'install.ps1');
  const errorFile = path.join(dir, 'error.txt');
  const command = `& ${quote(scriptPath)} -Action ${action}${permanent ? ' -Permanent' : ''}`;
  const body = [
    '$ErrorActionPreference = "Stop"',
    '$env:NOGOON_DESKTOP = "1"', '$env:NOGOON_NO_TRACK = "1"',
    'try {', `${command} 2> ${quote(errorFile)}`, '  exit $LASTEXITCODE', '} catch {',
    `  $_.Exception.Message | Set-Content -LiteralPath ${quote(errorFile)} -Encoding UTF8`, '  exit 1', '}'
  ].join('\r\n');
  fs.writeFileSync(work, '\uFEFF' + body, 'utf8');
  const argumentsText = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${work}"`;
  const launcher = `$ErrorActionPreference = 'Stop'; try { $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); if ($admin) { & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${quote(work)}; exit $LASTEXITCODE }; $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList ${quote(argumentsText)}; exit $p.ExitCode } catch { Write-Error $_; exit 1 }`;
  try {
    await runPowerShell(['-EncodedCommand', Buffer.from(launcher, 'utf16le').toString('base64')]);
  } catch (error) {
    let detail = '';
    try { detail = fs.readFileSync(errorFile, 'utf8').replace(/^\uFEFF/, '').trim(); } catch {}
    throw new Error(detail || (/cancel|1223/i.test(error.message) ? 'Administrator permission was cancelled. Nothing was installed.' : 'Windows could not complete the installation. Please retry or contact support@nogoon.io.'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { readWindowsState, runWindowsInstall, quote };
