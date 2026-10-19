import test from 'node:test';import assert from 'node:assert/strict';import {preview,SEEDS,addDays} from '../lib/menu.mjs';
const menus=SEEDS, positions={breakfast:0,lunch:0,dinner:0};
test('seeds have twenty independent rotations',()=>{for(const x of Object.values(SEEDS))assert.equal(x.length,20);});
test('Sunday skips without advancing',()=>{const p=preview({date:'2026-10-04',menus,positions,leaves:[]});assert.equal(p.skipped,true);assert.equal(p.reason,'Sunday');});
test('wraparound is independent',()=>{const p=preview({date:'2026-10-05',menus,positions:{breakfast:19,lunch:20,dinner:1},leaves:[]});assert.equal(p.meals.breakfast,SEEDS.breakfast[19]);assert.equal(p.meals.lunch,SEEDS.lunch[0]);assert.equal(p.meals.dinner,SEEDS.dinner[1]);});
test('morning/evening leaves suppress only their scope',()=>{const p=preview({date:'2026-10-05',menus,positions,leaves:[{start:'2026-10-05',end:'2026-10-05',scope:'morning',reason:'holiday'}]});assert.equal(p.meals.breakfast,null);assert.ok(p.meals.lunch);assert.ok(p.meals.dinner);});
test('date arithmetic',()=>assert.equal(addDays('2026-10-03',1),'2026-10-04'));
