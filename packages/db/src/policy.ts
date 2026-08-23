export const POLICY_RULE_VERSION = 1 as const;

export const POLICY_FIELDS = [
  'finding_type',
  'estimated_monthly_savings_cents',
  'evidence.age_days',
  'evidence.threshold_days',
  'evidence.average_connections',
  'evidence.average_cpu_percent',
  'remediation_action_type',
] as const;
export type PolicyField = typeof POLICY_FIELDS[number];

export const POLICY_OPERATORS = ['eq', 'gte', 'lte', 'gt', 'lt'] as const;
export type PolicyOperator = typeof POLICY_OPERATORS[number];

export const POLICY_ACTIONS = ['auto_approve', 'manual_review'] as const;
export type PolicyAction = typeof POLICY_ACTIONS[number];

export const POLICY_FINDING_TYPES = ['unattached_volume', 'idle_load_balancer', 'underutilized_rds'] as const;

export type PolicyValue = string | number | boolean;
export type PolicyCondition = { field: PolicyField; operator: PolicyOperator; value: PolicyValue };
export type PolicyRule = {
  version: typeof POLICY_RULE_VERSION;
  name: string;
  finding_type: string;
  action: PolicyAction;
  all: readonly PolicyCondition[];
};

export type PolicyValidationResult = { value?: PolicyRule; error?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPolicyValue(value: unknown): value is PolicyValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function parsePolicyRule(input: unknown): PolicyValidationResult {
  if (!isRecord(input)) return { error: 'rule must be an object' };
  if (input.version !== POLICY_RULE_VERSION) return { error: `rule.version must be ${POLICY_RULE_VERSION}` };
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 255) return { error: 'rule.name must be 1–255 characters' };
  if (typeof input.finding_type !== 'string' || !POLICY_FINDING_TYPES.includes(input.finding_type as typeof POLICY_FINDING_TYPES[number])) return { error: `rule.finding_type must be one of: ${POLICY_FINDING_TYPES.join(', ')}` };
  if (!POLICY_ACTIONS.includes(input.action as PolicyAction)) return { error: `rule.action must be one of: ${POLICY_ACTIONS.join(', ')}` };
  if (!Array.isArray(input.all) || input.all.length < 1 || input.all.length > 12) return { error: 'rule.all must contain 1–12 explicit conditions' };

  const all: PolicyCondition[] = [];
  for (const [index, raw] of input.all.entries()) {
    if (!isRecord(raw)) return { error: `rule.all[${index}] must be an object` };
    if (!POLICY_FIELDS.includes(raw.field as PolicyField)) return { error: `rule.all[${index}].field is not allowlisted` };
    if (!POLICY_OPERATORS.includes(raw.operator as PolicyOperator)) return { error: `rule.all[${index}].operator is not supported` };
    if (!isPolicyValue(raw.value)) return { error: `rule.all[${index}].value must be a string, number, or boolean` };
    if (typeof raw.value === 'number' && !Number.isFinite(raw.value)) return { error: `rule.all[${index}].value must be finite` };
    if (raw.field === 'finding_type' || raw.field === 'remediation_action_type') {
      if (raw.operator !== 'eq' || typeof raw.value !== 'string') return { error: `rule.all[${index}] must use eq with a string for ${raw.field}` };
    }
    if (raw.field !== 'finding_type' && raw.field !== 'remediation_action_type' && typeof raw.value !== 'number') return { error: `rule.all[${index}] requires a numeric value` };
    all.push({ field: raw.field as PolicyField, operator: raw.operator as PolicyOperator, value: raw.value });
  }

  const findingTypeCondition = all.find((condition) => condition.field === 'finding_type');
  if (!findingTypeCondition || findingTypeCondition.value !== input.finding_type) return { error: 'rule.all must explicitly include finding_type eq rule.finding_type' };
  return { value: { version: POLICY_RULE_VERSION, name: input.name.trim(), finding_type: input.finding_type, action: input.action as PolicyAction, all } };
}

export function buildPolicyRule(input: { name: string; findingType: string; action: PolicyAction; conditions: PolicyCondition[] }): PolicyRule {
  const result = parsePolicyRule({ version: POLICY_RULE_VERSION, name: input.name, finding_type: input.findingType, action: input.action, all: input.conditions });
  if (!result.value) throw new Error(result.error ?? 'Invalid policy rule');
  return result.value;
}
