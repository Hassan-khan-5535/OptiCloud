import Link from 'next/link';
import { ConnectAccountButton } from '../components/connect-account-button';
import { formatDate, type Account } from '../lib/api';
import { serverApiFetch } from '../lib/server-api';

export default async function AccountsPage() {
  let accounts: Account[] = [];
  let error = '';
  try {
    accounts = (await serverApiFetch<{ accounts: Account[] }>('/api/accounts')).accounts;
  } catch (requestError) {
    error = requestError instanceof Error ? requestError.message : 'The API request failed';
  }

  return <div className="space-y-8">
    <div className="flex flex-col gap-4 royal-divider border-b pb-7 md:flex-row md:items-end md:justify-between"><div><p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] royal-kicker">Infrastructure</p><h1 className="text-3xl font-semibold tracking-tight text-white">Cloud accounts</h1><p className="mt-2 text-sm text-slate-400">Connected provider accounts supplying resources and detector scope.</p></div><div className="flex items-center gap-4"><Link href="/" className="royal-link text-xs font-medium">← Overview</Link><ConnectAccountButton /></div></div>
    {error ? <div className="royal-panel rounded-xl border border-rose-400/20 bg-rose-400/5 p-5 text-sm text-rose-200">Account data unavailable. {error}.</div> : <section className="royal-panel overflow-hidden rounded-xl border"><div className="flex items-center justify-between royal-divider border-b px-5 py-5"><div><h2 className="text-sm font-semibold text-white">Connected accounts</h2><p className="mt-1 text-xs text-slate-500">Credentials are represented by an external reference only.</p></div><span className="rounded-md border border-blue-400/30 bg-blue-950/40 px-2.5 py-1 font-mono text-[11px] text-blue-200">{accounts.length} connected</span></div>{accounts.length === 0 ? <div className="data-grid px-5 py-16 text-center"><p className="text-sm font-medium text-slate-300">No cloud accounts connected.</p><p className="mt-2 text-xs text-slate-500">Use the stubbed connect flow above when account linking is implemented.</p></div> : <div className="divide-y divide-[#1a3554]">{accounts.map((account) => <AccountRow key={account.id} account={account} />)}</div>}</section>}
    <div className="royal-panel rounded-lg border px-4 py-3 text-xs leading-5 text-slate-500"><strong className="font-semibold text-slate-400">Stage 6 note:</strong> account listing is fully live. Linking a new AWS account is intentionally UI-only; no OAuth, role assumption, or credential exchange is performed.</div>
  </div>;
}

function AccountRow({ account }: { account: Account }) {
  return <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><span className="grid h-10 w-10 place-items-center rounded-lg border border-blue-400/35 bg-blue-950/50 font-mono text-xs font-bold text-blue-200">{account.provider.toUpperCase()}</span><div><p className="text-sm font-semibold text-slate-100">{account.externalId}</p><p className="mt-1 font-mono text-[11px] text-slate-600">{account.id}</p></div></div><div className="flex items-center gap-6 text-xs"><span className="inline-flex items-center gap-2 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{account.status}</span><span className="text-slate-600">Connected {formatDate(account.createdAt)}</span></div></div>;
}
