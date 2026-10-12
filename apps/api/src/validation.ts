import { fail } from './db.js';
// Shared schemas describe the wire contract; these checks reject calendar rollover and malformed URLs.
export function validateFields<T extends {url?:string;startDate?:string;endDate?:string;appliedAt?:string;followUpAt?:string;interviewAt?:string}>(value:T):T {
 for(const field of ['startDate','endDate','appliedAt','followUpAt','interviewAt'] as const){const date=value[field];if(date){const parsed=new Date(`${date}T00:00:00.000Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)fail(400,'VALIDATION_ERROR',`${field}: Invalid calendar date`);}}
 if(value.url){try{const url=new URL(value.url);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||/[\u0000-\u0020\u007f]/.test(value.url))throw new Error();}catch{fail(400,'VALIDATION_ERROR','url: Use an HTTP or HTTPS URL without credentials or whitespace');}}
 return value;
}
