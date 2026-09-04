import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { getHouseholdId } from '@/lib/household.server';
import { executeLoadedRules, loadActiveRuleGroups } from './rules-engine.server';

const trigger = z.object({ field:z.string().min(1), operator:z.string().min(1), value:z.string().default(''), value_secondary:z.string().nullable().optional(), is_inverted:z.boolean().default(false) });
const action = z.object({ action_type:z.string().min(1), action_value:z.string().default('') });
const ruleInput = z.object({ id:z.string().uuid().optional(), groupId:z.string().uuid().optional(), title:z.string().min(1).max(255), description:z.string().max(1000).nullable().optional(), kind:z.enum(['deterministic','llm_context']), naturalLanguageInstruction:z.string().max(5000).nullable().optional(), triggerMoment:z.enum(['create','update','create_and_update','manual_only','scheduled']).default('create'), scheduleCron:z.string().max(100).nullable().optional(), strictMode:z.boolean().default(true), stopProcessing:z.boolean().default(false), triggers:z.array(trigger).default([]), actions:z.array(action).default([]) });

export const listRuleGroups = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const householdId=await getHouseholdId(context); const {data,error}=await context.supabase.from('rule_groups').select('*, rules(*, rule_triggers(*), rule_actions(*))').eq('household_id',householdId).order('sort_order');
  if(error) throw error; return data ?? [];
});
export const createRuleGroup = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({title:z.string().min(1).max(255)}).parse(d)).handler(async({context,data})=>{
  const household_id=await getHouseholdId(context); const {data:row,error}=await context.supabase.from('rule_groups').insert({household_id,title:data.title}).select().single(); if(error) throw error; return row;
});
export const saveRule = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>ruleInput.parse(d)).handler(async({context,data})=>{
  const household_id=await getHouseholdId(context); let groupId=data.groupId;
  if(!groupId){ const {data:g,error}=await context.supabase.from('rule_groups').select('id').eq('household_id',household_id).eq('title','Default Rules').maybeSingle(); if(error) throw error; if(g) groupId=g.id; else {const {data:n,error:e}=await context.supabase.from('rule_groups').insert({household_id,title:'Default Rules'}).select('id').single(); if(e) throw e; groupId=n.id;} }
  let resolvedActions=data.actions;
  if(data.kind==='deterministic'){
    resolvedActions=await Promise.all(data.actions.map(async a=>{
      if(a.action_type!=='set_category'||!a.action_value||/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(a.action_value))return a;
      const {data:category,error}=await context.supabase.from('categories').select('id,name').eq('household_id',household_id).ilike('name',a.action_value.trim()).maybeSingle();
      if(error)throw error;if(!category)throw new Error(`Category “${a.action_value}” was not found. Enter an existing category name.`);
      return {...a,action_value:category.id};
    }));
  }
  const payload={household_id,rule_group_id:groupId,title:data.title,description:data.description??null,kind:data.kind,natural_language_instruction:data.kind==='llm_context'?data.naturalLanguageInstruction:null,trigger_moment:data.triggerMoment,schedule_cron:data.triggerMoment==='scheduled'?data.scheduleCron:null,strict_mode:data.strictMode,stop_processing:data.stopProcessing};
  const query=data.id?context.supabase.from('rules').update(payload).eq('id',data.id):context.supabase.from('rules').insert(payload); const {data:row,error}=await query.select('id').single(); if(error) throw error;
  await context.supabase.from('rule_triggers').delete().eq('rule_id',row.id); await context.supabase.from('rule_actions').delete().eq('rule_id',row.id);
  if(data.kind==='deterministic' && data.triggers.length){const {error:e}=await context.supabase.from('rule_triggers').insert(data.triggers.map((t,i)=>({...t,rule_id:row.id,sort_order:i})));if(e)throw e;}
  if(data.kind==='deterministic' && resolvedActions.length){const {error:e}=await context.supabase.from('rule_actions').insert(resolvedActions.map((a,i)=>({...a,rule_id:row.id,sort_order:i})));if(e)throw e;}
  return {id:row.id};
});
export const deleteRule = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({context,data})=>{const {error}=await context.supabase.from('rules').delete().eq('id',data.id);if(error)throw error;return{ok:true};});
export const applyRulesNow = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({ruleId:z.string().uuid().optional(),dryRun:z.boolean().default(false)}).parse(d)).handler(async({context,data})=>{
  const householdId=await getHouseholdId(context);
  const [groupsResult,transactionsResult]=await Promise.all([
    loadActiveRuleGroups(context.supabase,householdId),
    context.supabase.from('transactions').select('*').eq('household_id',householdId).order('txn_date',{ascending:false}).limit(10000),
  ]);
  if(transactionsResult.error)throw transactionsResult.error;
  const changes=(transactionsResult.data??[]).map((txn:any)=>({txn,out:executeLoadedRules(groupsResult,txn,'manual_only',data.ruleId)})).filter(({out}:any)=>Object.keys(out.patch).length>0);
  if(!data.dryRun&&changes.length){
    const concurrency=25;
    for(let i=0;i<changes.length;i+=concurrency){
      const batch=changes.slice(i,i+concurrency);
      await Promise.all(batch.map(async({txn,out}:any)=>{const {error}=await context.supabase.from('transactions').update(out.patch).eq('id',txn.id).eq('household_id',householdId);if(error)throw error;}));
    }
    const logs=changes.map(({txn,out}:any)=>({household_id:householdId,rule_id:out.matchedRuleIds[0]??null,transaction_id:txn.id,trigger_moment:'manual_only',actions_applied:out.actionsApplied}));
    for(let i=0;i<logs.length;i+=500){const {error}=await context.supabase.from('rule_execution_logs').insert(logs.slice(i,i+500));if(error)throw error;}
  }
  return{processedCount:(transactionsResult.data??[]).length,changedCount:changes.length,dryRun:data.dryRun};
});
