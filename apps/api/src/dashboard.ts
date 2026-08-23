import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  cloudAccounts,
  policies,
  remediationActions,
  resources,
  wasteFindings,
  type Db,
} from '@cindr/db';

const OPEN_DASHBOARD_STATUSES = ['detected', 'proposed', 'approved', 'executing'] as const;
const FINDING_TYPES = ['unattached_volume', 'idle_load_balancer', 'underutilized_rds'] as const;
const POLICY_ACTIONS = ['auto_approve', 'manual_review'] as const;

type JsonRecord = Record<string, unknown>;

export type PolicyInput = {
  cloudAccountId?: string;
  findingType: string;
  minAgeDays?: number;
  threshold?: number;
  action: string;
};

function asRule(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function serializeFinding(row: {
  id: string;
  findingType: string;
  status: string;
  evidence: JsonRecord;
  estimatedMonthlySavingsCents: number;
  detectedAt: Date;
  updatedAt: Date;
  resourceId: string;
  resourceExternalId: string;
  resourceType: string;
  region: string;
  accountProvider: string;
  accountExternalId: string;
}) {
  return {
    id: row.id,
    findingType: row.findingType,
    status: row.status,
    evidence: row.evidence,
    estimatedMonthlySavingsCents: row.estimatedMonthlySavingsCents,
    detectedAt: serializeDate(row.detectedAt),
    updatedAt: serializeDate(row.updatedAt),
    resource: {
      id: row.resourceId,
      externalId: row.resourceExternalId,
      type: row.resourceType,
      region: row.region,
      provider: row.accountProvider,
      accountExternalId: row.accountExternalId,
    },
  };
}

export async function getDashboardOverview(db: Db) {
  const openRows = await db.select({
    id: wasteFindings.id,
    findingType: wasteFindings.findingType,
    status: wasteFindings.status,
    evidence: wasteFindings.evidence,
    estimatedMonthlySavingsCents: wasteFindings.estimatedMonthlySavingsCents,
    detectedAt: wasteFindings.detectedAt,
    updatedAt: wasteFindings.updatedAt,
    resourceId: resources.id,
    resourceExternalId: resources.externalId,
    resourceType: resources.type,
    region: resources.region,
    accountProvider: cloudAccounts.provider,
    accountExternalId: cloudAccounts.externalId,
  })
    .from(wasteFindings)
    .innerJoin(resources, eq(resources.id, wasteFindings.resourceId))
    .innerJoin(cloudAccounts, eq(cloudAccounts.id, resources.cloudAccountId))
    .where(inArray(wasteFindings.status, [...OPEN_DASHBOARD_STATUSES]));

  const completedRows = await db.select({ savings: wasteFindings.estimatedMonthlySavingsCents })
    .from(wasteFindings)
    .where(eq(wasteFindings.status, 'completed'));

  return {
    totals: {
      detectedMonthlyWasteCents: openRows.reduce((sum, row) => sum + row.estimatedMonthlySavingsCents, 0),
      remediatedToDateCents: completedRows.reduce((sum, row) => sum + row.savings, 0),
      openFindingCount: openRows.length,
    },
    findings: openRows.map(serializeFinding),
  };
}

export async function getFindingDetail(db: Db, findingId: string) {
  const [row] = await db.select({
    id: wasteFindings.id,
    findingType: wasteFindings.findingType,
    status: wasteFindings.status,
    evidence: wasteFindings.evidence,
    estimatedMonthlySavingsCents: wasteFindings.estimatedMonthlySavingsCents,
    detectedAt: wasteFindings.detectedAt,
    updatedAt: wasteFindings.updatedAt,
    resourceId: resources.id,
    resourceExternalId: resources.externalId,
    resourceType: resources.type,
    region: resources.region,
    metadata: resources.metadata,
    accountId: cloudAccounts.id,
    accountProvider: cloudAccounts.provider,
    accountExternalId: cloudAccounts.externalId,
    remediationActionId: remediationActions.id,
    remediationActionType: remediationActions.actionType,
    remediationIsReversible: remediationActions.isReversible,
    remediationStatus: remediationActions.status,
    rollbackAction: remediationActions.rollbackAction,
  })
    .from(wasteFindings)
    .innerJoin(resources, eq(resources.id, wasteFindings.resourceId))
    .innerJoin(cloudAccounts, eq(cloudAccounts.id, resources.cloudAccountId))
    .leftJoin(remediationActions, eq(remediationActions.wasteFindingId, wasteFindings.id))
    .where(eq(wasteFindings.id, findingId))
    .limit(1);

  if (!row) return null;

  const audit = await db.select({
    id: auditLog.id,
    fromStatus: auditLog.fromStatus,
    toStatus: auditLog.toStatus,
    actor: auditLog.actor,
    reason: auditLog.reason,
    createdAt: auditLog.createdAt,
  })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, 'waste_finding'), eq(auditLog.entityId, findingId)))
    .orderBy(auditLog.createdAt);

  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as JsonRecord : {};
  const currentMonthlyCostCents = typeof metadata.currentMonthlyCostCents === 'number'
    ? metadata.currentMonthlyCostCents
    : row.estimatedMonthlySavingsCents;

  return {
    ...serializeFinding({
      id: row.id,
      findingType: row.findingType,
      status: row.status,
      evidence: row.evidence,
      estimatedMonthlySavingsCents: row.estimatedMonthlySavingsCents,
      detectedAt: row.detectedAt,
      updatedAt: row.updatedAt,
      resourceId: row.resourceId,
      resourceExternalId: row.resourceExternalId,
      resourceType: row.resourceType,
      region: row.region,
      accountProvider: row.accountProvider,
      accountExternalId: row.accountExternalId,
    }),
    accountId: row.accountId,
    costModel: {
      currentMonthlyCostCents,
      projectedMonthlySavingsCents: row.estimatedMonthlySavingsCents,
      explanation: typeof metadata.currentMonthlyCostCents === 'number'
        ? 'Savings are based on the provider-reported monthly cost stored with this resource.'
        : 'Savings use the detector cost estimate. Provider-reported Cost Explorer data is preferred when available; metadata fallbacks are rough list-price approximations.',
    },
    remediationAction: row.remediationActionId ? {
      id: row.remediationActionId,
      actionType: row.remediationActionType,
      isReversible: row.remediationIsReversible,
      status: row.remediationStatus,
      rollbackAction: row.rollbackAction,
    } : null,
    auditLog: audit.map((entry) => ({ ...entry, createdAt: serializeDate(entry.createdAt) })),
  };
}

