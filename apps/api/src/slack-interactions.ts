import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { buildWasteFindingMessage, parseApprovalActionValue, type SlackMessagePayload, type WasteFindingMessageInput } from '@cindr/slack';
import { auditLog, policies, resources, transitionWasteFinding, type AuditActor, type Db, type FindingStatus } from '@cindr/db';
import { wasteFindings } from '@cindr/db';

export type SlackInteractionBody = {
  type: string;
  user?: { id?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  message?: { ts?: string; channel?: { id?: string } | string };
};

export type SlackMessageClient = {
  chat: {
    update(input: { channel: string; ts: string; text: string; blocks: SlackMessagePayload['blocks'] }): Promise<unknown>;
    postMessage?(input: { channel: string; text: string; blocks: SlackMessagePayload['blocks'] }): Promise<{ ts?: string; channel?: string } | unknown>;
  };
};

export type FindingContext = {
  id: string;
  wasteFindingId: string;
  findingType: string;
  status: FindingStatus;
  resourceExternalId: string;
  resourceType: string;
  region: string;
  evidence: Record<string, unknown>;
  currentMonthlyCostCents: number;
  projectedMonthlySavingsCents: number;
  autoApprovedPolicyName?: string;
};

export function toWasteFindingMessageInput(finding: FindingContext): WasteFindingMessageInput {
  const status = finding.status === 'approved' ? 'approved' : finding.status === 'denied' ? 'denied' : 'proposed';
  return { ...finding, status };
}

export type ApprovalRepository = {
  getFindingContext(findingId: string): Promise<FindingContext | null>;
  transitionFinding(input: { findingId: string; toStatus: FindingStatus; actor: AuditActor; reason: string }): Promise<void>;
};

export type RemediationQueue = {
  enqueue(findingId: string): Promise<void>;
};

export class SlackRequestError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'SlackRequestError';
  }
}

export function verifySlackSignature(
  rawBody: string,
  headers: { 'x-slack-request-timestamp'?: string; 'x-slack-signature'?: string },
  signingSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  const timestamp = Number(headers['x-slack-request-timestamp']);
  const signature = headers['x-slack-signature'];
  if (!Number.isInteger(timestamp) || !signature) throw new SlackRequestError(401, 'Missing Slack signature headers');
  // Slack signatures prevent an attacker from forging an approval request. The timestamp window also prevents replaying a valid approval later.
  if (Math.abs(nowSeconds - timestamp) > 300) throw new SlackRequestError(401, 'Expired Slack request');
  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new SlackRequestError(401, 'Invalid Slack request signature');
  }
}

export class BullMqRemediationQueue implements RemediationQueue {
  constructor(private readonly queue: Queue) {}

  async enqueue(findingId: string): Promise<void> {
    // A deterministic BullMQ jobId makes Slack retries and double-clicks converge on one queued remediation.
    await this.queue.add('execute-remediation', { kind: 'remediation', findingId }, {
      jobId: `cindr-remediation:${findingId}`,
      removeOnComplete: 25,
      removeOnFail: 25,
    });
  }
}

export class DrizzleApprovalRepository implements ApprovalRepository {
  constructor(private readonly db: Db) {}

  async getFindingContext(findingId: string): Promise<FindingContext | null> {
    const [row] = await this.db.select({
      id: wasteFindings.id,
      wasteFindingId: wasteFindings.id,
      cloudAccountId: resources.cloudAccountId,
      findingType: wasteFindings.findingType,
      status: wasteFindings.status,
      evidence: wasteFindings.evidence,
      savings: wasteFindings.estimatedMonthlySavingsCents,
      resourceExternalId: resources.externalId,
      resourceType: resources.type,
      region: resources.region,
      metadata: resources.metadata,
    }).from(wasteFindings).innerJoin(resources, eq(resources.id, wasteFindings.resourceId)).where(eq(wasteFindings.id, findingId)).limit(1);
    if (!row) return null;

    const policyRows = await this.db.select({ rule: policies.rule })
      .from(policies)
      .innerJoin(resources, eq(resources.cloudAccountId, policies.cloudAccountId))
      .where(and(eq(resources.cloudAccountId, row.cloudAccountId), eq(policies.active, true)));
    const policy = policyRows.find(({ rule }) => rule.finding_type === row.findingType && rule.action === 'auto_approve');
    const currentCost = typeof row.metadata.currentMonthlyCostCents === 'number' ? row.metadata.currentMonthlyCostCents : row.savings;
    return {
      id: row.id,
      wasteFindingId: row.wasteFindingId,
      findingType: row.findingType,
      status: row.status,
      resourceExternalId: row.resourceExternalId,
      resourceType: row.resourceType,
      region: row.region,
      evidence: row.evidence,
      currentMonthlyCostCents: currentCost,
      projectedMonthlySavingsCents: row.savings,
      autoApprovedPolicyName: policy && typeof policy.rule.name === 'string' ? policy.rule.name : undefined,
    };
  }

