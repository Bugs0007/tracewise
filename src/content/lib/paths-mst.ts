// Shared helpers for the shortest-path and spanning-tree units
// (dijkstra, bellman-ford, prim, kruskal).
import { layeredLayout, type EdgeSpec } from '@/engine/layout';
import type { ListItem, Tone } from '@/engine/types';

/** Distance as shown on the board: infinity prints as the infinity symbol. */
export const dstr = (d: number): string => (Number.isFinite(d) ? String(d) : d < 0 ? '-∞' : '∞');

/** A small binary min-heap, the same structure Python's heapq maintains. */
export class MinHeap<T> {
  private a: T[] = [];
  constructor(private readonly cmp: (x: T, y: T) => number) {}

  get size(): number {
    return this.a.length;
  }

  push(x: T): void {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  /** Contents in priority order, for display (a heap array itself is only partially ordered). */
  sorted(): T[] {
    return [...this.a].sort(this.cmp);
  }
}

export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface PreparedGraph {
  ids: string[];
  /** node -> [[neighbour, weight], ...] sorted by neighbour name then weight */
  adj: Record<string, [string, number][]>;
  pos: Record<string, { x: number; y: number }>;
}

/**
 * Validate a weighted edge list and build adjacency + layout.
 * An empty edge list with a start node is a valid one-node graph.
 */
export function prepareGraph(edges: EdgeSpec[], start: string | undefined, directed: boolean): PreparedGraph {
  const idSet = new Set<string>();
  for (const e of edges) {
    idSet.add(e.from);
    idSet.add(e.to);
  }
  if (start !== undefined) {
    if (!start) throw new Error('Pick a start node');
    if (edges.length && !idSet.has(start)) throw new Error(`Start node "${start}" is not in the graph`);
    idSet.add(start);
  }
  if (!idSet.size) throw new Error('Add at least one edge');
  const ids = [...idSet].sort(cmpStr);
  const adj: Record<string, [string, number][]> = {};
  for (const id of ids) adj[id] = [];
  for (const e of edges) {
    adj[e.from].push([e.to, e.w ?? 1]);
    if (!directed) adj[e.to].push([e.from, e.w ?? 1]);
  }
  for (const id of ids) adj[id].sort((p, q) => cmpStr(p[0], q[0]) || p[1] - q[1]);
  const order = start !== undefined ? [start, ...ids.filter((i) => i !== start)] : ids;
  const pos = layeredLayout(order, edges);
  return { ids, adj, pos };
}

/** List-panel items for a priority queue, stale entries greyed out. */
export function queueItems(entries: { label: string; stale?: boolean; sub?: string; id?: string }[]): ListItem[] {
  return entries.map((x) => ({ id: x.id, label: x.label, tone: (x.stale ? 'muted' : 'frontier') as Tone, sub: x.stale ? (x.sub ?? 'stale') : x.sub }));
}
