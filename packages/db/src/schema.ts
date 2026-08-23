import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const cloudProviderEnum = pgEnum('cloud_provider', ['aws', 'gcp']);
export const resourceTypeEnum = pgEnum('resource_type', [
  'ebs_volume',
  'rds_instance',
  'ec2_instance',
  'load_balancer',
]);
export const wasteFindingStatusEnum = pgEnum('waste_finding_status', [
  'detected',
  'proposed',
  'approved',
  'executing',
  'completed',
  'failed',
  'rolled_back',
  'denied',
  'expired',
]);
export const remediationActionTypeEnum = pgEnum('remediation_action_type', [
  'stop_instance',
  'detach_volume',
  'delete_volume',
  'resize_instance',
]);
export const remediationActionStatusEnum = pgEnum('remediation_action_status', [
  'pending',
  'executing',
  'completed',
  'failed',
  'rolled_back',
]);
export const auditEntityTypeEnum = pgEnum('audit_entity_type', [
  'waste_finding',
  'remediation_action',
]);

export const cloudAccounts = pgTable('cloud_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: cloudProviderEnum('provider').notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  credentialsRef: varchar('credentials_ref', { length: 512 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  providerExternalIdUnique: uniqueIndex('cloud_accounts_provider_external_id_idx').on(table.provider, table.externalId),
}));

export const resources = pgTable('resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  cloudAccountId: uuid('cloud_account_id').notNull().references(() => cloudAccounts.id, { onDelete: 'cascade' }),
  type: resourceTypeEnum('type').notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  region: varchar('region', { length: 64 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  cloudResourceUnique: uniqueIndex('resources_cloud_account_type_external_id_idx').on(table.cloudAccountId, table.type, table.externalId),
}));

export const wasteFindings = pgTable('waste_findings', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  findingType: varchar('finding_type', { length: 128 }).notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
  estimatedMonthlySavingsCents: integer('estimated_monthly_savings_cents').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
  status: wasteFindingStatusEnum('status').default('detected').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const remediationActions = pgTable('remediation_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  wasteFindingId: uuid('waste_finding_id').notNull().references(() => wasteFindings.id, { onDelete: 'cascade' }),
  actionType: remediationActionTypeEnum('action_type').notNull(),
  isReversible: boolean('is_reversible').notNull(),
  rollbackAction: jsonb('rollback_action').$type<Record<string, unknown> | null>(),
  status: remediationActionStatusEnum('status').default('pending').notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  executedBy: varchar('executed_by', { length: 255 }),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: auditEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  fromStatus: varchar('from_status', { length: 32 }),
  toStatus: varchar('to_status', { length: 32 }).notNull(),
  actor: varchar('actor', { length: 255 }).notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  actorFormatCheck: check('audit_log_actor_format_chk', sql`${table.actor} = 'system' OR ${table.actor} LIKE 'slack_user_id:%'`),
}));

export const policies = pgTable('policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  cloudAccountId: uuid('cloud_account_id').notNull().references(() => cloudAccounts.id, { onDelete: 'cascade' }),
  rule: jsonb('rule').$type<Record<string, unknown>>().notNull(),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CloudAccount = typeof cloudAccounts.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type WasteFinding = typeof wasteFindings.$inferSelect;
export type RemediationAction = typeof remediationActions.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Policy = typeof policies.$inferSelect;
