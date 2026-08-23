import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildWasteFindingMessage, parseApprovalActionValue } from './messages.js';

const fixture = {
  wasteFindingId: 'finding-123',
  findingType: 'idle_load_balancer',
  resourceExternalId: 'arn:aws:elasticloadbalancing:us-east-1:000000000000:loadbalancer/app/cindr-demo/123',
  resourceType: 'load_balancer',
  region: 'us-east-1',
  evidence: { reason: '0 requests over 7 days' },
  currentMonthlyCostCents: 10000,
  projectedMonthlySavingsCents: 4500,
  status: 'proposed' as const,
};

test('proposed waste finding Block Kit payload matches the snapshot', () => {
  const message = buildWasteFindingMessage(fixture);
  const expected = readFileSync(new URL('./messages.snapshot.json', import.meta.url), 'utf8').trim();
  assert.equal(JSON.stringify(message, null, 2), expected);
  const approve = message.blocks[2];
  assert.equal(approve.type, 'actions');
  if (approve.type !== 'actions' || !('elements' in approve)) throw new Error('Expected action block');
  const approveValue = (approve.elements[0] as { value?: string }).value;
  assert.ok(approveValue);
  assert.deepEqual(parseApprovalActionValue(approveValue), { findingId: 'finding-123', actionId: 'cindr:approve:finding-123' });
});

test('auto-approved messages have no live approval buttons', () => {
  const message = buildWasteFindingMessage({ ...fixture, status: 'approved', autoApprovedPolicyName: 'Staging cleanup policy' });
  assert.equal(message.blocks.some((block) => block.type === 'actions'), false);
  assert.equal(JSON.stringify(message).includes('Auto-approved by policy: *Staging cleanup policy*.'), true);
});
