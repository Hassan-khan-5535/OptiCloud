import type { FindingStatus } from '../lib/api';
import { humanize } from '../lib/api';

export const STATUS_STYLES: Record<FindingStatus | string, { dot: string; text: string; background: string; border: string }> = {
  detected: { dot: 'bg-blue-300', text: 'text-blue-100', background: 'bg-blue-950/50', border: 'border-blue-400/25' },
  pending: { dot: 'bg-blue-300', text: 'text-blue-100', background: 'bg-blue-950/50', border: 'border-blue-400/25' },
  proposed: { dot: 'bg-amber-300', text: 'text-amber-100', background: 'bg-amber-300/10', border: 'border-amber-300/35' },
  approved: { dot: 'bg-blue-400', text: 'text-blue-100', background: 'bg-blue-400/10', border: 'border-blue-400/35' },
  executing: { dot: 'bg-sky-300', text: 'text-sky-100', background: 'bg-sky-300/10', border: 'border-sky-300/35' },
  completed: { dot: 'bg-emerald-400', text: 'text-emerald-200', background: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  failed: { dot: 'bg-rose-400', text: 'text-rose-200', background: 'bg-rose-400/10', border: 'border-rose-400/20' },
  rolled_back: { dot: 'bg-blue-300', text: 'text-blue-100', background: 'bg-blue-300/10', border: 'border-blue-300/30' },
  denied: { dot: 'bg-rose-300', text: 'text-rose-200', background: 'bg-rose-300/10', border: 'border-rose-300/20' },
  expired: { dot: 'bg-slate-500', text: 'text-slate-300', background: 'bg-slate-500/10', border: 'border-slate-500/20' },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.detected;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] ${style.background} ${style.border} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}
