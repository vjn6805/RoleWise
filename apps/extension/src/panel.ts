import {stages,jobSchema,applicationSchema,type Career,type Job,type Analysis,type Evidence,type Draft,type Application} from '@career/shared';
import {Api} from './api';
import {capturePage,fillPage,type ReviewedPage} from './browser';
import {propose} from './mapping';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$(id) as HTMLInputElement;
const api=new Api();
const sourceRaw=new URL(location.href).searchParams.get('sourceTab');
const sourceTab=sourceRaw && /^\d+$/.test(sourceRaw)?Number(sourceRaw):undefined;
let career:Career|null=null, page:ReviewedPage|null=null, jobs:Job[]=[], applications:Application[]=[], selectedJob:Job|null=null;
let pendingFill:{id:string;value:string}[]=[];
let accountEpoch=0;
const fieldControls=new Map<string,{choice:HTMLInputElement;value:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement}>();
function showStatus(message:string,error=false) {$('status').hidden=false;$('status').textContent=message;$('status').dataset.error=String(error);}
function text(tag:string,value:string,className?:string) {const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;}
function listen(id:string,event:string,run:()=>Promise<void>|void) {
  $(id).addEventListener(event,async e=>{
    e.preventDefault();
    const node=$(id);const buttons=node instanceof HTMLButtonElement?[node]:Array.from(node.querySelectorAll<HTMLButtonElement>('button[type="submit"]'));
    const old=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
     try {await run();} catch(error) {if(!await api.session())clearAccount();if(id==='confirm-fill'&&!page)$<HTMLButtonElement>('fill').disabled=true;showStatus(error instanceof Error?error.message:'Something went wrong. Try again.',true);}
     finally {buttons.forEach((b,i)=>b.disabled=id==='confirm-fill' && !page ? true : (old[i] ?? false));}
  });
}
function links() {input('api-base').value=api.base;$<HTMLAnchorElement>('register-link').href=api.webUrl('/register');$<HTMLAnchorElement>('workspace-link').href=api.webUrl('/app');$('extension-id').textContent=`Extension origin: chrome-extension://${chrome.runtime.id} — allowlist this origin on your API.`;}
function citations(container:HTMLElement,evidence:Evidence[]) {
  container.append(text('h3','Verified profile evidence'));
  if (!evidence.length) container.append(text('p','No supporting verified evidence was found. Add and explicitly save profile details in your workspace.','hint'));
  for (const item of evidence) {const card=text('div','','citation');card.append(text('strong',item.label),text('p',item.excerpt),text('small',`${item.section} · ${item.id}`));container.append(card);}
}
function list(container:HTMLElement,title:string,items:string[]) {container.append(text('h3',title));if(!items.length){container.append(text('p','None identified.','hint'));return;}const ul=document.createElement('ul');for(const item of items) ul.append(text('li',item));container.append(ul);}
function renderAnalysis(analysis:Analysis) {
  const target=$('analysis');target.replaceChildren(text('span',`${analysis.source} · ${new Date(analysis.createdAt).toLocaleDateString()}`,'tag'));
  list(target,'Job requirements · untrusted source',analysis.requiredSkills);
  list(target,'Preferred skills · untrusted source',analysis.preferredSkills);
  list(target,'Qualifications · untrusted source',analysis.qualifications);
  list(target,'Experience requirements · untrusted source',analysis.experienceRequirements);
  list(target,'Job keywords',analysis.keywords);
  list(target,'Current exact skill matches',analysis.matchedSkills);
  list(target,'Not evidenced in your profile',analysis.missingSkills);
  list(target,'Responsibilities from job text',analysis.responsibilities);
  target.append(text('h3','Interpretation — not a career fact'),text('p',analysis.interpretation,'hint'));citations(target,analysis.evidence);
}
function fillJob(job:Pick<Job,'title'|'company'|'location'|'url'|'description'>) {for(const key of ['title','company','location','url','description'] as const) input(`job-${key}`).value=job[key];$('job-empty').hidden=true;}
function applicationForJob(){return applications.find(a=>a.jobId===selectedJob?.id);}
function renderApplication() {
  const existing=applicationForJob();input('stage').value=existing?.stage ?? 'Saved';input('application-notes').value=existing?.notes ?? '';input('follow-up').value=existing?.followUpAt ?? '';
  $('application-context').textContent=selectedJob?`${existing?'Tracking':'Start tracking'}: ${selectedJob.title}`:'Select a saved opportunity to track it.';
  $<HTMLButtonElement>('save-application').disabled=!selectedJob;$('save-application').textContent=existing?'Update application':'Save application';
}
function renderJobs() {
  const select=$<HTMLSelectElement>('saved-jobs');select.replaceChildren(new Option('Choose an opportunity',''));
  for(const job of jobs) select.add(new Option(`${job.title}${job.company?' · '+job.company:''}`,job.id));
  select.value=selectedJob?.id ?? '';$<HTMLButtonElement>('analyze').disabled=!selectedJob;renderApplication();
  $('assistant-context').textContent=selectedJob?`Current context: ${selectedJob.title}${selectedJob.company?' · '+selectedJob.company:''}`:'Current context: verified profile only. Save or select an opportunity to include it.';
}
function clearAccount() {
  accountEpoch++;career=null;jobs=[];applications=[];selectedJob=null;resetReview();
  $('account').hidden=false;$('connected').hidden=true;$('account-name').textContent='';
  $('answer').replaceChildren();$('analysis').replaceChildren();
  for(const key of ['title','company','location','url','description'])input(`job-${key}`).value='';
  input('question').value='';renderJobs();
}
async function loadAccount() {
  const epoch=++accountEpoch,auth=await api.session();if(epoch!==accountEpoch)return;
  if(!auth){clearAccount();return;}
  $('account').hidden=true;$('connected').hidden=false;$('account-name').textContent=auth.user.fullName || auth.user.email;
  const data=await Promise.all([api.request<Career>('/profile'),api.request<Job[]>('/jobs'),api.request<Application[]>('/applications')]);
  if(epoch!==accountEpoch)return;
  [career,jobs,applications]=data;renderJobs();
}
function resetReview() {page=null;pendingFill=[];fieldControls.clear();$('fields').replaceChildren(text('p','Capture an application page to review safe fields.','muted'));$<HTMLButtonElement>('fill').disabled=true;$('fill-confirm').hidden=true;}
function renderFields() {
  const target=$('fields');target.replaceChildren();fieldControls.clear();pendingFill=[];$('fill-confirm').hidden=true;
  if (!page?.capture.fields.length || !career) {target.append(text('p','No supported safe fields found. Embedded frames and custom widgets are not accessed.','muted'));$<HTMLButtonElement>('fill').disabled=true;return;}
  target.append(text('p',`${page.capture.fields.length} field(s) detected. None selected.`,'hint'));
  for(const field of page.capture.fields) {
    const proposal=propose(field,career),row=text('div','','field');
    const choice=document.createElement('input');choice.type='checkbox';choice.checked=false;choice.id=`choose-${field.id}`;
    const label=document.createElement('label');label.className='field-choice';label.htmlFor=choice.id;label.append(choice,text('span',field.label));
    let value:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
    if(field.kind==='select') {const select=document.createElement('select');select.add(new Option('Choose a value',''));for(const option of field.options)if(option)select.add(new Option(option,option));value=select;}
    else value=document.createElement(field.kind==='textarea'?'textarea':'input');
    value.value=proposal.value;value.setAttribute('aria-label',`Proposed value for ${field.label}`);
    const changed=()=>{$('fill-confirm').hidden=true;pendingFill=[];};choice.addEventListener('change',changed);value.addEventListener('input',changed);value.addEventListener('change',changed);
    row.append(label,value,text('small',proposal.source));if(field.value)row.append(text('small','This field already has a value. Review before replacing.'));target.append(row);fieldControls.set(field.id,{choice,value});
  }
  $<HTMLButtonElement>('fill').disabled=false;
}
for(const stage of stages)$<HTMLSelectElement>('stage').add(new Option(stage,stage));
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tab]'))button.addEventListener('click',()=>{for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-tab]')){const active=tab===button;tab.setAttribute('aria-pressed',String(active));$(`tab-${tab.dataset.tab}`).hidden=!active;}});
listen('settings-toggle','click',()=>{$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));});
listen('settings-form','submit',async()=>{await api.configure(input('api-base').value);links();resetReview();await loadAccount();showStatus('Backend permission saved. Your API must allowlist the extension origin shown above.');});
listen('login-form','submit',async()=>{const password=input('password').value;input('password').value='';await api.login(input('email').value,password);await loadAccount();showStatus('Connected. Capture a job when you are ready.');});
listen('logout','click',async()=>{clearAccount();try{await api.logout();showStatus('Signed out and session revoked.');}finally{clearAccount();}});
listen('capture','click',async()=>{
  showStatus('Reading visible page text and supported fields…');
  resetReview();const epoch=accountEpoch,captured=await capturePage(sourceTab),profile=await api.request<Career>('/profile');if(epoch!==accountEpoch)return;page=captured;career=profile;fillJob(page.capture);selectedJob=null;renderJobs();$('analysis').replaceChildren(text('p','Review and save this capture before analyzing.','hint'));renderFields();$('answer').replaceChildren();showStatus(page.capture.jobDetected===false?'Captured locally. No clear job posting detected; review all details. No fields were filled.':'Captured locally. Review details before saving. No fields were filled.');
});
listen('job-form','submit',async()=>{
  const data=jobSchema.parse(Object.fromEntries(['title','company','location','url','description'].map(key=>[key,input(`job-${key}`).value])));
  const epoch=accountEpoch,job=await api.request<Job>('/jobs',data);if(epoch!==accountEpoch)return;jobs.unshift(job);selectedJob=job;renderJobs();$('analysis').replaceChildren();$('answer').replaceChildren();showStatus('Opportunity saved. Ready for evidence-based analysis.');
});
listen('saved-jobs','change',async()=>{
  selectedJob=jobs.find(job=>job.id===input('saved-jobs').value) ?? null;renderJobs();$('analysis').replaceChildren();$('answer').replaceChildren();if(!selectedJob)return;fillJob(selectedJob);
  const epoch=accountEpoch,jobId=selectedJob.id;
  try{const analysis=await api.request<Analysis>(`/jobs/${jobId}/analysis`);if(epoch===accountEpoch && selectedJob?.id===jobId)renderAnalysis(analysis);}catch(error){$('analysis').append(text('p','No current analysis loaded. Run an analysis to compare this job with your verified profile.','hint'));showStatus(error instanceof Error?error.message:'Could not load analysis.',true);}
});
listen('analyze','click',async()=>{if(!selectedJob)throw new Error('Save or select an opportunity first.');const epoch=accountEpoch,jobId=selectedJob.id;showStatus('Comparing job requirements with verified evidence…');const analysis=await api.request<Analysis>(`/jobs/${jobId}/analyze`,{});if(epoch!==accountEpoch || selectedJob?.id!==jobId)return;renderAnalysis(analysis);showStatus('Analysis ready. Matches are supported by your saved profile, not inferred experience.');});
listen('application-form','submit',async()=>{
  if(!selectedJob)throw new Error('Select a saved opportunity first.');
  const epoch=accountEpoch,existing=applicationForJob();const data=applicationSchema.parse({jobId:selectedJob.id,stage:input('stage').value,notes:input('application-notes').value,followUpAt:input('follow-up').value});
  const app=existing?await api.request<Application>(`/applications/${existing.id}`,{stage:data.stage,notes:data.notes,followUpAt:data.followUpAt},'PATCH'):await api.request<Application>('/applications',data);
  if(epoch!==accountEpoch)return;
  applications=applications.filter(a=>a.id!==app.id);applications.unshift(app);renderApplication();showStatus('Application tracker saved. Nothing was submitted to an employer.');
});
listen('answer-form','submit',async()=>{
  const question=input('question').value.trim();if(!question)throw new Error('Enter a question.');showStatus('Finding verified evidence…');
  const epoch=accountEpoch,jobId=selectedJob?.id;
  const draft=await api.request<Draft>('/assist/answer',{question,...(jobId?{jobId}:{})});if(epoch!==accountEpoch || selectedJob?.id!==jobId)return;const target=$('answer');target.replaceChildren(text('h3','Grounded draft'),text('p',draft.answer,'answer-text'));
  for(const warning of draft.warnings)target.append(text('p',warning,'notice'));citations(target,draft.evidence);target.append(text('p',`Source: ${draft.source}. Review before using. Drafts are never inserted automatically.`,'hint'));showStatus('Answer ready with supporting evidence.');
});
listen('fill','click',()=>{
  pendingFill=Array.from(fieldControls).filter(([,c])=>c.choice.checked).map(([id,c])=>({id,value:c.value.value}));if(!pendingFill.length)throw new Error('Select at least one field. Nothing is preselected.');
  $('fill-summary').textContent=`Fill ${pendingFill.length} selected field(s) on ${page?new URL(page.capture.url).hostname:'the captured page'}? Existing values will be replaced.`;$('fill-confirm').hidden=false;$('confirm-fill').focus();
});
listen('cancel-fill','click',()=>{pendingFill=[];$('fill-confirm').hidden=true;});
listen('confirm-fill','click',async()=>{if($('fill-confirm').hidden || !page || !pendingFill.length)throw new Error('Capture, select fields, and review the confirmation first.');const reviewed=page,values=pendingFill;resetReview();const count=await fillPage(reviewed,values,sourceTab);showStatus(`${count} field(s) filled. Review the page yourself. Nothing was submitted by the extension.`);});
void (async()=>{try{await api.init();links();await loadAccount();}catch(error){showStatus(error instanceof Error?error.message:'Could not initialize extension.',true);}})();
