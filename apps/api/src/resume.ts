import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { fail } from './db.js';
const require=createRequire(import.meta.url);
const parserPath=require.resolve('pdf-parse/lib/pdf-parse.js');
let activeParsers=0;
// Untrusted PDFs run off the request thread with a wall-clock and worker heap budget.
async function parsePdf(bytes:Buffer):Promise<string>{
 if(activeParsers>=2)fail(429,'PARSER_BUSY','Resume parser is busy; try again shortly');
 activeParsers++;
 try{return await new Promise<string>((resolve,reject)=>{
   const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');require(workerData.parser)(Buffer.from(workerData.bytes)).then(result=>parentPort.postMessage({text:result.text.replace(/\\u0000/g,'').slice(0,100000)})).catch(error=>parentPort.postMessage({error:String(error?.message||error)}));`,{eval:true,workerData:{parser:parserPath,bytes},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}});
   const timer=setTimeout(()=>finish(new Error('PDF parsing timed out')),15000);
  let settled=false;
  function finish(error?:Error,text?:string){if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(text!);}
   worker.once('message',(result:{text?:string;error?:string})=>result.error?finish(new Error(result.error)):finish(undefined,result.text));worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new Error('PDF parser stopped')));
 });}finally{activeParsers--;}
}
export const maxResumeSize=5*1024*1024;
export function safeFilename(name:string){return name.replace(/^.*[\\/]/,'').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180)||'resume';}
export async function extractResume(bytes:Buffer,filename:string,mime:string){if(!bytes.length||bytes.length>maxResumeSize)fail(413,'FILE_SIZE','Upload a nonempty file up to 5 MiB');
 const ext=filename.toLowerCase().split('.').pop();
 if(ext==='txt'&&mime==='text/plain') {if(bytes.includes(0))fail(400,'INVALID_FILE','Invalid text file');let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail(400,'INVALID_FILE','TXT files must use UTF-8 encoding');}if(/[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text))fail(400,'INVALID_FILE','Binary content is not a text resume');return text.slice(0,100000);}
  if(ext==='pdf'&&mime==='application/pdf') {if(bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-2048).includes(Buffer.from('%%EOF')))fail(400,'INVALID_FILE','Invalid PDF signature');try{return await parsePdf(bytes);}catch(error){if((error as {statusCode?:number}).statusCode===429)throw error;const fallback=[...bytes.toString('latin1').matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g)].map(match=>match[1]!.replace(/\\([\\()])/g,'$1')).join(' ').trim();if(fallback)return fallback.slice(0,100000);fail(400,'INVALID_FILE','PDF could not be read within safe limits; use an unencrypted PDF or UTF-8 TXT');}}
 fail(415,'UNSUPPORTED_FILE','Only PDF or UTF-8 TXT resumes are supported; filename and MIME type must agree');
}
