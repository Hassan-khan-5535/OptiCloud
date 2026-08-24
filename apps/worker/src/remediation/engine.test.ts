import assert from 'node:assert/strict';
import test from 'node:test';
import { MockCloudRemediationProvider, type RemediationResource } from '@cindr/cloud-adapters';
import type { FindingStatus, RemediationActionStatus } from '@cindr/db';
import { DefaultRemediationEngine, actionPlanForFinding, resizeDownOneTier } from './engine.js';
import { InMemoryRateLimiter } from './rate-limiter.js';
import type { ExecutionRecord, DrizzleRemediationRepository } from './repository.js';
import type { RemediationRepository } from './engine.js';

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    findingId: 'finding-1',
    findingType: 'unattached_volume',
    findingStatus: 'approved',
    resource: {
      resourceId: 'resource-1',
      cloudAccountId: 'account-1',
      provider: 'aws',
      externalId: 'vol-1',
      resourceType: 'ebs_volume',
      region: 'us-east-1',
      metadata: { availabilityZone: 'us-east-1a', sizeGiB: 100, instanceType: 'db.t3.large' },
    },
    actionId: null,
    actionType: null,
    actionStatus: null,
    actionIdempotencyKey: null,
    isReversible: null,
    rollbackAction: null,
    executedAt: null,
    ...overrides,
  };
}

class MemoryRemediationRepository implements RemediationRepository {
  record: ExecutionRecord;
  notes: string[] = [];
  transitions: Array<{ entity: string; from: string; to: string; reason: string }> = [];
  private nextActionId = 1;

  constructor(record = makeRecord()) { this.record = structuredClone(record); }

  async getExecutionRecord(): Promise<ExecutionRecord | null> { return structuredClone(this.record); }
  async getExecutionRecordByActionId(actionId: string): Promise<ExecutionRecord | null> { return actionId === this.record.actionId ? structuredClone(this.record) : null; }

  async ensureAction(input: { findingId: string; actionType: NonNullable<ExecutionRecord['actionType']>; isReversible: boolean; idempotencyKey: string }): Promise<string> {
    if (this.record.actionId) return this.record.actionId;
    this.record.actionId = `action-${this.nextActionId++}`;
    this.record.actionType = input.actionType;
    this.record.actionStatus = 'pending';
    this.record.actionIdempotencyKey = input.idempotencyKey;
    this.record.isReversible = input.isReversible;
    return this.record.actionId;
  }

  async setRollbackAction(_actionId: string, rollbackAction: Record<string, unknown>): Promise<void> { this.record.rollbackAction = rollbackAction; }
  async updateResourceExternalId(_resourceId: string, externalId: string): Promise<void> { this.record.resource.externalId = externalId; }

  async transitionFinding(input: { findingId: string; toStatus: FindingStatus; reason: string }): Promise<void> {
    assert.equal(input.findingId, this.record.findingId);
    this.transitions.push({ entity: 'finding', from: this.record.findingStatus, to: input.toStatus, reason: input.reason });
    this.record.findingStatus = input.toStatus;
  }

  async transitionAction(input: { actionId: string; toStatus: RemediationActionStatus; reason: string }): Promise<void> {
    assert.equal(input.actionId, this.record.actionId);
    this.transitions.push({ entity: 'action', from: this.record.actionStatus ?? 'pending', to: input.toStatus, reason: input.reason });
    this.record.actionStatus = input.toStatus;
  }

  async recordActionNote(_actionId: string, reason: string): Promise<void> { this.notes.push(reason); }
}

const baseRecord = makeRecord();

test('unattached volume snapshots before delete and records provider failure in failed states', async () => {
  const provider = new MockCloudRemediationProvider();
  provider.failOn = 'deleteVolume';
  const repository = new MemoryRemediationRepository();
  const engine = new DefaultRemediationEngine(repository, provider, new InMemoryRateLimiter());

  const result = await engine.executeFinding('finding-1');

  assert.equal(result.status, 'failed');
  assert.equal(repository.record.findingStatus, 'failed');
  assert.equal(repository.record.actionStatus, 'failed');
  assert.deepEqual(provider.calls, ['createVolumeSnapshot', 'deleteVolume']);
  assert.equal(repository.record.rollbackAction?.snapshotId, 'snap-vol-1');
  assert.match(repository.notes.at(-1) ?? '', /mock provider failure: deleteVolume/);
  assert.deepEqual(repository.transitions.map((transition) => `${transition.entity}:${transition.from}->${transition.to}`), [
    'finding:approved->executing',
    'action:pending->executing',
    'action:executing->failed',
    'finding:executing->failed',
  ]);
});

