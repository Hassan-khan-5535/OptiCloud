import { Queue, Worker, type Job } from 'bullmq';
import {
  AwsSdkRemediationProvider,
  MockCloudMetricsProvider,
  type CloudMetricsProvider,
  type CloudRemediationProvider,
} from '@cindr/cloud-adapters';
import { createDrizzleDetectionStore, DrizzleDetectionStore, detectionConfigFromEnv, runAllDetectors } from './detectors/index.js';
import { createDb, organizations } from '@cindr/db';
import { DefaultRemediationEngine } from './remediation/engine.js';
import { DrizzleRemediationRepository } from './remediation/repository.js';
import { createRedisRateLimiter } from './remediation/rate-limiter.js';

type CindrJob = {
  kind: 'detection' | 'remediation' | 'rollback';
  resourceId?: string;
  findingId?: string;
  remediationActionId?: string;
  orgId?: string;
};

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined };
const config = detectionConfigFromEnv();
const metricsProvider: CloudMetricsProvider = new MockCloudMetricsProvider([], []);
const remediationProvider: CloudRemediationProvider = new AwsSdkRemediationProvider();
const queue = new Queue<CindrJob>('cindr-jobs', { connection });
const { db, pool } = createDb();

function remediationEngineFor(orgId: string) {
  return new DefaultRemediationEngine(new DrizzleRemediationRepository(db, orgId), remediationProvider, createRedisRateLimiter(process.env.REDIS_URL));
}

async function processDetectionJob(orgId?: string) {
  const orgRows = orgId ? [{ id: orgId }] : await db.select({ id: organizations.id }).from(organizations);
  const results = [];
  for (const organization of orgRows) {
    const store = new DrizzleDetectionStore(db, organization.id);
    results.push(...await runAllDetectors({ orgId: organization.id, provider: metricsProvider, store, config }));
  }
  console.info('[cindr-worker] detection run complete', { organizations: orgRows.length, results });
  return results;
}

const processor = async (job: Job<CindrJob>) => {
  if (job.data.kind === 'detection') return processDetectionJob(job.data.orgId);
  if (job.data.kind === 'remediation' && job.data.findingId && job.data.orgId) {
    const result = await remediationEngineFor(job.data.orgId).executeFinding(job.data.findingId);
    if (result.status === 'failed') throw new Error(result.reason ?? `Remediation failed for ${job.data.findingId}`);
    return result;
  }
  if (job.data.kind === 'rollback' && job.data.remediationActionId && job.data.orgId) {
    const result = await remediationEngineFor(job.data.orgId).rollbackRemediation(job.data.remediationActionId);
    if (result.status === 'failed') throw new Error(result.reason ?? `Rollback failed for ${job.data.remediationActionId}`);
    return result;
  }
  console.info(`[cindr-worker] ignored malformed job ${job.name}`, job.data);
  return { status: 'ignored' as const, stage: 'stage-5', jobId: job.id };
};

const worker = new Worker<CindrJob>('cindr-jobs', processor, { connection });
worker.on('ready', () => console.info(`[cindr-worker] ready; detection schedule=${config.schedule}; remediation attempts=3`));
worker.on('failed', async (job, error) => {
  console.error(`[cindr-worker] job ${job?.id ?? 'unknown'} failed`, error);
  // BullMQ performs three bounded attempts with exponential backoff; after the final failure the engine has persisted failed state and the provider error details.
});

await queue.upsertJobScheduler(
  'cindr-detection-scheduler',
  { pattern: config.schedule },
  { name: 'run-detection', data: { kind: 'detection' }, opts: { removeOnComplete: 25, removeOnFail: 25 } },
);
console.info('[cindr-worker] recurring detection job registered');

const shutdown = async (signal: string) => {
  console.info(`[cindr-worker] ${signal}; shutting down`);
  await worker.close();
  await queue.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
