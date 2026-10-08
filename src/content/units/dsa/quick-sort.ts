import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, items, numbersInput, show, sortedCopy, stackPanel } from '@/content/lib/sorting';

const code = `
def quick_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo < hi:                                         #@check
        p = partition(nums, lo, hi)                     #@part
        quick_sort(nums, lo, p - 1)                     #@left
        quick_sort(nums, p + 1, hi)                     #@right
    return nums                                         #@ret

def partition(nums, lo, hi):
    pivot = nums[hi]                                    #@pivot
    i = lo                                              #@i
    for j in range(lo, hi):                             #@loop
        if nums[j] < pivot:                             #@cmp
            nums[i], nums[j] = nums[j], nums[i]         #@swap
            i += 1                                      #@inc
    nums[i], nums[hi] = nums[hi], nums[i]               #@place
    return i                                            #@retp
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'quick-sort',
  title: 'Quick sort (Lomuto partition)',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers to sort', kind: 'numbers', default: [6, 3, 8, 2, 7, 1, 5], maxItems: 9 }],
  presets: [
    { label: 'Already sorted (worst case)', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Duplicates', input: { nums: [3, 1, 3, 2, 1, 2] } },
    { label: 'Lucky median pivot', input: { nums: [1, 3, 2, 7, 5, 6, 4] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { max: 9 });
    const r = new Recorder(code);
    const a = items(nums);
    const n = a.length;
    const final: boolean[] = new Array(n).fill(false);
    const stack: string[] = [];

    const panel = (lo: number, hi: number, hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}, zone?: { i: number; j: number }): Panel[] => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < n; k++) tones[k] = final[k] ? 'done' : k < lo || k > hi ? 'muted' : 'default';
      if (zone) {
        for (let k = lo; k < zone.i; k++) tones[k] = 'visited'; // already known to be < pivot
        for (let k = zone.i; k < zone.j; k++) tones[k] = 'frontier'; // known to be >= pivot
      }
      return [bars(a, { title: 'nums', tones: { ...tones, ...hot }, pointers: ptr }), stackPanel(stack)];
    };

    function partition(lo: number, hi: number): number {
      const pivot = a[hi].v;
      let i = lo;
      r.step('pivot', `Pivot = last item = ${pivot}. Small zone starts empty (i = ${i})`, panel(lo, hi, { [hi]: 'active' }, { i, pivot: hi }, { i, j: lo }), { lo, hi, pivot, i });
      for (let j = lo; j < hi; j++) {
        r.op();
        const small = a[j].v < pivot;
        r.step('cmp', small ? `${a[j].v} < ${pivot} → belongs in the small zone` : `${a[j].v} ≥ ${pivot} → leave it in the big zone`, panel(lo, hi, { [hi]: 'active', [j]: 'compare' }, { i, j, pivot: hi }, { i, j }), { lo, hi, pivot, i, j });
        if (small) {
          [a[i], a[j]] = [a[j], a[i]];
          r.op(2);
          const same = i === j;
          i++;
          r.step('swap', same ? `Swap index ${j} with itself, then i = ${i}` : `Swap into the small zone, then i = ${i}`, panel(lo, hi, { [hi]: 'active', [i - 1]: 'swap', [j]: 'swap' }, { i, j, pivot: hi }, { i, j: j + 1 }), { lo, hi, pivot, i, j });
        }
      }
      [a[i], a[hi]] = [a[hi], a[i]];
      r.op(2);
      final[i] = true;
      r.step('place', `Place pivot ${pivot} at index ${i}: smaller on its left, bigger on its right`, panel(lo, hi, { [i]: 'done' }, { i }), { lo, hi, pivot, i });
      return i;
    }

    function sort(lo: number, hi: number): void {
      stack.push(`sort(${lo},${hi})`);
      if (lo < hi) {
        const p = partition(lo, hi);
        sort(lo, p - 1);
        sort(p + 1, hi);
      } else {
        if (lo === hi) final[lo] = true;
        r.step('check', lo === hi ? `sort(${lo},${hi}): one item left → it is in place` : `sort(${lo},${hi}): empty range → nothing to do`, panel(lo, hi, lo === hi ? { [lo]: 'done' } : {}), { lo, hi });
      }
      stack.pop();
    }

    if (n === 0) {
      r.step('check', 'Empty list: nothing to sort', [bars([], { title: 'nums' })], {});
      return { frames: r.frames, result: [] };
    }
    sort(0, n - 1);
    r.step('ret', `Sorted: ${show(a.map((c) => c.v))}`, [bars(a, { title: 'nums', tones: Object.fromEntries(a.map((_, k) => [k, 'done' as Tone])) })], {});
    return { frames: r.frames, result: a.map((c) => c.v) };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[6, 3, 8, 2, 7, 1, 5]], expected: [1, 2, 3, 5, 6, 7, 8] },
  { args: [[2, 1]], expected: [1, 2], name: 'two items' },
  { args: [[1, 2, 3, 4, 5]], expected: [1, 2, 3, 4, 5], name: 'already sorted' },
  { args: [[5, 4, 3, 2, 1]], expected: [1, 2, 3, 4, 5], name: 'reversed' },
  { args: [[3, 1, 3, 2, 1, 3]], expected: [1, 1, 2, 3, 3, 3], name: 'duplicates' },
  { args: [[0, -5, 4, -1]], expected: [-5, -1, 0, 4], name: 'negatives' },
  { args: [[8]], expected: [8], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'quick-sort',
  hook: 'Quick sort is the sort most standard libraries are built on, and the partition step shows up everywhere (quickselect, Dutch national flag). Interviewers want the invariant, the O(n²) worst case and when it happens.',
  predict: {
    prompt: 'Lomuto partition with the LAST item as pivot runs on [4, 7, 2, 9, 5]. At which index does the pivot 5 end up?',
    options: ['0', '2', '3', '4'],
    answer: 1,
    explain: 'Items smaller than 5 are 4 and 2, so the small zone gets two items and the pivot lands right after them, at index 2. The list becomes [4, 2, 5, 9, 7]. The pivot is now in its FINAL position.',
  },
  viz,
  deeper: {
    points: [
      'Invariant while scanning: nums[lo..i-1] < pivot, nums[i..j-1] >= pivot, nums[j..hi-1] unexamined. Placing the pivot at i splits the range cleanly.',
      'After a partition the pivot is in its final place, so recursion excludes it: sort lo..p-1 and p+1..hi.',
      'Average O(n log n), but a last-item pivot on sorted or reversed input splits 0 / n-1 every time: O(n²) time and O(n) recursion depth. Random or median-of-three pivots avoid this.',
      'In place (just the recursion stack) but NOT stable: the swaps can move equal items past each other.',
    ],
    complexity: { time: 'O(n log n) average, O(n²) worst', space: 'O(log n) average stack, O(n) worst' },
    pitfalls: ['Recursing on `lo..p` instead of `lo..p-1` (pivot is already placed; can recurse forever)', 'Forgetting the final swap that puts the pivot between the zones', 'Using `<=` and `lo <= hi` mixtures that skip or repeat items'],
  },
  practice: {
    language: 'python',
    fnName: 'quick_sort',
    statement: 'Sort the list of integers in ascending order with quick sort using the Lomuto partition (pivot = last item of the range). Sort in place and return the list.',
    signature: 'def quick_sort(nums, lo=0, hi=None):',
    solution: `def quick_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if @@lo < hi@@:
        p = partition(nums, lo, hi)
        quick_sort(nums, lo, @@p - 1@@)
        quick_sort(nums, p + 1, hi)
    return nums

