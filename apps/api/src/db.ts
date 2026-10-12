import pg from 'pg';
import { randomUUID } from 'node:crypto';
export const id=()=>randomUUID();
// Keep SQL DATE values calendar-only; timestamptz values remain Date objects.
pg.types.setTypeParser(1082,v=>v);
export type DB=pg.Pool|pg.PoolClient;
export function createPool(url:string){ return new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000}); }
export async function tx<T>(pool:pg.Pool,fn:(db:pg.PoolClient)=>Promise<T>):Promise<T>{ const db=await pool.connect(); try {await db.query('BEGIN'); const result=await fn(db); await db.query('COMMIT'); return result;} catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export class HttpError extends Error {constructor(public statusCode:number,public code:string,message:string){super(message);}}
export function fail(status:number,code:string,message:string):never {throw new HttpError(status,code,message);}
export const iso=(v:Date|string)=>v instanceof Date?v.toISOString():v;
const tables=new Set(['education','experience','projects','skills','certifications','achievements','links','resumes','resume_versions','jobs','applications','analyses','interview_preps','drafts']);
export function table(name:string){if(!tables.has(name)) fail(400,'INVALID_SECTION','Unknown resource');return name;}
// Every ID lookup uses this central owner predicate; routes never load private IDs globally.
export async function owned(db:DB,name:string,userId:string,resourceId:string,lock=false){const q=await db.query(`SELECT * FROM ${table(name)} WHERE user_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[userId,resourceId]);return q.rows[0]??fail(404,'NOT_FOUND','Resource not found');}
export async function listOwned(db:DB,name:string,userId:string){return (await db.query(`SELECT * FROM ${table(name)} WHERE user_id=$1 ORDER BY created_at DESC,id`,[userId])).rows;}
