import type { DetectorContext, DetectorResult } from './shared.js';
import { detectIdleLoadBalancers } from './idle-load-balancer.js';
import { detectUnderutilizedRds } from './underutilized-rds.js';
import { detectUnattachedVolumes } from './unattached-volume.js';

export { detectIdleLoadBalancers } from './idle-load-balancer.js';
export { detectUnderutilizedRds } from './underutilized-rds.js';
export { detectUnattachedVolumes } from './unattached-volume.js';
export * from './shared.js';

export const MVP_DETECTORS = [
  detectUnattachedVolumes,
  detectIdleLoadBalancers,
  detectUnderutilizedRds,
] as const;

export async function runAllDetectors(ctx: DetectorContext): Promise<DetectorResult[]> {
  const results: DetectorResult[] = [];
  // Keep provider calls sequential for now: a real adapter can add its own rate-limit/retry policy.
  for (const detector of MVP_DETECTORS) results.push(await detector(ctx));
  return results;
}
