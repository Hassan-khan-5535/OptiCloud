import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  buildPolicyRule,
  cloudAccounts,
  parsePolicyRule,
  policies,
  policyEvaluations,
  remediationActions,
  resources,
  wasteFindings,
  type Db,
  type PolicyCondition,
  type PolicyAction,
  orgScope,
} from '@cindr/db';

const OPEN_DASHBOARD_STATUSES = ['detected', 'proposed', 'approved', 'executing'] as const;
type JsonRecord = Record<string, unknown>;

export type PolicyInput = {
  cloudAccountId?: string;
  name: string;
  findingType: string;
  action: PolicyAction;
  conditions: PolicyCondition[];
  active: boolean;
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

export async function getDashboardOverview(db: Db, orgId: string) {
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
  }).from(wasteFindings)
    .innerJoin(resources, eq(resources.id, wasteFindings.resourceId))
    .innerJoin(cloudAccounts, eq(cloudAccounts.id, resources.cloudAccountId))
    .where(orgScope(wasteFindings.orgId, orgId, inArray(wasteFindings.status, [...OPEN_DASHBOARD_STATUSES])));
  const completedRows = await db.select({ savings: wasteFindings.estimatedMonthlySavingsCents }).from(wasteFindings).where(orgScope(wasteFindings.orgId, orgId, eq(wasteFindings.status, 'completed')));
  return {
    totals: {
      detectedMonthlyWasteCents: openRows.reduce((sum, row) => sum + row.estimatedMonthlySavingsCents, 0),
      remediatedToDateCents: completedRows.reduce((sum, row) => sum + row.savings, 0),
      openFindingCount: openRows.length,
    },
    findings: openRows.map(serializeFinding),
  };
}

export async function getFindingDetail(db: Db, findingId: string, orgId: string) {
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
  }).from(wasteFindings)
    .innerJoin(resources, eq(resources.id, wasteFindings.resourceId))
    .innerJoin(cloudAccounts, eq(cloudAccounts.id, resources.cloudAccountId))
    .leftJoin(remediationActions, eq(remediationActions.wasteFindingId, wasteFindings.id))
    .where(orgScope(wasteFindings.orgId, orgId, eq(wasteFindings.id, findingId))).limit(1);
  if (!row) return null;
  const audit = await db.select({
    id: auditLog.id,
    fromStatus: auditLog.fromStatus,
    toStatus: auditLog.toStatus,
    actor: auditLog.actor,
    reason: auditLog.reason,
    createdAt: auditLog.createdAt,
  }).from(auditLog).where(orgScope(auditLog.orgId, orgId, and(eq(auditLog.entityType, 'waste_finding'), eq(auditLog.entityId, findingId)))).orderBy(auditLog.createdAt);
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as JsonRecord : {};
  const currentMonthlyCostCents = typeof metadata.currentMonthlyCostCents === 'number' ? metadata.currentMonthlyCostCents : row.estimatedMonthlySavingsCents;
  return {
    ...serializeFinding({ id: row.id, findingType: row.findingType, status: row.status, evidence: row.evidence, estimatedMonthlySavingsCents: row.estimatedMonthlySavingsCents, detectedAt: row.detectedAt, updatedAt: row.updatedAt, resourceId: row.resourceId, resourceExternalId: row.resourceExternalId, resourceType: row.resourceType, region: row.region, accountProvider: row.accountProvider, accountExternalId: row.accountExternalId }),
    accountId: row.accountId,
    costModel: {
      currentMonthlyCostCents,
      projectedMonthlySavingsCents: row.estimatedMonthlySavingsCents,
      explanation: typeof metadata.currentMonthlyCostCents === 'number' ? 'Savings are based on the provider-reported monthly cost stored with this resource.' : 'Savings use the detector cost estimate. Provider-reported Cost Explorer data is preferred when available; metadata fallbacks are rough list-price approximations.',
    },
    remediationAction: row.remediationActionId ? { id: row.remediationActionId, actionType: row.remediationActionType, isReversible: row.remediationIsReversible, status: row.remediationStatus, rollbackAction: row.rollbackAction } : null,
    auditLog: audit.map((entry) => ({ ...entry, createdAt: serializeDate(entry.createdAt) })),
  };
}

