// Regressietest: de service worker moet altijd antwoorden op 'open-dashboard'.
// Zonder sendResponse sluit het kanaal en ziet de afzender
// "The message port closed before a response was received" — de fout die op de knop verscheen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function worker() {
  let listener;
  const tabs = [];
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener(fn) { listener = fn; } },
      getURL: (path) => 'chrome-extension://test/' + path,
    },
    tabs: {
      create({ url }, callback) {
        tabs.push(url);
        if (callback) callback({ id: tabs.length });
      },
    },
    storage: {
      local: {
        get(keys, callback) { callback({ poules: {}, pouleAliases: {} }); },
        set(values, callback) { callback && callback(); },
      },
    },
  };
  const context = {
    chrome,
    importScripts() {},
    PouleStorage: {
      merge(stored, incoming) {
        return { poules: incoming ? { [incoming.id]: incoming } : {}, pouleAliases: {}, pouleId: incoming && incoming.id };
      },
    },
    console,
    setTimeout,
    Promise,
  };
  vm.runInNewContext(readFileSync('extension/background.js', 'utf8'), context);
  return { tabs, listener };
}

test('open-dashboard antwoordt en opent precies één dashboardtabblad', async () => {
  const w = worker();
  let antwoord;
  const kanaalOpen = w.listener({ type: 'open-dashboard', pouleId: 'poule 1' }, {}, (r) => { antwoord = r; });
  assert.equal(kanaalOpen, true, 'listener moet true teruggeven zodat het antwoord verstuurd kan worden');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(antwoord.ok, true);
  assert.equal(antwoord.tabId, 1);
  assert.equal(w.tabs.length, 1);
  assert.match(w.tabs[0], /^chrome-extension:\/\/test\/dashboard\.html\?poule=poule%201$/);
});

test('open-dashboard-team antwoordt ook en geeft team mee', async () => {
  const w = worker();
  let antwoord;
  assert.equal(w.listener({ type: 'open-dashboard-team', pouleId: 'p', teamId: 't 2' }, {}, (r) => { antwoord = r; }), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(antwoord.ok, true);
  assert.equal(antwoord.tabId, 1);
  assert.match(w.tabs[0], /dashboard\.html\?poule=p&team=t%202$/);
});

test('opslaan antwoordt met het poule-id en onbekende berichten sluiten het kanaal', async () => {
  const w = worker();
  let antwoord;
  assert.equal(w.listener({ type: 'save-poule', poule: { id: 'x' } }, {}, (r) => { antwoord = r; }), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(antwoord.pouleId, 'x');
  assert.equal(w.listener({ type: 'iets-anders' }, {}, () => {}), false);
});
