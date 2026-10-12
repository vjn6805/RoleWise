import { z } from 'zod';
const envSchema = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 PORT:z.coerce.number().int().min(1).max(65535).default(4000), HOST:z.string().default('127.0.0.1'),
 DATABASE_URL:z.string().url().refine(v=>/^postgres(ql)?:/.test(v),'PostgreSQL URL required'),
 JWT_SECRET:z.string().min(32), WEB_ORIGINS:z.string().default('http://localhost:5173'),
 EXTENSION_ORIGINS:z.string().default(''), TRUST_PROXY:z.enum(['true','false']).default('false'),
  AI_BASE_URL:z.preprocess(value=>value===''?undefined:value,z.string().url().optional()), AI_API_KEY:z.preprocess(value=>value===''?undefined:value,z.string().optional()), AI_MODEL:z.string().default('gpt-4o-mini'), RESUME_AI_PROVIDER:z.enum(['none','gemini','openai-compatible','apilayer']).default('none'), APILAYER_API_KEY:z.preprocess(value=>value===''?undefined:value,z.string().trim().min(1).optional()), GEMINI_API_KEY:z.preprocess(value=>value===''?undefined:value,z.string().trim().min(1).optional()), GEMINI_MODEL:z.string().default('gemini-3.1-flash-lite'), SERPAPI_KEY:z.preprocess(value=>value===''?undefined:value,z.string().trim().min(1).optional()), SERPAPI_URL:z.string().url().default('https://serpapi.com/search.json'),
});
export function loadConfig(env:NodeJS.ProcessEnv=process.env) {
 const v=envSchema.parse(env);
 const origins=v.WEB_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean);
 const extensionOrigins=v.EXTENSION_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean);
 for(const origin of origins) { const u=new URL(origin); if(u.origin!==origin || !['http:','https:'].includes(u.protocol)) throw new Error('WEB_ORIGINS must contain exact HTTP origins'); if(v.NODE_ENV==='production'&&u.protocol!=='https:') throw new Error('Production web origins require HTTPS'); }
 if(extensionOrigins.some(s=>!/^chrome-extension:\/\/[a-p]{32}$/.test(s))) throw new Error('EXTENSION_ORIGINS must contain exact Chrome extension origins');
  if(v.AI_BASE_URL && (!v.AI_API_KEY || new URL(v.AI_BASE_URL).protocol!=='https:')) throw new Error('AI provider requires HTTPS URL and API key');
  if(v.RESUME_AI_PROVIDER==='gemini'&&!v.GEMINI_API_KEY) throw new Error('Gemini resume parsing requires GEMINI_API_KEY');
  if(v.RESUME_AI_PROVIDER==='openai-compatible'&&(!v.AI_BASE_URL||!v.AI_API_KEY)) throw new Error('OpenAI-compatible resume parsing requires AI_BASE_URL and AI_API_KEY');
  if(new URL(v.SERPAPI_URL).protocol!=='https:' || new URL(v.SERPAPI_URL).hostname!=='serpapi.com') throw new Error('SERPAPI_URL must be the official HTTPS SerpApi endpoint');
 return {...v,origins,extensionOrigins};
}
export type Config=ReturnType<typeof loadConfig>;
