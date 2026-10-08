import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bitGrid, binStr, bitsOf, widthFor, type BitRow } from '@/content/lib/hashing-bits';

const code = `
def single_number(nums):
    result = 0              #@init
    for n in nums:          #@loop
        result ^= n         #@xor
    return result           #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'bits-xor',
  title: 'XOR: pairs cancel out',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers (every value but one appears twice)', kind: 'numbers', default: [4, 1, 2, 1, 2], maxItems: 9, help: 'Whole numbers 0-255. The result is the XOR of everything.' }],
  presets: [
    { label: 'Pairs cancel', input: { nums: [4, 1, 2, 1, 2] } },
    { label: 'Scattered pairs', input: { nums: [9, 6, 9, 14, 6, 14, 5] } },
    { label: 'Only one number', input: { nums: [7] } },
    { label: 'Not all pairs', input: { nums: [3, 5, 6] } },
  ],
  run({ nums }) {
    if (!nums.length) throw new Error('Add at least one number');
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Use whole numbers from 0 to 255');
    const r = new Recorder(code);
    const width = widthFor(nums, 4);
    let result = 0;
    const panels = (i: number, changed: number[] = [], rowTone: Tone = 'active') => {
      const rows: BitRow[] = nums.map((v, k) => ({ label: String(v), value: v, tone: k < i ? 'visited' : k === i ? rowTone : undefined }));
      const bitTones: Record<number, Tone> = {};
      for (const c of changed) bitTones[c] = 'swap';
      rows.push({ label: 'xor', value: result, tone: 'done', bitTones });
      return [
        { type: 'array' as const, title: 'nums', values: nums, tones: Object.fromEntries(nums.map((_, k) => [k, k < i ? 'visited' : k === i ? rowTone : 'default'])) as Record<number, Tone>, pointers: i >= 0 && i < nums.length ? { n: i } : undefined },
        bitGrid(rows, width, 'bits (columns are bit positions)'),
      ];
    };
    r.step('init', 'result starts at 0: XOR with 0 changes nothing', panels(-1), { result });
    nums.forEach((n, i) => {
      r.step('loop', `n = ${n} (${binStr(n, width)})`, panels(i), { n, result });
      const before = result;
      result ^= n;
      r.op();
      const a = bitsOf(before, width);
      const b = bitsOf(result, width);
      const changed = a.map((x, c) => (x !== b[c] ? c : -1)).filter((c) => c >= 0);
      r.step('xor', `${binStr(before, width)} ^ ${binStr(n, width)} = ${binStr(result, width)}: ${changed.length ? `${changed.length} bit${changed.length > 1 ? 's' : ''} flipped` : 'nothing flipped'}`, panels(i, changed), { n, result });
    });
    r.step('done', `Every value that appeared twice cancelled itself. Return ${result}`, panels(nums.length), { result });
    return { frames: r.frames, result };
  },
  reference({ nums }) {
    return nums.reduce((acc, v) => acc ^ v, 0);
  },
};

const singleTests = [
  { args: [[2, 2, 1]], expected: 1 },
  { args: [[4, 1, 2, 1, 2]], expected: 4, name: 'single value first' },
  { args: [[1]], expected: 1, name: 'one element' },
  { args: [[0, 1, 0]], expected: 1, name: 'zero is a pair too' },
  { args: [[1000000, 7, 1000000]], expected: 7, name: 'large numbers' },
  { args: [[-1, 5, -1, 9, 5]], expected: 9, name: 'negative numbers' },
];

const swapTests = [
  { args: [[1, 2, 3], 0, 2], expected: [3, 2, 1] },
  { args: [[5, 9], 0, 1], expected: [9, 5] },
  { args: [[7, 8, 9], 1, 1], expected: [7, 8, 9], name: 'swap an element with itself' },
  { args: [[4, 4], 0, 1], expected: [4, 4], name: 'equal values' },
  { args: [[1, 2, 3, 4], 3, 0], expected: [4, 2, 3, 1], name: 'i greater than j' },
];

const unit: Unit = {
  id: 'bits-xor',
  hook: 'XOR is the interview bit trick with the best payoff: x ^ x = 0 and x ^ 0 = x, so duplicates erase themselves in O(1) memory.',
  predict: {
    prompt: 'result = 0, then for n in [2, 9, 2]: result ^= n. What does result hold at the end?',
    options: ['13', '2', '9', '0'],
    answer: 2,
    explain: 'XOR is commutative and associative, so the order does not matter: (2 ^ 2) ^ 9 = 0 ^ 9 = 9. The two 2s cancel, the 9 survives.',
  },
  viz,
  deeper: {
    points: [
      'Three laws do all the work: x ^ 0 = x, x ^ x = 0, and the order does not matter.',
      'So XOR-ing a list where every value appears twice except one gives that one value, with no hash set and O(1) space.',
      'A ^ B tells you which bits differ. XOR-ing a value into itself clears it; XOR-ing a mask toggles those bits.',
      'Swap without a temp: a ^= b; b ^= a; a ^= b. It is a famous trick, but in practice a, b = b, a is clearer.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['XOR swap on the same variable or index zeroes it (a ^= a is 0)', 'Using `|` or `+` for accumulation: only XOR cancels duplicates', 'Expecting it to work when a value appears three times (then it survives)'],
  },
  practice: {
    language: 'python',
    fnName: 'single_number',
    statement: 'Every value in `nums` appears exactly twice except one. Return that value using O(1) extra space.',
    signature: 'def single_number(nums):',
    solution: `def single_number(nums):
    result = @@0@@
    for n in @@nums@@:
        result @@^=@@ n
    return @@result@@`,
    tests: singleTests,
  },
  debug: {
    language: 'python',
    fnName: 'xor_swap',
    statement: 'xor_swap(arr, i, j) should swap two elements of a list in place and return it. It works until i and j are the same index. Fix it.',
    buggy: `def xor_swap(arr, i, j):
    arr[i] ^= arr[j]
    arr[j] ^= arr[i]
    arr[i] ^= arr[j]
    return arr`,
    fixed: `def xor_swap(arr, i, j):
    if i != j:
        arr[i] ^= arr[j]
        arr[j] ^= arr[i]
        arr[i] ^= arr[j]
    return arr`,
    tests: swapTests,
    bugType: 'xor swap on the same slot',
    hint: 'What does arr[i] ^= arr[j] do when arr[i] and arr[j] are literally the same list slot?',
    explanation: 'With i == j the first line computes x ^ x = 0, so the element is wiped and every later step XORs with 0. The trick only works for two different locations. Guard it with `if i != j` (or just use a tuple swap).',
  },
  boss: {
    title: 'Missing Number',
    statement: 'A list holds n distinct integers taken from the range 0..n, so exactly one value in that range is missing. Return it in O(n) time and O(1) extra space.',
    language: 'python',
    fnName: 'missing_number',
    starter: `def missing_number(nums):
    # your code here
    pass
`,
    solution: `def missing_number(nums):
    x = len(nums)
    for i, v in enumerate(nums):
        x ^= i ^ v
    return x`,
    tests: [
      { args: [[3, 0, 1]], expected: 2 },
      { args: [[0, 1]], expected: 2, name: 'the last value is missing' },
      { args: [[1]], expected: 0, name: 'zero is missing' },
      { args: [[]], expected: 0, name: 'empty list' },
      { args: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], expected: 8 },
    ],
    hints: ['Imagine writing out every index 0..n next to every value you were given. Which number appears only once in that combined collection?', 'Start x = len(nums) (the index n has no slot), then for each position XOR in both the index and the value. Everything present appears twice and cancels.'],
    combines: ['hash-set'],
  },
  quiz: [
    {
      prompt: 'What is 13 ^ 13 ^ 6?',
      options: ['6', '13', '0', '26'],
      answer: 0,
      explain: '13 ^ 13 = 0 and 0 ^ 6 = 6.',
    },
  ],
};

export default unit;
