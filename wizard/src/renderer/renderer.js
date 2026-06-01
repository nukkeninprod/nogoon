const $ = (id) => document.getElementById(id);

let countdownInterval = null;

function startCountdown() {
  const DURATION = 72 * 60 * 60 * 1000;
  const key = 'nogoon_block_start';
  if (!localStorage.getItem(key)) localStorage.setItem(key, Date.now());
  const el = $('countdown');

  function tick() {
    const elapsed = Date.now() - parseInt(localStorage.getItem(key), 10);
    const remaining = Math.max(0, DURATION - elapsed);
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (remaining === 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      localStorage.removeItem('nogoon_state');
      localStorage.removeItem('nogoon_block_start');
      show('home');
    }
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

const screens = {
  home: $('screen-home'),
  progress: $('screen-progress'),
  payment: $('screen-payment'),
  done: $('screen-done'),
  error: $('screen-error')
};

function show(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle('hidden', k !== name);
  });
}


function showDone(permanent) {
  if (permanent) {
    localStorage.setItem('nogoon_state', 'permanent');
    $('done-title').textContent = 'Blocked permanently.';
    $('done-desc').textContent = 'This block will never expire.';
    $('btn-permanent-2').style.display = 'none';
    $('countdown').style.display = 'none';
    $('done-shield').classList.remove('hidden');
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  } else {
    localStorage.setItem('nogoon_state', 'free');
    $('done-title').textContent = 'Porn is blocked.';
    $('done-desc').textContent = 'Unblocks in:';
    $('btn-permanent-2').style.display = '';
    $('countdown').style.display = '';
    $('done-shield').classList.add('hidden');
    startCountdown();
  }
  show('done');
}

async function runFreeInstall() {
  show('progress');
  $('progress-label').textContent = 'Installing…';
  const res = await window.nogoon.installFree();
  if (res.ok) showDone(false);
  else { $('error-msg').textContent = res.error || 'Unknown error'; show('error'); }
}

async function runPermanentInstall() {
  show('progress');
  $('progress-label').textContent = 'Blocking permanently…';
  const res = await window.nogoon.installPermanent();
  if (res.ok) showDone(true);
  else { $('error-msg').textContent = res.error || 'Unknown error'; show('error'); }
}

let paymentPollInterval = null;

async function startStripeCheckout() {
  const res = await window.nogoon.createCheckout();
  if (!res.ok) {
    $('error-msg').textContent = res.error || 'Could not open checkout';
    show('error');
    return;
  }
  // Open Stripe in browser, then show license key entry screen
  $('license-key-input').value = '';
  $('license-error').textContent = '';
  $('license-error').classList.add('hidden');
  show('payment');
}

async function activateLicenseKey() {
  const key = $('license-key-input').value.trim().toUpperCase();
  if (!key) {
    $('license-error').textContent = 'Please enter your license key.';
    $('license-error').classList.remove('hidden');
    return;
  }
  $('btn-activate').disabled = true;
  $('btn-activate').textContent = 'Activating…';
  $('license-error').classList.add('hidden');

  const res = await window.nogoon.activateLicense(key);
  if (res.ok) {
    await runPermanentInstall();
  } else {
    $('license-error').textContent = res.error || 'Activation failed.';
    $('license-error').classList.remove('hidden');
    $('btn-activate').disabled = false;
    $('btn-activate').textContent = 'Activate';
  }
}

// Normalize license key input: uppercase only
$('license-key-input').addEventListener('input', (e) => {
  const pos = e.target.selectionStart;
  e.target.value = e.target.value.toUpperCase();
  e.target.setSelectionRange(pos, pos);
});

$('license-key-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') activateLicenseKey();
});

$('btn-activate').addEventListener('click', activateLicenseKey);

$('btn-cancel-payment').addEventListener('click', () => {
  if (paymentPollInterval) { clearInterval(paymentPollInterval); paymentPollInterval = null; }
  show('home');
});

$('btn-free').addEventListener('click', runFreeInstall);
$('btn-permanent').addEventListener('click', startStripeCheckout);
$('btn-retry').addEventListener('click', runFreeInstall);
$('btn-unblock').addEventListener('click', async () => {
  const res = await window.nogoon.unblock();
  if (res.ok) {
    localStorage.removeItem('nogoon_state');
    localStorage.removeItem('nogoon_block_start');
    show('home');
  } else {
    alert('Error: ' + res.error);
  }
});
$('btn-permanent-2').addEventListener('click', startStripeCheckout);

$('btn-back-home').addEventListener('click', () => show('home'));



document.querySelector('.support-link a').addEventListener('click', (e) => {
  e.preventDefault();
  window.nogoon.openURL('mailto:support@nogoon.io');
});

// Restore state on launch from actual system state
window.nogoon.checkState().then(({ state }) => {
  if (state === 'permanent') showDone(true);
  else if (state === 'free') showDone(false);
});
