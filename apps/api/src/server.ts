import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import cors from '@fastify/cors';
import { WebClient } from '@slack/web-api';
import { createDb, orgScope, remediationActions, type Db } from '@cindr/db';
import { authenticateRequest, type AuthenticatedContext } from './auth.js';
import { bindSlackWorkspace, resolveOrganizationForSlackTeam, resolveOrganizationForUser } from './organizations.js';
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
  verifySlackSignature,
} from './slack-interactions.js';

export type DashboardQueries = {
  getDashboardOverview: typeof getDashboardOverview;
  getFindingDetail: typeof getFindingDetail;
  listPolicies: typeof listPolicies;
  listAccounts: typeof listAccounts;
  createPolicy: typeof createPolicy;
};

export type ApiDependencies = {
  slackInteractions?: SlackInteractionDependencies;
  findingRepository?: ApprovalRepository;
  slackClient?: SlackMessageClient;
  remediationQueue?: RemediationQueue;
  signingSecret?: string;
  dashboardDb?: Db;
  authResolver?: (request: import('fastify').FastifyRequest) => Promise<AuthenticatedContext | null>;
  dashboardQueries?: Partial<DashboardQueries>;
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
    dashboardDb: db,
    remediationQueue: process.env.REDIS_URL ? createRemediationQueue() : undefined,
    slackClient,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  };
}

