import type { CloudRemediationProvider, RemediationResource, RollbackInstruction } from '@cindr/cloud-adapters';
import type { AuditActor, FindingStatus, RemediationActionStatus } from '@cindr/db';
import type { ExecutionRecord, DrizzleRemediationRepository } from './repository.js';
import type { ProviderRateLimiter } from './rate-limiter.js';
import { actionPlanForFinding, type ActionPlan } from './action-plan.js';
export { actionPlanForFinding } from './action-plan.js';

export type RemediationJob = { kind: 'remediation'; findingId: string; attempt?: number };
export type RollbackJob = { kind: 'rollback'; remediationActionId: string };

export type RemediationRepository = Pick<DrizzleRemediationRepository,
  'getExecutionRecord' | 'ensureAction' | 'setRollbackAction' | 'transitionFinding' | 'transitionAction' | 'recordActionNote' | 'updateResourceExternalId'> & {
  getExecutionRecordByActionId?(actionId: string): Promise<ExecutionRecord | null>;
};

export type RemediationEngine = {
  executeFinding(findingId: string): Promise<{ status: 'completed' | 'failed' | 'skipped' | 'manual_review'; actionId?: string; reason?: string }>;
  rollbackRemediation(remediationActionId: string): Promise<{ status: 'rolled_back' | 'failed' | 'skipped'; reason?: string }>;
};

const actor: AuditActor = 'system';

function parseRollbackInstruction(input: Record<string, unknown>): RollbackInstruction {
  const actionType = input.actionType;
  const required = ['cloudAccountId', 'provider', 'resourceExternalId', 'region'];
  if (typeof actionType !== 'string' || !['restore_volume_snapshot', 'start_load_balancer', 'resize_instance'].includes(actionType) || required.some((key) => typeof input[key] !== 'string')) {
    throw new Error('Persisted rollback instructions are invalid or incomplete');
  }
  if (actionType === 'restore_volume_snapshot' && (typeof input.snapshotId !== 'string' || typeof input.availabilityZone !== 'string')) {
    throw new Error('EBS rollback requires snapshotId and availabilityZone');
  }
  if (actionType === 'resize_instance' && typeof input.instanceType !== 'string') {
    throw new Error('RDS rollback requires the previous instance type');
  }
  return input as unknown as RollbackInstruction;
}

const resizeTiers: Record<string, string> = {
  'db.t3.2xlarge': 'db.t3.xlarge',
  'db.t3.xlarge': 'db.t3.large',
  'db.t3.large': 'db.t3.medium',
  'db.t3.medium': 'db.t3.small',
  'db.t3.small': 'db.t3.micro',
  'db.m5.4xlarge': 'db.m5.2xlarge',
  'db.m5.2xlarge': 'db.m5.xlarge',
  'db.m5.xlarge': 'db.m5.large',
  'db.m5.large': 'db.t3.medium',
};

export function resizeDownOneTier(instanceType: string | undefined): string {
  if (!instanceType || !resizeTiers[instanceType]) throw new Error(`Cannot safely infer one-tier-down RDS size from ${instanceType ?? 'missing instance type'}`);
  return resizeTiers[instanceType];
}

export class DefaultRemediationEngine implements RemediationEngine {
  constructor(
    private readonly repository: RemediationRepository,
    private readonly provider: CloudRemediationProvider,
    private readonly rateLimiter: ProviderRateLimiter,
  ) {}

