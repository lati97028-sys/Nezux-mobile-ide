/**
 * Nezux Mobile IDE - Runner / Preview Logic
 */

const Runner = (() => {
  let projectData = null;
  let consoleEntries = [];

  function init() {
    const raw = localStorage.getItem('nezux_run_data');
    if (!raw) {
      showError('No project data found. Please run from the editor.');
      return;
    }

    try {
      projectData = JSON.parse(raw);
      buildPreview();
    } catch (e) {
      showError('Failed to load project: ' + e.message);
    }
  }

  function buildPreview() {
    const frame = document.getElementById('previewFrame');
    if (!frame || !projectData) return;

    const files = projectData.files;
    let html = files[projectData.entryFile] || files['index.html'] || '';

    // Inline CSS files referenced in HTML
    html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
      const content = files[href] || files[href.replace('./', '')];
      if (content) return `<style>/* ${href} */\n${content}</style>`;
      return match;
    });

    // Inline JS files
    html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
      const content = files[src] || files[src.replace('./', '')];
      if (content) return `<script>/* ${src} */\n${content}<\/script>`;
      return match;
    });

    // Inject console capture
    const consoleCapture = `
<script>
(function() {
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  ['log','warn','error','info'].forEach(lvl => {
    console[lvl] = function(...args) {
      orig[lvl].apply(console, args);
      try {
        window.parent.postMessage({ type: 'console', level: lvl, message: args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); } catch(e) { return String(a); }
        }).join(' ') }, '*');
      } catch(e) {}
    };
  });
  window.addEventListener('error', (e) => {
    window.parent.postMessage({ type: 'console', level: 'error', message: e.message + ' (' + e.filename + ':' + e.lineno + ')' }, '*');
  });
})();
<\/script>`;

    html = html.replace('<head>', '<head>' + consoleCapture);
    if (!html.includes('<head>')) html = consoleCapture + html;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    frame.src = url;

    // Listen for console messages from iframe
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'console') {
        addConsoleEntry(e.data.level, e.data.message);
      }
    });
  }

  function addConsoleEntry(level, message) {
    consoleEntries.push({ level, message, time: new Date().toLocaleTimeString() });
    const output = document.getElementById('consoleOutput');
    if (!output) return;

    const entry = document.createElement('div');
    entry.className = 'console-entry';
    entry.innerHTML = `
      <span class="console-level ${level}">${level}</span>
      <span class="console-message">${escapeHtml(message)}</span>
      <span class="console-source">${new Date().toLocaleTimeString('en', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
    `;
    output.appendChild(entry);
    output.scrollTop = output.scrollHeight;

    // Update console badge
    const badge = document.getElementById('consoleBadge');
    if (badge) {
      badge.textContent = consoleEntries.length;
      badge.classList.remove('hidden');
    }
  }

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function clearConsole() {
    consoleEntries = [];
    const output = document.getElementById('consoleOutput');
    if (output) output.innerHTML = '';
    const badge = document.getElementById('consoleBadge');
    if (badge) badge.classList.add('hidden');
  }

  function refresh() {
    const frame = document.getElementById('previewFrame');
    if (frame) {
      const src = frame.src;
      frame.src = 'about:blank';
      setTimeout(() => { frame.src = src; }, 50);
    }
  }

  function reload() {
    clearConsole();
    buildPreview();
  }

  function openFullscreen() {
    const frame = document.getElementById('previewFrame');
    if (!frame) return;
    if (frame.requestFullscreen) frame.requestFullscreen();
    else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
  }

  function toggleDevTools() {
    const panel = document.getElementById('devPanel');
    if (panel) panel.classList.toggle('hidden');
  }

  function showError(msg) {
    const frame = document.getElementById('previewFrame');
    if (frame) {
      const html = `<!DOCTYPE html><html><head><style>
        body{background:#0d0d14;color:#f85149;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}
        p{font-size:14px;opacity:.8}
      </style></head><body><div><h2 style="margin-bottom:12px">⚠ Error</h2><p>${msg}</p></div></body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      frame.src = URL.createObjectURL(blob);
    }
  }

  return { init, reload, refresh, openFullscreen, toggleDevTools, clearConsole };
})();

window.Runner = Runner;

document.addEventListener('DOMContentLoaded', () => {
  Runner.init();

  document.getElementById('btnRefresh')?.addEventListener('click', Runner.reload);
  document.getElementById('btnFullscreen')?.addEventListener('click', Runner.openFullscreen);
  document.getElementById('btnDevTools')?.addEventListener('click', Runner.toggleDevTools);
  document.getElementById('btnBack')?.addEventListener('click', () => window.close() || history.back());
  document.getElementById('btnClearConsole')?.addEventListener('click', Runner.clearConsole);
});
