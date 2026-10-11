import { bitsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './number-of-1-bits.py?raw';
import cases from './number-of-1-bits.cases.json';

const viz = vizOf<{ n: number }>({
  id: 'number-of-1-bits',
  title: 'Number of 1 Bits',
  solution,
  inputs: [{ key: 'n', label: 'a whole number from 0 to 255', kind: 'number', default: 180 }],
  presets: [
    { label: '180', input: { n: 180 } },
    { label: 'Power of two', input: { n: 64 } },
    { label: 'All ones', input: { n: 255 } },
    { label: 'Zero', input: { n: 0 } },
  ],
  validate: ({ n }) => (Number.isInteger(n) && n >= 0 && n <= 255 ? null : 'Use a whole number from 0 to 255'),
  run({ n: start }) {
    const r = new TraceRecorder(solution);
    let n = start;
    let count = 0;
    let askedClear = false;
    let askedCount = false;
    const view = () => [bitsView(n, 8, { title: `n = ${n}` }), hashMapView({ count })];
    r.step('init', `Count the 1 bits in ${start} (binary ${start.toString(2)}). Each loop turns off the lowest 1 bit and counts it.`, view(), {});
    while (n) {
      r.op();
      const next = n & (n - 1);
      r.step('loop', `n = ${n}. n − 1 = ${n - 1}: subtracting 1 flips the lowest 1 bit to 0 and all the 0s below it to 1.`, [bitsView(n, 8, { title: `n = ${n}` }), bitsView(n - 1, 8, { title: `n − 1 = ${n - 1}` }), hashMapView({ count })], {});
      if (!askedClear) {
        askedClear = true;
        r.predictChoice('clear', `What is ${n} & ${n - 1}? (AND keeps only bits that are 1 in both.)`, String(next), [String(n - 1), String(n), String(n ^ (n - 1))], n, 'n and n − 1 agree everywhere except at the lowest 1 bit and below, so the AND clears exactly the lowest 1 bit.');
      }
      n = next;
      count++;
      r.step('clear', `n &= n − 1 → ${n}. One more 1 bit counted: count = ${count}.`, view(), { count });
      if (!askedCount && n === 0) {
        askedCount = true;
        r.predictChoice('count', `n reached 0 after ${count} loop${count === 1 ? '' : 's'}. How many 1 bits did ${start} have?`, String(count), [String(count + 1), String(Math.max(0, count - 1)), String(start.toString(2).length)], count, 'The loop runs once per 1 bit.');
      }
    }
    r.step('done', `${start} has ${count} one bit${count === 1 ? '' : 's'}.`, view(), { result: count });
    return { frames: r.frames, result: count };
  },
  reference({ n }) {
    return n.toString(2).split('1').length - 1;
  },
});

export default problem({
  summary: 'Count how many bits equal 1 in the binary representation of a non-negative integer (its "Hamming weight" or population count).',
  example: ['n = 13 (binary 1101)', '3', 'Three of the four bits are 1.'],
  pattern: ['bit-ops', ['bit-ops', 'bit-xor', 'math', 'dp-1d'], 'n & (n − 1) clears the lowest 1 bit. Repeating it until n is 0 takes exactly one step per 1 bit.', {
    'bit-xor': 'XOR is for cancelling equal values, not counting.',
    math: 'Repeated division by two also works but the bit trick is faster and cleaner.',
    'dp-1d': 'The related problem Counting Bits uses a table; here one number is enough.',
  }],
  hints: [
    'You can test the lowest bit with n & 1 and shift. Is there a way to jump straight to the next 1 bit?',
    'What does n − 1 do to the binary form of n?',
    'n & (n − 1) removes the lowest 1 bit. Count how many times you can do that before n becomes 0.',
  ],
  insight: 'n & (n − 1) deletes the lowest set bit, so the loop runs once per set bit.',
  brute: 'Check each of the 32 bits: O(32).',
  optimal: 'Clear the lowest set bit repeatedly: O(number of 1 bits).',
  walk: ['count = 0.', 'While n: n &= n − 1 and count += 1.', 'Return count.'],
  edge: ['n = 0.', 'Powers of two (one loop).', 'All bits set.', 'The highest bit of a 32-bit number.'],
  works: ['Subtracting 1 flips the lowest 1 bit and everything below it; ANDing with n keeps the higher bits and clears the rest, removing exactly that 1 bit.'],
  time: ['O(k)', 'k = number of 1 bits (at most 32).'],
  space: ['O(1)', 'Two variables.'],
  solution,
  cases,
  sig: 'def hamming_weight(n):\n    # number of 1 bits in the binary representation of n (n ≥ 0)\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
