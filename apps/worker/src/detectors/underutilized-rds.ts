import type { MetricsResource } from '@cindr/cloud-adapters';
import {
  average,
  emptyDetectorResult,
  persistDetection,
  pointsForMetric,
  roughMonthlySavingsCents,
  rollingWindowStart,
  uniqueUtcDays,
  type DetectorContext,
  type DetectorResult,
} from './shared.js';

const FINDING_TYPE = 'underutilized_rds';
const CONNECTION_METRIC = 'rds_connection_count';
const CPU_METRIC = 'rds_cpu_percent';

export async function detectUnderutilizedRds(ctx: DetectorContext): Promise<DetectorResult> {
  const result = emptyDetectorResult(FINDING_TYPE);
  const now = (ctx.now ?? (() => new Date()))();
  const resources = (await ctx.provider.listResources()).filter((resource) => resource.resourceType === 'rds_instance');
  result.scanned = resources.length;

  for (const resource of resources) {
    const points = await ctx.provider.collectMetrics(resource, rollingWindowStart(now, ctx.config.underutilizedRdsWindowDays));
    result.metricsStored += points.length;
    await ctx.store.recordMetrics(points);
    const connectionPoints = pointsForMetric(points, CONNECTION_METRIC);
    const cpuPoints = pointsForMetric(points, CPU_METRIC);
    const thresholdCrossed = uniqueUtcDays(connectionPoints) >= Math.ceil(ctx.config.underutilizedRdsWindowDays)
      && uniqueUtcDays(cpuPoints) >= Math.ceil(ctx.config.underutilizedRdsWindowDays)
      && connectionPoints.length > 0
      && cpuPoints.length > 0
      && average(connectionPoints.map((point) => point.value)) <= ctx.config.underutilizedRdsMaxAvgConnections
      && average(cpuPoints.map((point) => point.value)) <= ctx.config.underutilizedRdsMaxAvgCpuPercent;
    if (!thresholdCrossed) continue;

    await persistDetection(ctx, {
      resourceId: resource.resourceId,
      findingType: FINDING_TYPE,
      evidence: {
        connectionMetric: CONNECTION_METRIC,
        cpuMetric: CPU_METRIC,
        windowDays: ctx.config.underutilizedRdsWindowDays,
        averageConnections: average(connectionPoints.map((point) => point.value)),
        maxAverageConnections: ctx.config.underutilizedRdsMaxAvgConnections,
        averageCpuPercent: average(cpuPoints.map((point) => point.value)),
        maxAverageCpuPercent: ctx.config.underutilizedRdsMaxAvgCpuPercent,
      },
      estimatedMonthlySavingsCents: roughMonthlySavingsCents(resource, await ctx.provider.estimateMonthlySavings(resource)),
    }, result);
  }
  return result;
}

export function isUnderutilizedRds(
  resource: MetricsResource,
  connectionPoints: { value: number; recordedAt: Date }[],
  cpuPoints: { value: number; recordedAt: Date }[],
  config: Pick<DetectorContext['config'], 'underutilizedRdsWindowDays' | 'underutilizedRdsMaxAvgConnections' | 'underutilizedRdsMaxAvgCpuPercent'>,
): boolean {
  return resource.resourceType === 'rds_instance'
    && uniqueUtcDays(connectionPoints) >= Math.ceil(config.underutilizedRdsWindowDays)
    && uniqueUtcDays(cpuPoints) >= Math.ceil(config.underutilizedRdsWindowDays)
    && connectionPoints.length > 0
    && cpuPoints.length > 0
    && average(connectionPoints.map((point) => point.value)) <= config.underutilizedRdsMaxAvgConnections
    && average(cpuPoints.map((point) => point.value)) <= config.underutilizedRdsMaxAvgCpuPercent;
}
