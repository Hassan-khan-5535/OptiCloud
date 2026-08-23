import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { auditLog, remediationActions, wasteFindings } from './schema.js';

export type FindingStatus = (typeof schema.wasteFindingStatusEnum.enumValues)[number];
export type RemediationActionStatus = (typeof schema.remediationActionStatusEnum.enumValues)[number];
export type AuditActor = 'system' | `slack_user_id:${string}`;
export type Db = NodePgDatabase<typeof schema>;

const findingTransitions: Record<FindingStatus, readonly FindingStatus[]> = {
  detected: ['proposed', 'denied', 'expired'],
  proposed: ['approved', 'denied', 'expired'],
  approved: ['executing', 'expired'],
  executing: ['completed', 'failed'],
  completed: ['rolled_back'],
  failed: ['executing', 'rolled_back'],
  rolled_back: [],
  denied: [],
  expired: [],
};

const actionTransitions: Record<RemediationActionStatus, readonly RemediationActionStatus[]> = {
  pending: ['executing'],
  executing: ['completed', 'failed'],
  completed: ['rolled_back'],
  failed: ['executing', 'rolled_back'],
  rolled_back: [],
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly entity: 'waste_finding' | 'remediation_action',
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(`Illegal ${entity} transition: ${fromStatus} -> ${toStatus}`);
    this.name = 'IllegalTransitionError';
  }
}

function canTransition<T extends string>(
  transitions: Record<T, readonly T[]>,
  fromStatus: T,
  toStatus: T,
): boolean {
  return fromStatus === toStatus || transitions[fromStatus].includes(toStatus);
}

export function assertFindingTransition(fromStatus: FindingStatus, toStatus: FindingStatus): void {
  if (!canTransition(findingTransitions, fromStatus, toStatus)) {
    throw new IllegalTransitionError('waste_finding', fromStatus, toStatus);
  }
}

export function assertRemediationActionTransition(fromStatus: RemediationActionStatus, toStatus: RemediationActionStatus): void {
  if (!canTransition(actionTransitions, fromStatus, toStatus)) {
    throw new IllegalTransitionError('remediation_action', fromStatus, toStatus);
  }
}

export function getFindingTransitions(): Readonly<Record<FindingStatus, readonly FindingStatus[]>> {
  return findingTransitions;
}

export function getRemediationActionTransitions(): Readonly<Record<RemediationActionStatus, readonly RemediationActionStatus[]>> {
  return actionTransitions;
}

export async function transitionWasteFinding(
  db: Db,
  input: { findingId: string; toStatus: FindingStatus; actor: AuditActor; reason?: string },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(wasteFindings).where(eq(wasteFindings.id, input.findingId)).for('update');
    if (!current) throw new Error(`Waste finding not found: ${input.findingId}`);
    assertFindingTransition(current.status, input.toStatus);
    if (current.status === input.toStatus) return current;

    const [updated] = await tx.update(wasteFindings)
      .set({ status: input.toStatus, updatedAt: new Date() })
      .where(and(eq(wasteFindings.id, current.id), eq(wasteFindings.status, current.status)))
      .returning();
    if (!updated) throw new Error(`Waste finding changed while transitioning: ${input.findingId}`);

    await tx.insert(auditLog).values({
      entityType: 'waste_finding',
      entityId: current.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      actor: input.actor,
      reason: input.reason,
    });
    return updated;
  });
}

export async function transitionRemediationAction(
  db: Db,
  input: { actionId: string; toStatus: RemediationActionStatus; actor: AuditActor; reason?: string },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(remediationActions).where(eq(remediationActions.id, input.actionId)).for('update');
    if (!current) throw new Error(`Remediation action not found: ${input.actionId}`);
    assertRemediationActionTransition(current.status, input.toStatus);
    if (current.status === input.toStatus) return current;

    const completedAt = input.toStatus === 'completed' ? new Date() : undefined;
    const [updated] = await tx.update(remediationActions)
      .set({
        status: input.toStatus,
        updatedAt: new Date(),
        ...(completedAt ? { executedAt: completedAt, executedBy: input.actor } : {}),
      })
      .where(and(eq(remediationActions.id, current.id), eq(remediationActions.status, current.status)))
      .returning();
    if (!updated) throw new Error(`Remediation action changed while transitioning: ${input.actionId}`);

    await tx.insert(auditLog).values({
      entityType: 'remediation_action',
      entityId: current.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      actor: input.actor,
      reason: input.reason,
    });
    return updated;
  });
}
