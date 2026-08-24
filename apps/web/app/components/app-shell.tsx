import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth';
import { MobileNav } from './mobile-nav';
import { UserMenu } from './user-menu';

const navigation = [
  { href: '/', label: 'Overview', short: 'OV' },
  { href: '/policies', label: 'Policies', short: 'PO' },
  { href: '/accounts', label: 'Cloud accounts', short: 'AC' },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-800/80 bg-[#0a0f18] lg:flex">
        <div className="flex h-16 items-center border-b border-slate-800/80 px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Cindr overview">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400 text-xs font-black text-slate-950">C</span>
            <span className="text-sm font-bold tracking-[0.22em] text-white">CINDR</span>
          </Link>
        </div>
        <div className="px-4 pt-7">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Control plane</p>
          <nav className="mt-3 space-y-1" aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white">
                <span className="grid h-6 w-6 place-items-center rounded-md border border-slate-700 bg-slate-900 font-mono text-[9px] font-bold text-slate-500 group-hover:border-cyan-400/30 group-hover:text-cyan-300">{item.short}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-slate-800/80 p-5">
          <div className="flex items-center gap-2 text-xs text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />All systems nominal</div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">Organization workspace<br />Stage 8 · authenticated control plane</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-800/80 bg-[#070b12]/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileNav />
            <span className="grid h-7 w-7 place-items-center rounded-md bg-cyan-400 text-xs font-black text-slate-950">C</span>
            <span className="text-xs font-bold tracking-[0.2em]">CINDR</span>
          </div>
          <div className="hidden text-xs text-slate-500 lg:block">FinOps / <span className="text-slate-300">Operations</span></div>
          <div className="ml-auto flex items-center gap-4 text-xs text-slate-500"><span className="hidden sm:inline">AWS production workspace</span><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Live {session && <UserMenu name={session.user.name} email={session.user.email} />}</div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1440px] px-5 py-8 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
