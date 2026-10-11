import type { Tone } from '@/engine/types';
import { chipsView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './kth-largest-element-in-a-stream.py?raw';
import harness from './kth-largest-element-in-a-stream.harness.py?raw';
import cases from './kth-largest-element-in-a-stream.cases.json';

const viz = vizOf<{ k: number; nums: number[]; adds: number[] }>({
  id: 'kth-largest-element-in-a-stream',
  title: 'Kth Largest Element in a Stream',
  solution,
  inputs: [
    { key: 'k', label: 'k', kind: 'number', default: 3 },
    { key: 'nums', label: 'starting numbers', kind: 'numbers', default: [4, 5, 8, 2], maxItems: 8 },
    { key: 'adds', label: 'numbers added one by one', kind: 'numbers', default: [3, 5, 10, 9, 4], maxItems: 8 },
  ],
  presets: [
    { label: 'Classic', input: { k: 3, nums: [4, 5, 8, 2], adds: [3, 5, 10, 9, 4] } },
    { label: 'Starts empty', input: { k: 1, nums: [], adds: [-3, -2, -4, 0] } },
    { label: 'Small values ignored', input: { k: 2, nums: [10, 20], adds: [1, 2, 3, 30] } },
  ],
  validate: ({ k, nums, adds }) => {
    if ([...nums, ...adds].some((v) => v === null || !Number.isFinite(v))) return 'Use plain numbers (no null)';
    if (!Number.isInteger(k) || k < 1) return 'k must be a whole number of at least 1';
    if (!adds.length) return 'Add at least one number to the stream';
    return nums.length + 1 < k ? `With k = ${k} you need at least ${k - 1} starting numbers so the k-th largest exists after the first add` : null;
  },
  run({ k, nums, adds }) {
    const r = new TraceRecorder(solution);
    const heap = new MinHeap<number>([]);
    const out: (number | null)[] = [null];
    const view = (items: number[], at: number[] = []) => [
      ...heapView(items, { title: `min-heap (its root is the smallest of the ${k} largest)`, tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }),
      chipsView(out.map((x) => (x === null ? 'None' : x)), { title: 'results of each call' }),
    ];
    const watch = (anchor: string): Watch<number> => (what, snap, at) => {
      const msg = what === 'append' ? `Place ${snap[at[0]]} at the end of the array (index ${at[0]}).` : what === 'up' ? `${snap[at[0]]} is smaller than its parent, so it swaps upward to index ${at[0]}.` : what === 'root' ? `The last element ${snap[0]} is moved to the root; it now sinks to where it belongs.` : `Sift down from index ${at[0]} so every parent is ≤ its children.`;
      r.step(anchor, msg, view(snap, at), {});
    };
    r.step('initK', `Remember k = ${k}. We only ever need the ${k} largest values, so the heap will never hold more than ${k}.`, view([]), {});
    heap.items = [...nums];
    r.step('initHeap', `Copy the starting numbers: [${nums.join(', ')}]. This is just a list so far, not a heap.`, view(heap.items), {});
    heap.heapify(watch('heapify'));
    r.step('heapify', 'heapify turns the list into a min-heap in place: the smallest value is at the root.', view(heap.items, heap.items.length ? [0] : []), {});
    let askedTrim = false;
    while (heap.size > k) {
      r.op();
      if (!askedTrim) {
        askedTrim = true;
        r.predict('trim', `The heap holds ${heap.size} numbers but k = ${k}. Which one is removed?`, ['The smallest (the root)', 'The largest', 'A random one'], 0, 'The root of a min-heap is the smallest. Removing it keeps the k largest numbers.');
      }
      const gone = heap.pop(watch('trim'));
      r.step('trim', `Pop ${gone}, the smallest. The heap now holds ${heap.size} numbers.`, view(heap.items), { removed: gone });
    }
    let askedOver = false;
    let askedTop = false;
    for (const v of adds) {
      r.op();
      heap.push(v, watch('push'));
      r.step('push', `add(${v}): ${v} is pushed and settled in the heap (size ${heap.size}).`, view(heap.items), { val: v });
      if (heap.size > k) {
        if (!askedOver) {
          askedOver = true;
          r.predict('over', `After pushing ${v} the heap has ${heap.size} numbers and k = ${k}. What happens?`, ['Pop the smallest', 'Pop the largest', 'Keep everything'], 0, 'Only the k largest matter, so the smallest of the k + 1 numbers is discarded.');
        }
        const gone = heap.pop(watch('pop'));
        r.step('over', `Too many (${heap.size + 1} > ${k}): pop the smallest, ${gone}.`, view(heap.items), { removed: gone });
      } else {
        r.step('over', `Only ${heap.size} numbers (≤ k = ${k}): nothing to remove.`, view(heap.items), {});
      }
      const top = heap.items[0];
      if (!askedTop) {
        askedTop = true;
        const sorted = [...heap.items].sort((a, b) => a - b);
        r.predictChoice('top', `What does add(${v}) return?`, String(top), [String(sorted[sorted.length - 1] === top ? top + 1 : sorted[sorted.length - 1]), String(top + 1), String(top - 1)], v, `The root is the smallest of the ${k} largest, which is exactly the k-th largest overall.`);
      }
      out.push(top);
      r.step('top', `add returns the root, ${top}: the ${k}-th largest so far.`, view(heap.items, [0]), { result: top });
    }
    return { frames: r.frames, result: out };
  },
  reference({ k, nums, adds }) {
    const all = [...nums];
    const out: (number | null)[] = [null];
    for (const v of adds) {
      all.push(v);
      out.push([...all].sort((a, b) => b - a)[k - 1]);
    }
    return out;
  },
});

export default problem({
  summary: 'Design a class that starts with a list of numbers and a number k. Each time a new number arrives, it must report the k-th largest value seen so far (counting duplicates).',
  example: ['k = 2, start [5, 9]; add 4, add 12, add 10', '5, 9, 10', 'After 4 the two largest are 9 and 5 (answer 5). After 12 they are 12 and 9 (answer 9). After 10 they are 12 and 10 (answer 10).'],
  pattern: ['heap', ['heap', 'sorting', 'binary-search', 'design'], 'You only need the k largest values, and you need the smallest of them quickly. A min-heap of size k keeps exactly that: its root is the k-th largest.', {
    sorting: 'Re-sorting after every add costs O(n log n) per call.',
    'binary-search': 'Keeping a sorted list with binary search still pays O(n) for each insertion.',
    design: 'It is a class, but the data structure inside is a heap.',
  }],
  hints: [
    'If you sorted everything each time, what would the answer be? What is wasteful about that?',
    'You never need values smaller than the k-th largest. How many values do you have to remember?',
    'Keep a min-heap of the k largest. If it grows past k, pop the smallest. The root is the answer.',
  ],
  insight: 'A min-heap capped at size k always has the k-th largest value at its root.',
  brute: 'Store everything and sort on each add: O(n log n) per call.',
  optimal: 'Min-heap of size k: O(log k) per add.',
  walk: ['Store k and heapify the starting numbers.', 'Pop the smallest until at most k numbers remain.', 'On add(val): push val; if the heap is larger than k, pop the smallest.', 'Return the root, heap[0].'],
  edge: ['Starting list shorter than k.', 'Duplicates.', 'Values smaller than the current k-th largest (they are pushed and immediately dropped).', 'k = 1.'],
  works: ['Invariant: after every call the heap contains exactly the k largest values seen so far.', 'The smallest of those is the k-th largest overall, and it sits at the root.'],
  time: ['O(log k)', 'Each add is one push and at most one pop on a heap of size ≤ k + 1.'],
  space: ['O(k)', 'The heap never holds more than k + 1 numbers.'],
  solution,
  cases,
  sig: 'class KthLargest:\n    def __init__(self, k, nums):\n        pass\n\n    def add(self, val):\n        # return the k-th largest value seen so far\n        pass\n',
  harness,
  viz,
  fromArgs: ([, args]) => {
    const a = args as unknown[][];
    return { k: a[0][0] as number, nums: a[0][1] as number[], adds: a.slice(1).map((x) => x[0] as number) };
  },
});
