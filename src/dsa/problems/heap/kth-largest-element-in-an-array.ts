import type { Tone } from '@/engine/types';
import { arrayView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './kth-largest-element-in-an-array.py?raw';
import cases from './kth-largest-element-in-an-array.cases.json';

const viz = vizOf<{ nums: number[]; k: number }>({
  id: 'kth-largest-element-in-an-array',
  title: 'Kth Largest Element in an Array',
  solution,
  inputs: [
    { key: 'nums', label: 'numbers', kind: 'numbers', default: [3, 2, 1, 5, 6, 4], maxItems: 12 },
    { key: 'k', label: 'k', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Third largest', input: { nums: [3, 2, 1, 5, 6, 4], k: 3 } },
    { label: 'Duplicates', input: { nums: [3, 2, 3, 1, 2, 4, 5, 5, 6], k: 4 } },
    { label: 'Smallest', input: { nums: [7, 2, 9, 4], k: 4 } },
  ],
  validate: ({ nums, k }) => {
    if (!nums.length || nums.some((v) => v === null || !Number.isFinite(v))) return 'Enter at least one plain number';
    return Number.isInteger(k) && k >= 1 && k <= nums.length ? null : `k must be between 1 and ${nums.length}`;
  },
  run({ nums, k }) {
    const r = new TraceRecorder(solution);
    const heap = new MinHeap<number>([]);
    let pos = -1;
    const view = (items: number[], at: number[] = []) => [
      arrayView(nums, { title: 'numbers (scanned left to right)', pointers: pos >= 0 ? { i: pos } : {}, tones: Object.fromEntries(nums.map((_, i) => [i, (i < pos ? 'done' : i === pos ? 'active' : 'default') as Tone])) }),
      ...heapView(items, { title: `min-heap of the ${k} largest so far`, tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }),
    ];
    const watch = (anchor: string): Watch<number> => (what, snap, at) =>
      r.step(anchor, what === 'append' ? `Place ${snap[at[0]]} at the end of the array.` : what === 'up' ? `${snap[at[0]]} swaps upward: it is smaller than its parent.` : what === 'root' ? `The last element moves to the root and sinks down.` : `Sift down from index ${at[0]}.`, view(snap, at), {});
    r.step('init', `Start with an empty min-heap. We will keep only the ${k} largest numbers in it.`, view([]), {});
    let askedPush = false;
    let askedPop = false;
    for (let i = 0; i < nums.length; i++) {
      r.op();
      pos = i;
      const num = nums[i];
      if (!askedPush && heap.size >= 1) {
        askedPush = true;
        r.predictChoice('push', `The heap holds [${heap.items.join(', ')}] and ${num} arrives. After pushing, which value is at the root?`, String(Math.min(num, heap.items[0])), [String(Math.max(num, heap.items[0])), String(num + 1), String(heap.items[0] - 1)], num, 'The root of a min-heap is always the smallest value in it.');
      }
      heap.push(num, watch('push'));
      r.step('push', `Push ${num}. The heap has ${heap.size} number${heap.size > 1 ? 's' : ''}.`, view(heap.items), { num });
      if (heap.size > k) {
        if (!askedPop) {
          askedPop = true;
          r.predict('over', `The heap holds ${heap.size} numbers but we only keep ${k}. Which is removed?`, ['The smallest (the root)', 'The largest', 'The one just added'], 0, 'The smallest of the k + 1 numbers cannot be among the k largest.');
        }
        const gone = heap.pop(watch('pop'));
        r.step('over', `Pop the smallest, ${gone}.`, view(heap.items), { removed: gone });
      } else {
        r.step('over', `Only ${heap.size} ≤ k numbers: nothing to remove.`, view(heap.items), {});
      }
    }
    pos = -1;
    const res = heap.items[0];
    r.step('done', `The root, ${res}, is the smallest of the ${k} largest numbers: the ${k}-th largest overall.`, view(heap.items, [0]), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ nums, k }) {
    return [...nums].sort((a, b) => b - a)[k - 1];
  },
});

export default problem({
  summary: 'Given an unsorted list of numbers and a number k, return the k-th largest value, counting duplicates (in [5, 5, 3], the 2nd largest is 5). You are not asked for the k-th distinct value.',
  example: ['nums [9, 4, 7, 4, 1], k = 2', '7', 'Sorted from largest: 9, 7, 4, 4, 1. The second is 7.'],
  pattern: ['heap', ['heap', 'sorting', 'binary-search', 'bucket-sort'], 'Keep only the k largest numbers in a min-heap. Whatever is on top of that heap is the k-th largest.', {
    sorting: 'Sorting is simple but does more work than needed: O(n log n).',
    'binary-search': 'Binary search on the value works but needs counting passes.',
    'bucket-sort': 'Values are not small bounded integers.',
  }],
  hints: [
    'Sorting works. Is there a way to avoid ordering the whole list?',
    'You only care about the k largest numbers. What is the smallest of those?',
    'Maintain a min-heap of size k: push each number, pop when the size exceeds k. The root is the answer.',
  ],
  insight: 'A min-heap of the k largest numbers has the k-th largest value at its root.',
  brute: 'Sort descending and take index k − 1: O(n log n).',
  optimal: 'Min-heap of size k: O(n log k) time, O(k) space. (Quickselect achieves O(n) on average.)',
  walk: ['Create an empty heap.', 'For each number, push it.', 'If the heap grows beyond k, pop the smallest.', 'After the scan return heap[0].'],
  edge: ['k = 1 (the maximum) and k = n (the minimum).', 'Duplicates.', 'Negative numbers.', 'A single element.'],
  works: ['After processing a prefix, the heap holds exactly the k largest of that prefix.', 'After the whole list, the smallest of those k is the k-th largest.'],
  time: ['O(n log k)', 'n pushes and pops on a heap of size ≤ k + 1.'],
  space: ['O(k)', 'The heap.'],
  solution,
  cases,
  sig: 'def find_kth_largest(nums, k):\n    # return the k-th largest value (duplicates count)\n    pass\n',
  viz,
  fromArgs: ([nums, k]) => ({ nums, k }),
});
