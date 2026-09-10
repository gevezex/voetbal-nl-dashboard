const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('extension/poule-storage.js', 'utf8');
const merge = vm.runInNewContext(code + '\nPouleStorage.merge');
const p = (id, updatedAt, extra = {}) => ({ id, ourTeamId: 'team-a', season: '2026/2027', competitionSlug: 'najaar', competition: 'Competitie najaar', updatedAt, matches: [], ...extra });

test('migration keeps the newest whole snapshot and maps both old links', () => {
  const old = p('old', '2026-09-01T12:00:00Z', { matches: [1, 2, 3] });
  const latest = p('new', '2026-09-10T12:00:00Z', { matches: [4] });
  for (const entries of [[old, latest], [latest, old]]) {
    const result = merge({ poules: Object.fromEntries(entries.map(p => [p.id, p])) });
    const values = Object.values(result.poules);
    assert.equal(values.length, 1);
    assert.equal(values[0].matches[0], 4);
    assert.equal(result.pouleAliases.old, values[0].id);
    assert.equal(result.pouleAliases.new, values[0].id);
    assert.equal(JSON.stringify(merge(result)), JSON.stringify(result));
  }
});

test('reimport updates one record; a late older import cannot overwrite it', () => {
  const first = merge({}, p('first', '2026-09-01T12:00:00Z'));
  const second = merge(first, p('second', '2026-09-10T12:00:00Z', { matches: [10] }));
  const late = merge(second, p('late', '2026-09-02T12:00:00Z'));
  assert.equal(first.pouleId, second.pouleId);
  assert.equal(Object.keys(late.poules).length, 1);
  assert.equal(late.poules[first.pouleId].matches[0], 10);
});

test('different team, competition and season stay separate', () => {
  const entries = [p('a', ''), p('b', '', { ourTeamId: 'team-b' }), p('c', '', { competitionSlug: 'beker' }), p('d', '', { season: '2025/2026' })];
  assert.equal(Object.keys(merge({ poules: Object.fromEntries(entries.map(p => [p.id, p])) }).poules).length, 4);
});

test('legacy timestamp fallback and incomplete records preserve data', () => {
  const entries = [p('team-1788000000000', undefined), p('team-1789000000000', undefined), p('unknown-a', '', { ourTeamId: null }), p('unknown-b', '', { ourTeamId: null })];
  const result = merge({ poules: Object.fromEntries(entries.map(p => [p.id, p])) });
  assert.equal(Object.keys(result.poules).length, 3);
  assert.ok(Object.values(result.poules).some(p => p.updatedAt === new Date(1789000000000).toISOString()));
});

test('worker serializes concurrent saves and reads', async () => {
  let stored = {};
  let handler;
  const context = vm.createContext({
    importScripts() {},
    chrome: {
      runtime: { onMessage: { addListener(fn) { handler = fn; } } },
      storage: { local: {
        get(keys, callback) { setTimeout(() => callback(structuredClone(stored)), 5); },
        set(value, callback) { setTimeout(() => { stored = structuredClone(value); callback(); }, 5); },
      } },
    },
  });
  vm.runInContext(code + '\n' + fs.readFileSync('extension/background.js', 'utf8'), context);
  const send = (message) => new Promise(resolve => assert.equal(handler(message, {}, resolve), true));
  await Promise.all([
    send({ type: 'save-poule', poule: p('a', '2026-09-10T12:00:00Z') }),
    send({ type: 'save-poule', poule: p('b', '2026-09-10T12:00:00Z', { competitionSlug: 'beker' }) }),
    send({ type: 'save-poule', poule: p('c', '2026-09-11T12:00:00Z', { matches: [12] }) }),
  ]);
  const result = await send({ type: 'get-poules' });
  assert.equal(Object.keys(result.poules).length, 2);
  assert.ok(Object.values(result.poules).some(p => p.matches[0] === 12));
});
