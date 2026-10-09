import { useEffect, useState } from 'react';
import { CATALOG, CATALOG_BY_ID, MODULES } from '@/content/catalog';
import { AVAILABLE_UNITS, loadUnit } from '@/content/loader';
import type { Unit } from '@/content/types';
import { href } from '@/router';
import { Player } from '@/player/Player';
import { lazy, Suspense } from 'react';
import './pages.css';

const TracePanel = lazy(() => import('@/features/TracePanel'));
const Architect = lazy(() => import('@/features/Architect').then((m) => ({ default: m.Architect })));

export default function LabPage({ id }: { id?: string }) {
  if (id === 'trace')
    return (
      <div className="page wide">
        <a href={href('/lab')} className="dim">
          ← Visualizer Lab
        </a>
        <h1 style={{ marginTop: 8 }}>Trace your own Python</h1>
        <p className="muted">Write any function, give it arguments, and step through what YOUR code actually does — every line, every local variable, the call stack.</p>
        <Suspense fallback={<div className="dim">Loading…</div>}>
          <TracePanel />
        </Suspense>
      </div>
    );
  if (id === 'architect')
    return (
      <div className="page wide">
        <a href={href('/lab')} className="dim">
          ← Visualizer Lab
        </a>
        <h1 style={{ marginTop: 8 }}>Architecture lab</h1>
        <p className="muted">Pick a scenario, assemble a system from components, wire it up and run traffic through it. Overloaded parts turn red.</p>
        <Suspense fallback={<div className="dim">Loading…</div>}>
          <Architect />
        </Suspense>
      </div>
    );
  if (id) return <LabViz id={id} />;
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 style={{ margin: 0 }}>Visualizer Lab</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Every visualizer, outside the lesson flow. Change inputs, scrub the timeline, quiz yourself.
          </p>
        </div>
        <a className="btn" href={href('/lab/architect')} data-testid="architect-link">
          Architecture lab
        </a>
        <a className="btn primary" href={href('/lab/trace')} data-testid="trace-link">
          Trace your own code
        </a>
      </div>
      {MODULES.map((m) => {
        const items = CATALOG.filter((c) => c.module === m.id && AVAILABLE_UNITS.has(c.id));
        if (!items.length) return null;
        return (
          <section key={m.id} style={{ marginBottom: 22 }}>
            <h3>{m.title}</h3>
            <div className="lab-list">
              {items.map((c) => (
                <a key={c.id} className="lab-item" href={href(`/lab/${c.id}`)}>
                  {c.title}
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LabViz({ id }: { id: string }) {
  const [unit, setUnit] = useState<Unit | null | undefined>(undefined);
  useEffect(() => {
    loadUnit(id).then(setUnit);
  }, [id]);
  const meta = CATALOG_BY_ID[id];
  if (unit === undefined) return <div className="page dim">Loading…</div>;
  if (!unit || !meta) return <div className="page">Not available yet.</div>;
  return (
    <div className="page wide">
      <div className="row">
        <a href={href('/lab')} className="dim">
          ← Visualizer Lab
        </a>
        <span className="spacer" />
        <a className="btn sm" href={href(`/unit/${id}/predict`)}>
          Open the full unit
        </a>
      </div>
      <h1 style={{ margin: '8px 0 14px' }}>{meta.title}</h1>
      <Player key={unit.id} viz={unit.viz} initialInput={unit.vizInput} />
    </div>
  );
}
