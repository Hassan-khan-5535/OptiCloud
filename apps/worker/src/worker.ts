import { Queue, Worker, type Job } from 'bullmq';
import { MockCloudMetricsProvider, type CloudMetricsProvider } from '@cindr/cloud-adapters';
import { createDrizzleDetectionStore, detectionConfigFromEnv, runAllDetectors } from './detectors/index.js';

type CindrJob = { kind: 'detection' | 'scan' | 'remediation'; resourceId?: string };

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined };
const config = detectionConfigFromEnv();
const metricsProvider: CloudMetricsProvider = new MockCloudMetricsProvider([], []);
const queue = new Queue<CindrJob>('cindr-jobs', { connection });
const { store, pool } = createDrizzleDetectionStore();

async function processDetectionJob() {
  const results = await runAllDetectors({ provider: metricsProvider, store, config });
  console.info('[cindr-worker] detection run complete', results);
  return results;
}

const processor = async (job: Job<CindrJob>) => {
  if (job.data.kind === 'detection') return processDetectionJob();
  console.info(`[cindr-worker] no-op processor received ${job.name}`, job.data);
  return { status: 'accepted', stage: 'scaffolding', jobId: job.id };
};

const worker = new Worker<CindrJob>('cindr-jobs', processor, { connection });
worker.on('ready', () => console.info(`[cindr-worker] ready; detection schedule=${config.schedule}`));
worker.on('failed', (job, error) => console.error(`[cindr-worker] job ${job?.id ?? 'unknown'} failed`, error));

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
