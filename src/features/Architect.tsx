// Architecture builder drill: drag components onto a canvas, wire them, then
// run the scenario's traffic through the design and see what breaks.
import { useMemo, useRef, useState } from 'react';
import { KINDS, SCENARIOS, simulate, type AEdge, type ANode, type Kind, type SimResult } from './architectModel';
import { Icon } from '@/ui/Icon';
import { useApp } from '@/store/store';
import { useReducedMotion } from '@/lib/motion';

const W = 860;
const H = 420;
const PALETTE: Kind[] = ['client', 'cdn', 'lb', 'app', 'cache', 'db', 'replica', 'queue', 'worker'];

let seq = 0;
const nid = (k: Kind) => `${k}-${++seq}`;

export function Architect({ onPass }: { onPass?: (scenarioId: string) => void }) {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [nodes, setNodes] = useState<ANode[]>([{ id: 'client-0', kind: 'client', x: 70, y: H / 2 }]);
  const [edges, setEdges] = useState<AEdge[]>([]);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const awardXp = useApp((s) => s.awardXp);
  const reduced = useReducedMotion();
  const passedOnce = useRef(new Set<string>());

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const toSvg = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const add = (k: Kind) => {
    const count = nodes.filter((n) => n.kind === k).length;
    const col = PALETTE.indexOf(k);
    setNodes((ns) => [...ns, { id: nid(k), kind: k, x: Math.min(W - 60, 90 + col * 88), y: 60 + ((count * 70) % (H - 100)) }]);
    setSim(null);
  };

  const clickNode = (id: string) => {
    setSelected(id);
    if (!linkFrom) return;
    if (linkFrom !== id && !edges.some((e) => e.from === linkFrom && e.to === id)) setEdges((es) => [...es, { from: linkFrom, to: id }]);
    setLinkFrom(null);
    setSim(null);
  };

  const remove = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setSelected(null);
    setSim(null);
  };

  const run = () => {
    const r = simulate(nodes, edges, scenario);
    setSim(r);
    if (r.passed && !passedOnce.current.has(scenario.id)) {
      passedOnce.current.add(scenario.id);
      awardXp(30);
      onPass?.(scenario.id);
    }
  };

  const loadExample = () => {
    // a reasonable starting design for the current scenario
    const ns: ANode[] = [
      { id: 'c', kind: 'client', x: 60, y: 210 },
      { id: 'cdn', kind: 'cdn', x: 170, y: 210 },
      { id: 'lb', kind: 'lb', x: 290, y: 210 },
      { id: 'a1', kind: 'app', x: 420, y: 140 },
      { id: 'a2', kind: 'app', x: 420, y: 280 },
      { id: 'ca', kind: 'cache', x: 560, y: 90 },
      { id: 'db', kind: 'db', x: 680, y: 210 },
    ];
    const es: AEdge[] = [
      { from: 'c', to: 'cdn' },
      { from: 'cdn', to: 'lb' },
      { from: 'lb', to: 'a1' },
      { from: 'lb', to: 'a2' },
      { from: 'a1', to: 'ca' },
      { from: 'a2', to: 'ca' },
      { from: 'a1', to: 'db' },
      { from: 'a2', to: 'db' },
    ];
    setNodes(ns);
    setEdges(es);
    setSim(null);
  };

  const tone = (id: string) => {
    if (!sim) return 'default';
    const u = sim.util[id] ?? 0;
    return u > 1 ? 'error' : u > 0.8 ? 'active' : u > 0 ? 'done' : 'default';
  };

  return (
    <div className="col" style={{ gap: 12 }} data-testid="architect">
      <div className="row">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={`btn sm ${s.id === scenario.id ? 'primary' : ''}`}
            onClick={() => {
              setScenario(s);
              setSim(null);
            }}
          >
            {s.title}
          </button>
        ))}
      </div>
      <div className="callout info">
        <strong>{scenario.title}:</strong> {scenario.brief}
      </div>
      <div className="row" role="toolbar" aria-label="Components">
        {PALETTE.map((k) => (
          <button key={k} className="btn sm" onClick={() => add(k)} title={KINDS[k].help} data-testid={`add-${k}`}>
            + {KINDS[k].label}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn sm ghost" onClick={loadExample}>
          Starter design
        </button>
        <button
          className="btn sm ghost"
          onClick={() => {
            setNodes([{ id: 'client-0', kind: 'client', x: 70, y: H / 2 }]);
            setEdges([]);
            setSim(null);
          }}
        >
          Clear
        </button>
      </div>
      <div className="row dim" style={{ fontSize: 13 }}>
        Drag boxes to move them. Select a box, press <strong>Connect</strong>, then click the box it sends traffic to.
        {selected && byId.get(selected) && (
          <>
            <span className="spacer" />
            <span className="chip accent">{KINDS[byId.get(selected)!.kind].label}</span>
            <button className={`btn sm ${linkFrom ? 'primary' : ''}`} onClick={() => setLinkFrom(linkFrom ? null : selected)} data-testid="connect">
              {linkFrom ? 'Click the target…' : 'Connect →'}
            </button>
            <button className="btn sm ghost" onClick={() => remove(selected)} aria-label="Remove component">
              <Icon name="trash" size={14} />
            </button>
          </>
        )}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, touchAction: 'none' }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = toSvg(e);
          const { id, dx, dy } = drag.current;
          setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x: Math.max(40, Math.min(W - 40, p.x - dx)), y: Math.max(24, Math.min(H - 24, p.y - dy)) } : n)));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
        role="application"
        aria-label="Architecture canvas"
      >
        <defs>
          <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--text-3)' }} />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const sx = a.x + (dx / len) * 46;
          const sy = a.y + (dy / len) * 22;
          const tx = b.x - (dx / len) * 50;
          const ty = b.y - (dy / len) * 24;
          const load = sim?.edgeLoad[`${e.from}>${e.to}`] ?? 0;
          const id = `arch-e-${i}`;
          return (
            <g key={i}>
              <path id={id} d={`M${sx},${sy} L${tx},${ty}`} stroke="var(--line-2)" strokeWidth={load ? 3 : 2} fill="none" markerEnd="url(#arch-arrow)" />
              {load > 0 && (
                <>
                  <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 6} textAnchor="middle" style={{ font: '700 10px var(--font-mono)', fill: 'var(--text-2)' }}>
                    {Math.round(load)}/s
                  </text>
                  {!reduced && (
                    <circle r={4} style={{ fill: 'var(--accent-2)' }}>
                      <animateMotion dur={`${Math.max(0.4, 2 - Math.log10(load + 1) / 2)}s`} repeatCount="indefinite">
                        <mpath href={`#${id}`} />
                      </animateMotion>
                    </circle>
                  )}
                </>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const t = tone(n.id);
          const u = sim?.util[n.id];
          return (
            <g
              key={n.id}
              className="g-node"
              data-tone={t}
              transform={`translate(${n.x},${n.y})`}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => {
                const p = toSvg(e);
                drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
                clickNode(n.id);
              }}
              tabIndex={0}
              role="button"
              aria-label={`${KINDS[n.kind].label}${u !== undefined ? `, ${Math.round(u * 100)}% utilised` : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') clickNode(n.id);
                if (e.key === 'Delete') remove(n.id);
              }}
              data-testid={`node-${n.kind}`}
            >
              <rect x={-44} y={-20} width={88} height={40} rx={n.kind === 'db' || n.kind === 'replica' ? 14 : 8} style={{ strokeWidth: selected === n.id ? 3 : 1.5, stroke: selected === n.id ? 'var(--accent)' : undefined }} />
              <text y={u !== undefined && n.kind !== 'client' ? -5 : 0} style={{ fontSize: 11 }}>
                {KINDS[n.kind].label}
              </text>
              {u !== undefined && n.kind !== 'client' && (
                <text className="sub" y={9}>
                  {Math.round(u * 100)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="row">
        <button className="btn primary" onClick={run} data-testid="run-traffic">
          <Icon name="bolt" size={15} /> Run traffic
        </button>
        {sim && (
          <span className={`chip ${sim.passed ? 'good' : 'bad'}`} data-testid="arch-verdict">
            {sim.passed ? `Holds up — p99 ≈ ${sim.p99} ms` : 'Breaks'}
          </span>
        )}
      </div>
      {sim && sim.problems.length > 0 && (
        <div className="callout bad fade-up">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {sim.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
