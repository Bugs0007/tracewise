import { Recorder } from '@/engine/recorder';
import { graphPanel, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { forestLayout, nodeIds } from '@/content/lib/graphs';

const code = `
class UnionFind:
    def __init__(self, items):
        self.parent = {x: x for x in items}                    #@init
        self.rank = {x: 0 for x in items}                      #@initRank

    def find(self, x):
        if self.parent[x] != x:                                #@findCheck
            self.parent[x] = self.find(self.parent[x])         #@compress
        return self.parent[x]                                  #@findRet

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)                    #@roots
        if ra == rb:                                           #@same
            return False                                       #@cycle
        if self.rank[ra] < self.rank[rb]:                      #@rankCmp
            ra, rb = rb, ra                                    #@swap
        self.parent[rb] = ra                                   #@link
        if self.rank[ra] == self.rank[rb]:                     #@rankEq
            self.rank[ra] += 1                                 #@rankUp
        return True                                            #@merged

    def connected(self, a, b):
        return self.find(a) == self.find(b)                    #@connected
`;

interface In {
  edges: EdgeSpec[];
  queries: EdgeSpec[];
}

const E = (s: string): EdgeSpec[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(\w+)-(\w+)$/)!;
      return { from: m[1], to: m[2] };
    });

interface Result {
  components: string[][];
  answers: boolean[];
}

