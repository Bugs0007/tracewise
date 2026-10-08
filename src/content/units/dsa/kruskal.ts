import { Recorder } from '@/engine/recorder';
import { graphPanel, edgeKey, type EdgeSpec } from '@/engine/layout';
import type { ArrayPanel, KVPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { e } from '@/content/lib/graph';
import { cmpStr, prepareGraph } from '@/content/lib/paths-mst';

const code = `
def kruskal(nodes, edges):
    parent = {v: v for v in nodes}                      #@init

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total, used = 0, 0
    for u, v, w in sorted(edges, key=lambda e: e[2]):   #@sort
        ru, rv = find(u), find(v)                       #@find
        if ru == rv:                                    #@check
            continue                                    #@reject
        parent[ru] = rv                                 #@union
        total += w                                      #@take
        used += 1
        if used == len(nodes) - 1:                      #@enough
            break
    return total if used == len(nodes) - 1 else -1      #@done
`;

interface In {
  edges: EdgeSpec[];
}

const viz: VizDef<In> = {
  id: 'kruskal',
  title: "Kruskal's minimum spanning tree",
  code,
  language: 'python',
  inputs: [{ key: 'edges', label: 'Weighted edges (undirected, A-B:4)', kind: 'edges', default: e('A-B:4, A-C:4, B-C:2, B-D:5, C-D:1, C-E:7, D-E:3, D-F:6, E-F:2'), maxItems: 14 }],
  presets: [
    { label: 'Equal weights', input: { edges: e('A-B:1, B-C:1, A-C:1, C-D:1') } },
    { label: 'Already a tree', input: { edges: e('A-B:3, B-C:1, C-D:2') } },
    { label: 'Disconnected', input: { edges: e('A-B:2, B-C:1, X-Y:4') } },
  ],
  run({ edges }) {
    const r = new Recorder(code);
    for (const ed of edges) if (ed.w === undefined) throw new Error(`Edge ${ed.from}-${ed.to} needs a weight (A-B:4)`);
    const { ids, pos } = prepareGraph(edges, undefined, false);
    const n = ids.length;
    const parent: Record<string, string> = Object.fromEntries(ids.map((i) => [i, i]));
    const rootOf = (x: string) => {
      while (parent[x] !== x) x = parent[x];
      return x;
    };
    const find = (x: string) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    // stable sort by weight, so ties keep the order they were typed in
    const sorted = [...edges].sort((a, b) => (a.w as number) - (b.w as number));
    const label = (ed: EdgeSpec) => `${ed.from}-${ed.to}:${ed.w}`;
    const state: ('todo' | 'taken' | 'skipped')[] = sorted.map(() => 'todo');
    let total = 0;
    let used = 0;

    const panels = (at = -1, flash?: Tone, changed: string[] = []) => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        badges[id] = `set ${rootOf(id)}`;
        tones[id] = 'default';
      }
      const edgeTones: Record<string, Tone> = {};
      sorted.forEach((ed, i) => {
        const k = edgeKey(ed.from, ed.to, false);
        if (state[i] === 'taken') edgeTones[k] = 'done';
        else if (state[i] === 'skipped' && edgeTones[k] === undefined) edgeTones[k] = 'muted';
      });
      if (at >= 0) {
        const ed = sorted[at];
        edgeTones[edgeKey(ed.from, ed.to, false)] = flash ?? 'active';
        tones[ed.from] = 'compare';
        tones[ed.to] = 'compare';
      }
      const arr: ArrayPanel = {
        type: 'array',
        title: 'Edges sorted by weight',
        values: sorted.map(label),
        tones: Object.fromEntries(sorted.map((_, i) => [i, i === at ? (flash ?? 'active') : state[i] === 'taken' ? 'done' : state[i] === 'skipped' ? 'muted' : 'default'])) as Record<number, Tone>,
        hideIndex: true,
      };
      const kv: KVPanel = {
        type: 'kv',
        title: 'Union-find parent',
        entries: ids.map((id) => ({ k: id, v: parent[id], tone: changed.includes(id) ? 'swap' : parent[id] === id ? undefined : 'visited' })),
      };
      return [graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph' }), arr, kv];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ total, used, need: n - 1, ...extra });

    r.step('init', `Every node starts as its own set (${n} sets)`, panels(), vars());
    r.op(sorted.length);
    r.step('sort', `Sort the ${sorted.length} edges by weight, cheapest first`, panels(), vars());
    for (let i = 0; i < sorted.length; i++) {
      const ed = sorted[i];
      const w = ed.w as number;
      const before = { ...parent };
      const ru = find(ed.from);
      const rv = find(ed.to);
      r.op(2);
      const compressed = ids.filter((id) => before[id] !== parent[id]);
      r.step('find', `${label(ed)}: set of ${ed.from} is ${ru}, set of ${ed.to} is ${rv}`, panels(i, 'active', compressed), vars({ edge: label(ed), ru, rv }));
      if (ru === rv) {
        state[i] = 'skipped';
        r.step('reject', `Same set: ${label(ed)} would form a cycle, reject`, panels(i, 'error'), vars({ edge: label(ed), ru, rv }));
        continue;
      }
      parent[ru] = rv;
      total += w;
      used++;
      state[i] = 'taken';
      r.step('take', `Union ${ru} into ${rv}, take ${label(ed)}: total = ${total}`, panels(i, 'new', [ru]), vars({ edge: label(ed), ru, rv }));
      if (used === n - 1) {
        const left = sorted.length - i - 1;
        r.step('enough', `${n - 1} edges chosen: the tree is complete${left ? `, ${left} edge${left > 1 ? 's' : ''} left unread` : ''}`, panels(), vars());
        break;
      }
    }
    const result = used === n - 1 ? total : -1;
    r.step('done', result === -1 ? `Only ${used} edges fit (need ${n - 1}): graph is not connected, return -1` : `MST weight = ${total}`, panels(), vars({ result }));
    return { frames: r.frames, result };
  },
  reference({ edges }) {
    const { ids, adj } = prepareGraph(edges, undefined, false);
    const inTree = new Set<string>([ids[0]]);
    let sum = 0;
    while (inTree.size < ids.length) {
      let best: [number, string] | null = null;
      for (const u of inTree) for (const [v, w] of adj[u]) if (!inTree.has(v) && (best === null || w < best[0] || (w === best[0] && cmpStr(v, best[1]) < 0))) best = [w, v];
      if (!best) return -1;
      inTree.add(best[1]);
      sum += best[0];
    }
    return sum;
  },
};

const tests = [
  { args: [4, [[0, 1, 1], [1, 2, 2], [2, 3, 3], [0, 3, 10], [0, 2, 4]]], expected: 6 },
  { args: [5, [[0, 1, 4], [0, 2, 4], [1, 2, 2], [2, 3, 3], [3, 4, 2], [1, 3, 5]]], expected: 11, name: 'cycles to reject' },
  { args: [3, [[0, 1, 1], [1, 2, 1], [0, 2, 1]]], expected: 2, name: 'all weights tie' },
  { args: [4, [[0, 1, 5], [2, 3, 1]]], expected: -1, name: 'disconnected graph' },
  { args: [1, []], expected: 0, name: 'single node' },
];

const unit: Unit = {
  id: 'kruskal',
  hook: 'Kruskal is a greedy sort-then-union loop, so it tests two skills at once: knowing why the greedy choice is safe, and writing union-find correctly under pressure.',
  predict: {
    prompt: 'Sorted edges: C–D:1, B–C:2, B–D:3, A–B:4 on nodes A, B, C, D. Kruskal reads them in order. Which edges end up in the MST?',
    options: ['C–D, B–C, B–D', 'C–D, B–C, A–B', 'C–D, B–D, A–B', 'All four edges'],
    answer: 1,
    explain: 'C–D and B–C are taken. B–D now joins two nodes that are already in the same set (a cycle), so it is rejected. A–B connects the last node. Total 1 + 2 + 4 = 7.',
  },
  viz,
  deeper: {
    points: [
      'Greedy works because of the cut property: the cheapest edge leaving any group of nodes is safe to take. Sorting guarantees that when you read an edge, it is the cheapest one that connects its two sets.',
      'An edge is rejected exactly when both ends already share a set root: adding it would close a cycle.',
      'Union-find with path compression makes each find nearly constant, so sorting dominates the running time.',
      'You can stop as soon as you have V − 1 edges. If you run out of edges earlier, the graph is disconnected (a spanning forest).',
      'Kruskal needs no start node and works well on sparse edge lists; Prim tends to win on dense graphs stored as matrices.',
    ],
    complexity: { time: 'O(E log E)', space: 'O(V)' },
    pitfalls: [
      'Forgetting to union after accepting an edge, so no cycle is ever detected',
      'Sorting descending, which builds a maximum spanning tree',
      'Comparing the nodes themselves instead of their roots: ru == rv, not u == v',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'kruskal',
    statement: 'Nodes are `0..n-1` and `edges` is a list of undirected `[u, v, w]`. Return the total weight of a minimum spanning tree, or -1 if the graph is not connected.',
    signature: 'def kruskal(n, edges):',
    solution: `def kruskal(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = 0
    used = 0
    for u, v, w in @@sorted(edges, key=lambda e: e[2])@@:
        ru, rv = find(u), find(v)
        if @@ru == rv@@:
            continue
        @@parent[ru] = rv@@
        total += @@w@@
        used += 1
    return total if @@used == n - 1@@ else -1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'kruskal',
    statement: 'This Kruskal returns -1 or an inflated total even on small connected graphs. Find the missing step.',
    buggy: `def kruskal(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = 0
    used = 0
    for u, v, w in sorted(edges, key=lambda e: e[2]):
        ru, rv = find(u), find(v)
        if ru == rv:
            continue
        total += w
        used += 1
    return total if used == n - 1 else -1`,
    fixed: `def kruskal(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = 0
    used = 0
    for u, v, w in sorted(edges, key=lambda e: e[2]):
        ru, rv = find(u), find(v)
        if ru == rv:
            continue
        parent[ru] = rv
        total += w
        used += 1
    return total if used == n - 1 else -1`,
    tests,
    bugType: 'union never performed',
    hint: 'After an edge is accepted, what does find(u) return for u and v the next time? Did anything change?',
    explanation: 'Accepting an edge must merge the two sets: parent[ru] = rv. Without it every node stays its own root, the cycle check never fires, and every edge is counted.',
  },
  boss: {
    title: 'Farthest-apart clusters',
    statement: 'You have n items (0..n-1) and `edges` of the form `[u, v, d]` giving the distance between pairs of items. Split the items into exactly `k` non-empty groups so that the smallest distance between two items in different groups is as large as possible. Return that largest possible value, or -1 if no two items can end up in different groups.',
    language: 'python',
    fnName: 'max_spacing',
    starter: `def max_spacing(n, edges, k):
    # your code here
    pass
`,
    solution: `def max_spacing(n, edges, k):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    groups = n
    for u, v, d in sorted(edges, key=lambda e: e[2]):
        ru, rv = find(u), find(v)
        if ru == rv:
            continue
        if groups == k:
            return d
        parent[ru] = rv
        groups -= 1
    return -1`,
    tests: [
      { args: [4, [[0, 1, 1], [0, 2, 5], [0, 3, 6], [1, 2, 4], [1, 3, 5], [2, 3, 1]], 2], expected: 4 },
      { args: [4, [[0, 1, 1], [0, 2, 5], [0, 3, 6], [1, 2, 4], [1, 3, 5], [2, 3, 1]], 3], expected: 1, name: 'three groups' },
      { args: [4, [[0, 1, 1], [0, 2, 5], [0, 3, 6], [1, 2, 4], [1, 3, 5], [2, 3, 1]], 4], expected: 1, name: 'every item alone' },
      { args: [4, [[0, 1, 1], [0, 2, 5], [0, 3, 6], [1, 2, 4], [1, 3, 5], [2, 3, 1]], 1], expected: -1, name: 'one group has no spacing' },
      { args: [5, [[0, 1, 2], [1, 2, 2], [2, 3, 9], [3, 4, 1]], 2], expected: 9, name: 'a long bridge' },
      { args: [3, [[0, 1, 3], [1, 2, 3], [0, 2, 1]], 2], expected: 3, name: 'cycle in the distances' },
    ],
    hints: ['Merging the closest items first is exactly what Kruskal does. Stopping early leaves you with k groups.', 'Process edges by increasing distance with union-find, counting groups. When groups == k, the first edge whose ends are in different sets is the answer.'],
    combines: ['union-find', 'prim'],
  },
  quiz: [
    {
      prompt: 'In Kruskal, an edge u–v is read and find(u) == find(v). What should happen?',
      options: ['Union them again to be safe', 'Skip it: it would create a cycle', 'Take it only if it is the cheapest so far', 'Stop the algorithm'],
      answer: 1,
      explain: 'Equal roots mean u and v are already connected through chosen edges, so adding the edge would only form a cycle.',
    },
  ],
};

export default unit;
