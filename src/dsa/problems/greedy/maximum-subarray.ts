import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './maximum-subarray.py?raw';
import cases from './maximum-subarray.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'maximum-subarray',
  title: 'Maximum Subarray',
  solution,
  inputs: [{ key: 'nums', label: 'numbers', kind: 'numbers', default: [2, -1, 3, -6, 5, 1], maxItems: 12 }],
  presets: [
    { label: 'Restart after a dip', input: { nums: [2, -1, 3, -6, 5, 1] } },
    { label: 'All negative', input: { nums: [-5, -2, -8] } },
    { label: 'Alternating', input: { nums: [5, -4, 5, -4, 5] } },
    { label: 'Single', input: { nums: [-4] } },
  ],
  validate: ({ nums }) => (!nums.length || nums.some((v) => v === null || !Number.isFinite(v)) ? 'Enter at least one plain number' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let curr = nums[0];
    let best = nums[0];
    let start = 0;
    let bestRange: [number, number] = [0, 0];
    let askedRestart = false;
    let askedExtend = false;
    const view = (i: number) => [
      arrayView(nums, { title: 'numbers (bracket = the run ending here)', pointers: { i }, window: { from: start, to: i, label: 'current run', tone: 'active' }, tones: Object.fromEntries(nums.map((_, k) => [k, (k >= bestRange[0] && k <= bestRange[1] ? 'found' : 'default') as Tone])) }),
      hashMapView({ 'best run ending here (curr)': curr, 'best overall': best }),
    ];
    r.step('init', `Start with the first number: curr = best = ${nums[0]}.`, view(0), {});
    for (let i = 1; i < nums.length; i++) {
      r.op();
      const x = nums[i];
      const ext = curr + x;
      r.step('loop', `x = ${x}. Extend the current run (${curr} + ${x} = ${ext}) or start a new run at x (${x})?`, view(i), { x });
      if (ext < x) {
        if (!askedRestart) {
          askedRestart = true;
          r.predict('restart', `The run so far has sum ${curr}, which is negative. ${x} alone beats ${ext}. What do we do?`, ['Start a new run at this number', 'Extend the run anyway', 'Stop'], 0, 'A negative running sum can only make later sums smaller, so drop it.');
        }
        curr = x;
        start = i;
      } else {
        if (!askedExtend && curr > 0) {
          askedExtend = true;
          r.predictChoice('extend', `curr = ${curr} and x = ${x}. What is the new curr?`, String(Math.max(x, ext)), [String(x), String(curr), String(Math.max(x, ext) + 1)], i, 'curr = max(x, curr + x): extend when the old run helps.');
        }
        curr = ext;
      }
      if (curr > best) {
        best = curr;
        bestRange = [start, i];
      }
      r.step('extend', `curr = ${curr}. best = ${best}.`, view(i), { curr, best });
    }
    r.step('done', `The largest sum of a contiguous block is ${best}.`, view(nums.length - 1), { result: best });
    return { frames: r.frames, result: best };
  },
  reference({ nums }) {
    let best = -Infinity;
    for (let i = 0; i < nums.length; i++) {
      let s = 0;
      for (let j = i; j < nums.length; j++) {
        s += nums[j];
        best = Math.max(best, s);
      }
    }
    return best;
  },
});

export default problem({
  summary: 'Find the largest possible sum of a contiguous (non-empty) block of numbers in a list. The numbers may be negative.',
  example: ['[1, -3, 2, 2]', '4', 'The block [2, 2] sums to 4; including the −3 or the 1 only lowers it.'],
  pattern: ['greedy', ['greedy', 'dp-1d', 'sliding-window', 'prefix-sum'], 'At each number decide: continue the run, or abandon it because its sum has become a burden (negative). A negative running sum never helps, so restarting is a safe local choice.', {
    'dp-1d': 'This is also the DP "best sum ending here" with one variable; the greedy view is that a negative prefix is always dropped.',
    'sliding-window': 'Sums with negative numbers are not monotone, so a window cannot be shrunk by a simple rule.',
    'prefix-sum': 'Best sum = max(prefix[j] − min earlier prefix); Kadane\'s method does this in one pass.',
  }],
  hints: [
    'If the sum of a run so far is negative, can it help any block that extends it?',
    'What are your two choices at each new number?',
    'curr = max(x, curr + x); best = max(best, curr).',
  ],
  insight: 'A run with a negative sum is worth dropping: starting fresh at the next number is always at least as good.',
  brute: 'Sum every block: O(n²) (or O(n³) naively).',
  optimal: 'Kadane: one pass, O(n) time, O(1) space.',
  walk: ['best = curr = nums[0].', 'For each following x: curr = max(x, curr + x).', 'best = max(best, curr).', 'Return best.'],
  edge: ['All negative numbers (answer is the largest single number).', 'A single number.', 'Zeros.', 'The best block is the whole list.'],
  works: ['Any best block ending at i either is just x or extends the best block ending at i − 1; taking the larger of the two gives the best ending at i.', 'The overall answer is the maximum over all i.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Two variables.'],
  solution,
  cases,
  sig: 'def max_sub_array(nums):\n    # largest sum of a contiguous non-empty block\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
