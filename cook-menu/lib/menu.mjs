export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const SEEDS = {
 breakfast: ['Poha','Masala dosa','Idli sambar','Aloo paratha','Upma','Pesarattu','Methi thepla','Sabudana khichdi','Chole bhature','Moong dal chilla','Vegetable uttapam','Misal pav','Rava idli','Puri bhaji','Besan cheela','Pongal','Mysore bonda','Kanda bhaji','Bread pakoda','Thalipeeth'],
 lunch: ['Rajma chawal','Chole rice','Dal tadka with roti','Palak paneer','Vegetable biryani','Kadhi pakora','Aloo gobi','Baingan bharta','Sambar rice','Jeera rice and dal','Matar paneer','Bhindi masala','Lemon rice','Veg pulao','Masoor dal khichdi','Kofta curry','Tawa pulao','Curd rice','Kashmiri dum aloo','Methi matar malai'],
 dinner: ['Paneer tikka masala','Dal makhani','Roti with mixed veg','Vegetable korma','Chicken curry','Fish curry','Malai kofta','Kadai paneer','Palak corn','Mushroom masala','Dum aloo','Lauki kofta','Tofu bhurji','Dal dhokli','Vegetable jalfrezi','Matar mushroom','Bhuna gosht','Tomato rasam with rice','Stuffed capsicum','Navratan korma']
};
export function validDate(s) {
 if(typeof s!=='string' || !/^\d{4}-\d\d-\d\d$/.test(s)) return false;
 const d=new Date(`${s}T00:00:00Z`);
 return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===s;
}
export function addDays(date, amount) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+amount); return d.toISOString().slice(0,10); }
export function indiaToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function weekday(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
export function normalizeMenus(input) { const out={}; for(const s of SLOTS){ if(!Array.isArray(input?.[s]) || input[s].length<1 || input[s].length>200) throw new Error(`menus.${s} must contain 1-200 dishes`); out[s]=input[s].map(x=>String(x).trim()).filter(Boolean); if(out[s].length!==input[s].length || out[s].some(x=>x.length>200)) throw new Error(`invalid ${s} dish`); } return out; }
export function leaveApplies(leave, slot) { return leave.scope==='all' || (leave.scope==='morning' && (slot==='breakfast'||slot==='lunch')) || (leave.scope==='evening' && slot==='dinner'); }
export function inRange(date, leave) { return leave.start<=date && date<=leave.end; }
export function preview({date, menus, positions, leaves=[], mealEnabled={}, enabled=mealEnabled, mealActive={}}) {
 const meals={breakfast:null,lunch:null,dinner:null}; let skipped=weekday(date)===0, reason=skipped?'Sunday':null;
 for(const slot of SLOTS){ if(skipped||mealActive[slot]===false) continue; const l=leaves.find(x=>inRange(date,x)&&leaveApplies(x,slot)); if(l){ reason=reason||`Leave: ${l.reason||'scheduled leave'}`; continue; } const list=(menus[slot]||[]).filter((_,i)=>enabled[slot]?.[i]!==false); if(list.length) meals[slot]=list[(positions[slot]||0)%list.length]; }
 if(!skipped && SLOTS.every(s=>meals[s]===null)) skipped=true;
 return {date,meals,message: skipped ? `No menu sent (${reason||'all meals suppressed'})` : SLOTS.filter(s=>meals[s]!==null).map(s=>`${s[0].toUpperCase()+s.slice(1)}: ${meals[s]}`).join('\n'),skipped,reason};
}
export function makeMessage(p) { return `Menu for ${p.date}\n${p.message}`; }
