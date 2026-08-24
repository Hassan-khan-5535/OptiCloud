import {
  CreateSnapshotCommand,
  CreateVolumeCommand,
  DeleteVolumeCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { DescribeDBInstancesCommand, ModifyDBInstanceCommand, RDSClient } from '@aws-sdk/client-rds';
import type {
  CloudRemediationProvider,
  RemediationResource,
  RollbackInstruction,
  SnapshotReference,
  RestoredResourceReference,
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

  async waitForInstanceReady(resource: RemediationResource, expectedInstanceType: string): Promise<void> {
    const client = new RDSClient({ region: resource.region });
    const timeoutMs = Math.max(5_000, Number(process.env.RDS_OPERATION_TIMEOUT_MS ?? 300_000));
    const deadline = Date.now() + timeoutMs;
    let delayMs = 2_000;
    while (Date.now() < deadline) {
      const result = await client.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: resource.externalId }));
      const instance = result.DBInstances?.[0];
      if (!instance) throw new Error(`RDS instance not found while waiting for ${resource.externalId}`);
      if (instance.DBInstanceStatus === 'available' && instance.DBInstanceClass === expectedInstanceType) return;
      if (instance.DBInstanceStatus === 'failed') throw new Error(`RDS instance entered failed state while changing ${resource.externalId}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 15_000);
    }
    throw new Error(`Timed out waiting for RDS instance ${resource.externalId} to become ${expectedInstanceType}`);
  }

  async restoreVolumeSnapshot(instruction: RollbackInstruction): Promise<RestoredResourceReference> {
    if (!instruction.snapshotId || !instruction.availabilityZone) throw new Error('Rollback requires snapshotId and availabilityZone for EBS restore');
    const result = await new EC2Client({ region: instruction.region }).send(new CreateVolumeCommand({
      SnapshotId: instruction.snapshotId,
      AvailabilityZone: instruction.availabilityZone,
      TagSpecifications: [{ ResourceType: 'volume', Tags: [{ Key: 'cindr-rollback-of', Value: instruction.resourceExternalId }] }],
    }));
    if (!result.VolumeId) throw new Error('AWS did not return a replacement volume ID for EBS rollback');
    return { resourceExternalId: result.VolumeId, region: instruction.region };
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
