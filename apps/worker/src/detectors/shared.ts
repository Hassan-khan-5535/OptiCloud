import { and, eq, notInArray } from 'drizzle-orm';
import type { CloudMetricPoint, CloudMetricsProvider, MetricsResource } from '@cindr/cloud-adapters';
import { auditLog, createDb, policies, policyEvaluations, resources, wasteFindings } from '@cindr/db';
import { transitionWasteFinding, orgScope, type AuditActor, type Db, type FindingStatus } from '@cindr/db';
import { resourceMetrics } from '@cindr/db';
import { evaluatePolicy, type PolicyEvaluation, type PolicyEvaluationContext } from './policy-engine.js';

export const OPEN_FINDING_STATUSES: FindingStatus[] = ['detected', 'proposed', 'approved', 'executing', 'failed'];

export type DetectionConfig = {
  unattachedVolumeDays: number;
  idleLoadBalancerWindowDays: number;
  underutilizedRdsWindowDays: number;
  underutilizedRdsMaxAvgConnections: number;
  underutilizedRdsMaxAvgCpuPercent: number;
  schedule: string;
  detectionIntervalMs: number;
};

export function detectionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DetectionConfig {
  const numberFromEnv = (name: string, fallback: number) => {
    const parsed = Number(env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    unattachedVolumeDays: numberFromEnv('UNATTACHED_VOLUME_DAYS', 14),
    idleLoadBalancerWindowDays: numberFromEnv('IDLE_LOAD_BALANCER_WINDOW_DAYS', 7),
    underutilizedRdsWindowDays: numberFromEnv('UNDERUTILIZED_RDS_WINDOW_DAYS', 14),
    underutilizedRdsMaxAvgConnections: numberFromEnv('UNDERUTILIZED_RDS_MAX_AVG_CONNECTIONS', 1),
    underutilizedRdsMaxAvgCpuPercent: numberFromEnv('UNDERUTILIZED_RDS_MAX_AVG_CPU_PERCENT', 10),
    schedule: env.DETECTION_SCHEDULE ?? '0 * * * *',
    detectionIntervalMs: numberFromEnv('DETECTION_INTERVAL_MS', 60 * 60 * 1000),
  };
}

export type DetectionFindingInput = {
  resourceId: string;
  findingType: string;
  evidence: Record<string, unknown>;
  estimatedMonthlySavingsCents: number;
};

export type DetectionStore = {
  recordMetrics(points: CloudMetricPoint[]): Promise<void>;
  upsertFinding(input: DetectionFindingInput): Promise<{ id: string; status: FindingStatus } | null>;
  evaluatePolicies(input: PolicyEvaluationContext & { resourceId: string; findingId: string }): Promise<PolicyEvaluation[]>;
  transitionFinding(input: { orgId: string; findingId: string; toStatus: FindingStatus; actor: AuditActor; reason: string }): Promise<void>;
};

export class DrizzleDetectionStore implements DetectionStore {
  constructor(private readonly db: Db, private readonly orgId: string) {}

  async recordMetrics(points: CloudMetricPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.db.insert(resourceMetrics).values(points.map((point) => ({
      orgId: this.orgId,
      resourceId: point.resourceId,
      metricName: point.metricName,
      value: point.value,
      recordedAt: point.recordedAt,
    })));
  }

  async upsertFinding(input: DetectionFindingInput): Promise<{ id: string; status: FindingStatus } | null> {
    const inserted = await this.db.insert(wasteFindings).values({
      orgId: this.orgId,
      resourceId: input.resourceId,
      findingType: input.findingType,
      evidence: input.evidence,
      estimatedMonthlySavingsCents: input.estimatedMonthlySavingsCents,
      status: 'detected',
    }).onConflictDoNothing().returning({ id: wasteFindings.id, status: wasteFindings.status });
    if (inserted[0]) return inserted[0];

    const existing = await this.db.select({ id: wasteFindings.id, status: wasteFindings.status })
      .from(wasteFindings)
      .where(and(
        orgScope(wasteFindings.orgId, this.orgId),
        eq(wasteFindings.resourceId, input.resourceId),
        eq(wasteFindings.findingType, input.findingType),
        notInArray(wasteFindings.status, ['completed', 'rolled_back', 'denied', 'expired']),
      ))
      .limit(1);
    return existing[0] ?? null;
  }

  async evaluatePolicies(input: PolicyEvaluationContext & { resourceId: string; findingId: string }): Promise<PolicyEvaluation[]> {
    const rows = await this.db.select({ id: policies.id, active: policies.active, rule: policies.rule })
      .from(policies)
      .innerJoin(resources, eq(resources.cloudAccountId, policies.cloudAccountId))
      .where(and(
        orgScope(resources.orgId, this.orgId, eq(resources.id, input.resourceId)),
        orgScope(policies.orgId, this.orgId),
      ));
    const evaluations = rows.map((policy) => evaluatePolicy(policy, input));
    for (const evaluation of evaluations) {
      await this.db.insert(policyEvaluations).values({
        orgId: this.orgId,
        policyId: evaluation.policyId,
        wasteFindingId: input.findingId,
        mode: evaluation.mode,
        matched: evaluation.matched,
        safe: evaluation.safe,
        conditionResults: evaluation.conditions,
      });
      if (evaluation.mode === 'dry_run' && evaluation.matched) {
        await this.db.insert(auditLog).values({
          orgId: this.orgId,
          entityType: 'waste_finding',
          entityId: input.findingId,
          fromStatus: null,
          toStatus: 'detected',
          actor: 'system',
          reason: `Dry-run policy ${evaluation.policyId} (${evaluation.policyName}) would ${evaluation.action}; evaluation=${JSON.stringify(evaluation)}`,
        });
      }
    }
    return evaluations;
  }

  async transitionFinding(input: { orgId: string; findingId: string; toStatus: FindingStatus; actor: AuditActor; reason: string }): Promise<void> {
    if (input.orgId !== this.orgId) throw new Error('Cross-organization transition rejected');
    await transitionWasteFinding(this.db, input);
  }
}

export function createDrizzleDetectionStore(orgId: string): { store: DrizzleDetectionStore; pool: import('pg').Pool; db: Db } {
  const { db, pool } = createDb();
  return { store: new DrizzleDetectionStore(db, orgId), pool, db };
}

export type DetectorContext = {
  orgId: string;
  provider: CloudMetricsProvider;
  store: DetectionStore;
  config: DetectionConfig;
  now?: () => Date;
  actor?: AuditActor;
};

export type DetectorResult = {
  detector: string;
  scanned: number;
  metricsStored: number;
  findingsCreated: number;
  findingsReused: number;
  findingsProposed: number;
  findingsAutoApproved: number;
};

export function emptyDetectorResult(detector: string): DetectorResult {
  return { detector, scanned: 0, metricsStored: 0, findingsCreated: 0, findingsReused: 0, findingsProposed: 0, findingsAutoApproved: 0 };
}

export async function persistDetection(ctx: DetectorContext, input: DetectionFindingInput, result: DetectorResult): Promise<void> {
  const finding = await ctx.store.upsertFinding(input);
  if (!finding) return;
  const wasCreated = finding.status === 'detected';
  if (wasCreated) result.findingsCreated += 1;
  else result.findingsReused += 1;
  const actor = ctx.actor ?? 'system';
  const evaluations = await ctx.store.evaluatePolicies({
    resourceId: input.resourceId,
    findingId: finding.id,
    findingType: input.findingType,
    evidence: input.evidence,
    estimatedMonthlySavingsCents: input.estimatedMonthlySavingsCents,
  });
  const approvedBy = evaluations.find((evaluation) => evaluation.eligibleForApproval);
  if (finding.status !== 'detected') return;
  await ctx.store.transitionFinding({
    orgId: ctx.orgId,
    findingId: finding.id,
    toStatus: 'proposed',
    actor,
    reason: `Detection threshold crossed for ${input.findingType}`,
  });
  result.findingsProposed += 1;
  if (approvedBy) {
    await ctx.store.transitionFinding({
      orgId: ctx.orgId,
      findingId: finding.id,
      toStatus: 'approved',
      actor,
      reason: `Policy ${approvedBy.policyId} (${approvedBy.policyName}) auto-approved ${input.findingType}; matched conditions=${JSON.stringify(approvedBy.conditions)}`,
    });
    result.findingsAutoApproved += 1;
  }
}

export function pointsForMetric(points: CloudMetricPoint[], metricName: string): CloudMetricPoint[] {
  return points.filter((point) => point.metricName === metricName).sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
}

export function uniqueUtcDays(points: Array<Pick<CloudMetricPoint, 'recordedAt'>>): number {
  return new Set(points.map((point) => point.recordedAt.toISOString().slice(0, 10))).size;
}

export function rollingWindowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Cost estimates are intentionally rough. Provider-reported monthly cost is
 * preferred; metadata fallbacks are simple list-price approximations only and
 * should be replaced with Cost Explorer data before financial decisions rely on them.
 */
export function roughMonthlySavingsCents(resource: MetricsResource, providerMonthlyCostCents: number): number {
  if (providerMonthlyCostCents > 0) return Math.round(providerMonthlyCostCents);
  const metadata = resource.metadata ?? {};
  if (resource.resourceType === 'ebs_volume') return Math.round(Number(metadata.sizeGiB ?? 0) * 8);
  if (resource.resourceType === 'load_balancer') return 2000;
  if (resource.resourceType === 'rds_instance') return 5000;
  return 0;
}