const viz: VizDef<In> = {
  id: 'union-find',
  title: 'Union-Find (rank + path compression)',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Unions (A-B means union(A, B))', kind: 'edges', default: E('A-B, C-D, A-C, E-F, D-F'), maxItems: 9 },
    { key: 'queries', label: 'Queries (A-B means connected(A, B))', kind: 'edges', default: E('B-F'), maxItems: 3 },
  ],
  presets: [
    { label: 'Compression in action', input: { edges: E('A-B, C-D, A-C, E-F, D-F'), queries: E('B-F') } },
    { label: 'Redundant edge', input: { edges: E('A-B, B-C, C-A'), queries: E('A-C') } },
    { label: 'Deep tree (8 nodes)', input: { edges: E('A-B, C-D, A-C, E-F, G-H, E-G, A-E'), queries: E('H-D') } },
    { label: 'Separate groups', input: { edges: E('A-B, C-D'), queries: E('A-D') } },
  ],
  run({ edges, queries }) {
    if (!edges.length) throw new Error('Add at least one union, like A-B');
    const r = new Recorder(code);
    const ids = nodeIds([...edges, ...queries]);
    const parent: Record<string, string> = {};
    const rank: Record<string, number> = {};
    for (const id of ids) {
      parent[id] = id;
      rank[id] = 0;
    }
    let comps = ids.length;

    interface Hi {
      active?: string;
      path?: string[];
      root?: string;
      swapped?: string;
      linked?: string;
      error?: string[];
    }
    const view = (h: Hi = {}): Panel[] => {
      const { pos, width, height } = forestLayout(ids, parent);
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      const edgeTones: Record<string, Tone> = {};
      for (const id of ids) {
        tones[id] = parent[id] === id ? 'done' : 'default';
        if (parent[id] === id) badges[id] = `rank ${rank[id]}`;
      }
      for (const p of h.path ?? []) {
        tones[p] = 'visited';
        edgeTones[`${p}>${parent[p]}`] = 'active';
      }
      if (h.root) tones[h.root] = 'found';
      if (h.active) tones[h.active] = 'active';
      for (const x of h.error ?? []) tones[x] = 'error';
      if (h.swapped) edgeTones[h.swapped] = 'swap';
      if (h.linked) edgeTones[h.linked] = 'new';
      const forestEdges: EdgeSpec[] = ids.filter((i) => parent[i] !== i).map((i) => ({ from: i, to: parent[i] }));
      const aT: Record<number, Tone> = {};
      ids.forEach((id, i) => {
        if (h.active === id) aT[i] = 'active';
        else if (h.swapped?.startsWith(`${id}>`) || h.linked?.startsWith(`${id}>`)) aT[i] = 'swap';
      });
      return [
        graphPanel(ids, forestEdges, pos, true, { tones, badges, edgeTones, title: 'Forest (arrow = parent pointer, root points to itself)' }, { width, height }),
        { type: 'array', title: 'parent[ ]', values: ids.map((id) => parent[id]), indexLabels: ids, tones: aT },
        { type: 'array', title: 'rank[ ]', values: ids.map((id) => rank[id]), indexLabels: ids },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ sets: comps, ...extra });

    const find = (x0: string, h: Hi = {}): string => {
      const path: string[] = [];
      let cur = x0;
      while (parent[cur] !== cur) {
        r.op();
        path.push(cur);
        r.step('findCheck', `find(${x0}): ${cur} is not a root (parent ${parent[cur]}) → climb`, view({ ...h, active: cur, path }), vars({ x: cur }));
        cur = parent[cur];
      }
      r.step('findRet', `${cur} is its own parent → root of ${x0}'s set`, view({ ...h, root: cur, path }), vars({ x: x0, root: cur }));
      for (let k = path.length - 1; k >= 0; k--) {
        const node = path[k];
        if (parent[node] === cur) continue;
        const old = parent[node];
        parent[node] = cur;
        r.step('compress', `Path compression: ${node} now points straight to ${cur} (was ${old})`, view({ ...h, root: cur, swapped: `${node}>${cur}` }), vars({ x: node, root: cur }));
      }
      return cur;
    };

    r.step('init', `Every item starts as its own root: ${ids.length} separate sets`, view(), vars());
    r.step('initRank', 'All ranks start at 0 (rank ≈ height of the tree)', view(), vars());
    for (const ed of edges) {
      const { from: a, to: b } = ed;
      r.step('roots', `union(${a}, ${b}): find the root of each side first`, view(), vars({ a, b }));
      let ra = find(a);
      let rb = find(b);
      r.op();
      if (ra === rb) {
        r.step('same', `Both sides have root ${ra} → already connected`, view({ root: ra, error: [a, b] }), vars({ a, b, ra, rb }));
        r.step('cycle', `${a}–${b} is redundant: it would close a cycle (returns False)`, view({ root: ra, error: [a, b] }), vars({ a, b, merged: false }));
        continue;
      }
      r.step('rankCmp', `rank[${ra}] = ${rank[ra]} vs rank[${rb}] = ${rank[rb]}`, view({ active: ra }), vars({ ra, rb }));
      if (rank[ra] < rank[rb]) {
        [ra, rb] = [rb, ra];
        r.step('swap', `Left rank was smaller → swap so the taller root ${ra} stays on top`, view({ root: ra }), vars({ ra, rb }));
      }
      parent[rb] = ra;
      comps--;
      r.step('link', `Hang root ${rb} under root ${ra}: parent[${rb}] = ${ra}`, view({ root: ra, linked: `${rb}>${ra}` }), vars({ ra, rb }));
      if (rank[ra] === rank[rb]) {
        rank[ra]++;
        r.step('rankUp', `Equal ranks → the merged tree grew: rank[${ra}] = ${rank[ra]}`, view({ root: ra }), vars({ ra, rank: rank[ra] }));
      }
    }
    const answers: boolean[] = [];
    for (const q of queries) {
      r.step('connected', `connected(${q.from}, ${q.to}) → compare the two roots`, view(), vars({ a: q.from, b: q.to }));
      const x = find(q.from);
      const y = find(q.to);
      answers.push(x === y);
      r.step('connected', `${q.from} → ${x}, ${q.to} → ${y}: ${x === y ? 'same root → connected' : 'different roots → not connected'}`, view({ root: x === y ? x : undefined, error: x === y ? undefined : [x, y] }), vars({ result: x === y }));
    }
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      let cur = id;
      while (parent[cur] !== cur) cur = parent[cur];
      if (!groups.has(cur)) groups.set(cur, []);
      groups.get(cur)!.push(id);
    }
    const components = [...groups.values()].map((g) => g.sort()).sort((p, q) => (p[0] < q[0] ? -1 : 1));
    const result: Result = { components, answers };
    return { frames: r.frames, result };
  },
  reference({ edges, queries }) {
    const ids = nodeIds([...edges, ...queries]);
    const adj: Record<string, string[]> = Object.fromEntries(ids.map((i) => [i, []]));
    for (const e of edges) {
      adj[e.from].push(e.to);
      adj[e.to].push(e.from);
    }
    const comp: Record<string, number> = {};
    const components: string[][] = [];
    for (const id of ids) {
      if (id in comp) continue;
      const stack = [id];
      comp[id] = components.length;
      const members: string[] = [];
      while (stack.length) {
        const u = stack.pop()!;
        members.push(u);
        for (const v of adj[u]) if (!(v in comp)) {
          comp[v] = components.length;
          stack.push(v);
        }
      }
      components.push(members.sort());
    }
    components.sort((p, q) => (p[0] < q[0] ? -1 : 1));
    return { components, answers: queries.map((q) => comp[q.from] === comp[q.to]) };
  },
};

const countTests = [
  { args: [5, [[0, 1], [1, 2], [3, 4]]], expected: 2 },
  { args: [4, []], expected: 4, name: 'no edges' },
  { args: [3, [[0, 1], [0, 2], [1, 2]]], expected: 1, name: 'triangle (redundant edge)' },
  { args: [6, [[0, 1], [2, 3], [0, 3], [4, 5]]], expected: 2 },
  { args: [1, []], expected: 1, name: 'single node' },
  { args: [4, [[0, 1], [0, 2], [1, 2]]], expected: 2, name: 'triangle plus isolated node' },
];

