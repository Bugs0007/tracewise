import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './house-robber.py?raw';
import cases from './house-robber.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'house-robber',
  title: 'House Robber',
  solution,
  inputs: [{ key: 'nums', label: 'money in each house, in street order', kind: 'numbers', default: [3, 8, 5, 2, 9], maxItems: 10 }],
  presets: [
    { label: 'Skip a neighbour', input: { nums: [3, 8, 5, 2, 9] } },
    { label: 'Take the outer ones', input: { nums: [10, 1, 1, 10] } },
    { label: 'All equal', input: { nums: [5, 5, 5, 5] } },
    { label: 'Empty street', input: { nums: [] } },
  ],
  validate: ({ nums }) => (nums.some((v) => v === null || !Number.isFinite(v) || v < 0) ? 'Money must be numbers ≥ 0' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let prev = 0;
    let curr = 0;
    const best: number[] = [];
    let askedUpdate = false;
    let askedPick = false;
    const view = (i = -1) => [
      arrayView(nums, { title: 'houses (money inside)', pointers: i >= 0 ? { house: i } : {}, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }),
      arrayView(best, { title: 'best total using houses up to each one' }),
      hashMapView({ prev, curr }, { title: 'prev = best two houses back, curr = best so far' }),
    ];
    r.step('init', 'curr is the best total so far; prev is the best total from one house earlier. Both start at 0.', view(), {});
    if (!nums.length) {
      r.step('done', 'No houses: the best total is 0.', view(), { result: 0 });
      return { frames: r.frames, result: 0 };
    }
    for (let i = 0; i < nums.length; i++) {
      r.op();
      const take = prev + nums[i];
      const skip = curr;
      r.step('loop', `House ${i} holds ${nums[i]}. Either skip it (keep ${skip}) or rob it (${prev} from before the previous house + ${nums[i]} = ${take}).`, view(i), { i });
      if (!askedUpdate && i >= 1) {
        askedUpdate = true;
        r.predictChoice('update', `Skip = ${skip}, rob = ${take}. What is the new curr?`, String(Math.max(skip, take)), [String(skip + take), String(Math.min(skip, take)), String(take + 1)], i, 'We choose the better of the two options. Robbing uses the best from two houses back because neighbours cannot both be robbed.');
      }
      [prev, curr] = [curr, Math.max(curr, take)];
      best.push(curr);
      if (!askedPick && take > skip) {
        askedPick = true;
        r.step('update', `Robbing is better (${take} > ${skip}): curr = ${curr}.`, view(i), {});
        r.predict('pick', 'Robbing a house adds its money to prev, not to curr. Why?', ['curr may include the previous house, which is adjacent and so not allowed', 'prev is always larger than curr', 'It makes no difference'], 0, 'curr is the best total up to the previous house and might use it. prev is the best total up to the house before that, which is safe to combine with this one.');
      } else {
        r.step('update', `curr = max(${skip}, ${take}) = ${curr}.`, view(i), {});
      }
    }
    r.step('done', `The most you can steal is ${curr}.`, view(), { result: curr });
    return { frames: r.frames, result: curr };
  },
  reference({ nums }) {
    let a = 0;
    let b = 0;
    for (const m of nums) [a, b] = [b, Math.max(b, a + m)];
    return b;
  },
});

export default problem({
  summary: 'A street has houses in a row, each holding some money. If you rob two houses that are next to each other, an alarm goes off. Find the largest total you can take without ever robbing two adjacent houses.',
  example: ['[2, 9, 3, 7]', '16', 'Rob the 9 and the 7. Robbing 2 and 3 would only give 5.'],
  pattern: ['dp-1d', ['dp-1d', 'greedy', 'backtracking', 'sliding-window'], 'At each house you either skip it (keep the best so far) or rob it (add to the best from two houses back). That choice only depends on the last two answers.', {
    greedy: 'Always taking the richest house first can block two good neighbours.',
    backtracking: 'Trying every subset works but is exponential.',
    'sliding-window': 'The chosen houses need not be contiguous.',
  }],
  hints: [
    'Think about the last house only. Do you rob it or not?',
    'If you rob it, which houses are no longer allowed? If you skip it, what is left?',
    'best[i] = max(best[i−1], best[i−2] + nums[i]). You only need the last two values.',
  ],
  insight: 'best[i] = max(skip house i, rob house i): skipping keeps best[i−1], robbing adds the money to best[i−2].',
  brute: 'Try every subset of houses with no neighbours: O(2ⁿ).',
  optimal: 'DP with two variables: O(n) time, O(1) space.',
  walk: ['prev = curr = 0.', 'For each money: prev, curr = curr, max(curr, prev + money).', 'Return curr.'],
  edge: ['No houses.', 'A single house.', 'Two houses (take the larger).', 'Zeros in the list.'],
  works: ['The best plan for the first i houses either leaves house i alone (best of the first i − 1) or robs it, which forces house i − 1 to be skipped (best of the first i − 2 plus house i).'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Two variables.'],
  solution,
  cases,
  sig: 'def rob(nums):\n    # largest sum with no two adjacent houses chosen\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
