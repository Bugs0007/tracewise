import type { Tone } from '@/engine/types';
import { arrayView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './multiply-strings.py?raw';
import cases from './multiply-strings.cases.json';

const viz = vizOf<{ a: string; b: string }>({
  id: 'multiply-strings',
  title: 'Multiply Strings',
  solution,
  inputs: [
    { key: 'a', label: 'first number (digits)', kind: 'string', default: '47', maxItems: 5 },
    { key: 'b', label: 'second number (digits)', kind: 'string', default: '86', maxItems: 5 },
  ],
  presets: [
    { label: '47 × 86', input: { a: '47', b: '86' } },
    { label: '99 × 99', input: { a: '99', b: '99' } },
    { label: 'Different lengths', input: { a: '1234', b: '5' } },
    { label: 'Zero', input: { a: '0', b: '999' } },
  ],
  validate: ({ a, b }) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? null : 'Use digits only'),
  run({ a, b }) {
    const r = new TraceRecorder(solution);
    if (a === '0' || b === '0') {
      r.step('zero', 'One of the numbers is 0, so the product is 0.', [stringView(a, { title: 'num1' }), stringView(b, { title: 'num2' })], {});
      r.step('zeroRet', 'Return "0".', [stringView(a, { title: 'num1' }), stringView(b, { title: 'num2' })], { result: '0' });
      return { frames: r.frames, result: '0' };
    }
    const digits = Array(a.length + b.length).fill(0) as number[];
    let hot: number[] = [];
    let askedPos = false;
    let askedCarry = false;
    const view = (i = -1, j = -1) => [
      stringView(a, { title: 'num1', pointers: i >= 0 ? { i } : {} }),
      stringView(b, { title: 'num2', pointers: j >= 0 ? { j } : {} }),
      arrayView(digits, { title: 'product digits (index 0 = most significant)', tones: Object.fromEntries(hot.map((k) => [k, 'active' as Tone])) }),
    ];
    r.step('init', `The product of an ${a.length}-digit and a ${b.length}-digit number has at most ${a.length + b.length} digits. Digit i of num1 times digit j of num2 lands in position i + j + 1 (with the carry going to i + j).`, view(), {});
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        r.op();
        hot = [i + j + 1, i + j];
        const total = Number(a[i]) * Number(b[j]) + digits[i + j + 1];
        if (!askedPos) {
          askedPos = true;
          r.step('mulAdd', `${a[i]} × ${b[j]} + (digit already at position ${i + j + 1}: ${digits[i + j + 1]}) = ${total}.`, view(i, j), {});
          r.predictChoice('mulAdd', `${a[i]} × ${b[j]} + ${digits[i + j + 1]} = ${total}. What stays at position ${i + j + 1}?`, String(total % 10), [String(total), String(Math.floor(total / 10)), String((total % 10) + 1)], i + j, 'Only the ones digit stays in this position; the tens digit is a carry for the next position to the left.');
        } else {
          r.step('mulAdd', `${a[i]} × ${b[j]} + ${digits[i + j + 1]} = ${total}.`, view(i, j), {});
        }
        digits[i + j + 1] = total % 10;
        digits[i + j] += Math.floor(total / 10);
        if (!askedCarry && total >= 10) {
          askedCarry = true;
          r.step('carry', `Write ${total % 10} at position ${i + j + 1} and add the carry ${Math.floor(total / 10)} to position ${i + j}.`, view(i, j), {});
          r.predict('carry', 'The carry is added to position i + j, not written over it. Why?', ['That position may already hold digits from other partial products', 'It is empty', 'Because carries are negative'], 0, 'Several partial products land on the same position, so carries accumulate by addition.');
        } else {
          r.step('carry', `Position ${i + j + 1} = ${digits[i + j + 1]}, carry ${Math.floor(total / 10)} added to position ${i + j} (now ${digits[i + j]}).`, view(i, j), {});
        }
      }
    }
    hot = [];
    const text = digits.join('').replace(/^0+/, '');
    r.step('done', `Join the digits and strip leading zeros: ${text}.`, view(), { result: text });
    return { frames: r.frames, result: text };
  },
  reference({ a, b }) {
    return (BigInt(a) * BigInt(b)).toString();
  },
});

export default problem({
  summary: 'Two non-negative integers are given as digit strings. Return their product as a digit string, without converting the strings to integers (the numbers may be too large for any built-in type).',
  example: ['"25" × "4"', '"100"', '5×4 = 20 (write 0, carry 2), 2×4 + 2 = 10 (write 0, carry 1), and the final carry gives the leading 1.'],
  pattern: ['math', ['math', 'simulation', 'dp-1d', 'divide-conquer'], 'Do long multiplication on arrays of digits. Digit i of the first number times digit j of the second belongs at position i + j + 1, with its carry at position i + j.', {
    simulation: 'You simulate pencil-and-paper multiplication, which is the math pattern for big numbers.',
    'dp-1d': 'The result array accumulates partial products, but it is not a recurrence.',
    'divide-conquer': 'Karatsuba is divide and conquer, but it is not needed for these sizes.',
  }],
  hints: [
    'How do you multiply 123 × 45 by hand? Where does each partial product end up?',
    'If you use an array of length len(a) + len(b), which index does the product of a[i] and b[j] belong to?',
    'total = a[i]·b[j] + digits[i+j+1]; digits[i+j+1] = total % 10; digits[i+j] += total // 10. Strip leading zeros at the end.',
  ],
  insight: 'Each pair of digits contributes to exactly two positions, i + j + 1 and i + j; accumulate and carry as you go.',
  brute: 'Add shifted copies of the first number once for each digit of the second: O(n · m) as well, with string arithmetic.',
  optimal: 'Digit array: O(n · m) time, O(n + m) space.',
  walk: ['If either number is "0" return "0".', 'digits = [0] * (len(a) + len(b)).', 'For i, j from the right: total = a[i]·b[j] + digits[i+j+1].', 'digits[i+j+1] = total % 10 and digits[i+j] += total // 10. Join and strip leading zeros.'],
  edge: ['A zero factor.', 'Different lengths.', 'Carries that ripple through several positions.', 'Leading zeros in the result array.'],
  works: ['Position p of the product collects every a[i]·b[j] with i + j + 1 = p plus carries from the right; storing one digit and carrying the rest keeps every cell in 0…9 once all pairs are processed.'],
  time: ['O(n · m)', 'One multiplication per pair of digits.'],
  space: ['O(n + m)', 'The digit array.'],
  solution,
  cases,
  sig: 'def multiply(num1, num2):\n    # num1 and num2 are digit strings; return their product as a digit string\n    pass\n',
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
