import { createFileRoute } from '@tanstack/react-router';
import { executeRulesPipeline } from '@/lib/rules-engine.server';
const isAuthorized=(request:Request)=>!!process.env.RULES_WORKER_SECRET&&request.headers.get('authorization')===`Bearer ${process.env.RULES_WORKER_SECRET}`;
function cronPart(part:string,value:number){if(part==='*')return true;if(part.startsWith('*/'))return value%Number(part.slice(2))===0;return part.split(',').some(v=>Number(v)===value);}
function isDue(cron:string|null,lastRun:string|null,now=new Date()){if(lastRun&&now.getTime()-new Date(lastRun).getTime()<55_000)return false;const p=String(cron||'').trim().split(/\s+/);return p.length===5&&cronPart(p[0],now.getUTCMinutes())&&cronPart(p[1],now.getUTCHours())&&cronPart(p[2],now.getUTCDate())&&cronPart(p[3],now.getUTCMonth()+1)&&cronPart(p[4],now.getUTCDay());}
export const Route=createFileRoute('/api/public/hooks/rules-worker')({server:{handlers:{POST:async({request})=>{
  if(!isAuthorized(request))return new Response('Unauthorized',{status:401});
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const db:any=supabaseAdmin;
  const {data:rules,error}=await db.from('rules').select('id,household_id,schedule_cron,last_run_at').eq('kind','deterministic').eq('trigger_moment','scheduled').eq('is_active',true);if(error)return Response.json({error:error.message},{status:500});let processed=0,changed=0,due=0;
  for(const rule of rules??[]){if(!isDue(rule.schedule_cron,rule.last_run_at))continue;due++;const {data:txns}=await db.from('transactions').select('*').eq('household_id',rule.household_id).order('txn_date',{ascending:false}).limit(1000);for(const txn of txns??[]){processed++;const out=await executeRulesPipeline(db,rule.household_id,txn,'scheduled',rule.id);if(!Object.keys(out.patch).length)continue;const {error:e}=await db.from('transactions').update(out.patch).eq('id',txn.id);if(e)throw new Error(e.message);changed++;await db.from('rule_execution_logs').insert({household_id:rule.household_id,rule_id:rule.id,transaction_id:txn.id,trigger_moment:'scheduled',actions_applied:out.actionsApplied});}await db.from('rules').update({last_run_at:new Date().toISOString()}).eq('id',rule.id);}
  return Response.json({ok:true,rules:(rules??[]).length,due,processed,changed});
}}}});
