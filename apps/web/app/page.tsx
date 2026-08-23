export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-8 py-16 text-slate-100">
      <section className="mx-auto max-w-4xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-amber-300">Cindr</p>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">Catch the waste before it burns.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          The FinOps control plane for detecting cloud waste, routing safe approvals through Slack, and keeping every action auditable.
        </p>
        <div className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20">
          <p className="text-sm font-medium text-slate-400">Stage 1 status</p>
          <p className="mt-2 text-xl">Hello, Cindr. The dashboard scaffold is ready.</p>
          <p className="mt-3 text-sm text-slate-400">Detection and remediation workflows are intentionally out of scope for this stage.</p>
        </div>
      </section>
    </main>
  );
}
