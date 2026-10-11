import type { Tone } from '@/engine/types';
import { arrayView, bitsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './single-number.py?raw';
import cases from './single-number.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'single-number',
  title: 'Single Number',
  solution,
  inputs: [{ key: 'nums', label: 'numbers 0 to 63: every value appears twice except one', kind: 'numbers', default: [12, 5, 12, 9, 5], maxItems: 9 }],
  presets: [
    { label: 'One odd one out', input: { nums: [12, 5, 12, 9, 5] } },
    { label: 'Single element', input: { nums: [11] } },
    { label: 'Zero is the loner', input: { nums: [0, 6, 6] } },
    { label: 'Many pairs', input: { nums: [1, 2, 3, 2, 1, 5, 3] } },
  ],
  validate: ({ nums }) => {
    if (nums.some((v) => v === null || !Number.isInteger(v) || v < 0 || v > 63)) return 'Use whole numbers from 0 to 63';
    const counts = new Map<number, number>();
    nums.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    const singles = [...counts.values()].filter((c) => c === 1).length;
    return singles === 1 && [...counts.values()].every((c) => c <= 2) ? null : 'Exactly one value must appear once; all others exactly twice';
  },
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let result = 0;
    let askedXor = false;
    let askedCancel = false;
    const seen = new Map<number, number>();
    const view = (i = -1) => [
      arrayView(nums, { title: 'numbers', pointers: i >= 0 ? { i } : {}, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }),
      bitsView(result, 6, { title: `result (running XOR) = ${result}` }),
      ...(i >= 0 ? [bitsView(nums[i], 6, { title: `current number ${nums[i]}` })] : []),
      hashMapView({ result }),
    ];
    r.step('init', 'XOR (^) compares bits: the result bit is 1 only where the two bits differ. Key facts: x ^ x = 0 and x ^ 0 = x. So a number that appears twice cancels itself.', view(), {});
    for (let i = 0; i < nums.length; i++) {
      r.op();
      const x = nums[i];
      const next = result ^ x;
      r.step('loop', `result = ${result} ^ ${x}.`, view(i), { x });
      if (!askedXor && i === 0) {
        askedXor = true;
        r.predictChoice('xor', `result is ${result} and x is ${x}. What is result ^ x?`, String(next), [String(result + x), String(result & x), String(next + 1)], i, 'x ^ 0 = x: with an empty result the first number is simply copied in.');
      }
      if (!askedCancel && seen.has(x)) {
        askedCancel = true;
        r.predictChoice('cancel', `${x} appeared before and is XORed in again. What happens to its bits in result?`, 'They cancel out', ['They double', 'They are unchanged', 'They all become 1'], i, 'x ^ x = 0, so the second copy removes the first one from the result.');
      }
      seen.set(x, (seen.get(x) ?? 0) + 1);
      result = next;
      r.step('xor', `result = ${result}.`, view(i), { result });
    }
    r.step('done', `All pairs cancelled; what is left is the single number ${result}.`, view(), { result });
    return { frames: r.frames, result };
  },
  reference({ nums }) {
    return nums.reduce((a, b) => a ^ b, 0);
  },
});

export default problem({
  summary: 'Every number in a list appears exactly twice except one number, which appears once. Find that single number, using constant extra space.',
  example: ['[6, 3, 8, 3, 8]', '6', 'Pairs cancel: 3, 3 and 8, 8 disappear, leaving 6.'],
  pattern: ['bit-xor', ['bit-xor', 'hash-lookup', 'sorting', 'bit-ops'], 'XOR of two equal numbers is 0 and XOR with 0 changes nothing. XOR-ing the whole list makes every pair vanish and leaves the single number, in O(1) space.', {
    'hash-lookup': 'A set or counter works but uses O(n) extra space.',
    sorting: 'Sorting works in O(n log n) and can compare neighbours.',
    'bit-ops': 'XOR is a bit operation; the specific trick is x ^ x = 0.',
  }],
  hints: [
    'A hash set or a sort would solve it. Is there an operation that undoes itself?',
    'What is x ^ x? What is x ^ 0? Does the order of XORs matter?',
    'Start with result = 0 and XOR every number into it.',
  ],
  insight: 'XOR is commutative and self-cancelling, so equal pairs disappear no matter where they are.',
  brute: 'Count occurrences with a dictionary: O(n) time, O(n) space.',
  optimal: 'XOR everything: O(n) time, O(1) space.',
  walk: ['result = 0.', 'For each number: result ^= number.', 'Return result.'],
  edge: ['A single element.', 'Zero as the single number.', 'Negative numbers (XOR still cancels pairs).'],
  works: ['XOR is associative and commutative, so the pairs can be regrouped next to each other; each pair gives 0, and 0 ^ single = single.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'One variable.'],
  solution,
  cases,
  sig: 'def single_number(nums):\n    # every value appears twice except one; return that one\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
