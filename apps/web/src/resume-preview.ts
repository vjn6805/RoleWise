import type { EntryInput, EducationInput, Profile, Section } from '@career/shared';

export type SuggestedEntry={section:Section;input:EntryInput|EducationInput;excerpt:string};
const headings:Record<string,Section>={education:'education','academic background':'education',experience:'experience','work experience':'experience','professional experience':'experience',internships:'experience',projects:'projects','personal projects':'projects',skills:'skills','technical skills':'skills',certifications:'certifications',achievements:'achievements',links:'links'};
const urlPattern=/https?:\/\/[^\s<>]+/gi;
const dateRange=/(\d{4})\s*(?:-|–|to)\s*(\d{4}|present|current)/i;
const year=(value:string)=>`-${value}-01-01`;
const clean=(value:string)=>value.replace(/[.,;)]*$/,'');
function qualification(line:string):EducationInput['qualificationType']|null{if(/\b10(?:th|\s+ssc)\b/i.test(line))return '10th';if(/\b12(?:th|\s+hsc|\s+intermediate)\b/i.test(line))return '12th/HSC';if(/diploma/i.test(line))return 'Diploma';if(/\b(phd|doctorate)\b/i.test(line))return 'Doctorate';if(/\b(master|m\.s\.|m\.tech|mba|mca)\b/i.test(line))return 'Master’s';if(/\b(bachelor|b\.s\.|b\.tech|bca|bba|b\.com|college|university)\b/i.test(line))return 'Bachelor’s';return null;}
export function previewResume(text:string):{profile:Partial<Profile>;entries:SuggestedEntry[]}{
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),profile:Partial<Profile>={},entries:SuggestedEntry[]=[],seen=new Set<string>();
 const email=text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];if(email)profile.email=email;
 const phone=text.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/)?.[0];if(phone)profile.phone=phone;
 const first=lines[0];if(first&&!/@|https?:\/\//i.test(first)&&first.split(/\s+/).length>=2)profile.fullName=first;
 const add=(section:Section,input:EntryInput|EducationInput,excerpt:string)=>{const key=`${section}:${'label' in input?input.label:input.institution}`.toLowerCase();if(!seen.has(key)){seen.add(key);entries.push({section,input,excerpt});}};
 for(const match of text.matchAll(urlPattern)){const url=clean(match[0]);try{const host=new URL(url).hostname.toLowerCase();add('links',{label:host.includes('linkedin')?'LinkedIn':host.includes('github')?'GitHub':host,organization:'',description:'',startDate:'',endDate:'',url,position:0},match[0]);if(host.includes('linkedin'))profile.headline=profile.headline??'LinkedIn profile';}catch{/* malformed links remain reference text */}}
 let section:Section|null=null;
 for(let i=0;i<lines.length&&entries.length<100;i++){const line=lines[i]!,key=line.replace(/:$/,'').toLowerCase();if(headings[key]){section=headings[key];continue;}if(!section||line.length>240||line.includes('@')||/^https?:\/\//i.test(line))continue;
   if(section==='education'){const q=qualification(line);if(q){const range=line.match(dateRange);const grade=line.match(/(?:cgpa|gpa)\s*[:=-]?\s*(\d+(?:\.\d+)?)|(?:percentage|percent|%)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);const board=line.match(/\b(CBSE|ICSE|IB|Cambridge|State Board|University)\b/i)?.[1]??'';const institution=lines[i+1]&&!qualification(lines[i+1]!)?lines[i+1]!:line;add('education',{qualificationType:q,institution:institution.slice(0,200),board,specialization:'',startDate:range?year(range[1]!):'',endDate:range&&/^\d{4}$/.test(range[2]!)?year(range[2]!):'',passingYear:range&&/^\d{4}$/.test(range[2]!)?Number(range[2]):null,percentage:grade&&grade[2]?Number(grade[2]):null,cgpa:grade&&grade[1]?Number(grade[1]):null,url:'',position:0},line);}}else if(section==='skills'){for(const item of line.replace(/^[^:]{1,30}:\s*/,'').split(/[,|•]/)){const label=item.trim();if(label&&label.length<80)add('skills',{label,organization:'',description:'',startDate:'',endDate:'',url:'',position:0},line);}}else if(!/^[-•*]/.test(line)){add(section,{label:line,organization:'',description:'',startDate:'',endDate:'',url:'',position:0},line);}
 }
 return {profile,entries};
}
