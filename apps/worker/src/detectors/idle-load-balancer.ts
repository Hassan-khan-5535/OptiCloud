import type { MetricsResource } from '@cindr/cloud-adapters';
import {
  emptyDetectorResult,
  persistDetection,
  pointsForMetric,
  roughMonthlySavingsCents,
  rollingWindowStart,
  uniqueUtcDays,
  type DetectorContext,
  type DetectorResult,
} from './shared.js';

const FINDING_TYPE = 'idle_load_balancer';
const METRIC_NAME = 'load_balancer_request_count';

export async function detectIdleLoadBalancers(ctx: DetectorContext): Promise<DetectorResult> {
  const result = emptyDetectorResult(FINDING_TYPE);
  const now = (ctx.now ?? (() => new Date()))();
  const resources = (await ctx.provider.listResources()).filter((resource) => resource.resourceType === 'load_balancer');
  result.scanned = resources.length;

  for (const resource of resources) {
    const points = await ctx.provider.collectMetrics(resource, rollingWindowStart(now, ctx.config.idleLoadBalancerWindowDays));
    result.metricsStored += points.length;
    await ctx.store.recordMetrics(points);
    const requestPoints = pointsForMetric(points, METRIC_NAME);
    const thresholdCrossed = uniqueUtcDays(requestPoints) >= Math.ceil(ctx.config.idleLoadBalancerWindowDays)
      && requestPoints.length > 0
      && requestPoints.every((point) => point.value === 0);
    if (!thresholdCrossed) continue;

    await persistDetection(ctx, {
      resourceId: resource.resourceId,
      findingType: FINDING_TYPE,
      evidence: {
        metricName: METRIC_NAME,
        zeroRequestDays: uniqueUtcDays(requestPoints),
        thresholdDays: ctx.config.idleLoadBalancerWindowDays,
        lastObservedAt: requestPoints.at(-1)?.recordedAt.toISOString(),
      },
      estimatedMonthlySavingsCents: roughMonthlySavingsCents(resource, await ctx.provider.estimateMonthlySavings(resource)),
    }, result);
  }
  return result;
}

export function isIdleLoadBalancer(resource: MetricsResource, requestPoints: { value: number; recordedAt: Date }[], thresholdDays: number): boolean {
  return resource.resourceType === 'load_balancer'
    && uniqueUtcDays(requestPoints) >= Math.ceil(thresholdDays)
    && requestPoints.length > 0
    && requestPoints.every((point) => point.value === 0);
}
