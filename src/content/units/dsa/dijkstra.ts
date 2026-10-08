import { Recorder } from '@/engine/recorder';
import { graphPanel, edgeKey, type EdgeSpec } from '@/engine/layout';
import type { KVPanel, ListPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MinHeap, cmpStr, dstr, prepareGraph, queueItems } from '@/content/lib/paths-mst';

const code = `
import heapq

def dijkstra(graph, start):
    dist = {node: float('inf') for node in graph}    #@init
    dist[start] = 0
    prev = {start: None}
    heap = [(0, start)]                              #@push0
    while heap:                                      #@loop
        d, u = heapq.heappop(heap)                   #@pop
        if d > dist[u]:                              #@stale
            continue                                 #@skip
        for v, w in graph[u]:                        #@scan
            nd = d + w                               #@relax
            if nd < dist[v]:                         #@improve
                dist[v] = nd                         #@update
                prev[v] = u
                heapq.heappush(heap, (nd, v))        #@push
    return dist                                      #@done
`;

interface In {
  edges: EdgeSpec[];
  start: string;
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+):(\d+)$/)!;
    return { from: m[1], to: m[2], w: Number(m[3]) };
  });

const viz: VizDef<In> = {
  id: 'dijkstra',
  title: "Dijkstra's algorithm",
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Weighted edges (undirected, A-B:4)', kind: 'edges', default: E('A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:3, F-G:2'), maxItems: 14 },
    { key: 'start', label: 'Start', kind: 'string', default: 'A', maxItems: 3 },
  ],
  presets: [
    { label: 'Stale entries', input: { edges: E('A-B:7, A-C:2, C-B:3, B-D:1, C-D:9'), start: 'A' } },
    { label: 'Unreachable node', input: { edges: E('A-B:3, B-C:4, X-Y:1'), start: 'A' } },
    { label: 'Ties', input: { edges: E('A-B:2, A-C:2, B-D:2, C-D:2'), start: 'A' } },
    { label: 'Single node', input: { edges: [], start: 'A' } },
  ],
  run({ edges, start }) {
    const r = new Recorder(code);
    for (const e of edges) if ((e.w ?? 1) < 0) throw new Error(`Dijkstra needs non-negative weights, but ${e.from}-${e.to} is ${e.w}. Use Bellman-Ford.`);
    const { ids, adj, pos } = prepareGraph(edges, start, false);
    const dist: Record<string, number> = Object.fromEntries(ids.map((i) => [i, Infinity]));
    const prev: Record<string, string | null> = {};
    const settled = new Set<string>();
    const heap = new MinHeap<[number, string]>((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]));

    const panels = (cur?: string, nb?: string, hot?: [string, string, Tone], nbTone: Tone = 'compare', final = false) => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        tones[id] = settled.has(id) ? 'done' : Number.isFinite(dist[id]) ? 'frontier' : 'default';
        badges[id] = dstr(dist[id]);
        if (final && !Number.isFinite(dist[id])) tones[id] = 'muted';
      }
      if (cur) tones[cur] = 'active';
      if (nb) tones[nb] = nbTone;
      const edgeTones: Record<string, Tone> = {};
      for (const [v, p] of Object.entries(prev)) if (p !== null) edgeTones[edgeKey(p, v, false)] = final ? 'path' : settled.has(v) ? 'done' : 'visited';
      if (hot) edgeTones[edgeKey(hot[0], hot[1], false)] = hot[2];
      const queue: ListPanel = {
        type: 'list',
        title: 'Heap (dist, node), smallest first',
        orientation: 'horizontal',
        items: queueItems(heap.sorted().map(([d, n]) => ({ label: `(${d}, ${n})`, stale: d > dist[n] }))),
        startLabel: 'min',
        emptyText: 'empty',
      };
      const table: KVPanel = {
        type: 'kv',
        title: 'dist table (via)',
        entries: ids.map((id) => ({ k: id, v: Number.isFinite(dist[id]) ? `${dist[id]}${prev[id] ? ` via ${prev[id]}` : ''}` : '∞', tone: id === cur ? 'active' : settled.has(id) ? 'done' : Number.isFinite(dist[id]) ? 'frontier' : undefined })),
      };
      return [graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph' }), queue, table];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ heap: heap.size, settled: settled.size, ...extra });

    dist[start] = 0;
    prev[start] = null;
    r.step('init', `Every distance starts at ∞, except dist[${start}] = 0`, panels(start), vars());
    heap.push([0, start]);
    r.op();
    r.step('push0', `Push (0, ${start}) onto the heap`, panels(), vars());
    while (heap.size) {
      const [d, u] = heap.pop()!;
      r.op();
      r.step('pop', `Pop (${d}, ${u}): the closest unsettled entry`, panels(u), vars({ d, u }));
      if (d > dist[u]) {
        r.step('skip', `(${d}, ${u}) is stale: dist[${u}] is already ${dist[u]}, skip`, panels(), vars({ d, u }));
        continue;
      }
      settled.add(u);
      r.step('scan', `dist[${u}] = ${d} is final. Relax its edges`, panels(u), vars({ d, u }));
      for (const [v, w] of adj[u]) {
        const nd = d + w;
        r.op();
        if (nd < dist[v]) {
          const old = dist[v];
          dist[v] = nd;
          prev[v] = u;
          heap.push([nd, v]);
          r.op();
          r.step('push', `dist[${v}] ${dstr(old)} → ${nd} via ${u}, push (${nd}, ${v})`, panels(u, v, [u, v, 'new'], 'swap'), vars({ d, u, v, nd }));
        } else {
          r.step('improve', `${u}-${v}: ${d}+${w} = ${nd} is not below dist[${v}] = ${dstr(dist[v])}`, panels(u, v, [u, v, 'muted']), vars({ d, u, v, nd }));
        }
      }
    }
    r.step('loop', 'Heap is empty: nothing left to settle', panels(), vars());
    const paths = ids.map((id) => {
      if (!Number.isFinite(dist[id])) return { k: id, v: 'unreachable', tone: 'muted' as Tone };
      const p: string[] = [];
      for (let x: string | null = id; x !== null; x = prev[x]) p.unshift(x);
      return { k: id, v: `${p.join('→')} (${dist[id]})`, tone: 'path' as Tone };
    });
    const final = panels(undefined, undefined, undefined, 'compare', true);
    final[2] = { type: 'kv', title: 'Shortest paths (from prev)', entries: paths };
    r.step('done', 'The prev links form the shortest-path tree', final, vars());
    return { frames: r.frames, result: { ...dist } };
  },
  reference({ edges, start }) {
    const { ids, adj } = prepareGraph(edges, start, false);
    const dist: Record<string, number> = Object.fromEntries(ids.map((i) => [i, Infinity]));
    dist[start] = 0;
    const done = new Set<string>();
    for (let k = 0; k < ids.length; k++) {
      let u: string | null = null;
      for (const id of ids) if (!done.has(id) && Number.isFinite(dist[id]) && (u === null || dist[id] < dist[u])) u = id;
      if (u === null) break;
      done.add(u);
      for (const [v, w] of adj[u]) dist[v] = Math.min(dist[v], dist[u] + w);
    }
    return dist;
  },
};

