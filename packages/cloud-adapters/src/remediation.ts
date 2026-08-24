import type { CloudProviderName } from './index.js';

export type RemediationResource = {
  resourceId: string;
  cloudAccountId: string;
  provider: CloudProviderName;
  externalId: string;
  resourceType: 'ebs_volume' | 'rds_instance' | 'ec2_instance' | 'load_balancer';
  region: string;
  metadata?: Record<string, unknown>;
};

export type SnapshotReference = {
  snapshotId: string;
  resourceExternalId: string;
  region: string;
};

export type RestoredResourceReference = {
  resourceExternalId: string;
  region: string;
};

export type RemediationExecution =
  | { actionType: 'delete_volume'; snapshot: SnapshotReference }
  | { actionType: 'stop_load_balancer'; stopped: boolean }
  | { actionType: 'resize_instance'; previousInstanceType: string; targetInstanceType: string };

export type RollbackInstruction = {
  cloudAccountId: string;
  provider: CloudProviderName;
  actionType: 'restore_volume_snapshot' | 'start_load_balancer' | 'resize_instance';
  resourceExternalId: string;
  region: string;
  snapshotId?: string;
  availabilityZone?: string;
  instanceType?: string;
};

/**
 * All mutating cloud operations used by remediation live behind this seam.
 * Concrete AWS SDK calls can be added here without coupling the worker to SDK
 * command shapes; a future GCP adapter can implement the same contract.
 */
export interface CloudRemediationProvider {
  readonly supportsStoppedLoadBalancer?: boolean;
  createVolumeSnapshot(resource: RemediationResource): Promise<SnapshotReference>;
  deleteVolume(resource: RemediationResource): Promise<void>;
  stopLoadBalancer(resource: RemediationResource): Promise<{ stopped: boolean }>;
  resizeInstance(resource: RemediationResource, targetInstanceType: string): Promise<{ previousInstanceType: string; targetInstanceType: string }>;
  waitForInstanceReady?(resource: RemediationResource, expectedInstanceType: string): Promise<void>;
  restoreVolumeSnapshot(instruction: RollbackInstruction): Promise<RestoredResourceReference>;
  startLoadBalancer(instruction: RollbackInstruction): Promise<void>;
  resizeInstanceBack(instruction: RollbackInstruction): Promise<void>;
}

export type AwsRemediationApi = {
  createSnapshot(resource: RemediationResource): Promise<SnapshotReference>;
  deleteVolume(resource: RemediationResource): Promise<void>;
  stopLoadBalancer(resource: RemediationResource): Promise<{ stopped: boolean }>;
  resizeInstance(resource: RemediationResource, targetInstanceType: string): Promise<{ previousInstanceType: string; targetInstanceType: string }>;
  restoreSnapshot(instruction: RollbackInstruction): Promise<RestoredResourceReference>;
  startLoadBalancer(instruction: RollbackInstruction): Promise<void>;
  resizeInstanceBack(instruction: RollbackInstruction): Promise<void>;
};

export class AwsCloudRemediationProvider implements CloudRemediationProvider {
  constructor(private readonly api: AwsRemediationApi) {}
  createVolumeSnapshot(resource: RemediationResource) { return this.api.createSnapshot(resource); }
  deleteVolume(resource: RemediationResource) { return this.api.deleteVolume(resource); }
  stopLoadBalancer(resource: RemediationResource) { return this.api.stopLoadBalancer(resource); }
  resizeInstance(resource: RemediationResource, targetInstanceType: string) { return this.api.resizeInstance(resource, targetInstanceType); }
  restoreVolumeSnapshot(instruction: RollbackInstruction) { return this.api.restoreSnapshot(instruction); }
  startLoadBalancer(instruction: RollbackInstruction) { return this.api.startLoadBalancer(instruction); }
  resizeInstanceBack(instruction: RollbackInstruction) { return this.api.resizeInstanceBack(instruction); }
}

export class MockCloudRemediationProvider implements CloudRemediationProvider {
  public readonly calls: string[] = [];
  public supportsStoppedLoadBalancer = true;
  public failOn: string | undefined;
  public loadBalancerCanStop = true;

  private maybeFail(operation: string): void {
    this.calls.push(operation);
    if (this.failOn === operation) throw new Error(`mock provider failure: ${operation}`);
  }

  async createVolumeSnapshot(resource: RemediationResource): Promise<SnapshotReference> {
    this.maybeFail('createVolumeSnapshot');
    return { snapshotId: `snap-${resource.externalId}`, resourceExternalId: resource.externalId, region: resource.region };
  }

  async deleteVolume(resource: RemediationResource): Promise<void> { this.maybeFail('deleteVolume'); }

  async stopLoadBalancer(resource: RemediationResource): Promise<{ stopped: boolean }> {
    this.maybeFail('stopLoadBalancer');
    return { stopped: this.loadBalancerCanStop };
  }

  async resizeInstance(resource: RemediationResource, targetInstanceType: string): Promise<{ previousInstanceType: string; targetInstanceType: string }> {
    this.maybeFail('resizeInstance');
    return { previousInstanceType: String(resource.metadata?.instanceType ?? 'db.t3.medium'), targetInstanceType };
  }

  async restoreVolumeSnapshot(instruction: RollbackInstruction): Promise<RestoredResourceReference> {
    this.maybeFail('restoreVolumeSnapshot');
    return { resourceExternalId: `restored-${instruction.resourceExternalId}`, region: instruction.region };
  }
  async startLoadBalancer(instruction: RollbackInstruction): Promise<void> { this.maybeFail('startLoadBalancer'); }
  async resizeInstanceBack(instruction: RollbackInstruction): Promise<void> { this.maybeFail('resizeInstanceBack'); }
}
