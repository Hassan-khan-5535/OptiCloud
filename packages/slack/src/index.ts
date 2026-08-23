import { App } from '@slack/bolt';

export {
  buildApprovalMessage,
  buildWasteFindingMessage,
  parseApprovalActionValue,
} from './messages.js';
export type {
  ApprovalActionValue,
  FindingMessageStatus,
  SlackMessagePayload,
  WasteFindingMessageInput,
} from './messages.js';

export function createSlackApp(): App {
  return new App({ token: process.env.SLACK_BOT_TOKEN, signingSecret: process.env.SLACK_SIGNING_SECRET });
}
