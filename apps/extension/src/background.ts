export {};
// No content scripts, listeners on webpage navigation, or automatic capture.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
});
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const fallback = () => chrome.tabs.create({url:chrome.runtime.getURL(`panel.html?sourceTab=${tab.id}`)});
  if (chrome.sidePanel?.open) {
    // Invoke synchronously inside the browser action's user gesture.
    void chrome.sidePanel.open({tabId:tab.id}).catch(() => fallback());
  } else void fallback();
});
