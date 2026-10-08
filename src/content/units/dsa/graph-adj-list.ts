import { Recorder } from '@/engine/recorder';
import { circleLayout, edgeKey, graphPanel, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { nodeIds } from '@/content/lib/graphs';

const code = `
def build_graph(edges, directed=False):
    graph = {}                                  #@init
    for u, v, w in edges:                       #@edge
        graph.setdefault(u, [])                 #@ensureU
        graph.setdefault(v, [])                 #@ensureV
        graph[u].append((v, w))                 #@addUV
        if not directed:                        #@undir
            graph[v].append((u, w))             #@addVU
    return graph                                #@done
`;

interface In {
  edges: EdgeSpec[];
  mode: string;
}

type Adj = Record<string, [string, number][]>;

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)(?::(\d+))?$/)!;
    return m[3] ? { from: m[1], to: m[2], w: Number(m[3]) } : { from: m[1], to: m[2] };
  });

const viz: VizDef<In> = {
  id: 'graph-adj-list',
  title: 'Adjacency list',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Edges (A-B or A-B:4 for a weight)', kind: 'edges', default: E('A-B:4, A-C:2, B-D:5, C-D:1, D-E:3'), maxItems: 8 },
    { key: 'mode', label: 'Graph type', kind: 'select', default: 'undirected', options: ['undirected', 'directed'] },
  ],
  presets: [
    { label: 'Weighted', input: { edges: E('A-B:4, A-C:2, B-D:5, C-D:1, D-E:3'), mode: 'undirected' } },
    { label: 'Directed', input: { edges: E('A-B, A-C, B-D, C-D, D-A'), mode: 'directed' } },
    { label: 'Same edges, undirected', input: { edges: E('A-B, A-C, B-D, C-D, D-A'), mode: 'undirected' } },
    { label: 'Single edge', input: { edges: E('A-B'), mode: 'directed' } },
  ],
  run({ edges, mode }) {
    if (!edges.length) throw new Error('Add at least one edge, like A-B');
    const r = new Recorder(code);
    const directed = mode === 'directed';
    const weighted = edges.some((e) => e.w !== undefined);
    const ids = nodeIds(edges);
    const pos = circleLayout(ids, 380, 250);
    const graph: Adj = {};
    const added: EdgeSpec[] = [];
    const wOf = (e: EdgeSpec) => e.w ?? 1;
    const show = (v: string, w: number) => (weighted ? `(${v}, ${w})` : v);

    const view = (cur?: EdgeSpec, hot: { node?: string; kind?: Tone } = {}, entryTones: Record<string, Tone> = {}, doneIdx = -1): Panel[] => {
      const tones: Record<string, Tone> = {};
      for (const id of ids) tones[id] = id in graph ? 'visited' : 'muted';
      if (cur) {
        tones[cur.from] = 'active';
        tones[cur.to] = 'compare';
      }
      const edgeTones: Record<string, Tone> = {};
      if (cur) edgeTones[edgeKey(cur.from, cur.to, directed)] = hot.kind ?? 'active';
      const entries = Object.keys(graph).map((k) => ({ k: `graph[${k}]`, v: `[${graph[k].map(([v, w]) => show(v, w)).join(', ')}]`, tone: entryTones[k] }));
      return [
        graphPanel(ids, added, pos, directed, { tones, edgeTones, title: 'Graph (edges added so far)' }, { width: 380, height: 250 }),
        { type: 'kv', title: weighted ? 'graph  (node → [(neighbour, weight)])' : 'graph  (node → [neighbours], weights = 1)', entries: entries.length ? entries : [{ k: '{}', v: 'empty', tone: 'muted' }] },
        { type: 'array', title: 'Edge list (input)', values: edges.map((e) => `${e.from}${directed ? '→' : '–'}${e.to}${e.w !== undefined ? ':' + e.w : ''}`), hideIndex: true, tones: Object.fromEntries(edges.map((_, i) => [i, i < doneIdx ? 'done' : i === doneIdx ? 'active' : 'default'])) as Record<number, Tone> },
      ];
    };
    const entries = () => Object.values(graph).reduce((s, l) => s + l.length, 0);
    const vars = (extra: Record<string, unknown> = {}) => ({ entries: entries(), ...extra });

    r.step('init', `Start with an empty dict — a ${directed ? 'directed' : 'undirected'} graph, ${weighted ? 'weighted' : 'unweighted'}`, view(), vars());
    for (let i = 0; i < edges.length; i++) {
      const ed = edges[i];
      const { from: u, to: v } = ed;
      const w = wOf(ed);
      r.op();
      added.push(ed);
      r.step('edge', `Edge ${i + 1} of ${edges.length}: ${u}${directed ? ' → ' : ' – '}${v}${weighted ? ` (weight ${w})` : ''}`, view(ed, {}, {}, i), vars({ u, v, w }));
      for (const [node, line] of [[u, 'ensureU'], [v, 'ensureV']] as const) {
        if (!(node in graph)) {
          graph[node] = [];
          r.step(line, `${node} has no list yet → create graph[${node}] = []`, view(ed, {}, { [node]: 'new' }, i), vars({ u, v, w }));
        }
      }
      graph[u].push([v, w]);
      r.step('addUV', `graph[${u}].append(${show(v, w)}) — ${u} can reach ${v}`, view(ed, {}, { [u]: 'swap' }, i), vars({ u, v, w }));
      if (!directed) {
        r.step('undir', `Undirected → ${v} must also know ${u}`, view(ed, {}, { [u]: 'visited' }, i), vars({ u, v, w, directed }));
        graph[v].push([u, w]);
        r.step('addVU', `graph[${v}].append(${show(u, w)}) — the reverse entry`, view(ed, {}, { [v]: 'swap' }, i), vars({ u, v, w }));
      } else {
        r.step('undir', `Directed → one entry only: ${v} does not list ${u}`, view(ed, {}, { [u]: 'visited' }, i), vars({ u, v, w, directed }));
      }
    }
    r.step('done', `Done: ${edges.length} edge${edges.length > 1 ? 's' : ''} stored as ${entries()} list entries`, view(undefined, {}, {}, edges.length), vars());
    const result: Adj = {};
    for (const k of Object.keys(graph)) result[k] = graph[k];
    return { frames: r.frames, result };
  },
  reference({ edges, mode }) {
    const directed = mode === 'directed';
    const m = new Map<string, [string, number][]>();
    const get = (k: string) => {
      if (!m.has(k)) m.set(k, []);
      return m.get(k)!;
    };
    for (const e of edges) {
      get(e.from);
      get(e.to);
    }
    for (const e of edges) {
      get(e.from).push([e.to, e.w ?? 1]);
      if (!directed) get(e.to).push([e.from, e.w ?? 1]);
    }
    return Object.fromEntries(m);
  },
};

