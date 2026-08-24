import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { organizationMembers, organizations, type Db } from '@cindr/db';
import type { AuthenticatedContext, AuthenticatedUser, OrganizationRole } from './auth.js';

function normalizeRole(role: string): OrganizationRole {
  return role === 'admin' || role === 'operator' || role === 'member' ? role : 'member';
}

export async function resolveOrganizationForUser(db: Db, user: AuthenticatedUser, requestedOrgId?: string): Promise<AuthenticatedContext & { orgName: string; orgSlug?: string }> {
  const membershipConditions = [eq(organizationMembers.userSubject, user.subject)];
  if (requestedOrgId) membershipConditions.push(eq(organizationMembers.orgId, requestedOrgId));
  const [membership] = await db.select({ orgId: organizationMembers.orgId, role: organizationMembers.role, orgName: organizations.name, orgSlug: organizations.slug })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(and(...membershipConditions))
    .limit(1);
  if (requestedOrgId && !membership) throw new Error('Requested organization is not available to this user');
  if (membership) return { ...user, orgId: membership.orgId, orgName: membership.orgName, role: normalizeRole(membership.role) };

  const slugSuffix = createHash('sha256').update(user.subject).digest('hex').slice(0, 16);
  const slug = `workspace-${slugSuffix}`;
  const [organization] = await db.insert(organizations).values({ slug, name: user.name ? `${user.name}'s Cindr workspace` : 'Cindr workspace' }).onConflictDoNothing().returning({ id: organizations.id, name: organizations.name });
  const orgId = organization?.id ?? (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1))[0]?.id;
  if (!orgId) throw new Error('Unable to provision organization');
  await db.insert(organizationMembers).values({ orgId, userSubject: user.subject, email: user.email ?? null, role: 'admin' }).onConflictDoNothing();
  return { ...user, orgId, orgName: organization?.name ?? 'Cindr workspace', role: 'admin' };
}

export async function resolveOrganizationForSlackTeam(db: Db, teamId: string) {
  const [organization] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.slackTeamId, teamId)).limit(1);
  return organization ?? null;
}

export async function bindSlackWorkspace(db: Db, orgId: string, teamId: string, channelId: string) {
  if (!/^T[A-Z0-9]{2,32}$/.test(teamId)) throw new Error('team_id must be a valid Slack workspace identifier');
  if (!/^[CGDA][A-Z0-9]{2,63}$/.test(channelId)) throw new Error('channel_id must be a valid Slack channel identifier');
  const [updated] = await db.update(organizations).set({ slackTeamId: teamId, slackChannelId: channelId, updatedAt: new Date() })
    .where(and(eq(organizations.id, orgId), isNull(organizations.slackTeamId))).returning({ id: organizations.id, name: organizations.name, slackTeamId: organizations.slackTeamId, slackChannelId: organizations.slackChannelId });
  if (updated) return updated;
  const [existing] = await db.select({ id: organizations.id, name: organizations.name, slackTeamId: organizations.slackTeamId, slackChannelId: organizations.slackChannelId }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (existing?.slackTeamId === teamId && existing.slackChannelId === channelId) return existing;
  if (!existing) throw new Error('Organization not found');
  throw new Error('This organization is already bound to a different Slack workspace');
}
