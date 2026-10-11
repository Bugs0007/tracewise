import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { graphView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { UnionFind, ek } from '@/dsa/viz/unionfind';
import { problem, vizOf } from '../helpers';
import solution from './graph-valid-tree.py?raw';
import cases from './graph-valid-tree.cases.json';

const e = (a: number, b: number): EdgeSpec => ({ from: String(a), to: String(b) });

const viz = vizOf<{ n: number; edges: EdgeSpec[] }>({
  id: 'graph-valid-tree',
  title: 'Graph Valid Tree',
  solution,
  inputs: [
    { key: 'n', label: 'nodes (0 … n−1)', kind: 'number', default: 5 },
    { key: 'edges', label: 'edges a-b', kind: 'edges', default: [e(0, 1), e(1, 2), e(2, 3), e(1, 3)], maxItems: 10 },
  ],
  presets: [
    { label: 'Cycle caught', input: { n: 5, edges: [e(0, 1), e(1, 2), e(2, 3), e(1, 3)] } },
    { label: 'A tree', input: { n: 5, edges: [e(0, 1), e(0, 2), e(0, 3), e(1, 4)] } },
    { label: 'Too few edges', input: { n: 4, edges: [e(0, 1), e(2, 3)] } },
    { label: 'Single node', input: { n: 1, edges: [] } },
  ],
  validate: ({ n, edges }) => (!Number.isInteger(n) || n < 1 || n > 8 ? 'Use 1 to 8 nodes' : edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) >= n || Number(x.to) >= n) ? `Nodes are numbered 0 to ${n - 1}` : null),
  run({ n, edges }) {
    const r = new TraceRecorder(solution);
    const uf = new UnionFind(n);
    const ids = Array.from({ length: n }, (_, i) => String(i));
    const edgeTones: Record<string, Tone> = {};
    const nodeTones: Record<string, Tone> = {};
    const show = () => uf.panels(edges, { tones: nodeTones, edgeTones });
    if (edges.length !== n - 1) {
      r.step('count', `A tree on ${n} node${n === 1 ? '' : 's'} has exactly ${n - 1} edges, but there are ${edges.length}.`, [graphView(ids, edges, { title: 'graph', layout: 'circle', size: { width: 380, height: 260 } })], {});
      r.predict('count', `With ${n} nodes and ${edges.length} edges, can this be a tree?`, ['No: a tree needs exactly n − 1 edges', 'Yes'], 0, 'Fewer edges leave it disconnected; more edges force a cycle.');
      r.step('countRet', 'Wrong edge count: return False immediately.', [graphView(ids, edges, { title: 'graph', layout: 'circle', size: { width: 380, height: 260 } })], { result: false });
      return { frames: r.frames, result: false };
    }
    r.step('count', `${edges.length} edges = n − 1: the count is right. A tree must also have no cycle (then it is automatically connected).`, show(), {});
    r.step('init', 'Every node starts as its own group: parent[i] = i.', show(), {});
    let askedCycle = false;
    let askedUnion = false;
    for (const x of edges) {
      r.op();
      const a = Number(x.from);
      const b = Number(x.to);
      edgeTones[ek(a, b)] = 'active';
      r.step('loop', `Edge ${a}-${b}: are ${a} and ${b} already in the same group?`, show(), {});
      const fa = uf.find(a);
      const fb = uf.find(b);
      nodeTones[String(a)] = 'active';
      nodeTones[String(b)] = 'active';
      r.step('roots', `find(${a}) = ${fa.root}, find(${b}) = ${fb.root}.`, uf.panels(edges, { tones: nodeTones, edgeTones }), {});
      if (fa.root === fb.root) {
        if (!askedCycle) {
          askedCycle = true;
          r.predict('cycle', `Both ${a} and ${b} have root ${fa.root}. What does that mean for this edge?`, ['They are already connected, so this edge closes a cycle', 'It joins two groups', 'It is a duplicate of the previous edge'], 0, 'If the endpoints already share a root, a path between them exists, and this edge makes a loop.');
        }
        edgeTones[ek(a, b)] = 'error';
        r.step('cycleRet', `Same root ${fa.root}: the edge closes a cycle. Not a tree: return False.`, show(), { result: false });
        return { frames: r.frames, result: false };
      }
      if (!askedUnion) {
        askedUnion = true;
        r.predict('union', `Roots ${fa.root} and ${fb.root} differ. What do we do?`, ['Point one root at the other (merge the groups)', 'Return False', 'Do nothing'], 0, 'Different roots mean different groups; this edge connects them, so merge.');
      }
      uf.parent[fa.root] = fb.root;
      edgeTones[ek(a, b)] = 'found';
      nodeTones[String(a)] = 'default';
      nodeTones[String(b)] = 'default';
      r.step('union', `Merge: parent[${fa.root}] = ${fb.root}.`, show(), {});
    }
    r.step('done', 'All edges joined different groups: no cycle, and with n − 1 edges the graph is a tree. Return True.', show(), { result: true });
    return { frames: r.frames, result: true };
  },
  reference({ n, edges }) {
    if (edges.length !== n - 1) return false;
    const uf = new UnionFind(n);
    for (const x of edges) {
      const ra = uf.find(Number(x.from)).root;
      const rb = uf.find(Number(x.to)).root;
      if (ra === rb) return false;
      uf.parent[ra] = rb;
    }
    return true;
  },
});

