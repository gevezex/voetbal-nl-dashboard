const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function popup(stored) {
  const nodes = new Map(['dashboard-enabled', 'enabled-hint', 'clear-poules', 'status', 'poules'].map(id => [id, { textContent: '', disabled: false, querySelectorAll: () => [] }]));
  const messages = [];
  vm.runInNewContext(fs.readFileSync('extension/popup.js', 'utf8'), {
    document: { getElementById: id => nodes.get(id) },
    chrome: {
      runtime: { sendMessage(message, callback) {
        messages.push(message.type);
        if (message.type === 'clear-poules') { stored.poules = {}; stored.pouleAliases = {}; }
        callback?.({ poules: stored.poules || {} });
      } },
      storage: {
        local: { get(key, callback) { callback(stored); }, set(values, callback) { Object.assign(stored, values); callback(); } },
        onChanged: { addListener() {} },
      },
    },
  });
  return { nodes, messages };
}

test('popup switch persists both states across reopening', () => {
  const stored = {};
  let app = popup(stored);
  let toggle = app.nodes.get('dashboard-enabled');
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  toggle.onchange();
  assert.equal(stored.dashboardEnabled, false);
  app = popup(stored);
  toggle = app.nodes.get('dashboard-enabled');
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggle.onchange();
  assert.equal(popup(stored).nodes.get('dashboard-enabled').checked, true);
});

test('remove all clears history, refreshes empty state and preserves disabled setting', () => {
  const stored = { dashboardEnabled: false, poules: { a: { name: 'Team A', season: '2026/2027' } } };
  const app = popup(stored);
  const clear = app.nodes.get('clear-poules');
  assert.equal(clear.disabled, false);
  clear.onclick();
  assert.ok(app.messages.includes('clear-poules'));
  assert.equal(clear.disabled, true);
  assert.match(app.nodes.get('poules').innerHTML, /Nog geen poules opgeslagen/);
  assert.equal(stored.dashboardEnabled, false);
});
