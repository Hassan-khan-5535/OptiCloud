import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const resources = pgTable('resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  externalId: text('external_id').notNull(),
  resourceType: varchar('resource_type', { length: 64 }).notNull(),
  region: varchar('region', { length: 64 }),
  estimatedMonthlyWasteCents: integer('estimated_monthly_waste_cents').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  resourceId: uuid('resource_id').references(() => resources.id),
  action: varchar('action', { length: 64 }).notNull(),
  fromState: varchar('from_state', { length: 32 }),
  toState: varchar('to_state', { length: 32 }).notNull(),
  actor: text('actor').notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
