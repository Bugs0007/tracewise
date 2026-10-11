// Linked-list drawing helpers for trace generators. A list is described the way the algorithm sees it:
// the values plus a `next` array of indices (null = end), so rewiring a pointer is just changing one entry.
import type { GraphPanel, Scalar, Tone } from '@/engine/types';
import { linkedListView, type LLNodeView } from './prims';

export interface ListViewOpts {
  title?: string;
  tones?: Record<number, Tone>;
  /** cursor names to show above each node (prev, curr, slow, ...) */
  tags?: Record<number, string[]>;
  /** a second kind of pointer drawn dashed (random pointers) */
  random?: readonly (number | null)[];
  /** colour for arrows that point backwards; the neutral default suits reversals, use 'error' to make a cycle stand out */
  backTone?: Tone;
  showNull?: boolean;
}

export function listFromIndices(values: readonly Scalar[], next: readonly (number | null)[], o: ListViewOpts = {}): GraphPanel {
  const order: LLNodeView[] = values.map((v, i) => ({ id: `n${i}`, label: String(v), tone: o.tones?.[i], tags: o.tags?.[i] }));
  const nx: Record<string, string | null> = {};
  const edgeTones: Record<string, Tone> = {};
  next.forEach((t, i) => {
    nx[`n${i}`] = t === null ? null : `n${t}`;
    if (t !== null && t <= i && t !== i) edgeTones[`n${i}>n${t}`] = o.backTone ?? 'default';
  });
  const prev = o.random ? Object.fromEntries(o.random.map((t, i) => [`n${i}`, t === null ? null : `n${t}`])) : undefined;
  return linkedListView(order, nx, { title: o.title, prev, edgeTones, showNull: o.showNull });
}

/** `next` for a plain chain 0 -> 1 -> ... -> n-1 */
export const chain = (n: number): (number | null)[] => Array.from({ length: n }, (_, i) => (i + 1 < n ? i + 1 : null));

/** Indices reachable from `head`, in order (stops if it loops). */
export function walk(next: readonly (number | null)[], head: number | null, limit = 400): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let n = head; n !== null && !seen.has(n) && out.length < limit; n = next[n]) {
    out.push(n);
    seen.add(n);
  }
  return out;
}

/** Collect cursor names onto the nodes they point at: { prev: 2, curr: 3 } -> { 2: ['prev'], 3: ['curr'] } */
export function tagsOf(cursors: Record<string, number | null | undefined>): Record<number, string[]> {
  const t: Record<number, string[]> = {};
  for (const [name, at] of Object.entries(cursors)) if (at !== null && at !== undefined) (t[at] ??= []).push(name);
  return t;
}
