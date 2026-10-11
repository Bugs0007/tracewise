import type { Tone } from '@/engine/types';
import { arrayView, bitsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './missing-number.py?raw';
import cases from './missing-number.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'missing-number',
  title: 'Missing Number',
  solution,
  inputs: [{ key: 'nums', label: 'n distinct numbers taken from 0 … n (one value is missing)', kind: 'numbers', default: [3, 0, 1, 5, 4], maxItems: 10 }],
  presets: [
    { label: 'Missing in the middle', input: { nums: [3, 0, 1, 5, 4] } },
    { label: 'Missing zero', input: { nums: [1, 2, 3] } },
    { label: 'Missing the last', input: { nums: [0, 1, 2] } },
    { label: 'Single', input: { nums: [1] } },
  ],
  validate: ({ nums }) => {
    const n = nums.length;
    if (!n || nums.some((v) => v === null || !Number.isInteger(v) || v < 0 || v > n)) return `Use whole numbers from 0 to ${n}`;
    return new Set(nums).size === n ? null : 'The numbers must be distinct';
  },
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const n = nums.length;
    const w = Math.max(3, n.toString(2).length);
    let result = n;
    let askedStart = false;
    let askedPair = false;
    const view = (i = -1) => [
      arrayView(nums, { title: `numbers (the full range is 0 … ${n})`, pointers: i >= 0 ? { i } : {}, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }),
      bitsView(result, w, { title: `result (running XOR) = ${result}` }),
      hashMapView({ result }),
    ];
    r.step('init', `Start with result = ${n}, the one index that has no position in the list. Then XOR in every index i and every value x: each number that is present appears twice (once as an index, once as a value) and cancels.`, view(), {});
    if (!askedStart) {
      askedStart = true;
      r.predict('start', `The list has ${n} numbers, and indices run 0 … ${n - 1}. Why does result start at ${n}?`, [`${n} is in the range 0 … ${n} but is never an index`, 'It is the length by convention only', 'To avoid zero'], 0, `The range is 0 … ${n}; the indices cover 0 … ${n - 1}, so ${n} must be XORed in separately.`);
    }
    for (let i = 0; i < n; i++) {
      r.op();
      const x = nums[i];
      r.step('loop', `index ${i}, value ${x}: result ^= ${i} ^ ${x}.`, view(i), { i, x });
      if (!askedPair && i === 0) {
        askedPair = true;
        r.predictChoice('pair', `result = ${result}, i = ${i}, x = ${x}. What is the new result?`, String(result ^ i ^ x), [String(result + i + x), String(result ^ x), String((result ^ i ^ x) + 1)], i + x, 'XOR the index and the value into the running result.');
      }
      result ^= i ^ x;
      r.step('xor', `result = ${result}.`, view(i), { result });
    }
    r.step('done', `Every present number cancelled; the missing number is ${result}.`, view(), { result });
    return { frames: r.frames, result };
  },
  reference({ nums }) {
    const n = nums.length;
    return (n * (n + 1)) / 2 - nums.reduce((a, b) => a + b, 0);
  },
});

export default problem({
  summary: 'A list holds n distinct numbers taken from the range 0 to n, so exactly one number of the range is missing. Find it, using constant extra space and one pass.',
  example: ['[2, 0, 3]', '1', 'The range is 0 … 3 and 1 is the only number absent.'],
  pattern: ['bit-xor', ['bit-xor', 'math', 'hash-lookup', 'sorting'], 'XOR every index and every value together. Each present number occurs once as an index and once as a value, so it cancels; what survives is the missing number.', {
    math: 'The sum n(n+1)/2 minus the list sum also works (and is simple); the XOR version avoids any overflow concerns.',
    'hash-lookup': 'A set works in O(n) space.',
    sorting: 'Sorting works in O(n log n).',
  }],
  hints: [
    'What do you know about the full range 0 … n? How could the list and the range cancel each other?',
    'XOR undoes itself. What if you XOR every number of the range and every number in the list?',
    'result = n; for each i, x: result ^= i ^ x. The answer is result.',
  ],
  insight: 'Range and list contain the same numbers except one, so XOR-ing both leaves the odd one out.',
  brute: 'Use a set and test every candidate: O(n) time and space.',
  optimal: 'XOR (or the sum formula): O(n) time, O(1) space.',
  walk: ['result = len(nums).', 'For each index i and value x: result ^= i ^ x.', 'Return result.'],
  edge: ['The missing number is 0 or n.', 'A single-element list.', 'Unsorted input.'],
  works: ['XOR over the multiset {0, …, n} ∪ nums leaves every present value twice (cancelling) and the missing value once.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'One variable.'],
  solution,
  cases,
  sig: 'def missing_number(nums):\n    # nums holds n distinct values from 0 … n; return the missing one\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
