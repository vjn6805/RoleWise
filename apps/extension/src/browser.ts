import {pageBridge,type Capture,type PageResult,type FillRequest} from './page';
export type ReviewedPage={tabId:number;documentId?:string;capture:Capture};
export async function targetTab(sourceTab?:number):Promise<chrome.tabs.Tab> {
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});
  let tab=active;
  if (sourceTab!==undefined) {
    // The fallback is a separate extension tab, never an injected webpage overlay.
    const panel=await chrome.tabs.getCurrent();
    if (!panel?.id || active?.id!==panel.id) throw new Error('Return to this extension tab before capturing.');
    tab=await chrome.tabs.get(sourceTab);
  }
  if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) throw new Error('Open an ordinary job webpage, click the extension action, then Capture. Browser-internal and store pages cannot be accessed.');
  return tab;
}
export async function capturePage(sourceTab?:number):Promise<ReviewedPage> {
  const tab=await targetTab(sourceTab);
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id!,frameIds:[0]},world:'ISOLATED',func:pageBridge,args:[{action:'capture'}]});
  const result=results[0]?.result as PageResult|undefined;
  if (!result?.ok || !('capture' in result)) throw new Error(result && !result.ok?result.error:'Capture failed. Click the extension action on the job page to grant temporary access.');
  if (result.capture.url!==tab.url) throw new Error('Page navigated during capture. Try again.');
  if (!results[0]?.documentId || results[0].frameId!==0) throw new Error('This browser cannot safely bind a review to the main document. Update Chrome or Edge.');
  return {tabId:tab.id!,documentId:results[0].documentId,capture:result.capture};
}
export async function fillPage(page:ReviewedPage,values:FillRequest['values'],sourceTab?:number):Promise<number> {
  const tab=await targetTab(sourceTab);
  if (tab.id!==page.tabId || tab.url!==page.capture.url) throw new Error('Active tab changed. Capture and review again.');
  if (!page.documentId) throw new Error('Missing document review. Capture again.');
  const results=await chrome.scripting.executeScript({target:{tabId:page.tabId,documentIds:[page.documentId]},world:'ISOLATED',func:pageBridge,args:[{action:'fill',confirmed:true,token:page.capture.token,url:page.capture.url,values}]});
  if (results[0]?.documentId!==page.documentId || results[0]?.frameId!==0) throw new Error('The document changed. Capture again.');
  const result=results[0]?.result as PageResult|undefined;
  if (!result?.ok || !('filled' in result)) throw new Error(result && !result.ok?result.error:'The document changed. Capture again.');
  return result.filled;
}