export default problem({
  summary: 'You are given n nodes numbered 0 to n − 1 and a list of undirected edges. Decide whether these edges form a valid tree: connected, and with no cycles.',
  example: ['n = 3, edges [[0, 1], [1, 2]]', 'true', 'A path is a tree. With edges [[0, 1], [1, 2], [2, 0]] there is a cycle, and with [[0, 1]] node 2 is disconnected.'],
  pattern: ['union-find', ['union-find', 'dfs', 'bfs', 'topo-sort'], 'A tree on n nodes has exactly n − 1 edges and no cycle. Union-find merges the groups of each edge’s endpoints and detects a cycle the moment an edge connects two nodes that are already in the same group.', {
    dfs: 'A DFS can check connectivity and cycles, but union-find is the lighter tool for edge-by-edge processing.',
    bfs: 'BFS from node 0 can verify connectivity, but cycle detection is easier with union-find.',
    'topo-sort': 'Topological sort is for directed graphs.',
  }],
  hints: [
    'How many edges must a tree on n nodes have?',
    'Once the edge count is right, what single property remains to check?',
    'Check len(edges) == n − 1, then union the endpoints of each edge; if they already share a root, return False.',
  ],
  insight: 'With exactly n − 1 edges, "no cycle" and "connected" are equivalent. Union-find catches the first cycle.',
  brute: 'Run DFS for connectivity and a second pass for cycles: O(V + E) too, with more code.',
  optimal: 'Edge count check plus union-find: near-linear, O(n α(n)).',
  walk: ['If len(edges) != n − 1 return False.', 'parent = list(range(n)).', 'For each edge find the roots of both endpoints.', 'If the roots are equal return False; otherwise point one root at the other. After all edges return True.'],
  edge: ['n = 1 with no edges (a tree).', 'Right count but a cycle plus a disconnected node.', 'Duplicate edges.', 'Too many edges.'],
  works: ['A graph with n nodes, n − 1 edges and no cycle is connected, because a forest of c trees has n − c edges.', 'The union-find roots are equal exactly when the endpoints are already connected by earlier edges.'],
  time: ['O(n α(n))', 'α is the inverse Ackermann function: effectively constant.'],
  space: ['O(n)', 'The parent array.'],
  solution,
  cases,
  sig: 'def valid_tree(n, edges):\n    # nodes are 0 … n−1; edges is a list of [a, b]; True if they form a tree\n    pass\n',
  viz,
  fromArgs: ([n, edges]) => ({ n, edges: (edges as number[][]).map(([a, b]) => e(a, b)) }),
});
