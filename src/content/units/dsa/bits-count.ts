import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bitGrid, binStr, widthFor } from '@/content/lib/hashing-bits';

const code = `
def count_bits(n):
    count = 0              #@init
    while n:               #@loop
        n &= n - 1         #@clear
        count += 1         #@count
    return count           #@done
`;

interface In {
  n: number;
}

const viz: VizDef<In> = {
  id: 'bits-count',
  title: "Counting set bits (Brian Kernighan's trick)",
  code,
  language: 'python',
  inputs: [{ key: 'n', label: 'n (0-1023)', kind: 'number', default: 90 }],
  presets: [
    { label: 'Mixed bits (90)', input: { n: 90 } },
    { label: 'Power of two (64)', input: { n: 64 } },
    { label: 'All ones (255)', input: { n: 255 } },
    { label: 'Zero', input: { n: 0 } },
  ],
  run({ n: start }) {
    if (!Number.isInteger(start) || start < 0 || start > 1023) throw new Error('n must be a whole number from 0 to 1023');
    const r = new Recorder(code);
    const width = widthFor([start], 4);
    let n = start;
    let count = 0;
    const low = (v: number) => (v === 0 ? -1 : Math.log2(v & -v));
    r.step('init', `Count the 1-bits of ${start} (${binStr(start, width)}). count starts at 0`, [bitGrid([{ label: 'n', value: n, tone: 'active' }], width)], { n, count });
    while (true) {
      r.op();
      if (n === 0) {
        r.step('loop', `n is 0: no 1-bits left, the loop stops`, [bitGrid([{ label: 'n', value: n, tone: 'done' }], width)], { n, count });
        break;
      }
      const lb = low(n);
      const col = width - 1 - lb;
      r.step('loop', `n = ${n} (${binStr(n, width)}) is non-zero. Its lowest 1 is bit ${lb}`, [bitGrid([{ label: 'n', value: n, bitTones: { [col]: 'active' } }], width)], { n, count });
      const prev = n - 1;
      const next = n & prev;
      // bits that differ between n and n-1 are the lowest set bit and the zeros below it
      const flipped: Record<number, Tone> = {};
      for (let b = 0; b <= lb; b++) flipped[width - 1 - b] = 'swap';
      r.op();
      r.step(
        'clear',
        `n & (n - 1): ${binStr(n, width)} & ${binStr(prev, width)} = ${binStr(next, width)}. Bit ${lb} is gone`,
        [
          bitGrid(
            [
              { label: 'n', value: n, bitTones: { [col]: 'active' } },
              { label: 'n-1', value: prev, bitTones: flipped },
              { label: 'and', value: next, tone: 'done', bitTones: { [col]: 'found' } },
            ],
            width,
          ),
        ],
        { n: next, count },
      );
      n = next;
      count++;
      r.step('count', `One 1-bit removed: count = ${count}`, [bitGrid([{ label: 'n', value: n, tone: 'visited' }], width)], { n, count });
    }
    r.step('done', `${start} has ${count} set bit${count === 1 ? '' : 's'}: the loop ran exactly ${count} time${count === 1 ? '' : 's'}`, [bitGrid([{ label: 'n', value: start, tone: 'found' }], width)], { count });
    return { frames: r.frames, result: count };
  },
  reference({ n }) {
    return n.toString(2).split('').filter((c) => c === '1').length;
  },
};

const popTests = [
  { args: [0], expected: 0 },
  { args: [1], expected: 1 },
  { args: [7], expected: 3 },
  { args: [8], expected: 1, name: 'power of two' },
  { args: [90], expected: 4 },
  { args: [255], expected: 8, name: 'all ones in a byte' },
  { args: [2147483647], expected: 31, name: 'largest 31-bit value' },
];

const dpTests = [
  { args: [0], expected: [0] },
  { args: [1], expected: [0, 1] },
  { args: [2], expected: [0, 1, 1] },
  { args: [5], expected: [0, 1, 1, 2, 1, 2] },
  { args: [8], expected: [0, 1, 1, 2, 1, 2, 2, 3, 1] },
  { args: [15], expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] },
];

