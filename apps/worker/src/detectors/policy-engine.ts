import type { Policy, PolicyCondition, PolicyRule } from '@cindr/db';
import { parsePolicyRule, type PolicyField, type PolicyOperator, type PolicyValue } from '@cindr/db';
import { actionPlanForFinding, isActionReversible } from '../remediation/action-plan.js';

export type PolicyEvaluationContext = {
  findingType: string;
  evidence: Record<string, unknown>;
  estimatedMonthlySavingsCents: number;
  providerSupportsStoppedLoadBalancer?: boolean;
  remediationIsReversible?: boolean;
};

export type ConditionEvaluation = {
  field: PolicyField;
  operator: PolicyOperator;
  expected: PolicyValue;
  actual: PolicyValue | null;
  matched: boolean;
};

export type PolicyEvaluation = {
  policyId: string;
  policyName: string;
  mode: 'live' | 'dry_run';
  action: string;
  actionType: string | null;
  matched: boolean;
  safe: boolean;
  eligibleForApproval: boolean;
  reason: string;
  conditions: ConditionEvaluation[];
};

function actualValue(context: PolicyEvaluationContext, field: PolicyField, actionType: string | null): PolicyValue | null {
  if (field === 'finding_type') return context.findingType;
  if (field === 'estimated_monthly_savings_cents') return context.estimatedMonthlySavingsCents;
  if (field === 'remediation_action_type') return actionType;
  const evidence = context.evidence;
  const aliases: Record<string, string[]> = {
    'evidence.age_days': ['ageDays', 'zeroAttachmentDays', 'zeroRequestDays'],
    'evidence.threshold_days': ['thresholdDays'],
    'evidence.average_connections': ['averageConnections'],
    'evidence.average_cpu_percent': ['averageCpuPercent'],
  };
  const key = aliases[field]?.find((candidate) => evidence[candidate] !== undefined);
  const value = key ? evidence[key] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compare(actual: PolicyValue | null, operator: PolicyOperator, expected: PolicyValue): boolean {
  if (actual === null) return false;
  if (operator === 'eq') return actual === expected;
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (operator === 'gte') return actual >= expected;
  if (operator === 'lte') return actual <= expected;
  if (operator === 'gt') return actual > expected;
  return actual < expected;
}

export function evaluatePolicy(policy: Pick<Policy, 'id' | 'active' | 'rule'>, context: PolicyEvaluationContext): PolicyEvaluation {
  const parsed = parsePolicyRule(policy.rule);
  const mode = policy.active ? 'live' : 'dry_run';
  if (!parsed.value) {
    return {
      policyId: policy.id,
      policyName: 'invalid policy',
      mode,
      action: 'unknown',
      actionType: null,
      matched: false,
      safe: false,
      eligibleForApproval: false,
      reason: `Policy rejected: ${parsed.error}`,
      conditions: [],
    };
  }

  const rule: PolicyRule = parsed.value;
  let actionType: string | null = null;
  let actionPlan;
  try {
    actionPlan = actionPlanForFinding({ findingType: context.findingType }, context.providerSupportsStoppedLoadBalancer ?? true);
    actionType = actionPlan.actionType;
  } catch (error) {
    return {
      policyId: policy.id,
      policyName: rule.name,
      mode,
      action: rule.action,
      actionType: null,
      matched: false,
      safe: false,
      eligibleForApproval: false,
      reason: `Policy rejected: action mapping failed (${error instanceof Error ? error.message : String(error)})`,
      conditions: [],
    };
  }

  const conditions = rule.all.map((condition: PolicyCondition) => {
    const actual = actualValue(context, condition.field, actionType);
    return { ...condition, expected: condition.value, actual, matched: compare(actual, condition.operator, condition.value) };
  });
  const matched = conditions.every((condition) => condition.matched);
  const resolvedIsReversible = context.remediationIsReversible ?? (actionType ? isActionReversible(actionType) && actionPlan.isReversible : false);
  const safe = rule.action !== 'auto_approve' || resolvedIsReversible;
  const eligibleForApproval = rule.action === 'auto_approve' && matched && safe && policy.active;
  const safetyReason = !safe ? `Safety ceiling blocked auto-approval: ${actionType} is irreversible.` : '';
  const comparisonReason = JSON.stringify({ policyId: policy.id, policyName: rule.name, mode, action: rule.action, actionType, matched, safe, conditions });
  return {
    policyId: policy.id,
    policyName: rule.name,
    mode,
    action: rule.action,
    actionType,
    matched,
    safe,
    eligibleForApproval,
    reason: safetyReason || `Policy evaluation: ${comparisonReason}`,
    conditions,
  };
}