const unit: Unit = {
  id: 'union-find',
  hook: 'Union-Find answers "are these two things in the same group?" in near-constant time while groups keep merging. It is the engine behind Kruskal, "number of provinces" and redundant-connection questions.',
  predict: {
    prompt: 'Ranks are equal, ties go to the first argument. After union(A,B), union(C,D), union(A,C), you call find(D). Which parent pointer changes?',
    options: ['parent[D] becomes A (path compression)', 'parent[C] becomes D', 'parent[A] becomes D', 'Nothing changes'],
    answer: 0,
    explain: 'After the unions the tree is A ← B, A ← C ← D. find(D) climbs D → C → A, then re-points D directly at A. C already pointed at A, so only D changes.',
  },
  viz,
  deeper: {
    points: [
      'Each set is a tree stored as parent pointers; the root is the set\'s name. find climbs to the root, union links one root under the other.',
      'Path compression: after find, every node on the climbed path is re-pointed at the root, so the next find on it is one step.',
      'Union by rank: hang the shorter tree under the taller one so trees stay shallow. Rank only changes when two equal ranks merge.',
      'union must link ROOTS (the results of find), never the raw arguments — otherwise you silently cut a tree in half.',
      'If find(a) == find(b) before union, the new edge closes a cycle. That is the whole trick behind redundant-connection and Kruskal.',
    ],
    complexity: { time: 'O(α(n)) per operation, effectively constant', space: 'O(n)' },
    pitfalls: ['Linking a and b instead of their roots', 'Updating rank on the wrong root after a swap', 'Forgetting that find must compress or the tree can become a long chain', 'Counting components wrongly when a union is redundant'],
  },
  practice: {
    language: 'python',
    fnName: 'count_components',
    statement: 'Nodes are 0..n-1 and `edges` is a list of [a, b] pairs. Use Union-Find to return how many connected groups the graph has.',
    signature: 'def count_components(n, edges):',
    solution: `def count_components(n, edges):
    parent = @@list(range(n))@@

    def find(x):
        if parent[x] != x:
            parent[x] = @@find(parent[x])@@
        return parent[x]

    count = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if @@ra != rb@@:
            parent[rb] = @@ra@@
            count -= 1
    return count`,
    tests: countTests,
  },
  debug: {
    language: 'python',
    fnName: 'count_components',
    statement: 'Some graphs report too few components (even 0). Find and fix the bug.',
    buggy: `def count_components(n, edges):
    parent = list(range(n))

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    count = n
    for a, b in edges:
        if find(a) != find(b):
            parent[a] = b
            count -= 1
    return count`,
    fixed: `def count_components(n, edges):
    parent = list(range(n))

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    count = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            count -= 1
    return count`,
    tests: countTests,
    bugType: 'union without find (linking non-roots)',
    hint: 'Trace the triangle 0-1, 0-2, 1-2. What does parent[0] = 2 do to the earlier link from 0 to 1?',
    explanation: 'The code compared roots but then linked the raw nodes a and b. When a is not a root, overwriting parent[a] detaches it from its old tree, so sets get lost and the count drifts. Always link find(a) to find(b).',
  },
  boss: {
    title: 'The edge that closes the loop',
    statement: 'A network of nodes labelled 1..n started as a tree, then one extra edge was added. `edges` lists them in the order they were added. Return the edge [a, b] that first connects two nodes that were already connected. The input always contains exactly one such edge.',
    language: 'python',
    fnName: 'find_redundant',
    starter: `def find_redundant(edges):
    # your code here
    pass
`,
    solution: `def find_redundant(edges):
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return [a, b]
        parent[ra] = rb
    return []`,
    tests: [
      { args: [[[1, 2], [1, 3], [2, 3]]], expected: [2, 3] },
      { args: [[[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]], expected: [1, 4], name: 'cycle closes on the 4th edge' },
      { args: [[[1, 2], [2, 3], [1, 3]]], expected: [1, 3] },
      { args: [[[1, 5], [2, 3], [3, 4], [4, 5], [1, 2]]], expected: [1, 2], name: 'two groups merge, then a repeat' },
      { args: [[[1, 2], [2, 3], [3, 1]]], expected: [3, 1], name: 'triangle' },
    ],
    hints: ['Process edges in order. An edge is redundant exactly when both ends already have the same root.', 'Keep a parent dict with find (with path compression). For each [a, b]: if find(a) == find(b) return [a, b], otherwise link the two roots.'],
    combines: ['union-find', 'graph-adj-list'],
  },
};

export default unit;
