import { useState } from 'react';
import { href } from '@/router';
import { GoogleG } from './AccountCard';
import { signInWithGoogle, useAccount } from './account';

const DISMISS_KEY = 'tracewise:signin-banner-dismissed';

function displayName(name: string | null, email: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first || email?.split('@')[0] || 'Account';
}

/** Top-right account control: a Google sign-in button for guests, the signed-in user's name and avatar otherwise. */
export function AccountChip() {
  const a = useAccount();
  const [busy, setBusy] = useState(false);
  if (a.status === 'unconfigured' || a.status === 'loading') return null;

  if (a.status === 'signed-out') {
    return (
      <button
        className="btn sm"
        disabled={busy}
        data-testid="topbar-signin"
        title="Sign in with Google to keep your progress on every device"
        onClick={async () => {
          setBusy(true);
          await signInWithGoogle();
          setBusy(false);
        }}
      >
        <GoogleG />
        <span>Sign in</span>
      </button>
    );
  }

  const label = displayName(a.name, a.email);
  return (
    <a className="acct-chip" href={href('/settings')} title={a.email ? `Signed in as ${a.email}` : 'Account'} data-testid="topbar-user">
      {a.avatar ? <img src={a.avatar} alt="" width={26} height={26} referrerPolicy="no-referrer" /> : <span className="acct-initial" aria-hidden>{label.slice(0, 1).toUpperCase()}</span>}
      <span className="acct-name">{label}</span>
    </a>
  );
}

/** Home-screen prompt shown to signed-out visitors when accounts are configured. Dismissal lasts for the session. */
export function SignInBanner() {
  const status = useAccount((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (status !== 'signed-out' || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  return (
    <section className="signin-banner" aria-label="Sign in" data-testid="home-signin">
      <div>
        <strong>Keep your progress on every device.</strong>
        <span className="dim"> Sign in with Google and your XP, streak and units follow you. Everything you have done so far is kept.</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signInWithGoogle();
            setBusy(false);
          }}
        >
          <GoogleG /> Continue with Google
        </button>
        <button className="btn ghost sm" onClick={dismiss}>
          Not now
        </button>
      </div>
    </section>
  );
}