const g1 = { A: [['B', 4], ['C', 2]], B: [['A', 4], ['C', 1], ['D', 5]], C: [['A', 2], ['B', 1], ['D', 8]], D: [['B', 5], ['C', 8]] };
const trap = { A: [['B', 7], ['C', 2]], B: [['A', 7], ['D', 1], ['C', 3]], C: [['A', 2], ['B', 3]], D: [['B', 1]] };
const tests = [
  { args: [g1, 'A'], expected: { A: 0, B: 3, C: 2, D: 8 } },
  { args: [trap, 'A'], expected: { A: 0, B: 5, C: 2, D: 6 }, name: 'direct edge is not the shortest' },
  { args: [{ A: [['B', 3]], B: [['A', 3]], C: [] }, 'A'], expected: { A: 0, B: 3, C: 'Infinity' }, name: 'unreachable node' },
  { args: [{ X: [] }, 'X'], expected: { X: 0 }, name: 'single node' },
  { args: [{ A: [['B', 0], ['C', 5]], B: [['A', 0], ['C', 5]], C: [['A', 5], ['B', 5]] }, 'A'], expected: { A: 0, B: 0, C: 5 }, name: 'zero-weight edge' },
  { args: [{ A: [['B', 1]], B: [['C', 1]], C: [['A', 1]] }, 'B'], expected: { A: 2, B: 0, C: 1 }, name: 'directed cycle' },
];

