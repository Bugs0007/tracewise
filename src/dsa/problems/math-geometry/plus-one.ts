import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './plus-one.py?raw';
import cases from './plus-one.cases.json';

const viz = vizOf<{ digits: number[] }>({
  id: 'plus-one',
  title: 'Plus One',
  solution,
  inputs: [{ key: 'digits', label: 'digits of a number, most significant first', kind: 'numbers', default: [1, 9, 9], maxItems: 9 }],
  presets: [
    { label: 'Carry through nines', input: { digits: [1, 9, 9] } },
    { label: 'All nines', input: { digits: [9, 9, 9] } },
    { label: 'No carry', input: { digits: [1, 2, 3] } },
    { label: 'Single nine', input: { digits: [9] } },
  ],
  validate: ({ digits }) => (!digits.length || digits.some((d) => d === null || !Number.isInteger(d) || d < 0 || d > 9) ? 'Digits must be whole numbers from 0 to 9' : null),
  run({ digits: input }) {
    const r = new TraceRecorder(solution);
    const d = [...input];
    const tones: Record<number, Tone> = {};
    let askedNine = false;
    let askedSmall = false;
    let askedGrow = false;
    const view = (i = -1) => [arrayView(d, { title: 'digits (index 0 is the most significant)', pointers: i >= 0 ? { i } : {}, tones: { ...tones, ...(i >= 0 ? { [i]: 'active' as Tone } : {}) } }), hashMapView({ number: d.join('') })];
    r.step('loop', 'Start from the last digit (the ones place) and walk left. Adding 1 only carries while the digit is 9.', view(), {});
    for (let i = d.length - 1; i >= 0; i--) {
      r.op();
      r.step('small', `Digit ${i} is ${d[i]}.`, view(i), { i });
      if (d[i] < 9) {
        if (!askedSmall) {
          askedSmall = true;
          r.predictChoice('small', `${d[i]} is less than 9. What does it become, and can the loop stop?`, `${d[i] + 1}, and yes: stop`, [`${d[i] + 1}, but keep carrying`, `0, and carry`, `${d[i]}, unchanged`], i, 'No carry is generated, so the digits to the left stay as they are.');
        }
        d[i] += 1;
        tones[i] = 'found';
        r.step('early', `Add 1: ${d[i] - 1} → ${d[i]}. No carry: return now.`, view(i), { result: JSON.stringify(d) });
        return { frames: r.frames, result: d };
      }
      if (!askedNine) {
        askedNine = true;
        r.predict('carry', `The digit is 9, so 9 + 1 = 10. What do we write here and what happens to the carry?`, ['Write 0 and carry 1 to the next digit on the left', 'Write 10', 'Write 9'], 0, 'A digit cannot hold 10: it becomes 0 and the carry moves left.');
      }
      d[i] = 0;
      tones[i] = 'compare';
      r.step('carry', `9 + 1 = 10: write 0 and carry 1 to the left.`, view(i), {});
    }
    if (!askedGrow) {
      askedGrow = true;
      r.predict('grow', 'Every digit was 9 and is now 0. What is missing?', ['A leading 1: the number has one more digit', 'Nothing', 'A trailing 0'], 0, 'The carry out of the leftmost digit becomes a new leading digit.');
    }
    const res = [1, ...d];
    r.step('grow', `All digits were 9, so the carry creates a new leading 1: ${res.join('')}.`, [arrayView(res, { title: 'result', tones: { 0: 'found' } })], { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ digits }) {
    const d = [...digits];
    for (let i = d.length - 1; i >= 0; i--) {
      if (d[i] < 9) {
        d[i]++;
        return d;
      }
      d[i] = 0;
    }
    return [1, ...d];
  },
});

export default problem({
  summary: 'A non-negative integer is given as a list of digits, most significant first (123 is [1, 2, 3]). Add one to the number and return the digits of the result.',
  example: ['[4, 9]', '[5, 0]', '49 + 1 = 50. With [9, 9] the answer grows a digit: [1, 0, 0].'],
  pattern: ['math', ['math', 'simulation', 'two-pointers', 'stack'], 'Add by hand, from the least significant digit: a digit below 9 absorbs the +1 and you are done; a 9 becomes 0 and passes the carry to the left.', {
    simulation: 'You are simulating pencil-and-paper addition, which is the math pattern for digit arrays.',
    'two-pointers': 'Only one index moves.',
    stack: 'The digits are processed from the end, but no stack is needed.',
  }],
  hints: [
    'How do you add 1 to 129 by hand? To 199? To 999?',
    'When can you stop early?',
    'Loop from the last index: if the digit is < 9 add 1 and return; else set it to 0. If the loop finishes, return [1] + digits.',
  ],
  insight: 'Only a run of trailing nines changes; the first non-nine from the right absorbs the carry.',
  brute: 'Convert to an integer, add 1, convert back: fine in Python but not for fixed-width integers.',
  optimal: 'Walk from the right: O(n) worst case, O(1) extra space.',
  walk: ['For i from the last index down to 0: if digits[i] < 9, increment it and return the list.', 'Otherwise set digits[i] to 0 (carry).', 'If all digits were 9, return [1] + digits.'],
  edge: ['All nines (length grows).', 'A single digit.', 'A zero [0] → [1].', 'Trailing nines in the middle of other digits.'],
  works: ['Adding 1 changes the number by exactly the carry chain: trailing 9s become 0 and the next digit increases by one, or a new leading digit appears.'],
  time: ['O(n)', 'At worst every digit.'],
  space: ['O(1)', 'In place (O(n) when a digit is added).'],
  solution,
  cases,
  sig: 'def plus_one(digits):\n    # digits is a list of 0-9, most significant first; return the digits of the number plus one\n    pass\n',
  viz,
  fromArgs: ([digits]) => ({ digits }),
});
