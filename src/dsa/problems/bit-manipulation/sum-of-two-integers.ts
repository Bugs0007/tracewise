import { bitsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './sum-of-two-integers.py?raw';
import cases from './sum-of-two-integers.cases.json';

const viz = vizOf<{ a: number; b: number }>({
  id: 'sum-of-two-integers',
  title: 'Sum of Two Integers',
  solution,
  inputs: [
    { key: 'a', label: 'a (0 to 127)', kind: 'number', default: 27 },
    { key: 'b', label: 'b (0 to 127)', kind: 'number', default: 14 },
  ],
  presets: [
    { label: '27 + 14', input: { a: 27, b: 14 } },
    { label: 'Carry chain', input: { a: 127, b: 1 } },
    { label: 'No carry', input: { a: 5, b: 10 } },
    { label: 'With zero', input: { a: 0, b: 9 } },
  ],
  validate: ({ a, b }) => (![a, b].every((v) => Number.isInteger(v) && v >= 0 && v <= 127) ? 'Use whole numbers from 0 to 127 (the code also handles negatives; the picture shows 8 bits)' : null),
  run({ a: a0, b: b0 }) {
    const r = new TraceRecorder(solution);
    let a = a0;
    let b = b0;
    let askedXor = false;
    let askedCarry = false;
    let rounds = 0;
    const view = () => [bitsView(a, 9, { title: `a = ${a}` }), bitsView(b, 9, { title: `b (the carries still to add) = ${b}` }), hashMapView({ rounds })];
    r.step('mask', 'Add without +. XOR adds each bit position ignoring carries; AND shows where carries happen, and shifting them left moves each carry to the next position. Repeat until no carry is left. (Python integers are unbounded, so the real code also masks to 32 bits so negative numbers work.)', view(), {});
    while (b !== 0) {
      r.op();
      const sum = a ^ b;
      const carry = (a & b) << 1;
      r.step('loop', `a = ${a}, b = ${b}. a ^ b = ${sum} (the sum ignoring carries). (a & b) << 1 = ${carry} (the carries, moved one place left).`, [bitsView(a, 9, { title: `a = ${a}` }), bitsView(b, 9, { title: `b = ${b}` }), bitsView(sum, 9, { title: `a ^ b = ${sum}` }), bitsView(carry, 9, { title: `(a & b) << 1 = ${carry}` })], {});
      if (!askedXor) {
        askedXor = true;
        r.predictChoice('xor', `What is ${a} ^ ${b}?`, String(sum), [String(a + b), String(a | b), String(a & b)], a, 'XOR is 1 exactly where the two bits differ: addition without carries.');
      }
      if (!askedCarry && carry !== 0 && rounds >= 1) {
        askedCarry = true;
        r.predictChoice('carry', `The carries are (a & b) << 1. What is that for a = ${a}, b = ${b}?`, String(carry), [String(a & b), String(carry * 2), String(carry + 1)], b, 'A carry is generated where both bits are 1; it belongs one place to the left.');
      }
      a = sum;
      b = carry;
      rounds++;
      r.step('add', `a = ${a}, b = ${b}.${b === 0 ? ' No carries left.' : ' The carries must be added in the next round.'}`, view(), { a, b });
    }
    r.step('done', `${a0} + ${b0} = ${a}.`, view(), { result: a });
    return { frames: r.frames, result: a };
  },
  reference({ a, b }) {
    return a + b;
  },
});

export default problem({
  summary: 'Add two integers without using the + or − operators. Use bit operations instead.',
  example: ['a = 5 (101), b = 3 (011)', '8', '5 ^ 3 = 6 (110) with carries (5 & 3) << 1 = 2; then 6 ^ 2 = 4 with carries (6 & 2) << 1 = 4; then 4 ^ 4 = 0 with carries 8; then 0 ^ 8 = 8.'],
  pattern: ['bit-ops', ['bit-ops', 'math', 'bit-xor', 'simulation'], 'A full adder in hardware does exactly this: XOR gives the sum bits, AND shifted left gives the carry bits. Repeat until there is no carry.', {
    math: 'Ordinary arithmetic is forbidden, so the work is done with bit operations.',
    'bit-xor': 'XOR is half of the adder, but the loop with carries is the whole idea.',
    simulation: 'It simulates a hardware adder, and the pattern is bit manipulation.',
  }],
  hints: [
    'What does a ^ b compute when no position has two 1 bits?',
    'Where do carries come from, and where do they go?',
    'Loop: a, b = a ^ b, (a & b) << 1 until b is 0. In Python mask to 32 bits so negative numbers terminate.',
  ],
  insight: 'XOR adds without carry and AND-then-shift produces the carries; keep adding the carries until none remain.',
  brute: 'Use a + b (not allowed), or increment one number b times: O(b).',
  optimal: 'Carry loop: O(number of bits).',
  walk: ['mask = 0xFFFFFFFF.', 'While b != 0: a, b = (a ^ b) & mask, ((a & b) << 1) & mask.', 'If a fits in a signed 32-bit integer return a, otherwise convert it back to a negative number with ~(a ^ mask).'],
  edge: ['Negative numbers (two\'s complement, hence the mask).', 'Zero operands.', 'Long carry chains like 127 + 1.'],
  works: ['a + b = (a ^ b) + ((a & b) << 1) because XOR counts single 1s and AND counts the pairs that each contribute twice at the next position; repeating shrinks the carries until they are gone.'],
  time: ['O(32)', 'At most one round per bit.'],
  space: ['O(1)', 'Two integers.'],
  solution,
  cases,
  sig: 'def get_sum(a, b):\n    # add two integers without using + or −\n    pass\n',
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