test('EBS deletion without availability-zone metadata is blocked before provider mutation', async () => {
  const provider = new MockCloudRemediationProvider();
  const repository = new MemoryRemediationRepository(makeRecord({ resource: { ...baseRecord.resource, metadata: { sizeGiB: 100 } } }));
  const engine = new DefaultRemediationEngine(repository, provider, new InMemoryRateLimiter());

  const result = await engine.executeFinding('finding-1');

  assert.equal(result.status, 'failed');
  assert.match(result.reason ?? '', /availabilityZone metadata/);
  assert.deepEqual(provider.calls, []);
  assert.equal(repository.record.findingStatus, 'failed');
  assert.equal(repository.record.actionStatus, 'failed');
});

test('retry after a transient delete failure reuses the snapshot and completes once', async () => {
  const provider = new MockCloudRemediationProvider();
  provider.failOn = 'deleteVolume';
  const repository = new MemoryRemediationRepository();
  const engine = new DefaultRemediationEngine(repository, provider, new InMemoryRateLimiter());

  await engine.executeFinding('finding-1');
  provider.failOn = undefined;
  const retry = await engine.executeFinding('finding-1');

  assert.equal(retry.status, 'completed');
  assert.equal(repository.record.findingStatus, 'completed');
  assert.equal(repository.record.actionStatus, 'completed');
  assert.deepEqual(provider.calls, ['createVolumeSnapshot', 'deleteVolume', 'deleteVolume']);
});

test('successful action retry is idempotently skipped without another provider call', async () => {
  const provider = new MockCloudRemediationProvider();
  const repository = new MemoryRemediationRepository();
  const engine = new DefaultRemediationEngine(repository, provider, new InMemoryRateLimiter());

  const first = await engine.executeFinding('finding-1');
  const callsAfterFirst = [...provider.calls];
  const second = await engine.executeFinding('finding-1');

  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'skipped');
  assert.deepEqual(provider.calls, callsAfterFirst);
  assert.match(repository.notes.at(-1) ?? '', /already completed successfully/);
});

test('RDS maps to resize down one tier and never to stop or delete', () => {
  const record = makeRecord({ findingType: 'underutilized_rds', resource: { ...baseRecord.resource, resourceType: 'rds_instance', metadata: { instanceType: 'db.t3.large' } } });
  assert.deepEqual(actionPlanForFinding(record), { actionType: 'resize_instance', isReversible: true });
  assert.equal(resizeDownOneTier('db.t3.large'), 'db.t3.medium');
});

test('EBS rollback reconciles the resource external ID before marking rolled back', async () => {
  const provider = new MockCloudRemediationProvider();
  const repository = new MemoryRemediationRepository(makeRecord({
    findingStatus: 'completed',
    actionId: 'action-1',
    actionType: 'delete_volume',
    actionStatus: 'completed',
    rollbackAction: {
      cloudAccountId: 'account-1',
      provider: 'aws',
      actionType: 'restore_volume_snapshot',
      resourceExternalId: 'vol-1',
      region: 'us-east-1',
      snapshotId: 'snap-vol-1',
      availabilityZone: 'us-east-1a',
    },
  }));
  const engine = new DefaultRemediationEngine(repository, provider, new InMemoryRateLimiter());

  const result = await engine.rollbackRemediation('action-1');

  assert.equal(result.status, 'rolled_back');
  assert.equal(repository.record.resource.externalId, 'restored-vol-1');
  assert.deepEqual(provider.calls, ['restoreVolumeSnapshot']);
});

test('unsupported stopped load-balancer capability becomes manual review without provider mutation', async () => {
  const provider = new MockCloudRemediationProvider();
  provider.supportsStoppedLoadBalancer = false;
  const record = makeRecord({ findingType: 'idle_load_balancer', resource: { ...baseRecord.resource, resourceType: 'load_balancer' } });
  const repository = new MemoryRemediationRepository(record);
  const engine = new DefaultRemediationEngine(repository, provider, new InMemoryRateLimiter());

  const result = await engine.executeFinding(record.findingId);

  assert.equal(result.status, 'manual_review');
  assert.equal(repository.record.findingStatus, 'failed');
  assert.deepEqual(provider.calls, []);
  assert.match(result.reason ?? '', /manual review/);
});
