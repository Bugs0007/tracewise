import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { TraceRecorder } from '@/dsa/viz/trace';
import { UnionFind, ek } from '@/dsa/viz/unionfind';
import { problem, vizOf } from '../helpers';
import solution from './redundant-connection.py?raw';
import cases from './redundant-connection.cases.json';

const e = (a: number, b: number): EdgeSpec => ({ from: String(a), to: String(b) });

const viz = vizOf<{ edges: EdgeSpec[] }>({
  id: 'redundant-connection',
  title: 'Redundant Connection',
  solution,
  inputs: [{ key: 'edges', label: 'edges a-b (nodes numbered 1…n, a tree plus one extra edge)', kind: 'edges', default: [e(1, 3), e(3, 5), e(2, 5), e(4, 2), e(1, 2)], maxItems: 8 }],
  presets: [
    { label: 'Path plus one', input: { edges: [e(1, 3), e(3, 5), e(2, 5), e(4, 2), e(1, 2)] } },
    { label: 'Triangle', input: { edges: [e(2, 1), e(3, 2), e(1, 3)] } },
    { label: 'Star plus one', input: { edges: [e(1, 2), e(1, 3), e(1, 4), e(2, 3)] } },
    { label: 'Long cycle', input: { edges: [e(1, 2), e(2, 3), e(3, 4), e(4, 5), e(5, 1)] } },
  ],
  validate: ({ edges }) => {
    const n = edges.length;
    if (n < 3 || n > 8) return 'Use 3 to 8 edges';
    return edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) < 1 || Number(x.to) < 1 || Number(x.from) > n || Number(x.to) > n || x.from === x.to) ? `Nodes are numbered 1 to ${n} (with ${n} edges)` : null;
  },
  run({ edges }) {
    const r = new TraceRecorder(solution);
    const uf = new UnionFind(edges.length + 1);
    const edgeTones: Record<string, Tone> = {};
    const nodeTones: Record<string, Tone> = {};
    let askedUnion = false;
    let askedCycle = false;
    const show = () => uf.panels(edges, { offset: 1, tones: nodeTones, edgeTones });
    r.step('init', 'parent[i] = i: every node starts in its own group (slot 0 is unused, nodes are numbered from 1).', show(), {});
    for (const x of edges) {
      r.op();
      const a = Number(x.from);
      const b = Number(x.to);
      edgeTones[ek(a, b)] = 'active';
      const fa = uf.find(a);
      const fb = uf.find(b);
      nodeTones[String(a)] = 'active';
      nodeTones[String(b)] = 'active';
      r.step('roots', `Edge ${a}-${b}: find(${a}) = ${fa.root}, find(${b}) = ${fb.root}.`, show(), {});
      if (fa.root === fb.root) {
        if (!askedCycle) {
          askedCycle = true;
          r.predict('cycle', `${a} and ${b} already have the same root (${fa.root}). What is this edge?`, ['The redundant edge: it closes a cycle', 'A normal tree edge', 'An isolated edge'], 0, 'The endpoints were already connected by earlier edges, so this extra edge creates a loop. Removing it leaves a tree.');
        }
        edgeTones[ek(a, b)] = 'error';
        r.step('found', `Same root: edge [${a}, ${b}] is redundant. Return it.`, show(), { result: `${a},${b}` });
        return { frames: r.frames, result: [a, b] };
      }
      if (!askedUnion) {
        askedUnion = true;
        r.predict('union', `Roots ${fa.root} and ${fb.root} differ. What do we do with the edge?`, ['Merge the two groups and keep going', 'Return it', 'Skip it'], 0, 'Different roots mean the edge connects two separate groups, so it is needed.');
      }
      uf.parent[fa.root] = fb.root;
      edgeTones[ek(a, b)] = 'found';
      nodeTones[String(a)] = 'default';
      nodeTones[String(b)] = 'default';
      r.step('union', `Different groups: merge (parent[${fa.root}] = ${fb.root}).`, show(), {});
    }
    r.step('none', 'No edge closed a cycle.', show(), { result: '[]' });
    return { frames: r.frames, result: [] };
  },
  reference({ edges }) {
    const uf = new UnionFind(edges.length + 1);
    for (const x of edges) {
      const a = Number(x.from);
      const b = Number(x.to);
      const ra = uf.find(a).root;
      const rb = uf.find(b).root;
      if (ra === rb) return [a, b];
      uf.parent[ra] = rb;
    }
    return [];
  },
});

export default problem({
  summary: 'A tree with nodes numbered 1 to n had one extra edge added, giving a list of n edges. Return the edge that can be removed so that the remaining edges form a tree again; if several edges work, return the one that appears last in the list.',
  example: ['edges [[2, 1], [3, 2], [1, 3]]', '[1, 3]', 'The three edges form a triangle (a cycle). The last of them in the list, [1, 3], is the one to remove.'],
  pattern: ['union-find', ['union-find', 'dfs', 'bfs', 'topo-sort'], 'Add the edges one by one into a union-find. The first edge whose endpoints are already connected is the one that closes the cycle, and it is the last candidate in list order.', {
    dfs: 'DFS cycle detection after each insertion works but costs O(n²).',
    bfs: 'Same as DFS.',
    'topo-sort': 'The graph is undirected.',
  }],
  hints: [
    'What does the extra edge create in a tree?',
    'While adding edges in order, how can you tell the moment a cycle appears?',
    'Union-find: for each edge compare find(a) and find(b). If equal, return the edge; otherwise union.',
  ],
  insight: 'The first edge that joins two nodes already in the same group is the redundant one.',
  brute: 'Try removing each edge from the end and test whether the rest is a tree: O(n²).',
  optimal: 'Union-find: near-linear.',
  walk: ['parent = list(range(n + 1)).', 'For each edge (a, b) compute ra = find(a), rb = find(b).', 'If ra == rb return [a, b].', 'Otherwise parent[ra] = rb.'],
  edge: ['A cycle of length 3 (the triangle).', 'The redundant edge appears early in the list.', 'Long cycles.', 'Edges listed in random order.'],
  works: ['Before the redundant edge, the processed edges form a forest; the first edge joining two nodes in the same tree is exactly where the cycle appears.', 'No later edge can matter because the answer is the last edge on the unique cycle, which this is.'],
  time: ['O(n α(n))', 'Near linear.'],
  space: ['O(n)', 'The parent array.'],
  solution,
  cases,
  sig: 'def find_redundant_connection(edges):\n    # edges is a list of [a, b] with nodes numbered 1 … n; return the edge to remove\n    pass\n',
  viz,
  fromArgs: ([edges]) => ({ edges: (edges as number[][]).map(([a, b]) => e(a, b)) }),
});
