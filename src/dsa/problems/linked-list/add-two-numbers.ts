import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { hashMapView } from '@/dsa/viz/prims';
import { problem, vizOf } from '../helpers';
import solution from './add-two-numbers.py?raw';
import harness from './add-two-numbers.harness.py?raw';
import cases from './add-two-numbers.cases.json';

const viz = vizOf<{ a: number[]; b: number[] }>({
  id: 'add-two-numbers',
  title: 'Add Two Numbers',
  solution,
  inputs: [
    { key: 'a', label: 'first number, digits least significant first', kind: 'numbers', default: [7, 4, 9], maxItems: 7 },
    { key: 'b', label: 'second number, digits least significant first', kind: 'numbers', default: [5, 8], maxItems: 7 },
  ],
  presets: [
    { label: 'With carries', input: { a: [7, 4, 9], b: [5, 8] } },
    { label: 'Final carry', input: { a: [9, 9], b: [1] } },
    { label: 'No carry', input: { a: [1, 2], b: [3, 4] } },
    { label: 'Zeros', input: { a: [0], b: [0] } },
  ],
  validate: ({ a, b }) => (a.length < 1 || b.length < 1 ? 'Each number needs at least one digit' : [...a, ...b].some((d) => !Number.isInteger(d) || d < 0 || d > 9) ? 'Digits must be whole numbers from 0 to 9' : null),
  run({ a, b }) {
    const r = new TraceRecorder(solution);
    let i: number | null = 0;
    let j: number | null = 0;
    const out: number[] = [];
    let carry = 0;
    const view = (hot: Tone | null = null, extra: Record<string, unknown> = {}) => {
      const ta: Record<number, Tone> = {};
      const tb: Record<number, Tone> = {};
      a.forEach((_, k) => {
        if (i === null || k < i) ta[k] = 'muted';
      });
      b.forEach((_, k) => {
        if (j === null || k < j) tb[k] = 'muted';
      });
      if (i !== null && hot) ta[i] = hot;
      if (j !== null && hot) tb[j] = hot;
      return [
        listFromIndices(a, chain(a.length), { title: 'l1 (ones digit first)', tones: ta, tags: tagsOf({ l1: i }) }),
        listFromIndices(b, chain(b.length), { title: 'l2', tones: tb, tags: tagsOf({ l2: j }) }),
        listFromIndices(['dummy', ...out], chain(out.length + 1), { title: 'sum list', tones: Object.fromEntries(out.map((_, k) => [k + 1, 'done'])) as Record<number, Tone>, tags: tagsOf({ tail: out.length }) }),
        hashMapView({ carry, ...Object.fromEntries(Object.entries(extra)) }, { title: 'this column' }),
      ];
    };
    r.step('dummy', 'Digits are stored least significant first, so adding left to right matches how you add by hand.', view(), {});
    r.step('tail', 'tail marks the end of the sum list.', view(), {});
    r.step('carry', 'carry holds the 1 (or 0) carried from the previous column.', view(), { carry });
    while (i !== null || j !== null || carry) {
      r.op();
      let total = carry;
      r.step('loop', `Next column: carry = ${carry}.`, view('active', { total }), { carry });
      if (carry > 0) r.predict('carryin', `${carry} was carried from the previous column. What happens to it in this column?`, ['It is added to the two digits of this column', 'It replaces the first digit', 'It is ignored until the end'], 0, 'The carry starts the total for this column, exactly like carrying a 1 when adding by hand.');
      if (i !== null) {
        total += a[i];
        r.step('add1', `Add l1's digit ${a[i]}: total = ${total}.`, view('active', { total }), { total });
        i = i + 1 < a.length ? i + 1 : null;
      }
      if (j !== null) {
        total += b[j];
        r.step('add2', `Add l2's digit ${b[j]}: total = ${total}.`, view('active', { total }), { total });
        j = j + 1 < b.length ? j + 1 : null;
      }
      r.predictChoice('digit', `total = ${total}. Which digit goes into this column of the answer, and what is carried?`, `digit ${total % 10}, carry ${Math.floor(total / 10)}`, [`digit ${total}, carry 0`, `digit ${Math.floor(total / 10)}, carry ${total % 10}`, `digit ${(total + 1) % 10}, carry ${Math.floor((total + 1) / 10)}`], total, 'total % 10 is the digit written down; total // 10 is carried to the next column.');
      out.push(total % 10);
      r.step('node', `Append a new node with digit ${total} % 10 = ${total % 10}.`, view('done', { total }), { digit: total % 10 });
      carry = Math.floor(total / 10);
      r.step('newCarry', `carry = ${total} // 10 = ${carry}.`, view(null, { total }), { carry });
    }
    r.step('done', `No digits left and no carry: the sum is ${[...out].reverse().join('')} (stored as ${out.join(' → ')}).`, view(), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ a, b }) {
    const num = (d: number[]) => d.reduce((s, x, k) => s + BigInt(x) * 10n ** BigInt(k), 0n);
    let n = num(a) + num(b);
    const out: number[] = [];
    do {
      out.push(Number(n % 10n));
      n /= 10n;
    } while (n > 0n);
    return out;
  },
});

export default problem({
  summary: 'Two non-negative whole numbers are stored as linked lists of digits, with the ones digit first. Add them and return the sum as a list in the same format.',
  example: ['l1 = 6 → 5 (that is 56), l2 = 7 → 8 → 1 (that is 187)', '3 → 4 → 2 (that is 243)', '56 + 187 = 243. The ones digit comes first in each list.'],
  pattern: ['linked-list', ['linked-list', 'math', 'stack', 'dp-1d'], 'Walk both lists together, add digit by digit with a carry, and append each result digit to a new list, exactly like column addition on paper.', {
    math: 'The arithmetic is just grade-school addition; the challenge is doing it while walking and building linked lists with a dummy head.',
    stack: 'A stack would be needed if the most significant digit came first. With the ones digit first you can add in order.',
    'dp-1d': 'There are no overlapping subproblems; it is a single pass with a carry.',
  }],
  hints: [
    'The lists start with the ones digit. What does that let you do as you walk them?',
    'Add the two current digits plus the carry. How do you split that total into the digit to write and the carry?',
    'Keep going while either list has digits or a carry remains. Use a dummy head and a tail pointer to build the result.',
  ],
  insight: 'Add column by column: digit = total % 10, carry = total // 10. Keep going while a list has digits or there is a carry.',
  brute: 'Convert both lists to integers, add, and convert back: simple in Python, but breaks the spirit (and big-number limits elsewhere).',
  optimal: 'Walk both lists once with a carry: O(max(m, n)) time.',
  walk: ['Create a dummy head, a tail pointer, and carry = 0.', 'While either list has a node or carry is non-zero: total = carry, plus each list’s digit if it still has one (advance that list).', 'Append a node with total % 10 and set carry = total // 10.', 'Return dummy.next.'],
  edge: ['Lists of different lengths.', 'A final carry that creates an extra digit (99 + 1 = 100).', 'Both numbers zero.', 'One list much longer than the other.'],
  works: ['Each column’s digit and carry match the schoolbook algorithm, and processing from the ones digit upward is exactly the order the lists are stored in.', 'Looping while a carry remains captures the extra leading digit.'],
  time: ['O(max(m, n))', 'One step per column.'],
  space: ['O(1)', 'Excluding the output list.'],
  solution,
  cases,
  sig: 'def add_two_numbers(l1, l2):\n    # digits are stored least significant first; return the sum in the same form\n    pass\n',
  harness,
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
