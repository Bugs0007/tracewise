import { Recorder } from '@/engine/recorder';
import { graphPanel, layeredLayout, edgeKey, type EdgeSpec } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { adjacency } from '@/content/lib/graph';

const code = `
from collections import deque

def bfs(graph, start):
    visited = {start}                #@init
    queue = deque([start])           #@queue
    order = []
    while queue:                     #@loop
        node = queue.popleft()       #@pop
        order.append(node)           #@visit
        for nb in graph[node]:       #@scan
            if nb not in visited:    #@check
                visited.add(nb)      #@mark
                queue.append(nb)     #@push
    return order                     #@done
`;

interface In {
  edges: EdgeSpec[];
  start: string;
}

const viz: VizDef<In> = {
  id: 'bfs',
  title: 'Breadth-first search',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Edges (undirected)', kind: 'edges', default: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'B', to: 'E' }, { from: 'C', to: 'F' }, { from: 'E', to: 'F' }, { from: 'F', to: 'G' }], maxItems: 24 },
    { key: 'start', label: 'Start', kind: 'string', default: 'A', maxItems: 3 },
  ],
  presets: [
    { label: 'Tree-like', input: { edges: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'B', to: 'E' }, { from: 'C', to: 'F' }, { from: 'C', to: 'G' }], start: 'A' } },
    { label: 'Diamond', input: { edges: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'D' }], start: 'A' } },
    { label: 'Disconnected', input: { edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'X', to: 'Y' }], start: 'A' } },
  ],
  run({ edges, start }) {
    const r = new Recorder(code);
    const { ids, adj } = adjacency(edges);
    if (!ids.includes(start)) throw new Error(`Start node "${start}" is not in the graph`);
    const pos = layeredLayout([start, ...ids.filter((i) => i !== start)], edges);
    const visited = new Set<string>([start]);
    const done = new Set<string>();
    const dist: Record<string, number> = { [start]: 0 };
    const queue: string[] = [start];
    const order: string[] = [];
    const panels = (cur?: string, nb?: string, edgeHot?: [string, string], edgeTone: Tone = 'active') => {
      const tones: Record<string, Tone> = {};
      for (const id of ids) tones[id] = done.has(id) ? 'done' : visited.has(id) ? 'frontier' : 'default';
      if (cur) tones[cur] = 'active';
      if (nb && !visited.has(nb)) tones[nb] = 'compare';
      const edgeTones: Record<string, Tone> = {};
      if (edgeHot) edgeTones[edgeKey(edgeHot[0], edgeHot[1], false)] = edgeTone;
      const badges: Record<string, string> = {};
      for (const [k, d] of Object.entries(dist)) badges[k] = `d=${d}`;
      return [
        graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph' }),
        { type: 'list' as const, title: 'Queue', orientation: 'horizontal' as const, items: queue.map((q) => ({ id: q, label: q, tone: 'frontier' as Tone })), startLabel: 'front', endLabel: 'back', emptyText: 'empty' },
        { type: 'array' as const, title: 'Visit order', values: order, hideIndex: true },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ queue: `[${queue.join(', ')}]`, visited: `{${[...visited].join(', ')}}`, ...extra });

    r.step('init', `Mark the start node ${start} as visited`, panels(start), vars());
    r.step('queue', `Put ${start} in the queue`, panels(start), vars());
    while (true) {
      r.op();
      if (!queue.length) {
        r.step('loop', 'Queue is empty — every reachable node was visited', panels(), vars());
        r.step('done', `BFS order: ${order.join(' → ')}`, panels(), vars({ order: order.join(',') }));
        return { frames: r.frames, result: order };
      }
      const node = queue.shift()!;
      r.step('pop', `Dequeue ${node} (front of the queue)`, panels(node), vars({ node }));
      order.push(node);
      r.step('visit', `Visit ${node} — distance ${dist[node]} from ${start}`, panels(node), vars({ node }));
      for (const nb of adj[node]) {
        r.op();
        if (visited.has(nb)) {
          r.step('check', `${nb} already visited — skip`, panels(node, nb, [node, nb], 'muted'), vars({ node, nb }));
          continue;
        }
        visited.add(nb);
        dist[nb] = dist[node] + 1;
        r.step('mark', `${nb} is new: mark visited now (so nobody enqueues it twice)`, panels(node, nb, [node, nb]), vars({ node, nb }));
        queue.push(nb);
        r.step('push', `Enqueue ${nb} at distance ${dist[nb]}`, panels(node, nb, [node, nb]), vars({ node, nb }));
      }
      done.add(node);
    }
  },
  reference({ edges, start }) {
    const { adj } = adjacency(edges);
    const seen = new Set([start]);
    const q = [start];
    const out: string[] = [];
    while (q.length) {
      const n = q.shift()!;
      out.push(n);
      for (const v of adj[n])
        if (!seen.has(v)) {
          seen.add(v);
          q.push(v);
        }
    }
    return out;
  },
};