  async transitionFinding(input: { findingId: string; toStatus: FindingStatus; actor: AuditActor; reason: string }): Promise<void> {
    await transitionWasteFinding(this.db, input);
  }
}

export type SlackInteractionDependencies = {
  repository: ApprovalRepository;
  queue: RemediationQueue;
  slack: SlackMessageClient;
  signingSecret: string;
  nowSeconds?: number;
};

export async function handleSlackInteraction(
  rawBody: string,
  headers: { 'x-slack-request-timestamp'?: string; 'x-slack-signature'?: string },
  body: SlackInteractionBody,
  deps: SlackInteractionDependencies,
): Promise<{ status: 'approved' | 'denied'; duplicate: false }> {
  verifySlackSignature(rawBody, headers, deps.signingSecret, deps.nowSeconds);
  if (body.type !== 'block_actions') throw new SlackRequestError(400, 'Unsupported Slack interaction type');
  const action = body.actions?.[0];
  if (!action?.action_id || !action.value) throw new SlackRequestError(400, 'Missing Slack action');
  const parsed = parseApprovalActionValue(action.value);
  const expectedActionId = action.action_id === 'cindr_approve' ? `cindr:approve:${parsed.findingId}` : action.action_id === 'cindr_deny' ? `cindr:deny:${parsed.findingId}` : '';
  if (!expectedActionId || parsed.actionId !== expectedActionId) throw new SlackRequestError(400, 'Invalid Cindr action payload');

  const finding = await deps.repository.getFindingContext(parsed.findingId);
  if (!finding) throw new SlackRequestError(404, 'Waste finding not found');
  if (finding.status !== 'proposed') {
    // A second Slack delivery is intentionally rejected instead of re-transitioning or enqueueing again.
    throw new SlackRequestError(409, `Finding ${finding.id} is already ${finding.status}`);
  }

  const actor: AuditActor = body.user?.id ? `slack_user_id:${body.user.id}` : 'system';
  const isApproval = action.action_id === 'cindr_approve';
  await deps.repository.transitionFinding({
    findingId: finding.id,
    toStatus: isApproval ? 'approved' : 'denied',
    actor,
    reason: isApproval ? 'Approved from Slack interactive message' : 'Denied from Slack interactive message',
  });

  if (isApproval) await deps.queue.enqueue(finding.id);

  const resolved = await deps.repository.getFindingContext(finding.id);
  const message = buildWasteFindingMessage(toWasteFindingMessageInput(resolved ?? { ...finding, status: isApproval ? 'approved' : 'denied' }));
  const channel = typeof body.message?.channel === 'string' ? body.message.channel : body.message?.channel?.id;
  const ts = body.message?.ts;
  if (!channel || !ts) throw new SlackRequestError(400, 'Missing original Slack message reference');
  await deps.slack.chat.update({ channel, ts, text: message.text, blocks: message.blocks });
  return { status: isApproval ? 'approved' : 'denied', duplicate: false };
}

export function createRemediationQueue(redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'): BullMqRemediationQueue {
  const parsed = new URL(redisUrl);
  const connection = { host: parsed.hostname, port: Number(parsed.port || 6379), password: parsed.password || undefined };
  const queue = new Queue('cindr-jobs', { connection });
  return new BullMqRemediationQueue(queue);
}
