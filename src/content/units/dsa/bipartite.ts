import { Recorder } from '@/engine/recorder';
import { edgeKey, graphPanel, layeredLayout, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { adjacency } from '@/content/lib/graph';
import { list } from '@/content/lib/graphs';

const code = `
from collections import deque

def is_bipartite(graph):
    color = {}                                      #@init
    for start in graph:                             #@outer
        if start in color:                          #@skip
            continue
        color[start] = 0                            #@seed
        queue = deque([start])                      #@queue
        while queue:                                #@loop
            node = queue.popleft()                  #@pop
            for nb in graph[node]:                  #@scan
                if nb not in color:                 #@check
                    color[nb] = 1 - color[node]     #@paint
                    queue.append(nb)                #@push
                elif color[nb] == color[node]:      #@clash
                    return False                    #@fail
    return True                                     #@done
`;

interface In {
  edges: EdgeSpec[];
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)$/)!;
    return { from: m[1], to: m[2] };
  });

const SIDE: Tone[] = ['path', 'swap'];
const SIDE_NAME = ['side 0', 'side 1'];

const viz: VizDef<In> = {
  id: 'bipartite',
  title: 'Bipartite check (2-colouring)',
  code,
  language: 'python',
  inputs: [{ key: 'edges', label: 'Edges (undirected)', kind: 'edges', default: E('A-B, A-D, B-C, C-D, B-E'), maxItems: 12 }],
  presets: [
    { label: 'Even cycle + tail', input: { edges: E('A-B, A-D, B-C, C-D, B-E') } },
    { label: 'Odd cycle (triangle)', input: { edges: E('A-B, B-C, C-A') } },
    { label: 'Odd cycle later', input: { edges: E('A-B, B-C, C-D, D-E, E-F, F-C') } },
    { label: 'Two components', input: { edges: E('A-B, C-D, D-E') } },
  ],
  run({ edges }) {
    if (!edges.length) throw new Error('Add at least one edge, like A-B');
    if (edges.some((e) => e.from === e.to)) throw new Error('A self-loop (like A-A) can never be 2-coloured, and cannot be drawn here');
    const r = new Recorder(code);
    const { ids, adj } = adjacency(edges);
    const pos = layeredLayout(ids, edges, 460, 280);
    const color: Record<string, number> = {};
    const queue: string[] = [];
    let bad: [string, string] | null = null;

    const view = (cur?: string, nb?: string, edgeTone?: Tone): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        if (id in color) {
          tones[id] = SIDE[color[id]];
          badges[id] = SIDE_NAME[color[id]];
        } else tones[id] = 'default';
      }
      if (cur) tones[cur] = bad ? 'error' : 'active';
      if (nb) tones[nb] = bad ? 'error' : nb in color ? tones[nb] : 'compare';
      const edgeTones: Record<string, Tone> = {};
      if (cur && nb) edgeTones[edgeKey(cur, nb, false)] = bad ? 'error' : edgeTone ?? 'compare';
      const side = (k: number) => Object.keys(color).filter((id) => color[id] === k).sort();
      return [
        graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph  (two colours = two sides)' }, { width: 460, height: 280 }),
        { type: 'list', title: 'Queue', orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: 'empty', items: queue.map((q) => ({ id: q, label: q, tone: 'frontier' as Tone })) },
        { type: 'kv', title: 'Sides so far', entries: [{ k: 'side 0', v: side(0).join(', ') || '—', tone: 'path' }, { k: 'side 1', v: side(1).join(', ') || '—', tone: 'swap' }] },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ colored: list(Object.keys(color).sort()), ...extra });

    r.step('init', 'No node has a colour yet — try to split the nodes into 2 sides', view(), vars());
    for (const start of ids) {
      if (start in color) {
        r.step('skip', `${start} was already coloured by an earlier search → skip`, view(start), vars({ start }));
        continue;
      }
      r.step('outer', `${start} is uncoloured: start a new component here`, view(start), vars({ start }));
      color[start] = 0;
      r.step('seed', `Give ${start} side 0 (any choice works for a new component)`, view(start), vars({ start }));
      queue.length = 0;
      queue.push(start);
      while (queue.length) {
        r.op();
        const node = queue.shift()!;
        r.step('pop', `Dequeue ${node} (${SIDE_NAME[color[node]]}); every neighbour must be on the other side`, view(node), vars({ node }));
        for (const nb of adj[node]) {
          r.op();
          if (!(nb in color)) {
            color[nb] = 1 - color[node];
            queue.push(nb);
            r.step('paint', `${nb} is new → ${SIDE_NAME[color[nb]]} (opposite of ${node})`, view(node, nb, 'active'), vars({ node, nb }));
          } else if (color[nb] === color[node]) {
            bad = [node, nb];
            r.step('clash', `${node} and ${nb} are neighbours but both ${SIDE_NAME[color[node]]} → conflict`, view(node, nb), vars({ node, nb }));
            r.step('fail', `Edge ${node}–${nb} sits inside one side → not bipartite`, view(node, nb), vars({ result: false }));
            return { frames: r.frames, result: false };
          } else {
            r.step('clash', `${nb} already has the opposite side → edge ${node}–${nb} is fine`, view(node, nb, 'visited'), vars({ node, nb }));
          }
        }
      }
    }
    r.step('done', 'Every edge joins two different sides → bipartite', view(), vars({ result: true }));
    return { frames: r.frames, result: true };
  },
  reference({ edges }) {
    const { ids, adj } = adjacency(edges);
    const col = new Map<string, number>();
    for (const s of ids) {
      if (col.has(s)) continue;
      col.set(s, 0);
      const st = [s];
      while (st.length) {
        const u = st.pop()!;
        for (const v of adj[u]) {
          if (!col.has(v)) {
            col.set(v, 1 - col.get(u)!);
            st.push(v);
          } else if (col.get(v) === col.get(u)) return false;
        }
      }
    }
    return true;
  },
};

