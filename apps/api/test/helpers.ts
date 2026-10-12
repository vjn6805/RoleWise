import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
export const webOrigin='http://localhost:5173';
export const extensionOrigin=`chrome-extension://${'a'.repeat(32)}`;
export const password='Test-only password 2026!';
export const testSecret='test-only-never-deploy-48-character-secret-for-api-tests';
export function config(){return loadConfig({NODE_ENV:'test',DATABASE_URL:process.env.TEST_DATABASE_URL??'postgresql://unused@127.0.0.1/unused',JWT_SECRET:testSecret,WEB_ORIGINS:webOrigin,EXTENSION_ORIGINS:extensionOrigin});}
export async function setup(){
 const url=process.env.TEST_DATABASE_URL;
 if(!url)throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL test database');
 const parsed=new URL(url);
 if(!/(?:test|e2e)/i.test(parsed.pathname))throw new Error('Refusing integration tests: database name must contain test or e2e');
 const schema=`api_test_${randomUUID().replaceAll('-','')}`;
 const admin=new pg.Pool({connectionString:url});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`,max:10});
 try {await migrate(pool);const app=await buildApp(config(),{pool,logger:false});await app.ready();return {pool,app,schema,admin,async close(){await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}};}
 catch(error){await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();throw error;}
}
export type Harness=Awaited<ReturnType<typeof setup>>;
let address=1;
export function request(h:Pick<Harness,'app'>,method:string,url:string,payload?:unknown,accessToken?:string,headers:Record<string,string>={}){
 // Independent clients avoid accidental limiter coupling between security test cases.
 const remoteAddress=`10.${Math.floor(address/65536)%256}.${Math.floor(address/256)%256}.${address++%256}`;
 return h.app.inject({method:method as any,url:`/api${url}`,payload:payload as any,headers:{origin:webOrigin,...(accessToken?{authorization:`Bearer ${accessToken}`} : {}),...headers},remoteAddress});
}
export async function register(h:Pick<Harness,'app'>,mode:'web'|'extension'='extension'){
 const email=`test-${randomUUID()}@example.test`;
 const result=await request(h,'POST','/auth/register',{email,password,fullName:'Test Person'},undefined,mode==='extension'?{'x-client':'extension',origin:extensionOrigin}:{});
 if(result.statusCode!==201)throw new Error(result.body);
 return {...result.json(),email,cookie:result.headers['set-cookie']?.toString().split(';')[0]};
}
export function multipart(bytes:Buffer,filename='resume.txt',mime='text/plain',fields:Record<string,string>={},fileField='file'){
 const boundary=`boundary-${randomUUID()}`;
 const chunks:Buffer[]=[];
 for(const [key,value] of Object.entries(fields))chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
 chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`));
 return {payload:Buffer.concat(chunks),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}};
}
export function pdfFixture(){
 const stream='BT\n/F1 18 Tf\n50 700 Td\n(Verified PDF Resume Python) Tj\nET\n';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
 let text='%PDF-1.4\n';const offsets=[0];
 for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
 const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(text);
}
