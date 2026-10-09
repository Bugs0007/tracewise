// Event kinds for the timeline scrubber: one tick per frame, coloured by what
// *newly happened* in that frame (compared with the previous one), using the
// four ink meanings: cobalt visit, tomato compare, mustard queued, mint done.
import type { Frame, Panel, Tone } from '@/engine/types';

export type TickKind = 'visit' | 'compare' | 'queue' | 'done' | 'none';

const KIND_OF: Partial<Record<Tone, TickKind>> = {
  active: 'visit',
  compare: 'compare',
  swap: 'compare',
  error: 'compare',
  frontier: 'queue',
  done: 'done',
  found: 'done',
  path: 'done',
  new: 'done',
};

/** most salient first when several things change in one frame */
const PRIORITY: TickKind[] = ['compare', 'done', 'queue', 'visit'];

function toneMap(panels: Panel[]): Map<string, Tone> {
  const m = new Map<string, Tone>();
  panels.forEach((p, pi) => {
    const k = (s: string | number) => `${pi}:${p.type}:${s}`;
    switch (p.type) {
      case 'array':
        for (const [i, t] of Object.entries(p.tones ?? {})) m.set(k(i), t);
        break;
      case 'grid':
        for (const [rc, t] of Object.entries(p.tones ?? {})) m.set(k(rc), t);
        break;
      case 'graph':
        p.nodes.forEach((n) => n.tone && m.set(k(n.id), n.tone));
        p.edges.forEach((e) => e.tone && m.set(k(`${e.from}>${e.to}`), e.tone));
        break;
      case 'list':
        p.items.forEach((it, i) => it.tone && m.set(k(`${i}:${it.label}`), it.tone));
        break;
      case 'buckets':
        p.buckets.forEach((b, bi) => b.forEach((it, i) => it.tone && m.set(k(`${bi}:${i}:${it.label}`), it.tone)));
        Object.entries(p.tones ?? {}).forEach(([i, t]) => m.set(k(`b${i}`), t));
        break;
      case 'sequence':
        p.messages.forEach((msg, i) => msg.tone && m.set(k(i), msg.tone));
        break;
      case 'timeline':
        p.lanes.forEach((l, li) => l.events.forEach((e, ei) => e.tone && m.set(k(`${li}:${ei}`), e.tone)));
        break;
      case 'kv':
        p.entries.forEach((e) => e.tone && m.set(k(e.k), e.tone));
        break;
      case 'log':
        p.lines.forEach((l, i) => l.tone && m.set(k(`${i}:${l.text}`), l.tone));
        break;
      case 'note':
        if (p.tone) m.set(k('note'), p.tone);
        break;
      default:
        break;
    }
  });
  return m;
}

export function tickKinds(frames: Frame[]): TickKind[] {
  let prev = new Map<string, Tone>();
  return frames.map((f) => {
    const cur = toneMap(f.panels);
    const seen = new Set<TickKind>();
    for (const [key, tone] of cur) {
      if (prev.get(key) === tone) continue;
      const kind = KIND_OF[tone];
      if (kind) seen.add(kind);
    }
    prev = cur;
    return PRIORITY.find((k) => seen.has(k)) ?? 'none';
  });
}
