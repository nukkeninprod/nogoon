const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createTelemetry({ directory, version, fetchImpl = (...args) => fetch(...args) }) {
  const queuePath = path.join(directory, 'windows-events.json');
  const idPath = path.join(directory, 'nogoon-analytics-id');
  let sending = false;
  function readQueue() { try { return JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch { return []; } }
  function save(queue) {
    fs.mkdirSync(directory, { recursive: true });
    const tmp = `${queuePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(queue));
    fs.renameSync(tmp, queuePath);
  }
  function clientId() {
    try { const id = fs.readFileSync(idPath, 'utf8').trim(); if (/^[0-9a-f-]{36}$/i.test(id)) return id; } catch {}
    fs.mkdirSync(directory, { recursive: true });
    const id = crypto.randomUUID(); fs.writeFileSync(idPath, id); return id;
  }
  async function flush() {
    if (sending || process.env.NOGOON_NO_TRACK === '1') return;
    sending = true;
    try {
      let event;
      while ((event = readQueue()[0])) {
        const response = await fetchImpl('https://nogoon.io/api/windows', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok && response.status !== 400) break;
        save(readQueue().filter(item => item.event_id !== event.event_id));
      }
    } catch { /* Retain pending events for the next retry. */ }
    finally { sending = false; }
  }
  function track(event, mode) {
    if (process.env.NOGOON_NO_TRACK === '1') return;
    try {
      const queue = readQueue();
      queue.push({ event, mode, client_id: clientId(), event_id: crypto.randomUUID(), version });
      save(queue.slice(-200));
      void flush();
    } catch { /* Measurement must not prevent installation. */ }
  }
  return { track, flush, clientId };
}
module.exports = { createTelemetry };