def partition(nums, lo, hi):
    pivot = @@nums[hi]@@
    i = lo
    for j in range(lo, hi):
        if nums[j] @@<@@ pivot:
            nums[i], nums[j] = nums[j], nums[i]
            i @@+= 1@@
    nums[i], nums[hi] = @@nums[hi], nums[i]@@
    return i`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'quick_sort',
    statement: 'This quick sort crashes with a recursion error on some inputs, such as an already sorted list. Find and fix the bug.',
    buggy: `def quick_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo < hi:
        p = partition(nums, lo, hi)
        quick_sort(nums, lo, p)
        quick_sort(nums, p + 1, hi)
    return nums

def partition(nums, lo, hi):
    pivot = nums[hi]
    i = lo
    for j in range(lo, hi):
        if nums[j] < pivot:
            nums[i], nums[j] = nums[j], nums[i]
            i += 1
    nums[i], nums[hi] = nums[hi], nums[i]
    return i`,
    fixed: `def quick_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo < hi:
        p = partition(nums, lo, hi)
        quick_sort(nums, lo, p - 1)
        quick_sort(nums, p + 1, hi)
    return nums

def partition(nums, lo, hi):
    pivot = nums[hi]
    i = lo
    for j in range(lo, hi):
        if nums[j] < pivot:
            nums[i], nums[j] = nums[j], nums[i]
            i += 1
    nums[i], nums[hi] = nums[hi], nums[i]
    return i`,
    tests,
    bugType: 'wrong partition boundary',
    hint: 'After partition(…) returns p, is nums[p] still part of the problem? Try [1, 2, 3] and see what range the left recursive call gets.',
    explanation: 'The pivot is already in its final position p, so the left call must cover lo..p-1. Passing p keeps the pivot in the range; when the pivot is the largest item (p == hi) the range never shrinks and the recursion never ends.',
  },
  boss: {
    title: 'Sort colors (Dutch national flag)',
    statement: 'The list holds only 0s, 1s and 2s (red, white, blue). Sort it in place in a single pass using O(1) extra space, without calling sort(). Return the list.',
    language: 'python',
    fnName: 'sort_colors',
    starter: `def sort_colors(nums):
    # your code here
    pass
`,
    solution: `def sort_colors(nums):
    lo, i, hi = 0, 0, len(nums) - 1
    while i <= hi:
        if nums[i] == 0:
            nums[lo], nums[i] = nums[i], nums[lo]
            lo += 1
            i += 1
        elif nums[i] == 2:
            nums[i], nums[hi] = nums[hi], nums[i]
            hi -= 1
        else:
            i += 1
    return nums`,
    tests: [
      { args: [[2, 0, 2, 1, 1, 0]], expected: [0, 0, 1, 1, 2, 2] },
      { args: [[2, 0, 1]], expected: [0, 1, 2] },
      { args: [[1, 1, 1]], expected: [1, 1, 1], name: 'all the same' },
      { args: [[2, 2, 0, 0]], expected: [0, 0, 2, 2], name: 'no ones' },
      { args: [[0]], expected: [0], name: 'single element' },
      { args: [[]], expected: [], name: 'empty' },
    ],
    hints: ['Partitioning around the pivot 1 with THREE zones (< 1, == 1, > 1) is a quick sort partition that finishes in one pass.', 'Keep three pointers: lo (end of the 0 zone), i (scanner) and hi (start of the 2 zone). Swapping a 2 to the back does not tell you what arrived at i, so do not advance i in that case.'],
    combines: ['two-pointers', 'array-two-index'],
  },
  quiz: [
    {
      prompt: 'Quick sort with the last item as pivot is run on an already sorted list. What is the running time?',
      options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
      answer: 2,
      explain: 'The pivot is the maximum every time, so each partition peels off one item: n + (n-1) + … + 1 comparisons.',
    },
  ],
};

export default unit;
