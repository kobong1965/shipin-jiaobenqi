import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'built-web');
const result = await build({
  absWorkingDir: root, entryPoints: ['apps/web/src/main.tsx'], bundle: true,
  outdir: path.join(out, 'assets'), entryNames: 'workbench-[hash]', chunkNames: '[name]-[hash]',
  assetNames: '[name]-[hash]', loader: { '.png': 'file' }, publicPath: '/assets',
  jsx: 'automatic', format: 'esm', splitting: true, target: 'chrome120',
  minify: true, define: { 'process.env.NODE_ENV': '"production"' }, metafile: true,
});
const outputs = Object.entries(result.metafile.outputs);
const entry = outputs.find(([, info]) => info.entryPoint === 'apps/web/src/main.tsx');
if (!entry) throw new Error('Missing entry');
const css = entry[1].cssBundle;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#f5f6fc"/><link rel="icon" href="/assets/brand-logo-B91fdHS5.png"/><title>视频 Skill 工作台</title><script type="module" crossorigin src="/assets/${path.basename(entry[0])}"></script><link rel="stylesheet" href="/assets/${path.basename(css)}"/></head><body><div id="root"></div></body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify({ builtAt: new Date().toISOString(), entry: path.basename(entry[0]), css: path.basename(css) }, null, 2));
console.log(`Built ${outputs.length} files into ${out}`);
