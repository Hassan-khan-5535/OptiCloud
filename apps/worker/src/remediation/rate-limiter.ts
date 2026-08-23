import type { CloudProviderName } from '@cindr/cloud-adapters';
import { Redis } from 'ioredis';

export type ProviderRateLimiter = {
  run<T>(cloudAccountId: string, provider: CloudProviderName, operation: () => Promise<T>): Promise<T>;
};

export type RateLimitConfig = {
  awsRequestsPerSecond: number;
  gcpRequestsPerSecond: number;
};

export function rateLimitConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const positiveNumber = (name: string, fallback: number) => {
    const parsed = Number(env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    awsRequestsPerSecond: positiveNumber('AWS_REQUESTS_PER_SECOND', 5),
    gcpRequestsPerSecond: positiveNumber('GCP_REQUESTS_PER_SECOND', 5),
  };
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class RedisRateLimiter implements ProviderRateLimiter {
  constructor(private readonly redis: Redis, private readonly config: RateLimitConfig = rateLimitConfigFromEnv()) {}

  async run<T>(cloudAccountId: string, provider: CloudProviderName, operation: () => Promise<T>): Promise<T> {
    const limit = provider === 'aws' ? this.config.awsRequestsPerSecond : this.config.gcpRequestsPerSecond;
    const windowSeconds = Math.max(1, Math.ceil(limit / Math.max(1, Math.floor(limit))));
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `cindr:provider-rate:${provider}:${cloudAccountId}:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds + 1);
    if (count > limit) {
      await sleep(windowSeconds * 1000 - (Date.now() % (windowSeconds * 1000)));
      return this.run(cloudAccountId, provider, operation);
    }
    return operation();
  }
}

export class InMemoryRateLimiter implements ProviderRateLimiter {
  public calls = 0;
  async run<T>(_cloudAccountId: string, _provider: CloudProviderName, operation: () => Promise<T>): Promise<T> {
    this.calls += 1;
    return operation();
  }
}

export function createRedisRateLimiter(redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'): RedisRateLimiter {
  return new RedisRateLimiter(new Redis(redisUrl), rateLimitConfigFromEnv());
}
