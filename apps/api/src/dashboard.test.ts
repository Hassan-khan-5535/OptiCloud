import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePolicyInput } from './dashboard.js';

test('policy validation accepts a detector-compatible age rule', () => {
  const result = validatePolicyInput({ finding_type: 'unattached_volume', min_age_days: 14, action: 'auto_approve' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    findingType: 'unattached_volume',
    minAgeDays: 14,
    threshold: undefined,
    action: 'auto_approve',
    cloudAccountId: undefined,
  });
});

test('policy validation accepts a detector-compatible threshold rule', () => {
  const result = validatePolicyInput({ finding_type: 'underutilized_rds', threshold: 10, action: 'manual_review' });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.threshold, 10);
});

test('policy validation rejects missing or ambiguous constraints', () => {
  assert.match(validatePolicyInput({ finding_type: 'unattached_volume', action: 'auto_approve' }).error ?? '', /min_age_days or threshold/);
  assert.match(validatePolicyInput({ finding_type: 'unattached_volume', min_age_days: 14, threshold: 10, action: 'auto_approve' }).error ?? '', /only one/);
});

test('policy validation rejects finding types outside the Stage 3 detector set', () => {
  const result = validatePolicyInput({ finding_type: 'delete_everything', min_age_days: 1, action: 'auto_approve' });
  assert.match(result.error ?? '', /finding_type must be one of/);
});
