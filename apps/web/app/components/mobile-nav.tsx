'use client';

import Link from 'next/link';
import { useState } from 'react';

const navigation = [
  { href: '/', label: 'Overview' },
  { href: '/policies', label: 'Policies' },
  { href: '/accounts', label: 'Cloud accounts' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-primary-navigation"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open && (
        <nav id="mobile-primary-navigation" aria-label="Primary navigation" className="absolute right-0 top-12 z-30 w-52 rounded-lg border border-slate-700 bg-[#0b1220] p-2 shadow-2xl">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
