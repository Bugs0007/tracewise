import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def max_subarray(nums):
    best = cur = nums[0]                  #@init
    for x in nums[1:]:                    #@loop
        cur = max(x, cur + x)             #@extend
        best = max(best, cur)             #@update
    return best                           #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'kadane',
  title: "Kadane's maximum subarray",
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Array', kind: 'numbers', default: [-2, 1, -3, 4, -1, 2, 1, -5, 4], maxItems: 10 }],
  presets: [
    { label: 'All negative', input: { nums: [-3, -1, -2] } },
    { label: 'All positive', input: { nums: [2, 1, 3] } },
    { label: 'Restart late', input: { nums: [5, -9, 6, 1] } },
    { label: 'Two items', input: { nums: [-4, 3] } },
  ],
  run({ nums }) {
    if (!Array.isArray(nums) || nums.length === 0) throw new Error('Enter at least one number');
    const r = new Recorder(code);
    let cur = nums[0];
    let best = nums[0];
    let start = 0;
    let bestFrom = 0;
    let bestTo = 0;
    const curAt: (number | string)[] = nums.map(() => '·');

    const panels = (runTo: number, hot: Record<number, Tone> = {}): ArrayPanel[] => {
      const tones: Record<number, Tone> = {};
      for (let i = bestFrom; i <= bestTo; i++) tones[i] = 'done';
      Object.assign(tones, hot);
      return [
        { type: 'array', title: 'nums  (green = best subarray so far)', values: nums, tones, range: runTo >= start ? { from: start, to: runTo, tone: 'active', label: 'current run' } : undefined },
        { type: 'array', title: 'cur = best sum of a run ending at each index', values: curAt, tones: Object.fromEntries(curAt.map((v, i) => [i, v === '·' ? 'muted' : 'visited'])) as Record<number, Tone> },
      ];
    };

    curAt[0] = cur;
    r.step('init', `Start with the first item: cur = best = ${cur}`, panels(0), { cur, best });
    for (let i = 1; i < nums.length; i++) {
      const x = nums[i];
      r.op();
      r.step('loop', `nums[${i}] = ${x}: extend the run (${cur} + ${x} = ${cur + x}) or restart at ${x}?`, panels(i - 1, { [i]: 'compare' }), { i, x, cur, best });
      const restart = cur < 0;
      if (restart) start = i;
      cur = Math.max(x, cur + x);
      curAt[i] = cur;
      r.step(
        'extend',
        restart ? `The run so far (${curAt[i - 1]}) only hurts → restart at index ${i}, cur = ${cur}` : `Carrying ${curAt[i - 1]} forward helps → extend, cur = ${cur}`,
        panels(i, { [i]: restart ? 'new' : 'compare' }),
        { i, x, cur, best },
      );
      r.op();
      if (cur > best) {
        best = cur;
        bestFrom = start;
        bestTo = i;
        r.step('update', `${cur} beats the old best → best = ${best} (indices ${start}..${i})`, panels(i), { i, cur, best });
      } else {
        r.step('update', `${cur} ≤ ${best} → best stays ${best}`, panels(i), { i, cur, best });
      }
    }
    r.step('done', `Maximum subarray sum = ${best} (indices ${bestFrom}..${bestTo})`, panels(-1), { best });
    return { frames: r.frames, result: best };
  },
  reference({ nums }) {
    let best = -Infinity;
    for (let i = 0; i < nums.length; i++) {
      let sum = 0;
      for (let j = i; j < nums.length; j++) {
        sum += nums[j];
        best = Math.max(best, sum);
      }
    }
    return best;
  },
};

