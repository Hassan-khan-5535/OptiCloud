import { formatDate, type FindingDetail } from '../lib/api';
import { StatusBadge } from './status-badge';

export function FindingTimeline({ entries }: { entries: FindingDetail['auditLog'] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No state transitions have been recorded for this finding.</p>;
  }

  return (
    <ol className="relative ml-2 border-l border-slate-800">
      {entries.map((entry) => (
        <li key={entry.id} className="relative pb-7 pl-7 last:pb-0">
          <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-cyan-400 ring-4 ring-[#0b1220]" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-100">
              {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : `created → ${entry.toStatus}`}
            </span>
            <StatusBadge status={entry.toStatus} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Actor: <strong className="font-medium text-slate-300">{entry.actor}</strong></span>
            <span>{formatDate(entry.createdAt)}</span>
          </div>
          {entry.reason && <p className="mt-2 text-sm leading-6 text-slate-400">{entry.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