const unit: Unit = {
  id: 'dijkstra',
  hook: 'Dijkstra is the answer to "cheapest route" with non-negative costs: maps, network latency, flights. Interviewers want to hear heap, lazy deletion and why a negative edge breaks it.',
  predict: {
    prompt: 'Edges: A–B:7, A–C:2, C–B:3, B–D:1. Starting at A, what is the final shortest distance to D?',
    options: ['8 (A → B → D)', '6 (A → C → B → D)', '7', '3'],
    answer: 1,
    explain: 'The direct edge to B costs 7, but A → C → B costs 2 + 3 = 5. Then D = 5 + 1 = 6. Dijkstra first records B = 7, then improves it to 5 when C is settled.',
  },
  viz,
  deeper: {
    points: [
      'Greedy choice: the unsettled node with the smallest tentative distance can never be improved later, because every other route to it must pass through a node at least as far away and edges cannot be negative.',
      'With a negative edge that argument collapses: a settled node could still be improved through a later, longer-looking prefix. Use Bellman-Ford.',
      'Lazy deletion: heapq has no decrease-key, so push a new (smaller dist, node) entry and skip old ones on pop with `if d > dist[u]: continue`.',
      'Every node is settled once, but may sit in the heap several times. Heap size is bounded by the number of successful relaxations, O(E).',
      'Store a prev map while relaxing and you can rebuild the actual route, not only its length.',
    ],
    complexity: { time: 'O((V + E) log V)', space: 'O(V + E)' },
    pitfalls: [
      'Pushing a bare node instead of (dist, node): the heap then orders by name, not distance',
      'Using <= in the relax test: harmless with positive weights, but zero-weight cycles re-push forever',
      'Marking a node visited when first pushed instead of when popped: the first route found is not always the cheapest',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'dijkstra',
    statement: '`graph` maps each node to a list of `[neighbour, weight]` pairs (non-negative weights). Return a dict with the shortest distance from `start` to every node (`float("inf")` if unreachable).',
    signature: 'def dijkstra(graph, start):',
    solution: `import heapq

def dijkstra(graph, start):
    dist = {node: float('inf') for node in graph}
    dist[start] = @@0@@
    heap = [(0, start)]
    while @@heap@@:
        d, u = @@heapq.heappop(heap)@@
        if @@d > dist[u]@@:
            continue
        for v, w in graph[u]:
            nd = d + w
            if @@nd < dist[v]@@:
                dist[v] = nd
                @@heapq.heappush(heap, (nd, v))@@
    return dist`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'dijkstra',
    statement: 'This Dijkstra is correct on simple graphs but returns a too-long distance when a cheaper route is discovered later. Fix it.',
    buggy: `import heapq

def dijkstra(graph, start):
    dist = {node: float('inf') for node in graph}
    dist[start] = 0
    heap = [(0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            nd = d + w
            if dist[v] == float('inf'):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist`,
    fixed: `import heapq

def dijkstra(graph, start):
    dist = {node: float('inf') for node in graph}
    dist[start] = 0
    heap = [(0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist`,
    tests,
    bugType: 'first discovery wins',
    hint: 'Look at the test where the direct edge A–B costs 7 but A → C → B costs 5. Can dist[B] ever change after it is first set?',
    explanation: 'The condition only relaxed nodes that were still at infinity, so the first route found was kept even when a later one was cheaper. A node is only final when it is popped; until then compare nd < dist[v] on every edge.',
  },
  boss: {
    title: 'Signal delay',
    statement: 'A network has nodes numbered 1..n and directed wires `[u, v, t]` meaning a signal sent from u arrives at v after t time units. A signal starts at node `k` at time 0 and spreads along every wire. Return the time at which the last node receives it, or -1 if some node never does.',
    language: 'python',
    fnName: 'network_delay',
    starter: `def network_delay(times, n, k):
    # your code here
    pass
`,
    solution: `import heapq

def network_delay(times, n, k):
    graph = {i: [] for i in range(1, n + 1)}
    for u, v, t in times:
        graph[u].append((v, t))
    dist = {}
    heap = [(0, k)]
    while heap:
        d, u = heapq.heappop(heap)
        if u in dist:
            continue
        dist[u] = d
        for v, t in graph[u]:
            if v not in dist:
                heapq.heappush(heap, (d + t, v))
    return max(dist.values()) if len(dist) == n else -1`,
    tests: [
      { args: [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], expected: 2 },
      { args: [[[1, 2, 1]], 2, 1], expected: 1, name: 'two nodes' },
      { args: [[[1, 2, 1]], 2, 2], expected: -1, name: 'wire points the wrong way' },
      { args: [[[1, 2, 5], [1, 3, 1], [3, 2, 1]], 3, 1], expected: 2, name: 'cheaper two-hop route' },
      { args: [[], 1, 1], expected: 0, name: 'single node' },
      { args: [[[1, 2, 1], [1, 3, 4], [2, 3, 1], [3, 4, 2]], 5, 1], expected: -1, name: 'a node has no wire' },
    ],
    hints: ['The answer is the largest shortest-path distance from k. Which algorithm gives all of those at once?', 'Build an adjacency list, run Dijkstra from k with a heap, and return the max distance if all n nodes were reached, otherwise -1.'],
    combines: ['bfs', 'heap-extract'],
  },
  quiz: [
    {
      prompt: 'A heap holds (4, B) and (3, B) after two relaxations. Dijkstra pops (3, B) first, settles B, then later pops (4, B). What happens?',
      options: ['It re-relaxes B with distance 4', 'It is skipped because 4 > dist[B]', 'The algorithm crashes', 'dist[B] becomes 4'],
      answer: 1,
      explain: 'That is the stale-entry check: d > dist[u] means a better entry was already processed, so the pop is ignored.',
    },
  ],
};

export default unit;
