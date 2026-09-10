const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup(visible = false, enabled = true) {
  let onStorageChange;
  const nodes = new Map();
  const listeners = new Map();
  const options = ['Beker', 'Competitie najaar'].map((label, i) => ({
    getAttribute: name => name === 'href' ? '/team/a/stand/comp' + i : '',
    querySelector: () => ({ textContent: label }),
  }));
  let resolveFetch;
  let requests = 0;
  const document = {
    readyState: 'complete',
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    querySelectorAll: () => visible ? options : [],
    getElementById: id => nodes.get(id),
    createElement: () => ({ style: {}, children: [], contains(node) { return this === node || this.children.includes(node); }, focus() { this.focused = true; }, appendChild(child) { this.children.push(child); }, remove() { nodes.delete(this.id); } }),
    body: { appendChild(node) { nodes.set(node.id, node); }, contains(node) { return nodes.get(node.id) === node; } },
  };
  vm.runInNewContext(readFileSync('extension/content.js', 'utf8'), {
    document, location: { pathname: '/team/a' },
    chrome: { runtime: {}, storage: {
      local: { get(key, callback) { callback({ dashboardEnabled: enabled }); } },
      onChanged: { addListener(fn) { onStorageChange = fn; } },
    } },
    MutationObserver: class { observe() {} },
    DOMParser: class { parseFromString() { return { querySelectorAll: () => options }; } },
    fetch() { requests++; return new Promise(resolve => { resolveFetch = resolve; }); },
    setTimeout() {},
  });
  return {
    nodes, get button() { return nodes.get('vnd-poule-btn'); }, setEnabled(value) { onStorageChange({ dashboardEnabled: { newValue: value } }, 'local'); }, count: () => requests,
    emit(type, event) { for (const fn of listeners.get(type) || []) fn(event); },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
    finish(ok = true) { resolveFetch({ ok, status: 503, text: async () => 'page' }); },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('prefetch starts before click and cached menu opens without another request', async () => {
  const app = setup();
  assert.equal(app.count(), 1);
  app.finish();
  await flush();
  await app.button.onclick();
  assert.equal(app.nodes.get('vnd-poule-menu').children.length, 2);
  await app.button.onclick();
  assert.equal(app.count(), 1);
});

test('early clicks share prefetch and show immediate loading feedback', async () => {
  const app = setup();
  const click = app.button.onclick();
  assert.equal(app.button.disabled, true);
  assert.match(app.button.textContent, /Competities laden/);
  await app.button.onclick();
  assert.equal(app.count(), 1);
  app.finish();
  await click;
  assert.equal(app.button.disabled, false);
  assert.equal(app.nodes.get('vnd-poule-menu').children.length, 2);
});

test('visible competition choices require no network request', async () => {
  const app = setup(true);
  await app.button.onclick();
  assert.equal(app.count(), 0);
  assert.equal(app.nodes.get('vnd-poule-menu').children.length, 2);
});

test('failed discovery shows an error and next click retries', async () => {
  const app = setup();
  const click = app.button.onclick();
  app.finish(false);
  await click;
  assert.match(app.button.textContent, /Laden mislukt/);
  assert.equal(app.button.disabled, false);
  const retry = app.button.onclick();
  assert.equal(app.count(), 2);
  app.finish();
  await retry;
  assert.equal(app.nodes.get('vnd-poule-menu').children.length, 2);
});


test('outside click dismisses menu, inside click keeps it open, and listeners are cleaned up', async () => {
  const app = setup(true);
  await app.button.onclick();
  const menu = app.nodes.get('vnd-poule-menu');
  app.emit('click', { target: menu.children[0] });
  assert.equal(app.nodes.get('vnd-poule-menu'), menu);
  app.emit('click', { target: {} });
  assert.equal(app.nodes.has('vnd-poule-menu'), false);
  assert.equal(app.listenerCount(), 0);
  await app.button.onclick();
  assert.equal(app.listenerCount(), 2);
  app.emit('keydown', { key: 'Escape' });
  assert.equal(app.nodes.has('vnd-poule-menu'), false);
  assert.equal(app.button.focused, true);
  assert.equal(app.listenerCount(), 0);
});

test('clicking trigger again closes menu', async () => {
  const app = setup(true);
  await app.button.onclick();
  app.emit('click', { target: app.button });
  await app.button.onclick();
  assert.equal(app.nodes.has('vnd-poule-menu'), false);
  assert.equal(app.listenerCount(), 0);
});


test('stored off setting hides UI and does not prefetch; switching on and off updates live', async () => {
  const app = setup(true, false);
  assert.equal(app.button, undefined);
  assert.equal(app.count(), 0);
  app.setEnabled(true);
  await app.button.onclick();
  assert.ok(app.nodes.has('vnd-poule-menu'));
  app.setEnabled(false);
  assert.equal(app.button, undefined);
  assert.equal(app.nodes.has('vnd-poule-menu'), false);
  assert.equal(app.listenerCount(), 0);
});

test('switching off during discovery prevents menu reappearing when request finishes', async () => {
  const app = setup();
  const click = app.button.onclick();
  app.setEnabled(false);
  app.finish();
  await click;
  assert.equal(app.button, undefined);
  assert.equal(app.nodes.has('vnd-poule-menu'), false);
  app.setEnabled(true);
  await app.button.onclick();
  assert.equal(app.nodes.get('vnd-poule-menu').children.length, 2);
});
