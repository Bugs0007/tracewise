import { chipsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './reverse-integer.py?raw';
import cases from './reverse-integer.cases.json';

const LIMIT = 2 ** 31;

const viz = vizOf<{ x: number }>({
  id: 'reverse-integer',
  title: 'Reverse Integer',
  solution,
  inputs: [{ key: 'x', label: 'an integer (up to 10 digits)', kind: 'number', default: -4210 }],
  presets: [
    { label: '−4210', input: { x: -4210 } },
    { label: 'Overflow', input: { x: 1999999999 } },
    { label: 'Trailing zeros', input: { x: 1200 } },
    { label: 'Zero', input: { x: 0 } },
  ],
  validate: ({ x }) => (Number.isInteger(x) && Math.abs(x) <= 9999999999 ? null : 'Use a whole number with at most 10 digits'),
  run({ x: x0 }) {
    const r = new TraceRecorder(solution);
    const sign = x0 < 0 ? -1 : 1;
    let x = Math.abs(x0);
    let result = 0;
    const taken: number[] = [];
    let askedPush = false;
    let askedPop = false;
    let askedRange = false;
    const view = () => [hashMapView({ 'x (digits left)': x, result }), chipsView(taken, { title: 'digits taken from the end, in order' })];
    r.step('sign', `Remember the sign (${sign < 0 ? '−' : '+'}) and work with the absolute value ${x}.`, view(), {});
    r.step('init', 'result starts at 0. Each loop: take the last digit of x (x % 10), append it to result (result × 10 + digit), and remove it from x (x // 10).', view(), {});
    while (x) {
      r.op();
      const d = x % 10;
      if (!askedPush) {
        askedPush = true;
        r.predictChoice('push', `The last digit of ${x} is ${d} and result is ${result}. What is result × 10 + ${d}?`, String(result * 10 + d), [String(result + d), String(result * 10), String(result * 10 + d + 1)], x, 'Multiplying by 10 shifts the digits left one place, and the new digit fills the ones place.');
      }
      result = result * 10 + d;
      taken.push(d);
      r.step('push', `Take the last digit ${d}: result = ${result}.`, view(), { d, result });
      x = Math.floor(x / 10);
      if (!askedPop) {
        askedPop = true;
        r.step('pop', `Remove it from x: x = ${x}.`, view(), {});
        r.predictChoice('pop', `x was ${x * 10 + d}. After x //= 10 (integer division), what is it?`, String(x), [String(x + 1), String(x * 10 + d), String(Math.max(0, x - 1))], x, 'Integer division drops the last digit.');
      } else {
        r.step('pop', `x = ${x}.`, view(), {});
      }
    }
    const signed = result * sign;
    r.step('apply', `Apply the sign: ${signed}.`, view(), { signed });
    const ok = signed >= -LIMIT && signed <= LIMIT - 1;
    if (!askedRange) {
      askedRange = true;
      r.predict('range', `The reversed number is ${signed}. The allowed range is −2³¹ … 2³¹ − 1 (about ±2.1 billion). What is returned?`, ok ? ['The reversed number', '0'] : ['0', 'The reversed number'], 0, ok ? 'It fits in 32 bits, so it is returned.' : 'It does not fit in a 32-bit signed integer, so the answer is 0.');
    }
    const res = ok ? signed : 0;
    r.step('done', ok ? `Reversed: ${res}.` : `${signed} is outside the 32-bit range: return 0.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ x }) {
    const v = Number(String(Math.abs(x)).split('').reverse().join('')) * (x < 0 ? -1 : 1);
    return v >= -LIMIT && v <= LIMIT - 1 ? v : 0;
  },
});

export default problem({
  summary: 'Reverse the digits of an integer (keeping its sign). If the reversed value does not fit in a signed 32-bit integer (−2³¹ … 2³¹ − 1), return 0.',
  example: ['x = −205', '−502', 'The digits 2, 0, 5 reversed are 5, 0, 2 and the sign stays.'],
  pattern: ['math', ['math', 'bit-ops', 'stack', 'simulation'], 'Peel off the last digit with x % 10 and x // 10, and build the reversed number with result × 10 + digit. Check the range at the end.', {
    'bit-ops': 'Bits are not involved; the arithmetic is decimal.',
    stack: 'A stack of digits would work, but modulo and division are enough.',
    simulation: 'You are simulating reversing digits by hand; the math pattern is digit extraction.',
  }],
  hints: [
    'How do you get the last digit of a number? How do you remove it?',
    'How do you add a digit to the end of another number?',
    'Loop: result = result · 10 + x % 10; x //= 10. Handle the sign separately and return 0 if the result leaves the 32-bit range.',
  ],
  insight: 'Pop a digit with % 10 and // 10, push it with · 10 + digit.',
  brute: 'Convert to a string and reverse it: also O(digits).',
  optimal: 'Digit loop: O(log |x|) time, O(1) space.',
  walk: ['sign = −1 if x < 0 else 1; x = abs(x).', 'result = 0.', 'While x: result = result · 10 + x % 10; x //= 10.', 'result *= sign; return result if it is in the 32-bit range else 0.'],
  edge: ['Trailing zeros (they vanish).', 'Overflow of the reversed value.', 'Zero.', 'The most negative 32-bit number.'],
  works: ['After each loop, result holds the reversal of the digits removed so far and x holds the rest, so at the end result is the full reversal.'],
  time: ['O(log |x|)', 'One loop per digit.'],
  space: ['O(1)', 'Two numbers.'],
  solution,
  cases,
  sig: 'def reverse(x):\n    # reverse the digits of x; return 0 if the result does not fit in a signed 32-bit integer\n    pass\n',
  viz,
  fromArgs: ([x]) => ({ x }),
});
