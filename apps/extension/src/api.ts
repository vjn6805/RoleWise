import type {AuthResponse} from '@career/shared';
export const DEFAULT_API='http://localhost:4000/api';
export function validateApiBase(raw:string):string {
  const url=new URL(raw.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error('API URL cannot contain credentials, query parameters or a fragment.');
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if (url.protocol!=='https:' && !(local && url.protocol==='http:')) throw new Error('Use HTTPS in production. HTTP is allowed only for localhost development.');
  if (!url.pathname.endsWith('/api') && !url.pathname.endsWith('/api/')) throw new Error('API base URL must end in /api.');
  return url.href.replace(/\/$/,'');
}
export function permissionOrigin(base:string):string {
  const url=new URL(validateApiBase(base));
  // Chrome match patterns cannot restrict ports. Never request a wildcard hostname.
  return `${url.protocol}//${url.hostname}/*`;
}
type Session=AuthResponse & {base:string};
export class Api {
  base=DEFAULT_API;
  async init() {const stored=await chrome.storage.local.get('apiBase');this.base=validateApiBase(stored.apiBase ?? DEFAULT_API);}
  async session():Promise<Session|null> {const data=await chrome.storage.session.get('auth');return data.auth?.base===this.base?data.auth:null;}
  async hasPermission() {return chrome.permissions.contains({origins:[permissionOrigin(this.base)]});}
  // Web Locks serialize rotation and logout across *all* open extension panels,
  // not just one Api instance. Refresh tokens are single-use on the server.
  private async locked<T>(run:()=>Promise<T>):Promise<T> {return await navigator.locks.request('career-extension-auth',run);}
  async configure(raw:string) {
    const next=validateApiBase(raw);
    // First await is the permission request, preserving the settings-save gesture.
    if (!await chrome.permissions.request({origins:[permissionOrigin(next)]})) throw new Error('Backend access was not granted. No requests were sent.');
    if (next!==this.base) {
      await this.logout();
      const previous=permissionOrigin(this.base);
      this.base=next;
      await chrome.storage.local.set({apiBase:next});
      if (previous!==permissionOrigin(next)) await chrome.permissions.remove({origins:[previous]});
    } else await chrome.storage.local.set({apiBase:next});
  }
  private async raw(path:string,body?:unknown,token?:string,method=body===undefined?'GET':'POST') {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new Error('Invalid API route.');
    if (!await this.hasPermission()) throw new Error('Open Settings and explicitly grant access to your API before connecting.');
    return fetch(`${this.base}${path}`,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Client':'extension',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  private async decode<T>(response:Response):Promise<T> {
    if (response.status===204) return undefined as T;
    const data=await response.json().catch(()=>null);
    if (!response.ok) throw new Error(data?.error?.message ?? `API request failed (${response.status}).`);
    return data as T;
  }
  async login(email:string,password:string):Promise<void> {
    await this.locked(async()=>{
      const auth=await this.decode<AuthResponse>(await this.raw('/auth/login',{email,password}));
      if (!auth?.accessToken || !auth.refreshToken) throw new Error('API did not return an extension session. Check X-Client support.');
      await chrome.storage.session.set({auth:{...auth,base:this.base}});
    });
  }
  private async refresh(rejectedAccessToken:string) {
    await this.locked(async()=>{
      const old=await this.session();
      if (!old?.refreshToken) throw new Error('Sign in again.');
      // Another request/panel may have rotated while this request was in flight.
      if (old.accessToken!==rejectedAccessToken) return;
      try {
        const next=await this.decode<AuthResponse>(await this.raw('/auth/refresh',{refreshToken:old.refreshToken}));
        if (!next?.accessToken || !next.refreshToken) throw new Error('Invalid rotated session.');
        await chrome.storage.session.set({auth:{...next,base:this.base}});
      } catch(error) {await chrome.storage.session.remove('auth');throw error;}
    });
  }
  async request<T>(path:string,body?:unknown,method?:string):Promise<T> {
    let auth=await this.session();
    if (!auth) throw new Error('Sign in to continue.');
    let response=await this.raw(path,body,auth.accessToken,method);
    if (response.status===401) {
      await this.refresh(auth.accessToken);auth=await this.session();
      if (!auth) throw new Error('Sign in again.');
      response=await this.raw(path,body,auth.accessToken,method);
      if (response.status===401) {
        const rejected=auth.accessToken;
        await this.locked(async()=>{if ((await this.session())?.accessToken===rejected) await chrome.storage.session.remove('auth');});
      }
    }
    return this.decode<T>(response);
  }
  async logout():Promise<void> {
    await this.locked(async()=>{
      const auth=await this.session();
      try {if (auth?.refreshToken) await this.decode(await this.raw('/auth/logout',{refreshToken:auth.refreshToken},auth.accessToken));}
      catch {throw new Error('Signed out locally. Server revocation could not be confirmed; the server session may remain valid until it expires.');}
      finally {await chrome.storage.session.remove('auth');}
    });
  }
  webUrl(path='') {const url=new URL(this.base);url.pathname=url.pathname.replace(/\/api\/?$/,'')+path;return url.href;}
}
