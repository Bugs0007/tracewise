import { Recorder } from '@/engine/recorder';
import { graphPanel, edgeKey, type EdgeSpec } from '@/engine/layout';
import type { ListPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { e } from '@/content/lib/graph';
import { MinHeap, cmpStr, prepareGraph, queueItems } from '@/content/lib/paths-mst';

const code = `
import heapq

def prim(graph, start):
    visited = {start}                                    #@init
    heap = [(w, start, v) for v, w in graph[start]]      #@seed
    heapq.heapify(heap)
    total = 0
    while heap:                                          #@loop
        w, u, v = heapq.heappop(heap)                    #@pop
        if v in visited:                                 #@check
            continue                                     #@reject
        visited.add(v)                                   #@add
        total += w                                       #@take
        for x, wx in graph[v]:                           #@push
            if x not in visited:
                heapq.heappush(heap, (wx, v, x))
    return total if len(visited) == len(graph) else -1   #@done
`;

interface In {
  edges: EdgeSpec[];
  start: string;
}

type Cand = [number, string, string]; // weight, from (inside the tree), to

const viz: VizDef<In> = {
  id: 'prim',
  title: "Prim's minimum spanning tree",
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Weighted edges (undirected, A-B:7)', kind: 'edges', default: e('A-B:7, A-D:5, B-C:8, B-D:9, B-E:7, C-E:5, D-E:15, D-F:6, E-F:8, E-G:9, F-G:11'), maxItems: 14 },
    { key: 'start', label: 'Start', kind: 'string', default: 'A', maxItems: 3 },
  ],
  presets: [
    { label: 'Ties', input: { edges: e('A-B:2, B-C:2, C-D:2, D-A:2'), start: 'A' } },
    { label: 'Disconnected', input: { edges: e('A-B:3, B-C:1, X-Y:2'), start: 'A' } },
    { label: 'Triangle', input: { edges: e('A-B:1, B-C:2, A-C:3'), start: 'C' } },
    { label: 'Single node', input: { edges: [], start: 'A' } },
  ],
  run({ edges, start }) {
    const r = new Recorder(code);
    for (const ed of edges) if (ed.w === undefined) throw new Error(`Edge ${ed.from}-${ed.to} needs a weight (A-B:4)`);
    const { ids, adj, pos } = prepareGraph(edges, start, false);
    const visited = new Set<string>([start]);
    const tree: Cand[] = [];
    const rejected = new Set<string>();
    const heap = new MinHeap<Cand>((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]) || cmpStr(a[2], b[2]));
    let total = 0;

    const panels = (cur?: Cand, curTone: Tone = 'compare', fresh: Cand[] = []) => {
      const tones: Record<string, Tone> = {};
      for (const id of ids) tones[id] = visited.has(id) ? 'done' : 'default';
      const edgeTones: Record<string, Tone> = {};
      for (const k of rejected) edgeTones[k] = 'muted';
      for (const [, u, v] of tree) edgeTones[edgeKey(u, v, false)] = 'done';
      for (const [, u, v] of fresh) edgeTones[edgeKey(u, v, false)] = 'frontier';
      if (cur) {
        edgeTones[edgeKey(cur[1], cur[2], false)] = curTone;
        tones[cur[2]] = visited.has(cur[2]) && curTone === 'error' ? 'done' : 'compare';
        tones[cur[1]] = 'active';
      }
      const badges: Record<string, string> = {};
      const queue: ListPanel = {
        type: 'list',
        title: 'Heap of crossing edges (w, from → to)',
        orientation: 'horizontal',
        items: queueItems(heap.sorted().map(([w, u, v]) => ({ label: `${w}  ${u}→${v}`, stale: visited.has(v), sub: visited.has(v) ? 'both ends in tree' : undefined }))),
        startLabel: 'min',
        emptyText: 'empty',
      };
      const mst: ListPanel = {
        type: 'list',
        title: `Tree edges (total ${total})`,
        orientation: 'horizontal',
        items: tree.map(([w, u, v]) => ({ label: `${u}-${v} (${w})`, tone: 'done' as Tone })),
        emptyText: 'none yet',
      };
      return [graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph' }), queue, mst];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ total, 'tree nodes': visited.size, heap: heap.size, ...extra });

    r.step('init', `The tree starts as just ${start}`, panels(), vars());
    const seeds: Cand[] = adj[start].map(([v, w]) => [w, start, v]);
    for (const c of seeds) {
      heap.push(c);
      r.op();
    }
    r.step('seed', seeds.length ? `Push every edge leaving ${start} onto the heap` : `${start} has no edges to push`, panels(undefined, 'compare', seeds), vars());
    while (heap.size) {
      const c = heap.pop()!;
      const [w, u, v] = c;
      r.op();
      r.step('pop', `Pop the cheapest crossing edge: ${u}-${v} (${w})`, panels(c), vars({ w, u, v }));
      if (visited.has(v)) {
        rejected.add(edgeKey(u, v, false));
        r.step('reject', `${v} is already in the tree: ${u}-${v} would close a cycle, skip`, panels(c, 'error'), vars({ w, u, v }));
        continue;
      }
      visited.add(v);
      tree.push(c);
      total += w;
      r.step('take', `Take ${u}-${v}: ${v} joins the tree, total = ${total}`, panels(c, 'new'), vars({ w, u, v }));
      const fresh: Cand[] = [];
      for (const [x, wx] of adj[v]) {
        if (!visited.has(x)) {
          const nc: Cand = [wx, v, x];
          heap.push(nc);
          fresh.push(nc);
          r.op();
        }
      }
      if (fresh.length) r.step('push', `Push ${v}'s edges to outside nodes: ${fresh.map(([wx, , x]) => `${v}-${x} (${wx})`).join(', ')}`.slice(0, 90), panels(undefined, 'compare', fresh), vars({ v }));
    }
    const spanning = visited.size === ids.length;
    const result = spanning ? total : -1;
    r.step('done', spanning ? `Heap empty: all ${ids.length} nodes connected, MST weight ${total}` : `Only ${visited.size} of ${ids.length} nodes reachable: no spanning tree, return -1`, panels(), vars({ result }));
    return { frames: r.frames, result };
  },
  reference({ edges, start }) {
    const { ids, adj } = prepareGraph(edges, start, false);
    const comp = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      for (const [v] of adj[stack.pop()!]) {
        if (!comp.has(v)) {
          comp.add(v);
          stack.push(v);
        }
      }
    }
    if (comp.size !== ids.length) return -1;
    const parent: Record<string, string> = Object.fromEntries(ids.map((i) => [i, i]));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    let sum = 0;
    for (const ed of [...edges].sort((a, b) => (a.w ?? 0) - (b.w ?? 0))) {
      const a = find(ed.from);
      const b = find(ed.to);
      if (a !== b) {
        parent[a] = b;
        sum += ed.w ?? 0;
      }
    }
    return sum;
  },
};