  async executeFinding(findingId: string): Promise<{ status: 'completed' | 'failed' | 'skipped' | 'manual_review'; actionId?: string; reason?: string }> {
    let record = await this.repository.getExecutionRecord(findingId);
    if (!record) throw new Error(`Waste finding not found: ${findingId}`);

    const existingAction = record.actionId && record.actionStatus ? record : null;
    if (existingAction?.actionStatus === 'completed' || existingAction?.actionStatus === 'rolled_back') {
      await this.repository.recordActionNote(existingAction.actionId!, 'Idempotent remediation retry skipped because the action already completed successfully.');
      return { status: 'skipped', actionId: existingAction.actionId! };
    }
    if (record.findingStatus !== 'approved' && record.findingStatus !== 'failed') {
      throw new Error(`Finding ${findingId} is ${record.findingStatus}; remediation requires approved or failed status`);
    }

    const plan = actionPlanForFinding(record, this.provider.supportsStoppedLoadBalancer ?? true);
    const actionIdempotencyKey = `cindr:${record.resource.cloudAccountId}:${findingId}:${plan.actionType}`;
    const actionId = record.actionId ?? await this.repository.ensureAction({
      findingId,
      actionType: plan.actionType,
      isReversible: plan.isReversible,
      idempotencyKey: actionIdempotencyKey,
    });
    if (!actionId) throw new Error(`Unable to create remediation action for ${findingId}`);
    record = { ...record, actionId, actionType: plan.actionType, actionStatus: record.actionStatus ?? 'pending' };

    if (plan.manualReview) {
      await this.failExecution(record, actionId, plan.manualReview);
      return { status: 'manual_review', actionId, reason: plan.manualReview };
    }

    await this.repository.transitionFinding({ findingId, toStatus: 'executing', actor, reason: 'Approved remediation execution started' });
    if (record.actionStatus !== 'executing') {
      await this.repository.transitionAction({ actionId, toStatus: 'executing', actor, reason: 'Remediation provider call is starting' });
    }

    try {
      await this.executeAction(plan.actionType, record, actionId);
      await this.repository.transitionAction({ actionId, toStatus: 'completed', actor, reason: 'Provider remediation completed successfully' });
      await this.repository.transitionFinding({ findingId, toStatus: 'completed', actor, reason: 'Remediation action completed successfully' });
      return { status: 'completed', actionId };
    } catch (error) {
      const reason = `Provider remediation failed: ${error instanceof Error ? error.message : String(error)}`;
      await this.failExecution(record, actionId, reason);
      return { status: 'failed', actionId, reason };
    }
  }

  private async executeAction(actionType: NonNullable<ExecutionRecord['actionType']>, record: ExecutionRecord, actionId: string) {
    switch (actionType) {
      case 'delete_volume': {
        const availabilityZone = typeof record.resource.metadata?.availabilityZone === 'string'
          ? record.resource.metadata.availabilityZone
          : undefined;
        if (!availabilityZone) throw new Error('EBS deletion requires availabilityZone metadata for safe rollback');
        let snapshotId = typeof record.rollbackAction?.snapshotId === 'string' ? record.rollbackAction.snapshotId : undefined;
        if (!snapshotId) {
          const snapshot = await this.rateLimiter.run(record.resource.cloudAccountId, record.resource.provider, () => this.provider.createVolumeSnapshot(record.resource));
          snapshotId = snapshot.snapshotId;
          await this.repository.setRollbackAction(actionId, {
            cloudAccountId: record.resource.cloudAccountId,
            provider: record.resource.provider,
            actionType: 'restore_volume_snapshot',
            resourceExternalId: record.resource.externalId,
            region: record.resource.region,
            availabilityZone,
            snapshotId,
          });
        }
        await this.rateLimiter.run(record.resource.cloudAccountId, record.resource.provider, () => this.provider.deleteVolume(record.resource));
        return { actionType, snapshotId };
      }
      case 'stop_load_balancer': {
        const result = await this.rateLimiter.run(record.resource.cloudAccountId, record.resource.provider, () => this.provider.stopLoadBalancer(record.resource));
        if (!result.stopped) throw new Error('Provider does not support a stopped load-balancer state; manual review required');
        await this.repository.setRollbackAction(actionId, {
          cloudAccountId: record.resource.cloudAccountId,
          provider: record.resource.provider,
          actionType: 'start_load_balancer',
          resourceExternalId: record.resource.externalId,
          region: record.resource.region,
        });
        return { actionType, stopped: true };
      }
      case 'resize_instance': {
        const target = resizeDownOneTier(String(record.resource.metadata?.instanceType ?? ''));
        const result = await this.rateLimiter.run(record.resource.cloudAccountId, record.resource.provider, () => this.provider.resizeInstance(record.resource, target));
        if (this.provider.waitForInstanceReady) {
          await this.rateLimiter.run(record.resource.cloudAccountId, record.resource.provider, () => this.provider.waitForInstanceReady!(record.resource, target));
        }
        await this.repository.setRollbackAction(actionId, {
          cloudAccountId: record.resource.cloudAccountId,
          provider: record.resource.provider,
          actionType: 'resize_instance',
          resourceExternalId: record.resource.externalId,
          region: record.resource.region,
          instanceType: result.previousInstanceType,
        });
        return { actionType, targetInstanceType: result.targetInstanceType };
      }
      case 'stop_instance':
      case 'detach_volume':
        throw new Error(`Action ${actionType} is not a Stage 5 MVP execution path`);
    }
  }

