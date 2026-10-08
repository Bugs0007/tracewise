import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, items, numbersInput, show, sortedCopy } from '@/content/lib/sorting';

const code = `
def bubble_sort(nums):
    n = len(nums)                                       #@init
    for i in range(n - 1):                              #@outer
        swapped = False                                 #@reset
        for j in range(n - 1 - i):                      #@inner
            if nums[j] > nums[j + 1]:                   #@compare
                nums[j], nums[j + 1] = nums[j + 1], nums[j]   #@swap
                swapped = True                          #@flag
        if not swapped:                                 #@check
            break                                       #@early
    return nums                                         #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'bubble-sort',
  title: 'Bubble sort (with early exit)',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers to sort', kind: 'numbers', default: [5, 1, 4, 2, 8, 3], maxItems: 10 }],
  presets: [
    { label: 'Already sorted', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Duplicates', input: { nums: [3, 1, 3, 2, 1, 2] } },
    { label: 'One swap away', input: { nums: [1, 2, 4, 3, 5, 6] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { max: 10 });
    const r = new Recorder(code);
    const a = items(nums);
    const n = a.length;
    let sortedFrom = n; // indices >= sortedFrom hold their final value
    const panel = (hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = sortedFrom; k < n; k++) tones[k] = 'done';
      return [bars(a, { title: 'nums', tones: { ...tones, ...hot }, pointers: ptr })];
    };

    r.step('init', `n = ${n}: nothing is sorted yet`, panel(), { n });
    let passes = 0;
    for (let i = 0; i < n - 1; i++) {
      passes++;
      let swapped = false;
      r.step('outer', `Pass ${i + 1}: bubble the largest of the first ${n - i} items to the right`, panel(), { i, swapped });
      for (let j = 0; j < n - 1 - i; j++) {
        r.op();
        const x = a[j].v;
        const y = a[j + 1].v;
        if (x > y) {
          r.step('compare', `${x} > ${y} → swap`, panel({ [j]: 'compare', [j + 1]: 'compare' }, { j, 'j+1': j + 1 }), { i, j, swapped });
          [a[j], a[j + 1]] = [a[j + 1], a[j]];
          r.op(2);
          swapped = true;
          r.step('swap', `Swapped: ${y} moves left, ${x} bubbles right`, panel({ [j]: 'swap', [j + 1]: 'swap' }, { j, 'j+1': j + 1 }), { i, j, swapped });
        } else {
          r.step('compare', `${x} ≤ ${y} → already in order`, panel({ [j]: 'compare', [j + 1]: 'compare' }, { j, 'j+1': j + 1 }), { i, j, swapped });
        }
      }
      sortedFrom = n - 1 - i;
      if (!swapped) {
        sortedFrom = 0;
        r.step('early', `No swaps in pass ${i + 1} → the list is sorted, stop early`, panel(), { i, swapped });
        return { frames: r.frames, result: a.map((c) => c.v) };
      }
      r.step('check', `Pass ${i + 1} done: ${a[sortedFrom].v} is in its final place`, panel(), { i, swapped });
    }
    sortedFrom = 0;
    r.step('done', `Sorted after ${passes} pass${passes === 1 ? '' : 'es'}: ${show(a.map((c) => c.v))}`, panel(), {});
    return { frames: r.frames, result: a.map((c) => c.v) };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[5, 2, 4, 1, 3]], expected: [1, 2, 3, 4, 5] },
  { args: [[3, 1, 2]], expected: [1, 2, 3], name: 'three items' },
  { args: [[1, 2, 3, 4]], expected: [1, 2, 3, 4], name: 'already sorted' },
  { args: [[4, 3, 2, 1]], expected: [1, 2, 3, 4], name: 'reversed' },
  { args: [[2, 3, 2, 1, 3]], expected: [1, 2, 2, 3, 3], name: 'duplicates' },
  { args: [[-1, 5, -3, 0]], expected: [-3, -1, 0, 5], name: 'negatives' },
  { args: [[7]], expected: [7], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'bubble-sort',
  hook: 'Nobody ships bubble sort, but interviewers use it to check you can write nested loops with correct bounds and reason about passes. The early-exit flag is the follow-up that separates O(n) best case from O(n²).',
  predict: {
    prompt: 'Bubble sort with the early-exit flag runs on [2, 1, 3, 4, 5]. How many passes (full left-to-right sweeps) does it make before it stops?',
    options: ['1', '2', '4', '5'],
    answer: 1,
    explain: 'Pass 1 swaps 2 and 1 and the list is sorted, but the algorithm cannot know that yet. Pass 2 finds no swaps, so `swapped` stays False and it breaks. Two passes.',
  },
  viz,
  deeper: {
    points: [
      'After pass k, the k largest items are in their final places at the end, so each pass can stop one position earlier (`n - 1 - i`).',
      'The `swapped` flag gives a best case of O(n): one sweep over sorted input and done.',
      'Stable: equal items are never swapped because the test is strictly `>`. Using `>=` would swap equal neighbours for nothing and break stability.',
      'In place, O(1) extra space. Average and worst case are O(n²) comparisons, and the number of swaps equals the number of inversions.',
    ],
    complexity: { time: 'O(n²) average and worst, O(n) best (already sorted)', space: 'O(1)' },
    pitfalls: ['Inner bound `n - i` instead of `n - 1 - i` reads nums[n] and crashes', 'Inner bound too small skips the last pair of each pass', 'Forgetting to reset `swapped` inside the outer loop'],
  },
  practice: {
    language: 'python',
    fnName: 'bubble_sort',
    statement: 'Sort the list of integers in ascending order using bubble sort with the early-exit optimisation. Sort in place and return the list.',
    signature: 'def bubble_sort(nums):',
    solution: `def bubble_sort(nums):
    n = len(nums)
    for i in range(@@n - 1@@):
        swapped = False
        for j in range(@@n - 1 - i@@):
            if nums[j] @@>@@ nums[j + 1]:
                nums[j], nums[j + 1] = @@nums[j + 1], nums[j]@@
                swapped = True
        if @@not swapped@@:
            break
    return nums`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'bubble_sort',
    statement: 'This bubble sort returns lists that are almost sorted: the biggest items sometimes stay one place short of the end. Find and fix the bug.',
    buggy: `def bubble_sort(nums):
    n = len(nums)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 2 - i):
            if nums[j] > nums[j + 1]:
                nums[j], nums[j + 1] = nums[j + 1], nums[j]
                swapped = True
        if not swapped:
            break
    return nums`,
    fixed: `def bubble_sort(nums):
    n = len(nums)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            if nums[j] > nums[j + 1]:
                nums[j], nums[j + 1] = nums[j + 1], nums[j]
                swapped = True
        if not swapped:
            break
    return nums`,
    tests,
    bugType: 'off-by-one',
    hint: 'Trace [2, 1] by hand. How many times does the inner loop run when n = 2 and i = 0?',
    explanation: 'The inner loop compares nums[j] with nums[j + 1], so j must reach n - 2 on the first pass. range(n - 2 - i) stops at n - 3 - i and never compares the last pair. The right bound is range(n - 1 - i).',
  },
  boss: {
    title: 'Array after k bubble passes',
    statement: 'Run exactly k passes of bubble sort on `nums` (each pass sweeps left to right swapping out-of-order neighbours). Return the list as it looks after those k passes, or fully sorted if it finishes earlier. Do not call sorted().',
    language: 'python',
    fnName: 'after_k_passes',
    starter: `def after_k_passes(nums, k):
    # your code here
    pass
