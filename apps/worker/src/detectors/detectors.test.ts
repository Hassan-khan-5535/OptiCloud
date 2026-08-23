import assert from 'node:assert/strict';
import test from 'node:test';
import { MockCloudMetricsProvider, type CloudMetricPoint, type MetricsResource } from '@cindr/cloud-adapters';
import type { DetectionFindingInput, DetectionStore, DetectorContext } from './shared.js';
import type { PolicyEvaluation } from './policy-engine.js';
import { detectionConfigFromEnv } from './shared.js';
import { detectIdleLoadBalancers } from './idle-load-balancer.js';
import { detectUnderutilizedRds } from './underutilized-rds.js';
import { detectUnattachedVolumes } from './unattached-volume.js';
import type { FindingStatus } from '@cindr/db';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

class MemoryDetectionStore implements DetectionStore {
  public readonly metrics: CloudMetricPoint[] = [];
  public readonly findings = new Map<string, { id: string; status: FindingStatus; findingType: string }>();
  public readonly transitions: Array<{ id: string; from: FindingStatus; to: FindingStatus }> = [];
  public autoApprove = new Set<string>();
  public dryRun = new Set<string>();
  public approvalReason = '';
  public dryRunLog: PolicyEvaluation[] = [];

  async recordMetrics(points: CloudMetricPoint[]): Promise<void> { this.metrics.push(...points); }

  async upsertFinding(input: DetectionFindingInput): Promise<{ id: string; status: FindingStatus } | null> {
    const key = `${input.resourceId}:${input.findingType}`;
    const existing = this.findings.get(key);
    if (existing && !['completed', 'rolled_back', 'denied', 'expired'].includes(existing.status)) return existing;
    const finding = { id: `finding-${this.findings.size + 1}`, status: 'detected' as FindingStatus, findingType: input.findingType };
    this.findings.set(key, finding);
    return finding;
  }

  async evaluatePolicies(input: { findingType: string; resourceId: string; findingId: string; evidence: Record<string, unknown>; estimatedMonthlySavingsCents: number }): Promise<PolicyEvaluation[]> {
    const evaluations: PolicyEvaluation[] = [];
    if (this.autoApprove.has(input.findingType)) evaluations.push({ policyId: 'test-policy', policyName: 'test auto-approve', mode: 'live', action: 'auto_approve', actionType: 'delete_volume', matched: true, safe: true, eligibleForApproval: true, reason: 'test', conditions: [] });
    if (this.dryRun.has(input.findingType)) {
      const evaluation = { policyId: 'dry-run-policy', policyName: 'test dry run', mode: 'dry_run' as const, action: 'auto_approve', actionType: 'delete_volume', matched: true, safe: true, eligibleForApproval: false, reason: 'Dry-run would auto-approve', conditions: [] };
      evaluations.push(evaluation);
      this.dryRunLog.push(evaluation);
    }
    return evaluations;
  }

  async transitionFinding(input: { findingId: string; toStatus: FindingStatus; reason: string }): Promise<void> {
    const finding = [...this.findings.values()].find((candidate) => candidate.id === input.findingId);
    assert.ok(finding);
    this.transitions.push({ id: input.findingId, from: finding.status, to: input.toStatus });
    if (input.toStatus === 'approved') this.approvalReason = input.reason;
    finding.status = input.toStatus;
  }
}

function points(resourceId: string, metricName: string, count: number, value: number): CloudMetricPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    resourceId,
    metricName,
    value,
    recordedAt: new Date(NOW.getTime() - (count - 1 - index) * DAY),
  }));
}

function context(resources: MetricsResource[], metrics: CloudMetricPoint[], store = new MemoryDetectionStore()): DetectorContext & { store: MemoryDetectionStore } {
  return {
    orgId: 'org-test',
    provider: new MockCloudMetricsProvider(resources, metrics, Object.fromEntries(resources.map((resource) => [resource.resourceId, 1000]))),
    store,
    config: detectionConfigFromEnv({
      UNATTACHED_VOLUME_DAYS: '14',
      IDLE_LOAD_BALANCER_WINDOW_DAYS: '7',
      UNDERUTILIZED_RDS_WINDOW_DAYS: '14',
      UNDERUTILIZED_RDS_MAX_AVG_CONNECTIONS: '1',
      UNDERUTILIZED_RDS_MAX_AVG_CPU_PERCENT: '10',
    }),
    now: () => NOW,
  };
}

