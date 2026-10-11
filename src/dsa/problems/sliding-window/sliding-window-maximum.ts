import type { Tone } from '@/engine/types';
import { arrayView, chipsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './sliding-window-maximum.py?raw';
import cases from './sliding-window-maximum.cases.json';

const viz = vizOf<{ nums: number[]; k: number }>({
  id: 'sliding-window-maximum',
  title: 'Sliding Window Maximum',
  solution,
  inputs: [
    { key: 'nums', label: 'nums', kind: 'numbers', default: [3, 1, 4, 1, 5, 9, 2, 6], maxItems: 14 },
    { key: 'k', label: 'window size k', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'k = 3', input: { nums: [3, 1, 4, 1, 5, 9, 2, 6], k: 3 } },
    { label: 'Decreasing', input: { nums: [9, 8, 7, 6, 5], k: 2 } },
    { label: 'Increasing', input: { nums: [1, 2, 3, 4, 5], k: 2 } },
    { label: 'k = 1', input: { nums: [4, 2, 9], k: 1 } },
  ],
  validate: ({ nums, k }) => (!Number.isInteger(k) || k < 1 ? 'k must be a whole number of at least 1' : k > nums.length ? `k cannot be larger than the list (${nums.length})` : null),
  run({ nums, k }) {
    const r = new TraceRecorder(solution);
    const out: number[] = [];
    const dq: number[] = [];
    const view = (i: number, hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      dq.forEach((d) => (tones[d] = 'frontier'));
      if (hot && i < nums.length) tones[i] = hot;
      return [
        arrayView(nums, { title: `nums (window size ${k})`, tones, pointers: i < nums.length ? { i } : undefined, window: i >= 0 && i < nums.length ? { from: Math.max(0, i - k + 1), to: i, label: 'window', tone: 'active' } : undefined }),
        chipsView(dq.map((d) => nums[d]), { title: 'deque of candidates (indices kept in decreasing value; front is the max)', startLabel: 'front', subs: dq.map((d) => `#${d}`), emptyText: 'empty' }),
        chipsView(out, { title: 'window maximums so far', emptyText: 'none yet', tones: Object.fromEntries(out.map((_, q) => [q, 'found' as Tone])) }),
      ];
    };
    r.step('init', 'out collects the maximum of each window.', view(-1), {});
    r.step('dq', 'The deque holds indices whose values are in decreasing order: the front is always the current window maximum.', view(-1), {});
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i];
      r.op();
      let smaller = 0;
      for (let q = dq.length - 1; q >= 0 && nums[dq[q]] <= x; q--) smaller++;
      r.step('loop', `Next value x = ${x} (index ${i}).`, view(i, 'active'), { i, x });
      r.predictChoice('pop', `How many values at the back of the deque are ≤ ${x} and get removed?`, String(smaller), [String(smaller + 1), String(Math.max(0, smaller - 1) === smaller ? smaller + 2 : Math.max(0, smaller - 1)), String(dq.length + 1)], i, 'A smaller value behind a bigger newcomer can never be the maximum of any window again, so it is discarded.');
      while (dq.length && nums[dq[dq.length - 1]] <= x) {
        const gone = dq.pop()!;
        r.step('popBack', `${nums[gone]} (index ${gone}) is ≤ ${x}: it can never be a maximum again. Remove it from the back.`, view(i, 'compare'), { removed: nums[gone] });
      }
      dq.push(i);
      r.step('push', `Add index ${i} to the back.`, view(i, 'active'), { dq: JSON.stringify(dq) });
      if (dq[0] <= i - k) {
        const old = dq.shift()!;
        r.step('popFront', `The front (index ${old}) fell out of the window: remove it.`, view(i, 'compare'), { removed: old });
      }
      if (i >= k - 1) {
        r.predictChoice('max', `The window is full. Which value is its maximum?`, String(nums[dq[0]]), [...nums.slice(i - k + 1, i + 1).filter((v) => v !== nums[dq[0]]).map(String), String(nums[dq[0]] + 1), String(nums[dq[0]] - 1)], i, 'The deque is in decreasing order, so its front is the largest value in the window.');
        out.push(nums[dq[0]]);
        r.step('record', `The window [${i - k + 1}..${i}] has maximum ${nums[dq[0]]} (the front of the deque).`, view(i, 'found'), { out: JSON.stringify(out) });
      }
    }
    r.step('done', `All windows done: ${JSON.stringify(out)}.`, view(nums.length), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ nums, k }) {
    const out: number[] = [];
    for (let i = 0; i + k <= nums.length; i++) out.push(Math.max(...nums.slice(i, i + k)));
    return out;
  },
});

export default problem({
  summary: 'A window of fixed size k slides across a list one step at a time. Report the largest value inside the window at every position.',
  example: ['nums = [4, 2, 8, 1, 6], k = 3', '[8, 8, 8]', 'The windows [4,2,8], [2,8,1], [8,1,6] all have 8 as their maximum.'],
  pattern: ['monotonic-stack', ['monotonic-stack', 'sliding-window', 'heap', 'prefix-sum'], 'Keep a deque whose values only decrease from front to back. The front is the window maximum, and anything smaller than a newcomer can never matter again.', {
    'sliding-window': 'The window is part of the problem, but the key data structure is the monotonic deque that makes each step O(1).',
    heap: 'A max-heap works in O(n log n) but needs lazy deletion of expired items. The deque is O(n).',
    'prefix-sum': 'Maximums do not compose like sums, so prefix sums do not apply.',
  }],
  hints: [
    'Recomputing the maximum of every window costs O(n·k). What do you really need to remember from older values?',
    'If a new value is bigger than some older value in the window, can the older one ever be the maximum again?',
    'Keep a deque of indices with decreasing values. Pop from the back while the new value is bigger, pop from the front when the index leaves the window, and read the front.',
  ],
  insight: 'A monotonic deque keeps only candidates that could still be a maximum; the front is the answer for the window.',
  brute: 'Take the max of each window: O(n·k).',
  optimal: 'Monotonic deque of indices: O(n) time, O(k) space.',
  walk: ['For each index i, remove indices from the back of the deque while their values are ≤ nums[i].', 'Append i to the back.', 'If the front index is outside the window (≤ i − k), remove it from the front.', 'Once i ≥ k − 1 the window is complete: append nums[front] to the output.'],
  edge: ['k = 1: the output is the input.', 'k equals the length: one window, the global max.', 'Equal values (≤ pops them; either rule works for correctness).', 'Strictly decreasing input: the deque keeps everything.'],
  works: ['Invariant: the deque contains exactly the indices that are the maximum of some suffix of the current window, in decreasing value order. The front is therefore the window maximum.', 'Each index is pushed once and popped at most once, so the total work is linear.'],
  time: ['O(n)', 'Every index enters and leaves the deque at most once.'],
  space: ['O(k)', 'The deque never holds more than k indices.'],
  solution,
  cases,
  sig: 'from collections import deque\n\n\ndef max_sliding_window(nums, k):\n    # the maximum of every window of size k\n    pass\n',
  viz,
  fromArgs: ([nums, k]) => ({ nums, k }),
});
