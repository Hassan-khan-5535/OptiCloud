import { DescribeVolumesCommand, EC2Client, ModifyInstanceAttributeCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';
import type { CloudProvider, IdleVolume, InstanceReference } from './index.js';

export class AwsCloudProvider implements CloudProvider {
  private readonly client: EC2Client;
  private readonly region: string;

  constructor(region = process.env.AWS_REGION ?? 'us-east-1') {
    this.region = region;
    this.client = new EC2Client({ region });
  }

  async listIdleVolumes(): Promise<IdleVolume[]> {
    const result = await this.client.send(new DescribeVolumesCommand({ Filters: [{ Name: 'status', Values: ['available'] }] }));
    return (result.Volumes ?? []).flatMap((volume) => volume.VolumeId ? [{ id: volume.VolumeId, region: this.region, sizeGiB: volume.Size }] : []);
  }

  async stopInstance(instance: InstanceReference): Promise<void> {
    await this.client.send(new StopInstancesCommand({ InstanceIds: [instance.id] }));
  }

  async resizeInstance(instance: InstanceReference, instanceType: string): Promise<void> {
    await this.client.send(new ModifyInstanceAttributeCommand({ InstanceId: instance.id, InstanceType: { Value: instanceType } }));
  }
}
