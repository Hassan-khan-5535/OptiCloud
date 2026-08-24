'use client';

export function ConnectAccountButton() {
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled
        aria-describedby="account-linking-status"
        className="cursor-not-allowed rounded-lg bg-cyan-400/50 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-950/70"
      >
        AWS account linking unavailable
      </button>
      <p id="account-linking-status" className="max-w-xs text-right text-xs leading-5 text-amber-200">
        Account linking is staged for a future release; no account connection will be attempted.
      </p>
    </div>
  );
}