export async function listPolicies(db: Db, orgId: string) {
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
  }).from(policies).innerJoin(cloudAccounts, eq(cloudAccounts.id, policies.cloudAccountId)).where(orgScope(policies.orgId, orgId)).orderBy(desc(policies.createdAt));
  const evaluations = await db.select({
    id: policyEvaluations.id,
    policyId: policyEvaluations.policyId,
    wasteFindingId: policyEvaluations.wasteFindingId,
    mode: policyEvaluations.mode,
    matched: policyEvaluations.matched,
    safe: policyEvaluations.safe,
    conditionResults: policyEvaluations.conditionResults,
    createdAt: policyEvaluations.createdAt,
  }).from(policyEvaluations).where(orgScope(policyEvaluations.orgId, orgId)).orderBy(desc(policyEvaluations.createdAt));

  return rows.map((row) => ({ ...row, parsedRule: parsePolicyRule(row.rule).value })).filter((row): row is typeof row & { parsedRule: NonNullable<ReturnType<typeof parsePolicyRule>['value']> } => !!row.parsedRule).map((row) => ({
    id: row.id,
    rule: row.parsedRule,
    createdBy: row.createdBy,
    active: row.active,
    mode: row.active ? 'live' as const : 'dry_run' as const,
    createdAt: serializeDate(row.createdAt),
    updatedAt: serializeDate(row.updatedAt),
    account: { id: row.accountId, provider: row.provider, externalId: row.accountExternalId },
    dryRunMatches: evaluations.filter((evaluation) => evaluation.policyId === row.id && evaluation.mode === 'dry_run' && evaluation.matched).slice(0, 20).map((evaluation) => ({
      id: evaluation.id,
      findingId: evaluation.wasteFindingId,
      matched: evaluation.matched,
      safe: evaluation.safe,
      conditionResults: evaluation.conditionResults,
      createdAt: serializeDate(evaluation.createdAt),
    })),
  }));
}

export async function listAccounts(db: Db, orgId: string) {
  const rows = await db.select({ id: cloudAccounts.id, provider: cloudAccounts.provider, externalId: cloudAccounts.externalId, createdAt: cloudAccounts.createdAt }).from(cloudAccounts).where(eq(cloudAccounts.orgId, orgId)).orderBy(desc(cloudAccounts.createdAt));
  return rows.map((row) => ({ id: row.id, provider: row.provider, externalId: row.externalId, status: 'connected' as const, createdAt: serializeDate(row.createdAt) }));
}

export function validatePolicyInput(input: unknown): { value?: PolicyInput; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Request body must be an object' };
  const body = input as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const findingType = typeof body.finding_type === 'string' ? body.finding_type.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() as PolicyAction : undefined;
  const cloudAccountId = typeof body.cloud_account_id === 'string' ? body.cloud_account_id.trim() : undefined;
  if (body.active !== undefined && typeof body.active !== 'boolean') return { error: 'active must be a boolean' };
  const active = body.active === undefined ? true : body.active === true;
  if (!name) return { error: 'name is required' };
  if (!findingType) return { error: 'finding_type is required' };
  if (action !== 'auto_approve' && action !== 'manual_review') return { error: 'action must be auto_approve or manual_review' };
  if (!Array.isArray(body.conditions)) return { error: 'conditions must be an array' };
  const parsed = parsePolicyRule({ version: 1, name, finding_type: findingType, action, all: body.conditions });
  if (!parsed.value) return { error: parsed.error ?? 'Invalid policy rule' };
  return { value: { cloudAccountId, name, findingType, action, conditions: [...parsed.value.all], active } };
}

export async function createPolicy(db: Db, input: PolicyInput, orgId: string, createdBy = 'dashboard') {
  const accountId = input.cloudAccountId
    ? (await db.select({ id: cloudAccounts.id }).from(cloudAccounts).where(and(eq(cloudAccounts.id, input.cloudAccountId), eq(cloudAccounts.orgId, orgId))).limit(1))[0]?.id
    : (await db.select({ id: cloudAccounts.id }).from(cloudAccounts).where(eq(cloudAccounts.orgId, orgId)).orderBy(cloudAccounts.createdAt).limit(1))[0]?.id;
  if (input.cloudAccountId && !accountId) throw new Error('Cloud account not found for organization');
  if (!accountId) throw new Error('No connected cloud account is available');
  const rule = buildPolicyRule({ name: input.name, findingType: input.findingType, action: input.action, conditions: input.conditions });
  const [created] = await db.insert(policies).values({ orgId, cloudAccountId: accountId, rule, createdBy, active: input.active }).returning({ id: policies.id });
  return { id: created?.id, rule, cloudAccountId: accountId, active: input.active };
}
