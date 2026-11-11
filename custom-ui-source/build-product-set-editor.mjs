import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { transform } from '../server/node_modules/esbuild/lib/main.js';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(folder);
const html = await fs.readFile(path.join(root, 'web/index.html'), 'utf8');
const entryFile = /<script\b[^>]*\bsrc="([^"]+\.js)"/.exec(html)?.[1];
if (!entryFile || !entryFile.startsWith('/assets/')) throw Error('Active application script missing');
const entry = await fs.readFile(path.join(root, 'web', entryFile.slice(1)), 'utf8');
const filenames = [...new Set([...entry.matchAll(/AssetLibrary-[\w-]+\.js/g)].map(match => match[0]))];
if (filenames.length !== 1) throw Error('Cannot uniquely identify the active AssetLibrary chunk');
const filename = filenames[0];
const target = path.join(root, 'web/assets', filename);
const backup = path.join(folder, 'backups', filename);
await fs.mkdir(path.dirname(backup), { recursive: true });
try { await fs.copyFile(target, backup, fs.constants.COPYFILE_EXCL); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
// Always patch the current file, so unrelated concurrent updates are preserved.
const original = await fs.readFile(target, 'utf8');
const modern = original.includes('function G({initial:') || original.includes('function G({ initial');
const beginMarker = '/* custom-product-set-editor:start */';
const endMarker = '/* custom-product-set-editor:end */';
let start = original.indexOf(beginMarker);
let end;
if (start >= 0) {
  end = original.indexOf(endMarker, start);
  if (end < 0) throw Error('Incomplete product editor customization marker');
  end += endMarker.length;
  if (original[end] === '\r') end++;
  if (original[end] === '\n') end++;
} else {
  start = original.indexOf(modern ? 'function G({initial:' : 'function v({initial:');
  end = original.indexOf(modern ? 'var e=w(A(),1),J={product:' : 'var y={product:', start);
}
if (start < 0 || end < 0) throw Error('Product editor boundary changed; no bundle written');
const source = await fs.readFile(path.join(folder, 'product-set-editor.jsx'), 'utf8');
const compiled = await transform(modern ? source.replace('function v(', 'function G(') : source, {
  loader: 'jsx', jsxFactory: modern ? 'I.createElement' : 'g.createElement', jsxFragment: modern ? 'I.Fragment' : 'g.Fragment', minify: false, target: 'es2022',
  define: modern ? { g: 'I', e: 'B', u: 'K', o: 'M', p: 'k', r: 'g', s: 'N', m: 'W', i: 'F' } : undefined,
});
if (!compiled.code.includes(modern ? 'function G(' : 'function v(')) throw Error('Expected editor entry point missing');
const patched = original.slice(0, start) + beginMarker + '\n' + compiled.code + endMarker + '\n' + original.slice(end);
await fs.writeFile(target, patched);
console.log(JSON.stringify({ file: filename, sha256: createHash('sha256').update(patched).digest('hex'), bytes: Buffer.byteLength(patched), addedCategorySelector: true }));
