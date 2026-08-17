// Populates www/ (Capacitor's webDir) as a copy of the static site's source
// files. There's no bundler here on purpose — this project has no build step
// for the web app itself; www/ just needs to exist as a separate folder so
// Capacitor can sync it into android/ without also copying android/ into
// itself. The GitHub Pages deploy (.github/workflows/static.yml) still
// publishes the repo root directly and is untouched by this script.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const FILES = [
    'index.html',
    'styles.css',
    'script.js',
    'firebase-config.js',
    'manifest.webmanifest',
    'sw.js',
];

const DIRS = ['icons', 'assets', 'vendor'];

function copyFile(rel) {
    const src = path.join(ROOT, rel);
    const dest = path.join(WWW, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function copyDir(rel) {
    const src = path.join(ROOT, rel);
    const dest = path.join(WWW, rel);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
}

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const file of FILES) copyFile(file);
for (const dir of DIRS) copyDir(dir);

console.log(`Copied ${FILES.length} files and ${DIRS.length} folders into www/`);
