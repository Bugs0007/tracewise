// Shared helpers for the graph units (adjacency, union-find, traversals, topological sort).
// Pure functions only: layouts and small formatting utilities used by several visualizers.
import type { EdgeSpec } from '@/engine/layout';

/** Sorted unique node ids from an edge list (plus optional isolated nodes). */
export function nodeIds(edges: EdgeSpec[], extra: string[] = []): string[] {
  const s = new Set<string>(extra);
  for (const e of edges) {
    s.add(e.from);
    s.add(e.to);
  }
  return [...s].sort();
}

/** "[A, B, C]" for the vars strip. */
export const list = (xs: readonly unknown[]): string => `[${xs.join(', ')}]`;

/** "{A, B}" for the vars strip. */
export const setStr = (xs: Iterable<unknown>): string => `{${[...xs].join(', ')}}`;

/** Throw a friendly error when a node the learner typed is not in the graph. */
export function assertNode(ids: string[], id: string, what = 'Start node'): void {
  if (!ids.includes(id)) throw new Error(`${what} "${id}" is not in the graph`);
}

/** Out-neighbours (sorted, de-duplicated) of a directed edge list, for every id. */
export function outAdj(ids: string[], edges: EdgeSpec[]): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  for (const id of ids) adj[id] = [];
  for (const e of edges) adj[e.from].push(e.to);
  for (const id of ids) adj[id] = [...new Set(adj[id])].sort();
  return adj;
}

/**
 * Left-to-right layered layout for directed graphs. Back edges (cycles) are
 * ignored when assigning layers, so cyclic graphs still get a readable picture.
 */
export function dagLayout(ids: string[], edges: EdgeSpec[], width = 460, height = 280): Record<string, { x: number; y: number }> {
  const out = outAdj(ids, edges);
  const color: Record<string, number> = {};
  const back = new Set<string>();
  const walk = (u: string) => {
    color[u] = 1;
    for (const v of out[u]) {
      if (color[v] === 1) back.add(`${u}>${v}`);
      else if (!color[v]) walk(v);
    }
    color[u] = 2;
  };
  for (const id of ids) if (!color[id]) walk(id);
  const level: Record<string, number> = {};
  for (const id of ids) level[id] = 0;
  for (let k = 0; k <= ids.length; k++) {
    let changed = false;
    for (const e of edges) {
      if (e.from === e.to || back.has(`${e.from}>${e.to}`)) continue;
      if (level[e.to] < level[e.from] + 1) {
        level[e.to] = level[e.from] + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const l = level[id];
    if (!rows.has(l)) rows.set(l, []);
    rows.get(l)!.push(id);
  }
  const L = Math.max(...rows.keys()) + 1;
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [l, row] of rows) {
    row.forEach((id, i) => {
      pos[id] = {
        x: Math.round(L === 1 ? width / 2 : 40 + (l * (width - 80)) / (L - 1)),
        y: Math.round(((i + 1) * height) / (row.length + 1)),
      };
    });
  }
  return pos;
}

/**
 * Tidy layout for a parent-pointer forest (union-find). Roots are on top, each
 * node sits under its parent, siblings are spread left to right. The canvas size
 * only depends on the number of nodes so the picture does not jump between frames.
 */
export function forestLayout(ids: string[], parent: Record<string, string>): { pos: Record<string, { x: number; y: number }>; width: number; height: number } {
  const kids: Record<string, string[]> = {};
  for (const id of ids) kids[id] = [];
  const roots: string[] = [];
  for (const id of ids) {
    if (parent[id] === id) roots.push(id);
    else kids[parent[id]].push(id);
  }
  roots.sort();
  for (const id of ids) kids[id].sort();
  const gapX = 56;
  const width = Math.max(300, ids.length * gapX + 24);
  const height = 230;
  let leaf = 0;
  const xs: Record<string, number> = {};
  const depth: Record<string, number> = {};
  let maxD = 0;
  const place = (id: string, d: number): number => {
    depth[id] = d;
    maxD = Math.max(maxD, d);
    if (!kids[id].length) {
      xs[id] = leaf++;
      return xs[id];
    }
    const cx = kids[id].map((c) => place(c, d + 1));
    xs[id] = (cx[0] + cx[cx.length - 1]) / 2;
    return xs[id];
  };
  for (const r of roots) place(r, 0);
  const gapY = maxD === 0 ? 0 : Math.min(66, (height - 80) / maxD);
  const pos: Record<string, { x: number; y: number }> = {};
  const offset = (width - Math.max(0, leaf - 1) * gapX) / 2;
  for (const id of ids) pos[id] = { x: Math.round(offset + xs[id] * gapX), y: Math.round(34 + depth[id] * gapY) };
  return { pos, width, height };
}
