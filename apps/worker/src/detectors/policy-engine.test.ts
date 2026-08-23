import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePolicy } from './policy-engine.js';

const compoundPolicy = {
  id: 'policy-1',
  active: true,
  rule: {
    version: 1,
    name: 'Old unattached volumes under $50',
    finding_type: 'unattached_volume',
    action: 'auto_approve',
    all: [
      { field: 'finding_type', operator: 'eq', value: 'unattached_volume' },
      { field: 'evidence.age_days', operator: 'gte', value: 14 },
      { field: 'estimated_monthly_savings_cents', operator: 'lte', value: 5000 },
    ],
  },
} as const;

test('compound policy matches all explicit age and cost conditions', () => {
  const result = evaluatePolicy(compoundPolicy, {
    findingType: 'unattached_volume',
    evidence: { ageDays: 21 },
    estimatedMonthlySavingsCents: 3000,
  });
  assert.equal(result.matched, true);
  assert.equal(result.eligibleForApproval, true);
  assert.deepEqual(result.conditions.map((condition) => condition.actual), ['unattached_volume', 21, 3000]);
  assert.equal(result.conditions.every((condition) => condition.matched), true);
});

test('compound policy fails closed when one condition does not match', () => {
  const result = evaluatePolicy(compoundPolicy, {
    findingType: 'unattached_volume',
    evidence: { ageDays: 21 },
    estimatedMonthlySavingsCents: 5001,
  });
  assert.equal(result.matched, false);
  assert.equal(result.eligibleForApproval, false);
  assert.equal(result.conditions[2]?.matched, false);
});

test('inactive policy is evaluated as dry-run but can never approve', () => {
  const result = evaluatePolicy({ ...compoundPolicy, active: false }, {
    findingType: 'unattached_volume',
    evidence: { ageDays: 21 },
    estimatedMonthlySavingsCents: 3000,
  });
  assert.equal(result.mode, 'dry_run');
  assert.equal(result.matched, true);
  assert.equal(result.eligibleForApproval, false);
});

test('auto-approval is rejected when the resolved action is irreversible', () => {
  const result = evaluatePolicy(compoundPolicy, {
    findingType: 'unattached_volume',
    evidence: { ageDays: 21 },
    estimatedMonthlySavingsCents: 3000,
    remediationIsReversible: false,
  });
  assert.equal(result.matched, true);
  assert.equal(result.safe, false);
  assert.equal(result.eligibleForApproval, false);
  assert.match(result.reason, /Safety ceiling blocked auto-approval/);
});
