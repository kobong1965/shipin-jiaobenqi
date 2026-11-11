import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frozen=path.join(project,'frozen-web');
const manifest=JSON.parse(await fs.readFile(path.join(project,'frozen-web-manifest.json'),'utf8'));
if(manifest.version!=='0.1.18'||manifest.entry!=='index.html'||!Array.isArray(manifest.files))throw Error('Invalid preserved UI manifest');
const actual=[];
async function list(root,relative=''){
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
    const rel=path.posix.join(relative,entry.name);
    if(entry.isSymbolicLink())throw Error('Preserved UI cannot contain links');
    if(entry.isDirectory())await list(root,rel);else if(entry.isFile())actual.push(rel);else throw Error('Unexpected UI file type');
  }
}
await list(frozen);
const expected=manifest.files.map(f=>f.path);
if(new Set(expected).size!==expected.length||actual.sort().join('\n')!==expected.slice().sort().join('\n'))throw Error('Preserved UI file set differs');
for(const item of manifest.files){
  if(item.path.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(item.path)||/[\\:\x00-\x1f]/.test(item.path))throw Error('Unsafe UI path');
  const bytes=await fs.readFile(path.join(frozen,item.path));
  if(bytes.length!==item.size||createHash('sha256').update(bytes).digest('hex')!==item.sha256.toLowerCase())throw Error('Preserved UI hash differs: '+item.path);
}
const index=await fs.readFile(path.join(frozen,'index.html'),'utf8');
for(const entry of ['workbench-apple-34e6ef8f63.js','workbench-apple-3277290993.css'])if(!index.includes(entry))throw Error('Pre-publication UI entry missing');
const js=await fs.readFile(path.join(frozen,'assets/workbench-apple-34e6ef8f63.js'),'utf8');
const css=await fs.readFile(path.join(frozen,'assets/workbench-apple-3277290993.css'),'utf8');
for(const marker of ['product-picker-pagination','product-picker-viewport'])if(!js.includes(marker)||!css.includes(marker))throw Error('Compact picker missing: '+marker);
if(!css.includes('-apple-system'))throw Error('Apple-style font stack missing');
const mode=process.argv[2]??'verify';
if(mode==='build'){
  const args=process.argv.slice(3);
  const outputIndex=args.indexOf('--output-root');
  if(outputIndex>=0&&!args[outputIndex+1])throw Error('Missing --output-root');
  const output=path.resolve(outputIndex>=0?args[outputIndex+1]:(process.env.VSW_OUTPUT_ROOT??path.join(project,'dist/web')));
  if(output===project||output===path.parse(output).root||output===frozen||project.startsWith(output+path.sep)||frozen.startsWith(output+path.sep))throw Error('Choose a separate build output directory');
  await fs.mkdir(output,{recursive:true});
  for(const item of manifest.files){const target=path.join(output,item.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(frozen,item.path),target);}
  console.log(JSON.stringify({version:manifest.version,verifiedFiles:manifest.files.length,output,preservedUI:true}));
}else if(mode==='verify')console.log(JSON.stringify({version:manifest.version,verifiedFiles:manifest.files.length,preservedUI:true,compactPicker:true}));
else throw Error('Use verify or build');
