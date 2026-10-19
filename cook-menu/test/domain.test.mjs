import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, load, addLeave } from '../lib/db.mjs';
import { createDispatcher } from '../lib/domain.mjs';
import { SEEDS } from '../lib/menu.mjs';

function store() { return openStore(':memory:'); }
const env = { ENABLE_SENDING: 'true' };

test('failed send leaves all rotation indices unchanged and a later success advances them', async () => {
  const db = store();
  const fail = createDispatcher({ db, env, send: async () => { throw new Error('offline'); } });
  await fail('2026-10-05');
  assert.deepEqual(load(db).positions, { breakfast: 0, lunch: 0, dinner: 0 });

  const succeed = createDispatcher({ db, env, send: async () => ({ idMessage: 'm-1' }) });
  await succeed('2026-10-05');
  assert.deepEqual(load(db).positions, { breakfast: 1, lunch: 1, dinner: 1 });
  assert.deepEqual(load(db).assignments.map(a => a.status), ['sent', 'sent', 'sent']);
});

test('leave present before dispatch suppresses only its slots and advances only sent slots', async () => {
  const db = store();
  addLeave(db, { start: '2026-10-06', end: '2026-10-06', scope: 'morning' });
  let message;
  const dispatch = createDispatcher({ db, env, send: async m => { message = m; return { idMessage: 'm-2' }; } });
  const result = await dispatch('2026-10-06');
  assert.equal(result.meals.breakfast, null);
  assert.doesNotMatch(message, /Breakfast:/);
  assert.doesNotMatch(message, /Lunch:/);
  assert.match(message, /Dinner:/);
  assert.deepEqual(load(db).positions, { breakfast: 0, lunch: 0, dinner: 1 });
});

test('leave added after send restores only affected slot rotation for future menus', async () => {
  const db = store();
  const dispatch = createDispatcher({ db, env, send: async () => ({ idMessage: 'm-3' }) });
  await dispatch('2026-10-07');
  assert.deepEqual(load(db).positions, { breakfast: 1, lunch: 1, dinner: 1 });
  addLeave(db, { start: '2026-10-07', end: '2026-10-07', scope: 'morning' }, new Date(Date.now() + 1000));
  assert.deepEqual(load(db).positions, { breakfast: 0, lunch: 0, dinner: 1 });
  const next = await dispatch('2026-10-08');
  assert.equal(next.meals.breakfast, SEEDS.breakfast[0]);
  assert.equal(next.meals.lunch, SEEDS.lunch[0]);
  assert.equal(next.meals.dinner, SEEDS.dinner[1]);
});

test('dispatching Sunday skips sending and does not advance indices', async () => {
  const db = store();
  let calls = 0;
  const dispatch = createDispatcher({ db, env, send: async () => { calls++; return { idMessage: 'never' }; } });
  const result = await dispatch('2026-10-04');
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
  assert.deepEqual(load(db).positions, { breakfast: 0, lunch: 0, dinner: 0 });
});
