import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1        #@init
    while lo <= hi:                  #@loop
        mid = (lo + hi) // 2         #@mid
        if nums[mid] == target:      #@check
            return mid               #@found
        elif nums[mid] < target:     #@less
            lo = mid + 1             #@moveLo
        else:
            hi = mid - 1             #@moveHi
    return -1                        #@missing
`;

interface In {
  nums: number[];
  target: number;
}

const viz: VizDef<In> = {
  id: 'binary-search',
  title: 'Binary search',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Sorted array', kind: 'numbers', default: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], maxItems: 24 },
    { key: 'target', label: 'Target', kind: 'number', default: 23 },
  ],
  presets: [
    { label: 'Found', input: { nums: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 } },
    { label: 'Missing', input: { nums: [1, 3, 5, 7, 9, 11], target: 6 } },
    { label: 'First item', input: { nums: [4, 9, 15, 20, 31], target: 4 } },
    { label: 'One item', input: { nums: [7], target: 7 } },
  ],
  run({ nums: raw, target }) {
    const r = new Recorder(code);
    const nums = [...raw].sort((a, b) => a - b);
    const sortedNote = nums.some((v, i) => v !== raw[i]) ? ' (input sorted first — binary search needs sorted data)' : '';
    const view = (lo: number, hi: number, mid?: number, extra: Record<number, Tone> = {}): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      nums.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      if (mid !== undefined) tones[mid] = 'compare';
      Object.assign(tones, extra);
      const pointers: Record<string, number> = { lo, hi };
      if (mid !== undefined) pointers.mid = mid;
      return { type: 'array', values: nums, tones, pointers, range: lo <= hi ? { from: lo, to: hi, label: 'search space' } : undefined };
    };
    let lo = 0;
    let hi = nums.length - 1;
    r.step('init', `Search space is the whole array: indices ${lo}..${hi}${sortedNote}`, [view(lo, hi)], { lo, hi, target });
    while (true) {
      r.op();
      if (!(lo <= hi)) {
        r.step('loop', `lo (${lo}) > hi (${hi}) — the search space is empty`, [view(lo, hi)], { lo, hi, target });
        r.step('missing', `${target} is not in the array → return -1`, [view(lo, hi)], { lo, hi, target, result: -1 });
        return { frames: r.frames, result: -1 };
      }
      r.step('loop', `lo ≤ hi, so ${hi - lo + 1} candidate${hi - lo ? 's' : ''} remain`, [view(lo, hi)], { lo, hi, target });
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `mid = (${lo} + ${hi}) // 2 = ${mid}`, [view(lo, hi, mid)], { lo, hi, mid, target, 'nums[mid]': nums[mid] });
      r.op();
      if (nums[mid] === target) {
        r.step('check', `nums[${mid}] = ${nums[mid]} equals the target`, [view(lo, hi, mid, { [mid]: 'found' })], { lo, hi, mid, target, 'nums[mid]': nums[mid] });
        r.step('found', `Found ${target} at index ${mid}`, [view(lo, hi, mid, { [mid]: 'found' })], { lo, hi, mid, result: mid });
        return { frames: r.frames, result: mid };
      }
      if (nums[mid] < target) {
        r.step('less', `${nums[mid]} < ${target}: everything left of mid is too small`, [view(lo, hi, mid)], { lo, hi, mid, target, 'nums[mid]': nums[mid] });
        lo = mid + 1;
        r.step('moveLo', `Discard the left half → lo = ${lo}`, [view(lo, hi)], { lo, hi, target });
      } else {
        r.step('less', `${nums[mid]} > ${target}: everything right of mid is too big`, [view(lo, hi, mid)], { lo, hi, mid, target, 'nums[mid]': nums[mid] });
        hi = mid - 1;
        r.step('moveHi', `Discard the right half → hi = ${hi}`, [view(lo, hi)], { lo, hi, target });
      }
    }
  },
  reference({ nums, target }) {
    const s = [...nums].sort((a, b) => a - b);
    let lo = 0;
    let hi = s.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] === target) return mid;
      if (s[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  },
};

