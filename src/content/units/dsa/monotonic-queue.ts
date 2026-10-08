import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { requireInts } from '@/content/lib/lists-stacks';

const code = `
from collections import deque

def max_sliding_window(nums, k):
    dq = deque()                            #@init
    out = []
    for i, x in enumerate(nums):            #@loop
        if dq and dq[0] <= i - k:           #@expire
            dq.popleft()                    #@evictFront
        while dq and nums[dq[-1]] <= x:     #@while
            dq.pop()                        #@evictBack
        dq.append(i)                        #@push
        if i >= k - 1:                      #@ready
            out.append(nums[dq[0]])         #@record
    return out                              #@done
`;

interface In {
  nums: number[];
  k: number;
}

const viz: VizDef<In> = {
  id: 'monotonic-queue',
  title: 'Monotonic deque: sliding window maximum',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Numbers', kind: 'numbers', default: [1, 3, -1, -3, 5, 3, 6, 7], maxItems: 10 },
    { key: 'k', label: 'Window size k', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Increasing (evicts from the back)', input: { nums: [1, 2, 3, 4, 5], k: 3 } },
    { label: 'Decreasing (evicts from the front)', input: { nums: [9, 8, 7, 6, 5], k: 3 } },
    { label: 'Window of 1', input: { nums: [4, 2, 7], k: 1 } },
    { label: 'Window = whole array', input: { nums: [2, 9, 4], k: 3 } },
  ],
  run({ nums, k }) {
    requireInts(nums, 'Numbers');
    const n = nums.length;
    if (n < 1) throw new Error('Enter at least one number');
    if (!Number.isInteger(k) || k < 1 || k > n) throw new Error(`k must be a whole number from 1 to ${n}`);
    const r = new Recorder(code);
    const dq: number[] = [];
    const out: number[] = [];

    const panels = (i: number, tones: Record<number, Tone> = {}, dqTones: Record<number, Tone> = {}): Panel[] => {
      const t: Record<number, Tone> = {};
      for (const j of dq) t[j] = 'frontier';
      if (dq.length) t[dq[0]] = 'found';
      Object.assign(t, tones);
      const items: ListItem[] = dq.map((j) => ({ id: `i${j}`, label: String(nums[j]), sub: `idx ${j}`, tone: dqTones[j] ?? (j === dq[0] ? 'found' : 'frontier') }));
      return [
        {
          type: 'array',
          title: 'Numbers',
          values: nums,
          tones: t,
          pointers: i >= 0 ? { i } : undefined,
          range: i >= 0 ? { from: Math.max(0, i - k + 1), to: i, tone: 'active', label: `window (k=${k})` } : undefined,
        },
        { type: 'list', title: 'Deque of indices: values fall from front to back, front = window maximum', items, orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: 'empty' },
        { type: 'array', title: 'Window maxima', values: out, hideIndex: true },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ dq: `[${dq.join(', ')}]`, ...extra });

    r.step('init', 'dq will hold indices whose values decrease from front to back', panels(-1), vars({ k }));
    for (let i = 0; i < n; i++) {
      const x = nums[i];
      r.op();
      r.step('loop', `Slide in nums[${i}] = ${x}; the window is now indices ${Math.max(0, i - k + 1)}..${i}`, panels(i, { [i]: 'active' }), vars({ i, x }));
      if (dq.length && dq[0] <= i - k) {
        const f = dq[0];
        r.op();
        r.step('evictFront', `Front index ${f} <= ${i} - ${k}: it slid out of the window, pop it from the front`, panels(i, { [f]: 'error' }, { [f]: 'error' }), vars({ i, x }));
        dq.shift();
      }
      while (dq.length && nums[dq[dq.length - 1]] <= x) {
        const b = dq[dq.length - 1];
        r.op();
        r.step('evictBack', `${nums[b]} <= ${x}: it can never be the maximum while ${x} is in the window, pop it from the back`, panels(i, { [b]: 'error' }, { [b]: 'error' }), vars({ i, x }));
        dq.pop();
      }
      dq.push(i);
      r.step('push', dq.length === 1 ? `Push index ${i}: it is the only candidate` : `Push index ${i} at the back (${nums[dq[dq.length - 2]]} > ${x} keeps the order)`, panels(i, {}, { [i]: 'new' }), vars({ i, x }));
      if (i >= k - 1) {
        out.push(nums[dq[0]]);
        r.step('record', `Window ${i - k + 1}..${i} is full: the maximum is nums[${dq[0]}] = ${nums[dq[0]]}`, panels(i), vars({ i, x }));
      }
    }
    r.step('done', `Return the maxima: ${out.join(', ')}`, panels(n - 1), vars());
    return { frames: r.frames, result: out };
  },
  reference({ nums, k }) {
    const res: number[] = [];
    for (let i = 0; i + k <= nums.length; i++) res.push(Math.max(...nums.slice(i, i + k)));
    return res;
  },
};

const tests = [
  { args: [[1, 3, -1, -3, 5, 3, 6, 7], 3], expected: [3, 3, 5, 5, 6, 7] },
  { args: [[1], 1], expected: [1], name: 'single element' },
  { args: [[1, -1], 1], expected: [1, -1], name: 'window of 1' },
  { args: [[9, 8, 7], 3], expected: [9], name: 'window is the whole array' },
  { args: [[1, 2, 3, 4], 2], expected: [2, 3, 4], name: 'increasing' },
  { args: [[7, 2, 4], 2], expected: [7, 4], name: 'old maximum expires' },
  { args: [[4, 4, 4, 4], 2], expected: [4, 4, 4], name: 'equal values' },
];

