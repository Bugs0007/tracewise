import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { UnionFind, ek } from '@/dsa/viz/unionfind';
import { problem, vizOf } from '../helpers';
import solution from './number-of-connected-components-in-an-undirected-graph.py?raw';
import cases from './number-of-connected-components-in-an-undirected-graph.cases.json';

const e = (a: number, b: number): EdgeSpec => ({ from: String(a), to: String(b) });

const viz = vizOf<{ n: number; edges: EdgeSpec[] }>({
  id: 'number-of-connected-components-in-an-undirected-graph',
  title: 'Number of Connected Components in an Undirected Graph',
  solution,
  inputs: [
    { key: 'n', label: 'nodes (0 … n−1)', kind: 'number', default: 6 },
    { key: 'edges', label: 'edges a-b', kind: 'edges', default: [e(0, 1), e(1, 2), e(3, 4), e(2, 0)], maxItems: 10 },
  ],
  presets: [
    { label: 'Three groups', input: { n: 6, edges: [e(0, 1), e(1, 2), e(3, 4), e(2, 0)] } },
    { label: 'One group', input: { n: 5, edges: [e(0, 1), e(1, 2), e(2, 3), e(3, 4)] } },
    { label: 'No edges', input: { n: 4, edges: [] } },
    { label: 'Star', input: { n: 5, edges: [e(0, 1), e(0, 2), e(0, 3), e(0, 4)] } },
  ],
  validate: ({ n, edges }) => (!Number.isInteger(n) || n < 1 || n > 8 ? 'Use 1 to 8 nodes' : edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) >= n || Number(x.to) >= n) ? `Nodes are numbered 0 to ${n - 1}` : null),
  run({ n, edges }) {
    const r = new TraceRecorder(solution);
    const uf = new UnionFind(n);
    const edgeTones: Record<string, Tone> = {};
    let components = n;
    let askedSame = false;
    let askedMerge = false;
    const show = () => [...uf.panels(edges, { edgeTones }), hashMapView({ components })];
    r.step('init', 'Every node starts alone: parent[i] = i.', show(), {});
    r.step('count', `So the graph begins with ${n} separate groups (components = ${n}).`, show(), {});
    for (const x of edges) {
      r.op();
      const a = Number(x.from);
      const b = Number(x.to);
      edgeTones[ek(a, b)] = 'active';
      const fa = uf.find(a);
      const fb = uf.find(b);
      r.step('roots', `Edge ${a}-${b}: find(${a}) = ${fa.root}, find(${b}) = ${fb.root}.`, show(), {});
      if (fa.root !== fb.root) {
        if (!askedMerge) {
          askedMerge = true;
          r.predict('merge', `The roots ${fa.root} and ${fb.root} differ. After this edge, how does components change?`, ['It drops by 1: two groups became one', 'It stays the same', 'It increases'], 0, 'Joining two different groups reduces the number of groups by one.');
        }
        uf.parent[fa.root] = fb.root;
        components--;
        edgeTones[ek(a, b)] = 'found';
        r.step('union', `Different groups: merge them (parent[${fa.root}] = ${fb.root}). components = ${components}.`, show(), {});
      } else {
        if (!askedSame) {
          askedSame = true;
          r.predict('same', `Both ends already share root ${fa.root}. What happens to components?`, ['Nothing: they were already connected', 'It drops by 1', 'It increases by 1'], 0, 'An edge inside an existing group adds no new connection.');
        }
        edgeTones[ek(a, b)] = 'compare';
        r.step('differ', `Same root ${fa.root}: already connected, nothing changes.`, show(), {});
      }
    }
    r.step('done', `${components} connected component${components === 1 ? '' : 's'}.`, show(), { result: components });
    return { frames: r.frames, result: components };
  },
  reference({ n, edges }) {
    const uf = new UnionFind(n);
    let c = n;
    for (const x of edges) {
      const ra = uf.find(Number(x.from)).root;
      const rb = uf.find(Number(x.to)).root;
      if (ra !== rb) { uf.parent[ra] = rb; c--; }
    }
    return c;
  },
});

export default problem({
  summary: 'You are given n nodes numbered 0 to n − 1 and a list of undirected edges. Count the connected components: groups of nodes where each node can reach every other node in its group through edges.',
  example: ['n = 4, edges [[0, 1], [2, 3]]', '2', 'Nodes 0 and 1 form one group, nodes 2 and 3 another.'],
  pattern: ['union-find', ['union-find', 'dfs', 'bfs', 'hash-lookup'], 'Start with n groups and merge groups edge by edge. Each successful merge reduces the group count by one, so the final count is the answer.', {
    dfs: 'DFS from each unvisited node also counts components; union-find avoids building an adjacency list.',
    bfs: 'BFS flood fill is equivalent.',
    'hash-lookup': 'An adjacency map would be needed for DFS, not for union-find.',
  }],
  hints: [
    'How many components are there if there are no edges?',
    'What happens to the count when an edge joins two nodes that are already connected? When it joins two separate groups?',
    'components = n. For each edge find both roots; if they differ, merge and subtract 1.',
  ],
  insight: 'Each edge either merges two groups (components −1) or does nothing.',
  brute: 'DFS from every unvisited node over an adjacency list: O(V + E).',
  optimal: 'Union-find: O(n + E · α(n)).',
  walk: ['parent = list(range(n)); components = n.', 'For each edge find the roots of its endpoints.', 'If the roots differ, set parent[ra] = rb and decrement components.', 'Return components.'],
  edge: ['No edges (n components).', 'Repeated edges.', 'A cycle (the last edge changes nothing).', 'A single node.'],
  works: ['Two nodes share a root exactly when they are connected by the edges processed so far.', 'Each merge reduces the number of distinct roots by exactly one.'],
  time: ['O(n + E α(n))', 'Near linear.'],
  space: ['O(n)', 'The parent array.'],
  solution,
  cases,
  sig: 'def count_components(n, edges):\n    # nodes are 0 … n−1; edges is a list of [a, b]; return the number of connected components\n    pass\n',
  viz,
  fromArgs: ([n, edges]) => ({ n, edges: (edges as number[][]).map(([a, b]) => e(a, b)) }),
});