`,
    solution: `def after_k_passes(nums, k):
    nums = list(nums)
    n = len(nums)
    for i in range(min(k, n - 1)):
        swapped = False
        for j in range(n - 1 - i):
            if nums[j] > nums[j + 1]:
                nums[j], nums[j + 1] = nums[j + 1], nums[j]
                swapped = True
        if not swapped:
            break
    return nums`,
    tests: [
      { args: [[5, 1, 4, 2, 8], 1], expected: [1, 4, 2, 5, 8] },
      { args: [[5, 1, 4, 2, 8], 2], expected: [1, 2, 4, 5, 8] },
      { args: [[3, 2, 1], 0], expected: [3, 2, 1], name: 'zero passes' },
      { args: [[3, 2, 1], 10], expected: [1, 2, 3], name: 'more passes than needed' },
      { args: [[4], 3], expected: [4], name: 'single element' },
      { args: [[2, 2, 1, 1], 1], expected: [2, 1, 1, 2], name: 'duplicates' },
    ],
    hints: ['One pass is just the inner loop. Run it k times (but never more than n - 1 times), and copy the list first so the caller keeps their data.', 'After pass i the last i + 1 items are final, so the inner loop can shrink: range(n - 1 - i). Stop early if a pass makes no swaps.'],
    combines: ['array-two-index'],
  },
  quiz: [
    {
      prompt: 'Which change makes bubble sort unstable?',
      options: ['Using `>=` instead of `>` in the comparison', 'Adding the `swapped` flag', 'Shrinking the inner loop each pass', 'Sorting in place'],
      answer: 0,
      explain: 'With `>=` equal neighbours get swapped, so equal items can overtake each other. A strict `>` leaves them alone.',
    },
  ],
};

export default unit;
