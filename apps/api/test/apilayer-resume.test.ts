import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAPILayerResume, parseAPILayerResume } from '../src/apilayer-resume.js';
import { config } from './helpers.js';

const text=`Alex River\nEmail: alex@example.test\nMobile: +91-7485963139\nSkills Summary\nPython, React\nEducation\nManipal University Jaipur\nBachelor of Technology; CGPA 9.46 Aug 2023 - May 2027\nProfessional Experience\nExample Labs\nSoftware Engineering Intern May 2025 - Jul 2025`;
const data={name:'Alex River',email:'alex@example.test',phone:'+91-7485963139',skills:['Python','React','Invented Skill'],education:[{name:'Manipal University Jaipur',dates:'2023 - 2027'}],experience:[{title:'Software Engineering Intern',organization:'Example Labs',dates:'2025'}]};
afterEach(()=>vi.unstubAllGlobals());

describe('APILayer resume upload parsing',()=>{
 it('posts stored file bytes with the server key and normalizes grounded suggestions',async()=>{
  const file=Buffer.from('original file bytes');const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
  vi.stubGlobal('fetch',fetchMock);
  const parsed=await parseAPILayerResume({...config(),RESUME_AI_PROVIDER:'apilayer',APILAYER_API_KEY:'test-only-key'},file,text);
  expect(fetchMock).toHaveBeenCalledWith('https://api.apilayer.com/resume_parser/upload',expect.objectContaining({method:'POST',body:new Uint8Array(file),headers:{apikey:'test-only-key','Content-Type':'application/octet-stream'},redirect:'error'}));
  expect(parsed.source).toBe('apilayer');expect(parsed.profile).toMatchObject({fullName:'Alex River',email:'alex@example.test',phone:'+91-7485963139'});
  expect(parsed.entries.filter(entry=>entry.section==='skills').map(entry=>('label' in entry.input?entry.input.label:''))).toEqual(['Python','React']);
  expect(parsed.entries.find(entry=>entry.section==='education')?.input).toMatchObject({institution:'Manipal University Jaipur',startDate:'2023-01-01',endDate:'2027-01-01'});
  expect(parsed.entries.find(entry=>entry.section==='experience')?.input).toMatchObject({label:'Software Engineering Intern',organization:'Example Labs',startDate:'2025-01-01'});
  expect(JSON.stringify(parsed)).not.toContain('Invented Skill');expect(JSON.stringify(parsed)).not.toContain('test-only-key');
 });
  it('rejects malformed responses and does not generate unsupported sections',()=>{
   expect(()=>normalizeAPILayerResume({name:'Alex',skills:'Python'},text)).toThrow();
   expect(()=>normalizeAPILayerResume({status:'ok',data:{name:'Alex River'}},text)).toThrow();
   const parsed=normalizeAPILayerResume({name:'Alex River'},text);expect(parsed.entries).toEqual([]);expect(parsed.warnings.join(' ')).toContain('projects');
  });
  it('grounds skills on complete words, not substrings of other skills',()=>{
   const parsed=normalizeAPILayerResume({skills:['Java','JavaScript']},'JavaScript');
   expect(parsed.entries.map(entry=>('label' in entry.input?entry.input.label:''))).toEqual(['JavaScript']);
  });
 it('requires a configured backend key without contacting the provider',async()=>{
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await expect(parseAPILayerResume({...config(),RESUME_AI_PROVIDER:'apilayer'},Buffer.from('resume'),text)).rejects.toMatchObject({code:'RESUME_PARSER_NOT_CONFIGURED'});
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it.each([[401,'RESUME_PARSER_AUTH'],[429,'RESUME_PARSER_LIMIT'],[500,'RESUME_PARSER_UNAVAILABLE']])('returns actionable error on HTTP %s',async(status,code)=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('provider failure',{status})));
  await expect(parseAPILayerResume({...config(),RESUME_AI_PROVIDER:'apilayer',APILAYER_API_KEY:'test-only-key'},Buffer.from('resume'),text)).rejects.toMatchObject({code});
 });
});
