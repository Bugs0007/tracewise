import type { Tone } from '@/engine/types';
import { arrayView, chipsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './3sum.py?raw';
import cases from './3sum.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: '3sum',
  title: '3Sum',
  solution,
  inputs: [{ key: 'nums', label: 'nums', kind: 'numbers', default: [-3, 0, 1, 2, -1, 1, -2, 0], maxItems: 11 }],
  presets: [
    { label: 'Several triples', input: { nums: [-3, 0, 1, 2, -1, 1, -2, 0] } },
    { label: 'Duplicates', input: { nums: [-2, -2, 0, 0, 2, 2, 2] } },
    { label: 'No triple', input: { nums: [1, 2, 4, 7] } },
    { label: 'Too short', input: { nums: [0, 0] } },
  ],
  run({ nums: raw }) {
    const r = new TraceRecorder(solution);
    const nums = [...raw].sort((a, b) => a - b);
    const res: number[][] = [];
    let i = -1;
    let lo = 0;
    let hi = 0;
    const view = (hot: Record<number, Tone> = {}, ptrs = true) => {
      const tones: Record<number, Tone> = {};
      if (i >= 0) tones[i] = 'active';
      return [
        arrayView(nums, { title: 'nums (sorted)', tones: { ...tones, ...hot }, pointers: ptrs && i >= 0 ? { i, lo, hi } : undefined }),
        chipsView(res.map((t) => `[${t.join(', ')}]`), { title: 'triples found', emptyText: 'none yet', tones: Object.fromEntries(res.map((_, k) => [k, 'found' as Tone])) }),
      ];
    };
    r.step('sort', `Sort first (${raw.join(', ')} becomes ${nums.join(', ')}). Sorted order lets two pointers find pairs and makes duplicates sit side by side.`, view({}, false), { n: nums.length });
    r.step('res', 'res will collect each distinct triple that sums to zero.', view({}, false), {});
    for (i = 0; i < nums.length - 2; i++) {
      r.op();
      r.step('loop', `Fix nums[${i}] = ${nums[i]} as the first number. Now look for two numbers to its right that sum to ${-nums[i]}.`, view({}, false), { i, first: nums[i] });
      if (i > 0 && nums[i] === nums[i - 1]) {
        r.step('dupI', `${nums[i]} is the same as the previous first number, so every triple starting here was already found: skip it.`, view({ [i]: 'muted' }, false), { i });
        continue;
      }
      lo = i + 1;
      hi = nums.length - 1;
      r.step('ptrs', `lo = ${lo}, hi = ${hi}: one pointer at each end of what remains.`, view(), { i, lo, hi });
      while (lo < hi) {
        const s = nums[i] + nums[lo] + nums[hi];
        r.step('sum', `${nums[i]} + ${nums[lo]} + ${nums[hi]} = ${s}`, view({ [lo]: 'compare', [hi]: 'compare' }), { i, lo, hi, s });
        const kind = s < 0 ? 'neg' : s > 0 ? 'pos' : 'zero';
        r.predict(kind, `The sum is ${s}. What happens next?`, ['Too small: move lo right', 'Too big: move hi left', 'Zero: record the triple'], s < 0 ? 0 : s > 0 ? 1 : 2, s < 0 ? 'A negative sum needs a bigger number; the sorted order says move lo up.' : s > 0 ? 'A positive sum needs a smaller number: move hi down.' : 'A zero-sum triple: add it, then keep looking.');
        if (s < 0) {
          lo++;
          r.step('moveLo', `${s} < 0: move lo right (lo = ${lo}).`, view(), { i, lo, hi });
        } else if (s > 0) {
          hi--;
          r.step('moveHi', `${s} > 0: move hi left (hi = ${hi}).`, view(), { i, lo, hi });
        } else {
          res.push([nums[i], nums[lo], nums[hi]]);
          r.step('add', `Zero! Record [${nums[i]}, ${nums[lo]}, ${nums[hi]}].`, view({ [lo]: 'found', [hi]: 'found' }), { found: res.length });
          lo++;
          r.step('afterLo', 'Move lo right to look for another triple with the same first number.', view(), { i, lo, hi });
          while (lo < hi && nums[lo] === nums[lo - 1]) {
            lo++;
            r.step('dupLoStep', `nums[lo] repeats the value just used: skip it (lo = ${lo}).`, view({ [lo - 1]: 'muted' }), { i, lo, hi });
          }
          hi--;
          r.step('afterHi', 'Move hi left as well.', view(), { i, lo, hi });
        }
      }
    }
    i = -1;
    r.step('done', `Done: ${res.length} distinct triple${res.length === 1 ? '' : 's'}.`, view({}, false), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ nums }) {
    const set = new Set<string>();
    for (let a = 0; a < nums.length; a++) for (let b = a + 1; b < nums.length; b++) for (let c = b + 1; c < nums.length; c++) if (nums[a] + nums[b] + nums[c] === 0) set.add([nums[a], nums[b], nums[c]].sort((x, y) => x - y).join(','));
    return [...set].map((t) => t.split(',').map(Number));
  },
});