const buildTests = [
  { args: [4, [[0, 1], [0, 2], [1, 3]], false], expected: [[1, 2], [0, 3], [0], [1]], name: 'undirected: both directions' },
  { args: [3, [[0, 1], [1, 2]], true], expected: [[1], [2], []], name: 'directed: one direction' },
  { args: [1, [], false], expected: [[]], name: 'single node, no edges' },
  { args: [4, [[2, 3]], false], expected: [[], [], [3], [2]], name: 'isolated nodes keep empty lists' },
  { args: [2, [[0, 1], [1, 0]], true], expected: [[1], [0]], name: 'directed two-cycle' },
];

const unit: Unit = {
  id: 'graph-adj-list',
  hook: 'Almost every graph problem starts with "turn the edge list into something you can walk". The adjacency list is the default answer — fast neighbour lookups and space proportional to the graph you actually have.',
  predict: {
    prompt: 'An **undirected** graph has 6 nodes and 5 edges. You store it as an adjacency list. How many neighbour entries exist in total, summed over all the lists?',
    options: ['5', '6', '10', '11'],
    answer: 2,
    explain: 'Each undirected edge A–B appears twice: B in A\'s list and A in B\'s list. So 5 edges give 2 × 5 = 10 entries. A directed graph would store each edge once.',
  },
  viz,
  deeper: {
    points: [
      'A dict of lists (or list of lists when nodes are 0..n-1) is the standard shape: graph[u] holds everything u points to.',
      'Undirected means two appends per edge; directed means one. Forgetting the second append is the classic "my BFS misses half the graph" bug.',
      'Weighted edges become pairs: graph[u].append((v, w)). Iterate with for v, w in graph[u].',
      'Asking "is there an edge u–v?" costs O(degree of u) — slower than a matrix, but walking all neighbours is as cheap as it gets.',
      'Use setdefault (or defaultdict(list)) so isolated nodes and nodes that only appear as targets still get an entry.',
    ],
    complexity: { time: 'O(V + E) to build; O(deg(u)) to scan a node', space: 'O(V + E)' },
    pitfalls: ['[[]] * n makes n references to the SAME list', 'Missing the reverse edge for undirected graphs', 'Nodes with no outgoing edge have no key, then graph[node] raises KeyError'],
  },
  practice: {
    language: 'python',
    fnName: 'build_graph',
    statement: 'Nodes are numbered 0..n-1 and `edges` is a list of [u, v] pairs. Return the adjacency list as a list of lists (neighbours in the order the edges appear). If `directed` is false, every edge goes both ways.',
    signature: 'def build_graph(n, edges, directed):',
    solution: `def build_graph(n, edges, directed):
    graph = @@[[] for _ in range(n)]@@
    for u, v in edges:
        graph[u].append(v)
        if @@not directed@@:
            @@graph[v].append(u)@@
    return graph`,
    tests: buildTests,
  },
  debug: {
    language: 'python',
    fnName: 'build_graph',
    statement: 'Every node ends up with the same neighbour list. Find and fix the bug.',
    buggy: `def build_graph(n, edges, directed):
    graph = [[]] * n
    for u, v in edges:
        graph[u].append(v)
        if not directed:
            graph[v].append(u)
    return graph`,
    fixed: `def build_graph(n, edges, directed):
    graph = [[] for _ in range(n)]
    for u, v in edges:
        graph[u].append(v)
        if not directed:
            graph[v].append(u)
    return graph`,
    tests: buildTests,
    bugType: 'shared mutable default (aliased lists)',
    hint: '[[]] * n copies a reference. After graph[0].append(1), what does graph[3] look like?',
    explanation: '[[]] * n creates n references to ONE list, so every append lands in all of them. A list comprehension creates a fresh list per node.',
  },
  boss: {
    title: 'Is there a route?',
    statement: 'There are `n` towns numbered 0..n-1 and two-way roads given as [a, b] pairs. Return True if you can travel from `source` to `destination` using the roads (a town can always reach itself), otherwise False.',
    language: 'python',
    fnName: 'valid_path',
    starter: `def valid_path(n, edges, source, destination):
    # your code here
    pass
`,
    solution: `def valid_path(n, edges, source, destination):
    graph = [[] for _ in range(n)]
    for a, b in edges:
        graph[a].append(b)
        graph[b].append(a)
    seen = {source}
    stack = [source]
    while stack:
        node = stack.pop()
        if node == destination:
            return True
        for nb in graph[node]:
            if nb not in seen:
                seen.add(nb)
                stack.append(nb)
    return False`,
    tests: [
      { args: [3, [[0, 1], [1, 2], [2, 0]], 0, 2], expected: true },
      { args: [6, [[0, 1], [0, 2], [3, 5], [5, 4], [4, 3]], 0, 5], expected: false, name: 'two separate groups' },
      { args: [1, [], 0, 0], expected: true, name: 'already there' },
      { args: [4, [[0, 1], [2, 3]], 1, 0], expected: true, name: 'two-way roads' },
      { args: [5, [[0, 1], [1, 2], [2, 3], [3, 4]], 0, 4], expected: true, name: 'long chain' },
    ],
    hints: ['Build the adjacency list first (both directions), then search from `source` and watch for `destination`.', 'Keep a `seen` set so cycles do not loop forever; a stack or a queue both work. Return True as soon as you pop `destination`.'],
    combines: ['graph-adj-list', 'bfs', 'hash-set'],
  },
};

export default unit;
