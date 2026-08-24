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
        className="rounded-md border border-[#28527d] bg-blue-950/30 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:border-blue-300/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/60"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open && (
        <nav id="mobile-primary-navigation" aria-label="Primary navigation" className="royal-panel absolute right-0 top-12 z-30 w-52 rounded-xl border p-2 shadow-2xl">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-blue-950/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/60">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
