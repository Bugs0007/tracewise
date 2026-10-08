// Renderers for every panel type a frame can contain. Pure functions of the
// panel data; small tweening/FLIP helpers make transitions feel physical.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  ArrayPanel,
  BucketsPanel,
  ChartPanel,
  GraphNode,
  GraphPanel,
  GridPanel,
  KVPanel,
  ListPanel,
  LogPanel,
  NotePanel,
  Panel,
  SequencePanel,
  TimelinePanel,
  Tone,
} from '@/engine/types';
import { useReducedMotion } from '@/lib/motion';

const TONES: Tone[] = ['default', 'active', 'compare', 'swap', 'visited', 'frontier', 'done', 'found', 'error', 'muted', 'path', 'new'];
const toneVar = (t: Tone | undefined) => `var(--t-${t ?? 'default'})`;

export function PanelView({ panel }: { panel: Panel }) {
  switch (panel.type) {
    case 'array':
      return <ArrayView p={panel} />;
    case 'grid':
      return <GridView p={panel} />;
    case 'graph':
      return <GraphView p={panel} />;
    case 'list':
      return <ListView p={panel} />;
    case 'buckets':
      return <BucketsView p={panel} />;
    case 'sequence':
      return <SequenceView p={panel} />;
    case 'timeline':
      return <TimelineView p={panel} />;
    case 'chart':
      return <ChartView p={panel} />;
    case 'log':
      return <LogView p={panel} />;
    case 'kv':
      return <KVView p={panel} />;
    case 'note':
      return <NoteView p={panel} />;
  }
}

export function isWide(p: Panel): boolean {
  return p.type === 'graph' || p.type === 'sequence' || p.type === 'timeline' || p.type === 'chart' || (p.type === 'array' && (p.values.length > 8 || !!p.bars)) || p.type === 'note';
}

function Title({ t }: { t?: string }) {
  return t ? <div className="pnl-title">{t}</div> : null;
}

// ─── Array ──────────────────────────────────────────────

