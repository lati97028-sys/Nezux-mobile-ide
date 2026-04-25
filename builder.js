/**
 * Nezux Mobile IDE - Builder System
 * Handles PWA manifest, service worker, and project structure generation
 */

const Builder = (() => {

  async function buildPWA(project, files) {
    const manifest = FileManager.generateManifest(project);
    const sw = FileManager.generateServiceWorker(files);

    return {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'service-worker.js': sw,
      'register-sw.js': `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW error:', err));
  });
}`
    };
  }

  function generateIcons(color = '#58a6ff') {
    // Generate simple SVG icon
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="${color}"/>
  <polyline points="128,144 176,96 128,48" fill="none" stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="64,48 16,96 64,144" fill="none" stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
</svg>`;
    return svg;
  }

  function generateReadme(project) {
    return `# ${project.name}

${project.description || 'Built with Nezux Mobile IDE'}

## Version
${project.version || '1.0.0'}

## Getting Started

Open \`index.html\` in a browser, or deploy to any static hosting service.

## PWA Support

This project includes:
- \`manifest.json\` - PWA manifest
- \`service-worker.js\` - Offline support

## Built With

[Nezux Mobile IDE](https://nezux.app) - The mobile-first code editor
`;
  }

  function generateHTMLShell(project) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="theme-color" content="${project.theme || '#58a6ff'}"/>
  <title>${project.name}</title>
  <link rel="manifest" href="manifest.json"/>
  <link rel="apple-touch-icon" href="assets/icons/icon-192.png"/>
  <link rel="icon" href="assets/icons/favicon.ico"/>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <div id="app"></div>
  <script src="app.js"><\/script>
  <script src="register-sw.js"><\/script>
</body>
</html>`;
  }

  async function buildAndDownload(projectId) {
    const project = await FileManager.getProject(projectId);
    const files = await FileManager.getProjectFiles(projectId);

    if (!project) throw new Error('Project not found');

    const pwaFiles = await buildPWA(project, files);

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip not loaded');
    }

    const zip = new JSZip();

    // Project files
    for (const f of files) {
      const path = f.folder ? `${f.folder}/${f.name}` : f.name;
      zip.file(path, f.content || '');
    }

    // Generated files
    for (const [name, content] of Object.entries(pwaFiles)) {
      zip.file(name, content);
    }

    // README
    zip.file('README.md', generateReadme(project));

    // Icon SVG
    const iconFolder = zip.folder('assets/icons');
    iconFolder.file('icon.svg', generateIcons(project.theme || '#58a6ff'));

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return blob;
  }

  function validateProject(files) {
    const issues = [];
    const hasHTML = files.some(f => f.ext === 'html');
    if (!hasHTML) issues.push({ type: 'warn', msg: 'No HTML file found. Add an index.html.' });

    const hasIndex = files.some(f => f.name === 'index.html');
    if (!hasIndex && hasHTML) issues.push({ type: 'info', msg: 'No index.html. Rename your main HTML file to index.html for best compatibility.' });

    const totalSize = files.reduce((s, f) => s + (f.content?.length || 0), 0);
    if (totalSize > 5 * 1024 * 1024) issues.push({ type: 'warn', msg: 'Project is large (>5MB). Consider optimizing.' });

    return issues;
  }

  return {
    buildPWA,
    buildAndDownload,
    generateIcons,
    generateReadme,
    generateHTMLShell,
    validateProject
  };
})();

window.Builder = Builder;
