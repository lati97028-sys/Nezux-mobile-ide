/**
 * Nezux Mobile IDE - PWA Support
 */

const PWA = (() => {
  let deferredPrompt = null;

  function init() {
    registerServiceWorker();
    listenInstallPrompt();
    detectStandalone();
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  function listenInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      hideInstallButton();
      if (window.NezuxApp?.toast) window.NezuxApp.toast('Nezux IDE installed!', 'success');
    });
  }

  async function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return result.outcome;
  }

  function showInstallButton() {
    const btn = document.getElementById('installPWA');
    if (btn) btn.classList.remove('hidden');
  }

  function hideInstallButton() {
    const btn = document.getElementById('installPWA');
    if (btn) btn.classList.add('hidden');
  }

  function detectStandalone() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.includes('android-app://');

    if (isStandalone) {
      document.body.classList.add('pwa-standalone');
    }
  }

  function showUpdateBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
      background:var(--bg-elevated);border:1px solid var(--accent-blue);
      border-radius:var(--r-xl);padding:10px 16px;
      display:flex;align-items:center;gap:12px;
      z-index:9999;box-shadow:var(--shadow-md);
      font-size:12px;color:var(--text-primary);
      white-space:nowrap;
    `;
    banner.innerHTML = `
      <span>Update available</span>
      <button onclick="window.location.reload()" style="background:var(--accent-blue);color:white;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">Reload</button>
      <button onclick="this.parentElement.remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:16px">×</button>
    `;
    document.body.appendChild(banner);
  }

  return { init, promptInstall };
})();

window.PWA = PWA;

document.addEventListener('DOMContentLoaded', () => {
  PWA.init();
  document.getElementById('installPWA')?.addEventListener('click', PWA.promptInstall);
});
