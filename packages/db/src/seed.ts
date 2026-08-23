import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { auditLog, cloudAccounts, resources, wasteFindings } from './schema.js';
import { transitionWasteFinding } from './state-machine.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const resourceIds = {
  volume: '00000000-0000-4000-8000-000000000011',
  rds: '00000000-0000-4000-8000-000000000012',
  ec2: '00000000-0000-4000-8000-000000000013',
};
const findingIds = {
  proposed: '00000000-0000-4000-8000-000000000021',
  approved: '00000000-0000-4000-8000-000000000022',
};

async function seed() {
  const { db, pool } = createDb();
  try {
    await db.insert(cloudAccounts).values({
      id: accountId,
      provider: 'aws',
      externalId: '000000000000',
      credentialsRef: 'secrets://cindr/local/fake-aws-account',
    }).onConflictDoNothing();

    await db.insert(resources).values([
      { id: resourceIds.volume, cloudAccountId: accountId, type: 'ebs_volume', externalId: 'vol-0c1ndr000000001', region: 'us-east-1', metadata: { name: 'staging-unattached-volume', environment: 'staging' } },
      { id: resourceIds.rds, cloudAccountId: accountId, type: 'rds_instance', externalId: 'cindr-staging-db', region: 'us-east-1', metadata: { engine: 'postgres', environment: 'staging' } },
      { id: resourceIds.ec2, cloudAccountId: accountId, type: 'ec2_instance', externalId: 'i-0c1ndr000000003', region: 'us-west-2', metadata: { instanceType: 't3.large', environment: 'development' } },
    ]).onConflictDoNothing();

    await db.insert(wasteFindings).values([
      { id: findingIds.proposed, resourceId: resourceIds.volume, findingType: 'unattached_volume', evidence: { reason: '0 attachments for 14 days', ageDays: 14 }, estimatedMonthlySavingsCents: 1200, status: 'detected' },
      { id: findingIds.approved, resourceId: resourceIds.rds, findingType: 'idle_database', evidence: { reason: '0 connections for 14 days', connectionCount: 0, ageDays: 14 }, estimatedMonthlySavingsCents: 8600, status: 'detected' },
    ]).onConflictDoNothing();

    const existingAudit = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.entityId, findingIds.proposed)).limit(1);
    if (existingAudit.length === 0) {
      await db.insert(auditLog).values([
        { entityType: 'waste_finding', entityId: findingIds.proposed, fromStatus: null, toStatus: 'detected', actor: 'system', reason: 'Seed finding created by Stage 2 fixture' },
        { entityType: 'waste_finding', entityId: findingIds.approved, fromStatus: null, toStatus: 'detected', actor: 'system', reason: 'Seed finding created by Stage 2 fixture' },
      ]);
    }

    const [proposed] = await db.select({ status: wasteFindings.status }).from(wasteFindings).where(eq(wasteFindings.id, findingIds.proposed));
    if (proposed?.status === 'detected') {
      await transitionWasteFinding(db, { findingId: findingIds.proposed, toStatus: 'proposed', actor: 'system', reason: 'Seed fixture demonstrates proposed state' });
    }

    const [approved] = await db.select({ status: wasteFindings.status }).from(wasteFindings).where(eq(wasteFindings.id, findingIds.approved));
    if (approved?.status === 'detected') {
      await transitionWasteFinding(db, { findingId: findingIds.approved, toStatus: 'proposed', actor: 'system', reason: 'Seed fixture demonstrates approval path' });
      await transitionWasteFinding(db, { findingId: findingIds.approved, toStatus: 'approved', actor: 'slack_user_id:U_CINDR_DEMO', reason: 'Seed fixture approval' });
    }

    console.info('Cindr Stage 2 seed complete', { accountId, resourceCount: 3, findingIds });
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
