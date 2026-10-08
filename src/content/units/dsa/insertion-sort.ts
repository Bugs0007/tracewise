import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, items, numbersInput, show, sortedCopy } from '@/content/lib/sorting';

const code = `
def insertion_sort(nums):
    for i in range(1, len(nums)):                       #@outer
        key = nums[i]                                   #@key
        j = i - 1                                       #@start
        while j >= 0 and nums[j] > key:                 #@while
            nums[j + 1] = nums[j]                       #@shift
            j -= 1                                      #@dec
        nums[j + 1] = key                               #@place
    return nums                                         #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'insertion-sort',
  title: 'Insertion sort',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers to sort', kind: 'numbers', default: [7, 3, 5, 1, 6, 2], maxItems: 10 }],
  presets: [
    { label: 'Already sorted', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Duplicates', input: { nums: [3, 1, 3, 2, 1, 2] } },
    { label: 'Nearly sorted', input: { nums: [1, 2, 4, 3, 5, 6] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { max: 10 });
    const r = new Recorder(code);
    const a = items(nums);
    const n = a.length;
    let prefix = 1; // a[0..prefix-1] is sorted (not final yet)
    let allDone = false;
    // The key is "held in the air": its bar sits in the hole, which moves left as larger items shift right.
    const panel = (hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < Math.min(prefix, n); k++) tones[k] = allDone ? 'done' : 'visited';
      return [bars(a, { title: 'nums', tones: { ...tones, ...hot }, pointers: ptr })];
    };

    if (n === 0) {
      r.step('done', 'Empty list: nothing to sort', [bars([], { title: 'nums' })], {});
      return { frames: r.frames, result: [] };
    }
    r.step('outer', `A single item (${a[0].v}) is a sorted prefix; insert the rest one by one`, panel(), {});
    let shifts = 0;
    for (let i = 1; i < n; i++) {
      prefix = i;
      const key = a[i];
      let hole = i; // where the key bar currently sits
      r.step('key', `Pick up key = ${key.v} (index ${i}); prefix ${show(a.slice(0, i).map((c) => c.v))} is sorted`, panel({ [i]: 'active' }, { i }), { i, key: key.v });
      let j = i - 1;
      while (true) {
        if (j < 0) {
          r.step('while', `j = -1: reached the front of the list`, panel({ [hole]: 'active' }, { j, hole }), { i, j, key: key.v });
          break;
        }
        r.op();
        if (!(a[j].v > key.v)) {
          r.step('while', `${a[j].v} ≤ ${key.v} → stop, the key belongs right of it`, panel({ [hole]: 'active', [j]: 'compare' }, { j, hole }), { i, j, key: key.v });
          break;
        }
        r.step('while', `${a[j].v} > ${key.v} → shift ${a[j].v} right`, panel({ [hole]: 'active', [j]: 'compare' }, { j, hole }), { i, j, key: key.v });
        const moved = a[j];
        a[hole] = moved;
        a[j] = key;
        hole = j;
        r.op();
        shifts++;
        r.step('shift', `${moved.v} shifts right; the hole moves to index ${hole}`, panel({ [hole]: 'active', [hole + 1]: 'swap' }, { j, hole }), { i, j, key: key.v });
        j--;
      }
      r.op();
      prefix = i + 1;
      r.step('place', hole === i ? `Write key ${key.v} at index ${hole} — it was already in place` : `Write key ${key.v} at index ${hole}`, panel({ [hole]: 'swap' }, { hole }), { i, j: hole - 1, key: key.v });
    }
    allDone = true;
    prefix = n;
    r.step('done', `Sorted using ${shifts} shift${shifts === 1 ? '' : 's'}: ${show(a.map((c) => c.v))}`, panel(), { shifts });
    return { frames: r.frames, result: a.map((c) => c.v) };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[5, 2, 4, 6, 1, 3]], expected: [1, 2, 3, 4, 5, 6] },
  { args: [[2, 1]], expected: [1, 2], name: 'two items' },
  { args: [[1, 2, 3, 4]], expected: [1, 2, 3, 4], name: 'already sorted' },
  { args: [[4, 3, 2, 1]], expected: [1, 2, 3, 4], name: 'reversed' },
  { args: [[3, 1, 3, 2, 1]], expected: [1, 1, 2, 3, 3], name: 'duplicates' },
  { args: [[0, -3, 8, -3]], expected: [-3, -3, 0, 8], name: 'negatives' },
  { args: [[9]], expected: [9], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'insertion-sort',
  hook: 'Insertion sort is how most people sort a hand of cards, and it is the sort real libraries fall back on for small or nearly sorted data. Interviewers like it for the shift-then-drop pattern and the loop condition that is easy to get subtly wrong.',
  predict: {
    prompt: 'Which input makes insertion sort do the LEAST work (fewest shifts)?',
    options: ['[2, 3, 4, 5, 1]', '[5, 1, 2, 3, 4]', '[5, 4, 3, 2, 1]', '[1, 2, 3, 5, 4]'],
    answer: 3,
    explain: 'Each shift removes exactly one inversion (an out-of-order pair). [1, 2, 3, 5, 4] has one inversion, so one shift. The first two have 4 inversions each, and the reversed list has 10.',
  },
  viz,
  deeper: {
    points: [
      'Invariant: before iteration i, nums[0..i-1] is sorted. The loop slides the key into its slot in that prefix.',
      'The work done equals the number of inversions, so nearly sorted input costs about O(n). That is why hybrid sorts use it for small chunks.',
      'Stable: the shift condition is a strict `>`, so equal items are never passed. Writing `>=` would break stability.',
      'Shifting (one write per step) is cheaper than swapping (two writes per step), which is why the key is held aside.',
    ],
    complexity: { time: 'O(n²) average and worst, O(n) best (already sorted)', space: 'O(1)' },
    pitfalls: ['`while j > 0` instead of `j >= 0` never compares with index 0', 'Writing the key at `nums[j]` instead of `nums[j + 1]`', 'Checking `nums[j]` before `j >= 0` (negative index wraps around in Python)'],
  },
  practice: {
    language: 'python',
    fnName: 'insertion_sort',
    statement: 'Sort the list of integers in ascending order using insertion sort: take each item as a key and shift larger items right to make room. Sort in place and return the list.',
    signature: 'def insertion_sort(nums):',
    solution: `def insertion_sort(nums):
    for i in range(1, len(nums)):
        key = nums[i]
        j = @@i - 1@@
        while @@j >= 0@@ and nums[j] @@>@@ key:
            nums[j + 1] = @@nums[j]@@
            j @@-=@@ 1
        nums[@@j + 1@@] = key
    return nums`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'insertion_sort',
    statement: 'This insertion sort works on most lists but leaves the smallest item in the wrong place for some inputs. Find and fix the bug.',
    buggy: `def insertion_sort(nums):
    for i in range(1, len(nums)):
        key = nums[i]
        j = i - 1
        while j > 0 and nums[j] > key:
            nums[j + 1] = nums[j]
            j -= 1
        nums[j + 1] = key
    return nums`,
    fixed: `def insertion_sort(nums):
    for i in range(1, len(nums)):
        key = nums[i]
        j = i - 1
        while j >= 0 and nums[j] > key:
            nums[j + 1] = nums[j]
            j -= 1
        nums[j + 1] = key
    return nums`,
    tests,
    bugType: 'off-by-one',
    hint: 'Trace [2, 1]. What is j when the loop condition is checked, and is index 0 ever compared?',
    explanation: 'Index 0 is a valid slot for the key, so j must be allowed to reach 0 and then -1. With `j > 0` the loop stops before comparing nums[0], so a new minimum is dropped at index 1 instead of index 0. Use `j >= 0`.',
  },
  boss: {
    title: 'Stable sort words by length',
    statement: 'Sort a list of words by length, shortest first. Words with the same length must keep their original relative order. Implement it yourself (insertion sort works well) and do not call sorted() or list.sort(). Do not modify the input list.',
    language: 'python',
    fnName: 'sort_by_length',
    starter: `def sort_by_length(words):
    # your code here
    pass
