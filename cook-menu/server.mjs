import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, load, saveMenus, addLeave, removeLeave, setMealEnabled } from './lib/db.mjs';
import { state, createDispatcher, isRetryWindow, retryTargetDate } from './lib/domain.mjs';
import { normalizeMenus, validDate, preview, addDays, indiaToday } from './lib/menu.mjs';
import { checkConnection, configured, greenConfig, providerRequest } from './lib/green.mjs';

const root=fileURLToPath(new URL('.',import.meta.url)); const publicDir=resolve(root,'..','public');
const db=openStore(process.env.DB_PATH||join(root,'data/cook-menu.sqlite')); const env=process.env;
const password=env.APP_PASSWORD||''; const host=env.HOST||'127.0.0.1';
if(host!=='127.0.0.1'&&host!=='localhost'&&host!=='::1'&&!password) throw new Error('APP_PASSWORD is required on non-loopback hosts');
if(String(env.ENABLE_SENDING).toLowerCase()==='true' && !password) throw new Error('APP_PASSWORD is required when sending is enabled');
function auth(req,res){if(!password)return true;const h=req.headers.authorization||'';if(h.startsWith('Basic ')){try{const decoded=Buffer.from(h.slice(6),'base64').toString();if(decoded.slice(decoded.indexOf(':')+1)===password)return true;}catch{}}res.writeHead(401,{'WWW-Authenticate':'Basic realm="cook-menu"'});res.end('Authentication required');return false;}
function csrf(req,res){if(req.method==='GET')return true;const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`){res.writeHead(403);res.end('Origin rejected');return false;}if(!origin&&req.headers.referer){try{if(new URL(req.headers.referer).host!==req.headers.host){res.writeHead(403);res.end('Origin rejected');return false;}}catch{return false;}}return true;}
function json(res,status,obj){const b=JSON.stringify(obj);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(b);}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>100000)throw Object.assign(new Error('body too large'),{status:413});}try{return JSON.parse(s||'{}')}catch{throw Object.assign(new Error('invalid JSON'),{status:400});}}
function publicState(){return state(db,new Date(),env);}
const dispatch=createDispatcher({db,env,send:async message=>{if(String(env.ENABLE_SENDING).toLowerCase()!=='true')throw new Error('sending disabled');const c=greenConfig(env);return providerRequest(env,'sendMessage',{method:'POST',body:JSON.stringify({chatId:`${c.phone}@c.us`,message})});}});
let timer=null;if(String(env.ENABLE_SENDING).toLowerCase()==='true'){timer=setInterval(()=>{const now=new Date();const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',minute:'2-digit',hour12:false}).formatToParts(now);const minute=Number(local.find(x=>x.type==='minute').value);if(isRetryWindow(now)&&minute%15===0)dispatch(retryTargetDate(now)).catch(()=>{});},60000);timer.unref();}
const server=http.createServer(async(req,res)=>{try{if(!auth(req,res)||!csrf(req,res))return;const u=new URL(req.url,`http://${req.headers.host}`);if(req.method==='GET'&&u.pathname==='/api/state')return json(res,200,publicState());
 if(req.method==='POST'&&u.pathname==='/api/connection')return json(res,200,await checkConnection(env));
 if(req.method==='POST'&&u.pathname==='/api/preview'){const b=await body(req);if(!validDate(b.date))return json(res,400,{error:'valid date required'});const d=load(db);return json(res,200,{...preview({date:b.date,menus:d.menus,mealEnabled:d.mealEnabled,positions:d.positions,leaves:d.leaves}),message:preview({date:b.date,menus:d.menus,mealEnabled:d.mealEnabled,positions:d.positions,leaves:d.leaves}).message});}
 if(req.method==='PUT'&&u.pathname==='/api/menus'){const m=normalizeMenus(await body(req));const d=load(db);if(d.assignments.some(a=>['intent','queued','unknown'].includes(a.status)))return json(res,409,{error:'menu edit blocked while assignments are outstanding'});saveMenus(db,m);return json(res,200,publicState());}
 if(req.method==='PUT'&&u.pathname==='/api/meals'){const b=await body(req);if(!['breakfast','lunch','dinner'].includes(b.slot)||!Number.isInteger(b.position)||typeof b.enabled!=='boolean')return json(res,400,{error:'invalid meal'});setMealEnabled(db,b.slot,b.position,b.enabled);return json(res,200,publicState());}
 if(req.method==='POST'&&u.pathname==='/api/leaves'){const b=await body(req);if(!validDate(b.start)||!validDate(b.end)||b.start>b.end||!['all','morning','evening'].includes(b.scope)||!['cook','household','user'].includes(b.attribution||'cook'))return json(res,400,{error:'invalid leave'});if(b.start<indiaToday())return json(res,409,{error:'cannot alter a cooked past date'});const d=load(db);if(d.leaves.some(x=>x.start===b.start&&x.end===b.end&&x.scope===b.scope&&x.reason===(b.reason||'')&&x.attribution===(b.attribution||'cook')))return json(res,200,publicState());addLeave(db,{start:b.start,end:b.end,scope:b.scope,reason:String(b.reason||'').slice(0,200),attribution:b.attribution||'cook'});return json(res,201,publicState());}
 if(req.method==='DELETE'&&u.pathname.startsWith('/api/leaves/')){const ok=removeLeave(db,u.pathname.split('/').pop());return ok?json(res,200,publicState()):json(res,404,{error:'leave not found'});}
 if(req.method==='GET'){const file=u.pathname==='/'?'index.html':u.pathname.slice(1);const path=resolve(publicDir,file);if(!path.startsWith(publicDir+ '\\')&&!path.startsWith(publicDir+'/'))return res.writeHead(403).end();try{const data=await readFile(path);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});return res.end(data);}catch{return res.writeHead(404).end('Not found');}}
 json(res,404,{error:'not found'});
 }catch(e){json(res,e.status||500,{error:e.message||'server error'});}});
server.listen(Number(env.PORT||3000),host,()=>console.log(`cook-menu listening on ${host}:${env.PORT||3000}`));
export { server, db };
