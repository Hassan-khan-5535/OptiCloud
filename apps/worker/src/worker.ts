import { Worker, type Job } from 'bullmq';

type CindrJob = { kind: 'scan' | 'remediation'; resourceId?: string };

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined };

const processor = async (job: Job<CindrJob>) => {
  console.info(`[cindr-worker] no-op processor received ${job.name}`, job.data);
  return { status: 'accepted', stage: 'scaffolding', jobId: job.id };
};

const worker = new Worker<CindrJob>('cindr-jobs', processor, { connection });
worker.on('ready', () => console.info('[cindr-worker] ready; no-op processor active'));
worker.on('failed', (job, error) => console.error(`[cindr-worker] job ${job?.id ?? 'unknown'} failed`, error));

const shutdown = async (signal: string) => {
  console.info(`[cindr-worker] ${signal}; shutting down`);
  await worker.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
