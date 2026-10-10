import { useState } from 'react';
import { accountsConfigured, deleteCloudCopy, signInWithGoogle, signOut, syncNow, useAccount } from './account';

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

const STATE_TEXT = { idle: 'Waiting to sync', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline, will sync when you are back', error: 'Sync problem' } as const;

/** Account and sync controls for the Settings page. Renders nothing when accounts are not configured. */
export function AccountCard() {
  const a = useAccount();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!accountsConfigured) return null;

  const run = async (fn: () => Promise<string | null | void>) => {
    setBusy(true);
    setErr(null);
    const r = await fn();
    if (typeof r === 'string') setErr(r);
    setBusy(false);
  };

  return (
    <>
      <h2 style={{ marginTop: 28 }}>Account &amp; sync</h2>
      <div className="card col" style={{ gap: 14 }} data-testid="account-card">
        {a.status === 'loading' && <p className="muted" style={{ margin: 0 }}>Checking sign-in…</p>}

        {a.status === 'signed-out' && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Sign in with Google to keep your progress on every device. It is optional: without it everything works exactly as before, saved in this browser. We store your email, your name if Google shares it, and your progress.
            </p>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => void run(signInWithGoogle)} data-testid="google-signin">
                <GoogleG /> Continue with Google
              </button>
            </div>
          </>
        )}

        {a.status === 'signed-in' && (
          <>
            <div className="row" style={{ gap: 12 }}>
              {a.avatar && <img src={a.avatar} alt="" width={40} height={40} referrerPolicy="no-referrer" style={{ borderRadius: '50%' }} />}
              <div>
                <div style={{ fontWeight: 600 }}>{a.name ?? a.email}</div>
                {a.name && a.email && (
                  <div className="dim" style={{ fontSize: 13 }}>
                    {a.email}
                  </div>
                )}
              </div>
              <span className="spacer" />
              <span className="dim" style={{ fontSize: 13 }} role="status" data-testid="sync-state">
                {STATE_TEXT[a.sync]}
                {a.sync === 'synced' && a.lastSynced ? ` · ${new Date(a.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>
            <div className="row">
              <button className="btn" disabled={busy || a.sync === 'syncing'} onClick={() => void run(syncNow)}>
                Sync now
              </button>
              <button className="btn" disabled={busy} onClick={() => void run(signOut)}>
                Sign out
              </button>
              <span className="spacer" />
              <button className="btn ghost" style={{ color: 'var(--bad)' }} disabled={busy} onClick={() => void run(deleteCloudCopy)}>
                Delete cloud copy
              </button>
            </div>
            <p className="dim" style={{ margin: 0, fontSize: 13 }}>
              Signing out keeps your progress on this device. Progress only moves forward when devices merge, so resetting here also deletes the cloud copy.
            </p>
          </>
        )}

        {(err || a.error) && (
          <div className="callout bad" role="alert">
            {err ?? a.error}
          </div>
        )}
      </div>
    </>
  );
}