const g1 = { A: ['B', 'C'], B: ['A', 'D', 'E'], C: ['A', 'F'], D: ['B'], E: ['B', 'F'], F: ['C', 'E'] };
const diamond = { A: ['B', 'C'], B: ['D'], C: ['D'], D: [] };
const tests = [
  { args: [g1, 'A'], expected: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { args: [diamond, 'A'], expected: ['A', 'B', 'C', 'D'], name: 'diamond (shared child)' },
  { args: [{ A: ['B'], B: ['A'], C: [] }, 'A'], expected: ['A', 'B'], name: 'unreachable node' },
  { args: [{ X: [] }, 'X'], expected: ['X'], name: 'single node' },
  { args: [{ 1: ['2', '3'], 2: ['4'], 3: ['4'], 4: ['1'] }, '1'], expected: ['1', '2', '3', '4'], name: 'cycle' },
];

const unit: Unit = {
  id: 'bfs',
  hook: 'BFS explores in rings: everything 1 step away, then 2, then 3. That is why it finds shortest paths in unweighted graphs — the backbone of grid, word-ladder and "minimum steps" questions.',
  predict: {
    prompt: 'Neighbours are visited alphabetically. Edges: A–B, A–C, B–D, C–E. Starting BFS at A, which node is visited **4th**?',
    options: ['D', 'E', 'C', 'B'],
    answer: 0,
    explain: 'Order is A, then its neighbours B, C, then B\'s neighbour D, then E. D is 4th.',
  },
  viz,
  deeper: {
    points: [
      'A queue (FIFO) is what makes it breadth-first: nodes leave in the order they were discovered, which is by distance.',
      'Mark a node visited when you **enqueue** it, not when you dequeue it — otherwise the same node can be queued many times.',
      'Distance of a neighbour = distance of the current node + 1; the first time BFS reaches a node is via a shortest path.',
      'Use `collections.deque`; `list.pop(0)` is O(n) per pop.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V)' },
    pitfalls: ['Marking visited on dequeue (duplicates, blow-ups on dense graphs)', 'Using a stack by accident (that is DFS)', 'Forgetting disconnected components when the question asks for all nodes'],
  },
  practice: {
    language: 'python',
    fnName: 'bfs_order',
    statement: '`graph` maps each node to a list of neighbours. Return the nodes in the order BFS visits them from `start`, exploring neighbours in list order.',
    signature: 'def bfs_order(graph, start):',
    solution: `from collections import deque

def bfs_order(graph, start):
    visited = @@{start}@@
    queue = @@deque([start])@@
    order = []
    while @@queue@@:
        node = @@queue.popleft()@@
        order.append(node)
        for nb in graph[node]:
            if @@nb not in visited@@:
                visited.add(nb)
                @@queue.append(nb)@@
    return order`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'bfs_order',
    statement: 'This BFS returns duplicates on some graphs. Find and fix it.',
    buggy: `from collections import deque

def bfs_order(graph, start):
    visited = set()
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        visited.add(node)
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                queue.append(nb)
    return order`,
    fixed: `from collections import deque

def bfs_order(graph, start):
    visited = {start}
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)
    return order`,
    tests,
    bugType: 'visited marked too late',
    hint: 'In the diamond graph, D is a neighbour of both B and C. When is D marked visited?',
    explanation: 'Nodes were marked visited only when dequeued, so D was enqueued by both B and C before either copy was processed. Mark visited at enqueue time.',
  },
  boss: {
    title: 'Fewest hops',
    statement: 'Given an undirected graph as an adjacency dict, return the minimum number of edges on a path from `src` to `dst`, or -1 if `dst` is unreachable.',
    language: 'python',
    fnName: 'shortest_path',
    starter: `def shortest_path(graph, src, dst):
    # your code here
    pass
`,
    solution: `from collections import deque

def shortest_path(graph, src, dst):
    if src == dst:
        return 0
    dist = {src: 0}
    queue = deque([src])
    while queue:
        node = queue.popleft()
        for nb in graph[node]:
            if nb not in dist:
                dist[nb] = dist[node] + 1
                if nb == dst:
                    return dist[nb]
                queue.append(nb)
    return -1`,
    tests: [
      { args: [g1, 'A', 'F'], expected: 2 },
      { args: [g1, 'D', 'F'], expected: 3 },
      { args: [g1, 'A', 'A'], expected: 0, name: 'same node' },
      { args: [{ A: ['B'], B: ['A'], C: [] }, 'A', 'C'], expected: -1, name: 'unreachable' },
      { args: [{ a: ['b', 'c'], b: ['a', 'd'], c: ['a', 'd'], d: ['b', 'c', 'e'], e: ['d'] }, 'a', 'e'], expected: 3 },
    ],
    hints: ['BFS reaches nodes in order of distance. Track the distance of each node as you discover it.', 'Keep a dict `dist`; when you enqueue a neighbour set `dist[nb] = dist[node] + 1`. Return it the moment you discover `dst`.'],
    combines: ['bfs', 'queue-basics'],
  },
};

export default unit;