test('unattached_volume fires at 14 zero-attachment days and not at 13', async () => {
  const resource = { resourceId: 'volume-1', resourceType: 'ebs_volume', externalId: 'vol-1', region: 'us-east-1' } as const;
  const exact = context([resource], points(resource.resourceId, 'volume_attachment_count', 14, 0));
  const exactResult = await detectUnattachedVolumes(exact);
  assert.equal(exactResult.findingsCreated, 1);
  assert.equal([...exact.store.findings.values()][0]?.status, 'proposed');

  const under = context([resource], points(resource.resourceId, 'volume_attachment_count', 13, 0));
  const underResult = await detectUnattachedVolumes(under);
  assert.equal(underResult.findingsCreated, 0);
  assert.equal(under.store.findings.size, 0);
});

test('idle_load_balancer fires at 7 zero-request days and not at 6', async () => {
  const resource = { resourceId: 'lb-1', resourceType: 'load_balancer', externalId: 'alb-1', region: 'us-east-1' } as const;
  const exact = context([resource], points(resource.resourceId, 'load_balancer_request_count', 7, 0));
  const exactResult = await detectIdleLoadBalancers(exact);
  assert.equal(exactResult.findingsCreated, 1);
  assert.equal([...exact.store.findings.values()][0]?.status, 'proposed');

  const under = context([resource], points(resource.resourceId, 'load_balancer_request_count', 6, 0));
  const underResult = await detectIdleLoadBalancers(under);
  assert.equal(underResult.findingsCreated, 0);
  assert.equal(under.store.findings.size, 0);
});

test('underutilized_rds requires 14 days of both metrics and fires at inclusive thresholds', async () => {
  const resource = { resourceId: 'rds-1', resourceType: 'rds_instance', externalId: 'db-1', region: 'us-east-1' } as const;
  const exactMetrics = [
    ...points(resource.resourceId, 'rds_connection_count', 14, 1),
    ...points(resource.resourceId, 'rds_cpu_percent', 14, 10),
  ];
  const exact = context([resource], exactMetrics);
  const exactResult = await detectUnderutilizedRds(exact);
  assert.equal(exactResult.findingsCreated, 1);
  assert.equal([...exact.store.findings.values()][0]?.status, 'proposed');

  const under = context([resource], [
    ...points(resource.resourceId, 'rds_connection_count', 13, 1),
    ...points(resource.resourceId, 'rds_cpu_percent', 13, 10),
  ]);
  const underResult = await detectUnderutilizedRds(under);
  assert.equal(underResult.findingsCreated, 0);
  assert.equal(under.store.findings.size, 0);
});

test('matching auto_approve policy advances detected findings through proposed to approved', async () => {
  const resource = { resourceId: 'volume-policy', resourceType: 'ebs_volume', externalId: 'vol-policy', region: 'us-east-1' } as const;
  const store = new MemoryDetectionStore();
  store.autoApprove.add('unattached_volume');
  const ctx = context([resource], points(resource.resourceId, 'volume_attachment_count', 14, 0), store);
  const result = await detectUnattachedVolumes(ctx);
  assert.equal(result.findingsAutoApproved, 1);
  assert.deepEqual(store.transitions.map((transition) => transition.to), ['proposed', 'approved']);
  assert.match(store.approvalReason ?? '', /test-policy/);
  assert.match(store.approvalReason ?? '', /matched conditions=/);
});

test('matching dry-run policy is evaluated and logged without approval', async () => {
  const resource = { resourceId: 'volume-dry-run', resourceType: 'ebs_volume', externalId: 'vol-dry-run', region: 'us-east-1' } as const;
  const store = new MemoryDetectionStore();
  store.dryRun.add('unattached_volume');
  const result = await detectUnattachedVolumes(context([resource], points(resource.resourceId, 'volume_attachment_count', 14, 0), store));
  assert.equal(result.findingsAutoApproved, 0);
  assert.deepEqual(store.transitions.map((transition) => transition.to), ['proposed']);
  assert.equal(store.dryRunLog[0]?.mode, 'dry_run');
  assert.equal(store.dryRunLog[0]?.eligibleForApproval, false);
});

test('rerunning the same detector reuses the open natural-key finding', async () => {
  const resource = { resourceId: 'volume-dedupe', resourceType: 'ebs_volume', externalId: 'vol-dedupe', region: 'us-east-1' } as const;
  const store = new MemoryDetectionStore();
  const ctx = context([resource], points(resource.resourceId, 'volume_attachment_count', 14, 0), store);
  const first = await detectUnattachedVolumes(ctx);
  const second = await detectUnattachedVolumes(ctx);
  assert.equal(first.findingsCreated, 1);
  assert.equal(second.findingsCreated, 0);
  assert.equal(second.findingsReused, 1);
  assert.equal(store.findings.size, 1);
});
