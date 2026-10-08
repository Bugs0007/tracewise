import type { EdgeSpec } from '@/engine/layout';

/** Sorted, de-duplicated adjacency lists from an edge list (deterministic visit order). */
export function adjacency(edges: EdgeSpec[], directed = false): { ids: string[]; adj: Record<string, string[]> } {
  const ids: string[] = [];
  const adj: Record<string, string[]> = {};
  const add = (id: string) => {
    if (!(id in adj)) {
      adj[id] = [];
      ids.push(id);
    }
  };
  for (const e of edges) {
    add(e.from);
    add(e.to);
    adj[e.from].push(e.to);
    if (!directed) adj[e.to].push(e.from);
  }
  for (const k of ids) adj[k] = [...new Set(adj[k])].sort();
  return { ids: ids.sort(), adj };
}

/** Weighted adjacency: node -> [[neighbour, weight], ...] sorted by neighbour. */
export function weightedAdjacency(edges: EdgeSpec[], directed = false): { ids: string[]; adj: Record<string, [string, number][]> } {
  const ids = new Set<string>();
  const adj: Record<string, [string, number][]> = {};
  for (const e of edges) {
    ids.add(e.from);
    ids.add(e.to);
    (adj[e.from] ??= []).push([e.to, e.w ?? 1]);
    if (!directed) (adj[e.to] ??= []).push([e.from, e.w ?? 1]);
  }
  for (const id of ids) adj[id] = (adj[id] ?? []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return { ids: [...ids].sort(), adj };
}

export const e = (s: string): EdgeSpec[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(\w+)\s*-\s*(\w+)(?::(-?\d+(?:\.\d+)?))?$/)!;
      return m[3] !== undefined ? { from: m[1], to: m[2], w: Number(m[3]) } : { from: m[1], to: m[2] };
    });
