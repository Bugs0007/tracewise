import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './maximum-product-subarray.py?raw';
import cases from './maximum-product-subarray.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'maximum-product-subarray',
  title: 'Maximum Product Subarray',
  solution,
  inputs: [{ key: 'nums', label: 'numbers (negatives and zeros allowed)', kind: 'numbers', default: [3, -2, 4, -1], maxItems: 9 }],
  presets: [
    { label: 'Two negatives', input: { nums: [3, -2, 4, -1] } },
    { label: 'Zero splits', input: { nums: [2, 0, 5, 3] } },
    { label: 'All negative', input: { nums: [-1, -2, -3] } },
    { label: 'Single negative', input: { nums: [-5] } },
  ],
  validate: ({ nums }) => (!nums.length || nums.some((v) => v === null || !Number.isFinite(v)) ? 'Enter at least one plain number' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let hi = nums[0];
    let lo = nums[0];
    let best = nums[0];
    let askedCand = false;
    let candAt = -1;
    let askedSwap = false;
    const view = (i: number) => [
      arrayView(nums, { title: 'numbers', pointers: { x: i }, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }),
      hashMapView({ 'largest product ending here (hi)': hi, 'smallest product ending here (lo)': lo, 'best overall': best }),
    ];
    r.step('init', `Track the largest AND the smallest product of a subarray ending at the current number: a very negative product turns into the best one when multiplied by a negative number. Start with ${nums[0]}.`, view(0), {});
    for (let i = 1; i < nums.length; i++) {
      r.op();
      const x = nums[i];
      const cands = [x, hi * x, lo * x];
      r.step('loop', `x = ${x}. The products ending here can be: start fresh (${x}), extend the best (${hi} × ${x} = ${hi * x}), or extend the smallest (${lo} × ${x} = ${lo * x}).`, view(i), { x });
      if (!askedCand) {
        askedCand = true;
        candAt = i;
        r.predictChoice('cand', `With x = ${x}, hi = ${hi} and lo = ${lo}, what is the new hi?`, String(Math.max(...cands)), [String(Math.min(...cands)), String(hi * x === Math.max(...cands) ? lo * x + 1 : hi * x), String(Math.max(...cands) + 1)], i, 'Take the maximum of the three options. A negative x makes lo × x the largest when lo is negative.');
      }
      const nh = Math.max(...cands);
      const nl = Math.min(...cands);
      if (!askedSwap && i !== candAt && x < 0 && nh !== hi * x) {
        askedSwap = true;
        r.predict('swap', `x = ${x} is negative. What happens to the roles of "largest" and "smallest"?`, ['They swap: the old smallest times a negative can become the new largest', 'Nothing changes', 'Both become negative'], 0, 'Multiplying by a negative reverses the order, so lo × x may beat hi × x.');
      }
      hi = nh;
      lo = nl;
      best = Math.max(best, hi);
      r.step('update', `hi = ${hi}, lo = ${lo}. best = max(best, hi) = ${best}.`, view(i), { hi, lo, best });
    }
    r.step('done', `The largest product of any subarray is ${best}.`, view(nums.length - 1), { result: best });
    return { frames: r.frames, result: best };
  },
  reference({ nums }) {
    let best = nums[0];
    for (let i = 0; i < nums.length; i++) {
      let p = 1;
      for (let j = i; j < nums.length; j++) {
        p *= nums[j];
        best = Math.max(best, p);
      }
    }
    return best;
  },
});

export default problem({
  summary: 'Given a list of numbers (which may be negative or zero), find the largest product of any non-empty contiguous subarray.',
  example: ['[2, -3, -4, 1]', '24', '2 × (−3) × (−4) = 24: the two negatives cancel.'],
  pattern: ['dp-1d', ['dp-1d', 'sliding-window', 'greedy', 'prefix-sum'], 'The best product ending at i depends on both the biggest and the smallest product ending at i − 1, because a negative number turns the smallest into the biggest. Track both.', {
    'sliding-window': 'Products do not grow or shrink monotonically with the window.',
    greedy: 'Simple greedy rules fail with negatives and zeros.',
    'prefix-sum': 'Products have zeros and sign changes, so differences of prefixes do not work.',
  }],
  hints: [
    'In Maximum Subarray you track the best sum ending here. Why is that not enough for products?',
    'What happens when you multiply a very negative product by a negative number?',
    'Keep hi and lo (largest and smallest product ending at the current number). New values are the max and min of (x, hi·x, lo·x).',
  ],
  insight: 'Keep both the maximum and minimum product ending here: the minimum can become the next maximum.',
  brute: 'Multiply every subarray: O(n²).',
  optimal: 'DP with two values: O(n) time, O(1) space.',
  walk: ['hi = lo = best = nums[0].', 'For each next x: candidates = (x, hi·x, lo·x).', 'hi = max(candidates), lo = min(candidates).', 'best = max(best, hi). Return best.'],
  edge: ['A single number.', 'Zeros restart the product.', 'An odd number of negatives.', 'All negatives.'],
  works: ['Any subarray ending at x either is just x or extends a subarray ending at the previous number; its product is extreme only if that previous product was extreme in the direction that x amplifies.', 'So only the max and min need to be remembered.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Three variables.'],
  solution,
  cases,
  sig: 'def max_product(nums):\n    # largest product of a contiguous non-empty subarray\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