const tests = [
  { args: [[1, 3, 5, 7, 9, 11], 7], expected: 3 },
  { args: [[1, 3, 5, 7, 9, 11], 1], expected: 0, name: 'first element' },
  { args: [[1, 3, 5, 7, 9, 11], 11], expected: 5, name: 'last element' },
  { args: [[1, 3, 5, 7, 9, 11], 4], expected: -1, name: 'missing' },
  { args: [[5], 5], expected: 0, name: 'single element' },
  { args: [[], 3], expected: -1, name: 'empty' },
];

const unit: Unit = {
  id: 'binary-search',
  hook: 'Halving the search space turns 1,000,000 checks into 20. Interviewers love it because the off-by-one details expose whether you really understand your loop invariant.',
  predict: {
    prompt: 'nums = [1, 3, 5, 7, 9, 11, 13], target = 11. How many times is `mid` computed before 11 is found?',
    options: ['1', '2', '3', '4'],
    answer: 1,
    explain: 'mid = 3 (value 7, too small) → lo = 4; mid = 5 (value 11) → found. Two probes.',
  },
  viz,
  deeper: {
    points: [
      'Invariant: if the target exists, it is always inside nums[lo..hi]. Every branch must keep that true.',
      '`while lo <= hi` because a one-element range (lo == hi) still needs checking.',
      'Move to mid + 1 / mid - 1, never to mid, or a two-element range can loop forever.',
      'In languages with fixed-size ints, use lo + (hi - lo) // 2 to avoid overflow.',
    ],
    complexity: { time: 'O(log n)', space: 'O(1)' },
    pitfalls: ['Using `lo < hi` with `hi = len - 1` (skips the last candidate)', 'Setting `lo = mid` (infinite loop)', 'Forgetting the data must be sorted'],
  },
  practice: {
    language: 'python',
    fnName: 'binary_search',
    statement: 'Return the index of `target` in the sorted list `nums`, or -1 if it is absent. Use O(log n) time.',
    signature: 'def binary_search(nums, target):',
    solution: `def binary_search(nums, target):
    lo, hi = 0, @@len(nums) - 1@@
    while @@lo <= hi@@:
        mid = @@(lo + hi) // 2@@
        if nums[mid] == target:
            return @@mid@@
        elif nums[mid] < target:
            lo = @@mid + 1@@
        else:
            hi = @@mid - 1@@
    return -1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'binary_search',
    statement: 'This binary search passes most tests but misses some targets. Find and fix the bug.',
    buggy: `def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
    fixed: `def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
    tests,
    bugType: 'off-by-one',
    hint: 'What happens when the search space shrinks to exactly one element?',
    explanation: 'With `hi = len - 1` the range is inclusive, so lo == hi is still a valid candidate. `while lo < hi` exits before checking it. Use `while lo <= hi`.',
  },
  boss: {
    title: 'Search Insert Position',
    statement: 'Given a sorted list of distinct integers and a target, return the index if found. If not, return the index where it would be inserted to keep the list sorted. O(log n).',
    language: 'python',
    fnName: 'search_insert',
    starter: `def search_insert(nums, target):
    # your code here
    pass
`,
    solution: `def search_insert(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return lo`,
    tests: [
      { args: [[1, 3, 5, 6], 5], expected: 2 },
      { args: [[1, 3, 5, 6], 2], expected: 1 },
      { args: [[1, 3, 5, 6], 7], expected: 4, name: 'after the end' },
      { args: [[1, 3, 5, 6], 0], expected: 0, name: 'before the start' },
      { args: [[], 4], expected: 0, name: 'empty' },
    ],
    hints: ['It is ordinary binary search. The only question is what to return when the loop ends.', 'When the loop exits, lo is the first index whose value is greater than target — exactly the insert position.'],
  },
  quiz: [
    {
      prompt: 'Why `lo = mid + 1` instead of `lo = mid`?',
      options: ['It is faster', 'mid was already checked, and `lo = mid` can loop forever on two elements', 'Python requires it', 'To avoid overflow'],
      answer: 1,
      explain: 'When hi = lo + 1, mid == lo. Setting lo = mid changes nothing, so the loop never ends.',
    },
  ],
};

export default unit;
