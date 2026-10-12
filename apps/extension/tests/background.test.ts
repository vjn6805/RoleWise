import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
let clicked:(tab:{id?:number})=>void,installed:()=>void;
beforeEach(async()=>{
  vi.resetModules();
  vi.stubGlobal('chrome',{runtime:{onInstalled:{addListener:vi.fn(callback=>{installed=callback;})},onMessage:{addListener:vi.fn()},onMessageExternal:{addListener:vi.fn()},getURL:vi.fn(path=>`chrome-extension://extension-id/${path}`)},storage:{session:{setAccessLevel:vi.fn(async()=>{})}},action:{onClicked:{addListener:vi.fn(callback=>{clicked=callback;})}},sidePanel:{open:vi.fn(async()=>{})},tabs:{create:vi.fn(async()=>({}))},scripting:{executeScript:vi.fn()}});
  await import('../src/background');
});
describe('action-only background boundary',()=>{
  it('keeps session storage unavailable to content scripts',()=>{installed();expect(chrome.storage.session.setAccessLevel).toHaveBeenCalledWith({accessLevel:'TRUSTED_CONTEXTS'});});
  it('opens a native side panel without injecting or capturing',()=>{clicked({id:4});expect(chrome.sidePanel.open).toHaveBeenCalledWith({tabId:4});expect(chrome.scripting.executeScript).not.toHaveBeenCalled();expect(chrome.tabs.create).not.toHaveBeenCalled();});
  it('falls back to a separate extension tab on unsupported browsers',async()=>{vi.mocked(chrome.sidePanel.open).mockRejectedValue(new Error('unsupported'));clicked({id:7});await vi.waitFor(()=>expect(chrome.tabs.create).toHaveBeenCalledWith({url:'chrome-extension://extension-id/panel.html?sourceTab=7'}));expect(chrome.scripting.executeScript).not.toHaveBeenCalled();});
  it('supports browsers without the sidePanel API',()=>{Object.assign(chrome,{sidePanel:undefined});clicked({id:9});expect(chrome.tabs.create).toHaveBeenCalledWith({url:'chrome-extension://extension-id/panel.html?sourceTab=9'});});
  it('ignores an action without a tab id',()=>{clicked({});expect(chrome.sidePanel.open).not.toHaveBeenCalled();expect(chrome.tabs.create).not.toHaveBeenCalled();});
  it('has no message listener that a page can use to capture or fill',()=>{expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();expect(chrome.runtime.onMessageExternal.addListener).not.toHaveBeenCalled();});
  it('ships no content script or always-on website host access',()=>{const manifest=JSON.parse(readFileSync('manifest.json','utf8'));expect(manifest.permissions).toEqual(['activeTab','scripting','storage','sidePanel']);expect(manifest.host_permissions).toBeUndefined();expect(manifest.content_scripts).toBeUndefined();expect(manifest.externally_connectable).toBeUndefined();expect(manifest.web_accessible_resources).toBeUndefined();expect(manifest.optional_host_permissions).toEqual(['https://*/*','http://localhost/*','http://127.0.0.1/*']);expect(manifest.content_security_policy.extension_pages).not.toContain('unsafe');});
});
