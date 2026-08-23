import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { WebClient } from '@slack/web-api';
import { createDb, type Db } from '@cindr/db';
import { buildWasteFindingMessage } from '@cindr/slack';
import {
  createPolicy,
  getDashboardOverview,
  getFindingDetail,
  listAccounts,
  listPolicies,
  validatePolicyInput,
} from './dashboard.js';
import {
  BullMqRemediationQueue,
  DrizzleApprovalRepository,
  createRemediationQueue,
  handleSlackInteraction,
  type ApprovalRepository,
  type RemediationQueue,
  type SlackInteractionDependencies,
  toWasteFindingMessageInput,
  type SlackMessageClient,
} from './slack-interactions.js';

export type ApiDependencies = {
  slackInteractions?: SlackInteractionDependencies;
  findingRepository?: ApprovalRepository;
  slackClient?: SlackMessageClient;
  remediationQueue?: RemediationQueue;
  signingSecret?: string;
  dashboardDb?: Db;
};

function createDefaultSlackClient(): SlackMessageClient | undefined {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return undefined;
  const web = new WebClient(token);
  return {
    chat: {
      update: (input) => web.chat.update(input),
      postMessage: (input) => web.chat.postMessage(input),
    },
  };
}

function createDefaultDependencies(): ApiDependencies {
  if (!process.env.DATABASE_URL) return {};
  const { db } = createDb();
  const slackClient = createDefaultSlackClient();
  return {
    findingRepository: new DrizzleApprovalRepository(db),
    dashboardDb: db,
    remediationQueue: process.env.REDIS_URL ? createRemediationQueue() : undefined,
    slackClient,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  };
}

export async function buildApp(overrides: ApiDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const dashboardDb = overrides.dashboardDb ?? (process.env.DATABASE_URL ? createDb().db : undefined);
  await app.register(cors, { origin: true });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  app.get('/health', async () => ({
    status: 'ok',
    service: 'cindr-api',
    stage: 'interactive-approval',
    timestamp: new Date().toISOString(),
  }));

  app.get('/', async () => ({ name: 'Cindr API', tagline: 'Catch the waste before it burns.' }));

  app.get('/api/overview', async (_request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    try {
      return reply.send(await getDashboardOverview(db));
    } catch (error) {
      app.log.error(error, 'Failed to load dashboard overview');
      return reply.code(500).send({ error: 'Failed to load dashboard overview' });
    }
  });

  app.get<{ Params: { findingId: string } }>('/api/findings/:findingId', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    try {
      const finding = await getFindingDetail(db, request.params.findingId);
      if (!finding) return reply.code(404).send({ error: 'Waste finding not found' });
      return reply.send(finding);
    } catch (error) {
      app.log.error(error, 'Failed to load finding detail');
      return reply.code(500).send({ error: 'Failed to load finding detail' });
    }
  });

  app.get('/api/policies', async (_request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    try {
      return reply.send({ policies: await listPolicies(db) });
    } catch (error) {
      app.log.error(error, 'Failed to load policies');
      return reply.code(500).send({ error: 'Failed to load policies' });
    }
  });

  app.post('/api/policies', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const validated = validatePolicyInput(request.body);
    if (validated.error || !validated.value) return reply.code(400).send({ error: validated.error ?? 'Invalid policy' });
    try {
      return reply.code(201).send(await createPolicy(db, validated.value));
    } catch (error) {
      app.log.error(error, 'Failed to create policy');
      const message = error instanceof Error ? error.message : 'Failed to create policy';
      return reply.code(message.includes('No connected cloud account') ? 409 : 500).send({ error: message });
    }
  });

  app.get('/api/accounts', async (_request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    try {
      return reply.send({ accounts: await listAccounts(db) });
    } catch (error) {
      app.log.error(error, 'Failed to load cloud accounts');
      return reply.code(500).send({ error: 'Failed to load cloud accounts' });
    }
  });

  app.post('/slack/interactions', async (request, reply) => {
    const deps = overrides.slackInteractions ?? resolveSlackDependencies(overrides);
    if (!deps) return reply.code(503).send({ error: 'Slack approval integration is not configured' });
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const payloadText = new URLSearchParams(rawBody).get('payload') ?? rawBody;
    let body: Parameters<typeof handleSlackInteraction>[2];
    try {
      body = JSON.parse(payloadText);
    } catch {
      return reply.code(400).send({ error: 'Invalid Slack payload' });
    }
    try {
      const result = await handleSlackInteraction(rawBody, {
        'x-slack-request-timestamp': request.headers['x-slack-request-timestamp'] as string | undefined,
        'x-slack-signature': request.headers['x-slack-signature'] as string | undefined,
      }, body, deps);
      return reply.send({ ok: true, result });
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500;
      const message = error instanceof Error ? error.message : 'Slack interaction failed';
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post<{ Params: { remediationActionId: string } }>('/api/remediations/:remediationActionId/rollback', async (request, reply) => {
    const queue = overrides.remediationQueue ?? (process.env.REDIS_URL ? createRemediationQueue() : undefined);
    if (!queue) return reply.code(503).send({ error: 'Remediation queue is not configured' });
    await queue.enqueueRollback(request.params.remediationActionId);
    return reply.code(202).send({ ok: true, remediationActionId: request.params.remediationActionId, status: 'rollback_queued' });
  });

  app.post<{ Params: { findingId: string } }>('/slack/findings/:findingId/notify', async (request, reply) => {
    const repository = overrides.findingRepository;
    const slack = overrides.slackClient ?? createDefaultSlackClient();
    const channel = process.env.SLACK_CHANNEL_ID;
    if (!repository || !slack || !channel) return reply.code(503).send({ error: 'Slack notification integration is not configured' });
    const finding = await repository.getFindingContext(request.params.findingId);
    if (!finding) return reply.code(404).send({ error: 'Waste finding not found' });
    const message = buildWasteFindingMessage(toWasteFindingMessageInput(finding));
    const posted = await slack.chat.postMessage?.({ channel, text: message.text, blocks: message.blocks });
    return reply.send({ ok: true, findingId: finding.id, ts: posted && typeof posted === 'object' && 'ts' in posted ? posted.ts : undefined });
  });

  return app;
}

function resolveSlackDependencies(overrides: ApiDependencies): SlackInteractionDependencies | undefined {
  const repository = overrides.findingRepository;
  const queue = overrides.remediationQueue;
  const slack = overrides.slackClient ?? createDefaultSlackClient();
  const signingSecret = overrides.signingSecret ?? process.env.SLACK_SIGNING_SECRET;
  if (!repository || !queue || !slack || !signingSecret) return undefined;
  return { repository, queue, slack, signingSecret };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await buildApp(createDefaultDependencies());
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
