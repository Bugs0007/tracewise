import type { EdgeSpec } from '@/engine/layout';
import type { Panel, Tone } from '@/engine/types';
import { arrayView, graphView } from './prims';

// Union-find that mirrors the Python in the graph problems (path halving, union by pointing one root at the other),
// so the parent array in a trace is exactly the one the solution would hold.
/** key of an undirected edge in the graph panel's edgeTones */
export const ek = (a: number | string, b: number | string): string => (String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`);

export class UnionFind {
  parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  /** the graph (badge = which group each node is in) plus the parent array; `offset` is the label of node 0 */
  panels(edges: EdgeSpec[], o: { offset?: number; tones?: Record<string, Tone>; edgeTones?: Record<string, Tone>; hot?: number[] } = {}): Panel[] {
    const offset = o.offset ?? 0;
    const items = this.parent.slice(offset);
    const ids = items.map((_, i) => String(i + offset));
    return [
      graphView(ids, edges, { title: 'graph (badge = the root of each node’s group)', layout: 'circle', size: { width: 380, height: 260 }, tones: o.tones, edgeTones: o.edgeTones, badges: Object.fromEntries(ids.map((id, i) => [id, String(this.rootOf(i + offset))])) }),
      arrayView(items, { title: 'parent[] (a root points to itself)', indexLabels: ids, tones: Object.fromEntries((o.hot ?? []).map((i) => [i - offset, 'active' as Tone])) }),
    ];
  }

  /** root without changing anything (for drawing) */
  rootOf(x: number): number {
    while (this.parent[x] !== x) x = this.parent[x];
    return x;
  }

  /** find with path halving; returns the root and the nodes visited on the way */
  find(x: number): { root: number; hops: number[] } {
    const hops: number[] = [];
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
      hops.push(x);
    }
    return { root: x, hops };
  }
}
