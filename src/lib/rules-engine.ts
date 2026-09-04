export type RuleTrigger = { field: string; operator: string; value: string; value_secondary?: string | null; is_inverted?: boolean; is_active?: boolean };
export type RuleAction = { action_type: string; action_value: string; is_active?: boolean; stop_processing?: boolean };
export type RuleDefinition = { id: string; strict_mode: boolean; stop_processing?: boolean; rule_triggers?: RuleTrigger[]; rule_actions?: RuleAction[] };
export type RuleTransaction = Record<string, unknown> & { tags?: string[] | null };

function scalar(value: unknown) { return String(value ?? '').trim().toLocaleLowerCase(); }
export function evaluateTrigger(trigger: RuleTrigger, transaction: RuleTransaction): boolean {
  const actual = transaction[trigger.field]; const expected = trigger.value;
  const a = scalar(actual), e = scalar(expected); const number = Number(actual), target = Number(expected);
  let match = false;
  switch (trigger.operator) {
    case 'equals': match = Array.isArray(actual) ? actual.some(v => scalar(v) === e) : a === e; break;
    case 'contains': match = Array.isArray(actual) ? actual.some(v => scalar(v).includes(e)) : a.includes(e); break;
    case 'starts_with': match = a.startsWith(e); break;
    case 'ends_with': match = a.endsWith(e); break;
    case 'greater_than': match = number > target; break;
    case 'greater_than_or_equal': match = number >= target; break;
    case 'less_than': match = number < target; break;
    case 'less_than_or_equal': match = number <= target; break;
    case 'between': match = number >= target && number <= Number(trigger.value_secondary); break;
    case 'is_empty': match = actual == null || a === '' || (Array.isArray(actual) && actual.length === 0); break;
    case 'is_not_empty': match = !(actual == null || a === '' || (Array.isArray(actual) && actual.length === 0)); break;
    case 'in_list': match = expected.split(',').map(scalar).includes(a); break;
    case 'matches_regex': try { match = expected.length <= 256 && new RegExp(expected, 'i').test(String(actual ?? '').slice(0, 2000)); } catch { match = false; } break;
  }
  return trigger.is_inverted ? !match : match;
}
export function evaluateRuleMatch(rule: RuleDefinition, transaction: RuleTransaction) {
  const triggers = (rule.rule_triggers ?? []).filter(t => t.is_active !== false);
  if (!triggers.length) return false;
  return rule.strict_mode ? triggers.every(t => evaluateTrigger(t, transaction)) : triggers.some(t => evaluateTrigger(t, transaction));
}
export function applyRuleActions(rule: RuleDefinition, transaction: RuleTransaction) {
  const patch: RuleTransaction = {}; const actionsApplied: string[] = [];
  const current = () => ({ ...transaction, ...patch });
  for (const action of (rule.rule_actions ?? []).filter(a => a.is_active !== false)) {
    const v = action.action_value;
    switch (action.action_type) {
      case 'set_category': patch.category_id = v || null; break; case 'clear_category': patch.category_id = null; break;
      case 'set_merchant': case 'set_description': patch.merchant = v; break;
      case 'append_description': patch.merchant = `${String(current().merchant ?? '')}${v}`; break;
      case 'prepend_description': patch.merchant = `${v}${String(current().merchant ?? '')}`; break;
      case 'set_memo': patch.memo = v; break;
      case 'append_memo': patch.memo = [current().memo, v].filter(Boolean).join(' '); break;
      case 'prepend_memo': patch.memo = [v, current().memo].filter(Boolean).join(' '); break;
      case 'set_note': patch.note = v; break; case 'append_note': patch.note = [current().note, v].filter(Boolean).join(' '); break;
      case 'prepend_note': patch.note = [v, current().note].filter(Boolean).join(' '); break;
      case 'description_to_note': patch.note = String(current().merchant ?? ''); break;
      case 'append_description_to_note': patch.note = [current().note,current().merchant].filter(Boolean).join(' '); break;
      case 'note_to_description': patch.merchant = String(current().note ?? ''); break;
      case 'append_note_to_description': patch.merchant = [current().merchant,current().note].filter(Boolean).join(' '); break;
      case 'clear_note': patch.note = null; break; case 'add_tag': patch.tags = Array.from(new Set([...(current().tags as string[] ?? []), v])); break;
      case 'remove_tag': patch.tags = (current().tags as string[] ?? []).filter(x => scalar(x) !== scalar(v)); break;
      case 'remove_all_tags': patch.tags = []; break; case 'set_account': case 'set_source_account': patch.account_id = v || null; break;
      case 'set_transfer_account': patch.transfer_account_id = v || null; break; case 'convert_type': patch.type = v; break;
      case 'set_cleared_status': patch.cleared_status = v; break; case 'set_flagged': patch.is_flagged = v === 'true'; break;
      case 'set_reviewed': patch.is_reviewed = v === 'true'; break;
      case 'set_favorite': patch.is_favorite = v === 'true'; break; case 'set_read': patch.is_read = v === 'true'; break;
      case 'set_payment_method': patch.payment_method = v || null; break; case 'set_check_number': patch.check_number = v || null; break;
      case 'set_tax_code': patch.tax_code = v || null; break; case 'set_budget': patch.budget_id = v || null; break; case 'clear_budget': patch.budget_id = null; break;
      case 'clear_account': patch.account_id = null; break; case 'clear_transfer_account': patch.transfer_account_id = null; break;
      case 'swap_accounts': { const source=current().account_id;patch.account_id=current().transfer_account_id??null;patch.transfer_account_id=source??null;break; }
      default: continue;
    }
    actionsApplied.push(action.action_type); if (action.stop_processing) break;
  }
  return { patch, actionsApplied };
}