export async function buildApp(overrides: ApiDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const dashboardDb = overrides.dashboardDb ?? (process.env.DATABASE_URL ? createDb().db : undefined);
  const dashboardQueries: DashboardQueries = {
    getDashboardOverview,
    getFindingDetail,
    listPolicies,
    listAccounts,
    createPolicy,
    ...overrides.dashboardQueries,
  };
  const authResolver = overrides.authResolver ?? (async (request: import('fastify').FastifyRequest) => {
    if (!dashboardDb) return null;
    const user = await authenticateRequest(request);
    return user ? resolveOrganizationForUser(dashboardDb, user) : null;
  });
  await app.register(cors, { origin: true });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  app.get('/health', async () => ({
    status: 'ok',
    service: 'cindr-api',
    stage: 'interactive-approval',
    timestamp: new Date().toISOString(),
  }));

  app.get('/', async () => ({ name: 'Cindr API', tagline: 'Catch the waste before it burns.' }));

  app.get('/api/overview', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    try {
      return reply.send(await dashboardQueries.getDashboardOverview(db, context.orgId));
    } catch (error) {
      app.log.error(error, 'Failed to load dashboard overview');
      return reply.code(500).send({ error: 'Failed to load dashboard overview' });
    }
  });

  app.get<{ Params: { findingId: string } }>('/api/findings/:findingId', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    try {
      const finding = await dashboardQueries.getFindingDetail(db, request.params.findingId, context.orgId);
      if (!finding) return reply.code(404).send({ error: 'Waste finding not found' });
      return reply.send(finding);
    } catch (error) {
      app.log.error(error, 'Failed to load finding detail');
      return reply.code(500).send({ error: 'Failed to load finding detail' });
    }
  });

  app.get('/api/policies', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    try {
      return reply.send({ policies: await dashboardQueries.listPolicies(db, context.orgId) });
    } catch (error) {
      app.log.error(error, 'Failed to load policies');
      return reply.code(500).send({ error: 'Failed to load policies' });
    }
  });

  app.post('/api/policies', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    const validated = validatePolicyInput(request.body);
    if (validated.error || !validated.value) return reply.code(400).send({ error: validated.error ?? 'Invalid policy' });
    try {
      return reply.code(201).send(await dashboardQueries.createPolicy(db, validated.value, context.orgId));
    } catch (error) {
      app.log.error(error, 'Failed to create policy');
      const message = error instanceof Error ? error.message : 'Failed to create policy';
      return reply.code(message.includes('No connected cloud account') ? 409 : 500).send({ error: message });
    }
  });

  app.get('/api/accounts', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    try {
      return reply.send({ accounts: await dashboardQueries.listAccounts(db, context.orgId) });
    } catch (error) {
      app.log.error(error, 'Failed to load cloud accounts');
      return reply.code(500).send({ error: 'Failed to load cloud accounts' });
    }
  });

  app.post('/api/integrations/slack/bind', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const teamId = typeof body.team_id === 'string' ? body.team_id.trim() : '';
    if (!teamId) return reply.code(400).send({ error: 'team_id is required' });
    try {
      return reply.code(201).send(await bindSlackWorkspace(db, context.orgId, teamId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Slack workspace binding failed';
      return reply.code(message.includes('already') ? 409 : 400).send({ error: message });
    }
  });

  app.post('/slack/interactions', async (request, reply) => {
    const db = dashboardDb;
    if (!db) return reply.code(503).send({ error: 'Database is not configured' });
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const signingSecret = overrides.signingSecret ?? process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) return reply.code(503).send({ error: 'Slack approval integration is not configured' });
    try {
      verifySlackSignature(rawBody, {
        'x-slack-request-timestamp': request.headers['x-slack-request-timestamp'] as string | undefined,
        'x-slack-signature': request.headers['x-slack-signature'] as string | undefined,
      }, signingSecret);
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 401;
      return reply.code(statusCode).send({ error: error instanceof Error ? error.message : 'Invalid Slack signature' });
    }
    const payloadText = new URLSearchParams(rawBody).get('payload') ?? rawBody;
    let body: Parameters<typeof handleSlackInteraction>[2];
    try {
      body = JSON.parse(payloadText);
    } catch {
      return reply.code(400).send({ error: 'Invalid Slack payload' });
    }
    const teamId = typeof (body as { team?: { id?: string }; team_id?: string }).team_id === 'string'
      ? (body as { team_id: string }).team_id
      : (body as { team?: { id?: string } }).team?.id;
    if (!db || !teamId) return reply.code(400).send({ error: 'Slack team_id is required' });
    const organization = await resolveOrganizationForSlackTeam(db, teamId);
    if (!organization) return reply.code(403).send({ error: 'Slack workspace is not connected to a Cindr organization' });
    const deps = overrides.slackInteractions ?? resolveSlackDependencies(overrides, db, organization.id);
    if (!deps) return reply.code(503).send({ error: 'Slack approval integration is not configured' });
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
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    if (dashboardDb) {
      const [action] = await dashboardDb.select({ id: remediationActions.id }).from(remediationActions).where(orgScope(remediationActions.orgId, context.orgId, eq(remediationActions.id, request.params.remediationActionId))).limit(1);
      if (!action) return reply.code(404).send({ error: 'Remediation action not found' });
    }
    const queue = overrides.remediationQueue ?? (process.env.REDIS_URL ? createRemediationQueue() : undefined);
    if (!queue) return reply.code(503).send({ error: 'Remediation queue is not configured' });
    await queue.enqueueRollback(request.params.remediationActionId, context.orgId);
    return reply.code(202).send({ ok: true, remediationActionId: request.params.remediationActionId, status: 'rollback_queued' });
  });

  app.post<{ Params: { findingId: string } }>('/slack/findings/:findingId/notify', async (request, reply) => {
    const context = await requireOrgContext(request, reply, authResolver);
    if (!context) return;
    const repository = overrides.findingRepository ?? (dashboardDb ? new DrizzleApprovalRepository(dashboardDb, context.orgId) : undefined);
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

function resolveSlackDependencies(overrides: ApiDependencies, db: Db, orgId: string): SlackInteractionDependencies | undefined {
  const repository = overrides.findingRepository ?? new DrizzleApprovalRepository(db, orgId);
  const queue = overrides.remediationQueue;
  const slack = overrides.slackClient ?? createDefaultSlackClient();
  const signingSecret = overrides.signingSecret ?? process.env.SLACK_SIGNING_SECRET;
  if (!repository || !queue || !slack || !signingSecret) return undefined;
  return { repository, queue, slack, signingSecret, orgId };
}

async function requireOrgContext(
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  resolver: (request: import('fastify').FastifyRequest) => Promise<AuthenticatedContext | null>,
): Promise<AuthenticatedContext | null> {
  const context = await resolver(request);
  if (!context) {
    reply.code(401).send({ error: 'Authentication required' });
    return null;
  }
  return context;
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