const tri = { A: [['B', 1], ['C', 3]], B: [['A', 1], ['C', 2]], C: [['A', 3], ['B', 2]] };
const five = {
  A: [['B', 2], ['C', 3]],
  B: [['A', 2], ['C', 1], ['D', 4]],
  C: [['A', 3], ['B', 1], ['D', 5]],
  D: [['B', 4], ['C', 5], ['E', 6]],
  E: [['D', 6]],
};
const tests = [
  { args: [tri, 'A'], expected: 3 },
  { args: [five, 'C'], expected: 13, name: 'start in the middle' },
  { args: [{ A: [['B', 2], ['D', 2]], B: [['A', 2], ['C', 2]], C: [['B', 2], ['D', 2]], D: [['C', 2], ['A', 2]] }, 'A'], expected: 6, name: 'all weights tie' },
  { args: [{ A: [['B', 4]], B: [['A', 4]], C: [] }, 'A'], expected: -1, name: 'disconnected graph' },
  { args: [{ X: [] }, 'X'], expected: 0, name: 'single node' },
];

const unit: Unit = {
  id: 'prim',
  hook: 'Prim grows one tree outward, always buying the cheapest edge that reaches a new node. It is the "connect everything for the least cost" template: cables, roads, clusters.',
  predict: {
    prompt: 'Edges: A–B:1, B–C:2, A–C:3. Prim starts at A. Which edge does it reject, and when?',
    options: ['A–B:1, immediately', 'B–C:2, when it is popped', 'A–C:3, when it is popped after both ends joined the tree', 'None, all three are in the MST'],
    answer: 2,
    explain: 'A–B (1) is taken, B joins and pushes B–C (2). C joins via B–C. The earlier A–C (3) entry is still in the heap, but now both ends are in the tree, so it is skipped on pop.',
  },
  viz,
  deeper: {
    points: [
      'Cut property: for any split of the nodes into "in the tree" and "outside", the cheapest edge crossing the split belongs to some MST. Prim applies it once per step.',
      'The heap holds crossing edges. Edges whose far end joined the tree later go stale; skip them on pop (same lazy deletion as Dijkstra).',
      'Prim differs from Dijkstra in the key: the edge weight alone, not distance from the start. Mixing the two up is the classic bug.',
      'Equal weights are fine: different tie-breaking gives a different tree, but the total weight is the same.',
      'If the heap runs out before all nodes joined, the graph is disconnected and only a spanning forest exists.',
    ],
    complexity: { time: 'O(E log V)', space: 'O(V + E)' },
    pitfalls: [
      'Forgetting the "already visited" check on pop, which adds cycle-forming edges and inflates the total',
      'Pushing (dist + w, node) like Dijkstra instead of just (w, node)',
      'Assuming the graph is connected: always compare the number of visited nodes with the total',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'prim_weight',
    statement: '`graph` maps each node to a list of `[neighbour, weight]` pairs (undirected: both directions are listed). Return the total weight of a minimum spanning tree grown from `start`, or -1 if the graph is not connected.',
    signature: 'def prim_weight(graph, start):',
    solution: `import heapq

def prim_weight(graph, start):
    visited = @@{start}@@
    heap = [(w, v) for v, w in graph[start]]
    heapq.heapify(heap)
    total = 0
    while @@heap@@:
        w, v = @@heapq.heappop(heap)@@
        if @@v in visited@@:
            continue
        visited.add(v)
        total += @@w@@
        for x, wx in graph[v]:
            if x not in visited:
                @@heapq.heappush(heap, (wx, x))@@
    return total if @@len(visited) == len(graph)@@ else -1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'prim_weight',
    statement: 'This Prim returns a total that is too large whenever the graph has a cycle. Find the missing line.',
    buggy: `import heapq

def prim_weight(graph, start):
    visited = {start}
    heap = [(w, v) for v, w in graph[start]]
    heapq.heapify(heap)
    total = 0
    while heap:
        w, v = heapq.heappop(heap)
        visited.add(v)
        total += w
        for x, wx in graph[v]:
            if x not in visited:
                heapq.heappush(heap, (wx, x))
    return total if len(visited) == len(graph) else -1`,
    fixed: `import heapq

def prim_weight(graph, start):
    visited = {start}
    heap = [(w, v) for v, w in graph[start]]
    heapq.heapify(heap)
    total = 0
    while heap:
        w, v = heapq.heappop(heap)
        if v in visited:
            continue
        visited.add(v)
        total += w
        for x, wx in graph[v]:
            if x not in visited:
                heapq.heappush(heap, (wx, x))
    return total if len(visited) == len(graph) else -1`,
    tests,
    bugType: 'missing visited check on pop',
    hint: 'In the triangle, C is pushed twice (cost 3 from A, cost 2 from B). What happens to the 3 when it is popped?',
    explanation: 'A node can sit in the heap several times. Without `if v in visited: continue` the second, more expensive entry is paid for too, adding an edge that closes a cycle.',
  },
  boss: {
    title: 'Wire up the sensors',
    statement: 'Sensors sit at integer coordinates `[x, y]`. Connecting two sensors costs their Manhattan distance |x1-x2| + |y1-y2|. Return the minimum total cost so that every sensor can reach every other one through the cables.',
    language: 'python',
    fnName: 'min_cost_connect',
    starter: `def min_cost_connect(points):
    # your code here
    pass
`,
    solution: `def min_cost_connect(points):
    n = len(points)
    INF = float('inf')
    best = [INF] * n
    best[0] = 0
    used = [False] * n
    total = 0
    for _ in range(n):
        u = min((i for i in range(n) if not used[i]), key=lambda i: best[i])
        used[u] = True
        total += best[u]
        for v in range(n):
            if not used[v]:
                d = abs(points[u][0] - points[v][0]) + abs(points[u][1] - points[v][1])
                if d < best[v]:
                    best[v] = d
    return total`,
    tests: [
      { args: [[[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]]], expected: 20 },
      { args: [[[0, 0], [1, 1], [1, 0], [-1, 1]]], expected: 4, name: 'negative coordinates' },
      { args: [[[4, 4]]], expected: 0, name: 'one sensor' },
      { args: [[[1, 1], [1, 1], [5, 5]]], expected: 8, name: 'duplicate positions' },
      { args: [[[0, 0], [10, 0]]], expected: 10, name: 'two sensors' },
    ],
    hints: ['Every pair of sensors is an edge, so the graph is dense. With V up to a few thousand, an array-based Prim avoids building all edges.', 'Keep best[v] = cheapest cable from the tree to v. Each round pick the unused v with the smallest best, add it, then update best for the others.'],
    combines: ['kruskal', 'dijkstra'],
  },
  quiz: [
    {
      prompt: 'What is the key difference between the heap entries in Prim and in Dijkstra?',
      options: ['Prim stores the edge weight alone, Dijkstra stores total distance from the start', 'Prim uses a max-heap', 'Dijkstra stores the edge weight alone', 'There is no difference'],
      answer: 0,
      explain: 'Prim only cares about the cost of the single connecting edge; Dijkstra needs the whole path cost d + w.',
    },
  ],
};

export default unit;
