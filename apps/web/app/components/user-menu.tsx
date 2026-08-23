'use client';

import { signOut } from 'next-auth/react';

export function UserMenu({ name, email }: { name?: string | null; email?: string | null }) {
  return <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-200">{name ?? email ?? 'Authenticated user'}</p><p className="text-[10px] text-slate-600">Organization member</p></div><button type="button" onClick={() => signOut({ callbackUrl: '/auth/signin' })} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:border-slate-500 hover:text-white">Sign out</button></div>;
}
