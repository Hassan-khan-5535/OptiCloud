import { and, eq, gte } from 'drizzle-orm';
import type { CloudMetricPoint, CloudMetricsProvider, MetricsResource } from '@cindr/cloud-adapters';
import { orgScope, resourceMetrics, resources, type Db } from '@cindr/db';

export class DrizzleMetricsProvider implements CloudMetricsProvider {
  constructor(private readonly db: Db, private readonly orgId: string) {}

  async listResources(): Promise<MetricsResource[]> {
    const rows = await this.db.select({
      resourceId: resources.id,
      resourceType: resources.type,
      externalId: resources.externalId,
      region: resources.region,
      metadata: resources.metadata,
    }).from(resources).where(orgScope(resources.orgId, this.orgId));
    return rows.map((row) => ({
      resourceId: row.resourceId,
      resourceType: row.resourceType,
      externalId: row.externalId,
      region: row.region,
      metadata: row.metadata ?? undefined,
    }));
  }

  async collectMetrics(resource: MetricsResource, since: Date): Promise<CloudMetricPoint[]> {
    const rows = await this.db.select({
      resourceId: resourceMetrics.resourceId,
      metricName: resourceMetrics.metricName,
      value: resourceMetrics.value,
      recordedAt: resourceMetrics.recordedAt,
    }).from(resourceMetrics).where(and(
      orgScope(resourceMetrics.orgId, this.orgId),
      eq(resourceMetrics.resourceId, resource.resourceId),
      gte(resourceMetrics.recordedAt, since),
    ));
    return rows;
  }

  async estimateMonthlySavings(resource: MetricsResource): Promise<number> {
    const monthlySavings = resource.metadata?.monthlySavingsCents;
    return typeof monthlySavings === 'number' && Number.isFinite(monthlySavings) && monthlySavings >= 0 ? monthlySavings : 0;
  }
}
