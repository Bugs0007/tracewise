import type { Tone } from '@/engine/types';
import { arrayView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './two-sum-ii-input-array-is-sorted.py?raw';
import cases from './two-sum-ii-input-array-is-sorted.cases.json';

const viz = vizOf<{ numbers: number[]; target: number }>({
  id: 'two-sum-ii',
  title: 'Two Sum II (sorted)',
  solution,
  inputs: [
    { key: 'numbers', label: 'numbers (sorted)', kind: 'numbers', default: [2, 7, 11, 15, 19, 24], maxItems: 14 },
    { key: 'target', label: 'target', kind: 'number', default: 30 },
  ],
  presets: [
    { label: 'Pair in the middle', input: { numbers: [2, 7, 11, 15, 19, 24], target: 30 } },
    { label: 'Pair at the ends', input: { numbers: [1, 4, 9, 20], target: 21 } },
    { label: 'Negatives', input: { numbers: [-9, -4, 0, 3, 11], target: -1 } },
    { label: 'No pair', input: { numbers: [1, 2, 4], target: 50 } },
  ],
  validate: ({ numbers }) => (numbers.some((v, i) => i && v < numbers[i - 1]) ? 'Numbers must be sorted from smallest to largest' : numbers.length < 2 ? 'Enter at least two numbers' : null),
  run({ numbers: n, target }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = n.length - 1;
    const view = (hot: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      n.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      return [arrayView(n, { title: `numbers (target = ${target})`, tones: { ...tones, ...hot }, pointers: { lo, hi }, window: lo <= hi ? { from: lo, to: hi, label: 'still possible' } : undefined })];
    };
    r.step('init', `Start with one pointer at each end of the sorted list: lo = ${lo}, hi = ${hi}.`, view(), { lo, hi });
    while (lo < hi) {
      r.op();
      const s = n[lo] + n[hi];
      r.step('sum', `numbers[${lo}] + numbers[${hi}] = ${n[lo]} + ${n[hi]} = ${s}. Compare with ${target}.`, view({ [lo]: 'compare', [hi]: 'compare' }), { lo, hi, s });
      const kind = s === target ? 'found' : s < target ? 'less' : 'greater';
      r.predict(kind, `The sum is ${s} and the target is ${target}. What happens next?`, ['That is the pair: return it', 'The sum is too small: move lo right', 'The sum is too big: move hi left'], s === target ? 0 : s < target ? 1 : 2, s < target ? 'Only a larger left value can raise the sum, and everything left of lo is smaller.' : s > target ? 'Only a smaller right value can lower the sum.' : 'Equal to the target: done.');
      if (s === target) {
        r.step('found', `Found it: positions ${lo + 1} and ${hi + 1} (1-indexed) add up to ${target}.`, view({ [lo]: 'found', [hi]: 'found' }), { result: `[${lo + 1}, ${hi + 1}]` });
        return { frames: r.frames, result: [lo + 1, hi + 1] };
      }
      if (s < target) {
        lo++;
        r.step('moveLo', `${s} < ${target}: ${n[lo - 1]} can never be part of the answer, so lo moves right to ${lo}.`, view(), { lo, hi });
      } else {
        hi--;
        r.step('moveHi', `${s} > ${target}: ${n[hi + 1]} is too big for every remaining partner, so hi moves left to ${hi}.`, view(), { lo, hi });
      }
    }
    r.step('none', 'The pointers met without finding a pair: return an empty list.', view(), { result: '[]' });
    return { frames: r.frames, result: [] };
  },
  reference({ numbers: n, target }) {
    for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) if (n[i] + n[j] === target) return [i + 1, j + 1];
    return [];
  },
});

export default problem({
  summary: 'The numbers are already sorted from smallest to largest. Find the two positions (counting from 1) whose values add up to a target. Exactly one pair works, and a position cannot be used twice.',
  example: ['numbers = [3, 6, 10, 14], target = 16', '[2, 3]', '6 + 10 = 16, and they sit at positions 2 and 3.'],
  pattern: ['two-pointers', ['two-pointers', 'hash-lookup', 'binary-search', 'sliding-window'], 'Because the list is sorted, the sum of the two ends tells you which end to move: too small means move the left end up, too big means move the right end down.', {
    'hash-lookup': 'A hash map also works in O(n), but it spends O(n) memory. The sorted order lets you do it in O(1) space with two pointers.',
    'binary-search': 'Binary search for each partner works in O(n log n). The two-pointer sweep is faster and simpler.',
    'sliding-window': 'The pair is not a contiguous stretch, so a window does not fit.',
  }],
  hints: [
    'The list is sorted. What does the sum of the smallest and the largest value tell you about the target?',
    'If the sum is too small, which of the two numbers can you rule out for good? What if it is too big?',
    'Keep one pointer at each end and move exactly one of them each step, based on whether the sum is below or above the target.',
  ],
  insight: 'Sorted order turns every comparison into a decision: too small raises the left pointer, too big lowers the right one.',
  brute: 'Try every pair: O(n²) time, O(1) space.',
  optimal: 'Two pointers from the ends: O(n) time, O(1) space.',
  walk: ['Set lo to the first index and hi to the last.', 'Add numbers[lo] and numbers[hi]. If the sum equals the target, return the positions (plus one).', 'If it is smaller, numbers[lo] paired with anything to its right is at most this big, so lo can never be part of the answer: move lo right.', 'If it is bigger, numbers[hi] is too large for every remaining partner: move hi left. Repeat until the pointers meet.'],
  edge: ['Exactly two numbers.', 'Negative numbers and a negative target.', 'Two equal values forming the pair.', 'The pair sits at the two ends.'],
  works: ['Invariant: if a valid pair exists, both of its members are still inside [lo, hi]. Discarding the small end when the sum is too small is safe because no partner can make it large enough.', 'Each step shrinks the range by one, so the loop ends after at most n steps.'],
  time: ['O(n)', 'The pointers together move at most n steps.'],
  space: ['O(1)', 'Just two indices.'],
  solution,
  cases,
  sig: 'def two_sum_sorted(numbers, target):\n    # numbers is sorted; return the two 1-indexed positions that add up to target\n    pass\n',
  viz,
  fromArgs: ([numbers, target]) => ({ numbers, target }),
});