`,
    solution: `def sort_by_length(words):
    words = list(words)
    for i in range(1, len(words)):
        key = words[i]
        j = i - 1
        while j >= 0 and len(words[j]) > len(key):
            words[j + 1] = words[j]
            j -= 1
        words[j + 1] = key
    return words`,
    tests: [
      { args: [['banana', 'fig', 'apple', 'kiwi']], expected: ['fig', 'kiwi', 'apple', 'banana'] },
      { args: [['bb', 'a', 'cc', 'd', 'ee']], expected: ['a', 'd', 'bb', 'cc', 'ee'], name: 'ties keep input order' },
      { args: [['xyz', 'abc', 'mno']], expected: ['xyz', 'abc', 'mno'], name: 'all the same length' },
      { args: [['', 'a', '']], expected: ['', '', 'a'], name: 'empty strings' },
      { args: [[]], expected: [], name: 'empty list' },
      { args: [['solo']], expected: ['solo'], name: 'single word' },
    ],
    hints: ['Insertion sort is stable as long as you only shift items that are strictly bigger than the key. Compare lengths instead of values.', 'Keep the shift condition `len(words[j]) > len(key)` with a strict `>`; equal-length words then never pass each other.'],
    combines: ['array-two-index'],
  },
  quiz: [
    {
      prompt: 'Insertion sort on a list that is already sorted takes…',
      options: ['O(n²) time', 'O(n) time', 'O(n log n) time', 'O(1) time'],
      answer: 1,
      explain: 'Every key fails the `nums[j] > key` test immediately, so each of the n - 1 iterations does a single comparison.',
    },
  ],
};

export default unit;
