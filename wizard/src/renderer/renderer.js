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
    if (remaining === 0) clearInterval(countdownInterval);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

const screens = {
  home: $('screen-home'),
  payment: $('screen-payment'),
  progress: $('screen-progress'),
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
    $('done-title').textContent = 'Blocked permanently.';
    $('done-desc').textContent = 'This block will never expire.';
    $('btn-permanent-2').style.display = 'none';
    $('countdown').style.display = 'none';
    $('done-shield').classList.remove('hidden');
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  } else {
    $('done-title').textContent = 'Porn is blocked.';
    $('done-desc').textContent = 'Unblocks in:';
    $('btn-permanent-2').style.display = '';
    $('countdown').style.display = '';
    $('done-shield').classList.add('hidden');
    startCountdown();
  }
  show('done');
}

const CIRCUMFERENCE = 314.16;

function setRingProgress(pct) {
  const fill = $('ring-fill');
  if (!fill) return;
  fill.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct / 100);
  $('ring-pct').textContent = Math.round(pct) + '%';
}

let fakeProgressTimer = null;

function startFakeProgress(label) {
  setRingProgress(0);
  $('progress-label').textContent = label || 'Installing…';
  let pct = 0;
  fakeProgressTimer = setInterval(() => {
    // Ease toward 95%, slow as it approaches
    const remaining = 95 - pct;
    pct += remaining * 0.045;
    setRingProgress(Math.min(pct, 95));
  }, 80);
}

function finishProgress(cb) {
  clearInterval(fakeProgressTimer);
  setRingProgress(100);
  setTimeout(cb, 400);
}

async function startStripeCheckout() {
  const res = await window.nogoon.createCheckout();
  if (!res.ok) {
    $('error-msg').textContent = res.error || 'Could not open checkout';
    show('error');
    return;
  }
  // Stripe is now open in the browser. Show the license key entry screen.
  $('license-key-input').value = '';
  $('license-error').textContent = '';
  $('license-error').classList.add('hidden');
  $('btn-activate').disabled = false;
  $('btn-activate').textContent = 'Activate';
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
  try {
    const check = await window.nogoon.activateLicense(key, true);
    if (!check.ok) {
      $('license-error').textContent = check.error || 'Invalid or already used license key.';
      $('license-error').classList.remove('hidden');
      $('btn-activate').disabled = false;
      $('btn-activate').textContent = 'Activate';
      return;
    }
    window.nogoon.trackEvent('license_submitted');
    show('progress');
    startFakeProgress('Blocking permanently…');
    const installRes = await window.nogoon.installPermanent();
    if (!installRes.ok) {
      finishProgress(() => {
        $('error-msg').textContent = installRes.error || 'Unknown error';
        show('error');
      });
      $('btn-activate').disabled = false;
      $('btn-activate').textContent = 'Activate';
      return;
    }
    // Mark license as used only after successful install
    await window.nogoon.activateLicense(key, false);
    finishProgress(() => showDone(true));
  } catch (e) {
    $('license-error').textContent = 'Network error. Please try again.';
    $('license-error').classList.remove('hidden');
    $('btn-activate').disabled = false;
    $('btn-activate').textContent = 'Activate';
  }
}

async function runFreeInstall() {
  show('progress');
  startFakeProgress('Blocking 72h…');
  const res = await window.nogoon.installFree();
  finishProgress(() => {
    if (res.ok) showDone(false);
    else { $('error-msg').textContent = res.error || 'Unknown error'; show('error'); }
  });
}

async function runPermanentInstall() {
  show('progress');
  startFakeProgress('Blocking permanently…');
  const res = await window.nogoon.installPermanent();
  finishProgress(() => {
    if (res.ok) showDone(true);
    else { $('error-msg').textContent = res.error || 'Unknown error'; show('error'); }
  });
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
  show('home');
});

$('btn-free').addEventListener('click', () => {
  window.nogoon.trackEvent('cta_clicked', { type: '72h' });
  runFreeInstall();
});
$('btn-retry').addEventListener('click', runFreeInstall);

$('btn-permanent').addEventListener('click', () => {
  window.nogoon.trackEvent('cta_clicked', { type: 'permanent' });
  startStripeCheckout();
});
$('btn-permanent-2').addEventListener('click', () => {
  window.nogoon.trackEvent('cta_clicked', { type: 'permanent' });
  startStripeCheckout();
});

document.querySelector('.support-link a').addEventListener('click', (e) => {
  e.preventDefault();
  window.nogoon.openURL('mailto:support@nogoon.io');
});