export async function listPolicies(db: Db) {
  const rows = await db.select({
    id: policies.id,
    rule: policies.rule,
    createdBy: policies.createdBy,
    active: policies.active,
    createdAt: policies.createdAt,
    updatedAt: policies.updatedAt,
    accountId: cloudAccounts.id,
    provider: cloudAccounts.provider,
    accountExternalId: cloudAccounts.externalId,
  })
    .from(policies)
    .innerJoin(cloudAccounts, eq(cloudAccounts.id, policies.cloudAccountId))
    .orderBy(desc(policies.createdAt));

  return rows
    .map((row) => ({
      id: row.id,
      rule: asRule(row.rule),
      createdBy: row.createdBy,
      active: row.active,
      createdAt: serializeDate(row.createdAt),
      updatedAt: serializeDate(row.updatedAt),
      account: { id: row.accountId, provider: row.provider, externalId: row.accountExternalId },
    }))
    .filter((policy) => policy.active && policy.rule.action === 'auto_approve');
}

export async function listAccounts(db: Db) {
  const rows = await db.select({
    id: cloudAccounts.id,
    provider: cloudAccounts.provider,
    externalId: cloudAccounts.externalId,
    createdAt: cloudAccounts.createdAt,
  }).from(cloudAccounts).orderBy(desc(cloudAccounts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    status: 'connected' as const,
    createdAt: serializeDate(row.createdAt),
  }));
}

export function validatePolicyInput(input: unknown): { value?: PolicyInput; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Request body must be an object' };
  const body = input as Record<string, unknown>;
  const findingType = typeof body.finding_type === 'string' ? body.finding_type.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const cloudAccountId = typeof body.cloud_account_id === 'string' ? body.cloud_account_id.trim() : undefined;
  const minAgeDays = body.min_age_days === undefined || body.min_age_days === '' ? undefined : Number(body.min_age_days);
  const threshold = body.threshold === undefined || body.threshold === '' ? undefined : Number(body.threshold);

  if (!findingType || !FINDING_TYPES.includes(findingType as typeof FINDING_TYPES[number])) {
    return { error: `finding_type must be one of: ${FINDING_TYPES.join(', ')}` };
  }
  if (!POLICY_ACTIONS.includes(action as typeof POLICY_ACTIONS[number])) {
    return { error: `action must be one of: ${POLICY_ACTIONS.join(', ')}` };
  }
  if (minAgeDays === undefined && threshold === undefined) return { error: 'Provide min_age_days or threshold' };
  if (minAgeDays !== undefined && (!Number.isFinite(minAgeDays) || minAgeDays < 0)) return { error: 'min_age_days must be a non-negative number' };
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0)) return { error: 'threshold must be a non-negative number' };
  if (minAgeDays !== undefined && threshold !== undefined) return { error: 'Provide only one of min_age_days or threshold' };

  return {
    value: {
      cloudAccountId,
      findingType,
      minAgeDays,
      threshold,
      action,
    },
  };
}

export async function createPolicy(db: Db, input: PolicyInput) {
  const accountId = input.cloudAccountId ?? (await db.select({ id: cloudAccounts.id }).from(cloudAccounts).orderBy(cloudAccounts.createdAt).limit(1))[0]?.id;
  if (!accountId) throw new Error('No connected cloud account is available');

  const rule: JsonRecord = {
    finding_type: input.findingType,
    action: input.action,
    ...(input.minAgeDays !== undefined ? { min_age_days: input.minAgeDays } : {}),
    ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
  };
  const [created] = await db.insert(policies).values({
    cloudAccountId: accountId,
    rule,
    createdBy: 'dashboard',
    active: true,
  }).returning({ id: policies.id });

  return { id: created?.id, rule, cloudAccountId: accountId };
}