const tests = [
  { args: [{ A: ['B', 'D'], B: ['A', 'C'], C: ['B', 'D'], D: ['A', 'C'] }], expected: true, name: 'square (even cycle)' },
  { args: [{ A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] }], expected: false, name: 'triangle (odd cycle)' },
  { args: [{ A: [] }], expected: true, name: 'single node' },
  { args: [{ A: ['B'], B: ['A'], C: ['D', 'E'], D: ['C', 'E'], E: ['C', 'D'] }], expected: false, name: 'odd cycle in the second component' },
  { args: [{ A: ['B'], B: ['A', 'C'], C: ['B'], D: ['E'], E: ['D'] }], expected: true, name: 'two separate paths' },
  { args: [{ 1: ['2', '5'], 2: ['1', '3'], 3: ['2', '4'], 4: ['3', '5'], 5: ['4', '1'] }], expected: false, name: 'pentagon' },
];

const unit: Unit = {
  id: 'bipartite',
  hook: '"Can we split these people into two teams so no enemies share a team?" is 2-colouring a graph. It shows up as bipartition, matching and scheduling questions — and it quietly tests whether you handle disconnected graphs and odd cycles.',
  predict: {
    prompt: 'Which of these graphs can NOT be split into two sides with every edge going between the sides?',
    options: ['A cycle of 4 nodes', 'A cycle of 5 nodes', 'A path of 6 nodes', 'Any tree'],
    answer: 1,
    explain: 'Going around a cycle the sides must alternate. After an odd number of nodes you land back on the same side you started on — a conflict. A graph is bipartite exactly when it has no odd cycle.',
  },
  viz,
  deeper: {
    points: [
      'Colour a start node 0, then colour every neighbour with the opposite colour; BFS (or DFS) propagates the rule outward.',
      'Meeting an already-coloured neighbour is fine if its colour differs from yours; the same colour is the conflict that proves an odd cycle.',
      'Run the search from every uncoloured node — each connected component is checked on its own.',
      'The colour dict doubles as the visited set, so no separate seen set is needed.',
      'Bipartite ⇔ no odd cycle ⇔ 2-colourable. Trees and even cycles always pass.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V)' },
    pitfalls: ['Only starting from one node, so a second component with an odd cycle is never checked', 'Resetting the colour of a node that already has one', 'Treating "already coloured" as a conflict instead of comparing colours', 'Forgetting self-loops (always a conflict)'],
  },
  practice: {
    language: 'python',
    fnName: 'is_bipartite',
    statement: '`graph` maps every node to its neighbours (undirected, so both directions are listed). Return True if the nodes can be split into two groups so that every edge connects the two groups.',
    signature: 'def is_bipartite(graph):',
    solution: `from collections import deque

def is_bipartite(graph):
    color = {}
    for start in graph:
        if start in color:
            continue
        color[start] = 0
        queue = @@deque([start])@@
        while queue:
            node = queue.popleft()
            for nb in graph[node]:
                if nb not in color:
                    color[nb] = @@1 - color[node]@@
                    queue.append(nb)
                elif @@color[nb] == color[node]@@:
                    return @@False@@
    return True`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'is_bipartite',
    statement: 'This checker returns False for perfectly good graphs (like two linked nodes). Find and fix the bug.',
    buggy: `from collections import deque

def is_bipartite(graph):
    color = {}
    for start in graph:
        color[start] = 0
        queue = deque([start])
        while queue:
            node = queue.popleft()
            for nb in graph[node]:
                if nb not in color:
                    color[nb] = 1 - color[node]
                    queue.append(nb)
                elif color[nb] == color[node]:
                    return False
    return True`,
    fixed: `from collections import deque

def is_bipartite(graph):
    color = {}
    for start in graph:
        if start in color:
            continue
        color[start] = 0
        queue = deque([start])
        while queue:
            node = queue.popleft()
            for nb in graph[node]:
                if nb not in color:
                    color[nb] = 1 - color[node]
                    queue.append(nb)
                elif color[nb] == color[node]:
                    return False
    return True`,
    tests,
    bugType: 'reseeding an already-coloured node',
    hint: 'In the graph A–B, the outer loop reaches B after A has already coloured it. What colour does B get now?',
    explanation: 'The outer loop restarted a search from nodes that were already coloured and overwrote their colour with 0, which clashes with neighbours that kept the old colour. Skip starts that already have a colour.',
  },
  boss: {
    title: 'Split into two teams',
    statement: 'People are numbered 1..n. Each pair [a, b] in `dislikes` means a and b cannot be on the same team. Return True if everyone can be assigned to one of two teams so that no disliked pair shares a team, otherwise False.',
    language: 'python',
    fnName: 'can_split',
    starter: `def can_split(n, dislikes):
    # your code here
    pass
`,
    solution: `from collections import deque

def can_split(n, dislikes):
    graph = {i: [] for i in range(1, n + 1)}
    for a, b in dislikes:
        graph[a].append(b)
        graph[b].append(a)
    team = {}
    for start in graph:
        if start in team:
            continue
        team[start] = 0
        queue = deque([start])
        while queue:
            cur = queue.popleft()
            for nb in graph[cur]:
                if nb not in team:
                    team[nb] = 1 - team[cur]
                    queue.append(nb)
                elif team[nb] == team[cur]:
                    return False
    return True`,
    tests: [
      { args: [4, [[1, 2], [1, 3], [2, 4]]], expected: true },
      { args: [3, [[1, 2], [1, 3], [2, 3]]], expected: false, name: 'three mutual enemies' },
      { args: [5, [[1, 2], [2, 3], [3, 4], [4, 5], [1, 5]]], expected: false, name: 'ring of five' },
      { args: [1, []], expected: true, name: 'one person' },
      { args: [4, [[1, 2], [3, 4]]], expected: true, name: 'separate pairs' },
      { args: [6, [[1, 2], [3, 4], [4, 5], [5, 3]]], expected: false, name: 'trouble in a second group' },
    ],
    hints: ['Dislike pairs are undirected edges. Two teams = two colours; "can split" means the graph is bipartite.', 'Build an adjacency dict for 1..n (people with no dislikes still need a key), then BFS-colour from every uncoloured person and return False on a same-colour edge.'],
    combines: ['bipartite', 'bfs', 'graph-adj-list'],
  },
};

export default unit;
