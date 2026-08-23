import { App } from '@slack/bolt';
import type { Block, KnownBlock } from '@slack/types';

export type ApprovalMessageInput = { resourceId: string; resourceLabel: string; monthlySavingsCents: number; approvalId: string };

export function buildApprovalMessage(input: ApprovalMessageInput): { blocks: (KnownBlock | Block)[]; text: string } {
  const savings = `$${(input.monthlySavingsCents / 100).toFixed(2)}/month`;
  return {
    text: `Cindr approval required: ${input.resourceLabel} could save ${savings}.`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*Cindr approval required*\n${input.resourceLabel} could save *${savings}*.` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'cindr_approve', value: input.approvalId },
        { type: 'button', text: { type: 'plain_text', text: 'Deny' }, style: 'danger', action_id: 'cindr_deny', value: input.approvalId },
      ] },
    ],
  };
}

export function createSlackApp(): App {
  return new App({ token: process.env.SLACK_BOT_TOKEN, signingSecret: process.env.SLACK_SIGNING_SECRET });
}
