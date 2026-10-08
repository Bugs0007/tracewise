import { Recorder } from '@/engine/recorder';
import { graphPanel, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { dagLayout, nodeIds, outAdj } from '@/content/lib/graphs';

const code = `
WHITE, GRAY, BLACK = 0, 1, 2

def has_cycle(graph):
    color = {node: WHITE for node in graph}          #@init

    def dfs(node):
        color[node] = GRAY                           #@gray
        for nb in graph[node]:                       #@scan
            if color[nb] == GRAY:                    #@backEdge
                return True                          #@cycle
            if color[nb] == WHITE and dfs(nb):       #@recurse
                return True                          #@propagate
        color[node] = BLACK                          #@black
        return False                                 #@ret

    for node in graph:                               #@outer
        if color[node] == WHITE and dfs(node):       #@start
            return True
    return False                                     #@none
`;

interface In {
  edges: EdgeSpec[];
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)$/)!;
    return { from: m[1], to: m[2] };
  });

const viz: VizDef<In> = {
  id: 'cycle-detection',
  title: 'Cycle detection (white / gray / black)',
  code,
  language: 'python',
  inputs: [{ key: 'edges', label: 'Directed edges (A-B means A → B)', kind: 'edges', default: E('A-B, A-C, B-D, C-D, D-E, E-F, F-C'), maxItems: 10 }],
  presets: [
    { label: 'Hidden cycle', input: { edges: E('A-B, A-C, B-D, C-D, D-E, E-F, F-C') } },
    { label: 'Diamond (no cycle)', input: { edges: E('A-B, A-C, B-D, C-D') } },
    { label: 'Triangle', input: { edges: E('A-B, B-C, C-A') } },
    { label: 'Cycle in 2nd component', input: { edges: E('A-B, C-D, D-E, E-C') } },
  ],
  run({ edges }) {
    if (!edges.length) throw new Error('Add at least one directed edge, like A-B');
    if (edges.some((e) => e.from === e.to)) throw new Error('Self-loops (like A-A) are always cycles and cannot be drawn; use at least two nodes');
    const r = new Recorder(code);
    const ids = nodeIds(edges);
    const adj = outAdj(ids, edges);
    const pos = dagLayout(ids, edges, 460, 270);
    const color: Record<string, 0 | 1 | 2> = {};
    for (const id of ids) color[id] = 0;
    const NAME = ['white', 'gray', 'black'];
    const stack: string[] = [];
    const edgeTone: Record<string, Tone> = {};
    let cycleNodes: string[] = [];

    const view = (cur?: string, nb?: string): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        tones[id] = color[id] === 2 ? 'done' : color[id] === 1 ? 'frontier' : 'default';
        if (color[id] > 0) badges[id] = NAME[color[id]];
      }
      for (const c of cycleNodes) tones[c] = 'error';
      if (cur && !cycleNodes.length) tones[cur] = 'active';
      if (nb && !cycleNodes.length) tones[nb] = color[nb] === 0 ? 'compare' : tones[nb];
      const g = graphPanel(ids, edges, pos, true, { tones, badges, title: 'Directed graph  (white = new, gray = on the current path, black = finished)' }, { width: 460, height: 270 });
      const has = new Set(edges.map((e) => `${e.from}>${e.to}`));
      for (const e of g.edges) {
        e.tone = edgeTone[`${e.from}>${e.to}`];
        if (has.has(`${e.to}>${e.from}`)) e.curve = 26;
      }
      return [
        g,
        { type: 'list', title: 'DFS path (gray nodes)', orientation: 'horizontal', startLabel: 'start', endLabel: 'now', emptyText: 'not inside a DFS', items: stack.map((s, i) => ({ id: `${i}:${s}`, label: s, tone: (cycleNodes.includes(s) ? 'error' : i === stack.length - 1 ? 'active' : 'frontier') as Tone })) },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ path: stack.join('→') || '—', ...extra });

    r.step('init', `Colour every node white (${ids.length} nodes, none visited)`, view(), vars());
    const dfs = (node: string): boolean => {
      color[node] = 1;
      stack.push(node);
      r.step('gray', `Enter ${node}: paint it gray (it is on the current path)`, view(node), vars({ node }));
      for (const nb of adj[node]) {
        r.op();
        if (color[nb] === 1) {
          const start = stack.indexOf(nb);
          cycleNodes = stack.slice(start);
          edgeTone[`${node}>${nb}`] = 'error';
          for (let i = start; i < stack.length - 1; i++) edgeTone[`${stack[i]}>${stack[i + 1]}`] = 'error';
          r.step('backEdge', `${nb} is gray → back edge ${node}→${nb} closes a cycle`, view(node, nb), vars({ node, nb, color: 'gray' }));
          r.step('cycle', `Cycle: ${[...cycleNodes, nb].join(' → ')}`, view(node, nb), vars({ result: true }));
          return true;
        }
        if (color[nb] === 2) {
          edgeTone[`${node}>${nb}`] = 'muted';
          r.step('recurse', `${nb} is black (already finished) → no cycle through ${node}→${nb}`, view(node, nb), vars({ node, nb, color: 'black' }));
          continue;
        }
        edgeTone[`${node}>${nb}`] = 'active';
        r.step('recurse', `${nb} is white → explore it from ${node}`, view(node, nb), vars({ node, nb, color: 'white' }));
        if (dfs(nb)) return true;
        edgeTone[`${node}>${nb}`] = 'visited';
      }
      color[node] = 2;
      stack.pop();
      r.step('black', `${node}: all neighbours handled → paint it black, pop the path`, view(node), vars({ node }));
      return false;
    };
    for (const node of ids) {
      if (color[node] !== 0) continue;
      r.step('outer', `Start a fresh DFS at ${node} (still white)`, view(node), vars({ node }));
      if (dfs(node)) return { frames: r.frames, result: true };
    }
    r.step('none', 'Every node is black and no back edge was seen → no cycle', view(), vars({ result: false }));
    return { frames: r.frames, result: false };
  },
  reference({ edges }) {
    const ids = nodeIds(edges);
    const adj = outAdj(ids, edges);
    const indeg: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 0]));
    for (const id of ids) for (const v of adj[id]) indeg[v]++;
    const q = ids.filter((i) => indeg[i] === 0);
    let seen = 0;
    while (q.length) {
      const u = q.pop()!;
      seen++;
      for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);
    }
    return seen < ids.length;
  },
};

