'use client';

import { useState } from 'react';

export function ConnectAccountButton() {
  const [open, setOpen] = useState(false);
  return <div className="flex flex-col items-end gap-2"><button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg bg-cyan-400 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-950 transition hover:bg-cyan-300 active:scale-[0.98]">Connect AWS account</button>{open && <div className="max-w-xs rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-right text-xs leading-5 text-amber-200">Account linking is staged for a future release.{/* TODO: replace this stub with the OAuth / role-assumption flow. */}</div>}</div>;
}
