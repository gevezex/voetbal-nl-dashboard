/**
 * Service worker: opent het dashboard voor een opgeslagen poule.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'open-dashboard') {
    const q = msg.pouleId ? '?poule=' + encodeURIComponent(msg.pouleId) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + q });
  }
  if (msg.type === 'open-dashboard-team') {
    const q =
      '?poule=' + encodeURIComponent(msg.pouleId) +
      '&team=' + encodeURIComponent(msg.teamId);
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') + q });
  }
  return false;
});
