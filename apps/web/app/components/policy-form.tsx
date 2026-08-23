'use client';

import { useState } from 'react';
import { CLIENT_API_URL, humanize, type Account } from '../lib/api';

export function PolicyForm({ accounts }: { accounts: Account[] }) {
  const [name, setName] = useState('');
  const [findingType, setFindingType] = useState('unattached_volume');
  const [action, setAction] = useState('auto_approve');
  const [minAgeDays, setMinAgeDays] = useState('14');
  const [maxMonthlyCost, setMaxMonthlyCost] = useState('50');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [active, setActive] = useState(true);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const age = Number(minAgeDays);
    const costDollars = Number(maxMonthlyCost);
    if (!name.trim()) { setState('error'); setMessage('Give this policy a name.'); return; }
    if (!Number.isFinite(age) || age < 0) { setState('error'); setMessage('min_age_days must be a non-negative number.'); return; }
    if (!Number.isFinite(costDollars) || costDollars < 0) { setState('error'); setMessage('max monthly cost must be a non-negative number.'); return; }
    setState('saving');
    setMessage('');
    try {
      const response = await fetch(`${CLIENT_API_URL}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          finding_type: findingType,
          action,
          active,
          cloud_account_id: accountId || undefined,
          conditions: [
            { field: 'finding_type', operator: 'eq', value: findingType },
            { field: 'evidence.age_days', operator: 'gte', value: age },
            { field: 'estimated_monthly_savings_cents', operator: 'lte', value: Math.round(costDollars * 100) },
          ],
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Policy creation failed');
      setState('saved');
      setMessage(active ? 'Live policy created.' : 'Dry-run policy created. It will be evaluated without approving findings.');
      setName('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Policy creation failed');
    }
  }

  return <form onSubmit={submit} className="space-y-5">
    <div><label htmlFor="policy-name" className="label">Policy name</label><input id="policy-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Old unattached volumes under $50" className="field" /></div>
    <div><label htmlFor="account" className="label">Cloud account</label><select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="field">{accounts.length === 0 ? <option value="">No connected accounts</option> : accounts.map((account) => <option key={account.id} value={account.id}>{account.provider.toUpperCase()} · {account.externalId}</option>)}</select></div>
    <div><label htmlFor="finding-type" className="label">Finding type</label><select id="finding-type" value={findingType} onChange={(event) => setFindingType(event.target.value)} className="field">{['unattached_volume', 'idle_load_balancer', 'underutilized_rds'].map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></div>
    <div><label htmlFor="action" className="label">Action</label><select id="action" value={action} onChange={(event) => setAction(event.target.value)} className="field"><option value="auto_approve">Auto approve</option><option value="manual_review">Manual review</option></select></div>
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-400">All conditions must match</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label htmlFor="min-age-days" className="label">Age ≥ days</label><input id="min-age-days" type="number" min="0" step="1" value={minAgeDays} onChange={(event) => setMinAgeDays(event.target.value)} className="field" /></div><div><label htmlFor="max-monthly-cost" className="label">Monthly cost ≤ USD</label><input id="max-monthly-cost" type="number" min="0" step="0.01" value={maxMonthlyCost} onChange={(event) => setMaxMonthlyCost(event.target.value)} className="field" /></div></div><p className="mt-3 text-[11px] leading-5 text-slate-500">Stored as explicit <code className="text-slate-300">all</code> conditions. Cost is converted to cents before persistence.</p></div>
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-800 px-3 py-3"><span><span className="block text-xs font-semibold text-slate-200">Live policy</span><span className="mt-1 block text-[11px] text-slate-500">Turn off to evaluate as dry-run only.</span></span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-cyan-400" /></label>
    <button type="submit" disabled={state === 'saving' || accounts.length === 0} className="w-full rounded-lg bg-cyan-400 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">{state === 'saving' ? 'Saving…' : active ? 'Create live policy' : 'Create dry-run policy'}</button>
    {message && <p className={`text-xs ${state === 'saved' ? 'text-emerald-300' : 'text-rose-300'}`}>{message}</p>}
  </form>;
}
