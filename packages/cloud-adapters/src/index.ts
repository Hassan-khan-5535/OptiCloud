export type CloudProviderName = 'aws' | 'gcp';

export type IdleVolume = { id: string; region: string; sizeGiB?: number; monthlyCostCents?: number };
export type InstanceReference = { id: string; region: string };

export interface CloudProvider {
  listIdleVolumes(): Promise<IdleVolume[]>;
  stopInstance(instance: InstanceReference): Promise<void>;
  resizeInstance(instance: InstanceReference, instanceType: string): Promise<void>;
}

export { AwsCloudProvider } from './aws.js';
export * from './metrics.js';
export * from './remediation.js';
export { AwsSdkRemediationProvider } from './aws-remediation.js';
