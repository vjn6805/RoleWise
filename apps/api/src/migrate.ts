import { readdir,readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool,tx } from './db.js';
import { loadConfig } from './config.js';
import type pg from 'pg';
export async function migrate(pool:pg.Pool){await tx(pool,async db=>{
 await db.query('SELECT pg_advisory_xact_lock(717920013)');
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 const root=new URL('../migrations/',import.meta.url);
 for(const name of (await readdir(root)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
  if((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount)continue;
  await db.query(await readFile(new URL(name,root),'utf8'));await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
 }
});}
if(process.argv[1] && fileURLToPath(import.meta.url)===fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g,'/').replace(/^\//,'')}`))){const pool=createPool(loadConfig().DATABASE_URL);try{await migrate(pool);console.log('Database migrations complete');}finally{await pool.end();}}
