'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInPage() {
  const [error, setError] = useState('');

  async function continueWithGitHub() {
    setError('');
    const result = await signIn('github', { callbackUrl: '/', redirect: false });
    if (result?.error) setError('GitHub sign-in is unavailable. Configure GitHub OAuth credentials and try again.');
    else if (result?.url) window.location.assign(result.url);
  }

  return (
    <main className="royal-auth">
      <div className="royal-auth-grid" aria-hidden="true" />
      <span className="royal-auth-orb royal-auth-orb-one" aria-hidden="true" />
      <span className="royal-auth-orb royal-auth-orb-two" aria-hidden="true" />
      <span className="royal-auth-orb royal-auth-orb-three" aria-hidden="true" />
      <div className="royal-auth-layout">
        <section className="royal-auth-story" aria-label="Cindr product overview">
          <p className="royal-auth-eyebrow">Cindr / FinOps control plane</p>
          <h1>See the <span>signal.</span><br />Act with confidence.</h1>
          <p>Turn cloud waste into a clear operating rhythm. Cindr surfaces the evidence, keeps approvals deliberate, and makes every remediation decision auditable.</p>
          <div className="royal-auth-signal">
            <div className="royal-auth-signal-head"><span>Live savings signal</span><strong>+24.8% recovered</strong></div>
            <svg className="royal-auth-chart" viewBox="0 0 520 130" role="img" aria-label="Animated savings signal rising across the last three periods">
              <defs><linearGradient id="royalAuthArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2f80ff" stopOpacity=".35" /><stop offset="1" stopColor="#2f80ff" stopOpacity="0" /></linearGradient></defs>
              <path className="royal-auth-chart-area" d="M8 110 L110 86 L214 96 L320 48 L418 62 L512 18 L512 122 L8 122 Z" />
              <path className="royal-auth-chart-line" d="M8 110 L110 86 L214 96 L320 48 L418 62 L512 18" />
              <circle className="royal-auth-chart-dot" cx="512" cy="18" r="5" />
            </svg>
            <div className="royal-auth-metrics"><div><b>$1,842</b><span>Monthly waste</span></div><div><b>07</b><span>Open findings</span></div><div><b>80%</b><span>Recovered</span></div></div>
          </div>
        </section>

        <section className="royal-auth-card" aria-labelledby="signin-title">
          <div className="royal-auth-card-brand"><span className="royal-logo-mark grid h-10 w-10 place-items-center rounded-xl text-sm font-black">C</span><span className="text-sm font-bold tracking-[0.22em] text-white">CINDR</span></div>
          <p className="royal-auth-card-title">Secure access</p>
          <h2 id="signin-title">Sign in to continue</h2>
          <p className="royal-auth-card-copy">Use your GitHub identity to enter an organization-scoped Cindr workspace.</p>
          {error && <p role="alert" aria-live="assertive" className="royal-auth-error">{error}</p>}
          <button type="button" onClick={continueWithGitHub} className="royal-auth-button focus:outline-none focus:ring-2 focus:ring-blue-400/70">Continue with GitHub</button>
          <p className="royal-auth-foot">Organization access · auditable by default</p>
        </section>
      </div>
    </main>
  );
}
