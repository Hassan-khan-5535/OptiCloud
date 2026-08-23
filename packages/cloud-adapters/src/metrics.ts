export type CloudMetricPoint = {
  resourceId: string;
  metricName: string;
  value: number;
  recordedAt: Date;
};

export type MetricsResource = {
  resourceId: string;
  resourceType: 'ebs_volume' | 'rds_instance' | 'ec2_instance' | 'load_balancer';
  externalId: string;
  region: string;
  metadata?: Record<string, unknown>;
};

/**
 * Provider-neutral read interface. The detector layer only depends on this
 * contract; a real AWS implementation can later call CloudWatch and Cost
 * Explorer while a GCP implementation can satisfy the same shape.
 */
export interface CloudMetricsProvider {
  listResources(): Promise<MetricsResource[]>;
  collectMetrics(resource: MetricsResource, since: Date): Promise<CloudMetricPoint[]>;
  estimateMonthlySavings(resource: MetricsResource): Promise<number>;
}

/**
 * Clearly named seam for real AWS SDK calls. This stage deliberately does not
 * invoke AWS APIs; Stage 4 can implement these methods with CloudWatch and
 * Cost Explorer without changing detector logic.
 */
export interface AwsMetricsApi {
  listTrackedResources(): Promise<MetricsResource[]>;
  getMetricPoints(resource: MetricsResource, since: Date): Promise<CloudMetricPoint[]>;
  getMonthlyCostCents(resource: MetricsResource): Promise<number>;
}

export class AwsCloudMetricsProvider implements CloudMetricsProvider {
  constructor(private readonly api: AwsMetricsApi) {}

  listResources(): Promise<MetricsResource[]> {
    return this.api.listTrackedResources();
  }

  collectMetrics(resource: MetricsResource, since: Date): Promise<CloudMetricPoint[]> {
    return this.api.getMetricPoints(resource, since);
  }

  estimateMonthlySavings(resource: MetricsResource): Promise<number> {
    return this.api.getMonthlyCostCents(resource);
  }
}

export class MockCloudMetricsProvider implements CloudMetricsProvider {
  constructor(
    private readonly resources: MetricsResource[],
    private readonly metrics: CloudMetricPoint[],
    private readonly monthlySavingsCents: Record<string, number> = {},
  ) {}

  async listResources(): Promise<MetricsResource[]> {
    return this.resources;
  }

  async collectMetrics(resource: MetricsResource, since: Date): Promise<CloudMetricPoint[]> {
    return this.metrics.filter((point) => point.resourceId === resource.resourceId && point.recordedAt >= since);
  }

  async estimateMonthlySavings(resource: MetricsResource): Promise<number> {
    return this.monthlySavingsCents[resource.resourceId] ?? 0;
  }
}
