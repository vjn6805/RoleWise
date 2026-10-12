import type { AuthResponse } from '@career/shared';
let token: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;
let generation = 0;
export class ApiFailure extends Error { constructor(public status:number, message:string){super(message);} }
export function setToken(value:string|null){token=value;generation++;}
export function currentToken(){return token;}
async function failure(response:Response){const body=await response.json().catch(()=>null);return new ApiFailure(response.status,body?.error?.message || `Request failed (${response.status}). Please try again.`);}
export function refresh():Promise<AuthResponse>{
  if(!refreshPromise){const started=generation;refreshPromise=(async()=>{const response=await fetch('/api/auth/refresh',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw await failure(response);const data=await response.json() as AuthResponse;if(started===generation)token=data.accessToken;return data;})().finally(()=>{refreshPromise=null;});}
  return refreshPromise;
}
export async function request<T>(path:string, options:RequestInit={}, retry=true):Promise<T>{
  const sentToken=token;
  const headers=new Headers(options.headers);if(!(options.body instanceof FormData)&&options.body)headers.set('Content-Type','application/json');if(token)headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(`/api${path}`,{...options,headers,credentials:'include'});
  if(response.status===401&&retry&&!path.startsWith('/auth/')){try{if(token===sentToken)await refresh();return await request<T>(path,options,false);}catch(error){if(error instanceof ApiFailure&&error.status===401){setToken(null);window.dispatchEvent(new Event('session-expired'));}throw error;}}
  if(!response.ok)throw await failure(response);
  return response.status===204?undefined as T:await response.json() as T;
}
export const get=<T,>(path:string)=>request<T>(path);
export const send=<T,>(path:string,body:unknown,method='POST')=>request<T>(path,{method,body:JSON.stringify(body)});
export const remove=(path:string)=>request<void>(path,{method:'DELETE'});
export async function download(path:string,filename:string){
  async function run(retry:boolean):Promise<Blob>{const response=await fetch(`/api${path}`,{credentials:'include',headers:token?{Authorization:`Bearer ${token}`}:{}});if(response.status===401&&retry){await refresh();return run(false);}if(!response.ok)throw await failure(response);return response.blob();}
  saveBlob(await run(true),filename);
}
export function saveBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
