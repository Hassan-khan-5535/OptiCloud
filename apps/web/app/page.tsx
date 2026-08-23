import Link from 'next/link';
import { StatusBadge } from './components/status-badge';
import { formatCurrency, humanize, serverApiFetch, type Overview } from './lib/api';

function PageHeader() {
  return (
    <div className="flex flex-col justify-between gap-5 border-b border-slate-800/80 pb-7 md:flex-row md:items-end">
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Operations overview</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Catch the waste before it burns.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Monitor detected cloud waste, controlled remediation, and the audit trail behind every decision.</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-400" />Live data · refreshed on request</div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-5 text-sm text-rose-200"><p className="font-semibold">Dashboard data unavailable</p><p className="mt-1 text-rose-200/70">{message}. Start the API and database services to view live records.</p></div>;
}

function EvidencePreview({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).slice(0, 2);
  if (entries.length === 0) return <span className="text-slate-600">No evidence recorded</span>;
  return <span>{entries.map(([key, value]) => `${humanize(key)}: ${String(value)}`).join(' · ')}</span>;
}

export default async function Home() {
  let data: Overview | null = null;
  let error = '';
  try {
    data = await serverApiFetch<Overview>('/api/overview');
  } catch (requestError) {
    error = requestError instanceof Error ? requestError.message : 'The API request failed';
  }

  return (
    <div className="space-y-8">
      <PageHeader />
      {error ? <ErrorPanel message={error} /> : data && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Detected monthly waste" value={formatCurrency(data.totals.detectedMonthlyWasteCents)} detail="Open findings · current run rate" accent="amber" />
            <MetricCard label="Remediated to date" value={formatCurrency(data.totals.remediatedToDateCents)} detail="Completed findings · cumulative" accent="emerald" />
            <MetricCard label="Open findings" value={String(data.totals.openFindingCount).padStart(2, '0')} detail="Detected · proposed · approved · executing" accent="cyan" />
          </section>
          <section className="overflow-hidden rounded-xl border border-slate-800/90 bg-[#0b1220] shadow-2xl shadow-black/10">
            <div className="flex flex-col gap-3 border-b border-slate-800/90 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-sm font-semibold text-white">Open findings</h2><p className="mt-1 text-xs text-slate-500">Prioritized by estimated monthly savings</p></div>
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-400">{data.findings.length} records</span>
            </div>
            {data.findings.length === 0 ? <div className="data-grid px-5 py-16 text-center"><p className="text-sm font-medium text-slate-300">No open waste findings.</p><p className="mt-2 text-xs text-slate-500">The next detection run will appear here when a threshold is crossed.</p></div> : <div className="divide-y divide-slate-800/80">
              {data.findings.map((finding) => (
                <Link key={finding.id} href={`/findings/${finding.id}`} className="group grid gap-4 px-5 py-5 transition-colors hover:bg-slate-900/70 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_160px_120px] md:items-center">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-slate-100 group-hover:text-cyan-300">{finding.resource.externalId}</span><span className="hidden rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">{finding.resource.provider.toUpperCase()}</span></div><p className="mt-1 text-xs text-slate-500">{humanize(finding.resource.type)} · {finding.resource.region}</p></div>
                  <div className="min-w-0 text-xs leading-5 text-slate-400"><p className="font-medium text-slate-300">{humanize(finding.findingType)}</p><p className="truncate text-slate-500"><EvidencePreview evidence={finding.evidence} /></p></div>
                  <div><p className="font-mono text-sm font-semibold text-slate-100">{formatCurrency(finding.estimatedMonthlySavingsCents)}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">monthly savings</p></div>
                  <div className="md:text-right"><StatusBadge status={finding.status} /></div>
                </Link>
              ))}
            </div>}
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: 'amber' | 'emerald' | 'cyan' }) {
  const accents = { amber: 'text-amber-300', emerald: 'text-emerald-300', cyan: 'text-cyan-300' };
  return <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><div className={`mb-5 h-1 w-8 rounded-full bg-current ${accents[accent]}`} /><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 font-mono text-3xl font-semibold tracking-tight ${accents[accent]}`}>{value}</p><p className="mt-3 text-[11px] text-slate-600">{detail}</p></div>;
}
