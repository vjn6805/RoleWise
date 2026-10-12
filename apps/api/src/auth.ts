import { scrypt,randomBytes,timingSafeEqual,createHash } from 'node:crypto';
import { z } from 'zod';
import { registerSchema,loginSchema } from '@career/shared';
import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { fail,id,tx } from './db.js';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await derive(password,salt);return `scrypt$${salt}$${key.toString('hex')}`;}
export async function verifyPassword(password:string,encoded:string){if(!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded))return false;const [,salt,hex]=encoded.split('$');const key=await derive(password,salt!);return timingSafeEqual(Buffer.from(hex!,'hex'),key);}
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export const publicUser=(r:any)=>({id:r.id,email:r.email,fullName:r.full_name,active:r.active});
declare module 'fastify' { interface FastifyRequest { userId:string; sessionId:string; } }
const tokenSchema=z.object({refreshToken:z.string().min(40).max(200).optional()}).strict();
export function authRoutes(app:FastifyInstance,pool:pg.Pool,config:Config){
 const cookieName=config.NODE_ENV==='production'?'__Host-career_refresh':'career_refresh';
 const cookieOptions={path:'/',httpOnly:true,secure:config.NODE_ENV==='production',sameSite:'strict' as const,maxAge:30*86400};
 const client=(r:FastifyRequest)=>r.headers['x-client']==='extension'?'extension':'web';
 const getToken=(r:FastifyRequest)=>{const body=tokenSchema.parse(r.body??{});if(client(r)==='web'&&body.refreshToken)fail(400,'INVALID_REQUEST','Web clients must use the refresh cookie');return client(r)==='extension'?body.refreshToken:r.cookies[cookieName];};
 const issue=async(db:pg.PoolClient,userId:string,mode:string,familyId=id())=>{const token=randomBytes(48).toString('base64url');await db.query('INSERT INTO refresh_tokens(id,user_id,family_id,token_hash,client,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'30 days\')',[id(),userId,familyId,digest(token),mode]);return {token,familyId};};
 const response=(reply:FastifyReply,user:any,token:string,familyId:string,mode:string)=>{if(mode==='web')reply.setCookie(cookieName,token,cookieOptions);return {accessToken:app.jwt.sign({sub:user.id,sid:familyId},{expiresIn:'15m'}),user:publicUser(user),...(mode==='extension'?{refreshToken:token}:{})};};
 // Password derivation on unknown users avoids a trivial account-existence timing oracle.
 const dummyPromise=hashPassword(randomBytes(32).toString('hex'));
 app.decorateRequest('userId',''); app.decorateRequest('sessionId','');
 app.addHook('preHandler',async request=>{
  if(!request.url.startsWith('/api/')||['/api/health','/api/ready','/api/auth/register','/api/auth/login','/api/auth/refresh','/api/auth/logout'].includes(request.url.split('?')[0]!)||request.method==='OPTIONS')return;
  try {const decoded=await request.jwtVerify<{sub:string;sid:string}>();if(!z.string().uuid().safeParse(decoded.sub).success||!z.string().uuid().safeParse(decoded.sid).success)throw new Error();
   const found=await pool.query('SELECT 1 FROM users u WHERE u.id=$1 AND u.active AND EXISTS(SELECT 1 FROM refresh_tokens r WHERE r.user_id=u.id AND r.family_id=$2 AND r.revoked_at IS NULL AND r.used_at IS NULL AND r.expires_at>now())',[decoded.sub,decoded.sid]);if(!found.rowCount)throw new Error();request.userId=decoded.sub;request.sessionId=decoded.sid;
  } catch(e){if((e as any).code?.startsWith('08'))throw e;fail(401,'UNAUTHENTICATED','Sign in to continue');}
 });
 const authLimit={config:{rateLimit:{max:10,timeWindow:'1 minute'}}};
 app.post('/api/auth/register',authLimit,async(request,reply)=>{
  const data=registerSchema.parse(request.body);const passwordHash=await hashPassword(data.password);
  const result=await tx(pool,async db=>{const user=(await db.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING *',[id(),data.email.toLowerCase(),data.fullName,passwordHash])).rows[0];if(!user)fail(409,'ACCOUNT_EXISTS','Unable to create account with this email');await db.query('INSERT INTO profiles(user_id,full_name,email) VALUES($1,$2,$3)',[user.id,user.full_name,user.email]);return {user,...await issue(db,user.id,client(request))};});reply.code(201);return response(reply,result.user,result.token,result.familyId,client(request));
 });
 app.post('/api/auth/login',authLimit,async(request,reply)=>{const data=loginSchema.parse(request.body);const user=(await pool.query('SELECT * FROM users WHERE email=$1',[data.email.toLowerCase()])).rows[0];const valid=await verifyPassword(data.password,user?.password_hash??await dummyPromise);if(!valid||!user?.active)fail(401,'INVALID_CREDENTIALS','Email or password is incorrect');const result=await tx(pool,db=>issue(db,user.id,client(request)));return response(reply,user,result.token,result.familyId,client(request));});
 app.post('/api/auth/refresh',authLimit,async(request,reply)=>{
  const token=getToken(request);if(!token)fail(401,'INVALID_SESSION','Sign in again');
  // Serialize on the family BEFORE reading token state. Concurrent replays revoke even a just-created descendant.
  const result=await tx(pool,async db=>{const lookup=(await db.query('SELECT family_id FROM refresh_tokens WHERE token_hash=$1',[digest(token)])).rows[0];if(!lookup)return null;
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lookup.family_id]);
   const row=(await db.query('SELECT r.*,u.email,u.full_name,u.active FROM refresh_tokens r JOIN users u ON u.id=r.user_id WHERE token_hash=$1 FOR UPDATE OF r',[digest(token)])).rows[0];
   if(!row)return null;
   if(row.used_at||row.revoked_at||!row.active||new Date(row.expires_at).getTime()<=Date.now()||row.client!==client(request)){await db.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1',[row.family_id]);return null;}
   await db.query('UPDATE refresh_tokens SET used_at=now() WHERE id=$1',[row.id]);return {user:{...row,id:row.user_id},...await issue(db,row.user_id,row.client,row.family_id)};
  });
  if(!result){reply.clearCookie(cookieName,{path:'/'});fail(401,'INVALID_SESSION','Session expired or reused; sign in again');}return response(reply,result.user,result.token,result.familyId,client(request));
 });
 app.post('/api/auth/logout',async(request,reply)=>{const token=getToken(request);if(token)await tx(pool,async db=>{const row=(await db.query('SELECT family_id FROM refresh_tokens WHERE token_hash=$1 AND client=$2',[digest(token),client(request)])).rows[0];if(row){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[row.family_id]);await db.query('UPDATE refresh_tokens SET revoked_at=now() WHERE family_id=$1',[row.family_id]);}});reply.clearCookie(cookieName,{path:'/'});return reply.code(204).send();});
 app.get('/api/auth/me',async request=>publicUser((await pool.query('SELECT * FROM users WHERE id=$1',[request.userId])).rows[0]));
}
