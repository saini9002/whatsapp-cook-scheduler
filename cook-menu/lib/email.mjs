export function emailConfigured(env=process.env){return Boolean(env.RESEND_API_KEY&&env.ALERT_FROM&&env.ALERT_TO);}
export async function sendAlert(env, {subject, text}) {
 if(!emailConfigured(env)) return {skipped:true, reason:'email not configured'};
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'authorization':`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.ALERT_FROM,to:[env.ALERT_TO],subject,text})});
 let body={};try{body=await r.json()}catch{}
 if(!r.ok) throw new Error(`email provider HTTP ${r.status}${body?.message?`: ${body.message}`:''}`);
 return body;
}
