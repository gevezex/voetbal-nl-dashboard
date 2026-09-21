// Regressietest voor het foutpad dat de gebruiker zag:
// de service worker antwoordt niet op 'save-poule' ("The message port closed…") → de poule moet
// alsnog in chrome.storage belanden (terugvalpad) en de knop moet netjes herstellen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup() {
  const nodes = new Map();
  const schrijfacties = [];
  const verzonden = [];
  let resolveFetch;

  const maakKnoop = (extra = {}) => ({
    textContent: '', children: [], style: {}, disabled: false,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild(child) { this.children.push(child); },
    remove() { nodes.delete(this.id); },
    contains(node) { return this === node || this.children.includes(node); },
    focus() { this.focused = true; },
    removeAttribute(name) { delete this[name]; },
    ...extra,
  });

  // Stand-tabel met twee teams; geen programma/uitslagen; geen selecties.
  const standRijen = [
    { id: 'a', naam: 'FC Test O13-2', pos: '1' },
    { id: 'b', naam: 'SC Tegenstander O13-1', pos: '2' },
  ].map((t) => ({
    getAttribute: (naam) => (naam === 'href' ? '/team/' + t.id : null),
    querySelector: (sel) => {
      if (sel === '.value.team') return { textContent: t.naam };
      if (sel === '.value.position') return { textContent: t.pos };
      return null;
    },
  }));

  const document = {
    title: 'FC Test O13-2 Zaterdag | Voetbal.nl',
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll: (sel) => (sel === '.ScheduleResults-viewSelectTrigger' ? [] : []),
    getElementById: (id) => nodes.get(id),
    createElement: () => maakKnoop(),
    body: {
      appendChild(node) { nodes.set(node.id, node); },
      contains(node) { return nodes.get(node.id) === node; },
    },
  };

  class DOMParserStub {
    parseFromString() {
      return {
        querySelectorAll: (sel) => {
          if (sel === '.table-standingstable .row') return standRijen;
          if (sel === '.table-timetable') return [];
          if (sel === '.Playerlist') return [];
          if (sel === 'h3, .subtitle, .title') return [];
          // competitiemenu van voetbal.nl
          return [
            { getAttribute: () => '/team/a/stand/comp0', querySelector: () => ({ textContent: 'Competitie najaar' }) },
            { getAttribute: () => '/team/a/stand/beker', querySelector: () => ({ textContent: 'Beker' }) },
          ];
        },
      };
    }
  }

  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message, callback) {
        verzonden.push(message.type);
        // De service worker antwoordt niet: precies de fout die de gebruiker zag.
        setImmediate(() => {
          if (!callback) return;
          chrome.runtime.lastError = { message: 'The message port closed before a response was received.' };
          callback(undefined);
          chrome.runtime.lastError = undefined;
        });
      },
    },
    storage: {
      local: {
        get(keys, callback) { callback({ dashboardEnabled: true }); },
        set(values, callback) { schrijfacties.push(values); callback && callback(); },
      },
      onChanged: { addListener() {} },
    },
  };

  vm.runInNewContext(readFileSync('extension/poule-storage.js', 'utf8'), {});
  const context = {
    document,
    location: { pathname: '/team/a' },
    chrome,
    MutationObserver: class { observe() {} },
    DOMParser: DOMParserStub,
    fetch(url) {
      const pad = String(url);
      // Selectiepagina's van teams: die mogen falen (selectie is optioneel).
      if (/\/team\/[^/]+\/team$/.test(pad)) return Promise.reject(new Error('geen selectie'));
      // Voorladen van de competitielijst lossen we pas later op (zoals in de echte flow).
      if (pad === '/team/a/stand') return new Promise((resolve) => { resolveFetch = resolve; });
      // De stand-/programma-/uitslagen-tabbladen zijn meteen beschikbaar.
      return Promise.resolve({ ok: true, status: 200, text: async () => '<html></html>' });
    },
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(readFileSync('extension/poule-storage.js', 'utf8'), context);
  vm.runInNewContext(readFileSync('extension/content.js', 'utf8'), context);

  return {
    nodes, schrijfacties, verzonden,
    get button() { return nodes.get('vnd-poule-btn'); },
    finishFetch() { resolveFetch({ ok: true, status: 200, text: async () => '<html></html>' }); },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const wacht = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('poule wordt alsnog opgeslagen als de service worker niet antwoordt', async () => {
  const app = setup();
  await flush();
  app.finishFetch(); // voorladen van de competitielijst
  await flush();
  await app.button.onclick(); // menu openen
  await flush();

  const menu = app.nodes.get('vnd-poule-menu');
  assert.equal(menu.children.length, 2);
  menu.children[0].onclick(); // start het inlezen

  // Het inlezen is async (fetch + terugvalpad): wachten tot de schrijfactie er is.
  for (let i = 0; i < 60 && app.schrijfacties.length === 0; i++) await wacht(50);

  assert.equal(app.schrijfacties.length, 1, 'verwacht precies één terugvalschrijfactie');
  const { poules, pouleAliases } = app.schrijfacties[0];
  const ids = Object.keys(poules);
  assert.equal(ids.length, 1);
  assert.match(ids[0], /^poule:\["a","\d{4}\/\d{4}","comp0"\]$/);
  assert.equal(poules[ids[0]].ourTeamId, 'a');
  assert.equal(poules[ids[0]].teams.length, 2);
  assert.equal(poules[ids[0]].teams[0].name, 'FC Test O13-2');
  assert.equal(Object.keys(pouleAliases).length, 0);

  // De knop herstelt en de extensie blijft bruikbaar.
  for (let i = 0; i < 40 && app.button.textContent !== '📊 Maak poule-dashboard'; i++) await wacht(50);
  assert.equal(app.button.textContent, '📊 Maak poule-dashboard');
  assert.equal(app.button.disabled, false);
  assert.ok(app.verzonden.includes('save-poule'));
});

test('voortgang op de knop tijdens het inlezen van de selecties', async () => {
  const app = setup();
  await flush();
  app.finishFetch();
  await flush();
  await app.button.onclick();
  await flush();

  const menu = app.nodes.get('vnd-poule-menu');
  menu.children[0].onclick();
  await wacht(20);
  assert.match(app.button.textContent, /Poule ophalen|Teams inlezen/);
});
