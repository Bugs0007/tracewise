import type { Tone } from '@/engine/types';
import { dpTable1D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './climbing-stairs.py?raw';
import cases from './climbing-stairs.cases.json';

const viz = vizOf<{ n: number }>({
  id: 'climbing-stairs',
  title: 'Climbing Stairs',
  solution,
  inputs: [{ key: 'n', label: 'number of steps (1 to 20)', kind: 'number', default: 7 }],
  presets: [
    { label: '7 steps', input: { n: 7 } },
    { label: '1 step', input: { n: 1 } },
    { label: '2 steps', input: { n: 2 } },
    { label: '12 steps', input: { n: 12 } },
  ],
  validate: ({ n }) => (Number.isInteger(n) && n >= 1 && n <= 20 ? null : 'Use a whole number from 1 to 20'),
  run({ n }) {
    const r = new TraceRecorder(solution);
    if (n <= 2) {
      r.step('small', `With ${n} step${n === 1 ? '' : 's'} the number of ways is simply ${n}: ${n === 1 ? 'one single step' : 'two 1-steps, or one 2-step'}.`, [dpTable1D([n], { title: 'ways', labels: [String(n)] })], { n });
      r.step('smallRet', `Return ${n}.`, [dpTable1D([n], { title: 'ways', labels: [String(n)] })], { result: n });
      return { frames: r.frames, result: n };
    }
    const dp = Array(n + 1).fill(0) as number[];
    const done = (upTo: number): Record<number, Tone> => Object.fromEntries(Array.from({ length: upTo + 1 }, (_, i) => [i, 'done' as Tone]));
    r.step('init', `dp[i] = number of ways to reach step i, for i = 0 … ${n}. We know nothing yet.`, [dpTable1D(dp, { title: 'dp' })], {});
    dp[1] = 1;
    dp[2] = 2;
    r.step('base', 'Base cases: 1 way to reach step 1 (a 1-step) and 2 ways to reach step 2 (1+1 or a single 2-step).', [dpTable1D(dp, { title: 'dp', tones: { 1: 'done', 2: 'done' } })], {});
    r.predictChoice('base', 'How many ways are there to reach step 3?', '3', ['2', '4', '5'], n, 'The last move was either a 1-step from step 2 (2 ways) or a 2-step from step 1 (1 way): 2 + 1.');
    let askedFill = false;
    for (let i = 3; i <= n; i++) {
      r.op();
      r.step('loop', `Fill dp[${i}]: the last move into step ${i} came from step ${i - 1} (a 1-step) or from step ${i - 2} (a 2-step).`, [dpTable1D(dp, { title: 'dp', filling: i, deps: [i - 1, i - 2], tones: done(i - 1) })], { i });
      if (!askedFill && i === 4) {
        askedFill = true;
        r.predictChoice('fill', `dp[3] = ${dp[3]} and dp[2] = ${dp[2]}. What is dp[4]?`, String(dp[3] + dp[2]), [String(dp[3]), String(dp[3] * dp[2]), String(dp[3] + dp[2] + 1)], i, 'Add the ways of the two earlier steps it can come from.');
      }
      dp[i] = dp[i - 1] + dp[i - 2];
      r.step('fill', `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${dp[i - 1]} + ${dp[i - 2]} = ${dp[i]}.`, [dpTable1D(dp, { title: 'dp', tones: done(i) })], { value: dp[i] });
    }
    r.step('done', `${dp[n]} different ways to climb ${n} steps.`, [dpTable1D(dp, { title: 'dp', tones: { ...done(n), [n]: 'found' } })], { result: dp[n] });
    return { frames: r.frames, result: dp[n] };
  },
  reference({ n }) {
    let a = 1;
    let b = 1;
    for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
    return b;
  },
});

export default problem({
  summary: 'You climb a staircase with n steps. Each move goes up 1 or 2 steps. In how many different sequences of moves can you reach the top (step n exactly)?',
  example: ['n = 4', '5', '1+1+1+1, 1+1+2, 1+2+1, 2+1+1, 2+2.'],
  pattern: ['dp-1d', ['dp-1d', 'dfs', 'math', 'backtracking'], 'The ways to reach step i depend only on the ways to reach steps i − 1 and i − 2: the last move was a 1-step or a 2-step. Fill a line left to right.', {
    dfs: 'Plain recursion recomputes the same steps exponentially often.',
    math: 'The counts are Fibonacci numbers, but the DP derivation is the point.',
    backtracking: 'Listing every sequence is unnecessary; we only count them.',
  }],
  hints: [
    'How could you have arrived on the last step? Think about the move before it.',
    'If you knew the number of ways to reach steps n − 1 and n − 2, what would the answer be?',
    'dp[i] = dp[i − 1] + dp[i − 2], with dp[1] = 1 and dp[2] = 2.',
  ],
  insight: 'The last move was either 1 step or 2 steps, so the ways to reach i are the ways to reach i − 1 plus the ways to reach i − 2.',
  brute: 'Recursion with no memory: O(2ⁿ).',
  optimal: 'Bottom-up DP: O(n) time; O(1) space is possible by keeping only the last two values.',
  walk: ['Handle n ≤ 2 directly.', 'dp[1] = 1, dp[2] = 2.', 'For i from 3 to n: dp[i] = dp[i − 1] + dp[i − 2].', 'Return dp[n].'],
  edge: ['n = 1 and n = 2.', 'Large n (the count grows quickly).', 'Using dp[0] correctly if you start the table at step 0.'],
  works: ['Every sequence ending on step i ends with a 1-step (from i − 1) or a 2-step (from i − 2), and these two groups do not overlap.', 'So the counts add.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(n)', 'The table (O(1) with two variables).'],
  solution,
  cases,
  sig: 'def climb_stairs(n):\n    # number of distinct ways to climb n steps taking 1 or 2 at a time\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
