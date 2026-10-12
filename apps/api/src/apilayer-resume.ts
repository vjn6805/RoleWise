import { z } from 'zod';
import { educationSchema, entrySchema, profileSchema, type EducationInput, type ResumeParseResult, type ResumeSuggestion } from '@career/shared';
import type { Config } from './config.js';
import { fail } from './db.js';

const endpoint='https://api.apilayer.com/resume_parser/upload';
const item=z.object({name:z.string().nullish(),title:z.string().nullish(),dates:z.string().nullish(),location:z.string().nullish(),organization:z.string().nullish()}).passthrough();
const responseSchema=z.object({name:z.string().nullish(),email:z.string().nullish(),phone:z.string().nullish(),mobile_number:z.string().nullish(),skills:z.array(z.string()).max(500).nullish(),education:z.array(item).max(100).nullish(),experience:z.array(item).max(100).nullish()}).passthrough().refine(data=>['name','email','phone','mobile_number','skills','education','experience'].some(key=>Object.hasOwn(data,key)));
const compact=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const literal=(value:string,text:string)=>!!compact(value)&&` ${compact(text)} `.includes(` ${compact(value)} `);
const year=(value:string,text:string)=>{const match=value.match(/\b(?:19|20)\d{2}\b/);return match&&literal(match[0],text)?`${match[0]}-01-01`:'';};
const qualification=(value:string):EducationInput['qualificationType']=>/\b10th\b|\bssc\b/i.test(value)?'10th':/\b12th\b|\bhsc\b/i.test(value)?'12th/HSC':/diploma/i.test(value)?'Diploma':/doctorate|phd/i.test(value)?'Doctorate':/master|m\.tech|mba|mca/i.test(value)?'Master’s':/bachelor|b\.tech|bca|bba|b\.com/i.test(value)?'Bachelor’s':'Other';
function excerpt(value:string,text:string){const line=text.split(/\r?\n/).find(line=>literal(value,line));return (line??value).trim().slice(0,2000);}
function context(value:string,text:string){const lines=text.split(/\r?\n/),index=lines.findIndex(line=>literal(value,line));return index<0?'':lines.slice(Math.max(0,index-1),Math.min(index+3,lines.length)).join(' ');}

export function normalizeAPILayerResume(raw:unknown,text:string):ResumeParseResult{
 const parsed=responseSchema.safeParse(raw);
 if(!parsed.success)fail(502,'RESUME_PARSER_RESPONSE','Resume parser returned an invalid response. Try again later.');
 const data=parsed.data,profile:Record<string,string>={},entries:ResumeSuggestion[]=[],seen=new Set<string>();
 if(data.name&&literal(data.name,text))profile.fullName=data.name.trim().slice(0,160);
 if(data.email&&literal(data.email,text))profile.email=data.email.trim();
 const phone=data.phone??data.mobile_number;
 if(phone&&literal(phone,text))profile.phone=phone.trim().slice(0,50);
 const add=(section:ResumeSuggestion['section'],input:ResumeSuggestion['input'],source:string)=>{
  const key=`${section}:${'label' in input?input.label:input.institution}`.toLowerCase();
  if(seen.has(key))return;
  seen.add(key);entries.push({section,input,excerpt:excerpt(source,text),confidence:'medium'});
 };
 for(const skill of data.skills??[]){if(!literal(skill,text))continue;const input=entrySchema.safeParse({label:skill.trim(),position:entries.length});if(input.success)add('skills',input.data,skill);}
 for(const education of data.education??[]){const institution=(education.name??education.organization??'').trim();if(!literal(institution,text))continue;
  const dates=education.dates??'',years=[...dates.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match=>match[0]!),near=context(institution,text);
  const input=educationSchema.safeParse({qualificationType:qualification(institution),institution,startDate:years[0]?year(years[0],near):'',endDate:years[1]?year(years[1],near):'',passingYear:years.length&&literal(years.at(-1)!,near)?Number(years.at(-1)):null,position:entries.length});
  if(input.success)add('education',input.data,institution);
 }
 for(const experience of data.experience??[]){const title=(experience.title??'').trim(),organization=(experience.organization??'').trim();if(!literal(title,text))continue;
  const dates=experience.dates??'',years=[...dates.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match=>match[0]!),near=context(title,text);
  const input=entrySchema.safeParse({label:title,organization:literal(organization,near)?organization:'',startDate:years[0]?year(years[0],near):'',endDate:years[1]?year(years[1],near):'',position:entries.length});
  if(input.success)add('experience',input.data,title);
 }
 const checked=profileSchema.partial().safeParse(profile);
 return {source:'apilayer',profile:checked.success?checked.data:{},entries,warnings:['APILayer suggestions are unverified. Review and edit before saving. Fields not supported by its response, including projects, bullet points and most links, remain in the extracted text for manual review.',...(entries.length||Object.keys(profile).length?[]:['No grounded profile fields were returned. Review the extracted text yourself.'])],createdAt:new Date().toISOString()};
}

export async function parseAPILayerResume(config:Config,content:Buffer,text:string):Promise<ResumeParseResult>{
 if(!config.APILAYER_API_KEY)fail(503,'RESUME_PARSER_NOT_CONFIGURED','Set APILAYER_API_KEY in the backend environment and restart the API.');
 let response:Response;
 try{response=await fetch(endpoint,{method:'POST',headers:{apikey:config.APILAYER_API_KEY,'Content-Type':'application/octet-stream'},body:new Uint8Array(content),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{fail(502,'RESUME_PARSER_UNAVAILABLE','Resume parser could not be reached. Try again later.');}
 if(!response.ok){if(response.status===401||response.status===403)fail(502,'RESUME_PARSER_AUTH','APILayer rejected the configured key or subscription. Check your APILayer account.');if(response.status===429)fail(503,'RESUME_PARSER_LIMIT','APILayer rate limit or quota reached. Try again later.');fail(502,'RESUME_PARSER_UNAVAILABLE','Resume parser returned an error. Try again later.');}
 const reader=response.body?.getReader();if(!reader)fail(502,'RESUME_PARSER_RESPONSE','Resume parser returned an empty response.');
 const chunks:Uint8Array[]=[];let size=0,oversized=false;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256000){oversized=true;break;}chunks.push(part.value);}}catch{fail(502,'RESUME_PARSER_UNAVAILABLE','Resume parser response was interrupted. Try again later.');}finally{await reader.cancel().catch(()=>{});}
 if(oversized)fail(502,'RESUME_PARSER_RESPONSE','Resume parser returned an oversized response.');
 const payload=Buffer.concat(chunks).toString('utf8');
 let data:unknown;try{data=JSON.parse(payload);}catch{fail(502,'RESUME_PARSER_RESPONSE','Resume parser returned invalid JSON.');}
 return normalizeAPILayerResume(data,text);
}
