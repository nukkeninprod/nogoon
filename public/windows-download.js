(() => {
  if (!/Windows NT/.test(navigator.userAgent) && new URLSearchParams(location.search).get('platform') !== 'windows') return;
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h9v8H2zm11 0h9v8h-9zM2 13h9v8H2zm11 0h9v8h-9z"/></svg>';
  const buttons = document.querySelectorAll('a.download-btn');
  buttons.forEach(button => {
    button.href = '/api/windows?action=download';
    button.innerHTML = icon + ' Download for Windows Free';
    button.addEventListener('click', () => {
      if (typeof window.track === 'function') window.track('windows_download_requested', { os: 'win', version: '0.2.0' });
    });
  });
  const first = buttons[0];
  if (first) {
    const help = document.createElement('p');
    help.style.cssText = 'font-size:13px;opacity:.75;margin-top:12px;text-align:center';
    const link = document.createElement('a');
    link.href = '/windows-install.html'; link.textContent = 'Windows installation help';
    link.style.cssText = 'color:inherit;text-decoration:underline';
    help.append(link); (first.closest('.download-btn-wrapper') || first).after(help);
  }
})();
