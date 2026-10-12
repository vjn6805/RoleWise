import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'apps/extension/dist');
const artifact = 'career-copilot-extension.zip';
const publicDir = join(root, 'apps/web/public/downloads');
const builtDir = join(root, 'apps/web/dist/downloads');
const instructions = `Career Copilot — manual Chrome / Edge installation\n\n1. Extract this ZIP into a permanent folder.\n2. Open chrome://extensions (or edge://extensions).\n3. Enable Developer mode and choose Load unpacked.\n4. Select the extracted folder containing manifest.json.\n5. Open Career Copilot from the extension toolbar and sign in.\n\nA website download cannot install a browser extension automatically.\nThis is an unsigned developer package, not a Chrome Web Store installation.\nKeep the folder: moving it breaks the unpacked installation.\nReview captured page text and proposed field values before using them.\nCareer Copilot never submits an application for you.\nSee the project's docs/extension.md for API origin configuration and permissions.\n`;

async function entries(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Refusing to package symlink: ${relative}`);
    if (entry.isDirectory()) result.push(...await entries(join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

await access(source);
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected a built Manifest V3 extension');
if (manifest.key || manifest.host_permissions?.length || manifest.content_scripts?.length) throw new Error('Refusing a test identity or pregranted website access in the release package');
if (manifest.permissions?.some(permission => !['activeTab', 'scripting', 'storage', 'sidePanel'].includes(permission))) throw new Error('Unexpected required extension permission');
const files = await entries(source);
for (const required of ['manifest.json', 'panel.html', 'panel.css', 'panel.js', 'background.js']) {
  if (!files.includes(required)) throw new Error(`Missing built extension file: ${required}`);
}
for (const file of files) {
  if (file.split('/').some(part => part.startsWith('.')) || !/\.(?:json|html|css|js|png|svg|webp|jpg|jpeg|ico|woff2?)$/i.test(file)) throw new Error(`Unexpected file in extension build: ${file}`);
}
await mkdir(publicDir, { recursive: true });
await mkdir(builtDir, { recursive: true });
const destination = join(publicDir, artifact);
const archive = archiver('zip', { zlib: { level: 9 } });
const temporary = `${destination}.tmp`;
await rm(temporary, { force: true });
const output = createWriteStream(temporary);
const finished = new Promise((resolvePromise, reject) => {
  output.on('close', resolvePromise);
  output.on('error', reject);
  archive.on('error', reject);
  archive.on('warning', reject);
});
archive.pipe(output);
for (const file of files) archive.file(join(source, file), { name: file, date: new Date('2024-01-01T00:00:00Z') });
archive.append(instructions, { name: 'INSTALL.txt', date: new Date('2024-01-01T00:00:00Z') });
await archive.finalize();
await finished;
await rename(temporary, destination);
await copyFile(destination, join(builtDir, artifact));
console.log(`Packaged ${artifact} (${archive.pointer()} bytes) into apps/web/public/downloads and apps/web/dist/downloads`);
