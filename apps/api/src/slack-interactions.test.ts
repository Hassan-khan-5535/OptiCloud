import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { FindingContext, RemediationQueue, SlackMessageClient } from './slack-interactions.js';
import { handleSlackInteraction, SlackRequestError, type ApprovalRepository } from './slack-interactions.js';

const signingSecret = 'stage4-test-secret';
const timestamp = 1_800_000_000;

function signedRequest(body: object) {
  const rawBody = JSON.stringify(body);
  const signature = `v0=${createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  return { rawBody, headers: { 'x-slack-request-timestamp': String(timestamp), 'x-slack-signature': signature } };
}

function makeFinding(status: FindingContext['status'] = 'proposed'): FindingContext {
  return {
    id: 'finding-123',
    wasteFindingId: 'finding-123',
    findingType: 'unattached_volume',
    status,
    resourceExternalId: 'vol-123',
    resourceType: 'ebs_volume',
    region: 'us-east-1',
    evidence: { reason: '0 attachments for 14 days' },
    currentMonthlyCostCents: 1200,
    projectedMonthlySavingsCents: 1200,
  };
}

test('duplicate signed Approve delivery re-enqueues safely without re-transitioning', async () => {
  let finding = makeFinding();
  let transitions = 0;
  const repository: ApprovalRepository = {
    async getFindingContext() { return finding; },
    async transitionFinding(input) {
      transitions += 1;
      assert.equal(finding.status, 'proposed');
      finding = { ...finding, status: input.toStatus };
    },
  };
  let enqueues = 0;
  const queue: RemediationQueue = { async enqueue(findingId, orgId) { enqueues += 1; assert.equal(findingId, 'finding-123'); assert.equal(orgId, 'org-test'); }, async enqueueRollback() {} };
  let updates = 0;
  const slack: SlackMessageClient = { chat: { async update(input) { updates += 1; assert.equal(input.channel, 'C123'); assert.equal(input.ts, '1712345678.000100'); } } };
  const deps = { repository, queue, slack, signingSecret, orgId: 'org-test', nowSeconds: timestamp };
  const body = {
    type: 'block_actions',
    user: { id: 'U123' },
    actions: [{ action_id: 'cindr_approve', value: JSON.stringify({ findingId: 'finding-123', actionId: 'cindr:approve:finding-123' }) }],
    message: { channel: { id: 'C123' }, ts: '1712345678.000100' },
  };

  const request = signedRequest(body);
  const first = await handleSlackInteraction(request.rawBody, request.headers, body, deps);
  assert.deepEqual(first, { status: 'approved', duplicate: false });

  const duplicate = await handleSlackInteraction(request.rawBody, request.headers, body, deps);
  assert.deepEqual(duplicate, { status: 'approved', duplicate: true });
  assert.equal(transitions, 1);
  assert.equal(enqueues, 2);
  assert.equal(updates, 2);
});

test('malformed Slack action value is rejected before repository access', async () => {
  let repositoryCalls = 0;
  const repository: ApprovalRepository = {
    async getFindingContext() { repositoryCalls += 1; return makeFinding(); },
    async transitionFinding() { throw new Error('should not be called'); },
  };
  const body = { type: 'block_actions', actions: [{ action_id: 'cindr_approve', value: '{bad-json' }], message: { channel: 'C123', ts: '1712345678.000100' } };
  const request = signedRequest(body);
  await assert.rejects(
    () => handleSlackInteraction(request.rawBody, request.headers, body, {
      repository,
      queue: { async enqueue() {}, async enqueueRollback() {} },
      slack: { chat: { async update() {} } },
      signingSecret,
      orgId: 'org-test',
      nowSeconds: timestamp,
    }),
    (error: unknown) => error instanceof SlackRequestError && error.statusCode === 400,
  );
  assert.equal(repositoryCalls, 0);
});

test('invalid Slack signature is rejected before repository access', async () => {
  let repositoryCalls = 0;
  const repository: ApprovalRepository = {
    async getFindingContext() { repositoryCalls += 1; return makeFinding(); },
    async transitionFinding() { throw new Error('should not be called'); },
  };
  const body = { type: 'block_actions', actions: [{ action_id: 'cindr_approve', value: 'not-used' }] };
  await assert.rejects(
    () => handleSlackInteraction(JSON.stringify(body), { 'x-slack-request-timestamp': String(timestamp), 'x-slack-signature': 'v0=invalid' }, body, {
      repository,
      queue: { async enqueue() {}, async enqueueRollback() {} },
      slack: { chat: { async update() {} } },
      signingSecret,
      orgId: 'org-test',
      nowSeconds: timestamp,
    }),
    (error: unknown) => error instanceof SlackRequestError && error.statusCode === 401,
  );
  assert.equal(repositoryCalls, 0);
});
