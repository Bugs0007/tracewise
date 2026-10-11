import { bitsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './reverse-bits.py?raw';
import cases from './reverse-bits.cases.json';

const viz = vizOf<{ n: number }>({
  id: 'reverse-bits',
  title: 'Reverse Bits',
  solution,
  inputs: [{ key: 'n', label: 'a 32-bit unsigned number (0 to 4294967295)', kind: 'number', default: 6 }],
  presets: [
    { label: '6', input: { n: 6 } },
    { label: 'High bit', input: { n: 2147483648 } },
    { label: 'Alternating', input: { n: 2863311530 } },
    { label: 'Zero', input: { n: 0 } },
  ],
  validate: ({ n }) => (Number.isInteger(n) && n >= 0 && n <= 4294967295 ? null : 'Use a whole number from 0 to 4294967295'),
  run({ n: start }) {
    const r = new TraceRecorder(solution);
    let n = start;
    let result = 0;
    let round = 0;
    let askedShift = false;
    let askedLow = false;
    const view = () => [bitsView(n, 32, { title: `n (we keep reading its lowest bit, then shift right) = ${n}`, wrap: true }), bitsView(result, 32, { title: `result (we push each bit in at the right) = ${result}`, wrap: true }), hashMapView({ round })];
    r.step('init', `Reverse the 32 bits of ${start}. Each round: take the lowest bit of n and append it to the right end of result, then drop it from n.`, view(), {});
    for (let i = 0; i < 32; i++) {
      r.op();
      const bit = n % 2;
      round = i + 1;
      if (!askedLow && i === 0) {
        askedLow = true;
        r.step('loop', `Round ${i + 1}: the lowest bit of n is ${bit}.`, view(), {});
        r.predictChoice('shift', `result = (result << 1) | (n & 1) with result = ${result} and n & 1 = ${bit}. What is the new result?`, String(result * 2 + bit), [String(result * 2 + (1 - bit)), String(result + bit), String(result * 2 + bit + 2)], i, 'Shifting left makes room at the right end; OR puts the bit there.');
      }
      result = result * 2 + bit;
      n = Math.floor(n / 2);
      if (!askedShift && i === 3) {
        askedShift = true;
        r.step('shift', `After ${i + 1} rounds the lowest ${i + 1} bits of the input are at the top of result, in reverse order.`, view(), {});
        r.predict('next', 'After 32 rounds, where did the original lowest bit end up?', ['At the highest bit of result', 'At the lowest bit of result', 'It was dropped'], 0, 'It was the first bit pushed in, and every later shift moved it one place to the left, so after 32 rounds it is the top bit.');
      }
      r.step('next', `Shift: result = ${result}, n = ${n}.`, view(), { result });
    }
    r.step('done', `Reversed: ${result}.`, view(), { result });
    return { frames: r.frames, result };
  },
  reference({ n }) {
    return parseInt(n.toString(2).padStart(32, '0').split('').reverse().join(''), 2);
  },
});

export default problem({
  summary: 'Reverse the order of the 32 bits of an unsigned 32-bit integer (the lowest bit becomes the highest and vice versa) and return the resulting number.',
  example: ['n = 1 (31 zeros then a 1)', '2147483648', 'The single 1 bit moves from the lowest position to the highest, 2³¹.'],
  pattern: ['bit-ops', ['bit-ops', 'math', 'bit-xor', 'divide-conquer'], 'Read the bits of n from the lowest upward and push each into result from the right: result = (result << 1) | (n & 1). The first bit read ends up highest after 32 shifts.', {
    math: 'You could build a binary string and reverse it, but shifts and masks are the intended tool.',
    'bit-xor': 'XOR is not involved.',
    'divide-conquer': 'Swapping halves recursively (16, 8, 4, 2, 1 bits) is a clever alternative, but the loop is simpler.',
  }],
  hints: [
    'How do you read the lowest bit of a number? How do you drop it?',
    'How do you append a bit to the right end of another number?',
    'Repeat 32 times: result = (result << 1) | (n & 1); n >>= 1.',
  ],
  insight: 'Pop a bit from one end of n and push it onto the other end of result; do it 32 times.',
  brute: 'Convert to a 32-character string, reverse, convert back: O(32).',
  optimal: 'Bit loop: O(32) = O(1) time and space.',
  walk: ['result = 0.', 'Repeat 32 times: result = (result << 1) | (n & 1).', 'Then n >>= 1.', 'Return result.'],
  edge: ['n = 0.', 'The highest bit set.', 'All bits set.', 'Leading zeros matter: always do 32 rounds, not "until n is 0".'],
  works: ['Round k appends bit k of n at position 0 and then shifts it up 31 − k more times, so it ends at position 31 − k, which is the reversed place.'],
  time: ['O(1)', 'Exactly 32 rounds.'],
  space: ['O(1)', 'Two integers.'],
  solution,
  cases,
  sig: 'def reverse_bits(n):\n    # reverse the 32 bits of the unsigned integer n\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
