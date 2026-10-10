import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder, nz } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './product-of-array-except-self.py?raw';
import cases from './product-of-array-except-self.cases.json';

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'product-of-array-except-self',
  title: 'Product of Array Except Self',
  code: solution,
  language: 'python',
  inputs: [{ key: 'nums', label: 'nums', kind: 'numbers', default: [2, 3, 4, 5], maxItems: 9 }],
  presets: [
    { label: 'Classic', input: { nums: [2, 3, 4, 5] } },
    { label: 'One zero', input: { nums: [2, -2, 0, 4, -5] } },
    { label: 'Two zeros', input: { nums: [0, 0, 2] } },
    { label: 'Two elements', input: { nums: [4, 7] } },
  ],
  run({ nums }) {
    if (nums.length < 1) throw new Error('Enter at least one number');
    const n = nums.length;
    const r = new TraceRecorder(solution);
    const res: number[] = [];
    let prefix = 1;
    let suffix = 1;
    let phase: 'init' | 'left' | 'right' | 'done' = 'init';
    const view = (i: number, tones: Record<number, Tone> = {}, resTones: Record<number, Tone> = {}) => [
      arrayView(nums, { title: 'nums', tones, pointers: i >= 0 && i < n ? { i } : undefined }),
      arrayView(res, { title: phase === 'left' ? 'res (left products)' : phase === 'right' ? 'res (left × right)' : 'res', tones: resTones }),
      hashMapView(phase === 'left' ? { prefix } : phase === 'right' ? { suffix } : {}, { title: phase === 'left' ? 'running product from the left' : phase === 'right' ? 'running product from the right' : undefined }),
    ];
    r.step('init', `n = ${n}. res[i] will be the product of every number except nums[i].`, view(-1), { n });
    res.push(...Array.from({ length: n }, () => 1));
    r.step('res', 'Start res as all ones: a neutral value for multiplication.', view(-1), { res: JSON.stringify(res) });
    phase = 'left';
    r.step('prefixInit', 'Pass 1, left to right. prefix holds the product of everything to the left of i (nothing yet, so 1).', view(-1), { prefix });
    for (let i = 0; i < n; i++) {
      const done: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) done[k] = 'visited';
      r.op();
      r.step('leftLoop', `i = ${i}`, view(i, { ...done, [i]: 'active' }), { i, prefix });
      res[i] = prefix;
      r.step('leftSet', `res[${i}] = prefix = ${prefix}: the product of everything left of index ${i}.`, view(i, { ...done, [i]: 'active' }, { [i]: 'new' }), { i, prefix });
      if (i === Math.min(2, n - 1)) r.predictChoice('left', `prefix is ${prefix} and nums[${i}] = ${nums[i]}. What is prefix after this step?`, String(nz(prefix * nums[i])), [String(prefix + nums[i]), String(prefix), String(nz(prefix * nums[i]) + 1)], i, `prefix *= nums[i]: ${prefix} × ${nums[i]}. Now prefix covers index ${i} too, ready for the next index.`);
      prefix = nz(prefix * nums[i]);
      r.step('leftGrow', `prefix *= nums[${i}] → ${prefix}. It now includes index ${i}, ready for the next position.`, view(i, { ...done, [i]: 'compare' }, { [i]: 'new' }), { i, prefix });
    }
    phase = 'right';
    r.step('suffixInit', 'Pass 2, right to left. suffix holds the product of everything to the right of i (nothing yet, so 1).', view(n), { suffix });
    for (let i = n - 1; i >= 0; i--) {
      const done: Record<number, Tone> = {};
      for (let k = n - 1; k > i; k--) done[k] = 'visited';
      r.op();
      r.step('rightLoop', `i = ${i}`, view(i, { ...done, [i]: 'active' }), { i, suffix });
      const before = res[i];
      if (i === Math.max(0, n - 3)) r.predictChoice('right', `res[${i}] holds ${before} (left side) and suffix is ${suffix}. What does res[${i}] become?`, String(nz(before * suffix)), [String(before + suffix), String(before), String(suffix)], i, 'Left product × right product = everything except nums[i].');
      res[i] = nz(res[i] * suffix);
      r.step('rightSet', `res[${i}] *= suffix: ${before} × ${suffix} = ${res[i]}. Left part times right part.`, view(i, { ...done, [i]: 'active' }, { [i]: 'done' }), { i, suffix, 'res[i]': res[i] });
      suffix = nz(suffix * nums[i]);
      r.step('rightGrow', `suffix *= nums[${i}] → ${suffix}.`, view(i, { ...done, [i]: 'compare' }, { [i]: 'done' }), { i, suffix });
    }
    phase = 'done';
    r.step('done', `Done: ${JSON.stringify(res)}. No division was used, so zeros are no problem.`, view(-1, {}, Object.fromEntries(res.map((_, k) => [k, 'found' as Tone]))), { res: JSON.stringify(res) });
    return { frames: r.frames, result: [...res] };
  },
  reference({ nums }) {
    return nums.map((_, i) => nz(nums.reduce((p, v, j) => (j === i ? p : p * v), 1)));
  },
};

