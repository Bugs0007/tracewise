import type { Tone } from '@/engine/types';
import { arrayView, dpTable1D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './partition-equal-subset-sum.py?raw';
import cases from './partition-equal-subset-sum.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'partition-equal-subset-sum',
  title: 'Partition Equal Subset Sum',
  solution,
  inputs: [{ key: 'nums', label: 'positive numbers', kind: 'numbers', default: [3, 5, 8, 2, 4, 2], maxItems: 8 }],
  presets: [
    { label: 'Splits evenly', input: { nums: [3, 5, 8, 2, 4, 2] } },
    { label: 'Odd total', input: { nums: [1, 2, 4] } },
    { label: 'Even but no split', input: { nums: [1, 5, 5, 9] } },
    { label: 'Many ones', input: { nums: [1, 1, 1, 1, 1, 1] } },
  ],
  validate: ({ nums }) => (nums.some((v) => v === null || !Number.isInteger(v) || v < 1) ? 'Use whole numbers ≥ 1' : nums.reduce((a, b) => a + b, 0) > 60 ? 'Keep the total at most 60' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const total = nums.reduce((a, b) => a + b, 0);
    let askedOdd = false;
    let askedBack = false;
    let askedTarget = false;
    if (total % 2) {
      r.step('odd', `The total is ${total}, which is odd: two equal halves are impossible.`, [arrayView(nums, { title: 'numbers' })], {});
      if (!askedOdd) {
        askedOdd = true;
        r.predict('odd', `The total is ${total}. Can the numbers be split into two groups with equal sums?`, ['No: an odd total cannot be halved into whole numbers', 'Yes'], 0, 'Each half would need total / 2, which is not a whole number.');
      }
      r.step('oddRet', 'Return False.', [arrayView(nums, { title: 'numbers' })], { result: false });
      return { frames: r.frames, result: false };
    }
    const target = total / 2;
    r.step('target', `The total is ${total}, so each half must sum to ${target}. We only need to know whether some group of numbers adds up to ${target}.`, [arrayView(nums, { title: 'numbers' })], {});
    if (!askedTarget) {
      askedTarget = true;
      r.predictChoice('target', `The numbers add up to ${total}. What must one half sum to?`, String(target), [String(total), String(target + 1), String(target - 1)], total, 'If one group sums to half, the rest sums to the other half.');
    }
    const dp = [true, ...Array(target).fill(false)] as boolean[];
    const t = (a: boolean[]) => a.map((v) => (v ? 'T' : 'F'));
    const tones = (a: boolean[], fresh: number[] = []): Record<number, Tone> => ({ ...Object.fromEntries(a.map((v, i) => [i, (v ? 'found' : 'default') as Tone])), ...Object.fromEntries(fresh.map((i) => [i, 'active' as Tone])) });
    r.step('init', `dp[s] = True if some group of the numbers seen so far sums to s. dp[0] is True (the empty group).`, [arrayView(nums, { title: 'numbers' }), dpTable1D(t(dp), { title: 'dp (T = reachable sum)', tones: tones(dp) })], {});
    for (let i = 0; i < nums.length; i++) {
      r.op();
      const x = nums[i];
      const fresh: number[] = [];
      for (let s = target; s >= x; s--) {
        if (dp[s - x] && !dp[s]) {
          dp[s] = true;
          fresh.push(s);
        }
      }
      r.step('inner', fresh.length ? `Number ${x}: sums ${fresh.sort((a, b) => a - b).join(', ')} become reachable (each is an earlier reachable sum + ${x}).` : `Number ${x}: it creates no new reachable sum.`, [arrayView(nums, { title: 'numbers', tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }), dpTable1D(t(dp), { title: 'dp (T = reachable sum)', tones: tones(dp, fresh) })], { x });
      if (!askedBack && i === 0) {
        askedBack = true;
        r.predict('back', 'The inner loop goes from the target DOWN to x. Why not upward?', ['Going upward could use the same number twice in one pass', 'Downward is faster', 'It makes no difference'], 0, 'dp[s − x] must come from BEFORE this number was added. Counting upward would reuse x within the same pass.');
      }
    }
    r.step('done', dp[target] ? `dp[${target}] is True: a group summing to ${target} exists, so the rest sums to ${target} too.` : `dp[${target}] is False: no group sums to ${target}.`, [arrayView(nums, { title: 'numbers' }), dpTable1D(t(dp), { title: 'dp', tones: { ...tones(dp), [target]: dp[target] ? 'found' : 'compare' } })], { result: dp[target] });
    return { frames: r.frames, result: dp[target] };
  },
  reference({ nums }) {
    const total = nums.reduce((a, b) => a + b, 0);
    if (total % 2) return false;
    const target = total / 2;
    const dp = [true, ...Array(target).fill(false)] as boolean[];
    for (const x of nums) for (let s = target; s >= x; s--) if (dp[s - x]) dp[s] = true;
    return dp[target];
  },
});

export default problem({
  summary: 'Given a list of positive whole numbers, decide whether it can be split into two groups that have exactly the same sum. Every number goes into exactly one group.',
  example: ['[1, 3, 4, 2]', 'true', 'The total is 10, so each group must sum to 5: {1, 4} and {3, 2}.'],
  pattern: ['dp-1d', ['dp-1d', 'backtracking', 'dp-2d', 'greedy'], 'Equal halves means some group sums to total / 2. Which sums are reachable using the numbers so far is a boolean line: add each number and mark every reachable sum shifted by it.', {
    backtracking: 'Trying every subset works but is exponential.',
    'dp-2d': 'A table dp[i][s] works; the single line is the same table compressed.',
    greedy: 'Greedy assignment to the lighter half fails on cases like [1, 5, 5, 9].',
  }],
  hints: [
    'If the total is odd, can it work? If it is even, what single target do you need to hit?',
    'Think of the sums you can make using the numbers seen so far. How does a new number change that set?',
    'dp[0] = True. For each number x, for s from target down to x: if dp[s − x] then dp[s] = True. Return dp[target].',
  ],
  insight: 'Subset-sum on a boolean line: each new number x turns reachable sums s − x into reachable sums s.',
  brute: 'Try all 2ⁿ subsets.',
  optimal: 'DP: O(n · target) time, O(target) space.',
  walk: ['If the total is odd return False.', 'target = total // 2; dp = [True] + [False] * target.', 'For each number x iterate s from target down to x and set dp[s] = True if dp[s − x] is True.', 'Return dp[target].'],
  edge: ['Odd total.', 'A single number.', 'A number larger than the target (it is ignored in the loop).', 'Many equal numbers.'],
  works: ['After processing a prefix, dp[s] is True exactly when some subset of that prefix sums to s.', 'Iterating downward ensures each number is used at most once per pass.'],
  time: ['O(n · target)', 'Pseudo-polynomial: it depends on the size of the sum.'],
  space: ['O(target)', 'One boolean line.'],
  solution,
  cases,
  sig: 'def can_partition(nums):\n    # True if nums can be split into two groups with equal sums\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
