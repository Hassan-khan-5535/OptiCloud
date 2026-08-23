import { and, eq, type SQL, type AnyColumn } from 'drizzle-orm';

export type OrganizationContext = { orgId: string };

/** Every tenant-owned query must include this predicate; keeping it centralized makes missing scopes reviewable. */
export function orgScope(column: AnyColumn, orgId: string, ...conditions: Array<SQL | undefined>): SQL {
  return and(eq(column, orgId), ...conditions.filter((condition): condition is SQL => !!condition))!;
}

export function assertOrganizationContext(orgId: string | undefined): asserts orgId is string {
  if (!orgId || orgId.trim().length < 1) throw new Error('Organization context is required');
}
