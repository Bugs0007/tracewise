import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, graphView, hashMapView } from '@/dsa/viz/prims';
import { MinHeap } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './min-cost-to-connect-all-points.py?raw';
import cases from './min-cost-to-connect-all-points.cases.json';

type Entry = [number, number];

const viz = vizOf<{ points: number[][] }>({
  id: 'min-cost-to-connect-all-points',
  title: 'Min Cost to Connect All Points',
  solution,
  inputs: [{ key: 'points', label: 'points (one "x y" per line)', kind: 'grid', default: [[0, 0], [3, 2], [5, 1], [0, 4], [6, 5]], maxItems: 14 }],
  presets: [
    { label: 'Five points', input: { points: [[0, 0], [3, 2], [5, 1], [0, 4], [6, 5]] } },
    { label: 'Square', input: { points: [[0, 0], [0, 2], [2, 0], [2, 2]] } },
    { label: 'Cluster and outlier', input: { points: [[0, 0], [1, 0], [0, 1], [1, 1], [10, 10]] } },
    { label: 'One point', input: { points: [[2, 3]] } },
  ],
  validate: ({ points }) => (points.length > 7 ? 'Use at most 7 points' : points.some((p) => p.length !== 2 || p.some((v) => typeof v !== 'number')) ? 'Each point needs exactly two numbers: x y' : null),
  run({ points }) {
    const r = new TraceRecorder(solution);
    const n = points.length;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const lo = [Math.min(...xs), Math.min(...ys)];
    const span = [Math.max(1, Math.max(...xs) - lo[0]), Math.max(1, Math.max(...ys) - lo[1])];
    const pos = Object.fromEntries(points.map((p, i) => [String(i), { x: 40 + ((p[0] - lo[0]) / span[0]) * 300, y: 250 - ((p[1] - lo[1]) / span[1]) * 200 }]));
    const ids = points.map((_, i) => String(i));
    const inTree = new Set<number>();
    const tree: EdgeSpec[] = [];
    const heap = new MinHeap<Entry>([]);
    const via = new Map<string, number>();
    let total = 0;
    let askedPop = false;
    let askedStale = false;
    let askedPay = false;
    const view = (hot: number | null = null) => {
      const tones: Record<string, Tone> = {};
      inTree.forEach((i) => (tones[String(i)] = 'done'));
      if (hot !== null) tones[String(hot)] = 'active';
      return [
        graphView(ids, tree, { title: 'points (positions as given); lines = cables chosen', pos, tones, size: { width: 380, height: 290 } }),
        chipsView(heap.items.map(([d, j]) => `${d} → #${j}`), { title: 'heap: (cost, point) candidates' }),
        hashMapView({ 'points connected': `${inTree.size} of ${n}`, 'total cost': total }),
      ];
    };
    r.step('tree', `Prim's algorithm: grow one connected group starting from point 0. ${points.map((p, i) => `#${i}=(${p[0]},${p[1]})`).join('  ')}.`, view(), {});
    heap.push([0, 0]);
    via.set('0,0', -1);
    r.step('heap', 'The heap holds (cost, point). Point 0 joins for free: cost 0.', view(), {});
    while (inTree.size < n) {
      r.op();
      const [cost, i] = heap.pop();
      r.step('pop', `Pop the cheapest candidate: point #${i} at cost ${cost}.`, view(i), { cost, i });
      if (!askedPop) {
        askedPop = true;
        r.predict('pop', 'The heap returns the cheapest way to attach a new point to the group. Is the cheapest candidate always safe to take?', ['Yes: the cheapest edge leaving the group belongs to some cheapest tree', 'No: it might be wasted later'], 0, 'This is the cut property of minimum spanning trees: the lightest edge crossing from the group to the rest is always safe.');
      }
      if (inTree.has(i)) {
        if (!askedStale) {
          askedStale = true;
          r.predict('stale', `Point #${i} is already in the group. What do we do with this candidate?`, ['Skip it (an old, now useless cable)', 'Add its cost again', 'Remove the point'], 0, 'Connecting a point that is already connected would only create a cycle.');
        }
        r.step('skip', `#${i} is already connected: skip.`, view(), {});
        continue;
      }
      inTree.add(i);
      const from = via.get(`${cost},${i}`) ?? -1;
      if (from >= 0) tree.push({ from: String(from), to: String(i), w: cost });
      if (!askedPay) {
        askedPay = true;
        r.step('add', `Add #${i} to the group.`, view(i), {});
        r.predictChoice('pay', `Before adding it the total is ${total}. What is it after paying ${cost} for #${i}?`, String(total + cost), [String(total), String(total + cost + 1), String(total * 2 + cost)], i, 'Each point joins the group exactly once and pays the cost of its cable.');
      }
      total += cost;
      r.step('pay', `Pay ${cost}. Total cost = ${total}.`, view(i), { total });
      let pushed = 0;
      for (let j = 0; j < n; j++) {
        if (!inTree.has(j)) {
          const d = Math.abs(points[i][0] - points[j][0]) + Math.abs(points[i][1] - points[j][1]);
          heap.push([d, j]);
          if (!via.has(`${d},${j}`)) via.set(`${d},${j}`, i);
          pushed++;
        }
      }
      r.step('scan', pushed ? `Offer the ${pushed} unconnected point${pushed > 1 ? 's' : ''} as candidates, each with its Manhattan distance to #${i} (|Δx| + |Δy|).` : 'Every point is connected.', view(i), {});
    }
    r.step('done', `All ${n} point${n === 1 ? ' is' : 's are'} connected at a total cost of ${total}.`, view(), { result: total });
    return { frames: r.frames, result: total };
  },
  reference({ points }) {
    const n = points.length;
    const dist = (a: number, b: number) => Math.abs(points[a][0] - points[b][0]) + Math.abs(points[a][1] - points[b][1]);
    const edges: [number, number, number][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) edges.push([dist(a, b), a, b]);
    edges.sort((p, q) => p[0] - q[0]);
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : find(parent[x]));
    let sum = 0;
    for (const [d, a, b] of edges) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent[ra] = rb;
        sum += d;
      }
    }
    return sum;
  },
});

