import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePolicyInput } from './dashboard.js';

test('policy validation accepts a detector-compatible compound rule', () => {
  const result = validatePolicyInput({
    name: 'Old unattached volumes under $50',
    finding_type: 'unattached_volume',
    action: 'auto_approve',
    active: true,
    conditions: [
      { field: 'finding_type', operator: 'eq', value: 'unattached_volume' },
      { field: 'evidence.age_days', operator: 'gte', value: 14 },
      { field: 'estimated_monthly_savings_cents', operator: 'lte', value: 5000 },
    ],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.conditions.length, 3);
  assert.equal(result.value?.active, true);
});

test('policy validation accepts dry-run rules', () => {
  const result = validatePolicyInput({
    name: 'Trial RDS policy',
    finding_type: 'underutilized_rds',
    action: 'auto_approve',
    active: false,
    conditions: [{ field: 'finding_type', operator: 'eq', value: 'underutilized_rds' }],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.active, false);
});

test('policy validation rejects malformed or incomplete compound rules', () => {
  assert.match(validatePolicyInput({ name: 'Missing conditions', finding_type: 'unattached_volume', action: 'auto_approve' }).error ?? '', /conditions must be an array/);
  assert.match(validatePolicyInput({ name: 'Missing type condition', finding_type: 'unattached_volume', action: 'auto_approve', conditions: [{ field: 'evidence.age_days', operator: 'gte', value: 14 }] }).error ?? '', /finding_type eq/);
});

test('policy validation rejects finding types outside the Stage 3 detector set', () => {
  const result = validatePolicyInput({ name: 'Unsafe', finding_type: 'delete_everything', action: 'auto_approve', conditions: [{ field: 'finding_type', operator: 'eq', value: 'delete_everything' }] });
  assert.match(result.error ?? '', /rule.finding_type must be one of/);
});
