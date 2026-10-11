import type { Tone } from '@/engine/types';
import { arrayView, dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './burst-balloons.py?raw';
import cases from './burst-balloons.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'burst-balloons',
  title: 'Burst Balloons',
  solution,
  inputs: [{ key: 'nums', label: 'balloon values (1 to 5 balloons)', kind: 'numbers', default: [2, 4, 3], maxItems: 5 }],
  presets: [
    { label: 'Order matters', input: { nums: [2, 4, 3] } },
    { label: 'Four balloons', input: { nums: [1, 6, 2, 5] } },
    { label: 'Zeros', input: { nums: [0, 5, 0] } },
    { label: 'Single balloon', input: { nums: [5] } },
  ],
  validate: ({ nums }) => (nums.length < 1 || nums.some((v) => v === null || !Number.isInteger(v) || v < 0) ? 'Use 1 to 5 whole numbers ≥ 0' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const vals = [1, ...nums, 1];
    const n = vals.length;
    const dp = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
    const done = new Set<string>();
    const tones = (): Record<string, Tone> => Object.fromEntries([...done].map((k) => [k, 'done' as Tone]));
    const labels = { rowLabels: vals.map((v, i) => `${i}:${v}`), colLabels: vals.map((v, i) => `${i}:${v}`) };
    let askedPad = false;
    let askedLast = false;
    let askedBest = false;
    r.step('pad', `Pad both ends with a 1: [${vals.join(', ')}]. The padding balloons are never burst; they only supply neighbours.`, [arrayView(vals, { title: 'padded balloons', tones: { 0: 'compare', [n - 1]: 'compare' } })], {});
    if (!askedPad) {
      askedPad = true;
      r.predict('pad', 'Why add a 1 on each side?', ['So a balloon at the edge still has a neighbour to multiply with', 'To make the array longer', 'Because zeros are not allowed'], 0, 'Bursting an edge balloon multiplies by a missing neighbour, which counts as 1.');
    }
    r.step('init', 'dp[left][right] = best coins from bursting every balloon strictly between positions left and right (left and right themselves stay). Intervals grow from short to long.', [dpTable2D(dp, { title: 'dp', ...labels })], {});
    for (let length = 2; length < n; length++) {
      for (let left = 0; left < n - length; left++) {
        r.op();
        const right = left + length;
        r.step('left', `Interval (${left}, ${right}): the balloons between them are ${vals.slice(left + 1, right).join(', ')}. Try each one as the LAST to burst.`, [dpTable2D(dp, { title: 'dp', ...labels, filling: [left, right], tones: tones() })], {});
        for (let last = left + 1; last < right; last++) {
          const coins = vals[left] * vals[last] * vals[right] + dp[left][last] + dp[last][right];
          if (!askedLast) {
            askedLast = true;
            r.step('last', `Suppose balloon ${last} (value ${vals[last]}) is burst LAST in (${left}, ${right}).`, [dpTable2D(dp, { title: 'dp', ...labels, filling: [left, right], deps: [[left, last], [last, right]], tones: tones() })], {});
            r.predict('last', `Balloon ${last} is the last one bursting between ${left} and ${right}. Which balloons are its neighbours at that moment?`, [`Balloons ${left} and ${right}, the interval ends`, 'Its original neighbours', 'The balloons left and right of it that are burst first'], 0, 'Everything else in the interval is already gone, so only the two fixed ends remain next to it. That is why thinking about the LAST burst makes the sub-problems independent.');
          }
          if (coins > dp[left][right]) {
            if (!askedBest) {
              askedBest = true;
              r.predictChoice('best', `Burst ${last} last: ${vals[left]} × ${vals[last]} × ${vals[right]} + dp[${left}][${last}] + dp[${last}][${right}] = ?`, String(coins), [String(coins - 1), String(vals[left] * vals[last] * vals[right]), String(coins + 1)], left + last, 'Coins for the last burst plus the best of the two independent halves on each side of it.');
            }
            dp[left][right] = coins;
          }
        }
        done.add(`${left},${right}`);
        r.step('best', `dp[${left}][${right}] = ${dp[left][right]}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], { value: dp[left][right] });
      }
    }
    const res = dp[0][n - 1];
    r.step('done', `The most coins you can collect is ${res}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: { ...tones(), [`0,${n - 1}`]: 'found' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ nums }) {
    const memo = new Map<string, number>();
    const go = (state: number[]): number => {
      if (!state.length) return 0;
      const key = state.join(',');
      if (memo.has(key)) return memo.get(key) as number;
      let best = 0;
      for (let i = 0; i < state.length; i++) best = Math.max(best, (state[i - 1] ?? 1) * state[i] * (state[i + 1] ?? 1) + go([...state.slice(0, i), ...state.slice(i + 1)]));
      memo.set(key, best);
      return best;
    };
    return go(nums);
  },
});

export default problem({
  summary: 'You have a row of balloons, each with a number on it. Bursting balloon i earns (number on its left neighbour) × (its own number) × (number on its right neighbour); a missing neighbour counts as 1. After a burst the neighbours close up. Find the largest total you can earn by bursting all balloons in the best order.',
  example: ['[3, 1, 4]', '28', 'Burst the 1 first (3·1·4 = 12), then the 3 (1·3·4 = 12), then the 4 (1·4·1 = 4).'],
  pattern: ['dp-2d', ['dp-2d', 'backtracking', 'divide-conquer', 'greedy'], 'Think about the LAST balloon to burst in an interval: its neighbours are then the interval’s ends, and the balloons on each side are independent sub-problems. A table over intervals holds the best for each.', {
    backtracking: 'Trying every order is factorial.',
    'divide-conquer': 'Splitting by the last balloon is divide and conquer, and caching the intervals makes it DP.',
    greedy: 'Bursting the smallest balloon first fails in general.',
  }],
  hints: [
    'If you choose the FIRST balloon to burst, the remaining problem is awkward. What changes if you choose the LAST one?',
    'When balloon k is the last in an interval (l, r), who are its neighbours? Are the two sides independent?',
    'Pad with 1s. dp[l][r] = max over k in (l, r) of vals[l]·vals[k]·vals[r] + dp[l][k] + dp[k][r]. Fill by increasing interval length.',
  ],
  insight: 'Choose the last balloon to burst in an interval: its neighbours are fixed, and the two sides do not interact.',
  brute: 'Try all orders: O(n!).',
  optimal: 'Interval DP: O(n³) time, O(n²) space.',
  walk: ['vals = [1] + nums + [1]; dp is n × n of zeros.', 'For length from 2 to n − 1 and each left, right = left + length.', 'For every last in (left, right): coins = vals[left]·vals[last]·vals[right] + dp[left][last] + dp[last][right].', 'dp[left][right] = max of those; the answer is dp[0][n − 1].'],
  edge: ['A single balloon.', 'Zeros in the list.', 'Equal values.', 'Remember that the padded 1s are never burst.'],
  works: ['In an optimal order for the interval, some balloon is burst last; at that moment it sits between the two ends, and the earlier bursts on each side happen entirely within their own side.', 'Trying every candidate for "last" covers all optimal orders.'],
  time: ['O(n³)', 'Intervals × choices of the last balloon.'],
  space: ['O(n²)', 'The table.'],
  solution,
  cases,
  sig: 'def max_coins(nums):\n    # largest total from bursting all balloons (bursting i earns left × nums[i] × right)\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
