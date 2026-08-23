import {
  CreateSnapshotCommand,
  CreateVolumeCommand,
  DeleteVolumeCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { ModifyDBInstanceCommand, RDSClient } from '@aws-sdk/client-rds';
import type {
  CloudRemediationProvider,
  RemediationResource,
  RollbackInstruction,
  SnapshotReference,
} from './remediation.js';

/**
 * AWS has no stopped state for Elastic Load Balancing v2 resources. The adapter
 * reports that capability explicitly instead of deleting the load balancer.
 */
export class AwsSdkRemediationProvider implements CloudRemediationProvider {
  readonly supportsStoppedLoadBalancer = false;
  async createVolumeSnapshot(resource: RemediationResource): Promise<SnapshotReference> {
    const result = await new EC2Client({ region: resource.region }).send(new CreateSnapshotCommand({
      VolumeId: resource.externalId,
      Description: `Cindr reversible remediation snapshot for ${resource.externalId}`,
      TagSpecifications: [{ ResourceType: 'snapshot', Tags: [{ Key: 'cindr-remediation', Value: resource.resourceId }] }],
    }));
    if (!result.SnapshotId) throw new Error(`AWS did not return a snapshot ID for ${resource.externalId}`);
    return { snapshotId: result.SnapshotId, resourceExternalId: resource.externalId, region: resource.region };
  }

  async deleteVolume(resource: RemediationResource): Promise<void> {
    await new EC2Client({ region: resource.region }).send(new DeleteVolumeCommand({ VolumeId: resource.externalId }));
  }

  async stopLoadBalancer(_resource: RemediationResource): Promise<{ stopped: boolean }> {
    return { stopped: false };
  }

  async resizeInstance(resource: RemediationResource, targetInstanceType: string): Promise<{ previousInstanceType: string; targetInstanceType: string }> {
    const previousInstanceType = String(resource.metadata?.instanceType ?? '');
    if (!previousInstanceType) throw new Error(`Current RDS instance class is missing for ${resource.externalId}`);
    await new RDSClient({ region: resource.region }).send(new ModifyDBInstanceCommand({
      DBInstanceIdentifier: resource.externalId,
      DBInstanceClass: targetInstanceType,
      ApplyImmediately: true,
    }));
    return { previousInstanceType, targetInstanceType };
  }

  async restoreVolumeSnapshot(instruction: RollbackInstruction): Promise<void> {
    if (!instruction.snapshotId || !instruction.availabilityZone) throw new Error('Rollback requires snapshotId and availabilityZone for EBS restore');
    await new EC2Client({ region: instruction.region }).send(new CreateVolumeCommand({
      SnapshotId: instruction.snapshotId,
      AvailabilityZone: instruction.availabilityZone,
      TagSpecifications: [{ ResourceType: 'volume', Tags: [{ Key: 'cindr-rollback-of', Value: instruction.resourceExternalId }] }],
    }));
  }

  async startLoadBalancer(_instruction: RollbackInstruction): Promise<void> {
    throw new Error('AWS load balancers do not support a stopped state; no automatic rollback operation exists');
  }

  async resizeInstanceBack(instruction: RollbackInstruction): Promise<void> {
    if (!instruction.instanceType) throw new Error('Rollback requires the previous RDS instance class');
    await new RDSClient({ region: instruction.region }).send(new ModifyDBInstanceCommand({
      DBInstanceIdentifier: instruction.resourceExternalId,
      DBInstanceClass: instruction.instanceType,
      ApplyImmediately: true,
    }));
  }
}
