export const WINDOWS_VERSION = '0.2.0';
export const WINDOWS_DOWNLOAD = `https://github.com/nukkeninprod/nogoon/releases/download/v${WINDOWS_VERSION}/Nogoon-Setup-${WINDOWS_VERSION}.exe`;
export const WINDOWS_STAGES = ['download', 'app_open', 'install_started', 'install_success', 'free_success', 'permanent_success', 'install_failed', 'license_activated', 'help_smartscreen', 'help_other'];
const EVENTS = new Set(['app_open', 'install_started', 'install_success', 'install_failed', 'license_activated', 'help_smartscreen', 'help_other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateWindowsEvent(body) {
  if (!body || !EVENTS.has(body.event) || !UUID.test(body.client_id || '') || !UUID.test(body.event_id || '')) return null;
  if (body.version !== WINDOWS_VERSION) return null;
  if (body.event.startsWith('install_') && !['free', 'permanent'].includes(body.mode)) return null;
  return { event: body.event, client_id: body.client_id, event_id: body.event_id, version: body.version,
    mode: ['free', 'permanent'].includes(body.mode) ? body.mode : undefined };
}

export function windowsPrefix(version = WINDOWS_VERSION) { return `nogoon:windows:${version}`; }

// Sets make retried delivery and repeated installs idempotent for the displayed
// device counts. Free -> permanent remains one device in install_success.
export async function recordWindowsEvent(redis, event) {
  const prefix = windowsPrefix(event.version);
  const stages = [event.event];
  if (event.event === 'install_success') stages.push(`${event.mode}_success`);
  await Promise.all(stages.map(stage => redis.sadd(`${prefix}:${stage}`, event.client_id)));
  return { ok: true };
}

export async function readWindowsFunnel(redis) {
  const values = await Promise.all(WINDOWS_STAGES.map(stage => redis.scard(`${windowsPrefix()}:${stage}`)));
  return { version: WINDOWS_VERSION, counts: Object.fromEntries(WINDOWS_STAGES.map((stage, i) => [stage, Number(values[i]) || 0])),
    measurement: 'Unique download browsers and unique app profiles, counted separately. A download request does not prove a completed transfer. Free and permanent can overlap after an upgrade.' };
}

export function validClientId(value) { return UUID.test(value || ''); }