const content: ProblemContent = {
  summary: 'Given a list of integers, build a new list where each position holds the product of all the other numbers in the input. Do it without using division, and in a single linear pass or two.',
  example: { input: 'nums = [2, 5, 3]', output: '[15, 6, 10]', note: 'Position 0 is 5 × 3, position 1 is 2 × 3, position 2 is 2 × 5.' },
  pattern: {
    answer: 'prefix-suffix',
    options: ['prefix-suffix', 'hash-lookup', 'sorting', 'sliding-window'],
    why: 'The product of everything except nums[i] is (product of everything to its left) × (product of everything to its right). Each of those can be accumulated in one sweep from its own side.',
    notes: {
      'hash-lookup': 'No value needs to be looked up. The answer at each position comes from running products, not from remembering values.',
      sorting: 'Order matters here (left and right of i), so sorting would destroy the information.',
      'sliding-window': 'The product excludes one element from the whole list, rather than covering a window of neighbours.',
    },
  },
  hints: [
    'Dividing the total product by nums[i] is tempting. Why does that fail when the list contains zeros, and why does the problem forbid it anyway?',
    'Split "everything except i" into two parts: everything to the left of i and everything to the right of i.',
    'Sweep left to right keeping a running product of what is to the left, store it in the result. Then sweep right to left with a running product of the right side and multiply it in.',
  ],
  explanation: {
    insight: 'Answer[i] = (product left of i) × (product right of i). Collect the left products in one sweep and fold in the right products in the other.',
    brute: 'For each index multiply all the other numbers: O(n²) time.',
    optimal: 'Two sweeps with running products, writing into the output list: O(n) time and O(1) extra space (the output does not count).',
    walkthrough: [
      'Pass 1 (left to right): keep prefix, the product of nums[0..i-1]. Before updating it, write res[i] = prefix. After this pass res[i] holds the product of everything left of i.',
      'Pass 2 (right to left): keep suffix, the product of nums[i+1..n-1]. Multiply res[i] by suffix, then fold nums[i] into suffix.',
      'Now res[i] = left product × right product, which is exactly the product of everything except nums[i].',
      'Zeros need no special handling: a zero simply makes the running products zero from that point on, and the "skip yourself" structure still holds.',
    ],
    edgeCases: ['A single element: the product of nothing is 1, so the answer is [1].', 'One zero: only the position of the zero is non-zero.', 'Two or more zeros: every position is zero.', 'Negative numbers: signs ride along in the products.'],
    whyItWorks: [
      'After pass 1, res[i] = nums[0] × … × nums[i-1] because prefix equals that product at the moment it is written. After pass 2 each res[i] is multiplied by nums[i+1] × … × nums[n-1].',
      'Together that is every element except i, each counted exactly once, and nothing is divided, so there is nothing to go wrong with zeros.',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'Two passes over the list, each with constant work per element.' },
    space: { big: 'O(1)', why: 'Besides the output list, only the two running products are stored.' },
  },
  solution,
  task: taskFrom(cases, 'def product_except_self(nums):\n    # return a list where result[i] is the product of all other numbers\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([nums]) => ({ nums }),
};

export default content;
