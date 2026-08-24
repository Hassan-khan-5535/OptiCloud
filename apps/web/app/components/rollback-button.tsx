'use client';

import { useState } from 'react';
import { CLIENT_API_URL } from '../lib/api';

export function RollbackButton({ remediationActionId }: { remediationActionId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function queueRollback() {
    setState('loading');
    setMessage('');
    try {
      const response = await fetch(`${CLIENT_API_URL}/remediations/${remediationActionId}/rollback`, { method: 'POST' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Rollback request failed');
      setState('queued');
      setMessage('Rollback queued for the worker');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Rollback request failed');
    }
  }

  if (state === 'queued') return <span role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded-lg border border-blue-400/35 bg-blue-950/50 px-3 py-2 text-xs font-semibold text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />{message}</span>;

  return <div className="flex flex-col items-end gap-2"><button type="button" onClick={queueRollback} disabled={state === 'loading'} className="rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200/70 hover:bg-amber-300/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">{state === 'loading' ? 'Queueing…' : 'Rollback'}</button>{message && <p role="alert" aria-live="assertive" className="text-right text-[11px] text-rose-300">{message}</p>}</div>;
}