function ArrayView({ p }: { p: ArrayPanel }) {
  const reduced = useReducedMotion();
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const prevLeft = useRef(new Map<string, number>());
  const keys = p.values.map((_, i) => (p.ids ? String(p.ids[i]) : `i${i}`));
  const max = Math.max(1, ...p.values.map((v) => (typeof v === 'number' ? Math.abs(v) : 0)));

  // FLIP: when cells carry identities, animate them from their old slot to the new one.
  useLayoutEffect(() => {
    if (!p.ids) return;
    const next = new Map<string, number>();
    for (const [k, el] of cellRefs.current) {
      if (!el.isConnected) continue;
      const left = el.offsetLeft;
      next.set(k, left);
      const before = prevLeft.current.get(k);
      if (!reduced && before !== undefined && before !== left) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${before - left}px)`;
        void el.offsetWidth;
        el.style.transition = 'transform var(--dur) var(--ease)';
        el.style.transform = '';
      }
    }
    prevLeft.current = next;
  });

  const ptrsAt = new Map<number, string[]>();
  for (const [name, idx] of Object.entries(p.pointers ?? {})) {
    if (!ptrsAt.has(idx)) ptrsAt.set(idx, []);
    ptrsAt.get(idx)!.push(name);
  }
  // measure the real cell boxes so the range bracket fits any value width
  const [rangeBox, setRangeBox] = useState<{ left: number; width: number } | null>(null);
  const rf = p.range?.from;
  const rt = p.range?.to;
  useLayoutEffect(() => {
    if (rf === undefined || rt === undefined || rf > rt || rf < 0) return setRangeBox(null);
    const a = cellRefs.current.get(keys[rf]);
    const b = cellRefs.current.get(keys[Math.min(rt, keys.length - 1)]);
    if (!a || !b) return setRangeBox(null);
    const box = { left: a.offsetLeft, width: b.offsetLeft + b.offsetWidth - a.offsetLeft };
    setRangeBox((prev) => (prev && prev.left === box.left && prev.width === box.width ? prev : box));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rf, rt, p.values, p.ids]);
  const offEnd = [...ptrsAt.keys()].filter((i) => i < 0 || i >= p.values.length);

  return (
    <div>
      <Title t={p.title} />
      <div className={`arr${p.bars ? ' bars' : ''}`} role="list" aria-label={p.title ?? 'array'}>
        {p.range && rangeBox && !p.bars && (
          <div className="arr-range" style={{ left: rangeBox.left, width: rangeBox.width, borderColor: p.range.tone ? toneVar(p.range.tone) : undefined }}>
            {p.range.label && <span>{p.range.label}</span>}
          </div>
        )}
        {p.values.map((v, i) => (
          <div
            key={keys[i]}
            ref={(el) => {
              if (el) cellRefs.current.set(keys[i], el);
              else cellRefs.current.delete(keys[i]);
            }}
            className="arr-cell"
            data-tone={p.tones?.[i] ?? 'default'}
            role="listitem"
            aria-label={`index ${i}: ${v}${ptrsAt.get(i) ? ' (' + ptrsAt.get(i)!.join(', ') + ')' : ''}`}
          >
            <div className="arr-box" style={p.bars ? ({ ['--h' as string]: `${Math.max(16, (Math.abs(Number(v)) / max) * 170)}px` } as React.CSSProperties) : undefined}>
              {v === null ? '·' : String(v)}
            </div>
            {!p.hideIndex && <div className="arr-idx">{p.indexLabels?.[i] ?? i}</div>}
            {ptrsAt.get(i) && (
              <div className="arr-ptrs">
                {ptrsAt.get(i)!.map((n) => (
                  <span key={n} className="ptr">
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {offEnd.length > 0 && (
          <div className="arr-cell" data-tone="muted" aria-hidden>
            <div className="arr-box" style={{ opacity: 0.4, minWidth: 30 }}>
              ∅
            </div>
            <div className="arr-ptrs">
              {offEnd.flatMap((i) => ptrsAt.get(i)!).map((n) => (
                <span key={n} className="ptr">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────

function GridView({ p }: { p: GridPanel }) {
  const uid = useId().replace(/:/g, '');
  const rows = p.cells.length;
  const cols = rows ? p.cells[0].length : 0;
  const cw = p.compact ? 22 : 42;
  const ch = p.compact ? 22 : 36;
  const gap = 3;
  const lw = p.rowLabels ? 28 : 0;
  const lh = p.colLabels ? 20 : 0;
  const heatMax = p.heat ? Math.max(1e-9, ...p.cells.flat().map((v) => (typeof v === 'number' ? Math.abs(v) : 0))) : 1;
  const center = (r: number, c: number) => ({ x: lw + (p.rowLabels ? gap : 0) + c * (cw + gap) + cw / 2, y: lh + (p.colLabels ? gap : 0) + r * (ch + gap) + ch / 2 });
  const template = `${p.rowLabels ? `${lw}px ` : ''}repeat(${cols}, ${cw}px)`;
  return (
    <div>
      <Title t={p.title} />
      <div className={`gridp${p.compact ? ' compact' : ''}`} style={{ gridTemplateColumns: template }} role="table" aria-label={p.title ?? 'grid'}>
        {p.colLabels && (
          <>
            {p.rowLabels && <div className="g-head" style={{ height: lh }} />}
            {p.colLabels.map((l, c) => (
              <div key={`ch${c}`} className="g-head" style={{ height: lh }}>
                {l}
              </div>
            ))}
          </>
        )}
        {p.cells.map((row, r) => (
          <Row key={r}>
            {p.rowLabels && <div className="g-head">{p.rowLabels[r]}</div>}
            {row.map((v, c) => {
              const tone = p.tones?.[`${r},${c}`];
              const heatStyle =
                p.heat && !tone && typeof v === 'number'
                  ? { background: `color-mix(in srgb, var(--accent) ${Math.round((Math.abs(v) / heatMax) * 85)}%, var(--t-default))`, color: Math.abs(v) / heatMax > 0.5 ? '#fff' : undefined }
                  : undefined;
              return (
                <div key={c} className="g-cell" data-tone={tone ?? 'default'} style={heatStyle} role="cell" aria-label={`row ${r} col ${c}: ${v ?? ''}`}>
                  {v === null ? '' : String(v)}
                </div>
              );
            })}
          </Row>
        ))}
        {!!p.arrows?.length && (
          <svg aria-hidden width="100%" height="100%">
            <defs>
              <marker id={`ga-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--t-active)' }} />
              </marker>
            </defs>
            {p.arrows.map((a, i) => {
              const s = center(...a.from);
              const e = center(...a.to);
              const dx = e.x - s.x;
              const dy = e.y - s.y;
              const len = Math.hypot(dx, dy) || 1;
              const sh = 12 / len;
              return <line key={i} x1={s.x + dx * sh} y1={s.y + dy * sh} x2={e.x - dx * sh} y2={e.y - dy * sh} stroke={toneVar(a.tone ?? 'active')} strokeWidth={2.5} markerEnd={`url(#ga-${uid})`} opacity={0.9} />;
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ─── Graph ──────────────────────────────────────────────

const ease = (k: number) => 1 - Math.pow(1 - k, 3);

function useTweened(nodes: GraphNode[], dur: number) {
  const target = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }])), [nodes]);
  const cur = useRef(target);
  const [pos, setPos] = useState(target);
  useEffect(() => {
    const from = cur.current;
    const moved = Object.entries(target).some(([id, t]) => from[id] && (from[id].x !== t.x || from[id].y !== t.y));
    if (!moved || dur <= 0) {
      cur.current = target;
      setPos(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = ease(k);
      const next: typeof target = {};
      for (const [id, to] of Object.entries(target)) {
        const f = from[id] ?? to;
        next[id] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e };
      }
      cur.current = next;
      setPos(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return pos;
}

function nodeSize(n: GraphNode): { w: number; h: number; r: number } {
  const shape = n.shape ?? 'circle';
  if (shape === 'circle') {
    const r = n.w ? n.w / 2 : Math.max(20, n.label.length * 4.4 + 8);
    return { w: r * 2, h: r * 2, r };
  }
  const w = n.w ?? Math.max(56, n.label.length * 8 + 22);
  const h = n.h ?? (shape === 'cylinder' ? 46 : 34);
  return { w, h, r: 0 };
}

/** Point on the boundary of node `n` (centred at c) in direction (dx, dy). */
function boundary(n: GraphNode, c: { x: number; y: number }, dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const s = nodeSize(n);
  if ((n.shape ?? 'circle') === 'circle') return { x: c.x + ux * (s.r + 2), y: c.y + uy * (s.r + 2) };
  const tx = ux !== 0 ? s.w / 2 / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? s.h / 2 / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty) + 2;
  return { x: c.x + ux * t, y: c.y + uy * t };
}

function GraphView({ p }: { p: GraphPanel }) {
  const uid = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const pos = useTweened(p.nodes, reduced ? 0 : 320);
  const byId = useMemo(() => new Map(p.nodes.map((n) => [n.id, n])), [p.nodes]);
  const pad = 34;
  return (
    <div className="graph">
      <Title t={p.title} />
      <svg viewBox={`${-pad} ${-pad} ${p.width + pad * 2} ${p.height + pad * 2}`} role="img" aria-label={`${p.title ?? 'graph'}: ${p.nodes.length} nodes, ${p.edges.length} edges`} style={{ maxWidth: Math.max(320, p.width + pad * 2) * 1.25 }}>
        <defs>
          {TONES.map((t) => (
            <marker key={t} id={`ah-${uid}-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: t === 'default' ? 'var(--line-2)' : toneVar(t) }} />
            </marker>
          ))}
        </defs>
        {p.axes && (
          <g aria-hidden>
            <line x1={0} y1={p.height / 2} x2={p.width} y2={p.height / 2} className="svg-line" strokeDasharray="3 4" />
            <line x1={p.width / 2} y1={0} x2={p.width / 2} y2={p.height} className="svg-line" strokeDasharray="3 4" />
          </g>
        )}
        {p.edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          const pa = pos[e.from];
          const pb = pos[e.to];
          if (!a || !b || !pa || !pb) return null;
          const directed = e.directed ?? p.directed;
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const len = Math.hypot(dx, dy) || 1;
          const curve = e.curve ?? 0;
          const mx = (pa.x + pb.x) / 2 - (dy / len) * curve;
          const my = (pa.y + pb.y) / 2 + (dx / len) * curve;
          const s = curve ? boundary(a, pa, mx - pa.x, my - pa.y) : boundary(a, pa, dx, dy);
          const t = curve ? boundary(b, pb, mx - pb.x, my - pb.y) : boundary(b, pb, -dx, -dy);
          const d = curve ? `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}` : `M${s.x},${s.y} L${t.x},${t.y}`;
          const lx = curve ? (s.x + 2 * mx + t.x) / 4 : (s.x + t.x) / 2;
          const ly = curve ? (s.y + 2 * my + t.y) / 4 : (s.y + t.y) / 2;
          const tone = e.tone ?? 'default';
          return (
            <g key={`${e.from}-${e.to}-${i}`} className={`g-edge${e.dashed ? ' dashed' : ''}`} data-tone={tone}>
              <path id={`ep-${uid}-${i}`} d={d} markerEnd={directed ? `url(#ah-${uid}-${tone})` : undefined} />
              {e.label && (
                <text x={lx} y={ly - (curve ? 0 : 9)}>
                  {e.label}
                </text>
              )}
              {e.flow && !reduced && (
                <circle r={5} className="flow-dot">
                  <animateMotion dur="1.1s" repeatCount="indefinite">
                    <mpath href={`#ep-${uid}-${i}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}
        {p.nodes.map((n) => {
          const c = pos[n.id] ?? { x: n.x, y: n.y };
          const s = nodeSize(n);
          const shape = n.shape ?? 'circle';
          return (
            <g key={n.id} className="g-node" data-tone={n.tone ?? 'default'} transform={`translate(${c.x},${c.y})`}>
              {shape === 'circle' && <circle r={s.r} />}
              {(shape === 'rect' || shape === 'actor') && <rect x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={shape === 'actor' ? 12 : 8} />}
              {shape === 'pill' && <rect x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={s.h / 2} />}
              {shape === 'cylinder' && (
                <path
                  className="shape"
                  d={`M${-s.w / 2},${-s.h / 2 + 6} a${s.w / 2},6 0 0,0 ${s.w},0 a${s.w / 2},6 0 0,0 ${-s.w},0 v${s.h - 12} a${s.w / 2},6 0 0,0 ${s.w},0 v${-(s.h - 12)}`}
                />
              )}
              <text y={n.sub ? -6 : 0}>{n.label}</text>
              {n.sub && (
                <text className="sub" y={9}>
                  {n.sub}
                </text>
              )}
              {n.badge && (
                <text className="badge" y={s.h / 2 + 13}>
                  {n.badge}
                </text>
              )}
              {n.tags?.length ? (
                <text className="tag" y={-s.h / 2 - 9}>
                  {n.tags.join(' · ')}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── List (stack / queue) ──────────────────────────────

function ListView({ p }: { p: ListPanel }) {
  return (
    <div>
      <Title t={p.title} />
      <div className="row" style={{ gap: 6, alignItems: p.orientation === 'vertical' ? 'flex-start' : 'center', flexWrap: 'nowrap' }}>
        {p.orientation === 'horizontal' && p.startLabel && <span className="lst-end">{p.startLabel}</span>}
        <div className={`lst ${p.orientation}`} role="list" aria-label={p.title ?? 'list'}>
          {p.items.length === 0 && <span className="lst-empty">{p.emptyText ?? 'empty'}</span>}
          {p.items.map((it, i) => (
            <div key={it.id ?? `${i}:${it.label}`} className="lst-item" data-tone={it.tone ?? 'default'} role="listitem">
              {it.label}
              {it.sub && <small>{it.sub}</small>}
            </div>
          ))}
        </div>
        {p.endLabel && <span className="lst-end">{p.orientation === 'vertical' ? `↑ ${p.endLabel}` : `${p.endLabel} →`}</span>}
      </div>
    </div>
  );
}

// ─── Buckets ──────────────────────────────────────────

function BucketsView({ p }: { p: BucketsPanel }) {
  return (
    <div>
      <Title t={p.title} />
      <div className="bkts">
        {p.buckets.map((chain, i) => (
          <div key={i} className="bkt" data-tone={p.tones?.[i] ?? 'default'}>
            <div className="bkt-idx" data-tone={p.tones?.[i] ?? 'default'}>
              {i}
            </div>
            {chain.length === 0 && <span className="dim mono" style={{ fontSize: 12 }}>—</span>}
            {chain.map((it, j) => (
              <span key={it.id ?? `${j}:${it.label}`} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <span className="bkt-arrow">→</span>
                <span className="bkt-item" data-tone={it.tone ?? 'default'}>
                  {it.label}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sequence diagram ─────────────────────────────────

function SequenceView({ p }: { p: SequencePanel }) {
  const uid = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const colW = 150;
  const W = Math.max(420, p.actors.length * colW);
  const xOf = (a: string) => (p.actors.indexOf(a) + 0.5) * (W / p.actors.length);
  const rowH = 38;
  const H = 70 + Math.max(1, p.messages.length) * rowH + 10;
  return (
    <div className="seq">
      <Title t={p.title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sequence: ${p.messages.map((m) => `${m.from} to ${m.to}: ${m.label}`).join('; ')}`} style={{ maxWidth: W * 1.2 }}>
        <defs>
          {TONES.map((t) => (
            <marker key={t} id={`sq-${uid}-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: t === 'default' ? 'var(--text-2)' : toneVar(t) }} />
            </marker>
          ))}
        </defs>
        {p.actors.map((a) => (
          <g key={a}>
            <line x1={xOf(a)} y1={44} x2={xOf(a)} y2={H} className="svg-line" strokeDasharray="4 5" />
            <rect x={xOf(a) - 62} y={8} width={124} height={34} rx={9} style={{ fill: 'var(--panel-3)', stroke: 'var(--line-2)' }} />
            <text x={xOf(a)} y={25} className="svg-text" textAnchor="middle" dominantBaseline="central">
              {a}
            </text>
          </g>
        ))}
        {p.messages.map((m, i) => {
          const y = 66 + i * rowH;
          const x1 = xOf(m.from);
          const x2 = xOf(m.to);
          const active = i === p.active;
          const tone = m.tone ?? (active ? 'active' : 'default');
          const stroke = tone === 'default' ? 'var(--text-2)' : toneVar(tone);
          const self = m.from === m.to;
          const d = self ? `M${x1},${y - 8} h36 v16 h-34` : `M${x1},${y} L${x2 + (x2 > x1 ? -3 : 3)},${y}`;
          return (
            <g key={i} opacity={p.active !== undefined && i > p.active ? 0.25 : 1} className={active ? 'fade-up' : undefined}>
              <path id={`sm-${uid}-${i}`} d={d} fill="none" stroke={stroke} strokeWidth={active ? 2.5 : 1.6} strokeDasharray={m.dashed ? '6 4' : undefined} markerEnd={`url(#sq-${uid}-${tone})`} />
              <text x={self ? x1 + 42 : (x1 + x2) / 2} y={y - 9} className="svg-text" textAnchor={self ? 'start' : 'middle'} style={{ fontSize: 11.5, fill: active ? 'var(--text)' : 'var(--text-2)' }}>
                {m.label}
              </text>
              {active && !reduced && !self && (
                <circle r={4.5} style={{ fill: stroke }}>
                  <animateMotion dur="0.9s" repeatCount="indefinite">
                    <mpath href={`#sm-${uid}-${i}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────

function TimelineView({ p }: { p: TimelinePanel }) {
  const labelW = 120;
  const plotW = 520;
  const laneH = 40;
  const W = labelW + plotW + 20;
  const H = 30 + p.lanes.length * laneH + 10;
  const x = (t: number) => labelW + (Math.max(0, Math.min(t, p.tMax)) / p.tMax) * plotW;
  const ticks = Array.from({ length: 6 }, (_, i) => (p.tMax * i) / 5);
  return (
    <div className="tl">
      <Title t={p.title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.title ?? 'timeline'} style={{ maxWidth: W * 1.25 }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={18} x2={x(t)} y2={H} className="svg-line" strokeDasharray="2 5" opacity={0.6} />
            <text x={x(t)} y={10} className="svg-dim" textAnchor="middle">
              {Math.round(t * 10) / 10}
              {p.unit ?? ''}
            </text>
          </g>
        ))}
        {p.lanes.map((lane, li) => {
          const y = 30 + li * laneH;
          return (
            <g key={li}>
              <text x={labelW - 10} y={y + laneH / 2 - 4} className="svg-text" textAnchor="end" dominantBaseline="central">
                {lane.label}
              </text>
              <line x1={labelW} y1={y + laneH - 6} x2={labelW + plotW} y2={y + laneH - 6} className="svg-line" opacity={0.5} />
              {lane.events.map((ev, ei) =>
                ev.dur ? (
                  <g key={ei} className="fade-up">
                    <rect x={x(ev.t)} y={y + 4} width={Math.max(4, x(ev.t + ev.dur) - x(ev.t))} height={laneH - 14} rx={6} style={{ fill: toneVar(ev.tone ?? 'compare') }} opacity={0.9} />
                    <text x={x(ev.t) + 6} y={y + laneH / 2 - 3} dominantBaseline="central" style={{ fill: 'var(--t-ink)', font: '700 11px var(--font-ui)' }}>
                      {ev.label}
                    </text>
                  </g>
                ) : (
                  <g key={ei} className="fade-up">
                    <circle cx={x(ev.t)} cy={y + laneH / 2 - 3} r={7} style={{ fill: toneVar(ev.tone ?? 'active') }} />
                    <text x={x(ev.t)} y={y + 2} className="svg-dim" textAnchor="middle" style={{ fontSize: 10 }}>
                      {ev.label}
                    </text>
                  </g>
                ),
              )}
            </g>
          );
        })}
        {p.now !== undefined && <line x1={x(p.now)} y1={16} x2={x(p.now)} y2={H} style={{ stroke: 'var(--t-active)' }} strokeWidth={2} />}
      </svg>
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────

const SERIES_TONES: Tone[] = ['compare', 'active', 'swap', 'done', 'frontier', 'path', 'new'];

function ChartView({ p }: { p: ChartPanel }) {
  const W = 560;
  const H = 280;
  const m = { l: 52, r: 16, t: 14, b: 40 };
  const pts = p.series.flatMap((s) => s.points);
  const xMin = Math.min(...pts.map((q) => q[0]), 0);
  const xMax = Math.max(...pts.map((q) => q[0]), 1);
  const yMax = Math.max(...pts.map((q) => q[1]), 1);
  const X = (v: number) => m.l + ((v - xMin) / (xMax - xMin || 1)) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - (Math.min(v, yMax) / yMax) * (H - m.t - m.b);
  const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n * 10) / 10}`);
  return (
    <div className="chart">
      <Title t={p.title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.title ?? 'chart'}: ${p.series.map((s) => s.label).join(', ')}`} style={{ maxWidth: W * 1.2 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={m.l} x2={W - m.r} y1={Y(yMax * f)} y2={Y(yMax * f)} className="svg-line" opacity={0.35} />
            <text x={m.l - 6} y={Y(yMax * f)} className="svg-dim" textAnchor="end" dominantBaseline="central">
              {fmtN(yMax * f)}
            </text>
          </g>
        ))}
        <text x={(W + m.l) / 2} y={H - 6} className="svg-dim" textAnchor="middle">
          {p.xLabel}
        </text>
        <text x={12} y={(H - m.b) / 2} className="svg-dim" textAnchor="middle" transform={`rotate(-90 12 ${(H - m.b) / 2})`}>
          {p.yLabel}
        </text>
        {[xMin, (xMin + xMax) / 2, xMax].map((v) => (
          <text key={v} x={X(v)} y={H - m.b + 16} className="svg-dim" textAnchor="middle">
            {fmtN(v)}
          </text>
        ))}
        {p.kind === 'bar'
          ? p.series.map((s, si) =>
              s.points.map(([xv, yv], i) => {
                const bw = Math.max(4, (W - m.l - m.r) / (s.points.length * p.series.length + 2) - 4);
                return <rect key={`${si}-${i}`} x={X(xv) - (bw * p.series.length) / 2 + si * bw} y={Y(yv)} width={bw - 2} height={H - m.b - Y(yv)} rx={3} style={{ fill: toneVar(s.tone ?? SERIES_TONES[si % SERIES_TONES.length]), transition: 'all var(--dur) var(--ease)' }} />;
              }),
            )
          : p.series.map((s, si) => (
              <path
                key={si}
                d={s.points.map(([xv, yv], i) => `${i ? 'L' : 'M'}${X(xv)},${Y(yv)}`).join(' ')}
                fill="none"
                strokeWidth={2.6}
                strokeLinejoin="round"
                style={{ stroke: toneVar(s.tone ?? SERIES_TONES[si % SERIES_TONES.length]) }}
              />
            ))}
        {p.marker !== undefined && <line x1={X(p.marker)} x2={X(p.marker)} y1={m.t} y2={H - m.b} style={{ stroke: 'var(--text-2)' }} strokeDasharray="4 4" />}
      </svg>
      <div className="row" style={{ gap: 12, fontSize: 12 }}>
        {p.series.map((s, si) => (
          <span key={s.label} className="row" style={{ gap: 5 }}>
            <i style={{ width: 12, height: 4, borderRadius: 2, background: toneVar(s.tone ?? SERIES_TONES[si % SERIES_TONES.length]), display: 'inline-block' }} />
            <span className="mono">{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Log / KV / Note ──────────────────────────────────

function LogView({ p }: { p: LogPanel }) {
  return (
    <div>
      <Title t={p.title} />
      <div className="logp" role="log" aria-label={p.title ?? 'output'}>
        {p.lines.length === 0 && <span className="dim">(no output yet)</span>}
        {p.lines.map((l, i) => (
          <div key={i} data-tone={l.tone ?? 'default'}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function KVView({ p }: { p: KVPanel }) {
  return (
    <div>
      <Title t={p.title} />
      <div className="kvp">
        {p.entries.length === 0 && <span className="dim">empty</span>}
        {p.entries.map((e) => (
          <Fragment2 key={e.k}>
            <span className="k">{e.k}</span>
            <span className="v" data-tone={e.tone ?? 'default'}>
              {e.v === null ? 'null' : String(e.v)}
            </span>
          </Fragment2>
        ))}
      </div>
    </div>
  );
}

function Fragment2({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function NoteView({ p }: { p: NotePanel }) {
  return (
    <div className="notep" data-tone={p.tone ?? 'default'}>
      {p.text}
    </div>
  );
}
