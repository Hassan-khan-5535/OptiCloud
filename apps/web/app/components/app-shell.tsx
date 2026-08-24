import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth';
import { MobileNav } from './mobile-nav';
import { UserMenu } from './user-menu';

const navigation = [
  { href: '/', label: 'Overview', short: 'OV', icon: '⌁' },
  { href: '/policies', label: 'Policies', short: 'PO', icon: '◇' },
  { href: '/accounts', label: 'Cloud accounts', short: 'AC', icon: '◌' },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <div className="royal-shell min-h-screen text-slate-100">
      <aside className="royal-sidebar fixed inset-y-0 left-0 z-20 hidden w-64 flex-col lg:flex">
        <div className="royal-brand flex h-16 items-center px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="Cindr overview">
            <span className="royal-logo-mark grid h-9 w-9 place-items-center rounded-xl text-sm font-black">C</span>
            <span><span className="block text-sm font-bold tracking-[0.22em] text-white">CINDR</span><span className="mt-0.5 block text-[9px] uppercase tracking-[0.16em] text-slate-500">FinOps control plane</span></span>
          </Link>
        </div>
        <div className="px-4 pt-7">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Control plane</p>
          <nav className="mt-3 space-y-1.5" aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} data-nav-item className="royal-nav group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition-colors">
                <span className="royal-nav-icon grid h-7 w-7 place-items-center rounded-lg border font-mono text-[13px] font-bold">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <span className="royal-nav-short font-mono text-[9px] opacity-0 transition-opacity group-hover:opacity-100">{item.short}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-8 px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Policies</p>
          <Link href="/policies" className="royal-nav royal-subnav group mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition-colors"><span className="royal-nav-icon grid h-7 w-7 place-items-center rounded-lg border font-mono text-[13px]">▤</span><span>Policy library</span></Link>
          <Link href="/policies" className="royal-create-link mt-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors"><span className="grid h-7 w-7 place-items-center rounded-lg border border-blue-400/40 text-base">+</span><span>Create live policy</span></Link>
        </div>
        <div className="mt-auto p-4">
          <div className="royal-system-card rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-emerald-300"><span className="royal-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />All systems nominal</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">AWS production workspace<br />Stage 8 · authenticated control plane</p>
          </div>
          {session && <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950/30 p-3"><span className="royal-avatar grid h-9 w-9 place-items-center rounded-full text-xs font-bold">{session.user.name?.slice(0, 1).toUpperCase() ?? 'C'}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{session.user.name}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">FinOps operator</p></div></div>}
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="royal-header sticky top-0 z-10 flex h-16 items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-3 lg:hidden"><MobileNav /><span className="royal-logo-mark grid h-8 w-8 place-items-center rounded-lg text-xs font-black">C</span><span className="text-xs font-bold tracking-[0.2em]">CINDR</span></div>
          <div className="royal-breadcrumb hidden text-xs lg:block"><span>FinOps</span><span className="mx-2 text-slate-700">/</span><span className="text-slate-200">Operations</span></div>
          <div className="ml-auto flex items-center gap-4 text-xs text-slate-400"><span className="hidden sm:inline">AWS production workspace</span><span className="royal-live-dot h-1.5 w-1.5 rounded-full bg-blue-400" /><span className="text-slate-200">Live</span>{session && <UserMenu name={session.user.name} email={session.user.email} />}</div>
        </header>
        <main className="royal-main mx-auto min-h-[calc(100vh-4rem)] max-w-[1440px] px-5 py-8 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