const unit: Unit = {
  id: 'bits-count',
  hook: '"Count the 1-bits" is the classic warm-up. The follow-up, doing it in a loop that runs once per set bit (or filling the answer for 0..n in O(n)), separates memorised tricks from understanding.',
  predict: {
    prompt: 'n = 40 (binary 101000). How many times does `n &= n - 1` run before n becomes 0?',
    options: ['6, once per bit position', '2, once per set bit', '3', '40'],
    answer: 1,
    explain: 'n & (n - 1) always erases the lowest 1-bit. 101000 becomes 100000, then 000000. Two 1-bits, two iterations, regardless of how long the number is.',
  },
  viz,
  deeper: {
    points: [
      'n - 1 flips the lowest 1-bit to 0 and every 0 below it to 1. AND-ing with n therefore removes exactly that lowest 1-bit and nothing else.',
      'So the loop runs once per set bit, not once per bit position: popcount(2^30) takes 1 iteration.',
      'n & (n - 1) == 0 (for n > 0) means n has a single 1-bit, which is the power-of-two test.',
      'DP over 0..n: bits[i] = bits[i >> 1] + (i & 1). Dropping the last bit gives a smaller, already solved number; the dropped bit is i & 1.',
    ],
    complexity: { time: 'O(number of set bits) for one number; O(n) for the DP table', space: 'O(1) for one number; O(n) for the table' },
    pitfalls: ['Writing `n >> 1` as a statement and forgetting to assign it (infinite loop)', 'Using n % 2 vs n & 1 inconsistently: both are fine for non-negative n, but n & 1 is the bit-level intent', 'Counting with `n -= 1` instead of `n &= n - 1`', 'Using these loops on negative numbers in Python: n & (n - 1) never reaches 0 for them'],
  },
  practice: {
    language: 'python',
    fnName: 'count_set_bits',
    statement: "Return how many 1-bits the non-negative integer n has. Use Brian Kernighan's trick so the loop runs once per set bit.",
    signature: 'def count_set_bits(n):',
    solution: `def count_set_bits(n):
    count = 0
    while @@n@@:
        n = @@n & (n - 1)@@
        count += @@1@@
    return @@count@@`,
    tests: popTests,
  },
  debug: {
    language: 'python',
    fnName: 'count_bits',
    statement: 'count_bits(n) should return a list where entry i is the number of 1-bits in i, for i = 0..n. It is right for small n and wrong from 4 onward. Find the bug.',
    buggy: `def count_bits(n):
    bits = [0] * (n + 1)
    for i in range(1, n + 1):
        bits[i] = bits[i - 1] + (i & 1)
    return bits`,
    fixed: `def count_bits(n):
    bits = [0] * (n + 1)
    for i in range(1, n + 1):
        bits[i] = bits[i >> 1] + (i & 1)
    return bits`,
    tests: dpTests,
    bugType: 'wrong subproblem',
    hint: 'i & 1 is the last bit of i. Which smaller number is "i without its last bit"?',
    explanation: 'Dropping the last bit is a right shift, i >> 1, not i - 1. Using bits[i - 1] mixes in a number whose bits have nothing to do with i (for example 4 = 100 versus 3 = 011).',
  },
  boss: {
    title: 'Total Hamming Distance',
    statement: 'The Hamming distance between two integers is the number of bit positions where they differ. Given a list of non-negative integers below 2^31, return the sum of the Hamming distances over every pair. Avoid the O(n^2) pair loop.',
    language: 'python',
    fnName: 'total_hamming_distance',
    starter: `def total_hamming_distance(nums):
    # your code here
    pass
`,
    solution: `def total_hamming_distance(nums):
    total = 0
    n = len(nums)
    for bit in range(31):
        ones = sum((x >> bit) & 1 for x in nums)
        total += ones * (n - ones)
    return total`,
    tests: [
      { args: [[4, 14, 2]], expected: 6 },
      { args: [[4, 14, 4]], expected: 4 },
      { args: [[]], expected: 0, name: 'empty list' },
      { args: [[5]], expected: 0, name: 'single number' },
      { args: [[7, 7]], expected: 0, name: 'identical numbers' },
      { args: [[1, 2, 4, 8]], expected: 12 },
      { args: [[0, 1073741824]], expected: 1, name: 'highest allowed bit' },
    ],
    hints: ['Look at one bit position at a time. At that position every number is either a 0 or a 1.', 'If `ones` numbers have a 1 there and n - ones have a 0, exactly ones * (n - ones) pairs differ at that bit. Sum that over bits 0..30.'],
    combines: ['bits-masks', 'bits-xor'],
  },
  quiz: [
    {
      prompt: 'What is 12 & 11 (binary 1100 & 1011)?',
      options: ['8', '4', '0', '15'],
      answer: 0,
      explain: '12 & (12 - 1) removes the lowest set bit of 1100, leaving 1000 = 8.',
    },
  ],
};

export default unit;
