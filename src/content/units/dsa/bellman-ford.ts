import { Recorder } from '@/engine/recorder';
import { graphPanel, edgeKey, type EdgeSpec } from '@/engine/layout';
import type { GridPanel, Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { e } from '@/content/lib/graph';
import { dstr, prepareGraph } from '@/content/lib/paths-mst';

const code = `
def bellman_ford(nodes, edges, src):
    dist = {v: float('inf') for v in nodes}    #@init
    dist[src] = 0
    for i in range(len(nodes) - 1):            #@round
        changed = False
        for u, v, w in edges:                  #@edge
            if dist[u] + w < dist[v]:          #@check
                dist[v] = dist[u] + w          #@relax
                changed = True
        if not changed:                        #@early
            break
    for u, v, w in edges:                      #@neg
        if dist[u] + w < dist[v]:              #@negcheck
            return None                        #@cycle
    return dist                                #@done
`;

interface In {
  edges: EdgeSpec[];
  start: string;
}

const viz: VizDef<In> = {
  id: 'bellman-ford',
  title: 'Bellman-Ford',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Directed weighted edges (A-B:4 means A→B)', kind: 'edges', default: e('B-C:-2, A-B:3, S-A:4, S-B:9, S-D:5, D-B:1, D-E:1'), maxItems: 12 },
    { key: 'start', label: 'Source', kind: 'string', default: 'S', maxItems: 3 },
  ],
  presets: [
    { label: 'Negative edge', input: { edges: e('S-A:4, S-B:5, A-B:-3, B-C:2'), start: 'S' } },
    { label: 'Negative cycle', input: { edges: e('S-A:2, A-B:1, B-C:-3, C-A:1'), start: 'S' } },
    { label: 'Unreachable node', input: { edges: e('S-A:4, A-B:-1, X-Y:2'), start: 'S' } },
    { label: 'Single node', input: { edges: [], start: 'S' } },
  ],
  run({ edges, start }) {
    const r = new Recorder(code);
    const { ids, pos } = prepareGraph(edges, start, true);
    const n = ids.length;
    const dist: Record<string, number> = Object.fromEntries(ids.map((i) => [i, Infinity]));
    const prev: Record<string, string | null> = {};
    const rows: { label: string; cells: Scalar[]; tones: Tone[] }[] = [];
    const snap = (label: string, tones?: Tone[]) => ({ label, cells: ids.map((i) => dstr(dist[i])), tones: tones ?? ids.map(() => 'default' as Tone) });
    let live: { label: string; changed: Set<string> } | null = null;

    const table = (): GridPanel => {
      const all = rows.map((x) => x);
      if (live) all.push({ ...snap(live.label), tones: ids.map((i) => (live!.changed.has(i) ? ('new' as Tone) : 'default')) });
      const tones: Record<string, Tone> = {};
      all.forEach((row, ri) => row.tones.forEach((t, ci) => t !== 'default' && (tones[`${ri},${ci}`] = t)));
      return { type: 'grid', title: 'dist table per round', cells: all.map((x) => x.cells), rowLabels: all.map((x) => x.label), colLabels: ids, tones };
    };
    const board = (hot?: [string, string, Tone], nodeTone: Record<string, Tone> = {}, errorEdges: [string, string][] = [], final = false) => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        tones[id] = Number.isFinite(dist[id]) ? 'frontier' : 'default';
        badges[id] = dstr(dist[id]);
        if (final) tones[id] = Number.isFinite(dist[id]) ? 'done' : 'muted';
      }
      Object.assign(tones, nodeTone);
      const edgeTones: Record<string, Tone> = {};
      for (const [v, p] of Object.entries(prev)) if (p !== null) edgeTones[edgeKey(p, v, true)] = final ? 'path' : 'visited';
      if (hot) edgeTones[edgeKey(hot[0], hot[1], true)] = hot[2];
      for (const [a, b] of errorEdges) edgeTones[edgeKey(a, b, true)] = 'error';
      return graphPanel(ids, edges, pos, true, { tones, badges, edgeTones, title: 'Graph' });
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ ...extra });

    dist[start] = 0;
    prev[start] = null;
    rows.push(snap('init'));
    r.step('init', `Every distance starts at ∞, except dist[${start}] = 0`, [board(), table()], vars({ rounds: n - 1 }));
    let rounds = 0;
    for (let i = 1; i <= n - 1; i++) {
      rounds = i;
      live = { label: `R${i}`, changed: new Set() };
      r.step('round', `Round ${i} of ${n - 1}: relax every edge once`, [board(), table()], vars({ round: i }));
      let changed = false;
      for (const ed of edges) {
        const w = ed.w ?? 1;
        const nd = dist[ed.from] + w;
        r.op();
        if (nd < dist[ed.to]) {
          const old = dist[ed.to];
          dist[ed.to] = nd;
          prev[ed.to] = ed.from;
          live.changed.add(ed.to);
          changed = true;
          r.step('relax', `dist[${ed.to}] ${dstr(old)} → ${nd} via ${ed.from}`, [board([ed.from, ed.to, 'new'], { [ed.to]: 'swap' }), table()], vars({ round: i, edge: `${ed.from}→${ed.to}`, changed }));
        } else {
          const why = Number.isFinite(dist[ed.from]) ? `${dist[ed.from]}+${w} = ${nd} is not below dist[${ed.to}] = ${dstr(dist[ed.to])}` : `dist[${ed.from}] is ∞, nothing to relax`;
          r.step('check', `${ed.from}→${ed.to}: ${why}`, [board([ed.from, ed.to, 'muted'], { [ed.to]: 'compare' }), table()], vars({ round: i, edge: `${ed.from}→${ed.to}`, changed }));
        }
      }
      rows.push(snap(`R${i}`, ids.map((id) => (live!.changed.has(id) ? 'new' : 'default'))));
      live = null;
      if (!changed) {
        r.step('early', `Round ${i} changed nothing: distances are final, stop early`, [board(), table()], vars({ round: i }));
        break;
      }
    }
    r.step('neg', 'Extra check: can any edge still improve a distance?', [board(), table()], vars({ rounds }));
    for (const ed of edges) {
      const w = ed.w ?? 1;
      const nd = dist[ed.from] + w;
      r.op();
      if (nd < dist[ed.to]) {
        const back = { ...prev, [ed.to]: ed.from };
        let x: string | null = ed.to;
        for (let k = 0; k < n && x !== null; k++) x = back[x] ?? null;
        const cyc: string[] = [];
        if (x !== null) {
          let y: string = x;
          do {
            cyc.unshift(y);
            y = back[y] as string;
          } while (y !== x && y !== undefined && cyc.length <= n);
        }
        const cycEdges: [string, string][] = cyc.map((c, k) => [c, cyc[(k + 1) % cyc.length]]);
        const nodeTone: Record<string, Tone> = Object.fromEntries(cyc.map((c) => [c, 'error' as Tone]));
        r.step('negcheck', `${ed.from}→${ed.to} still improves (${nd} < ${dstr(dist[ed.to])})`, [board([ed.from, ed.to, 'error'], { [ed.to]: 'error' }), table()], vars({ edge: `${ed.from}→${ed.to}` }));
        r.step('cycle', cyc.length ? `Negative cycle: ${[...cyc, cyc[0]].join('→')}. No shortest paths exist` : 'Negative cycle detected: no shortest paths exist', [board(undefined, nodeTone, cycEdges.length ? cycEdges : [[ed.from, ed.to]]), table()], vars({ result: 'None' }));
        return { frames: r.frames, result: null };
      }
      r.step('negcheck', `${ed.from}→${ed.to}: ${Number.isFinite(dist[ed.from]) ? `${dist[ed.from]}+${w} = ${nd} does not beat ${dstr(dist[ed.to])}` : `dist[${ed.from}] is ∞, skip`}`, [board([ed.from, ed.to, 'muted']), table()], vars({ edge: `${ed.from}→${ed.to}` }));
    }
    r.step('done', 'No edge improves: no negative cycle. Prev links give the shortest-path tree', [board(undefined, {}, [], true), table()], vars({ result: 'dist' }));
    return { frames: r.frames, result: { ...dist } };
  },
  reference({ edges, start }) {
    const { ids } = prepareGraph(edges, start, true);
    const d: Record<string, number> = Object.fromEntries(ids.map((i) => [i, Infinity]));
    d[start] = 0;
    for (let i = 0; i < ids.length - 1; i++) for (const ed of edges) d[ed.to] = Math.min(d[ed.to], d[ed.from] + (ed.w ?? 1));
    for (const ed of edges) if (d[ed.from] + (ed.w ?? 1) < d[ed.to]) return null;
    return d;
  },
};

