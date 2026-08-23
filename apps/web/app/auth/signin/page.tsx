'use client';

import { signIn } from 'next-auth/react';

export default function SignInPage() {
  return <main className="grid min-h-screen place-items-center bg-[#070b12] px-6 text-slate-100"><section className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0b1220] p-8 shadow-2xl shadow-cyan-950/20"><div className="mb-8 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400 text-sm font-black text-slate-950">C</span><span className="text-sm font-bold tracking-[0.22em] text-white">CINDR</span></div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">Control plane</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Sign in to continue</h1><p className="mt-3 text-sm leading-6 text-slate-400">Use your GitHub identity to enter an organization-scoped Cindr workspace.</p><button type="button" onClick={() => signIn('github', { callbackUrl: '/' })} className="mt-8 w-full rounded-lg bg-cyan-400 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-300 active:scale-[0.99]">Continue with GitHub</button></section></main>;
}
