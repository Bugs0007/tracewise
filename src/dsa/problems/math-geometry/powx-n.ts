import { bitsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './powx-n.py?raw';
import cases from './powx-n.cases.json';

const viz = vizOf<{ x: number; n: number }>({
  id: 'powx-n',
  title: 'Pow(x, n)',
  solution,
  inputs: [
    { key: 'x', label: 'x (not 0)', kind: 'number', default: 3 },
    { key: 'n', label: 'integer exponent n (−30 to 30)', kind: 'number', default: 13 },
  ],
  presets: [
    { label: '3^13', input: { x: 3, n: 13 } },
    { label: '2^−3', input: { x: 2, n: -3 } },
    { label: '1.5^10', input: { x: 1.5, n: 10 } },
    { label: 'n = 0', input: { x: 5, n: 0 } },
  ],
  validate: ({ x, n }) => (!Number.isFinite(x) || x === 0 ? 'x must be a non-zero number' : !Number.isInteger(n) || Math.abs(n) > 30 ? 'n must be a whole number between −30 and 30' : null),
  run({ x: x0, n: n0 }) {
    const r = new TraceRecorder(solution);
    let x = x0;
    let n = n0;
    let result = 1;
    let askedBit = false;
    let askedSquare = false;
    const fmt = (v: number) => String(Number(v.toPrecision(8)));
    const view = () => [bitsView(Math.max(n, 0), 6, { title: 'remaining exponent in binary (the rightmost bit decides this round)' }), hashMapView({ x: fmt(x), n, result: fmt(result) })];
    if (n < 0) {
      r.step('neg', `The exponent ${n} is negative, so ${x0}^${n} = (1/${x0})^${-n}.`, view(), {});
      r.predict('neg', `${x0}^${n} equals which of these?`, [`(1/${x0})^${-n}`, `${x0}^${-n}`, `−${x0}^${-n}`], 0, 'A negative exponent means the reciprocal.');
      x = 1 / x;
      n = -n;
      r.step('flip', `Now x = ${fmt(x)} and n = ${n}.`, view(), {});
    }
    r.step('init', 'result starts at 1. Each round we look at the lowest bit of n: if it is 1, multiply the current power of x into the result. Then square x and drop that bit.', view(), {});
    while (n) {
      r.op();
      const odd = (n & 1) === 1;
      r.step('loop', `n = ${n} (binary ${n.toString(2)}): the lowest bit is ${odd ? 1 : 0}.`, view(), { n });
      if (!askedBit) {
        askedBit = true;
        r.predict('odd', odd ? 'The lowest bit is 1. What do we do with the result?' : 'The lowest bit is 0. What do we do with the result?', odd ? ['Multiply it by the current x', 'Leave it'] : ['Leave it', 'Multiply it by the current x'], 0, odd ? 'This bit says the current power x^(2^k) is part of the answer.' : 'A zero bit means this power is not needed.');
      }
      if (odd) {
        result *= x;
        r.step('mul', `Bit is 1: result = result × x = ${fmt(result)}.`, view(), {});
      }
      const old = x;
      x *= x;
      if (!askedSquare) {
        askedSquare = true;
        r.predictChoice('square', `x = ${fmt(old)}. After squaring, what is x?`, fmt(old * old), [fmt(old * 2), fmt(old + 1), fmt(old ** 3)], n, 'Squaring doubles the exponent: x → x², x⁴, x⁸ … which are the powers the bits of n select.');
      }
      n = Math.floor(n / 2);
      r.step('square', `Square x → ${fmt(x)} and shift n right → ${n}.`, view(), {});
    }
    r.step('done', `${x0}^${n0} = ${fmt(result)}.`, view(), { result });
    return { frames: r.frames, result };
  },
  reference({ x, n }) {
    return x ** n;
  },
});

export default problem({
  summary: 'Compute x raised to the integer power n (n may be negative or zero) without calling a power function. Aim for far fewer than n multiplications.',
  example: ['x = 2, n = 10', '1024', '10 is 1010 in binary, so 2^10 = 2^8 · 2^2, which needs only about log₂ 10 squarings.'],
  pattern: ['math', ['math', 'divide-conquer', 'bit-ops', 'dp-1d'], 'Write n in binary. x^n is the product of the powers x^(2^k) for each bit k that is 1. Squaring x repeatedly gives those powers in order, so O(log n) multiplications are enough.', {
    'divide-conquer': 'x^n = (x^(n/2))² (times x if n is odd) is the recursive version of the same idea.',
    'bit-ops': 'The loop reads the bits of n, but the technique is exponentiation by squaring.',
    'dp-1d': 'You do not need to store a table; one running square is enough.',
  }],
  hints: [
    'Multiplying x by itself n times takes n steps. Can you reuse x² to get x⁴ in one multiplication?',
    'How is n written in binary? Which powers of x do you need?',
    'While n > 0: if n is odd, result *= x; then x *= x and n >>= 1. For negative n, use 1/x and −n first.',
  ],
  insight: 'Exponentiation by squaring: x^n multiplies together x^(2^k) for each 1-bit of n.',
  brute: 'Multiply n times: O(n).',
  optimal: 'Fast power: O(log n) time, O(1) space.',
  walk: ['If n < 0: x = 1 / x, n = −n.', 'result = 1.', 'While n: if n is odd, result *= x.', 'Then x *= x and n >>= 1. Return result.'],
  edge: ['n = 0 (result 1).', 'Negative exponents.', 'x negative with odd or even n.', 'x = 1 or −1 with huge n.'],
  works: ['Invariant: result × x^n equals the original x0^n0 at the start of each round. A round either moves x into result (odd) or squares x while halving n, preserving the invariant.'],
  time: ['O(log n)', 'One iteration per bit of n.'],
  space: ['O(1)', 'Three variables.'],
  solution,
  cases,
  sig: 'def my_pow(x, n):\n    # x raised to the integer power n (n may be negative)\n    pass\n',
  viz,
  fromArgs: ([x, n]) => ({ x, n }),
});
