import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { SEEDS, SLOTS, leaveApplies, inRange } from './menu.mjs';

export function openStore(file='data/cook-menu.sqlite') {
 mkdirSync(dirname(file),{recursive:true}); const db=new DatabaseSync(file);
 db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS menus(slot TEXT PRIMARY KEY, items TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS leaves(id TEXT PRIMARY KEY,start TEXT NOT NULL,end TEXT NOT NULL,scope TEXT NOT NULL,reason TEXT); CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY,date TEXT NOT NULL,slot TEXT NOT NULL,dish TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT,created_at TEXT NOT NULL, rotation_restored INTEGER NOT NULL DEFAULT 0, UNIQUE(date,slot)); CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,date TEXT,status TEXT,message TEXT,created_at TEXT);`);
 if(!db.prepare("SELECT 1 FROM pragma_table_info('assignments') WHERE name='rotation_restored'").get()) db.exec('ALTER TABLE assignments ADD COLUMN rotation_restored INTEGER NOT NULL DEFAULT 0');
 const count=db.prepare('SELECT COUNT(*) n FROM menus').get().n; if(!count) for(const s of SLOTS) db.prepare('INSERT INTO menus VALUES(?,?)').run(s,JSON.stringify(SEEDS[s]));
 if(!db.prepare('SELECT 1 FROM meta WHERE key=?').get('positions')) db.prepare('INSERT INTO meta VALUES(?,?)').run('positions',JSON.stringify({breakfast:0,lunch:0,dinner:0}));
 return db;
}
export function load(db){const menus={};for(const r of db.prepare('SELECT * FROM menus').all())menus[r.slot]=JSON.parse(r.items);const positions=JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get('positions').value);return {menus,positions,leaves:db.prepare('SELECT id,start,end,scope,reason FROM leaves ORDER BY start').all(),assignments:db.prepare('SELECT * FROM assignments ORDER BY created_at DESC').all(),history:db.prepare('SELECT id,date,status,message,created_at createdAt FROM history ORDER BY created_at DESC LIMIT 50').all()};}
export function saveMenus(db,menus){for(const s of SLOTS)db.prepare('UPDATE menus SET items=? WHERE slot=?').run(JSON.stringify(menus[s]),s);}
export function setPositions(db,p){db.prepare('UPDATE meta SET value=? WHERE key=?').run(JSON.stringify(p),'positions');}
export function addLeave(db,l,now=new Date()){const id=randomUUID();db.prepare('INSERT INTO leaves(id,start,end,scope,reason) VALUES(?,?,?,?,?)').run(id,l.start,l.end,l.scope,l.reason||'');const p=JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get('positions').value);const assignments=db.prepare("SELECT id,date,slot,created_at FROM assignments WHERE status='sent' AND rotation_restored=0").all();for(const a of assignments){if(new Date(a.created_at)>now||!inRange(a.date,l)||!leaveApplies(l,a.slot))continue;p[a.slot]=Math.max(0,(p[a.slot]||0)-1);db.prepare('UPDATE assignments SET rotation_restored=1 WHERE id=?').run(a.id);}setPositions(db,p);return id;}
export function removeLeave(db,id){return db.prepare('DELETE FROM leaves WHERE id=?').run(id).changes>0;}
export function putHistory(db,date,status,message){db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(randomUUID(),date,status,message,new Date().toISOString());}
