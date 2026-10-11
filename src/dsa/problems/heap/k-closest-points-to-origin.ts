import type { Tone } from '@/engine/types';
import { chipsView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './k-closest-points-to-origin.py?raw';
import cases from './k-closest-points-to-origin.cases.json';

type Entry = [number, number, number];

const viz = vizOf<{ points: number[][]; k: number }>({
  id: 'k-closest-points-to-origin',
  title: 'K Closest Points to Origin',
  solution,
  inputs: [
    { key: 'points', label: 'points (one "x y" per line)', kind: 'grid', default: [[1, 3], [-2, 2], [5, 1], [0, 1], [3, 3]], maxItems: 20 },
    { key: 'k', label: 'k', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Two closest', input: { points: [[1, 3], [-2, 2], [5, 1], [0, 1], [3, 3]], k: 2 } },
    { label: 'Negatives', input: { points: [[-5, -5], [0, 1], [-1, 0], [3, 3]], k: 2 } },
    { label: 'Everything', input: { points: [[1, 1], [2, 2], [3, 3]], k: 3 } },
  ],
  validate: ({ points, k }) => {
    if (points.some((p) => p.length !== 2 || p.some((v) => typeof v !== 'number'))) return 'Each point needs exactly two numbers: x y';
    if (!Number.isInteger(k) || k < 1 || k > points.length) return `k must be between 1 and ${points.length}`;
    return null;
  },
  run({ points, k }) {
    const r = new TraceRecorder(solution);
    const heap = new MinHeap<Entry>([]);
    let current = '';
    const view = (items: Entry[], at: number[] = []) => [
      ...heapView(items.map((e) => e[0]), { title: 'max-heap on distance, stored as −distance² (root = farthest kept point)', tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }),
      chipsView(items.map((e) => `(${e[1]}, ${e[2]}) d²=${-e[0]}`), { title: 'points currently kept (heap order)' }),
      chipsView(current ? [current] : [], { title: 'point being processed' }),
    ];
    const snapText = (e: Entry) => `(${e[1]}, ${e[2]}) with −d² = ${e[0]}`;
    const watch = (anchor: string): Watch<Entry> => (what, snap, at) =>
      r.step(anchor, what === 'append' ? `Place ${snapText(snap[at[0]])} at the end of the array.` : what === 'up' ? `${snapText(snap[at[0]])} is farther than its parent, so it swaps upward.` : what === 'root' ? `The last entry moves to the root and sinks down.` : `Sift down from index ${at[0]}.`, view(snap, at), {});
    r.step('init', `Keep a heap of at most k = ${k} points. It is keyed by negative squared distance, so its root is the FARTHEST of the kept points.`, view([]), {});
    let askedNeg = false;
    let askedDist = false;
    let askedPop = false;
    for (const [x, y] of points) {
      r.op();
      current = `(${x}, ${y})`;
      const dist = x * x + y * y;
      if (!askedDist) {
        askedDist = true;
        r.predictChoice('dist', `What is the squared distance of (${x}, ${y}) from the origin?`, String(dist), [String(Math.abs(x) + Math.abs(y)), String((x + y) * (x + y)), String(dist + 1)], x + y, 'x² + y². We skip the square root because comparing squared distances gives the same order.');
      }
      r.step('dist', `(${x}, ${y}): d² = ${x}² + ${y}² = ${dist}.`, view(heap.items), { dist });
      if (!askedNeg) {
        askedNeg = true;
        r.predict('neg', 'The point is pushed as −d². Which point will sit at the root of this min-heap?', ['The farthest one (most negative)', 'The nearest one', 'The first one pushed'], 0, 'Negating reverses the order, so the smallest key, the root, belongs to the largest distance.');
      }
      heap.push([-dist, x, y], watch('push'));
      r.step('push', `Push (−${dist}, ${x}, ${y}). The heap now holds ${heap.size} point${heap.size > 1 ? 's' : ''}.`, view(heap.items), {});
      if (heap.size > k) {
        if (!askedPop) {
          askedPop = true;
          r.predict('pop', `The heap holds ${heap.size} points but k = ${k}. Which point is popped?`, ['The farthest (the root)', 'The nearest', 'The newest'], 0, 'The root is the farthest point, and the farthest of k + 1 points cannot be among the k closest.');
        }
        const gone = heap.pop(watch('pop'));
        r.step('over', `Too many points: pop the farthest, (${gone[1]}, ${gone[2]}).`, view(heap.items), { removed: `${gone[1]},${gone[2]}` });
      } else {
        r.step('over', `Only ${heap.size} ≤ k: keep everything.`, view(heap.items), {});
      }
    }
    current = '';
    const res = heap.items.map((e) => [e[1], e[2]]);
    r.step('done', `The ${k} closest points are the ones left in the heap: ${res.map((p) => `(${p[0]}, ${p[1]})`).join(', ')}.`, view(heap.items), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ points, k }) {
    const heap = new MinHeap<Entry>([]);
    for (const [x, y] of points) {
      heap.push([-(x * x + y * y), x, y]);
      if (heap.size > k) heap.pop();
    }
    return heap.items.map((e) => [e[1], e[2]]);
  },
});

export default problem({
  summary: 'You get a list of points on a plane and a number k. Return the k points closest to the origin (0, 0), measured by straight-line distance. The answer may be in any order.',
  example: ['points [(3, 3), (1, 0), (-2, 1)], k = 2', '[(1, 0), (-2, 1)]', 'Squared distances are 18, 1 and 5.'],
  pattern: ['heap', ['heap', 'sorting', 'binary-search', 'bucket-sort'], 'You want the k smallest distances out of n. Keeping a max-heap of the k best so far lets you discard the worst in O(log k) whenever a better point arrives.', {
    sorting: 'Sorting works in O(n log n), but a heap of size k is faster when k is small.',
    'binary-search': 'Binary searching on a distance threshold is possible but needs repeated counting passes.',
    'bucket-sort': 'Distances are not bounded small integers.',
  }],
  hints: [
    'Do you need the square root to compare distances?',
    'You only need the k best candidates at any moment. What should you throw away when you have k + 1?',
    'Keep a heap of size k ordered so the farthest kept point is on top: push (−d², x, y) and pop when the size exceeds k.',
  ],
  insight: 'A max-heap of size k whose root is the worst candidate lets you evict the farthest point in O(log k).',
  brute: 'Sort all points by distance and take k: O(n log n).',
  optimal: 'Max-heap of size k: O(n log k) time, O(k) space.',
  walk: ['For each point compute d² = x² + y².', 'Push (−d², x, y) so that the farthest point is at the root.', 'If the heap has more than k points, pop the root.', 'The points left in the heap are the answer.'],
  edge: ['k equals the number of points.', 'The origin itself.', 'Negative coordinates.', 'Several points at the same distance (order is free).'],
  works: ['The heap always holds the k closest points seen so far: a new point either displaces the current farthest or is itself the farthest and is popped.', 'After the last point those k are the k closest overall.'],
  time: ['O(n log k)', 'One push and at most one pop per point on a heap of size k + 1.'],
  space: ['O(k)', 'The heap.'],
  solution,
  cases,
  sig: 'def k_closest(points, k):\n    # points is a list of [x, y]; return the k closest to the origin (any order)\n    pass\n',
  viz,
  fromArgs: ([points, k]) => ({ points, k }),
});
