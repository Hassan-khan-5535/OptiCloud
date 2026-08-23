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
      const response = await fetch(`${CLIENT_API_URL}/api/remediations/${remediationActionId}/rollback`, { method: 'POST' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Rollback request failed');
      setState('queued');
      setMessage('Rollback queued for the worker');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Rollback request failed');
    }
  }

  if (state === 'queued') return <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{message}</span>;

  return <div className="flex flex-col items-end gap-2"><button type="button" onClick={queueRollback} disabled={state === 'loading'} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-300/60 hover:bg-rose-400/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">{state === 'loading' ? 'Queueing…' : 'Rollback'}</button>{message && <p className="text-right text-[11px] text-rose-300">{message}</p>}</div>;
}
