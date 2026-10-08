import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, items, numbersInput, show, sortedCopy } from '@/content/lib/sorting';

const code = `
def selection_sort(nums):
    n = len(nums)                                       #@init
    for i in range(n - 1):                              #@outer
        min_idx = i                                     #@start
        for j in range(i + 1, n):                       #@inner
            if nums[j] < nums[min_idx]:                 #@compare
                min_idx = j                             #@newmin
        if min_idx != i:                                #@check
            nums[i], nums[min_idx] = nums[min_idx], nums[i]   #@swap
    return nums                                         #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'selection-sort',
  title: 'Selection sort',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers to sort', kind: 'numbers', default: [29, 10, 14, 37, 13, 5], maxItems: 10 }],
  presets: [
    { label: 'Already sorted', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Duplicates (unstable!)', input: { nums: [3, 3, 1, 2, 3, 1] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { max: 10 });
    const r = new Recorder(code);
    const a = items(nums);
    const n = a.length;
    let sortedUpTo = 0; // indices < sortedUpTo are final
    let swaps = 0;
    const panel = (hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < sortedUpTo; k++) tones[k] = 'done';
      return [bars(a, { title: 'nums', tones: { ...tones, ...hot }, pointers: ptr })];
    };

    r.step('init', `n = ${n}: the sorted prefix is empty`, panel(), { n });
    for (let i = 0; i < n - 1; i++) {
      let minIdx = i;
      r.step('start', `Pass ${i + 1}: assume ${a[i].v} (index ${i}) is the smallest of the rest`, panel({ [i]: 'active' }, { i, min: minIdx }), { i, min_idx: minIdx });
      for (let j = i + 1; j < n; j++) {
        r.op();
        const lower = a[j].v < a[minIdx].v;
        const hot: Record<number, Tone> = { [minIdx]: 'active', [j]: 'compare' };
        r.step('compare', lower ? `${a[j].v} < ${a[minIdx].v} → new minimum` : `${a[j].v} ≥ ${a[minIdx].v} → keep ${a[minIdx].v}`, panel(hot, { i, min: minIdx, j }), { i, j, min_idx: minIdx });
        if (lower) {
          minIdx = j;
          r.step('newmin', `min_idx = ${j} (value ${a[j].v})`, panel({ [minIdx]: 'active' }, { i, min: minIdx }), { i, j, min_idx: minIdx });
        }
      }
      if (minIdx !== i) {
        const x = a[i].v;
        const m = a[minIdx].v;
        [a[i], a[minIdx]] = [a[minIdx], a[i]];
        r.op(2);
        swaps++;
        sortedUpTo = i + 1;
        r.step('swap', `Swap: ${m} goes to index ${i}, ${x} goes to index ${minIdx}`, panel({ [i]: 'swap', [minIdx]: 'swap' }, { i, min: minIdx }), { i, min_idx: minIdx, swaps });
      } else {
        sortedUpTo = i + 1;
        r.step('check', `${a[i].v} is already the smallest → no swap needed`, panel({ [i]: 'active' }, { i, min: minIdx }), { i, min_idx: minIdx, swaps });
      }
    }
    sortedUpTo = n;
    r.step('done', `Sorted with ${swaps} swap${swaps === 1 ? '' : 's'}: ${show(a.map((c) => c.v))}`, panel(), { swaps });
    return { frames: r.frames, result: a.map((c) => c.v) };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[64, 25, 12, 22, 11]], expected: [11, 12, 22, 25, 64] },
  { args: [[3, 1, 2]], expected: [1, 2, 3], name: 'three items' },
  { args: [[1, 2, 3, 4]], expected: [1, 2, 3, 4], name: 'already sorted' },
  { args: [[4, 3, 2, 1]], expected: [1, 2, 3, 4], name: 'reversed' },
  { args: [[2, 3, 2, 1, 3]], expected: [1, 2, 2, 3, 3], name: 'duplicates' },
  { args: [[-4, 0, -9, 7]], expected: [-9, -4, 0, 7], name: 'negatives' },
  { args: [[9]], expected: [9], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'selection-sort',
  hook: 'Selection sort does the fewest writes of any simple sort: at most n - 1 swaps. Interviewers ask when swaps are expensive, and whether you can explain why it is not stable.',
  predict: {
    prompt: 'Selection sort runs on [7, 3, 5, 1, 4]. What does the list look like after the FIRST pass (i = 0)?',
    options: ['[1, 7, 3, 5, 4]', '[1, 3, 5, 7, 4]', '[3, 5, 1, 4, 7]', '[1, 3, 4, 5, 7]'],
    answer: 1,
    explain: 'Pass 1 scans the whole list and finds the minimum 1 at index 3, then swaps it with the item at index 0 (the 7). The 7 is thrown to index 3. Shifting everything right would be insertion sort, not selection sort.',
  },
  viz,
  deeper: {
    points: [
      'Invariant: after pass i, nums[0..i] holds the i + 1 smallest items in their final order. Each pass fixes exactly one position.',
      'Always O(n²) comparisons (n(n-1)/2), even on sorted input, because it must scan the rest to be sure the minimum is where it thinks.',
      'At most n - 1 swaps, so it is a good choice when writing is far more expensive than reading.',
      'Not stable: the long-distance swap can jump an item over an equal one. [3a, 3b, 1] becomes [1, 3b, 3a].',
    ],
    complexity: { time: 'O(n²) in every case', space: 'O(1)' },
    pitfalls: ['Swapping with `j` (the last scanned index) instead of `min_idx`', 'Starting the scan at `i` and comparing the item with itself (harmless but wasteful) or at `i + 2` (misses a candidate)', 'Assuming it is stable'],
  },
  practice: {
    language: 'python',
    fnName: 'selection_sort',
    statement: 'Sort the list of integers in ascending order using selection sort: on each pass find the smallest remaining item and swap it into place. Sort in place and return the list.',
    signature: 'def selection_sort(nums):',
    solution: `def selection_sort(nums):
    n = len(nums)
    for i in range(@@n - 1@@):
        min_idx = @@i@@
        for j in range(@@i + 1@@, n):
            if nums[j] @@<@@ nums[min_idx]:
                min_idx = @@j@@
        if min_idx != i:
            nums[i], nums[min_idx] = @@nums[min_idx], nums[i]@@
    return nums`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'selection_sort',
    statement: 'This selection sort scrambles the list instead of sorting it. Find and fix the bug.',
    buggy: `def selection_sort(nums):
    n = len(nums)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if nums[j] < nums[min_idx]:
                min_idx = j
        if min_idx != i:
            nums[i], nums[j] = nums[j], nums[i]
    return nums`,
    fixed: `def selection_sort(nums):
    n = len(nums)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if nums[j] < nums[min_idx]:
                min_idx = j
        if min_idx != i:
            nums[i], nums[min_idx] = nums[min_idx], nums[i]
    return nums`,
    tests,
    bugType: 'wrong variable',
    hint: 'After the inner loop finishes, what value does `j` hold? Is that where the minimum lives?',
    explanation: 'Once the scan ends, j is just the last index (n - 1), not the position of the smallest item. The swap must use `min_idx`, which the scan kept up to date.',
  },
  boss: {
    title: 'K smallest, in order',
    statement: 'Return the k smallest values of `nums` in ascending order without sorting the whole list. If k is larger than the list, return everything sorted. Do not modify the input list.',
    language: 'python',
    fnName: 'k_smallest',
    starter: `def k_smallest(nums, k):
    # your code here
    pass