const tests = [
  { args: [{ A: ['B'], B: ['C'], C: [] }], expected: false, name: 'chain' },
  { args: [{ A: ['B'], B: ['C'], C: ['A'] }], expected: true, name: 'triangle' },
  { args: [{ A: ['B', 'C'], B: ['D'], C: ['D'], D: [] }], expected: false, name: 'diamond: D reached twice, still no cycle' },
  { args: [{ A: ['A'] }], expected: true, name: 'self-loop' },
  { args: [{ A: [] }], expected: false, name: 'single node' },
  { args: [{ A: ['B'], B: [], C: ['D'], D: ['C'] }], expected: true, name: 'cycle in a later component' },
];

const unit: Unit = {
  id: 'cycle-detection',
  hook: 'Does this dependency graph have a loop? That one question hides inside build systems, course schedules and deadlock detection. Interviewers want to see whether you know the difference between "seen before" and "on my current path".',
  predict: {
    prompt: 'Directed edges: A→B, A→C, B→D, C→D. DFS goes A → B → D, backs up, then goes A → C and reaches D again. Is there a cycle?',
    options: ['Yes — D was visited twice', 'No — D is finished (black), not on the current path', 'Yes — A has two outgoing edges', 'It depends on the visiting order'],
    answer: 1,
    explain: 'A cycle needs an edge back to a node that is still on the current DFS path (gray). D was already completely explored (black), so reaching it again through C is just a second route, not a loop.',
  },
  viz,
  deeper: {
    points: [
      'Three colours, three meanings: white = untouched, gray = on the current recursion path, black = fully explored.',
      'A cycle exists exactly when DFS meets a gray node. Meeting a black node is harmless (a forward or cross edge).',
      'A plain visited set is enough for undirected graphs (ignoring the parent) but gives false positives on directed graphs — the diamond is the standard counterexample.',
      'Start a DFS from every white node, not just one, so cycles in other components are found.',
      'Alternative: Kahn\'s algorithm. If you cannot remove every node by repeatedly deleting in-degree-0 nodes, a cycle is left.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V)' },
    pitfalls: ['Using a single visited set on a directed graph (diamond false positive)', 'Painting a node black before its neighbours are explored', 'Never starting from nodes that are not reachable from the first one', 'Forgetting self-loops (a node pointing at itself is a cycle)'],
  },
  practice: {
    language: 'python',
    fnName: 'has_cycle',
    statement: '`graph` maps every node to the list of nodes it points to (directed). Return True if the graph contains a cycle, otherwise False.',
    signature: 'def has_cycle(graph):',
    solution: `def has_cycle(graph):
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph}

    def dfs(node):
        color[node] = @@GRAY@@
        for nb in graph[node]:
            if @@color[nb] == GRAY@@:
                return True
            if color[nb] == WHITE and @@dfs(nb)@@:
                return True
        color[node] = @@BLACK@@
        return False

    for node in graph:
        if @@color[node] == WHITE@@ and dfs(node):
            return True
    return False`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'has_cycle',
    statement: 'This detector says "no cycle" for graphs that clearly loop. Find and fix the bug.',
    buggy: `def has_cycle(graph):
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph}

    def dfs(node):
        color[node] = BLACK
        for nb in graph[node]:
            if color[nb] == GRAY:
                return True
            if color[nb] == WHITE and dfs(nb):
                return True
        color[node] = BLACK
        return False

    for node in graph:
        if color[node] == WHITE and dfs(node):
            return True
    return False`,
    fixed: `def has_cycle(graph):
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph}

    def dfs(node):
        color[node] = GRAY
        for nb in graph[node]:
            if color[nb] == GRAY:
                return True
            if color[nb] == WHITE and dfs(nb):
                return True
        color[node] = BLACK
        return False

    for node in graph:
        if color[node] == WHITE and dfs(node):
            return True
    return False`,
    tests,
    bugType: 'marked black too early',
    hint: 'On the triangle A→B→C→A, what colour does A have when C looks at it?',
    explanation: 'The node was painted black as soon as it was entered, so no node was ever gray and the "back edge to a gray node" test could never fire. Gray must mean "still being explored"; black only after the loop over neighbours.',
  },
  boss: {
    title: 'Can you finish every course?',
    statement: 'There are `n` courses numbered 0..n-1. Each pair [a, b] in `prerequisites` means you must take course b before course a. Return True if it is possible to take all courses, otherwise False.',
    language: 'python',
    fnName: 'can_finish',
    starter: `def can_finish(n, prerequisites):
    # your code here
    pass
`,
    solution: `def can_finish(n, prerequisites):
    graph = [[] for _ in range(n)]
    for a, b in prerequisites:
        graph[b].append(a)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n

    def has_cycle(node):
        color[node] = GRAY
        for nb in graph[node]:
            if color[nb] == GRAY:
                return True
            if color[nb] == WHITE and has_cycle(nb):
                return True
        color[node] = BLACK
        return False

    for course in range(n):
        if color[course] == WHITE and has_cycle(course):
            return False
    return True`,
    tests: [
      { args: [2, [[1, 0]]], expected: true },
      { args: [2, [[1, 0], [0, 1]]], expected: false, name: 'two courses need each other' },
      { args: [4, [[1, 0], [2, 1], [3, 2]]], expected: true, name: 'a straight chain' },
      { args: [3, [[1, 0], [2, 1], [0, 2]]], expected: false, name: 'a ring of three' },
      { args: [1, []], expected: true, name: 'no prerequisites' },
      { args: [5, [[1, 0], [3, 2], [4, 3], [2, 4]]], expected: false, name: 'loop in a separate group' },
    ],
    hints: ['A prerequisite [a, b] is an edge b → a. You can finish everything exactly when this directed graph has no cycle.', 'Run the white/gray/black DFS from every white course. If a neighbour is gray you found a loop, so return False.'],
    combines: ['cycle-detection', 'dfs', 'graph-adj-list'],
  },
};

export default unit;
