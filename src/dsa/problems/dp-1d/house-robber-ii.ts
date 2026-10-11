import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './house-robber-ii.py?raw';
import cases from './house-robber-ii.cases.json';

const line = (xs: number[]) => {
  let a = 0;
  let b = 0;
  for (const m of xs) [a, b] = [b, Math.max(b, a + m)];
  return b;
};

const viz = vizOf<{ nums: number[] }>({
  id: 'house-robber-ii',
  title: 'House Robber II',
  solution,
  inputs: [{ key: 'nums', label: 'money in each house; the street is a circle (first and last are neighbours)', kind: 'numbers', default: [4, 9, 3, 6], maxItems: 9 }],
  presets: [
    { label: 'Circle', input: { nums: [4, 9, 3, 6] } },
    { label: 'Best skips the first', input: { nums: [1, 6, 2, 9, 1] } },
    { label: 'Single house', input: { nums: [8] } },
    { label: 'All equal', input: { nums: [4, 4, 4, 4, 4] } },
  ],
  validate: ({ nums }) => (!nums.length ? 'Enter at least one house' : nums.some((v) => v === null || !Number.isFinite(v) || v < 0) ? 'Money must be numbers ≥ 0' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    if (nums.length === 1) {
      r.step('single', 'With one house there is no neighbour to worry about: rob it.', [arrayView(nums, { title: 'houses' })], {});
      r.step('singleRet', `Return ${nums[0]}.`, [arrayView(nums, { title: 'houses' })], { result: nums[0] });
      return { frames: r.frames, result: nums[0] };
    }
    let askedCircle = false;
    let askedMax = false;
    const runLine = (from: number, to: number, label: string): number => {
      let prev = 0;
      let curr = 0;
      for (let i = from; i < to; i++) {
        r.op();
        const take = prev + nums[i];
        [prev, curr] = [curr, Math.max(curr, take)];
        r.step('update', `${label}: house ${i} (${nums[i]}) → curr = max(skip, prev + ${nums[i]}) = ${curr}.`, [arrayView(nums, { title: `houses (${label}: grey = not allowed in this plan)`, tones: Object.fromEntries(nums.map((_, k) => [k, (k < from || k >= to ? 'compare' : k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }), hashMapView({ prev, curr })], { i });
      }
      return curr;
    };
    r.step('def', 'The street is a circle, so the first and last houses are neighbours and cannot both be robbed.', [arrayView(nums, { title: 'houses (circle)', pointers: { first: 0, last: nums.length - 1 } })], {});
    if (!askedCircle) {
      askedCircle = true;
      r.predict('circle', 'Both the first and the last house cannot be robbed together. How does the solution handle that?', ['Solve two straight streets: without the first house, and without the last house', 'Rob the first house always', 'Ignore the last house always'], 0, 'Any valid plan leaves out the first house or the last one (or both). Solving both straight versions covers every plan.');
    }
    const a = runLine(1, nums.length, 'without the first house');
    r.step('ret', `Best without the first house: ${a}.`, [arrayView(nums, { title: 'houses', tones: { 0: 'compare' } })], { a });
    const b = runLine(0, nums.length - 1, 'without the last house');
    r.step('ret', `Best without the last house: ${b}.`, [arrayView(nums, { title: 'houses', tones: { [nums.length - 1]: 'compare' } })], { b });
    if (!askedMax) {
      askedMax = true;
      r.predictChoice('max', `The two plans give ${a} and ${b}. What is returned?`, String(Math.max(a, b)), [String(a + b), String(Math.min(a, b)), String(Math.max(a, b) + 1)], a, 'Either plan is allowed, so take the better one.');
    }
    r.step('done', `The most you can steal is max(${a}, ${b}) = ${Math.max(a, b)}.`, [arrayView(nums, { title: 'houses' })], { result: Math.max(a, b) });
    return { frames: r.frames, result: Math.max(a, b) };
  },
  reference({ nums }) {
    return nums.length === 1 ? nums[0] : Math.max(line(nums.slice(1)), line(nums.slice(0, -1)));
  },
});

export default problem({
  summary: 'The houses now stand in a circle: the first and the last house are neighbours too. As before, robbing two neighbouring houses sets off the alarm. Find the largest total you can take.',
  example: ['[5, 1, 1, 5]', '6', 'Robbing the two 5s would set the alarm off (they are neighbours in the circle); the best is 5 + 1 = 6.'],
  pattern: ['dp-1d', ['dp-1d', 'greedy', 'backtracking', 'sliding-window'], 'Break the circle into two straight streets by excluding the first house or the last one, solve each with the House Robber recurrence, and take the larger result.', {
    greedy: 'Taking the biggest house first can block a better plan.',
    backtracking: 'Trying subsets is exponential.',
    'sliding-window': 'Chosen houses are not contiguous.',
  }],
  hints: [
    'What changes compared with the straight street?',
    'Which two houses can never both be robbed? What are your options for them?',
    'Run the straight solution on nums[1:] and on nums[:−1] and return the maximum (handle a single house separately).',
  ],
  insight: 'A circle becomes two lines: drop the first house or drop the last.',
  brute: 'Try every subset without circular neighbours: O(2ⁿ).',
  optimal: 'Two linear DP passes: O(n) time, O(1) space.',
  walk: ['If there is one house, return it.', 'Define line(houses) with the House Robber recurrence.', 'Return max(line(nums[1:]), line(nums[:-1])).'],
  edge: ['One house.', 'Two houses (take the larger).', 'Best plan uses neither end.', 'All zeros.'],
  works: ['Every legal plan omits the first house, the last house, or both, so it is covered by one of the two straight sub-streets.', 'Each sub-street is solved optimally by the straight recurrence.'],
  time: ['O(n)', 'Two passes.'],
  space: ['O(1)', 'Two variables per pass.'],
  solution,
  cases,
  sig: 'def rob_circle(nums):\n    # houses are in a circle: the first and last are neighbours\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
