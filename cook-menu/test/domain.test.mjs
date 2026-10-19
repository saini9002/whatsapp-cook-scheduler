import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, load, addLeave, setMealEnabled, setMealSettings, setMealActive } from '../lib/db.mjs';
import { createDispatcher, retryTargetDate, nextMessageDate, isPermanentSendFailure } from '../lib/domain.mjs';
import { SEEDS, makeMessage, preview } from '../lib/menu.mjs';

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

test('only failed assignments are retried; pending and unknown remain idempotent', async () => {
  const db = store(); let calls = 0;
  const dispatch = createDispatcher({ db, env, send: async () => { calls++; return { idMessage: 'retry-1' }; } });
  await dispatch('2026-10-05');
  db.prepare("UPDATE assignments SET status='pending' WHERE slot='breakfast'").run();
  db.prepare("UPDATE assignments SET status='unknown' WHERE slot='lunch'").run();
  db.prepare("UPDATE assignments SET status='failed' WHERE slot='dinner'").run();
  await dispatch('2026-10-05');
  assert.equal(calls, 2);
  assert.equal(load(db).assignments.find(a=>a.slot==='breakfast').status, 'pending');
  assert.equal(load(db).assignments.find(a=>a.slot==='lunch').status, 'unknown');
  assert.equal(load(db).assignments.find(a=>a.slot==='dinner').status, 'sent');
});

test('disabled meals stay out of previews and persist without advancing', async () => {
  const db = store(); setMealEnabled(db, 'breakfast', 0, false);
  const loaded = load(db);
  const p = preview({date:'2026-10-05', menus:loaded.menus, positions:loaded.positions, mealEnabled:loaded.mealEnabled});
  assert.equal(p.meals.breakfast, SEEDS.breakfast[1]);
  const dispatch = createDispatcher({db, env, send: async () => ({idMessage:'meal-1'})});
  await dispatch('2026-10-05');
  assert.equal(load(db).mealEnabled.breakfast[0], false);
  assert.equal(load(db).positions.breakfast, 1);
  assert.match(makeMessage(p), /^\*Menu for 2026-10-05\*/);
});

test('meal settings can be saved together with the menu', () => {
  const db = store(); setMealSettings(db, {breakfast: new Array(20).fill(false)});
  assert.equal(load(db).mealEnabled.breakfast.every(v => v === false), true);
});

test('meal active status is independent from individual dish settings', () => {
  const db = store(); setMealEnabled(db, 'breakfast', 0, false); setMealActive(db, 'breakfast', true);
  const loaded = load(db); assert.equal(loaded.mealActive.breakfast, true); assert.equal(loaded.mealEnabled.breakfast[0], false);
  const p = preview({date:'2026-10-05', menus:loaded.menus, positions:loaded.positions, leaves:[], mealEnabled:loaded.mealEnabled, mealActive:loaded.mealActive});
  assert.equal(p.meals.breakfast, SEEDS.breakfast[1]);
});

test('leave attribution is retained, including past leaves, and affects future preview', () => {
  const db = store(); addLeave(db, {start:'2026-01-01', end:'2026-01-02', scope:'all', attribution:'household'});
  const leave = load(db).leaves[0];
  assert.equal(leave.attribution, 'household');
  assert.equal(preview({date:'2026-01-01', menus:load(db).menus, positions:load(db).positions, leaves:load(db).leaves}).skipped, true);
});

test('retry date crosses midnight to the original menu date', () => {
  assert.equal(retryTargetDate(new Date('2026-10-05T23:00:00+05:30')), '2026-10-06');
  assert.equal(retryTargetDate(new Date('2026-10-06T04:45:00+05:30')), '2026-10-06');
});

test('next message date skips Sunday and full-day leave', () => {
  const db = store();
  addLeave(db, {start:'2026-10-06', end:'2026-10-06', scope:'all'});
  assert.equal(nextMessageDate('2026-10-04', load(db)), '2026-10-05');
  assert.equal(nextMessageDate('2026-10-06', load(db)), '2026-10-07');
});

test('permanent provider errors need attention and are not retried', async () => {
  const db = store(); let calls=0; let alert;
  const dispatch=createDispatcher({db,env,send:async()=>{calls++;const e=new Error('bad token');e.status=401;throw e;},notify:async x=>{alert=x;}});
  await dispatch('2026-10-05'); await dispatch('2026-10-05');
  assert.equal(calls,1); assert.equal(load(db).assignments.every(a=>a.status==='attention'),true); assert.equal(alert.date,'2026-10-05'); assert.equal(isPermanentSendFailure({status:401}),true); assert.equal(isPermanentSendFailure({status:503}),false);
});
