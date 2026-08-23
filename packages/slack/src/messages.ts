import type { Block, KnownBlock } from '@slack/types';

export type FindingMessageStatus = 'proposed' | 'approved' | 'denied';

export type WasteFindingMessageInput = {
  wasteFindingId: string;
  findingType: string;
  resourceExternalId: string;
  resourceType: string;
  region: string;
  evidence: Record<string, unknown>;
  currentMonthlyCostCents: number;
  projectedMonthlySavingsCents: number;
  status: FindingMessageStatus;
  autoApprovedPolicyName?: string;
};

export type ApprovalActionValue = {
  findingId: string;
  actionId: string;
};

export type SlackMessagePayload = {
  text: string;
  blocks: (KnownBlock | Block)[];
};

function money(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}/month`;
}

function evidenceText(evidence: Record<string, unknown>): string {
  if (typeof evidence.reason === 'string') return evidence.reason;
  return Object.entries(evidence)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('; ') || 'Threshold evidence was recorded by Cindr.';
}

function actionValue(findingId: string, action: 'approve' | 'deny'): string {
  const value: ApprovalActionValue = { findingId, actionId: `cindr:${action}:${findingId}` };
  return JSON.stringify(value);
}

export function parseApprovalActionValue(value: string): ApprovalActionValue {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as Record<string, unknown>).findingId !== 'string' || typeof (parsed as Record<string, unknown>).actionId !== 'string') {
    throw new Error('Invalid Cindr Slack action value');
  }
  return parsed as ApprovalActionValue;
}

export function buildWasteFindingMessage(input: WasteFindingMessageInput): SlackMessagePayload {
  const costLine = `Current monthly cost: *${money(input.currentMonthlyCostCents)}*. Projected monthly savings: *${money(input.projectedMonthlySavingsCents)}*.`;
  const resourceLine = `*Resource:* \`${input.resourceExternalId}\`  •  *Type:* \`${input.resourceType}\`  •  *Region:* \`${input.region}\``;
  const evidenceLine = `*Evidence:* ${evidenceText(input.evidence)}`;

  if (input.status === 'approved') {
    const policyLine = input.autoApprovedPolicyName
      ? `Auto-approved by policy: *${input.autoApprovedPolicyName}*.`
      : 'Approved for remediation.';
    return {
      text: `Cindr finding approved: ${input.resourceExternalId}.`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*Cindr finding approved*' } },
        { type: 'section', text: { type: 'mrkdwn', text: `${resourceLine}\n${evidenceLine}\n${costLine}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: policyLine }] },
      ],
    };
  }

  if (input.status === 'denied') {
    return {
      text: `Cindr finding denied: ${input.resourceExternalId}.`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*Cindr finding denied*' } },
        { type: 'section', text: { type: 'mrkdwn', text: `${resourceLine}\n${evidenceLine}\n${costLine}` } },
      ],
    };
  }

  return {
    text: `Cindr approval required: ${input.resourceExternalId} could save ${money(input.projectedMonthlySavingsCents)}.`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: '*Cindr approval required*' } },
      { type: 'section', text: { type: 'mrkdwn', text: `${resourceLine}\n${evidenceLine}\n${costLine}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'cindr_approve', value: actionValue(input.wasteFindingId, 'approve') },
        { type: 'button', text: { type: 'plain_text', text: 'Deny' }, style: 'danger', action_id: 'cindr_deny', value: actionValue(input.wasteFindingId, 'deny') },
      ] },
    ],
  };
}

export const buildApprovalMessage = buildWasteFindingMessage;
