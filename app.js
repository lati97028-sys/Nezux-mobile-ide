/**
 * Nezux Mobile IDE - Main App Logic
 */

const NezuxApp = (() => {
  let currentProject = null;
  let sidebarOpen = false;

  async function init() {
    await FileManager.init();

    const projId = FileManager.getCurrentProjectId();
    if (projId) {
      currentProject = await FileManager.getProject(projId);
    }

    if (!currentProject) {
      // Check for existing projects
      const projects = await FileManager.getAllProjects();
      if (projects.length > 0) {
        currentProject = projects[0];
        FileManager.setCurrentProject(currentProject.id);
      } else {
        // Create default project
        currentProject = await FileManager.createProject('My App');
        FileManager.setCurrentProject(currentProject.id);
      }
    }

    // Init editor
    EditorManager.init('codeTextarea');

    // Render file tree
    await renderFileTree();

    // Open first file
    const files = await FileManager.getProjectFiles(currentProject.id);
    if (files.length > 0) {
      await EditorManager.openFile(files[0].id);
    }

    // Update project name in UI
    updateProjectNameUI();

    // Bind events
    bindEvents();

    // Init settings
    loadEditorSettings();
  }

  function updateProjectNameUI() {
    const el = document.getElementById('projectNameDisplay');
    if (el && currentProject) el.textContent = currentProject.name;
    const crumb = document.getElementById('projectNameCrumb');
    if (crumb && currentProject) crumb.textContent = currentProject.name;
    localStorage.setItem('nezux_project_name', currentProject?.name || 'Project');
  }

  async function renderFileTree() {
    const tree = document.getElementById('fileTree');
    if (!tree || !currentProject) return;

    const files = await FileManager.getProjectFiles(currentProject.id);

    if (files.length === 0) {
      tree.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">No files yet.<br>Create one to start.</div>`;
      return;
    }

    tree.innerHTML = '';
    files.forEach(file => {
      const item = createFileItem(file);
      tree.appendChild(item);
    });
  }

  function createFileItem(file) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.id = file.id;

    const iconSvg = EditorManager.getFileIconSvg(file.ext);
    const color = EditorManager.getFileColor(file.ext);

    div.innerHTML = `
      <span class="file-icon" style="color:${color}">${iconSvg}</span>
      <span class="file-name">${file.name}</span>
      <span class="file-actions">
        <button class="file-action-btn" data-action="rename" title="Rename">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 9l7-7 2 2-7 7H1V9z"/></svg>
        </button>
        <button class="file-action-btn" data-action="delete" title="Delete">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,3 11,3"/><path d="M2 3v7a1 1 0 001 1h6a1 1 0 001-1V3M4 3V1h4v2"/></svg>
        </button>
      </span>
    `;

    // Open file on click
    div.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'rename') {
        e.stopPropagation();
        showRenameDialog(file);
        return;
      }
      if (action === 'delete') {
        e.stopPropagation();
        showDeleteFileConfirm(file);
        return;
      }
      await EditorManager.openFile(file.id);
      if (window.innerWidth < 600) closeSidebar();
    });

    // Long press for context menu
    let pressTimer;
    div.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => showFileContextMenu(file, e), 500);
    }, { passive: true });
    div.addEventListener('touchend', () => clearTimeout(pressTimer));
    div.addEventListener('touchmove', () => clearTimeout(pressTimer));

    return div;
  }

  function showFileContextMenu(file, e) {
    const existingMenu = document.getElementById('contextMenu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.style.cssText = `
      position:fixed;z-index:500;
      background:var(--bg-elevated);
      border:1px solid var(--border-default);
      border-radius:var(--r-lg);
      box-shadow:var(--shadow-lg);
      padding:6px;
      min-width:160px;
      top:50%;left:50%;
      transform:translate(-50%,-50%);
      animation:dialogIn .2s ease both;
    `;

    const actions = [
      { label: 'Open', icon: '▶', action: () => EditorManager.openFile(file.id) },
      { label: 'Rename', icon: '✏', action: () => showRenameDialog(file) },
      { label: 'Download', icon: '⬇', action: () => downloadFile(file) },
      { label: 'Delete', icon: '🗑', action: () => showDeleteFileConfirm(file), danger: true },
    ];

    actions.forEach(a => {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.style.cssText = a.danger ? 'color:var(--accent-red)' : '';
      item.textContent = `${a.icon}  ${a.label}`;
      item.addEventListener('click', () => { menu.remove(); overlay.remove(); a.action(); });
      menu.appendChild(item);
    });

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:499;';
    overlay.addEventListener('click', () => { menu.remove(); overlay.remove(); });

    document.body.appendChild(overlay);
    document.body.appendChild(menu);
  }

  function downloadFile(file) {
    const blob = new Blob([file.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    URL.revokeObjectURL(url);
    toast('File downloaded', 'success');
  }

  function showNewFileDialog() {
    const html = `
      <div class="overlay center" id="newFileOverlay">
        <div class="sheet dialog">
          <div class="sheet-header">
            <span class="sheet-title">New File</span>
            <button class="btn btn-ghost btn-icon" onclick="document.getElementById('newFileOverlay').remove()">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/></svg>
            </button>
          </div>
          <div class="sheet-body" style="display:flex;flex-direction:column;gap:12px">
            <div>
              <div class="label">File Name</div>
              <input id="newFileName" class="input" placeholder="e.g. index.html, style.css" autofocus/>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${['index.html','style.css','app.js','data.json','README.md'].map(t =>
                `<button class="btn btn-ghost" style="font-size:11px;padding:4px 8px" onclick="document.getElementById('newFileName').value='${t}'">${t}</button>`
              ).join('')}
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button class="btn btn-ghost" onclick="document.getElementById('newFileOverlay').remove()">Cancel</button>
              <button class="btn btn-primary" onclick="NezuxApp.createNewFile()">Create</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => document.getElementById('newFileName')?.focus(), 50);
    document.getElementById('newFileName').addEventListener('keydown', e => {
      if (e.key === 'Enter') createNewFile();
    });
  }

  async function createNewFile() {
    const input = document.getElementById('newFileName');
    const name = input?.value?.trim();
    if (!name) { toast('Enter a file name', 'error'); return; }
    if (!currentProject) { toast('No project open', 'error'); return; }

    // Check duplicate
    const existing = await FileManager.getProjectFiles(currentProject.id);
    if (existing.find(f => f.name === name)) {
      toast('File already exists', 'error'); return;
    }

    const file = await FileManager.createFile(currentProject.id, name, getDefaultContent(name));
    document.getElementById('newFileOverlay')?.remove();
    await renderFileTree();
    await EditorManager.openFile(file.id);
    toast(`Created ${name}`, 'success');
  }

  function getDefaultContent(name) {
    const ext = name.split('.').pop().toLowerCase();
    const defaults = {
      html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>`,
      css: `/* ${name} */\n\n`,
      js: `// ${name}\n\n`,
      json: `{\n  \n}`,
      md: `# ${name.replace('.md', '')}\n\n`,
    };
    return defaults[ext] || '';
  }

  function showRenameDialog(file) {
    const html = `
      <div class="overlay center" id="renameOverlay">
        <div class="sheet dialog">
          <div class="sheet-header">
            <span class="sheet-title">Rename File</span>
          </div>
          <div class="sheet-body" style="display:flex;flex-direction:column;gap:12px">
            <input id="renameInput" class="input" value="${file.name}"/>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button class="btn btn-ghost" onclick="document.getElementById('renameOverlay').remove()">Cancel</button>
              <button class="btn btn-primary" onclick="NezuxApp.doRename(${file.id})">Rename</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const input = document.getElementById('renameInput');
    input?.focus(); input?.select();
    input?.addEventListener('keydown', e => { if(e.key==='Enter') doRename(file.id); });
  }

  async function doRename(fileId) {
    const input = document.getElementById('renameInput');
    const name = input?.value?.trim();
    if (!name) { toast('Enter a name', 'error'); return; }
    await FileManager.renameFile(fileId, name);
    document.getElementById('renameOverlay')?.remove();
    await renderFileTree();
    EditorManager.renderTabs();
    toast('Renamed', 'success');
  }

  function showDeleteFileConfirm(file) {
    const html = `
      <div class="overlay center" id="deleteFileOverlay">
        <div class="sheet dialog">
          <div class="sheet-header"><span class="sheet-title">Delete File</span></div>
          <div class="sheet-body" style="display:flex;flex-direction:column;gap:12px">
            <p style="font-size:13px;color:var(--text-secondary)">Delete <strong style="color:var(--text-primary)">${file.name}</strong>? This cannot be undone.</p>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button class="btn btn-ghost" onclick="document.getElementById('deleteFileOverlay').remove()">Cancel</button>
              <button class="btn btn-danger" onclick="NezuxApp.doDeleteFile(${file.id})">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  async function doDeleteFile(fileId) {
    EditorManager.closeTab(fileId);
    await FileManager.deleteFile(fileId);
    document.getElementById('deleteFileOverlay')?.remove();
    await renderFileTree();
    toast('File deleted', 'success');
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar?.classList.toggle('open', sidebarOpen);
    overlay?.classList.toggle('visible', sidebarOpen);
  }

  function closeSidebar() {
    sidebarOpen = false;
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('visible');
  }

  async function runProject() {
    if (!currentProject) { toast('No project', 'error'); return; }
    await EditorManager.saveCurrentFile().catch(() => {});
    const files = await FileManager.getProjectFiles(currentProject.id);
    const htmlFile = files.find(f => f.name === 'index.html') || files.find(f => f.ext === 'html');
    if (!htmlFile) { toast('No HTML file found', 'error'); return; }

    // Store project data for run.html
    const projectData = { files: {}, entryFile: htmlFile.name };
    for (const f of files) {
      projectData.files[f.name] = f.content || '';
    }
    localStorage.setItem('nezux_run_data', JSON.stringify(projectData));
    window.open('run.html', '_blank');
  }

  async function downloadZip() {
    if (!currentProject) { toast('No project', 'error'); return; }
    await EditorManager.saveCurrentFile().catch(() => {});
    toast('Preparing ZIP...', 'info');

    try {
      if (typeof JSZip !== 'undefined') {
        const blob = await FileManager.exportProjectAsZip(currentProject.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProject.name.replace(/\s+/g, '-')}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast('ZIP downloaded!', 'success');
      } else {
        // Fallback: download as text bundle
        const files = await FileManager.getProjectFiles(currentProject.id);
        let bundle = `/* Nezux IDE Export - ${currentProject.name} */\n`;
        for (const f of files) {
          bundle += `\n\n/* ===== ${f.name} ===== */\n${f.content || ''}`;
        }
        const blob = new Blob([bundle], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${currentProject.name}-export.txt`; a.click();
        URL.revokeObjectURL(url);
        toast('Exported!', 'success');
      }
    } catch (e) {
      toast('Export failed: ' + e.message, 'error');
    }
  }

  function showExportMenu() {
    const html = `
      <div class="overlay" id="exportOverlay">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-header"><span class="sheet-title">Export Project</span></div>
          <div class="sheet-body" style="display:flex;flex-direction:column;gap:8px">
            <div class="menu-item" onclick="NezuxApp.downloadZip();document.getElementById('exportOverlay').remove()">
              <div class="icon-wrap" style="background:rgba(240,136,62,.15)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent-orange)" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M5 8l3 3 3-3M8 5v6"/></svg>
              </div>
              <div><div style="font-weight:600">Download ZIP</div><div class="text-muted">All project files</div></div>
            </div>
            <div class="menu-item" onclick="NezuxApp.exportManifest();document.getElementById('exportOverlay').remove()">
              <div class="icon-wrap" style="background:rgba(88,166,255,.15)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent-blue)" stroke-width="1.5"><path d="M2 4h12M2 8h8M2 12h5"/></svg>
              </div>
              <div><div style="font-weight:600">Export manifest.json</div><div class="text-muted">PWA manifest</div></div>
            </div>
            <div class="menu-item" onclick="NezuxApp.exportServiceWorker();document.getElementById('exportOverlay').remove()">
              <div class="icon-wrap" style="background:rgba(163,113,247,.15)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent-purple)" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-4"/></svg>
              </div>
              <div><div style="font-weight:600">Export Service Worker</div><div class="text-muted">Offline support</div></div>
            </div>
            <div class="menu-item" onclick="document.getElementById('exportOverlay').remove()">
              <div><div style="color:var(--text-muted)">Cancel</div></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('exportOverlay').addEventListener('click', e => {
      if (e.target.id === 'exportOverlay') e.target.remove();
    });
  }

  async function exportManifest() {
    if (!currentProject) return;
    const manifest = FileManager.generateManifest(currentProject);
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'manifest.json'; a.click();
    URL.revokeObjectURL(url);
    toast('manifest.json downloaded', 'success');
  }

  async function exportServiceWorker() {
    if (!currentProject) return;
    const files = await FileManager.getProjectFiles(currentProject.id);
    const sw = FileManager.generateServiceWorker(files);
    const blob = new Blob([sw], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'service-worker.js'; a.click();
    URL.revokeObjectURL(url);
    toast('service-worker.js downloaded', 'success');
  }

  function loadEditorSettings() {
    const fontSize = parseInt(localStorage.getItem('nezux_font_size') || '13');
    const wordWrap = localStorage.getItem('nezux_word_wrap') === 'true';
    EditorManager.setFontSize(fontSize);
    EditorManager.setWordWrap(wordWrap);
  }

  function bindEvents() {
    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

    // Navbar actions
    document.getElementById('btnRun')?.addEventListener('click', runProject);
    document.getElementById('btnSave')?.addEventListener('click', () => EditorManager.saveCurrentFile());
    document.getElementById('btnExport')?.addEventListener('click', showExportMenu);
    document.getElementById('btnDownload')?.addEventListener('click', downloadZip);
    document.getElementById('btnSettings')?.addEventListener('click', () => {
      window.location.href = 'settings.html';
    });

    // New file
    document.getElementById('newFileBtn')?.addEventListener('click', showNewFileDialog);
    document.getElementById('importFileBtn')?.addEventListener('click', showImportFileDialog);

    // Find bar
    document.getElementById('findInput')?.addEventListener('input', (e) => {
      EditorManager.findNext(e.target.value);
    });
    document.getElementById('findNextBtn')?.addEventListener('click', () => {
      EditorManager.findNext(document.getElementById('findInput')?.value);
    });
    document.getElementById('findReplaceBtn')?.addEventListener('click', () => {
      const find = document.getElementById('findInput')?.value;
      const replace = document.getElementById('replaceInput')?.value || '';
      if (find) {
        const n = EditorManager.replaceAll(find, replace);
        toast(`Replaced ${n} occurrence(s)`, 'success');
      }
    });
    document.getElementById('findCloseBtn')?.addEventListener('click', () => {
      EditorManager.toggleFind();
    });

    // Code action bar
    document.querySelectorAll('.code-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        handleCodeAction(action);
      });
    });

    // Panel toggle
    document.getElementById('panelToggle')?.addEventListener('click', () => {
      document.getElementById('panel')?.classList.toggle('collapsed');
    });

    // Panel tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.panel;
        document.querySelectorAll('.panel-body > *').forEach(p => p.classList.add('hidden'));
        document.getElementById(target)?.classList.remove('hidden');
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); EditorManager.saveCurrentFile(); }
        if (e.key === 'n') { e.preventDefault(); showNewFileDialog(); }
        if (e.key === '\\') { e.preventDefault(); toggleSidebar(); }
      }
    });

    // Welcome cards
    document.getElementById('welcomeNewFile')?.addEventListener('click', showNewFileDialog);
    document.getElementById('welcomeOpenFile')?.addEventListener('click', showImportFileDialog);
    document.getElementById('welcomeRun')?.addEventListener('click', runProject);
    document.getElementById('welcomeSettings')?.addEventListener('click', () => window.location.href = 'settings.html');
  }

  function handleCodeAction(action) {
    const cm = EditorManager.cm;
    if (!cm) return;
    const snippets = {
      'tag': '<div>\n  \n</div>',
      'fn': 'function name() {\n  \n}',
      'log': 'console.log()',
      'for': 'for (let i = 0; i < arr.length; i++) {\n  \n}',
      'if': 'if (condition) {\n  \n}',
      'class': '.class {\n  \n}',
      'media': '@media (max-width: 768px) {\n  \n}',
      'var': 'const name = ',
    };
    if (snippets[action]) {
      EditorManager.insertSnippet(snippets[action]);
    } else if (action === 'comment') {
      cm.execCommand('toggleComment');
    } else if (action === 'indent') {
      cm.execCommand('indentMore');
    } else if (action === 'dedent') {
      cm.execCommand('indentLess');
    } else if (action === 'find') {
      EditorManager.toggleFind();
    }
  }

  function showImportFileDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.css,.js,.json,.md,.txt,.xml,.svg,.php,.py';
    input.multiple = true;
    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (const f of files) {
        const content = await f.text();
        const created = await FileManager.createFile(currentProject.id, f.name, content);
        await renderFileTree();
        if (files.indexOf(f) === 0) await EditorManager.openFile(created.id);
      }
      toast(`Imported ${files.length} file(s)`, 'success');
    });
    input.click();
  }

  function toast(msg, type = 'info') {
    const container = document.getElementById('toastContainer') || (() => {
      const c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
      return c;
    })();

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  // Terminal commands
  function executeTerminalCommand(cmd) {
    const output = document.getElementById('terminalOutput');
    if (!output) return;

    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `<span class="term-prompt">nezux $</span><span class="term-cmd">${cmd}</span>`;
    output.appendChild(line);

    // Simulate commands
    const parts = cmd.trim().split(' ');
    const main = parts[0];
    let response = '';
    let type = 'term-output';

    const responses = {
      'help': 'Available: ls, cat [file], clear, pwd, stats, version',
      'ls': async () => {
        const files = await FileManager.getProjectFiles(currentProject?.id);
        return files.map(f => f.name).join('  ');
      },
      'pwd': `/nezux/${currentProject?.name || 'project'}`,
      'version': 'Nezux IDE v1.0.0',
      'stats': async () => {
        const files = await FileManager.getProjectFiles(currentProject?.id);
        const total = files.reduce((s, f) => s + (f.content?.length || 0), 0);
        return `Files: ${files.length} | Total size: ${FileManager.formatSize(total)} | Lines: ${files.reduce((s,f)=>(s+(f.content||'').split('\n').length),0)}`;
      },
      'clear': () => { output.innerHTML = ''; return null; },
    };

    const addResponse = (text, t = 'term-output') => {
      if (text === null) return;
      const rline = document.createElement('div');
      rline.className = 'terminal-line';
      rline.innerHTML = `<span class="${t}">${text}</span>`;
      output.appendChild(rline);
      output.scrollTop = output.scrollHeight;
    };

    if (main === 'cat' && parts[1]) {
      FileManager.getProjectFiles(currentProject?.id).then(files => {
        const f = files.find(f => f.name === parts[1]);
        addResponse(f ? (f.content || '(empty)') : `cat: ${parts[1]}: No such file`, f ? 'term-output' : 'term-error');
      });
    } else if (responses[main]) {
      const r = responses[main];
      if (typeof r === 'function') {
        const result = r();
        if (result instanceof Promise) {
          result.then(text => addResponse(text));
        } else {
          addResponse(result);
        }
      } else {
        addResponse(r);
      }
    } else if (main) {
      addResponse(`Command not found: ${main}`, 'term-error');
    }

    output.scrollTop = output.scrollHeight;
  }

  // Expose
  return {
    init,
    renderFileTree,
    showNewFileDialog,
    createNewFile,
    showRenameDialog,
    doRename,
    showDeleteFileConfirm,
    doDeleteFile,
    toggleSidebar,
    runProject,
    downloadZip,
    showExportMenu,
    exportManifest,
    exportServiceWorker,
    showImportFileDialog,
    executeTerminalCommand,
    toast,
    get currentProject() { return currentProject; }
  };
})();

window.NezuxApp = NezuxApp;

// Boot
document.addEventListener('DOMContentLoaded', () => {
  NezuxApp.init().catch(console.error);

  // Terminal input
  const termInput = document.getElementById('termInput');
  if (termInput) {
    termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = termInput.value.trim();
        if (cmd) NezuxApp.executeTerminalCommand(cmd);
        termInput.value = '';
      }
    });
  }
});
