/**
 * Nezux Mobile IDE - File Manager
 * Handles virtual file system using IndexedDB + localStorage
 */

const FileManager = (() => {
  const DB_NAME = 'NezuxIDE';
  const DB_VERSION = 2;
  const STORE_FILES = 'files';
  const STORE_PROJECTS = 'projects';
  const CURRENT_PROJECT_KEY = 'nezux_current_project';

  let db = null;
  let currentProjectId = null;

  // File type icons/colors mapping
  const FILE_TYPES = {
    html: { color: '#f0883e', ext: 'html' },
    css:  { color: '#58a6ff', ext: 'css' },
    js:   { color: '#e3b341', ext: 'js' },
    ts:   { color: '#58a6ff', ext: 'ts' },
    json: { color: '#3fb950', ext: 'json' },
    md:   { color: '#8b949e', ext: 'md' },
    txt:  { color: '#8b949e', ext: 'txt' },
    png:  { color: '#a371f7', ext: 'img' },
    jpg:  { color: '#a371f7', ext: 'img' },
    svg:  { color: '#ff7b72', ext: 'svg' },
    xml:  { color: '#f0883e', ext: 'xml' },
    php:  { color: '#a371f7', ext: 'php' },
    py:   { color: '#3fb950', ext: 'py' },
    default: { color: '#8b949e', ext: 'file' }
  };

  // Default starter project files
  const STARTER_FILES = [
    {
      name: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>My App</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <div class="container">
    <h1>Hello, World!</h1>
    <p>Edit this file to get started.</p>
  </div>
  <script src="app.js"></script>
</body>
</html>`
    },
    {
      name: 'style.css',
      content: `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.container {
  text-align: center;
  padding: 40px;
}

h1 {
  font-size: 2.5rem;
  color: #58a6ff;
  margin-bottom: 16px;
}

p {
  color: #8b949e;
  font-size: 1rem;
}`
    },
    {
      name: 'app.js',
      content: `// app.js - Main application logic
console.log('Nezux IDE - App initialized');

document.addEventListener('DOMContentLoaded', () => {
  const h1 = document.querySelector('h1');
  if (h1) {
    h1.addEventListener('click', () => {
      h1.style.color = '#a371f7';
      console.log('Title clicked!');
    });
  }
});`
    }
  ];

  async function initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_FILES)) {
          const store = d.createObjectStore(STORE_FILES, { keyPath: 'id', autoIncrement: true });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
        if (!d.objectStoreNames.contains(STORE_PROJECTS)) {
          d.createObjectStore(STORE_PROJECTS, { keyPath: 'id', autoIncrement: true });
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  function txn(store, mode = 'readonly') {
    return db.transaction(store, mode).objectStore(store);
  }

  function promisify(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async function getAllProjects() {
    return promisify(txn(STORE_PROJECTS).getAll());
  }

  async function createProject(name = 'My App') {
    const proj = {
      name,
      created: Date.now(),
      modified: Date.now(),
      icon: null,
      theme: '#58a6ff',
      orientation: 'portrait',
      version: '1.0.0',
      description: ''
    };
    const id = await promisify(txn(STORE_PROJECTS, 'readwrite').add(proj));
    proj.id = id;

    // Create starter files
    for (const f of STARTER_FILES) {
      await createFile(id, f.name, f.content);
    }

    return proj;
  }

  async function getProject(id) {
    return promisify(txn(STORE_PROJECTS).get(id));
  }

  async function updateProject(id, data) {
    const proj = await getProject(id);
    if (!proj) throw new Error('Project not found');
    Object.assign(proj, data, { modified: Date.now() });
    return promisify(txn(STORE_PROJECTS, 'readwrite').put(proj));
  }

  async function deleteProject(id) {
    // Delete all files in project
    const files = await getProjectFiles(id);
    const store = txn(STORE_FILES, 'readwrite');
    for (const f of files) {
      store.delete(f.id);
    }
    return promisify(txn(STORE_PROJECTS, 'readwrite').delete(id));
  }

  async function getProjectFiles(projectId) {
    const index = txn(STORE_FILES).index('projectId');
    const files = await promisify(index.getAll(projectId));
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function createFile(projectId, name, content = '', folder = '') {
    const ext = name.split('.').pop().toLowerCase();
    const typeInfo = FILE_TYPES[ext] || FILE_TYPES.default;
    const file = {
      projectId,
      name,
      content,
      folder,
      ext,
      typeInfo,
      created: Date.now(),
      modified: Date.now(),
      size: content.length
    };
    const id = await promisify(txn(STORE_FILES, 'readwrite').add(file));
    file.id = id;
    return file;
  }

  async function getFile(id) {
    return promisify(txn(STORE_FILES).get(id));
  }

  async function updateFileContent(id, content) {
    const file = await getFile(id);
    if (!file) throw new Error('File not found');
    file.content = content;
    file.modified = Date.now();
    file.size = content.length;
    await promisify(txn(STORE_FILES, 'readwrite').put(file));
    // Update project modified time
    if (file.projectId) {
      await updateProject(file.projectId, {}).catch(() => {});
    }
    return file;
  }

  async function renameFile(id, newName) {
    const file = await getFile(id);
    if (!file) throw new Error('File not found');
    const ext = newName.split('.').pop().toLowerCase();
    file.name = newName;
    file.ext = ext;
    file.typeInfo = FILE_TYPES[ext] || FILE_TYPES.default;
    file.modified = Date.now();
    return promisify(txn(STORE_FILES, 'readwrite').put(file));
  }

  async function deleteFile(id) {
    return promisify(txn(STORE_FILES, 'readwrite').delete(id));
  }

  function getFileTypeInfo(name) {
    const ext = name.split('.').pop().toLowerCase();
    return FILE_TYPES[ext] || FILE_TYPES.default;
  }

  function getEditorMode(ext) {
    const modes = {
      html: 'htmlmixed',
      css: 'css',
      js: 'javascript',
      ts: 'javascript',
      json: 'application/json',
      md: 'markdown',
      xml: 'xml',
      php: 'php',
      py: 'python',
      txt: 'text/plain'
    };
    return modes[ext] || 'text/plain';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setCurrentProject(id) {
    currentProjectId = id;
    localStorage.setItem(CURRENT_PROJECT_KEY, id);
  }

  function getCurrentProjectId() {
    if (!currentProjectId) {
      const stored = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (stored) currentProjectId = parseInt(stored);
    }
    return currentProjectId;
  }

  async function exportProjectAsZip(projectId) {
    const files = await getProjectFiles(projectId);
    const project = await getProject(projectId);

    // Use JSZip if available
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      for (const f of files) {
        const path = f.folder ? `${f.folder}/${f.name}` : f.name;
        zip.file(path, f.content || '');
      }

      // Add manifest.json
      const manifest = generateManifest(project);
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Add service worker
      const sw = generateServiceWorker(files);
      zip.file('service-worker.js', sw);

      return await zip.generateAsync({ type: 'blob' });
    }

    // Fallback: create simple text bundle
    let bundle = '';
    for (const f of files) {
      bundle += `\n\n/* === ${f.name} === */\n`;
      bundle += f.content || '';
    }
    return new Blob([bundle], { type: 'text/plain' });
  }

  function generateManifest(project) {
    return {
      name: project.name,
      short_name: project.name.slice(0, 12),
      description: project.description || '',
      start_url: './index.html',
      display: 'standalone',
      orientation: project.orientation || 'portrait',
      theme_color: project.theme || '#58a6ff',
      background_color: '#0d0d14',
      icons: [
        { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    };
  }

  function generateServiceWorker(files) {
    const cacheList = files.map(f => `./${f.name}`).join(',\n  ');
    return `// Nezux IDE - Generated Service Worker
const CACHE_NAME = 'nezux-app-v1';
const ASSETS = [
  './',
  './index.html',
  ${cacheList}
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
`;
  }

  return {
    init: initDB,
    getAllProjects,
    createProject,
    getProject,
    updateProject,
    deleteProject,
    getProjectFiles,
    createFile,
    getFile,
    updateFileContent,
    renameFile,
    deleteFile,
    getFileTypeInfo,
    getEditorMode,
    formatSize,
    setCurrentProject,
    getCurrentProjectId,
    exportProjectAsZip,
    generateManifest,
    generateServiceWorker,
    FILE_TYPES
  };
})();

window.FileManager = FileManager;
