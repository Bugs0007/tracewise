// The home page's live hero: a real run of binary search (recorded by the same
// engine as every lesson) stepping quietly beside its code.
import { useEffect, useMemo, useState } from 'react';
import { loadUnit } from '@/content/loader';
import { defaultInput } from '@/engine/inputs';
import { parseAnchors } from '@/engine/recorder';
import type { Frame, VizDef } from '@/engine/types';
import { CodeView } from '@/player/CodeView';
import { PanelView } from '@/player/panels';
import { useReducedMotion } from '@/lib/motion';
import '@/player/player.css';

export function HeroTrace() {
  const reduced = useReducedMotion();
  const [viz, setViz] = useState<VizDef | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    let alive = true;
    loadUnit('binary-search').then((u) => alive && u && setViz(u.viz));
    return () => {
      alive = false;
    };
  }, []);

  const frames: Frame[] = useMemo(() => (viz ? viz.run(defaultInput(viz.inputs) as never).frames : []), [viz]);
  const code = useMemo(() => (viz ? parseAnchors(viz.code).clean : ''), [viz]);
  const last = frames.length - 1;

  // loop quietly; with reduced motion the hero holds one informative frame instead of animating
  useEffect(() => {
    if (!frames.length) return;
    if (reduced) {
      setI(Math.min(6, last));
      return;
    }
    const t = setTimeout(() => setI((x) => (x >= last ? 0 : x + 1)), i >= last ? 2200 : 1100);
    return () => clearTimeout(t);
  }, [frames.length, i, last, reduced]);

  if (!frames.length) return <div className="hero-trace hero-trace-empty" aria-hidden />;
  const f = frames[Math.min(i, last)];
  return (
    <div className="hero-trace" role="img" aria-label="Binary search narrowing down on the number 23, step by step, beside its Python code">
      <div className="hero-stage">
        <div className="hero-caption">{f.caption}</div>
        {f.panels.map((p, k) => (
          <PanelView key={k} panel={p} />
        ))}
      </div>
      <CodeView code={code} language={viz!.language} line={f.line} title="binary_search.py" />
    </div>
  );
}
