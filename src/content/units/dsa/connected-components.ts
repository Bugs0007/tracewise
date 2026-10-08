import { Recorder } from '@/engine/recorder';
import { graphPanel, layeredLayout, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { adjacency } from '@/content/lib/graph';
import { list, nodeIds, setStr } from '@/content/lib/graphs';

const code = `
def count_components(graph):
    seen = set()                           #@init
    count = 0
    for start in graph:                    #@outer
        if start in seen:                  #@skip
            continue
        count += 1                         #@new
        seen.add(start)                    #@mark0
        stack = [start]
        while stack:                       #@loop
            node = stack.pop()             #@pop
            for nb in graph[node]:         #@scan
                if nb not in seen:         #@check
                    seen.add(nb)           #@mark
                    stack.append(nb)       #@push
    return count                           #@done
`;

interface In {
  edges: EdgeSpec[];
  isolated: string[];
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

/** One colour (tone) per component; cycles through the palette. */
const PALETTE: Tone[] = ['found', 'compare', 'swap', 'frontier', 'path', 'new', 'visited'];

/** Place each component in its own box so groups are visibly separate. */
function clusterLayout(comps: string[][], edges: EdgeSpec[]): { pos: Record<string, { x: number; y: number }>; width: number; height: number } {
  const cols = Math.min(3, Math.max(1, comps.length));
  const rowsN = Math.ceil(comps.length / cols);
  const bw = 150;
  const bh = 120;
  const pos: Record<string, { x: number; y: number }> = {};
  comps.forEach((c, k) => {
    const ox = (k % cols) * bw;
    const oy = Math.floor(k / cols) * bh;
    const inner = layeredLayout(c, edges.filter((e) => c.includes(e.from) && c.includes(e.to)), bw - 30, bh - 30);
    for (const id of c) pos[id] = { x: ox + 15 + inner[id].x, y: oy + 15 + inner[id].y };
  });
  return { pos, width: cols * bw, height: rowsN * bh };
}

const viz: VizDef<In> = {
  id: 'connected-components',
  title: 'Connected components',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Edges (undirected)', kind: 'edges', default: E('A-B, B-C, A-C, D-E, F-G'), maxItems: 12 },
    { key: 'isolated', label: 'Extra nodes with no edges', kind: 'strings', default: ['H'], maxItems: 4 },
  ],
  presets: [
    { label: 'Four groups', input: { edges: E('A-B, B-C, A-C, D-E, F-G'), isolated: ['H'] } },
    { label: 'One big group', input: { edges: E('A-B, B-C, C-D, D-A'), isolated: [] } },
    { label: 'Everyone alone', input: { edges: [], isolated: ['A', 'B', 'C', 'D'] } },
    { label: 'Chain + pair', input: { edges: E('A-B, B-C, C-D, X-Y'), isolated: [] } },
  ],
  run({ edges, isolated }) {
    const ids = nodeIds(edges, isolated);
    if (!ids.length) throw new Error('Add some edges or extra nodes');
    const r = new Recorder(code);
    const { adj } = adjacency(edges);
    for (const id of ids) adj[id] ??= [];
    // lay the picture out by the final grouping (computed silently, the recorded run discovers it for real)
    const preview: string[][] = [];
    {
      const s = new Set<string>();
      for (const id of ids) {
        if (s.has(id)) continue;
        const comp: string[] = [];
        const st = [id];
        s.add(id);
        while (st.length) {
          const u = st.pop()!;
          comp.push(u);
          for (const v of adj[u]) if (!s.has(v)) {
            s.add(v);
            st.push(v);
          }
        }
        preview.push(comp.sort());
      }
    }
    const { pos, width, height } = clusterLayout(preview, edges);

    const seen = new Set<string>();
    const label: Record<string, number> = {};
    let count = 0;
    let stack: string[] = [];

    const view = (cur?: string, nb?: string): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        if (label[id]) {
          tones[id] = PALETTE[(label[id] - 1) % PALETTE.length];
          badges[id] = `group ${label[id]}`;
        } else tones[id] = 'default';
      }
      if (cur) tones[cur] = 'active';
      if (nb) tones[nb] = 'compare';
      const edgeTones: Record<string, Tone> = {};
      for (const e of edges) if (label[e.from] && label[e.from] === label[e.to]) edgeTones[e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`] = 'path';
      return [
        graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph  (each group gets its own colour)' }, { width, height }),
        { type: 'list', title: 'Stack (nodes still to expand)', orientation: 'horizontal', startLabel: 'bottom', endLabel: 'top', emptyText: 'empty', items: stack.map((s, i) => ({ id: `${i}:${s}`, label: s, tone: 'frontier' as Tone })) },
        { type: 'kv', title: 'Result so far', entries: [{ k: 'count', v: count, tone: count ? 'found' : 'default' }, { k: 'seen', v: `${seen.size} of ${ids.length} nodes` }] },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ count, seen: setStr(seen), stack: list(stack), ...extra });

    r.step('init', `${ids.length} nodes, nothing seen yet, count = 0`, view(), vars());
    for (const start of ids) {
      r.op();
      if (seen.has(start)) {
        r.step('skip', `${start} already belongs to group ${label[start]} → skip`, view(start), vars({ start }));
        continue;
      }
      count++;
      r.step('new', `${start} is unseen → a new group! count = ${count}`, view(start), vars({ start }));
      seen.add(start);
      label[start] = count;
      stack = [start];
      r.step('mark0', `Mark ${start}, then flood-fill everything reachable from it`, view(start), vars({ start }));
      while (stack.length) {
        const node = stack.pop()!;
        r.step('pop', `Pop ${node} and look at its ${adj[node].length} neighbour${adj[node].length === 1 ? '' : 's'}`, view(node), vars({ node }));
        for (const nb of adj[node]) {
          r.op();
          if (seen.has(nb)) continue;
          seen.add(nb);
          label[nb] = count;
          stack.push(nb);
          r.step('mark', `${nb} is new → join group ${count} and push it`, view(node, nb), vars({ node, nb }));
        }
      }
      r.step('loop', `Stack empty: group ${count} is complete`, view(), vars());
    }
    r.step('done', `Every node is seen → ${count} connected component${count === 1 ? '' : 's'}`, view(), vars({ result: count }));
    return { frames: r.frames, result: count };
  },
  reference({ edges, isolated }) {
    const ids = nodeIds(edges, isolated);
    const parent: Record<string, string> = Object.fromEntries(ids.map((i) => [i, i]));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    let n = ids.length;
    for (const e of edges) {
      const a = find(e.from);
      const b = find(e.to);
      if (a !== b) {
        parent[a] = b;
        n--;
      }
    }
    return n;
  },
};

const tests = [
  { args: [{ A: ['B'], B: ['A'], C: [] }], expected: 2 },
  { args: [{}], expected: 0, name: 'empty graph' },
  { args: [{ 1: ['2'], 2: ['1', '3'], 3: ['2'], 4: ['5'], 5: ['4'] }], expected: 2, name: 'chain and a pair' },
  { args: [{ a: [], b: [], c: [] }], expected: 3, name: 'all isolated' },
  { args: [{ A: ['B', 'D'], B: ['A', 'C'], C: ['B', 'D'], D: ['C', 'A'] }], expected: 1, name: 'one ring' },
];

const unit: Unit = {
  id: 'connected-components',
  hook: '"How many groups?" is the most common graph question in disguise: provinces, islands, friend circles, networks. The answer is always: loop over nodes, and every time you find an unvisited one, flood-fill its whole group.',
  predict: {
    prompt: 'A graph has 7 nodes and 4 edges, and it has no cycles at all. How many connected components does it have?',
    options: ['2', '3', '4', 'It cannot be determined'],
    answer: 1,
    explain: 'Start with 7 separate nodes. Every edge in a cycle-free graph joins two different groups, so each edge removes exactly one component: 7 − 4 = 3.',
  },
  viz,
  deeper: {
    points: [
      'The outer loop over every node is what handles disconnected graphs. The inner traversal (DFS or BFS, either works) only covers one group.',
      'count increases once per traversal start, never inside the traversal.',
      'Same answer with Union-Find: start with n components and subtract one for every union that actually merges two groups.',
      'Track the group id per node (the badges) when the question asks for sizes, the largest group, or whether two nodes are connected.',
      'Directed graphs need strongly-connected components (Kosaraju/Tarjan) — a different, harder algorithm.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V)' },
    pitfalls: ['Incrementing count before checking whether the start node was already seen', 'Forgetting nodes that have no edges (they are components of size 1)', 'Starting only one traversal', 'Missing the reverse entry for an undirected edge'],
  },
  practice: {
    language: 'python',
    fnName: 'count_groups',
    statement: '`graph` maps every node to a list of neighbours (undirected, so edges appear in both lists). Return the number of connected components.',
    signature: 'def count_groups(graph):',
    solution: `def count_groups(graph):
    seen = set()
    count = 0
    for start in graph:
        if @@start in seen@@:
            continue
        @@count += 1@@
        seen.add(start)
        stack = [start]
        while stack:
            node = @@stack.pop()@@
            for nb in graph[node]:
                if @@nb not in seen@@:
                    seen.add(nb)
                    @@stack.append(nb)@@
    return count`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'count_groups',
    statement: 'The count is far too high whenever a group has more than one node. Find and fix the bug.',
    buggy: `def count_groups(graph):
    seen = set()
    count = 0
    for start in graph:
        count += 1
        if start in seen:
            continue
        seen.add(start)
        stack = [start]
        while stack:
            node = stack.pop()
            for nb in graph[node]:
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
    return count`,
    fixed: `def count_groups(graph):
    seen = set()
    count = 0
    for start in graph:
        if start in seen:
            continue
        count += 1
        seen.add(start)
        stack = [start]
        while stack:
            node = stack.pop()
            for nb in graph[node]:
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
    return count`,
    tests,
    bugType: 'counting before the visited check',
    hint: 'For the graph A–B, the outer loop runs for A and for B. How many times does count change?',
    explanation: 'count was bumped for every node in the outer loop, including nodes that were already swallowed by an earlier flood-fill. Only a node that is still unseen starts a new component, so increment after the skip check.',
  },
  boss: {
    title: 'Friend circles',
    statement: 'There are n people. `knows` is an n × n matrix where knows[i][j] == 1 means person i and person j are directly friends (it is symmetric and knows[i][i] == 1). Friendship is transitive for a "circle": friends of friends are in the same circle. Return the number of circles.',
    language: 'python',
    fnName: 'count_circles',
    starter: `def count_circles(knows):
    # your code here
    pass
`,
    solution: `def count_circles(knows):
    n = len(knows)
    seen = set()
    circles = 0
    for person in range(n):
        if person in seen:
            continue
        circles += 1
        seen.add(person)
        stack = [person]
        while stack:
            cur = stack.pop()
            for other in range(n):
                if knows[cur][other] == 1 and other not in seen:
                    seen.add(other)
                    stack.append(other)
    return circles`,
    tests: [
      { args: [[[1, 1, 0], [1, 1, 0], [0, 0, 1]]], expected: 2 },
      { args: [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]], expected: 3, name: 'no friendships' },
      { args: [[[1, 1, 1], [1, 1, 1], [1, 1, 1]]], expected: 1, name: 'everyone knows everyone' },
      { args: [[[1]]], expected: 1, name: 'one person' },
      { args: [[[1, 1, 0], [1, 1, 1], [0, 1, 1]]], expected: 1, name: 'friends of friends' },
      { args: [[[1, 0, 0, 1], [0, 1, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1]]], expected: 2 },
    ],
    hints: ['Each person is a node; the matrix row tells you the neighbours. Count how many times you have to start a fresh flood-fill.', 'Loop over people; for an unseen one, increment circles and DFS/BFS over every `other` with knows[cur][other] == 1.'],
    combines: ['connected-components', 'graph-adj-matrix', 'dfs'],
  },
};

export default unit;
