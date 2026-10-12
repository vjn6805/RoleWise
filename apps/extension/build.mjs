import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
await rm(new URL('./dist', import.meta.url), {recursive:true, force:true});
await mkdir(new URL('./dist', import.meta.url), {recursive:true});
await build({entryPoints:['src/panel.ts','src/background.ts'],outdir:'dist',bundle:true,format:'esm',target:'chrome114',sourcemap:false,minify:false});
for (const file of ['manifest.json','panel.html','panel.css']) await copyFile(file,`dist/${file}`);
console.log('Extension built: apps/extension/dist');
