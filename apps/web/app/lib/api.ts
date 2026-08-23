export type FindingStatus = 'detected' | 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'rolled_back' | 'denied' | 'expired';

export type Finding = {
  id: string;
  findingType: string;
  status: FindingStatus;
  evidence: Record<string, unknown>;
  estimatedMonthlySavingsCents: number;
  detectedAt: string | null;
  updatedAt: string | null;
  resource: {
    id: string;
    externalId: string;
    type: string;
    region: string;
    provider: string;
    accountExternalId: string;
  };
};

export type Overview = {
  totals: {
    detectedMonthlyWasteCents: number;
    remediatedToDateCents: number;
    openFindingCount: number;
  };
  findings: Finding[];
};

export type FindingDetail = Finding & {
  accountId: string;
  costModel: {
    currentMonthlyCostCents: number;
    projectedMonthlySavingsCents: number;
    explanation: string;
  };
  remediationAction: {
    id: string;
    actionType: string;
    isReversible: boolean;
    status: string;
    rollbackAction: Record<string, unknown> | null;
  } | null;
  auditLog: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    reason: string | null;
    createdAt: string | null;
  }>;
};

export type Policy = {
  id: string;
  rule: Record<string, unknown>;
  createdBy: string;
  active: boolean;
  mode: 'live' | 'dry_run';
  createdAt: string | null;
  updatedAt: string | null;
  account: { id: string; provider: string; externalId: string };
  dryRunMatches: Array<{ id: string; findingId: string; matched: boolean; safe: boolean; conditionResults: unknown; createdAt: string | null }>;
};

export type Account = {
  id: string;
  provider: string;
  externalId: string;
  status: 'connected';
  createdAt: string | null;
};

export const CLIENT_API_URL = '/api/cindr';

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