`,
    solution: `def k_smallest(nums, k):
    nums = list(nums)
    k = min(k, len(nums))
    for i in range(k):
        m = i
        for j in range(i + 1, len(nums)):
            if nums[j] < nums[m]:
                m = j
        nums[i], nums[m] = nums[m], nums[i]
    return nums[:k]`,
    tests: [
      { args: [[7, 10, 4, 3, 20, 15], 3], expected: [3, 4, 7] },
      { args: [[5, 1, 5, 2, 1], 2], expected: [1, 1], name: 'duplicates' },
      { args: [[9, -2, 4], 0], expected: [], name: 'k = 0' },
      { args: [[3, 1, 2], 10], expected: [1, 2, 3], name: 'k larger than the list' },
      { args: [[], 2], expected: [], name: 'empty list' },
      { args: [[-5, -1, -9, 0], 2], expected: [-9, -5], name: 'negatives' },
    ],
    hints: ['Selection sort fixes one position per pass. How many passes do you need if you only care about the first k positions?', 'Run only k passes of the selection loop on a copy of the list, then return the first k items.'],
    combines: ['array-two-index'],
  },
  quiz: [
    {
      prompt: 'How many comparisons does selection sort make on an already sorted list of 5 items?',
      options: ['4', '5', '10', '0'],
      answer: 2,
      explain: 'It scans the whole unsorted part every pass: 4 + 3 + 2 + 1 = 10 comparisons, regardless of the order of the input.',
    },
  ],
};

export default unit;
