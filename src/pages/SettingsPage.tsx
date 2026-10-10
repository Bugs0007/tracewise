import { useRef, useState } from 'react';
import { useApp, snapshot, persistNow } from '@/store/store';
import { exportSave, importSave, SaveError, type Settings } from '@/store/save';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/common';
import { playSound } from '@/lib/sound';
import { AccountCard } from '@/account/AccountCard';
import { accountsConfigured, deleteCloudCopy, useAccount } from '@/account/account';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const replaceAll = useApp((s) => s.replaceAll);
  const resetAll = useApp((s) => s.resetAll);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const signedIn = useAccount((a) => a.status === 'signed-in');
  const set = (p: Partial<Settings>) => setSettings(p);

  const doExport = () => {
    const blob = new Blob([exportSave(snapshot())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tracewise-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg({ tone: 'good', text: 'Progress exported.' });
  };

  const doImport = async (f: File) => {
    try {
      const data = importSave(await f.text());
      replaceAll(data);
      persistNow();
      setMsg({ tone: 'good', text: `Imported: ${data.xp} XP, ${Object.keys(data.units).length} units.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof SaveError ? e.message : 'Could not read that file.' });
    }
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <h1>Settings</h1>
      <div className="card col" style={{ gap: 16 }}>
        <Row label="Theme" help="Light, dark, or follow your system.">
          <Seg label="Theme" value={settings.theme} onChange={(v) => set({ theme: v })} options={[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]} />
        </Row>
        <Row label="Motion" help="Reduced motion turns off animations and tweening.">
          <Seg label="Motion" value={settings.motion} onChange={(v) => set({ motion: v })} options={[['system', 'System'], ['full', 'Full'], ['reduced', 'Reduced']]} />
        </Row>
        <Row label="Sound effects" help="Small synthesized blips for feedback. Off by default.">
          <Toggle
            label="Sound effects"
            on={settings.sound}
            onChange={(v) => {
              set({ sound: v });
              if (v) playSound('correct');
            }}
          />
        </Row>
        <Row label="Focus mode" help="Hide navigation and keep only the current task on screen.">
          <Toggle label="Focus mode" on={settings.focus} onChange={(v) => set({ focus: v })} />
        </Row>
        <Row label="Editor font size">
          <div className="row">
            <button className="btn sm icon" onClick={() => set({ fontSize: Math.max(11, settings.fontSize - 1) })} aria-label="Smaller">
              −
            </button>
            <span className="mono" style={{ minWidth: 40, textAlign: 'center' }}>
              {settings.fontSize}px
            </span>
            <button className="btn sm icon" onClick={() => set({ fontSize: Math.min(22, settings.fontSize + 1) })} aria-label="Larger">
              +
            </button>
          </div>
        </Row>
      </div>

      <AccountCard />

      <h2 style={{ marginTop: 28 }}>Your data</h2>
      <div className="card col" style={{ gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          {accountsConfigured
            ? 'Progress, XP, streaks, drafts and settings are saved in this browser. If you sign in, a copy also syncs to your account so it follows you across devices. Export a backup any time.'
            : 'Everything — progress, XP, streaks, drafts, settings — lives only in this browser. Nothing is sent anywhere. Export a backup to move devices or keep it safe.'}
        </p>
        <div className="row">
          <button className="btn" onClick={doExport} data-testid="export">
            <Icon name="download" size={16} /> Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="import">
            <Icon name="upload" size={16} /> Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
          <span className="spacer" />
          <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => setConfirmReset(true)}>
            <Icon name="trash" size={16} /> Reset everything
          </button>
        </div>
        {msg && (
          <div className={`callout ${msg.tone}`} role="status">
            {msg.text}
          </div>
        )}
      </div>

      <h2 style={{ marginTop: 28 }}>About</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Tracewise is open source (MIT) and runs entirely in your browser. Python runs in Pyodide (WebAssembly) inside a Web Worker; JavaScript runs in a separate worker; React exercises run in a sandboxed iframe. Every run has a hard timeout.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Honesty notes: Django and Next.js can't run in a browser, so those exercises use a small teaching library and labeled simulations that model the real concepts. AI-engineering drills use deterministic mock models. There is no AI assistance anywhere in the app.
        </p>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all progress?">
        <p>This wipes XP, streaks, unit progress, drafts and settings from this browser{signedIn ? ' and deletes your cloud copy' : ''}. Export first if you might want it back.</p>
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={() => setConfirmReset(false)}>
            Cancel
          </button>
          <button
            className="btn"
            style={{ background: 'var(--bad)', color: '#fff', borderColor: 'transparent' }}
            onClick={async () => {
              // signed in: remove the cloud copy first, or the next sync would merge it straight back
              if (signedIn) {
                const err = await deleteCloudCopy();
                if (err) {
                  setConfirmReset(false);
                  setMsg({ tone: 'bad', text: err });
                  return;
                }
              }
              resetAll();
              persistNow();
              setConfirmReset(false);
              setMsg({ tone: 'good', text: 'Everything was reset.' });
            }}
          >
            Reset
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {help && (
          <div className="dim" style={{ fontSize: 13 }}>
            {help}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
