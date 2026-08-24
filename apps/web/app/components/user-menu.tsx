'use client';

import { signOut } from 'next-auth/react';

export function UserMenu({ name, email }: { name?: string | null; email?: string | null }) {
  return <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-200">{name ?? email ?? 'Authenticated user'}</p><p className="text-[10px] text-slate-500">Organization member</p></div><button type="button" onClick={() => signOut({ callbackUrl: '/auth/signin' })} className="rounded-lg border border-[#28527d] bg-blue-950/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-100/80 transition hover:border-blue-300/70 hover:text-white">Sign out</button></div>;
}
