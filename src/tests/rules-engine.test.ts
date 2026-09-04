import { describe, expect, it } from './test-framework';
import { applyRuleActions, evaluateRuleMatch } from '../lib/rules-engine';
export function registerRulesEngineTests(){describe('Unified rules engine',()=>{
 it('supports strict AND and inverted matching',()=>{expect(evaluateRuleMatch({id:'r',strict_mode:true,rule_triggers:[{field:'merchant',operator:'contains',value:'uber'},{field:'amount',operator:'greater_than',value:'500'},{field:'description',operator:'contains',value:'refund',is_inverted:true}]},{merchant:'UBER INDIA',description:'trip',amount:700})).toBe(true);});
 it('applies ordered category, memo and tag actions',()=>{const out=applyRuleActions({id:'r',strict_mode:true,rule_actions:[{action_type:'set_category',action_value:'cat-1'},{action_type:'set_memo',action_value:'Cab'},{action_type:'add_tag',action_value:'travel'}]},{tags:['work']});expect(out.patch.category_id).toBe('cat-1');expect(out.patch.memo).toBe('Cab');expect((out.patch.tags as string[]).join(',')).toBe('work,travel');});
 it('rejects invalid regular expressions safely',()=>{expect(evaluateRuleMatch({id:'r',strict_mode:true,rule_triggers:[{field:'merchant',operator:'matches_regex',value:'[invalid'}]},{merchant:'shop'})).toBe(false);});
});}