const INF = 'Infinity';
const clrs = [[0, 1, 6], [0, 3, 7], [1, 2, 5], [1, 3, 8], [1, 4, -4], [2, 1, -2], [3, 2, -3], [3, 4, 9], [4, 0, 2], [4, 2, 7]];
const tests = [
  { args: [5, clrs, 0], expected: [0, 2, 4, 7, -2], name: 'negative edges, no negative cycle' },
  { args: [3, [[0, 1, 1], [1, 2, -3], [2, 0, 1]], 0], expected: null, name: 'negative cycle' },
  { args: [4, [[0, 1, 5], [2, 3, 1]], 0], expected: [0, 5, INF, INF], name: 'unreachable nodes' },
  { args: [4, [[0, 1, 2], [2, 3, -1], [3, 2, -1]], 0], expected: [0, 2, INF, INF], name: 'negative cycle not reachable from source' },
  { args: [1, [], 0], expected: [0], name: 'single node' },
  { args: [4, [[2, 3, 2], [1, 2, -3], [0, 1, 4], [0, 2, 5]], 0], expected: [0, 4, 1, 3], name: 'edges in the worst order' },
];

const unit: Unit = {
  id: 'bellman-ford',
  hook: 'When edges can be negative, Dijkstra is out. Bellman-Ford is the simple fallback, and the extra round that detects negative cycles is a favourite follow-up question.',
  predict: {
    prompt: 'A graph has 6 nodes and no negative cycle. Why is relaxing every edge 5 times (V − 1 rounds) always enough?',
    options: ['Each round settles the closest unsettled node, like Dijkstra', 'There are at most 5 distinct edge weights', 'A shortest path has at most 5 edges, and every round locks in one more edge of each such path', 'Five rounds is just a safe guess that works on most graphs'],
    answer: 2,
    explain: 'Without a negative cycle a shortest path never repeats a node, so it has at most V − 1 edges. After round k, every shortest path of up to k edges is correct, whatever order the edges are listed in.',
  },
  viz,
  deeper: {
    points: [
      'Relax means: if dist[u] + w < dist[v], improve dist[v]. Round k guarantees correct distances for all shortest paths that use at most k edges.',
      'If round V − 1 is not needed, a round with no change proves convergence: stop early. Good graphs often finish in 2 or 3 rounds.',
      'One more pass after V − 1 rounds: if any edge still relaxes, a negative cycle is reachable from the source, so shortest distances are undefined.',
      'A negative cycle the source cannot reach is invisible: its nodes stay at infinity, and inf + w is never below inf.',
      'Undirected graphs with a negative edge are a trap: the edge can be walked back and forth, which is itself a negative cycle.',
    ],
    complexity: { time: 'O(V · E)', space: 'O(V)' },
    pitfalls: [
      'Running only V − 2 rounds (off by one): the longest shortest path never settles',
      'Using <= in the cycle check: every tight edge on a correct shortest path would report a false cycle',
      'For "at most k edges" problems, relaxing in place lets a round use edges added in the same round: copy dist each round',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'bellman_ford',
    statement: 'Nodes are 0..n-1 and `edges` is a list of directed `[u, v, w]` (w may be negative). Return the list of shortest distances from `src` (`float("inf")` if unreachable), or `None` if a negative cycle is reachable from `src`.',
    signature: 'def bellman_ford(n, edges, src):',
    solution: `def bellman_ford(n, edges, src):
    dist = [float('inf')] * n
    dist[src] = @@0@@
    for _ in range(@@n - 1@@):
        changed = False
        for u, v, w in edges:
            if @@dist[u] + w < dist[v]@@:
                dist[v] = @@dist[u] + w@@
                changed = True
        if @@not changed@@:
            break
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
            return None
    return dist`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'bellman_ford',
    statement: 'This version reports a negative cycle on perfectly fine graphs. Fix the check.',
    buggy: `def bellman_ford(n, edges, src):
    dist = [float('inf')] * n
    dist[src] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break
    for u, v, w in edges:
        if dist[u] + w <= dist[v]:
            return None
    return dist`,
    fixed: `def bellman_ford(n, edges, src):
    dist = [float('inf')] * n
    dist[src] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
            return None
    return dist`,
    tests,
    bugType: 'wrong comparison in cycle check',
    hint: 'After the rounds finish, an edge on a shortest path satisfies dist[u] + w == dist[v]. Should that count as "still improving"?',
    explanation: 'The final pass must ask "can this edge STILL make a distance strictly smaller?". With <= every tight edge (and every inf <= inf pair) looks like a negative cycle. Use <.',
  },
  boss: {
    title: 'Cheapest flight with limited stops',
    statement: 'There are n cities (0..n-1) and one-way flights `[from, to, price]`. Return the lowest total price to travel from `src` to `dst` using at most `k` stops in between (so at most k + 1 flights), or -1 if that is impossible.',
    language: 'python',
    fnName: 'cheapest_flight',
    starter: `def cheapest_flight(n, flights, src, dst, k):
    # your code here
    pass
`,
    solution: `def cheapest_flight(n, flights, src, dst, k):
    INF = float('inf')
    dist = [INF] * n
    dist[src] = 0
    for _ in range(k + 1):
        nxt = dist[:]
        for u, v, price in flights:
            if dist[u] + price < nxt[v]:
                nxt[v] = dist[u] + price
        dist = nxt
    return dist[dst] if dist[dst] != INF else -1`,
    tests: [
      { args: [4, [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]], 0, 3, 1], expected: 700 },
      { args: [4, [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]], 0, 3, 2], expected: 400, name: 'one more stop is cheaper' },
      { args: [3, [[0, 1, 50], [1, 2, 50], [0, 2, 300]], 0, 2, 0], expected: 300, name: 'no stops allowed' },
      { args: [3, [[0, 1, 5]], 0, 2, 2], expected: -1, name: 'destination unreachable' },
      { args: [4, [[0, 1, 1], [1, 2, 1], [2, 3, 1]], 0, 3, 1], expected: -1, name: 'too many stops needed' },
      { args: [2, [[0, 1, 9]], 0, 0, 0], expected: 0, name: 'already there' },
    ],
    hints: ['"At most k stops" means at most k + 1 flights. A Bellman-Ford round adds one flight to every route.', 'Run exactly k + 1 rounds. In each round read from the old dist and write into a copy, so one round never chains two flights.'],
    combines: ['dijkstra', 'bfs'],
  },
  quiz: [
    {
      prompt: 'After V − 1 rounds, edge A→B still satisfies dist[A] + w < dist[B]. What does that tell you?',
      options: ['A is unreachable', 'A negative cycle is reachable from the source', 'You need one more round and then it converges', 'The graph is not connected'],
      answer: 1,
      explain: 'Without a negative cycle V − 1 rounds make every distance final, so a strictly improving edge proves a reachable negative cycle.',
    },
  ],
};

export default unit;