export default problem({
  summary: 'You are given points on a plane. Connecting two points costs the Manhattan distance between them (|x₁ − x₂| + |y₁ − y₂|). Find the smallest total cost of cables that makes all points connected (directly or through other points).',
  example: ['points (0,0), (2,0), (5,0)', '5', 'Connect (0,0)-(2,0) for 2 and (2,0)-(5,0) for 3.'],
  pattern: ['mst', ['mst', 'dijkstra', 'union-find', 'greedy'], 'Connecting every point with the least total cable is a minimum spanning tree. Prim’s algorithm grows one tree, always adding the cheapest cable to a new point; Kruskal’s sorts all cables and uses union-find.', {
    dijkstra: 'Dijkstra finds shortest paths from one source, not the cheapest set of cables joining everything.',
    'union-find': 'Kruskal’s algorithm uses union-find, which is the other route to a spanning tree.',
    greedy: 'Both algorithms are greedy; the problem class is minimum spanning tree.',
  }],
  hints: [
    'You need n − 1 cables and no cycles. What structure is that?',
    'If you already have a connected group, which cable is always safe to add next?',
    'Prim with a heap of (cost, point): pop the cheapest, skip points already connected, add its cost, and push the distance from the new point to every unconnected point.',
  ],
  insight: 'The cheapest cable leaving the connected group can always be used; repeat until everything is connected.',
  brute: 'Try every spanning tree: exponential.',
  optimal: 'Prim with a heap: O(n² log n) for the complete graph (or Kruskal in O(n² log n)).',
  walk: ['in_tree = {}; heap = [(0, 0)]; total = 0.', 'While in_tree has fewer than n points: pop (cost, i).', 'If i is already in the tree, skip it; otherwise add it and add cost to total.', 'Push (distance(i, j), j) for every j not in the tree.'],
  edge: ['One point (cost 0).', 'Duplicate coordinates (cost 0 cables).', 'Collinear points.', 'Negative coordinates.'],
  works: ['By the cut property the lightest edge between the tree and the rest belongs to a minimum spanning tree.', 'Each iteration adds exactly one point, so after n pops the tree spans all points.'],
  time: ['O(n² log n)', 'n points, up to n candidates pushed per point.'],
  space: ['O(n²)', 'The heap may hold many stale candidates.'],
  solution,
  cases,
  sig: 'def min_cost_connect_points(points):\n    # points is a list of [x, y]; return the smallest total Manhattan cable length that connects all of them\n    pass\n',
  viz,
  fromArgs: ([points]) => ({ points }),
});
