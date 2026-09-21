// Regressietest voor de fout die de gebruiker zag:
//   content.js:318 [poule-dashboard] opslaan via de service worker mislukte, nu direct:
//   Error: Extension context invalidated.
// Zodra de extensie wordt bijgewerkt of opnieuw geladen, raakt een al geopend content script zijn
// context kwijt: elke chrome.*-aanroep faalt daarna met "Extension context invalidated" (en
// chrome.runtime.id verdwijnt). Opnieuw proberen helpt dan niet — de knop moet zeggen dat de
// pagina herladen moet worden, en er moet niet eerst een hele poule (inclusief selecties) worden
// ingelezen voor niets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup() {
  const nodes = new Map();
  const verzonden = [];
  let fetches = 0;
  let weg = false; // de extensie-context van dit tabblad

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
    querySelectorAll: () => [],
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
          if (sel === '.table-timetable' || sel === '.Playerlist' || sel === 'h3, .subtitle, .title') return [];
          // het competitiemenu van voetbal.nl
          return [
            { getAttribute: () => '/team/a/stand/comp0', querySelector: () => ({ textContent: 'Competitie najaar' }) },
            { getAttribute: () => '/team/a/stand/beker', querySelector: () => ({ textContent: 'Beker' }) },
          ];
        },
      };
    }
  }

  // In een verlopen context gooit elke chrome.*-aanroep "Extension context invalidated"
  // en is chrome.runtime.id verdwenen.
  const opgezegd = () => { throw new Error('Extension context invalidated.'); };
  const chrome = {
    runtime: {
      lastError: undefined,
      get id() { return weg ? undefined : 'testextensie'; },
      sendMessage(message, callback) {
        verzonden.push(message.type);
        if (weg) {
          if (callback) {
            chrome.runtime.lastError = { message: 'Extension context invalidated.' };
            callback(undefined);
            chrome.runtime.lastError = undefined;
          }
          return;
        }
        if (callback) callback({ ok: true });
      },
    },
    storage: {
      local: {
        get(keys, callback) {
          if (weg) return opgezegd();
          callback({ dashboardEnabled: true });
        },
        set(values, callback) {
          if (weg) return opgezegd();
          callback && callback();
        },
      },
      onChanged: { addListener() {} },
    },
  };

  const context = {
    document,
    location: { pathname: '/team/a' },
    chrome,
    MutationObserver: class { observe() {} },
    DOMParser: DOMParserStub,
    fetch(url) {
      fetches++;
      const pad = String(url);
      // Selecties duren even: zo kunnen we de extensie halverwege het inlezen laten bijwerken.
      const vertraging = /\/team\/[^/]+\/team$/.test(pad) ? 60 : 0;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true, status: 200, text: async () => '<html></html>' }), vertraging);
      });
    },
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(readFileSync('extension/poule-storage.js', 'utf8'), context);
  vm.runInNewContext(readFileSync('extension/poule-scrape.js', 'utf8'), context);
  vm.runInNewContext(readFileSync('extension/content.js', 'utf8'), context);

  return {
    nodes,
    verzonden,
    get button() { return nodes.get('vnd-poule-btn'); },
    aantalFetches: () => fetches,
    /** Bootst het bijwerken/herladen van de extensie na: dit tabblad is zijn context kwijt. */
    verbreekContext() { weg = true; },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const wacht = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wachtTot = async (voorwaarde, ms = 4000) => {
  for (let i = 0; i < ms / 25 && !voorwaarde(); i++) await wacht(25);
  return voorwaarde();
};

test('verlopen context: de knop vraagt om de pagina te herladen in plaats van "probeer opnieuw"', async () => {
  const app = setup();
  await flush();
  app.verbreekContext();

  await app.button.onclick();
  await flush();

  assert.match(app.button.textContent, /Herlaad deze pagina/);
  assert.doesNotMatch(app.button.textContent, /probeer opnieuw/i);
  assert.match(app.button.title, /F5/);
  assert.equal(app.button.disabled, false, 'de knop moet bruikbaar blijven');
  assert.equal(app.nodes.has('vnd-poule-menu'), false, 'geen menu openen met een dode context');
  assert.deepEqual(app.verzonden, [], 'geen bericht naar een verdwenen service worker');
});

test('context valt weg tijdens het inlezen: geen terugvalpad, maar de herlaadmelding', async () => {
  const app = setup();
  await flush();
  await app.button.onclick();
  await flush();

  const menu = app.nodes.get('vnd-poule-menu');
  assert.equal(menu.children.length, 2);
  menu.children[0].onclick(); // start het inlezen (selecties duren even)

  await wacht(20);
  assert.ok(app.aantalFetches() > 0, 'het inlezen is begonnen');
  app.verbreekContext();

  const klaar = await wachtTot(() => /Herlaad deze pagina/.test(app.button.textContent));
  assert.ok(klaar, 'knop toont de herlaadmelding, kreeg: ' + app.button.textContent);
  assert.doesNotMatch(app.button.textContent, /Extension context invalidated/);
  assert.doesNotMatch(app.button.textContent, /probeer opnieuw/i);
});

test('gezonde context: de knop werkt gewoon door', async () => {
  const app = setup();
  await flush();

  await app.button.onclick();
  await flush();

  const menu = app.nodes.get('vnd-poule-menu');
  assert.equal(menu.children.length, 2);
  assert.equal(app.button.textContent, '📊 Maak poule-dashboard');
  assert.equal(app.button.disabled, false);
  assert.deepEqual(app.verzonden, []);
});
