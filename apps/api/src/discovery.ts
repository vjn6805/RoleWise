import type { JobSearchResult, Career } from '@career/shared';
import type { Config } from './config.js';
import { fail } from './db.js';

function text(value:unknown,max=50000){return typeof value==='string'?value.trim().slice(0,max):'';}
export async function discoverJobs(config:Config,career:Career,query:string):Promise<JobSearchResult[]>{
 if(!config.SERPAPI_KEY)fail(503,'JOB_SEARCH_NOT_CONFIGURED','Configure SERPAPI_KEY to search external job listings. You can still capture jobs with the browser extension or save them manually.');
 const skillQuery=career.sections.skills.slice(0,8).map(skill=>skill.label).join(' ');
 const location=career.profile.location?` in ${career.profile.location}`:'';
 const q=[query.trim(),skillQuery,location].filter(Boolean).join(' ').slice(0,300);
 const url=new URL(config.SERPAPI_URL);url.searchParams.set('engine','google_jobs');url.searchParams.set('q',q);url.searchParams.set('api_key',config.SERPAPI_KEY);url.searchParams.set('num','20');
 const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});if(!response.ok)fail(502,'JOB_SEARCH_UNAVAILABLE','The configured job search provider is unavailable.');
 const body=await response.json() as {jobs_results?:unknown[]};if(!Array.isArray(body.jobs_results))return [];
 const skills=career.sections.skills.map(skill=>skill.label).filter(Boolean);
 return body.jobs_results.slice(0,20).map((raw:any,index)=>{const apply=Array.isArray(raw.apply_options)?raw.apply_options[0]?.link:'';const title=text(raw.title,200),description=text(raw.description);const matchedSkills=skills.filter(skill=>new RegExp(`(^|[^a-z0-9])${skill.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z0-9+#])`,'i').test(`${title} ${description}`));return {externalId:text(raw.job_id,200)||`${title}-${index}`,title,company:text(raw.company_name,200),location:text(raw.location,200),url:text(apply||raw.share_link||raw.link,2048),description,source:'serpapi' as const,score:skills.length?Math.round(matchedSkills.length/skills.length*100):0,matchedSkills};}).filter(job=>job.title&&job.description&&job.url).sort((a,b)=>b.score-a.score);
}
