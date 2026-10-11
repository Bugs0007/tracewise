import type { Tone } from '@/engine/types';
import { arrayView, dpTable1D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './min-cost-climbing-stairs.py?raw';
import cases from './min-cost-climbing-stairs.cases.json';

const viz = vizOf<{ cost: number[] }>({
  id: 'min-cost-climbing-stairs',
  title: 'Min Cost Climbing Stairs',
  solution,
  inputs: [{ key: 'cost', label: 'cost of standing on each step (at least 2 steps)', kind: 'numbers', default: [4, 9, 2, 8, 1, 7], maxItems: 10 }],
  presets: [
    { label: 'Skip expensive steps', input: { cost: [4, 9, 2, 8, 1, 7] } },
    { label: 'Start on step 1', input: { cost: [10, 1, 10, 1, 10] } },
    { label: 'Two steps', input: { cost: [5, 3] } },
    { label: 'Equal costs', input: { cost: [5, 5, 5, 5, 5] } },
  ],
  validate: ({ cost }) => (cost.length < 2 ? 'Enter at least two costs' : cost.some((c) => c === null || !Number.isFinite(c) || c < 0) ? 'Costs must be numbers ≥ 0' : null),
  run({ cost }) {
    const r = new TraceRecorder(solution);
    const n = cost.length;
    const dp = Array(n + 1).fill(0) as number[];
    const done = (upTo: number): Record<number, Tone> => Object.fromEntries(Array.from({ length: upTo + 1 }, (_, i) => [i, 'done' as Tone]));
    const costRow = (at = -1, at2 = -1) => arrayView(cost, { title: 'cost of each step (you pay when you leave it)', tones: { ...(at >= 0 ? { [at]: 'compare' as Tone } : {}), ...(at2 >= 0 ? { [at2]: 'compare' as Tone } : {}) } });
    r.step('init', `dp[i] = cheapest total to arrive at step i. The "top" is index ${n}, just past the last step. You may start on step 0 or step 1 for free, so dp[0] = dp[1] = 0.`, [costRow(), dpTable1D(dp, { title: 'dp', tones: { 0: 'done', 1: 'done' } })], {});
    r.predict('init', 'Starting on step 0 or step 1 costs nothing to stand there, but you pay the step’s cost when you leave it. Which is true about dp[2]?', ['It is the cheaper of leaving step 0 or leaving step 1', 'It is always cost[0] + cost[1]', 'It is always 0'], 0, 'To reach step 2 you pay for the step you left: cost[1] (from step 1) or cost[0] (from step 0). Take the smaller.');
    let askedFill = false;
    for (let i = 2; i <= n; i++) {
      r.op();
      r.step('loop', `dp[${i}] = min(dp[${i - 1}] + cost[${i - 1}], dp[${i - 2}] + cost[${i - 2}]): arrive from step ${i - 1} or step ${i - 2}, paying for the step you leave.`, [costRow(i - 1, i - 2), dpTable1D(dp, { title: 'dp', filling: i, deps: [i - 1, i - 2], tones: done(i - 1) })], { i });
      const a = dp[i - 1] + cost[i - 1];
      const b = dp[i - 2] + cost[i - 2];
      if (!askedFill && i === 3) {
        askedFill = true;
        r.predictChoice('fill', `Option A: ${dp[i - 1]} + ${cost[i - 1]} = ${a}. Option B: ${dp[i - 2]} + ${cost[i - 2]} = ${b}. What is dp[${i}]?`, String(Math.min(a, b)), [String(a + b), String(Math.max(a, b)), String(Math.min(a, b) + 1)], i, 'We want the cheapest way, so take the minimum of the two options.');
      }
      dp[i] = Math.min(a, b);
      r.step('fill', `dp[${i}] = min(${a}, ${b}) = ${dp[i]}.`, [costRow(), dpTable1D(dp, { title: 'dp', tones: done(i) })], { value: dp[i] });
    }
    r.step('done', `Reaching the top (index ${n}) costs ${dp[n]}.`, [costRow(), dpTable1D(dp, { title: 'dp', tones: { ...done(n), [n]: 'found' } })], { result: dp[n] });
    return { frames: r.frames, result: dp[n] };
  },
  reference({ cost }) {
    const n = cost.length;
    const go = (i: number): number => (i >= n ? 0 : cost[i] + Math.min(go(i + 1), go(i + 2)));
    return Math.min(go(0), go(1));
  },
});

export default problem({
  summary: 'Each stair has a cost you pay when you step off it. You may start on step 0 or step 1, and each move climbs 1 or 2 steps. The top is just past the last step. Find the cheapest total cost to reach the top.',
  example: ['cost [1, 5, 1, 1]', '2', 'Start on step 0 (cost 1) jump to step 2 (cost 1) and then to the top: 1 + 1 = 2.'],
  pattern: ['dp-1d', ['dp-1d', 'greedy', 'dfs', 'dijkstra'], 'The cheapest way to reach step i depends on the cheapest ways to reach i − 1 and i − 2. Fill a line left to right.', {
    greedy: 'Taking the cheaper next step greedily can force an expensive step later.',
    dfs: 'Plain recursion recomputes subproblems exponentially often.',
    dijkstra: 'The graph is a simple line with at most two outgoing moves; DP is simpler.',
  }],
  hints: [
    'How can you arrive at step i? What do you pay in each case?',
    'Define dp[i] as the minimum cost to be standing at position i without having paid for step i yet.',
    'dp[i] = min(dp[i−1] + cost[i−1], dp[i−2] + cost[i−2]) for i from 2 to n; return dp[n].',
  ],
  insight: 'Pay for the step you leave: arrive at i from i − 1 or i − 2 and add that step’s cost.',
  brute: 'Try every sequence of 1- and 2-steps: O(2ⁿ).',
  optimal: 'Bottom-up DP: O(n).',
  walk: ['dp has n + 1 entries, dp[0] = dp[1] = 0.', 'For i from 2 to n: dp[i] = min(dp[i − 1] + cost[i − 1], dp[i − 2] + cost[i − 2]).', 'Return dp[n].'],
  edge: ['Exactly two steps (the answer is min of both costs).', 'Zero-cost steps.', 'The cheapest path starts on step 1.'],
  works: ['Any route to the top reaches index i from i − 1 or i − 2 and paid the cost of that departure step; the minimum over both cases is optimal.', 'Smaller indices are always computed first.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(n)', 'The table (O(1) with two variables).'],
  solution,
  cases,
  sig: 'def min_cost_climbing_stairs(cost):\n    # cost[i] is paid when leaving step i; start at step 0 or 1; the top is just past the last step\n    pass\n',
  viz,
  fromArgs: ([cost]) => ({ cost }),
});
