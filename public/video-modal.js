/**
 * video-modal.js — Reusable video modal component
 *
 * 1. Web Component (recommended — drop anywhere, zero extra markup):
 *    <ng-watch-demo></ng-watch-demo>
 *    <ng-watch-demo label="See it in action"></ng-watch-demo>
 *    <ng-watch-demo src="https://…/other.mp4" title="Other title" label="Watch"></ng-watch-demo>
 *
 * 2. Auto-wired attribute on any existing element:
 *    <a data-video-modal="https://…/video.mp4" data-video-title="My App — Demo">Watch</a>
 *
 * 3. Programmatic:
 *    VideoModal.open('https://…/video.mp4', 'My App — Demo')
 *    VideoModal.close()
 */

const NG_DEFAULT_SRC   = 'https://pub-eba67e33706546ad8b08618bb59530ea.r2.dev/demo/Democomp.mp4';
const NG_DEFAULT_TITLE = 'nogoon \u2014 Demo';
(function () {
  // ── Inject CSS once ──────────────────────────────────────────────────────
  if (!document.getElementById('ng-video-modal-style')) {
    const style = document.createElement('style');
    style.id = 'ng-video-modal-style';
    style.textContent = `
      .ng-video-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgba(8, 12, 22, 0.25);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        animation: ng-modal-fade 0.2s ease;
      }
      .ng-video-modal.open { display: flex; }
      @keyframes ng-modal-fade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .ng-video-modal .ng-modal-card {
        position: relative;
        width: 100%;
        max-width: 1100px;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 0 60px rgba(0,0,0,0.8);
        animation: ng-modal-pop 0.25s cubic-bezier(.2,.9,.3,1.2);
      }
      @keyframes ng-modal-pop {
        from { transform: translateY(20px) scale(.96); opacity: 0; }
        to   { transform: translateY(0)    scale(1);   opacity: 1; }
      }
      .ng-video-mac-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #1e1e1e;
        border-radius: 12px 12px 0 0;
        padding: 0 14px;
        height: 38px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .ng-video-mac-title {
        color: rgba(255,255,255,0.45);
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 500;
        letter-spacing: 0.01em;
        pointer-events: none;
      }
      .ng-video-mac-close {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #ff5f57;
        border: none;
        color: #fff;
        font-size: 0.75rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s;
        line-height: 1;
        padding: 0;
      }
      .ng-video-mac-close:hover { background: #ff3b30; }
      .ng-video-modal .ng-video-wrapper {
        position: relative;
        width: 100%;
        padding-top: 62.5%; /* 16:10 — 2880×1800 */
        overflow: hidden;
        background: #000;
      }
      .ng-video-modal .ng-video-wrapper video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 0 0 12px 12px;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Inject modal HTML once ───────────────────────────────────────────────
  if (!document.getElementById('ng-video-modal')) {
    const tpl = document.createElement('div');
    tpl.innerHTML = `
      <div class="ng-video-modal" id="ng-video-modal" role="dialog" aria-modal="true">
        <div class="ng-modal-card">
          <div class="ng-video-mac-bar">
            <div style="width:26px"></div>
            <span class="ng-video-mac-title" id="ng-video-modal-title"></span>
            <button class="ng-video-mac-close" id="ng-video-modal-close" aria-label="Close">&#x2715;</button>
          </div>
          <div class="ng-video-wrapper">
            <video id="ng-video-modal-video" controls playsinline preload="none"></video>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(tpl.firstElementChild);
  }

  const modal   = document.getElementById('ng-video-modal');
  const video   = document.getElementById('ng-video-modal-video');
  const titleEl = document.getElementById('ng-video-modal-title');
  const closeBtn = document.getElementById('ng-video-modal-close');

  function open(src, title) {
    if (src && video.getAttribute('src') !== src) {
      video.src = src;
      video.load();
    }
    titleEl.textContent = title || '';
    modal.classList.add('open');
    video.play().catch(() => {});
    document.body.style.overflow = 'hidden';
  }

  function close() {
    modal.classList.remove('open');
    video.pause();
    video.currentTime = 0;
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // Auto-wire any [data-video-modal] triggers present now or added later
  document.addEventListener('click', function (e) {
    const trigger = e.target.closest('[data-video-modal]');
    if (!trigger) return;
    e.preventDefault();
    const eventName = trigger.dataset.videoEvent || 'watch_tutorial';
    if (typeof gtag === 'function') {
      const params = { event_category: 'video', event_label: trigger.dataset.videoTitle || '' };
      if (window.__modalOpenedFrom) params.modal_source = window.__modalOpenedFrom;
      gtag('event', eventName, params);
    }
    open(trigger.dataset.videoModal, trigger.dataset.videoTitle);
  });

  // Expose global API
  window.VideoModal = { open: open, close: close };

  // ── <ng-watch-demo> Web Component ────────────────────────────────────────
  // Attributes (all optional):
  //   src   — video URL (defaults to nogoon demo)
  //   title — modal title bar text
  //   label — button label text (default: "▶ Watch Demo")
  customElements.define('ng-watch-demo', class extends HTMLElement {
    connectedCallback() {
      const src   = this.getAttribute('src')   || NG_DEFAULT_SRC;
      const title = this.getAttribute('title') || NG_DEFAULT_TITLE;
      const label = this.getAttribute('label') || '\u25b6\ufe0e Watch Demo';

      const btn = document.createElement('a');
      btn.href = '#';
      btn.dataset.videoModal = src;
      btn.dataset.videoTitle = title;
      btn.textContent = label;
      btn.style.cssText = [
        'display:inline-flex', 'align-items:center', 'gap:6px',
        'font-family:"Inter",system-ui,sans-serif', 'font-size:0.82rem',
        'font-weight:500', 'color:#A1EAFB',
        'text-decoration:underline', 'text-underline-offset:3px',
        'cursor:pointer', 'transition:opacity 0.15s',
      ].join(';');
      btn.addEventListener('mouseenter', () => btn.style.opacity = '0.75');
      btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
      this.appendChild(btn);
    }
  });
})();