export default problem({
  summary: 'From a list of integers, collect every set of three different positions whose values add up to zero. Report each distinct combination of values only once.',
  example: ['nums = [-4, 1, 3, 0, 2, -2]', '[[-4, 1, 3], [-2, 0, 2]]', 'Each triple sums to zero; the order of the triples and of the numbers inside does not matter.'],
  pattern: ['two-pointers', ['two-pointers', 'hash-lookup', 'backtracking', 'sliding-window'], 'Sort the numbers, fix one, and the remaining question is "which two numbers sum to a target?", which two pointers answer in one sweep of the sorted rest.', {
    'hash-lookup': 'A hash set per first number works too, but removing duplicate triples gets messy. Sorting plus two pointers keeps duplicates adjacent and easy to skip.',
    backtracking: 'Backtracking would try every triple (O(n³)). Sorting lets you prune to O(n²).',
    'sliding-window': 'The three numbers are not contiguous in the input.',
  }],
  hints: [
    'Trying every triple is O(n³). If you fix the first number, what simpler problem is left for the other two?',
    'Sort the list. Then "find two numbers that sum to a target" becomes the two-pointer sweep you already know.',
    'Duplicates are the tricky part: after sorting, skip a first number equal to the previous one, and after recording a triple, skip repeated values of lo.',
  ],
  insight: 'Sort, fix the first number, then sweep two pointers over the rest, skipping repeated values so no triple is reported twice.',
  brute: 'Check every triple of positions and de-duplicate: O(n³) time.',
  optimal: 'Sort once, then one two-pointer pass per first number: O(n²) time, O(1) extra space (not counting the output).',
  walk: ['Sort the array. Loop i over the possible first numbers, skipping any whose value equals the previous one.', 'For each i set lo = i + 1 and hi = last. The wanted pair sums to -nums[i].', 'If the three-sum is negative, move lo up; if positive, move hi down; if zero, record the triple.', 'After recording, move lo past repeated values and move hi down once so the same triple is not found again.'],
  edge: ['Fewer than three numbers: no triples.', 'All zeros: exactly one triple.', 'Many repeated values that could create duplicate triples.', 'No triple at all.'],
  works: ['Sorting means every value of lo and hi that could pair with nums[i] is reached by moving the pointers monotonically, so no pair is missed.', 'Skipping equal first numbers and equal lo values guarantees every recorded triple is distinct.'],
  time: ['O(n²)', 'Sorting is O(n log n); then each of the n first numbers costs one O(n) pointer sweep.'],
  space: ['O(1)', 'Ignoring the output list and the sort, only pointers are stored.'],
  solution,
  cases,
  sig: 'def three_sum(nums):\n    # return every distinct triple of values that sums to 0\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
