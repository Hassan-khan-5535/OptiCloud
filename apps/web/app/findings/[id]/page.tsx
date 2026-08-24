import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FindingTimeline } from '../../components/finding-timeline';
import { RollbackButton } from '../../components/rollback-button';
import { StatusBadge } from '../../components/status-badge';
import { formatCurrency, formatDate, humanize, type FindingDetail } from '../../lib/api';
import { ServerApiError, serverApiFetch } from '../../lib/server-api';

function JsonBlock({ value }: { value: Record<string, unknown> }) {
  return <pre className="max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-[#070b12] p-4 font-mono text-xs leading-6 text-cyan-100/80">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let finding: FindingDetail;
  try {
    finding = await serverApiFetch<FindingDetail>(`/api/findings/${id}`);
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) notFound();
    return <div className="space-y-5"><Link href="/" className="text-xs text-cyan-300 hover:text-cyan-200">← Back to overview</Link><div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-5 text-sm text-rose-200">Finding data unavailable. {error instanceof Error ? error.message : 'The API request failed'}.</div></div>;
  }

  const canRollback = finding.remediationAction?.isReversible && finding.remediationAction.status === 'completed';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 border-b border-slate-800/80 pb-7 md:flex-row md:items-end md:justify-between">
        <div><Link href="/" className="text-xs font-medium text-cyan-300 hover:text-cyan-200">← Back to overview</Link><div className="mt-5 flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-slate-500">FINDING / {finding.id.slice(0, 8)}</span><StatusBadge status={finding.status} /></div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{humanize(finding.findingType)}</h1><p className="mt-2 text-sm text-slate-400">{finding.resource.externalId} · {humanize(finding.resource.type)} · {finding.resource.region}</p></div>
        {canRollback && finding.remediationAction && <RollbackButton remediationActionId={finding.remediationAction.id} />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Evidence</h2><p className="mt-1 text-xs text-slate-500">Raw detector output from the waste finding</p></div><span className="rounded border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">JSON</span></div><div className="mt-5"><JsonBlock value={finding.evidence} /></div></section>
          <section className="rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">State transition history</h2><p className="mt-1 text-xs text-slate-500">Append-only entries from <code className="text-slate-300">audit_log</code></p></div><span className="font-mono text-xs text-slate-600">{finding.auditLog.length} events</span></div><div className="mt-6"><FindingTimeline entries={finding.auditLog} /></div></section>
        </div>
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><h2 className="text-sm font-semibold text-white">Cost model</h2><p className="mt-1 text-xs leading-5 text-slate-500">Why this finding is worth acting on</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-slate-900/70 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">Current monthly cost</p><p className="mt-2 font-mono text-lg font-semibold text-slate-100">{formatCurrency(finding.costModel.currentMonthlyCostCents)}</p></div><div className="rounded-lg bg-cyan-400/5 p-3"><p className="text-[10px] uppercase tracking-wider text-cyan-400/70">Projected savings</p><p className="mt-2 font-mono text-lg font-semibold text-cyan-300">{formatCurrency(finding.costModel.projectedMonthlySavingsCents)}</p></div></div><p className="mt-4 text-xs leading-5 text-slate-400">{finding.costModel.explanation}</p></section>
          <section className="rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><h2 className="text-sm font-semibold text-white">Resource context</h2><dl className="mt-5 space-y-3 text-xs"><DetailRow label="Provider" value={finding.resource.provider.toUpperCase()} /><DetailRow label="Account" value={finding.resource.accountExternalId} mono /><DetailRow label="Resource ID" value={finding.resource.externalId} mono /><DetailRow label="Region" value={finding.resource.region} /><DetailRow label="Detected" value={formatDate(finding.detectedAt)} /><DetailRow label="Last updated" value={formatDate(finding.updatedAt)} /></dl></section>
          {finding.remediationAction && <section className="rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Remediation action</h2><StatusBadge status={finding.remediationAction.status} /></div><dl className="mt-5 space-y-3 text-xs"><DetailRow label="Action" value={humanize(finding.remediationAction.actionType)} /><DetailRow label="Reversible" value={finding.remediationAction.isReversible ? 'Yes' : 'No'} /><DetailRow label="Action ID" value={finding.remediationAction.id.slice(0, 12)} mono /></dl>{!canRollback && <p className="mt-4 border-t border-slate-800 pt-4 text-[11px] leading-5 text-slate-600">Rollback becomes available only when this action is reversible and completed.</p>}</section>}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className={`text-right text-slate-200 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</dd></div>;
}
