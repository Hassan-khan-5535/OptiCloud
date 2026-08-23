'use client';

import { useState } from 'react';
import { CLIENT_API_URL, humanize, type Account } from '../lib/api';

export function PolicyForm({ accounts }: { accounts: Account[] }) {
  const [findingType, setFindingType] = useState('unattached_volume');
  const [action, setAction] = useState('auto_approve');
  const [minAgeDays, setMinAgeDays] = useState('');
  const [threshold, setThreshold] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!minAgeDays && !threshold) { setState('error'); setMessage('Provide min_age_days or threshold.'); return; }
    if (minAgeDays && threshold) { setState('error'); setMessage('Provide only one of min_age_days or threshold.'); return; }
    setState('saving');
    setMessage('');
    try {
      const response = await fetch(`${CLIENT_API_URL}/api/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding_type: findingType, action, cloud_account_id: accountId || undefined, min_age_days: minAgeDays || undefined, threshold: threshold || undefined }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Policy creation failed');
      setState('saved');
      setMessage('Policy created. Refresh to see it in the active list.');
      setMinAgeDays('');
      setThreshold('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Policy creation failed');
    }
  }

  return <form onSubmit={submit} className="space-y-5">
    <div><label htmlFor="account" className="label">Cloud account</label><select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="field">{accounts.length === 0 ? <option value="">No connected accounts</option> : accounts.map((account) => <option key={account.id} value={account.id}>{account.provider.toUpperCase()} · {account.externalId}</option>)}</select></div>
    <div><label htmlFor="finding-type" className="label">Finding type</label><select id="finding-type" value={findingType} onChange={(event) => setFindingType(event.target.value)} className="field">{['unattached_volume', 'idle_load_balancer', 'underutilized_rds'].map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></div>
    <div><label htmlFor="action" className="label">Action</label><select id="action" value={action} onChange={(event) => setAction(event.target.value)} className="field"><option value="auto_approve">Auto approve</option><option value="manual_review">Manual review</option></select></div>
    <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="min-age-days" className="label">min_age_days <span className="normal-case tracking-normal text-slate-600">(optional)</span></label><input id="min-age-days" type="number" min="0" step="1" value={minAgeDays} onChange={(event) => setMinAgeDays(event.target.value)} placeholder="14" className="field" /></div><div><label htmlFor="threshold" className="label">threshold <span className="normal-case tracking-normal text-slate-600">(optional)</span></label><input id="threshold" type="number" min="0" step="any" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="10" className="field" /></div></div>
    <p className="text-[11px] leading-5 text-slate-500">The detection engine matches <code className="text-slate-300">finding_type</code> and <code className="text-slate-300">action</code>; provide one optional rule constraint for the stored policy.</p>
    <button type="submit" disabled={state === 'saving' || accounts.length === 0} className="w-full rounded-lg bg-cyan-400 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">{state === 'saving' ? 'Saving…' : 'Create policy'}</button>
    {message && <p className={`text-xs ${state === 'saved' ? 'text-emerald-300' : 'text-rose-300'}`}>{message}</p>}
  </form>;
}
