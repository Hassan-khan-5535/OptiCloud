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

const FINDING_TYPE = 'unattached_volume';
const METRIC_NAME = 'volume_attachment_count';

export async function detectUnattachedVolumes(ctx: DetectorContext): Promise<DetectorResult> {
  const result = emptyDetectorResult(FINDING_TYPE);
  const now = (ctx.now ?? (() => new Date()))();
  const resources = (await ctx.provider.listResources()).filter((resource) => resource.resourceType === 'ebs_volume');
  result.scanned = resources.length;

  for (const resource of resources) {
    const points = await ctx.provider.collectMetrics(resource, rollingWindowStart(now, ctx.config.unattachedVolumeDays));
    result.metricsStored += points.length;
    await ctx.store.recordMetrics(points);
    const attachmentPoints = pointsForMetric(points, METRIC_NAME);
    const thresholdCrossed = uniqueUtcDays(attachmentPoints) >= Math.ceil(ctx.config.unattachedVolumeDays)
      && attachmentPoints.length > 0
      && attachmentPoints.every((point) => point.value === 0);
    if (!thresholdCrossed) continue;

    await persistDetection(ctx, {
      resourceId: resource.resourceId,
      findingType: FINDING_TYPE,
      evidence: {
        metricName: METRIC_NAME,
        zeroAttachmentDays: uniqueUtcDays(attachmentPoints),
        thresholdDays: ctx.config.unattachedVolumeDays,
        lastObservedAt: attachmentPoints.at(-1)?.recordedAt.toISOString(),
      },
      estimatedMonthlySavingsCents: roughMonthlySavingsCents(resource, await ctx.provider.estimateMonthlySavings(resource)),
    }, result);
  }
  return result;
}

export function isUnattachedVolume(resource: MetricsResource, attachmentPoints: { value: number; recordedAt: Date }[], thresholdDays: number): boolean {
  return resource.resourceType === 'ebs_volume'
    && uniqueUtcDays(attachmentPoints) >= Math.ceil(thresholdDays)
    && attachmentPoints.length > 0
    && attachmentPoints.every((point) => point.value === 0);
}
