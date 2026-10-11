import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, graphView, hashMapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './network-delay-time.py?raw';
import cases from './network-delay-time.cases.json';

const e = (a: number, b: number, w: number): EdgeSpec => ({ from: String(a), to: String(b), w });
type Entry = [number, number];

const viz = vizOf<{ n: number; k: number; edges: EdgeSpec[] }>({
  id: 'network-delay-time',
  title: 'Network Delay Time',
  solution,
  inputs: [
    { key: 'n', label: 'nodes (1 … n)', kind: 'number', default: 5 },
    { key: 'k', label: 'start node k', kind: 'number', default: 1 },
    { key: 'edges', label: 'links a->b:time', kind: 'edges', default: [e(1, 2, 4), e(1, 3, 1), e(3, 2, 2), e(2, 4, 5), e(4, 5, 1)], maxItems: 10 },
  ],
  presets: [
    { label: 'Stale entry', input: { n: 5, k: 1, edges: [e(1, 2, 4), e(1, 3, 1), e(3, 2, 2), e(2, 4, 5), e(4, 5, 1)] } },
    { label: 'Unreachable node', input: { n: 3, k: 1, edges: [e(1, 2, 5)] } },
    { label: 'Shortcut', input: { n: 3, k: 1, edges: [e(1, 2, 10), e(1, 3, 2), e(3, 2, 3)] } },
    { label: 'Single node', input: { n: 1, k: 1, edges: [] } },
  ],
  validate: ({ n, k, edges }) => {
    if (!Number.isInteger(n) || n < 1 || n > 7) return 'Use 1 to 7 nodes';
    if (!Number.isInteger(k) || k < 1 || k > n) return `The start node must be between 1 and ${n}`;
    return edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) < 1 || Number(x.to) < 1 || Number(x.from) > n || Number(x.to) > n || !(x.w !== undefined && x.w >= 1 && Number.isInteger(x.w))) ? `Links look like 1->2:4 with nodes 1 to ${n} and a whole-number time of at least 1` : null;
  },
  run({ n, k, edges }) {
    const r = new TraceRecorder(solution);
    const ids = Array.from({ length: n }, (_, i) => String(i + 1));
    const graph = new Map<number, [number, number][]>(ids.map((id) => [Number(id), []]));
    const dist = new Map<number, number>();
    const heap = new MinHeap<Entry>([]);
    const tones: Record<string, Tone> = {};
    const edgeTones: Record<string, Tone> = {};
    let askedPop = false;
    let askedStale = false;
    const view = (items: Entry[] = heap.items, at: number[] = []) => [
      graphView(ids, edges, { title: 'network (arrow label = travel time; badge = settled arrival time)', directed: true, layout: 'circle', size: { width: 400, height: 280 }, tones, edgeTones, badges: Object.fromEntries([...dist.entries()].map(([node, d]) => [String(node), String(d)])) }),
      chipsView(items.map(([d, node]) => `(${d}, ${node})`), { title: 'heap of (time, node) candidates', tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }),
      hashMapView(Object.fromEntries([...dist.entries()].map(([node, d]) => [`node ${node}`, d])), { title: 'dist: final arrival times' }),
    ];
    const watch: Watch<Entry> = (what, snap, at) => r.step('push', what === 'append' ? `Add (${snap[at[0]][0]}, ${snap[at[0]][1]}) at the end of the heap array.` : `(${snap[at[0]][0]}, ${snap[at[0]][1]}) swaps upward: it is smaller than its parent.`, view(snap, at), {});
    for (const x of edges) graph.get(Number(x.from))!.push([Number(x.to), x.w as number]);
    r.step('graph', 'Build an adjacency list: for each link u → v with time w, store (v, w) under u.', view(), {});
    heap.push([0, k]);
    r.step('heap', `The signal starts at node ${k} at time 0, so the heap holds (0, ${k}).`, view(), {});
    while (heap.size) {
      r.op();
      const [d, node] = heap.pop();
      if (!askedPop) {
        askedPop = true;
        r.step('pop', `Pop the smallest candidate: (${d}, ${node}).`, view(), { d, node });
        r.predict('pop', 'The heap always gives the candidate with the smallest time. Is that arrival time final once popped?', ['Yes, the first pop of a node is its shortest time', 'No, a later pop may be shorter'], 0, 'All edge times are positive, so a longer route can never turn into a shorter one. The first time a node is popped, its time is final.');
      } else {
        r.step('pop', `Pop (${d}, ${node}).`, view(), { d, node });
      }
      if (dist.has(node)) {
        if (!askedStale) {
          askedStale = true;
          r.predict('stale', `Node ${node} was already settled with time ${dist.get(node)}, but this entry says ${d}. What do we do?`, ['Ignore it (a stale, longer route)', 'Replace the stored time', 'Settle the node again'], 0, 'The earlier pop had a smaller time, so this entry is a leftover from a longer route.');
        }
        r.step('skipRet', `Node ${node} is already settled (${dist.get(node)} ≤ ${d}): skip this stale entry.`, view(), {});
        continue;
      }
      dist.set(node, d);
      tones[String(node)] = 'done';
      r.step('settle', `Settle node ${node}: it receives the signal at time ${d}.`, view(), { node, d });
      for (const [nxt, w] of graph.get(node)!) {
        if (!dist.has(nxt)) {
          heap.push([d + w, nxt], watch);
          tones[String(nxt)] = tones[String(nxt)] ?? 'frontier';
          edgeTones[`${node}>${nxt}`] = 'frontier';
          r.step('push', `Via ${node} → ${nxt} (${w}) the signal could reach ${nxt} at ${d} + ${w} = ${d + w}. Push (${d + w}, ${nxt}).`, view(), {});
        }
      }
    }
    const res = dist.size === n ? Math.max(...dist.values()) : -1;
    r.predictChoice('done', dist.size === n ? 'Every node was settled. What is the answer?' : `Only ${dist.size} of ${n} nodes were settled. What is the answer?`, String(res), [String(res + 1), dist.size === n ? String(Math.min(...dist.values())) : '0', String(res === -1 ? 1 : -1)], n, dist.size === n ? 'The signal has reached everyone when it reaches the last node: the largest arrival time.' : 'If any node is never reached, the answer is -1.');
    r.step('done', res === -1 ? 'Some node is unreachable: -1.' : `The last node is reached at time ${res}.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ n, k, edges }) {
    const d = Array(n + 1).fill(Infinity) as number[];
    d[k] = 0;
    for (let i = 0; i < n; i++) for (const x of edges) if (d[Number(x.from)] + (x.w as number) < d[Number(x.to)]) d[Number(x.to)] = d[Number(x.from)] + (x.w as number);
    const best = Math.max(...d.slice(1));
    return best === Infinity ? -1 : best;
  },
});

export default problem({
  summary: 'A network has n nodes numbered 1 to n and one-way links, each with a travel time. A signal is sent from node k. Return how long it takes until every node has received it, or -1 if some node can never receive it.',
  example: ['n = 3, start 1, links 1→2 (time 2), 2→3 (time 3)', '5', 'Node 2 hears at time 2 and node 3 at time 5, so everyone has it after 5.'],
  pattern: ['dijkstra', ['dijkstra', 'bfs', 'dfs', 'topo-sort'], 'Travel times are positive and differ, so the shortest time to each node is found by Dijkstra: always settle the unsettled node that is currently closest, using a heap.', {
    bfs: 'BFS only works when every link costs the same.',
    dfs: 'DFS would explore routes in an arbitrary order and could pick long ones first.',
    'topo-sort': 'The graph may contain cycles, and ordering is not the question.',
  }],
  hints: [
    'What do you need to know about each node? How is that different from a plain BFS?',
    'If you always handle the closest node you have not finished, what can you say about its distance?',
    'Dijkstra: a heap of (time, node). Pop the smallest; skip it if the node is settled; otherwise settle it and push (time + w, neighbour) for every unsettled neighbour. The answer is the largest settled time, or −1 if not all are settled.',
  ],
  insight: 'With positive weights, the closest unsettled node already has its final distance, so a heap lets you settle nodes in order of distance.',
  brute: 'Bellman-Ford: relax every link n times: O(V · E).',
  optimal: 'Dijkstra with a heap: O(E log V) time, O(V + E) space.',
  walk: ['Build graph[u] = list of (v, w).', 'Start with heap [(0, k)] and an empty dist dict.', 'Pop (d, node); skip if node is in dist.', 'Set dist[node] = d and push (d + w, nxt) for each neighbour not in dist.', 'Return the max of dist if all n nodes are in it, else −1.'],
  edge: ['A single node (answer 0).', 'A node that cannot be reached.', 'Several routes to the same node (stale heap entries).', 'Cycles in the graph.'],
  works: ['The heap pops candidates in non-decreasing time. Positive weights guarantee no later candidate can beat the first pop of a node.', 'The latest settled time is the moment the last node gets the signal.'],
  time: ['O(E log V)', 'Each link causes at most one push.'],
  space: ['O(V + E)', 'Graph, heap and dist.'],
  solution,
  cases,
  sig: 'def network_delay_time(times, n, k):\n    # times is a list of [u, v, w] one-way links, nodes are 1 … n; return the time until all nodes have the signal, or -1\n    pass\n',
  viz,
  fromArgs: ([times, n, k]) => ({ n, k, edges: (times as number[][]).map(([u, v, w]) => e(u, v, w)) }),
});
