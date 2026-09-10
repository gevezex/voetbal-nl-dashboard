importScripts('poule-storage.js');

// Serialize read/modify/write operations, including simultaneous imports from tabs.
let storageQueue = Promise.resolve();
function updatePoules(incoming, clear = false) {
  const operation = storageQueue.then(async () => {
    const stored = await new Promise((resolve, reject) => {
      chrome.storage.local.get(['poules', 'pouleAliases'], (data) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(data);
      });
    });
    const result = clear ? { poules: {}, pouleAliases: {} } : PouleStorage.merge(stored, incoming);
    const next = { poules: result.poules, pouleAliases: result.pouleAliases };
    if (JSON.stringify(next) !== JSON.stringify({ poules: stored.poules || {}, pouleAliases: stored.pouleAliases || {} })) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set(next, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    }
    return result;
  });
  storageQueue = operation.catch(() => {});
  return operation;
}

/**
 * Service worker: opent het dashboard voor een opgeslagen poule.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'get-poules' || msg.type === 'save-poule' || msg.type === 'clear-poules') {
    updatePoules(msg.type === 'save-poule' ? msg.poule : undefined, msg.type === 'clear-poules')
      .then(sendResponse, (error) => sendResponse({ error: error.message }));
    return true;
  }
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
