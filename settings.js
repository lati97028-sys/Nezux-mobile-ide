/**
 * Nezux Mobile IDE - Settings Logic
 */

const Settings = (() => {
  let project = null;
  let connectedFolderHandle = null;

  async function init() {
    await FileManager.init();
    const projId = FileManager.getCurrentProjectId();
    if (projId) {
      project = await FileManager.getProject(projId);
    }

    loadSettings();
    bindEvents();
    updateStorageStatus();
  }

  function loadSettings() {
    if (!project) return;

    const nameEl = document.getElementById('settingAppName');
    if (nameEl) nameEl.value = project.name || '';

    const versionEl = document.getElementById('settingVersion');
    if (versionEl) versionEl.value = project.version || '1.0.0';

    const descEl = document.getElementById('settingDesc');
    if (descEl) descEl.value = project.description || '';

    const themeEl = document.getElementById('settingTheme');
    if (themeEl) themeEl.value = project.theme || '#58a6ff';

    const orientEl = document.getElementById('settingOrientation');
    if (orientEl) orientEl.value = project.orientation || 'portrait';

    // Editor settings
    const fontSize = localStorage.getItem('nezux_font_size') || '13';
    const fontSizeEl = document.getElementById('settingFontSize');
    if (fontSizeEl) fontSizeEl.value = fontSize;

    const wordWrap = localStorage.getItem('nezux_word_wrap') === 'true';
    const wrapEl = document.getElementById('settingWordWrap');
    if (wrapEl) wrapEl.checked = wordWrap;

    const lineNum = localStorage.getItem('nezux_line_numbers') !== 'false';
    const lineEl = document.getElementById('settingLineNumbers');
    if (lineEl) lineEl.checked = lineNum;

    const autoSave = localStorage.getItem('nezux_autosave') !== 'false';
    const autoEl = document.getElementById('settingAutoSave');
    if (autoEl) autoEl.checked = autoSave;

    // IDE theme
    const ideTheme = localStorage.getItem('nezux_ide_theme') || 'dark';
    const themeIDEEl = document.getElementById('settingIDETheme');
    if (themeIDEEl) themeIDEEl.value = ideTheme;
  }

  async function saveProjectSettings() {
    if (!project) return;

    const name = document.getElementById('settingAppName')?.value?.trim() || project.name;
    const version = document.getElementById('settingVersion')?.value?.trim() || '1.0.0';
    const desc = document.getElementById('settingDesc')?.value?.trim() || '';
    const theme = document.getElementById('settingTheme')?.value || '#58a6ff';
    const orientation = document.getElementById('settingOrientation')?.value || 'portrait';

    await FileManager.updateProject(project.id, { name, version, description: desc, theme, orientation });
    localStorage.setItem('nezux_project_name', name);

    toast('Settings saved', 'success');
  }

  function saveEditorSettings() {
    const fontSize = document.getElementById('settingFontSize')?.value || '13';
    const wordWrap = document.getElementById('settingWordWrap')?.checked || false;
    const lineNum = document.getElementById('settingLineNumbers')?.checked !== false;
    const autoSave = document.getElementById('settingAutoSave')?.checked !== false;
    const ideTheme = document.getElementById('settingIDETheme')?.value || 'dark';

    localStorage.setItem('nezux_font_size', fontSize);
    localStorage.setItem('nezux_word_wrap', wordWrap);
    localStorage.setItem('nezux_line_numbers', lineNum);
    localStorage.setItem('nezux_autosave', autoSave);
    localStorage.setItem('nezux_ide_theme', ideTheme);

    toast('Editor settings saved', 'success');
  }

  // === Storage Access ===

  async function connectFolder() {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        connectedFolderHandle = handle;
        updateStorageStatus(handle.name);
        toast(`Folder connected: ${handle.name}`, 'success');

        // List files in folder
        const fileList = [];
        for await (const [name, entry] of handle.entries()) {
          if (entry.kind === 'file') fileList.push(name);
        }
        showConnectedFiles(fileList, handle);
      } catch (e) {
        if (e.name !== 'AbortError') {
          toast('Failed to connect folder: ' + e.message, 'error');
        }
      }
    } else {
      // Fallback: use file input with directory
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const folderName = files[0].webkitRelativePath.split('/')[0];
        updateStorageStatus(folderName);
        toast(`Loaded ${files.length} files from folder`, 'success');
        const fileNames = files.map(f => f.webkitRelativePath.replace(folderName + '/', ''));
        showConnectedFiles(fileNames, null, files, folderName);
      });
      input.click();
    }
  }

  function showConnectedFiles(fileList, handle, rawFiles, folderName) {
    const container = document.getElementById('connectedFilesSection');
    if (!container) return;
    container.classList.remove('hidden');

    const list = document.getElementById('connectedFileList');
    if (!list) return;

    list.innerHTML = '';
    fileList.slice(0, 20).forEach(name => {
      const ext = name.split('.').pop().toLowerCase();
      const li = document.createElement('div');
      li.className = 'menu-item';
      li.style.padding = '6px 12px';
      li.innerHTML = `
        <span style="font-size:11px;font-family:var(--font-code);color:var(--text-secondary)">${name}</span>
        <button class="btn btn-ghost" style="font-size:10px;padding:3px 8px;margin-left:auto" data-import="${name}">Import</button>
      `;
      li.querySelector('button').addEventListener('click', async () => {
        await importFromConnectedFolder(name, handle, rawFiles, folderName);
      });
      list.appendChild(li);
    });

    if (fileList.length > 20) {
      const more = document.createElement('div');
      more.style.cssText = 'padding:8px 12px;font-size:11px;color:var(--text-muted)';
      more.textContent = `...and ${fileList.length - 20} more`;
      list.appendChild(more);
    }
  }

  async function importFromConnectedFolder(name, handle, rawFiles, folderName) {
    if (!project) { toast('No project open', 'error'); return; }

    let content = '';

    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle(name);
        const file = await fileHandle.getFile();
        content = await file.text();
      } catch (e) {
        toast('Cannot read file: ' + e.message, 'error'); return;
      }
    } else if (rawFiles) {
      const raw = rawFiles.find(f => f.webkitRelativePath.endsWith('/' + name) || f.name === name);
      if (!raw) { toast('File not found', 'error'); return; }
      content = await raw.text();
    }

    const existing = await FileManager.getProjectFiles(project.id);
    if (existing.find(f => f.name === name)) {
      // Update existing
      const existingFile = existing.find(f => f.name === name);
      await FileManager.updateFileContent(existingFile.id, content);
      toast(`Updated: ${name}`, 'success');
    } else {
      await FileManager.createFile(project.id, name, content);
      toast(`Imported: ${name}`, 'success');
    }
  }

  async function importFile() {
    if (!project) { toast('No project open', 'error'); return; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.css,.js,.json,.md,.txt,.xml,.svg,.php,.py,.ts';
    input.multiple = true;

    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      let count = 0;
      for (const f of files) {
        const content = await f.text();
        const existing = await FileManager.getProjectFiles(project.id);
        if (existing.find(ef => ef.name === f.name)) {
          const ef = existing.find(ef => ef.name === f.name);
          await FileManager.updateFileContent(ef.id, content);
        } else {
          await FileManager.createFile(project.id, f.name, content);
        }
        count++;
      }
      toast(`Imported ${count} file(s)`, 'success');
    });
    input.click();
  }

  async function exportProject() {
    if (!project) { toast('No project open', 'error'); return; }
    toast('Preparing export...', 'info');

    if (typeof JSZip !== 'undefined') {
      const blob = await FileManager.exportProjectAsZip(project.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast('ZIP downloaded!', 'success');
    } else {
      const files = await FileManager.getProjectFiles(project.id);
      let bundle = `/* Nezux IDE Export - ${project.name} */\n`;
      for (const f of files) {
        bundle += `\n\n/* ===== ${f.name} ===== */\n${f.content || ''}`;
      }
      const blob = new Blob([bundle], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-')}-export.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Project exported!', 'success');
    }
  }

  // Save to device using File System Access API
  async function saveToDevice(content, filename) {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        toast(`Saved to device: ${filename}`, 'success');
      } catch (e) {
        if (e.name !== 'AbortError') {
          // Fallback to download
          downloadBlob(new Blob([content]), filename);
        }
      }
    } else {
      downloadBlob(new Blob([content]), filename);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function updateStorageStatus(folderName) {
    const statusEl = document.getElementById('storageStatus');
    if (statusEl) {
      if (folderName) {
        statusEl.textContent = `Connected: ${folderName}`;
        statusEl.style.color = 'var(--accent-green)';
      } else {
        statusEl.textContent = 'Belum terhubung';
        statusEl.style.color = 'var(--text-muted)';
      }
    }
  }

  async function clearAllData() {
    if (!confirm('This will delete all projects and files. Are you sure?')) return;
    const projects = await FileManager.getAllProjects();
    for (const p of projects) {
      await FileManager.deleteProject(p.id);
    }
    localStorage.clear();
    toast('All data cleared', 'success');
    setTimeout(() => window.location.href = 'splash.html', 1000);
  }

  function showProjectManager() {
    window.location.href = 'editor.html';
  }

  function bindEvents() {
    document.getElementById('btnSaveProjectSettings')?.addEventListener('click', saveProjectSettings);
    document.getElementById('btnSaveEditorSettings')?.addEventListener('click', saveEditorSettings);
    document.getElementById('btnConnectFolder')?.addEventListener('click', connectFolder);
    document.getElementById('btnImportFile')?.addEventListener('click', importFile);
    document.getElementById('btnExportProject')?.addEventListener('click', exportProject);
    document.getElementById('btnClearData')?.addEventListener('click', clearAllData);
    document.getElementById('btnBackToEditor')?.addEventListener('click', () => window.location.href = 'editor.html');

    // Font size preview
    document.getElementById('settingFontSize')?.addEventListener('input', (e) => {
      const label = document.getElementById('fontSizeLabel');
      if (label) label.textContent = e.target.value + 'px';
    });
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

  return { init, saveProjectSettings, saveEditorSettings, connectFolder, importFile, exportProject };
})();

window.Settings = Settings;

document.addEventListener('DOMContentLoaded', () => {
  Settings.init().catch(console.error);
});
