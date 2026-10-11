import type { Tone } from '@/engine/types';
import { bitsView, dpTable1D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './counting-bits.py?raw';
import cases from './counting-bits.cases.json';

const viz = vizOf<{ n: number }>({
  id: 'counting-bits',
  title: 'Counting Bits',
  solution,
  inputs: [{ key: 'n', label: 'n (0 to 20): count the 1 bits of every number from 0 to n', kind: 'number', default: 10 }],
  presets: [
    { label: 'Up to 10', input: { n: 10 } },
    { label: 'Up to 5', input: { n: 5 } },
    { label: 'Up to 16', input: { n: 16 } },
    { label: 'Zero', input: { n: 0 } },
  ],
  validate: ({ n }) => (Number.isInteger(n) && n >= 0 && n <= 20 ? null : 'Use a whole number from 0 to 20'),
  run({ n }) {
    const r = new TraceRecorder(solution);
    const bits = Array(n + 1).fill(0) as number[];
    const done = (upTo: number): Record<number, Tone> => Object.fromEntries(Array.from({ length: upTo + 1 }, (_, i) => [i, 'done' as Tone]));
    let askedFill = false;
    let askedShift = false;
    r.step('init', `bits[i] will hold the number of 1 bits in i. bits[0] = 0.`, [dpTable1D(bits, { title: 'bits', tones: { 0: 'done' } })], {});
    for (let i = 1; i <= n; i++) {
      r.op();
      const half = i >> 1;
      r.step('loop', `i = ${i} (binary ${i.toString(2)}). Shifting right drops the last bit: i >> 1 = ${half}.`, [bitsView(i, 5, { title: `i = ${i}` }), bitsView(half, 5, { title: `i >> 1 = ${half}` }), dpTable1D(bits, { title: 'bits', filling: i, deps: [half], tones: done(i - 1) })], { i });
      if (!askedShift) {
        askedShift = true;
        r.predict('shift', `i = ${i} has the same bits as ${half} with one more bit appended at the end. How are their counts related?`, ['bits[i] = bits[i >> 1] + (the last bit of i)', 'bits[i] = bits[i >> 1] × 2', 'They are always equal'], 0, 'Only the dropped last bit can differ: add 1 if it is a 1, otherwise nothing.');
      }
      if (!askedFill && i === 5) {
        askedFill = true;
        r.predictChoice('fill', `bits[${half}] = ${bits[half]} and the last bit of ${i} is ${i & 1}. What is bits[${i}]?`, String(bits[half] + (i & 1)), [String(bits[half]), String(bits[half] + 2), String(bits[half] * 2)], i, 'bits[i] = bits[i >> 1] + (i & 1).');
      }
      bits[i] = bits[half] + (i & 1);
      r.step('fill', `bits[${i}] = bits[${half}] + ${i & 1} = ${bits[i]}.`, [dpTable1D(bits, { title: 'bits', tones: done(i) })], { value: bits[i] });
    }
    r.step('done', `Counts for 0…${n}: [${bits.join(', ')}].`, [dpTable1D(bits, { title: 'bits', tones: done(n) })], { result: JSON.stringify(bits) });
    return { frames: r.frames, result: bits };
  },
  reference({ n }) {
    return Array.from({ length: n + 1 }, (_, i) => i.toString(2).split('1').length - 1);
  },
});

export default problem({
  summary: 'For every integer from 0 to n, count the 1 bits in its binary form, and return the list of counts. Aim for a single pass that reuses earlier answers instead of counting each number from scratch.',
  example: ['n = 4', '[0, 1, 1, 2, 1]', '0 → 0, 1 → 1, 2 (10) → 1, 3 (11) → 2, 4 (100) → 1.'],
  pattern: ['bit-ops', ['bit-ops', 'dp-1d', 'math', 'bit-xor'], 'A number i has the same bits as i >> 1 plus one more bit at the end. So its count equals the count of i >> 1 plus that last bit, which is already known.', {
    'dp-1d': 'The table reuses smaller answers, which is DP; the recurrence is a bit trick.',
    math: 'Counting from scratch each time works but wastes the earlier results.',
    'bit-xor': 'XOR cancels equal values; it is not a counting tool.',
  }],
  hints: [
    'How is the binary form of 6 related to the binary form of 3?',
    'If you know the count for i >> 1, what extra information do you need for i?',
    'bits[i] = bits[i >> 1] + (i & 1), filled from 1 up to n.',
  ],
  insight: 'Dropping the last bit gives a smaller number whose answer you already have.',
  brute: 'Count the bits of every number separately: O(n log n).',
  optimal: 'DP with a shift: O(n) time and space.',
  walk: ['bits = [0] * (n + 1).', 'For i from 1 to n: bits[i] = bits[i >> 1] + (i & 1).', 'Return bits.'],
  edge: ['n = 0 (list [0]).', 'Powers of two.', 'n = 1.'],
  works: ['i >> 1 < i is processed before i, and the binary form of i is that of i >> 1 followed by the bit i & 1.'],
  time: ['O(n)', 'One constant-time step per number.'],
  space: ['O(n)', 'The result list.'],
  solution,
  cases,
  sig: 'def count_bits(n):\n    # return [number of 1 bits of i for i in 0 … n]\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
