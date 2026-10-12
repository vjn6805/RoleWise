export type PageField = {id:string;label:string;kind:string;autocomplete:string;value:string;options:string[]};
export type Capture = {token:string;url:string;title:string;company:string;location:string;description:string;fields:PageField[];jobDetected?:boolean};
export type FillRequest = {action:'fill';confirmed:true;token:string;url:string;values:{id:string;value:string}[]};
export type PageRequest = {action:'capture'} | FillRequest;
export type PageResult = {ok:true;capture:Capture} | {ok:true;filled:number} | {ok:false;error:string};

/** Entire function is serialized by chrome.scripting. Keep all runtime helpers inside it. */
export function pageBridge(request:PageRequest):PageResult {
  type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  type Saved = {node:Control;parent:Element|null;form:HTMLFormElement|null;signature:string;original:string};
  type State = {token:string;url:string;fields:Map<string,Saved>};
  const context = globalThis as typeof globalThis & {__careerCopilotCapture?:State};
  const blocked = /password|passcode|social\s*security|\bssn\b|national\s*id|passport|driver.?s?\s*licen[cs]e|bank|credit\s*card|debit|routing|salary|compensation|pay\s*(?:expect|range)|wage|income|gender|\bsex\b|sexual|race|racial|ethnic|religio|disabil|veteran|military|marital|pregnan|birth|\bdob\b|\bage\b|citizenship|nationality|visa|sponsor|authoriz|eligible|eligibility|legal|consent|agree|terms|privacy|signature|criminal|convict|background\s*check|medical|health|emergency|tax|clearance|accommodation|demographic|pronoun|\beeo\b|equal\s*opportunit|affirmative\s*action|protected\s*status/i;
  const clean = (text:string|null|undefined, max=250) => (text ?? '').replace(/\s+/g,' ').trim().slice(0,max);
  const label = (el:Control) => {
    const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    return clean([...(el.labels ? Array.from(el.labels).map(l=>l.textContent ?? ''):[]),el.getAttribute('aria-label'),...ids.map(id=>document.getElementById(id)?.textContent),el.getAttribute('placeholder'),el.name,el.id].filter(Boolean).join(' '));
  };
  const visible = (el:Element) => {
    if (!el.isConnected || !el.getClientRects().length) return false;
    for (let current:Element|null=el;current;current=current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hasAttribute('hidden') || current.hasAttribute('inert') || current.getAttribute('aria-hidden')==='true' || style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse' || style.opacity==='0') return false;
    }
    return true;
  };
  const eligible = (el:Control) => {
    if (!visible(el) || el.disabled || el.matches(':disabled') || el.getAttribute('aria-disabled')==='true' || el.hasAttribute('readonly') || el.getAttribute('aria-readonly')==='true') return false;
    if (el instanceof HTMLInputElement && !['text','email','tel','url'].includes(el.type)) return false;
    if (el instanceof HTMLSelectElement && el.multiple) return false;
    const contextLabel = el.closest('fieldset')?.querySelector('legend')?.textContent ?? '';
    // Check untruncated metadata: a very long benign label must not hide a sensitive suffix.
    const metadata = [label(el),...(el.labels?Array.from(el.labels).map(l=>l.textContent):[]),el.getAttribute('aria-label'),el.getAttribute('placeholder'),...(el.getAttribute('aria-labelledby')??'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent),el.name,el.id,el.getAttribute('autocomplete'),contextLabel].join(' ');
    return !!label(el) && !blocked.test(metadata);
  };
  const signature = (el:Control) => JSON.stringify([el.tagName,el.getAttribute('type'),el.name,el.id,label(el),el.getAttribute('autocomplete'),el.getAttribute('maxlength'),el.closest('fieldset')?.querySelector('legend')?.textContent,el instanceof HTMLSelectElement ? Array.from(el.options).map(o=>[o.value,o.text,o.disabled]):[]]);
  if (!/^https?:$/.test(location.protocol)) return {ok:false,error:'Only ordinary HTTP(S) pages can be captured.'};
  if (request.action==='capture') {
    const token = crypto.randomUUID();
    const state:State = {token,url:location.href,fields:new Map()};
    const fields:PageField[] = [];
    for (const node of Array.from(document.querySelectorAll<Control>('input,textarea,select'))) {
      if (fields.length >= 60) break;
      if (!eligible(node)) continue;
      const id = crypto.randomUUID();
      state.fields.set(id,{node,parent:node.parentElement,form:node.form,signature:signature(node),original:node.value});
      fields.push({id,label:label(node),kind:node instanceof HTMLSelectElement?'select':node instanceof HTMLTextAreaElement?'textarea':node.type,autocomplete:node.getAttribute('autocomplete') ?? '',value:node.value.slice(0,5000),options:node instanceof HTMLSelectElement?Array.from(node.options).filter(o=>!o.disabled).map(o=>o.value).slice(0,300):[]});
    }
    context.__careerCopilotCapture = state;
    const root = document.querySelector('main, [role="main"], article') ?? document.body;
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const parts:string[] = [];
    let length=0, scanned=0;
    for (let text=walker.nextNode();text && length<30000 && scanned<12000;text=walker.nextNode()) {
      scanned++;
      const parent=text.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,input,select,button,[contenteditable],nav,footer') || !visible(parent)) continue;
      const value=clean(text.textContent,3000);
      if (value) {parts.push(value);length+=value.length+1;}
    }
    const titleNode=Array.from(document.querySelectorAll('h1')).find(visible);
    const title=clean(titleNode?.textContent ?? document.title,200);
    const locationNode=Array.from(document.querySelectorAll('[itemprop="jobLocation"], [data-testid="job-location"], .job-location')).find(visible);
    const companyNode=Array.from(document.querySelectorAll('[itemprop="hiringOrganization"], [data-testid="company-name"], .company-name')).find(visible);
    const description=parts.join('\n').slice(0,30000);
    // A conservative hint only; never treat structured scripts or page instructions as trusted data.
    const jobDetected=!!(companyNode || locationNode) || /\b(job description|responsibilities|qualifications|requirements|apply for|employment|hiring)\b/i.test(description);
    return {ok:true,capture:{token,url:location.href,title,company:clean(companyNode?.textContent,200),location:clean(locationNode?.textContent,200),description,fields,jobDetected}};
  }
  if (request.action!=='fill' || request.confirmed!==true) return {ok:false,error:'Explicit fill confirmation is required.'};
  const state=context.__careerCopilotCapture;
  if (!state || request.token!==state.token || request.url!==state.url || location.href!==state.url) return {ok:false,error:'Page context changed. Capture and review again.'};
  if (!request.values.length || request.values.length>60 || new Set(request.values.map(v=>v.id)).size!==request.values.length) return {ok:false,error:'Invalid field selection.'};
  const targets:{node:Control;value:string}[]=[];
  // Validate every target before modifying any target.
  for (const item of request.values) {
    const saved=state.fields.get(item.id);
    if (!saved || saved.node.parentElement!==saved.parent || saved.node.form!==saved.form || !eligible(saved.node) || saved.signature!==signature(saved.node) || saved.node.value!==saved.original) return {ok:false,error:'A field changed, was replaced, or is no longer safe. Capture again.'};
    if (typeof item.value!=='string' || item.value.length>5000 || /[\r\n]/.test(item.value) && saved.node instanceof HTMLInputElement) return {ok:false,error:'Invalid field value.'};
    if ((saved.node instanceof HTMLInputElement || saved.node instanceof HTMLTextAreaElement) && saved.node.maxLength>=0 && item.value.length>saved.node.maxLength) return {ok:false,error:'Value exceeds field length.'};
    if (saved.node instanceof HTMLSelectElement && !Array.from(saved.node.options).some(o=>o.value===item.value && !o.disabled && !(o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled))) return {ok:false,error:'Select option is unavailable.'};
    targets.push({node:saved.node,value:item.value});
  }
  // Consume the review: a repeat fill always requires a new capture.
  delete context.__careerCopilotCapture;
  let filled=0;
  for (const {node,value} of targets) {
    // Page event handlers can mutate later fields; fail closed again between writes.
    const saved=Array.from(state.fields.values()).find(s=>s.node===node)!;
    if (location.href!==state.url || node.parentElement!==saved.parent || node.form!==saved.form || !eligible(node) || signature(node)!==saved.signature || node.value!==saved.original) return {ok:false,error:`Page changed during filling. ${filled} field(s) filled; capture again.`};
    const prototype=node instanceof HTMLSelectElement?HTMLSelectElement.prototype:node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
    if (!setter) return {ok:false,error:'Native field setter unavailable.'};
    setter.call(node,value);
    // Use the isolated world's prototype, not an own method a page could override.
    EventTarget.prototype.dispatchEvent.call(node,new Event('input',{bubbles:true}));
    EventTarget.prototype.dispatchEvent.call(node,new Event('change',{bubbles:true}));
    filled++;
  }
  return {ok:true,filled};
}
