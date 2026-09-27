(() => {
  if (!/Windows NT/.test(navigator.userAgent) && new URLSearchParams(location.search).get('platform') !== 'windows') return;
  const icon = '<svg width="24" height="24" style="flex-shrink:0" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h9v8H2zm11 0h9v8h-9zM2 13h9v8H2zm11 0h9v8h-9z"/></svg>';
  const buttons = document.querySelectorAll('a.download-btn');
  const windowsAnswers = {
    'Does this slow down my Mac?': ['Does the app need to stay open?', 'No. Once installed, the protection uses Windows network settings and a hosts blocklist. You can close Nogoon. Windows automatically removes the free block after 72 hours.'],
    'Can I also block Reddit or Twitter?': ['Can I also block Reddit or Twitter?', 'The Windows app currently uses its built-in adult-site blocklist. Optional blocking of Reddit, Twitter/X, and Tumblr is not included in this version.'],
    'Is this safe? What does the script actually do?': ['What does Nogoon change on Windows?', 'With your administrator approval, Nogoon sets adult-filtering DNS, adds a hosts blocklist, and applies browser policies. The free block restores your previous settings after 72 hours. The app sends installation outcomes to help us improve reliability; it does not collect your browsing history.']
  };
  document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-q');
    const answer = item.querySelector('.faq-a p');
    const content = windowsAnswers[question?.textContent.trim()];
    if (content && answer) { question.textContent = content[0]; answer.textContent = content[1]; }
  });
  buttons.forEach(button => {
    button.href = '/api/windows?action=download';
    button.innerHTML = icon + ' <span>Download for Windows Free</span>';
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