const tests = [
  { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
  { args: [[1]], expected: 1, name: 'single element' },
  { args: [[5, 4, -1, 7, 8]], expected: 23, name: 'take everything' },
  { args: [[-3, -1, -2]], expected: -1, name: 'all negative' },
  { args: [[-1]], expected: -1, name: 'single negative' },
  { args: [[0, 0, 0]], expected: 0, name: 'zeros' },
  { args: [[2, -1, 2]], expected: 3, name: 'dip worth crossing' },
  { args: [[5, -9, 6, 1]], expected: 7, name: 'restart after a deep dip' },
];

const unit: Unit = {
  id: 'kadane',
  hook: 'Maximum subarray looks like it needs every pair of endpoints (O(n²)). Kadane notices that the best run ending at each index depends only on the previous one - a one-line DP that interviewers expect you to derive.',
  predict: {
    prompt: 'nums = [5, -9, 6, 1]. After processing -9, cur is -4. What should cur become when 6 arrives?',
    options: ['2 (extend: -4 + 6)', '6 (restart: drop the negative run)', '11', '-4'],
    answer: 1,
    explain: 'A negative running total can only reduce whatever comes next, so cur = max(6, -4 + 6) = 6: start a fresh run at 6.',
  },
  viz,
  deeper: {
    points: [
      'cur is the best sum of a subarray that ends exactly at index i. Either it extends the previous run (cur + x) or starts fresh (x).',
      'best is the maximum cur seen anywhere. The answer is best, not the final cur.',
      'Extending only helps if the previous run is positive: restart exactly when cur < 0.',
      'Start both from nums[0], not 0, so all-negative arrays return their largest element rather than an empty sum.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Initialising best = 0 (all-negative input returns 0)', 'Writing cur = max(0, cur + x) and not realising it needs best handled separately', 'Returning cur instead of best'],
  },
  practice: {
    language: 'python',
    fnName: 'max_subarray',
    statement: 'Return the largest sum of a non-empty contiguous subarray of `nums` (at least one element). O(n) time, O(1) space.',
    signature: 'def max_subarray(nums):',
    solution: `def max_subarray(nums):
    best = cur = @@nums[0]@@
    for x in @@nums[1:]@@:
        cur = @@max(x, cur + x)@@
        best = @@max(best, cur)@@
    return best`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'max_subarray',
    statement: 'This returns 0 for arrays like [-3, -1, -2] instead of -1. Find the bug.',
    buggy: `def max_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(0, cur + x)
        best = max(best, cur)
    return best`,
    fixed: `def max_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return best`,
    tests,
    bugType: 'clamping to zero',
    hint: 'When the old run is negative, what should the new run be - zero, or the new element?',
    explanation: 'max(0, cur + x) models an empty run, which is not allowed here. Restarting means starting a run AT x, so the choice is max(x, cur + x). With all negatives the clamped version reports 0, a sum no non-empty subarray has.',
  },
  boss: {
    title: 'Maximum product subarray',
    statement: 'Return the largest product of a non-empty contiguous subarray of `nums` (integers, may include negatives and zeros).',
    language: 'python',
    fnName: 'max_product',
    starter: `def max_product(nums):
    # your code here
    pass
`,
    solution: `def max_product(nums):
    best = cur_max = cur_min = nums[0]
    for x in nums[1:]:
        candidates = (x, cur_max * x, cur_min * x)
        cur_max, cur_min = max(candidates), min(candidates)
        best = max(best, cur_max)
    return best`,
    tests: [
      { args: [[2, 3, -2, 4]], expected: 6 },
      { args: [[-2, 0, -1]], expected: 0, name: 'zero splits the array' },
      { args: [[-2, 3, -4]], expected: 24, name: 'two negatives make a positive' },
      { args: [[-3]], expected: -3, name: 'single negative' },
      { args: [[2, -5, -2, -4, 3]], expected: 24 },
      { args: [[0, 2]], expected: 2 },
      { args: [[-1, -2, -3]], expected: 6, name: 'best skips one negative' },
    ],
    hints: ['A big negative product can turn into the biggest positive when the next number is negative. What extra value must you track?', 'Track both the max and the min product of a run ending at each index. For each x consider x, cur_max * x and cur_min * x, and update both.'],
    combines: ['kadane', 'prefix-sum'],
  },
};

export default unit;
