import type { FindingStatus } from '../lib/api';
import { humanize } from '../lib/api';

export const STATUS_STYLES: Record<FindingStatus | string, { dot: string; text: string; background: string; border: string }> = {
  detected: { dot: 'bg-slate-400', text: 'text-slate-200', background: 'bg-slate-800/80', border: 'border-slate-700' },
  pending: { dot: 'bg-slate-400', text: 'text-slate-200', background: 'bg-slate-800/80', border: 'border-slate-700' },
  proposed: { dot: 'bg-amber-400', text: 'text-amber-200', background: 'bg-amber-400/10', border: 'border-amber-400/20' },
  approved: { dot: 'bg-cyan-400', text: 'text-cyan-200', background: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
  executing: { dot: 'bg-violet-400', text: 'text-violet-200', background: 'bg-violet-400/10', border: 'border-violet-400/20' },
  completed: { dot: 'bg-emerald-400', text: 'text-emerald-200', background: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  failed: { dot: 'bg-rose-400', text: 'text-rose-200', background: 'bg-rose-400/10', border: 'border-rose-400/20' },
  rolled_back: { dot: 'bg-sky-400', text: 'text-sky-200', background: 'bg-sky-400/10', border: 'border-sky-400/20' },
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
