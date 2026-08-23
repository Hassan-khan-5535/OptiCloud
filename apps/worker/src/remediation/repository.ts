import { and, eq } from 'drizzle-orm';
import {
  auditLog,
  cloudAccounts,
  remediationActions,
  resources,
  transitionRemediationAction,
  transitionWasteFinding,
  type AuditActor,
  type Db,
  type FindingStatus,
  type RemediationActionStatus,
  type WasteFinding,
  wasteFindings,
} from '@cindr/db';
import type { CloudProviderName, RemediationResource, RollbackInstruction } from '@cindr/cloud-adapters';

export type ExecutionRecord = {
  findingId: string;
  findingType: string;
  findingStatus: FindingStatus;
  resource: RemediationResource;
  actionId: string | null;
  actionType: 'stop_instance' | 'detach_volume' | 'delete_volume' | 'resize_instance' | 'stop_load_balancer' | null;
  actionStatus: RemediationActionStatus | null;
  actionIdempotencyKey: string | null;
  isReversible: boolean | null;
  rollbackAction: Record<string, unknown> | null;
  executedAt: Date | null;
};

export class DrizzleRemediationRepository {
  constructor(private readonly db: Db) {}

  async getExecutionRecord(findingId: string): Promise<ExecutionRecord | null> {
    const [row] = await this.db.select({
      findingId: wasteFindings.id,
      findingType: wasteFindings.findingType,
      findingStatus: wasteFindings.status,
      resourceId: resources.id,
      cloudAccountId: resources.cloudAccountId,
      provider: cloudAccounts.provider,
      externalId: resources.externalId,
      resourceType: resources.type,
      region: resources.region,
      metadata: resources.metadata,
      actionId: remediationActions.id,
      actionType: remediationActions.actionType,
      actionStatus: remediationActions.status,
      actionIdempotencyKey: remediationActions.idempotencyKey,
      isReversible: remediationActions.isReversible,
      rollbackAction: remediationActions.rollbackAction,
      executedAt: remediationActions.executedAt,
    })
      .from(wasteFindings)
      .innerJoin(resources, eq(resources.id, wasteFindings.resourceId))
      .innerJoin(cloudAccounts, eq(cloudAccounts.id, resources.cloudAccountId))
      .leftJoin(remediationActions, eq(remediationActions.wasteFindingId, wasteFindings.id))
      .where(eq(wasteFindings.id, findingId))
      .limit(1);
    if (!row) return null;
    return {
      findingId: row.findingId,
      findingType: row.findingType,
      findingStatus: row.findingStatus,
      resource: {
        resourceId: row.resourceId,
        cloudAccountId: row.cloudAccountId,
        provider: row.provider as CloudProviderName,
        externalId: row.externalId,
        resourceType: row.resourceType,
        region: row.region,
        metadata: row.metadata,
      },
      actionId: row.actionId,
      actionType: row.actionType,
      actionStatus: row.actionStatus,
      actionIdempotencyKey: row.actionIdempotencyKey,
      isReversible: row.isReversible,
      rollbackAction: row.rollbackAction,
      executedAt: row.executedAt,
    };
  }

  async getExecutionRecordByActionId(actionId: string): Promise<ExecutionRecord | null> {
    const [row] = await this.db.select({ findingId: remediationActions.wasteFindingId })
      .from(remediationActions)
      .where(eq(remediationActions.id, actionId))
      .limit(1);
    return row ? this.getExecutionRecord(row.findingId) : null;
  }

  async ensureAction(input: {
    findingId: string;
    actionType: NonNullable<ExecutionRecord['actionType']>;
    isReversible: boolean;
    idempotencyKey: string;
  }): Promise<ExecutionRecord['actionId']> {
    const existing = await this.db.select({ id: remediationActions.id })
      .from(remediationActions)
      .where(eq(remediationActions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const inserted = await this.db.insert(remediationActions).values({
      wasteFindingId: input.findingId,
      actionType: input.actionType,
      isReversible: input.isReversible,
      idempotencyKey: input.idempotencyKey,
    }).onConflictDoNothing().returning({ id: remediationActions.id });
    if (inserted[0]) return inserted[0].id;

    const raced = await this.db.select({ id: remediationActions.id })
      .from(remediationActions)
      .where(eq(remediationActions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    return raced[0]?.id ?? null;
  }

  async setRollbackAction(actionId: string, rollbackAction: RollbackInstruction): Promise<void> {
    await this.db.update(remediationActions)
      .set({ rollbackAction, updatedAt: new Date() })
      .where(eq(remediationActions.id, actionId));
  }

  async transitionFinding(input: { findingId: string; toStatus: FindingStatus; actor: AuditActor; reason: string }): Promise<void> {
    await transitionWasteFinding(this.db, input);
  }

  async transitionAction(input: { actionId: string; toStatus: RemediationActionStatus; actor: AuditActor; reason: string }): Promise<void> {
    await transitionRemediationAction(this.db, input);
  }

  async recordActionNote(actionId: string, reason: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [action] = await tx.select({ status: remediationActions.status })
        .from(remediationActions)
        .where(eq(remediationActions.id, actionId))
        .limit(1);
      if (!action) throw new Error(`Remediation action not found: ${actionId}`);
      await tx.insert(auditLog).values({
        entityType: 'remediation_action',
        entityId: actionId,
        fromStatus: action.status,
        toStatus: action.status,
        actor: 'system',
        reason,
      });
    });
  }
}
