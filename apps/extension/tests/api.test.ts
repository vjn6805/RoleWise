import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Api,DEFAULT_API,permissionOrigin,validateApiBase} from '../src/api';
let session:Record<string,unknown>,local:Record<string,unknown>;
const auth={accessToken:'old-access',refreshToken:'old-refresh',user:{id:'u',email:'a@example.test',fullName:'Alex',active:true},base:DEFAULT_API};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{
  session={auth:{...auth}};local={};
  const storage=(data:Record<string,unknown>)=>({get:vi.fn(async(key:string)=>({[key]:data[key]})),set:vi.fn(async(value:Record<string,unknown>)=>{Object.assign(data,value);}),remove:vi.fn(async(key:string)=>{delete data[key];})});
  vi.stubGlobal('chrome',{storage:{local:storage(local),session:storage(session)},permissions:{contains:vi.fn(async()=>true),request:vi.fn(async()=>true),remove:vi.fn(async()=>true)}});
  let queue=Promise.resolve();
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn((_name:string,run:()=>Promise<unknown>)=>{const next=queue.then(run);queue=next.then(()=>undefined,()=>undefined);return next;})}});
  vi.stubGlobal('fetch',vi.fn());
});
describe('backend permission boundaries',()=>{
  it.each(['http://api.example.com/api','ftp://localhost/api','https://u:p@example.com/api','https://example.com/api?token=x','https://example.com/api#secret','https://example.com/'])('rejects unsafe API URL %s',url=>expect(()=>validateApiBase(url)).toThrow());
  it('permits HTTPS or exact localhost HTTP and narrows permission to a hostname',()=>{expect(validateApiBase(' https://api.example.com/api/ ')).toBe('https://api.example.com/api');expect(validateApiBase(DEFAULT_API)).toBe(DEFAULT_API);expect(permissionOrigin(DEFAULT_API)).toBe('http://localhost/*');expect(permissionOrigin('https://api.example.com:8443/api')).toBe('https://api.example.com/*');});
  it('requests permissions only on explicit configure and not init',async()=>{const api=new Api();await api.init();expect(chrome.permissions.request).not.toHaveBeenCalled();await api.configure(DEFAULT_API);expect(chrome.permissions.request).toHaveBeenCalledWith({origins:['http://localhost/*']});expect(local).toEqual({apiBase:DEFAULT_API});expect(fetch).not.toHaveBeenCalled();});
  it('does not send network traffic after a denied grant',async()=>{vi.mocked(chrome.permissions.request).mockImplementation(async()=>false);await expect(new Api().configure('https://example.com/api')).rejects.toThrow('not granted');expect(fetch).not.toHaveBeenCalled();expect(local).toEqual({});});
  it('blocks network without existing backend permission',async()=>{vi.mocked(chrome.permissions.contains).mockImplementation(async()=>false);await expect(new Api().login('a@example.test','secret')).rejects.toThrow('explicitly grant');expect(fetch).not.toHaveBeenCalled();});
  it('changes origin only after logout and removes old origin permission',async()=>{vi.mocked(fetch).mockResolvedValue(new Response(null,{status:204}));const api=new Api();await api.configure('https://api.example.com/api');expect(api.base).toBe('https://api.example.com/api');expect(session.auth).toBeUndefined();expect(chrome.permissions.remove).toHaveBeenCalledWith({origins:['http://localhost/*']});expect(fetch).toHaveBeenCalledWith(DEFAULT_API+'/auth/logout',expect.objectContaining({credentials:'omit',redirect:'error',body:JSON.stringify({refreshToken:'old-refresh'})}));});
});
describe('session-only authentication and rotation',()=>{
  it('stores login tokens in session only and omits cookies',async()=>{delete session.auth;vi.mocked(fetch).mockResolvedValue(json(auth));await new Api().login('a@example.test','secret');expect(session.auth).toEqual(auth);expect(local).toEqual({});expect(fetch).toHaveBeenCalledWith(DEFAULT_API+'/auth/login',expect.objectContaining({credentials:'omit',redirect:'error',cache:'no-store',headers:expect.objectContaining({'X-Client':'extension'})}));});
  it('does not use a session issued to another API',async()=>{session.auth={...auth,base:'https://other.test/api'};await expect(new Api().request('/profile')).rejects.toThrow('Sign in');expect(fetch).not.toHaveBeenCalled();});
  it('rotates exactly once for parallel requests across panel instances',async()=>{
    vi.mocked(fetch).mockImplementation(async(url,options)=>{
      if(String(url).endsWith('/auth/refresh'))return json({...auth,accessToken:'new-access',refreshToken:'new-refresh'});
      return (options?.headers as Record<string,string>).Authorization==='Bearer old-access'?json({error:{message:'expired'}},401):json({ok:true});
    });
    await expect(Promise.all([new Api().request('/profile'),new Api().request('/jobs'),new Api().request('/applications')])).resolves.toEqual([{ok:true},{ok:true},{ok:true}]);
    expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/auth/refresh'))).toHaveLength(1);expect(session.auth).toMatchObject({refreshToken:'new-refresh'});
  });
  it('clears a rejected refresh session and does not replay stale tokens',async()=>{vi.mocked(fetch).mockResolvedValue(json({error:{message:'Revoked'}},401));await expect(new Api().request('/profile')).rejects.toThrow('Revoked');expect(session.auth).toBeUndefined();expect(fetch).toHaveBeenCalledTimes(2);});
  it('clears auth if the rotated access token is also rejected',async()=>{vi.mocked(fetch).mockImplementation(async url=>String(url).endsWith('/auth/refresh')?json({...auth,accessToken:'new',refreshToken:'new-refresh'}):json({error:{message:'unauthorized'}},401));await expect(new Api().request('/profile')).rejects.toThrow('unauthorized');expect(session.auth).toBeUndefined();expect(fetch).toHaveBeenCalledTimes(3);});
  it('always clears local session when server logout fails and reports uncertainty',async()=>{vi.mocked(fetch).mockRejectedValue(new Error('offline'));await expect(new Api().logout()).rejects.toThrow('revocation could not be confirmed');expect(session.auth).toBeUndefined();});
  it('does not resurrect auth when logout overlaps refresh',async()=>{
    let resolveRefresh!:(response:Response)=>void,refreshStarted!:()=>void;
    const started=new Promise<void>(resolve=>{refreshStarted=resolve;});
    vi.mocked(fetch).mockImplementation(async url=>{
      if(String(url).endsWith('/auth/refresh')){refreshStarted();return new Promise<Response>(resolve=>{resolveRefresh=resolve;});}
      if(String(url).endsWith('/auth/logout'))return new Response(null,{status:204});
      return json({error:{message:'expired'}},401);
    });
    const request=new Api().request('/profile').catch(()=>undefined);await started;
    const logout=new Api().logout();resolveRefresh(json({...auth,accessToken:'new',refreshToken:'rotated'}));
    await Promise.all([request,logout]);expect(session.auth).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/auth/logout'))?.[1]?.body).toBe(JSON.stringify({refreshToken:'rotated'}));
  });
});
