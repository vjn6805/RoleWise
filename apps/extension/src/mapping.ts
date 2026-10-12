import type {Career} from '@career/shared';
import type {PageField} from './page';
export type Proposal = {value:string;source:string};
/** No inferred dates, experience, eligibility, names, or skill proficiency. */
export function propose(field:PageField, career:Career):Proposal {
  const label=field.label.toLowerCase().replace(/[_-]/g,' ');
  const autocomplete=field.autocomplete.toLowerCase();
  const p=career.profile;
  let value='',source='No exact verified mapping — review manually';
  const use=(candidate:string,property:string) => {value=candidate;source=`Saved profile · ${property}`;};
  if (autocomplete==='given-name' || autocomplete==='family-name' || /first\s*name|last\s*name|middle\s*name|surname/.test(label)) return {value,source:'Name components are not stored; enter manually'};
  if (autocomplete==='name' || /full\s*name|your\s*name|applicant\s*name/.test(label)) use(p.fullName,'full name');
  else if (autocomplete==='email' || /\be\s?mail\b/.test(label)) use(p.email,'email');
  else if (autocomplete==='tel' || /\bphone\b|\btelephone\b/.test(label)) use(p.phone,'phone');
  else if (/\blocation\b/.test(label) && !/relocat|prefer|desired|work|office/.test(label)) use(p.location,'location');
  else if (/\bheadline\b/.test(label)) use(p.headline,'headline');
  else if (/\bsummary\b|\babout yourself\b/.test(label)) use(p.summary,'summary');
  else if (/\bskills\b/.test(label) && field.kind!=='select') {
    value=career.sections.skills.filter(e=>e.verified===true && e.source==='user').map(e=>e.label).join(', ');
    source='Verified skill labels only (no inferred proficiency)';
  } else if (/linkedin|github|portfolio|website/.test(label)) {
    const candidates=career.sections.links.filter(e=>e.verified===true && e.source==='user' && e.url && ['linkedin','github','portfolio','website'].some(word=>label.includes(word) && e.label.toLowerCase().includes(word)));
    if (candidates.length===1) {value=candidates[0]!.url;source=`Verified link · ${candidates[0]!.label}`;}
  }
  if (field.kind==='select' && value && !field.options.includes(value)) return {value:'',source:'No exact select option matches the verified value'};
  return {value,source};
}
