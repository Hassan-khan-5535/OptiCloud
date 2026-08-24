import Link from 'next/link';
import { PolicyForm } from '../components/policy-form';
import { formatDate, humanize, type Account, type Policy } from '../lib/api';
import { serverApiFetch } from '../lib/server-api';

export default async function PoliciesPage() {
  let policies: Policy[] = [];
  let accounts: Account[] = [];
  let error = '';
  try {
    const [policyResponse, accountResponse] = await Promise.all([
      serverApiFetch<{ policies: Policy[] }>('/api/policies'),
      serverApiFetch<{ accounts: Account[] }>('/api/accounts'),
    ]);
    policies = policyResponse.policies;
    accounts = accountResponse.accounts;
  } catch (requestError) {
    error = requestError instanceof Error ? requestError.message : 'The API request failed';
  }

  return <div className="space-y-8">
    <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-7 md:flex-row md:items-end md:justify-between"><div><p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Governance</p><h1 className="text-3xl font-semibold tracking-tight text-white">Policies</h1><p className="mt-2 text-sm text-slate-400">Evaluate explicit compound rules before they can approve infrastructure changes.</p></div><Link href="/" className="text-xs font-medium text-cyan-300 hover:text-cyan-200">← Back to overview</Link></div>
    {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-5 text-sm text-rose-200">Policy data unavailable. {error}.</div> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-xl border border-slate-800/90 bg-[#0b1220]"><div className="flex items-center justify-between border-b border-slate-800/90 px-5 py-5"><div><h2 className="text-sm font-semibold text-white">Policies</h2><p className="mt-1 text-xs text-slate-500">Live, dry-run, auto-approval, and manual-review rules</p></div><span className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-400">{policies.length} rules</span></div>{policies.length === 0 ? <div className="data-grid px-5 py-16 text-center"><p className="text-sm font-medium text-slate-300">No policies configured.</p><p className="mt-2 text-xs text-slate-500">Create a dry-run policy first to trial its matches safely.</p></div> : <div className="divide-y divide-slate-800/80">{policies.map((policy) => <PolicyRow key={policy.id} policy={policy} />)}</div>}</section>
      <section className="rounded-xl border border-slate-800/90 bg-[#0b1220] p-5"><div className="mb-5 border-b border-slate-800/90 pb-5"><h2 className="text-sm font-semibold text-white">New policy</h2><p className="mt-1 text-xs leading-5 text-slate-500">Compound rules are stored in the shared versioned schema.</p></div><PolicyForm accounts={accounts} /></section>
    </div>}
  </div>;
}

function PolicyRow({ policy }: { policy: Policy }) {
  const entries = Object.entries(policy.rule).filter(([key]) => key !== 'all');
  const conditions = Array.isArray(policy.rule.all) ? policy.rule.all as Array<Record<string, unknown>> : [];
  return <div className="px-5 py-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-100">{String(policy.rule.name ?? 'Unnamed policy')}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${policy.mode === 'dry_run' ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>{policy.mode === 'dry_run' ? 'Dry run' : 'Live'}</span></div><p className="mt-1 text-xs text-slate-500">{humanize(String(policy.rule.finding_type ?? 'Unknown finding'))} · {policy.account.provider.toUpperCase()} · {policy.account.externalId}</p></div><span className="font-mono text-[11px] text-slate-600">{formatDate(policy.createdAt)}</span></div><div className="mt-4 flex flex-wrap gap-2">{entries.map(([key, value]) => <span key={key} className="rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-400"><span className="text-slate-600">{key}=</span>{String(value)}</span>)}<span className="rounded-md border border-cyan-400/15 bg-cyan-400/5 px-2.5 py-1.5 font-mono text-[11px] text-cyan-300">{conditions.length} conditions / ALL</span></div>{policy.mode === 'dry_run' && <DryRunMatches policy={policy} />}</div>;
}

function DryRunMatches({ policy }: { policy: Policy }) {
  return <div className="mt-5 rounded-lg border border-amber-400/15 bg-amber-400/[0.03] p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Dry-run matches</p><span className="font-mono text-[10px] text-slate-600">{policy.dryRunMatches.length} recorded</span></div>{policy.dryRunMatches.length === 0 ? <p className="mt-2 text-xs text-slate-600">No matching findings recorded yet.</p> : <div className="mt-3 space-y-2">{policy.dryRunMatches.slice(0, 5).map((match) => <Link key={match.id} href={`/findings/${match.findingId}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs hover:border-amber-400/30"><span className="font-mono text-slate-300">{match.findingId.slice(0, 12)}</span><span className="text-slate-600">{formatDate(match.createdAt)}</span></Link>)}</div>}</div>;
}