const unit: Unit = {
  id: 'monotonic-queue',
  hook: 'Sliding window maximum is the classic "brute force is O(nk), can you do O(n)?" question. A monotonic deque keeps only the candidates that can still become the maximum, and shows you can evict from both ends.',
  predict: {
    prompt: 'The monotonic deque stores INDICES, not the values themselves. Why?',
    options: ['Index lookups are faster than comparing values', 'So we can tell when the front element has slid out of the window', 'Python deques cannot hold negative numbers', 'To break ties between equal values'],
    answer: 1,
    explain: 'To decide whether the front is still inside the window we need its position: it expires when `index <= i - k`. The value is always recoverable as `nums[index]`.',
  },
  viz,
  deeper: {
    points: [
      'Invariant: the deque holds indices of candidates, values strictly decreasing from front to back; the front is always the window maximum.',
      'Evict from the BACK: a smaller (or equal) earlier value can never win once a bigger value is newer, because it leaves the window first.',
      'Evict from the FRONT: if the front index is no longer in the window (`<= i - k`) it must go.',
      'Each index enters once and leaves once, so the total work is O(n), not O(n * k).',
      'The same idea gives sliding window minimum (flip the comparison) and speeds up DP with window constraints.',
    ],
    complexity: { time: 'O(n)', space: 'O(k)' },
    pitfalls: ['Checking expiry with `<` instead of `<=` (window becomes k + 1 wide)', 'Recording a result before the first window is full (`i >= k - 1`)', 'Popping from the back with `<` and `<=` interchangeably without thinking about ties (both work for the maximum, but be consistent)'],
  },
  practice: {
    language: 'python',
    fnName: 'max_sliding_window',
    statement: 'Return the maximum of every window of k consecutive numbers as the window slides one step at a time, in O(n) time using a deque of indices.',
    signature: 'def max_sliding_window(nums, k):',
    solution: `from collections import deque

def max_sliding_window(nums, k):
    dq = deque()
    out = []
    for i, x in enumerate(nums):
        if dq and dq[0] <= @@i - k@@:
            dq.popleft()
        while dq and nums[dq[-1]] @@<=@@ x:
            @@dq.pop()@@
        dq.append(i)
        if @@i >= k - 1@@:
            out.append(@@nums[dq[0]]@@)
    return out`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'max_sliding_window',
    statement: 'Some windows report a maximum that has already left the window. Fix the expiry check.',
    buggy: `from collections import deque

def max_sliding_window(nums, k):
    dq = deque()
    out = []
    for i, x in enumerate(nums):
        if dq and dq[0] < i - k:
            dq.popleft()
        while dq and nums[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out`,
    fixed: `from collections import deque

def max_sliding_window(nums, k):
    dq = deque()
    out = []
    for i, x in enumerate(nums):
        if dq and dq[0] <= i - k:
            dq.popleft()
        while dq and nums[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out`,
    tests,
    bugType: 'off-by-one',
    hint: 'The window at index i covers i-k+1 .. i. Is index i-k inside it?',
    explanation: 'Index i - k is just OUTSIDE the window, so it must be evicted. With `<` the front survives one step too long and the window effectively has k + 1 elements.',
  },
  boss: {
    title: 'Longest subarray with bounded range',
    statement: 'Given an integer array and a limit, return the length of the longest contiguous subarray in which the difference between its largest and smallest element is at most `limit`. Use two monotonic deques inside a sliding window.',
    language: 'python',
    fnName: 'longest_subarray',
    starter: `def longest_subarray(nums, limit):
    # your code here
    pass
`,
    solution: `from collections import deque

def longest_subarray(nums, limit):
    maxq, minq = deque(), deque()
    left = 0
    best = 0
    for right, x in enumerate(nums):
        while maxq and maxq[-1] < x:
            maxq.pop()
        maxq.append(x)
        while minq and minq[-1] > x:
            minq.pop()
        minq.append(x)
        while maxq[0] - minq[0] > limit:
            if maxq[0] == nums[left]:
                maxq.popleft()
            if minq[0] == nums[left]:
                minq.popleft()
            left += 1
        best = max(best, right - left + 1)
    return best`,
    tests: [
      { args: [[8, 2, 4, 7], 4], expected: 2 },
      { args: [[10, 1, 2, 4, 7, 2], 5], expected: 4 },
      { args: [[4, 2, 2, 2, 4, 4, 2, 2], 0], expected: 3, name: 'limit 0: equal runs only' },
      { args: [[1], 0], expected: 1, name: 'single element' },
      { args: [[1, 5, 6, 7, 8, 10, 6, 5, 6], 4], expected: 5 },
    ],
    hints: ['Grow a window with a right pointer. You need its current maximum and minimum in O(1): keep one decreasing deque (for the max) and one increasing deque (for the min).', 'While max - min > limit, move the left pointer. If the value leaving the window is the front of a deque, pop it from that deque. Track the longest window seen.'],
    combines: ['monotonic-queue', 'sliding-window-variable', 'deque'],
  },
};

export default unit;