  private async failExecution(record: ExecutionRecord, actionId: string, reason: string): Promise<void> {
    if (record.actionStatus === 'executing' || record.actionStatus === 'pending') {
      await this.repository.transitionAction({ actionId, toStatus: 'failed', actor, reason });
    }
    if (record.findingStatus === 'executing' || record.findingStatus === 'approved') {
      await this.repository.transitionFinding({ findingId: record.findingId, toStatus: 'failed', actor, reason });
    }
    await this.repository.recordActionNote(actionId, reason);
  }

  async rollbackRemediation(remediationActionId: string): Promise<{ status: 'rolled_back' | 'failed' | 'skipped'; reason?: string }> {
    const record = this.repository.getExecutionRecordByActionId
      ? await this.repository.getExecutionRecordByActionId(remediationActionId)
      : await this.repository.getExecutionRecord(remediationActionId);
    if (!record) throw new Error(`Remediation action not found: ${remediationActionId}`);
    if (record.actionStatus === 'rolled_back') return { status: 'skipped' };
    if (record.actionStatus !== 'completed') throw new Error(`Remediation action ${remediationActionId} is ${record.actionStatus}; rollback requires completed status`);
    if (!record.rollbackAction) throw new Error(`Remediation action ${remediationActionId} has no rollback instructions`);

    try {
      const rollback = parseRollbackInstruction(record.rollbackAction);
      const rollbackResult = await this.rateLimiter.run(record.resource.cloudAccountId, record.resource.provider, () => this.runRollback(rollback, record.resource));
      if (rollbackResult.replacementResourceExternalId && rollbackResult.replacementResourceExternalId !== record.resource.externalId) {
        await this.repository.updateResourceExternalId(record.resource.resourceId, rollbackResult.replacementResourceExternalId);
      }
      await this.repository.transitionAction({ actionId: remediationActionId, toStatus: 'rolled_back', actor, reason: 'Rollback completed successfully' });
      await this.repository.transitionFinding({ findingId: record.findingId, toStatus: 'rolled_back', actor, reason: 'Remediation rollback completed successfully' });
      return { status: 'rolled_back' };
    } catch (error) {
      const reason = `Rollback failed: ${error instanceof Error ? error.message : String(error)}`;
      await this.repository.recordActionNote(remediationActionId, reason);
      return { status: 'failed', reason };
    }
  }

  private async runRollback(instruction: RollbackInstruction, resource: ExecutionRecord['resource']): Promise<{ replacementResourceExternalId?: string }> {
    if (instruction.actionType === 'restore_volume_snapshot') {
      const restored = await this.provider.restoreVolumeSnapshot(instruction);
      return { replacementResourceExternalId: restored.resourceExternalId };
    }
    if (instruction.actionType === 'start_load_balancer') {
      await this.provider.startLoadBalancer(instruction);
      return {};
    }
    if (instruction.actionType === 'resize_instance') {
      await this.provider.resizeInstanceBack(instruction);
      if (this.provider.waitForInstanceReady && instruction.instanceType) {
        await this.provider.waitForInstanceReady(resource, instruction.instanceType);
      }
      return {};
    }
    throw new Error(`Unsupported rollback action: ${instruction.actionType}`);
  }
}
