import { useState } from 'react';
import { CATALOG, MODULES } from '@/content/catalog';
import { PROJECTS } from '@/content/capstone';
import { useApp } from '@/store/store';
import { levelInfo } from '@/store/save';
import { Logo } from '@/App';
import { Icon } from '@/ui/Icon';

/** A generic, printable summary of progress. The name is optional and never leaves the browser. */
export default function CertificatePage() {
  const s = useApp();
  const [name, setName] = useState('');
  const { level } = levelInfo(s.xp);
  const capstones = PROJECTS.filter((p) => s.capstone[p.id]?.done);
  const cleared = Object.values(s.units).filter((u) => u.completedAt).length;
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="page">
      <div className="row no-print" style={{ marginBottom: 16 }}>
        <label className="field" style={{ minWidth: 260 }}>
          Name on the certificate (optional, stays on this device)
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        <span className="spacer" />
        <button className="btn primary" onClick={() => window.print()}>
          <Icon name="download" size={15} /> Print / save as PDF
        </button>
      </div>
      <div className="cert" data-testid="certificate">
        <div className="row" style={{ justifyContent: 'center' }}>
          <Logo size={40} />
          <strong style={{ fontSize: 22 }}>Tracewise</strong>
        </div>
        <div className="eyebrow" style={{ marginTop: 18 }}>
          {capstones.length ? 'Certificate of completion' : 'Progress summary'}
        </div>
        <h1 style={{ fontSize: 34, margin: '10px 0' }}>{name || 'Interview prep progress'}</h1>
        <p className="muted">
          {capstones.length
            ? `Built ${capstones.map((p) => `the ${p.title}`).join(' and ')} capstone by hand — backend, frontend and auth — with no AI assistance.`
            : 'Hands-on, visual interview preparation: watched it, predicted it, typed it.'}
        </p>
        <div className="stat-row" style={{ marginTop: 22, textAlign: 'left' }}>
          <div className="card flat">
            <div className="stat-num">{level}</div>
            <div className="stat-label">level · {s.xp} XP</div>
          </div>
          <div className="card flat">
            <div className="stat-num">{cleared}</div>
            <div className="stat-label">units cleared</div>
          </div>
          <div className="card flat">
            <div className="stat-num">{s.streak.best}</div>
            <div className="stat-label">best streak (days)</div>
          </div>
          <div className="card flat">
            <div className="stat-num">{s.interviews.length}</div>
            <div className="stat-label">mock interviews</div>
          </div>
        </div>
        <table style={{ width: '100%', marginTop: 22, borderCollapse: 'collapse', textAlign: 'left' }}>
          <tbody>
            {MODULES.map((m) => {
              const all = CATALOG.filter((c) => c.module === m.id);
              const done = all.filter((c) => s.units[c.id]?.completedAt).length;
              return (
                <tr key={m.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 4px' }}>
                    {m.code} {m.title}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }} className="mono">
                    {done} / {all.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim" style={{ marginTop: 22, fontSize: 13 }}>
          Issued {today}. Generated locally from progress stored in this browser.
        </p>
      </div>
    </div>
  );
}
