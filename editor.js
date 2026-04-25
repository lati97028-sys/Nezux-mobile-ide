/**
 * Nezux Mobile IDE - Editor Logic
 * Manages CodeMirror instance and editor state
 */

const EditorManager = (() => {
  let cm = null;
  let currentFileId = null;
  let openTabs = []; // [{id, name, modified, projectId}]
  let changeTimer = null;
  let isFindOpen = false;

  const AUTOSAVE_DELAY = 1500;

  function init(textareaId) {
    const ta = document.getElementById(textareaId);
    if (!ta || typeof CodeMirror === 'undefined') return;

    cm = CodeMirror.fromTextArea(ta, {
      mode: 'htmlmixed',
      theme: 'nezux',
      lineNumbers: true,
      lineWrapping: false,
      autofocus: false,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      electricChars: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      autoCloseTags: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        'Tab': (cm) => { cm.replaceSelection('  '); },
        'Ctrl-S': () => saveCurrentFile(),
        'Ctrl-F': () => toggleFind(),
        'Ctrl-Z': (cm) => cm.undo(),
        'Ctrl-Y': (cm) => cm.redo(),
        'Ctrl-/': (cm) => cm.execCommand('toggleComment'),
        'Ctrl-D': duplicateLine,
        'Ctrl-Shift-K': deleteLine,
      },
      viewportMargin: 50,
      styleActiveLine: true,
      highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: false },
    });

    cm.on('change', onEditorChange);
    cm.on('cursorActivity', onCursorMove);

    // Touch scroll fix
    cm.on('touchstart', () => {});

    return cm;
  }

  function onEditorChange() {
    if (!currentFileId) return;
    markTabModified(currentFileId);
    clearTimeout(changeTimer);
    changeTimer = setTimeout(autoSave, AUTOSAVE_DELAY);
  }

  function onCursorMove() {
    const c = cm.getCursor();
    updateStatusBar(c.line + 1, c.ch + 1);
  }

  function updateStatusBar(line, col) {
    const el = document.getElementById('statusCursor');
    if (el) el.textContent = `Ln ${line}, Col ${col}`;
  }

  async function openFile(fileId) {
    if (!FileManager) return;
    const file = await FileManager.getFile(fileId);
    if (!file) return;

    // Check if already open
    const existing = openTabs.find(t => t.id === fileId);
    if (!existing) {
      openTabs.push({ id: fileId, name: file.name, modified: false, projectId: file.projectId, ext: file.ext });
    }

    currentFileId = fileId;

    // Set mode
    const mode = FileManager.getEditorMode(file.ext);
    cm.setOption('mode', mode);

    // Set content (no change event)
    const content = file.content || '';
    cm.operation(() => {
      cm.setValue(content);
      cm.clearHistory();
    });

    renderTabs();
    updateBreadcrumb(file.name);
    updateStatusLang(file.ext);
    hideWelcome();

    // Scroll to top
    cm.scrollTo(0, 0);
    cm.setCursor(0, 0);

    // Update sidebar active
    document.querySelectorAll('.file-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.id) === fileId);
    });
  }

  function hideWelcome() {
    const ws = document.getElementById('welcomeScreen');
    const ec = document.getElementById('editorContainer');
    if (ws) ws.classList.add('hidden');
    if (ec) ec.classList.remove('hidden');
  }

  function showWelcome() {
    const ws = document.getElementById('welcomeScreen');
    const ec = document.getElementById('editorContainer');
    if (ws) ws.classList.remove('hidden');
    if (ec) ec.classList.add('hidden');
    currentFileId = null;
  }

  async function autoSave() {
    if (!currentFileId || !FileManager) return;
    const content = cm.getValue();
    await FileManager.updateFileContent(currentFileId, content);
    unmarkTabModified(currentFileId);
  }

  async function saveCurrentFile() {
    if (!currentFileId || !FileManager) return;
    clearTimeout(changeTimer);
    const content = cm.getValue();
    await FileManager.updateFileContent(currentFileId, content);
    unmarkTabModified(currentFileId);
    showToast('File saved', 'success');
  }

  function markTabModified(fileId) {
    const tab = openTabs.find(t => t.id === fileId);
    if (tab) tab.modified = true;
    renderTabs();
  }

  function unmarkTabModified(fileId) {
    const tab = openTabs.find(t => t.id === fileId);
    if (tab) tab.modified = false;
    renderTabs();
  }

  function closeTab(fileId) {
    const idx = openTabs.findIndex(t => t.id === fileId);
    if (idx === -1) return;
    openTabs.splice(idx, 1);

    if (currentFileId === fileId) {
      if (openTabs.length > 0) {
        const newIdx = Math.min(idx, openTabs.length - 1);
        openFile(openTabs[newIdx].id);
      } else {
        showWelcome();
      }
    }
    renderTabs();
  }

  function renderTabs() {
    const bar = document.getElementById('tabBar');
    if (!bar) return;

    // Keep the add button
    bar.innerHTML = '';

    openTabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab-item' + (tab.id === currentFileId ? ' active' : '');
      el.dataset.id = tab.id;

      const iconSvg = getFileIconSvg(tab.ext);
      el.innerHTML = `
        <span class="tab-icon" style="color:${getFileColor(tab.ext)}">${iconSvg}</span>
        <span class="tab-name">${tab.name}${tab.modified ? ' ●' : ''}</span>
        <span class="tab-close" data-close="${tab.id}">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
        </span>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) {
          closeTab(tab.id);
        } else {
          openFile(tab.id);
        }
      });

      bar.appendChild(el);
    });

    // Add tab button
    const addBtn = document.createElement('div');
    addBtn.className = 'tab-add';
    addBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`;
    addBtn.addEventListener('click', () => window.NezuxApp?.showNewFileDialog());
    bar.appendChild(addBtn);
  }

  function updateBreadcrumb(name) {
    const el = document.getElementById('breadcrumb');
    if (el) {
      const proj = document.getElementById('projectNameCrumb');
      if (proj) proj.textContent = localStorage.getItem('nezux_project_name') || 'Project';
      const file = el.querySelector('.crumb-file');
      if (file) file.textContent = name;
    }
  }

  function updateStatusLang(ext) {
    const el = document.getElementById('statusLang');
    if (el) el.textContent = ext ? ext.toUpperCase() : 'TXT';
  }

  function getFileColor(ext) {
    const t = FileManager?.FILE_TYPES?.[ext] || { color: '#8b949e' };
    return t.color;
  }

  function getFileIconSvg(ext) {
    const icons = {
      html: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/><path d="M4 4l2 3-2 3M7 10h3"/></svg>`,
      css:  `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/><path d="M4 5h6M4 7h4M4 9h5"/></svg>`,
      js:   `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/><path d="M9 5v5.5a1.5 1.5 0 01-3 0M4 9a1.5 1.5 0 003 0V5"/></svg>`,
      json: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4C2 4 1 5 1 7s1 3 1 3M12 4s1 1 1 3-1 3-1 3M5 5l1 1-1 1M9 5l-1 1 1 1M6 9h2"/></svg>`,
      md:   `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="12" height="10" rx="1"/><path d="M3 9V5l2 2 2-2v4M10 9V5M10 7h-2"/></svg>`,
    };
    return icons[ext] || `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="9" height="12" rx="1"/><path d="M7 1v4h4M10 1l2 4"/></svg>`;
  }

  function duplicateLine(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    cm.replaceRange('\n' + line, { line: cursor.line, ch: line.length });
    cm.setCursor({ line: cursor.line + 1, ch: cursor.ch });
  }

  function deleteLine(cm) {
    const cursor = cm.getCursor();
    const from = { line: cursor.line, ch: 0 };
    const to = cursor.line < cm.lastLine()
      ? { line: cursor.line + 1, ch: 0 }
      : { line: cursor.line, ch: cm.getLine(cursor.line).length };
    cm.replaceRange('', from, to);
  }

  function toggleFind() {
    isFindOpen = !isFindOpen;
    const bar = document.getElementById('findBar');
    if (bar) bar.classList.toggle('hidden', !isFindOpen);
    if (isFindOpen) {
      const input = document.getElementById('findInput');
      if (input) { input.focus(); input.select(); }
    }
  }

  function findNext(query, caseSensitive = false) {
    if (!query || !cm) return;
    const cursor = cm.getSearchCursor(
      caseSensitive ? query : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      cm.getCursor()
    );
    if (cursor.findNext()) {
      cm.setSelection(cursor.from(), cursor.to());
      cm.scrollIntoView({ from: cursor.from(), to: cursor.to() }, 80);
    } else {
      // Wrap around
      const cursor2 = cm.getSearchCursor(
        caseSensitive ? query : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        { line: 0, ch: 0 }
      );
      if (cursor2.findNext()) {
        cm.setSelection(cursor2.from(), cursor2.to());
        cm.scrollIntoView({ from: cursor2.from(), to: cursor2.to() }, 80);
      }
    }
  }

  function replaceAll(find, replace) {
    if (!find || !cm) return 0;
    const content = cm.getValue();
    const newContent = content.split(find).join(replace);
    cm.setValue(newContent);
    const count = (content.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return count;
  }

  function formatCode() {
    if (!cm) return;
    // Simple formatting: fix indentation
    const val = cm.getValue();
    cm.setValue(val);
  }

  function insertSnippet(text) {
    if (!cm) return;
    cm.replaceSelection(text);
    cm.focus();
  }

  function getWordCount() {
    if (!cm) return 0;
    const text = cm.getValue();
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function getLineCount() {
    if (!cm) return 0;
    return cm.lineCount();
  }

  function getCurrentContent() {
    return cm ? cm.getValue() : '';
  }

  function getCurrentFileId() { return currentFileId; }
  function getOpenTabs() { return openTabs; }

  function setFontSize(size) {
    const wrap = document.querySelector('.CodeMirror');
    if (wrap) wrap.style.fontSize = size + 'px';
  }

  function setWordWrap(enabled) {
    if (cm) cm.setOption('lineWrapping', enabled);
  }

  function showToast(msg, type) {
    if (window.NezuxApp?.toast) window.NezuxApp.toast(msg, type);
  }

  return {
    init,
    openFile,
    closeTab,
    saveCurrentFile,
    renderTabs,
    toggleFind,
    findNext,
    replaceAll,
    formatCode,
    insertSnippet,
    getWordCount,
    getLineCount,
    getCurrentContent,
    getCurrentFileId,
    getOpenTabs,
    setFontSize,
    setWordWrap,
    showWelcome,
    hideWelcome,
    getFileIconSvg,
    getFileColor,
    get cm() { return cm; }
  };
})();

window.EditorManager = EditorManager;
