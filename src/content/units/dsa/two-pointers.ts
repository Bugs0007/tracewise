import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def two_sum_sorted(nums, target):
    lo, hi = 0, len(nums) - 1             #@init
    while lo < hi:                        #@loop
        s = nums[lo] + nums[hi]           #@sum
        if s == target:                   #@check
            return [lo, hi]               #@found
        if s < target:                    #@less
            lo += 1                       #@moveLo
        else:
            hi -= 1                       #@moveHi
    return []                             #@missing
`;

interface In {
  nums: number[];
  target: number;
}

const viz: VizDef<In> = {
  id: 'two-pointers',
  title: 'Two pointers from both ends',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Sorted array', kind: 'numbers', default: [1, 3, 4, 6, 9, 11, 15], maxItems: 12 },
    { key: 'target', label: 'Target sum', kind: 'number', default: 14 },
  ],
  presets: [
    { label: 'Pair found', input: { nums: [1, 3, 4, 6, 9, 11, 15], target: 14 } },
    { label: 'No pair', input: { nums: [1, 2, 4, 7], target: 20 } },
    { label: 'Pair at the ends', input: { nums: [2, 5, 9, 14], target: 16 } },
    { label: 'Negatives', input: { nums: [-8, -3, 0, 2, 5, 9], target: -1 } },
  ],
  run({ nums: raw, target }) {
    if (!Array.isArray(raw) || raw.length < 2) throw new Error('Enter at least two numbers');
    const r = new Recorder(code);
    const nums = [...raw].sort((a, b) => a - b);
    const sortedNote = nums.some((v, i) => v !== raw[i]) ? ' (input sorted first)' : '';
    const view = (lo: number, hi: number, hot: Record<number, Tone> = {}): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      nums.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      Object.assign(tones, hot);
      return { type: 'array', title: `Sorted array — looking for a pair that sums to ${target}`, values: nums, tones, pointers: { lo, hi }, range: lo <= hi ? { from: lo, to: hi, label: 'still possible' } : undefined };
    };
    let lo = 0;
    let hi = nums.length - 1;
    r.step('init', `One pointer at each end: lo = ${lo}, hi = ${hi}${sortedNote}`, [view(lo, hi)], { lo, hi, target });
    while (lo < hi) {
      r.op();
      const s = nums[lo] + nums[hi];
      r.step('sum', `nums[${lo}] + nums[${hi}] = ${nums[lo]} + ${nums[hi]} = ${s}`, [view(lo, hi, { [lo]: 'compare', [hi]: 'compare' })], { lo, hi, s, target });
      if (s === target) {
        r.step('check', `${s} equals the target`, [view(lo, hi, { [lo]: 'found', [hi]: 'found' })], { lo, hi, s, target });
        r.step('found', `Found the pair at indices ${lo} and ${hi}: ${nums[lo]} + ${nums[hi]} = ${target}`, [view(lo, hi, { [lo]: 'found', [hi]: 'found' })], { lo, hi, result: `[${lo}, ${hi}]` });
        return { frames: r.frames, result: [lo, hi] };
      }
      if (s < target) {
        r.step('less', `${s} < ${target}: sum too small — only a bigger left value can help`, [view(lo, hi, { [lo]: 'swap', [hi]: 'compare' })], { lo, hi, s, target });
        lo++;
        r.step('moveLo', `Discard nums[${lo - 1}] = ${nums[lo - 1]} (no partner can reach ${target}) → lo = ${lo}`, [view(lo, hi)], { lo, hi, target });
      } else {
        r.step('less', `${s} > ${target}: sum too big — only a smaller right value can help`, [view(lo, hi, { [lo]: 'compare', [hi]: 'swap' })], { lo, hi, s, target });
        hi--;
        r.step('moveHi', `Discard nums[${hi + 1}] = ${nums[hi + 1]} (every partner is too big) → hi = ${hi}`, [view(lo, hi)], { lo, hi, target });
      }
    }
    r.step('missing', `lo reached hi — no pair sums to ${target} → return []`, [view(lo, hi)], { lo, hi, result: '[]' });
    return { frames: r.frames, result: [] };
  },
  reference({ nums, target }) {
    const s = [...nums].sort((x, y) => x - y);
    let i = 0;
    let j = s.length - 1;
    while (i < j) {
      const t = s[i] + s[j];
      if (t === target) return [i, j];
      if (t < target) i++;
      else j--;
    }
    return [];
  },
};

const unit: Unit = {
  id: 'two-pointers',
  hook: 'On a sorted array, two pointers walking inward replace the O(n²) pair search with a single O(n) pass. The reasoning ("why is it safe to throw that element away?") is exactly what interviewers probe.',
  predict: {
    prompt: 'nums = [1, 3, 4, 6, 9, 11, 15], target = 14. First check: 1 + 15 = 16 > 14. Which pointer should move, and why?',
    options: ['lo moves right, to make the sum bigger', 'hi moves left, because 15 is too large for any partner', 'Both move inward', 'Neither; restart with a new pair'],
    answer: 1,
    explain: 'The sum is too big. Even paired with the smallest value (1), 15 overshoots, so 15 cannot be part of any answer. Moving hi left discards it safely.',
  },
  viz,
  deeper: {
    points: [
      'Safety argument: when the sum is too big, the current hi value fails even with the smallest remaining partner, so it can never be in a valid pair. Symmetric for lo when the sum is too small.',
      'Every iteration discards one element, so the loop runs at most n - 1 times.',
      'Needs sorted input. On unsorted data use a hash map instead (one pass, O(n) space).',
      'Container with most water uses the same shape: move the pointer at the shorter wall, because the shorter wall limits the area.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Using `lo <= hi` (pairs an element with itself)', 'Moving the wrong pointer for the comparison', 'Running it on unsorted input'],
  },
  practice: {
    language: 'python',
    fnName: 'two_sum_sorted',
    statement: 'In the sorted list `nums`, find two different positions whose values add up to `target`. Return `[i, j]` with i < j, or `[]` if there is no such pair. Use O(1) extra space.',
    signature: 'def two_sum_sorted(nums, target):',
    solution: `def two_sum_sorted(nums, target):
    lo, hi = 0, @@len(nums) - 1@@
    while @@lo < hi@@:
        s = @@nums[lo] + nums[hi]@@
        if s == target:
            return @@[lo, hi]@@
        if @@s < target@@:
            lo += 1
        else:
            hi -= 1
    return []`,
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[1, 3, 4, 6, 9, 11, 15], 14], expected: [1, 5] },
      { args: [[1, 2, 3], 7], expected: [], name: 'no pair' },
      { args: [[], 5], expected: [], name: 'empty' },
      { args: [[5], 10], expected: [], name: 'one element cannot pair with itself' },
      { args: [[-3, -1, 0, 2, 5], -1], expected: [0, 3], name: 'negatives' },
      { args: [[3, 3], 6], expected: [0, 1], name: 'duplicates' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'two_sum_sorted',
    statement: 'This pair finder sometimes reports a pair made of one element used twice. Find the bug.',
    buggy: `def two_sum_sorted(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1
        else:
            hi -= 1
    return []`,
    fixed: `def two_sum_sorted(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1
        else:
            hi -= 1
    return []`,
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[1, 3, 4, 6, 9, 11, 15], 14], expected: [1, 5] },
      { args: [[1, 2, 3], 7], expected: [] },
      { args: [[5], 10], expected: [], name: 'one element' },
      { args: [[1, 2, 4], 8], expected: [], name: 'only 4 + 4 would work' },
    ],
    bugType: 'wrong loop condition',
    hint: 'What do lo and hi point at when lo == hi? Should that count as a pair?',
    explanation: 'A pair needs two different positions. With `lo <= hi` the loop runs once more with lo == hi and happily returns [i, i] when 2 * nums[i] equals the target. Use `lo < hi`.',
  },
  boss: {
    title: 'Container with most water',
    statement: 'heights[i] is the height of a vertical wall at x = i. Pick two walls; the water they hold is (distance between them) × (the shorter height). Return the largest amount of water possible. O(n) time.',
    language: 'python',
    fnName: 'max_area',
    starter: `def max_area(heights):
    # your code here
    pass
`,
    solution: `def max_area(heights):
    lo, hi = 0, len(heights) - 1
    best = 0
    while lo < hi:
        best = max(best, (hi - lo) * min(heights[lo], heights[hi]))
        if heights[lo] < heights[hi]:
            lo += 1
        else:
            hi -= 1
    return best`,
    tests: [
      { args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]], expected: 49 },
      { args: [[1, 1]], expected: 1 },
      { args: [[4, 3, 2, 1, 4]], expected: 16 },
      { args: [[1, 2, 1]], expected: 2 },
      { args: [[5]], expected: 0, name: 'one wall holds nothing' },
      { args: [[]], expected: 0, name: 'empty' },
      { args: [[2, 3, 10, 5, 7, 8, 9]], expected: 36 },
    ],
    hints: ['Start with the widest container (both ends). Which wall limits the water?', 'Move the pointer at the shorter wall inward: keeping it can only give less width and the same or lower height. Track the best area as you go.'],
    combines: ['two-pointers', 'binary-search'],
  },
};

export default unit;
