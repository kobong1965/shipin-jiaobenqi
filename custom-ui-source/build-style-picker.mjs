import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {transform} from '../server/node_modules/esbuild/lib/main.js';
const custom=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(custom);
const html=await fs.readFile(path.join(root,'web/index.html'),'utf8');
const mainRelative=html.match(/<script[^>]+src="\/([^\"]+\.js)"/)?.[1];
const cssRelative=html.match(/<link[^>]+(?:rel="stylesheet"[^>]+href|href)="\/([^\"]+\.css)"/)?.[1];
if(!mainRelative||!cssRelative)throw Error('Active UI assets not found');
const main=path.join(root,'web',mainRelative);
const css=path.join(root,'web',cssRelative);
const backup=path.join(custom,'backups');
await fs.mkdir(backup,{recursive:true});
for(const file of [main,css])await fs.copyFile(file,path.join(backup,path.basename(file)),fs.constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
const original=await fs.readFile(main,'utf8');
const modern=path.basename(main).startsWith('workbench-');
const beginMarker='/* custom-style-picker:start */';
const endMarker='/* custom-style-picker:end */';
let start=original.indexOf(beginMarker),end;
if(start>=0){end=original.indexOf(endMarker,start);if(end<0)throw Error('Incomplete picker customization');end+=endMarker.length;}
else{
 start=original.indexOf('function StylePickerDialog(');
 if(start<0)start=original.indexOf(modern?'function IL({initialGroups:':'function Ec({options:');
 end=original.indexOf(modern?'var Aa=S(O(),1);function xL(':'function Oc(',start);
}
if(start<0||end<0)throw Error('Installed style picker boundary not found');
let source=(await fs.readFile(path.join(custom,'style-picker-dialog.jsx'),'utf8'))+'\n'+await fs.readFile(path.join(custom,'style-picker.jsx'),'utf8');
source=source.replace('const Dialog = te;','const Dialog = StylePickerDialog;');
if(modern)source=source.replace('function Dc(','function IL(');
const define=modern?{l:'qa',oe:'fu',p:'ja',wc:'FL',xc:'yL',Cc:'KL',Tc:'nu'}:{};
const compiled=await transform(source,{loader:'jsx',jsxFactory:modern?'qa.createElement':'l.createElement',jsxFragment:modern?'qa.Fragment':'l.Fragment',target:'es2022',minify:false,define});
let output=original.slice(0,start)+beginMarker+'\n'+compiled.code+endMarker+'\n'+original.slice(end);
await fs.writeFile(main,output);
const currentCss=await fs.readFile(css,'utf8');
const cssMarker='/* Responsive category style picker */';
const cssEnd='/* End responsive category style picker */';
const cssStart=currentCss.indexOf(cssMarker);
const cssEndAt=currentCss.indexOf(cssEnd,cssStart);
const prefix=cssStart<0?currentCss:currentCss.slice(0,cssStart);
const suffix=cssEndAt<0?'':currentCss.slice(cssEndAt+cssEnd.length);
await fs.writeFile(css,prefix+'\n'+cssMarker+'\n'+await fs.readFile(path.join(custom,'style-picker.css'),'utf8')+'\n'+cssEnd+suffix);
const manifestPath=path.join(root,'package-manifest.json');
await fs.copyFile(manifestPath,path.join(backup,'package-manifest.json'),fs.constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const extraFiles=['server/database/migrations/010-product-set-category.sql'];
for(const file of extraFiles)if(!manifest.files.some(item=>item.path===file))manifest.files.push({path:file});
for(const item of manifest.files){
 const absolute=path.join(root,item.path);
 if(item.path.startsWith('web/')||/^(server\/apps\/api\/product-sets.ts|server\/packages\/contracts\/index.ts|server\/database\/migrations\/010-product-set-category.sql)$/.test(item.path)){
  const bytes=await fs.readFile(absolute);item.size=bytes.length;item.sha256=createHash('sha256').update(bytes).digest('hex');
 }
}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({built:true,main:path.basename(main),source:'ui-customizations/style-picker.jsx'}));
