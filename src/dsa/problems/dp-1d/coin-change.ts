import type { Tone } from '@/engine/types';
import { chipsView, dpTable1D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './coin-change.py?raw';
import cases from './coin-change.cases.json';

const viz = vizOf<{ coins: number[]; amount: number }>({
  id: 'coin-change',
  title: 'Coin Change',
  solution,
  inputs: [
    { key: 'coins', label: 'coin values (each can be used any number of times)', kind: 'numbers', default: [1, 6, 7], maxItems: 4 },
    { key: 'amount', label: 'amount to make (0 to 20)', kind: 'number', default: 12 },
  ],
  presets: [
    { label: 'Greedy fails', input: { coins: [1, 6, 7], amount: 12 } },
    { label: 'No way', input: { coins: [5, 10], amount: 3 } },
    { label: 'Single coin', input: { coins: [4], amount: 12 } },
    { label: 'Zero', input: { coins: [2], amount: 0 } },
  ],
  validate: ({ coins, amount }) => {
    if (!coins.length || coins.some((c) => c === null || !Number.isInteger(c) || c < 1)) return 'Coins must be whole numbers ≥ 1';
    return Number.isInteger(amount) && amount >= 0 && amount <= 20 ? null : 'The amount must be a whole number from 0 to 20';
  },
  run({ coins, amount }) {
    const r = new TraceRecorder(solution);
    const INF = amount + 1;
    const dp = [0, ...Array(amount).fill(INF)] as number[];
    const show = (arr: number[]) => arr.map((v) => (v === INF ? '∞' : v));
    const done = (upTo: number): Record<number, Tone> => Object.fromEntries(Array.from({ length: upTo + 1 }, (_, i) => [i, 'done' as Tone]));
    let askedFill = false;
    let askedGreedy = false;
    r.step('init', `dp[a] = fewest coins that add up to a. dp[0] = 0 (no coins needed); the rest start at ∞ ("not reachable yet"). Coins: ${coins.join(', ')}.`, [chipsView(coins, { title: 'coins' }), dpTable1D(show(dp), { title: 'dp (fewest coins)' })], {});
    if (amount === 0) {
      r.step('done', 'The amount is 0: no coins are needed.', [dpTable1D(show(dp), { title: 'dp', tones: { 0: 'found' } })], { result: 0 });
      return { frames: r.frames, result: 0 };
    }
    for (let a = 1; a <= amount; a++) {
      r.op();
      const opts = coins.filter((c) => c <= a).map((c) => ({ c, v: dp[a - c] + 1 }));
      r.step('loop', `Amount ${a}: try each coin ${opts.length ? 'that fits' : '(none fits)'}: ${opts.map((o) => `${o.c} → dp[${a - o.c}] + 1 = ${o.v >= INF ? '∞' : o.v}`).join(', ') || '—'}.`, [dpTable1D(show(dp), { title: 'dp (fewest coins)', filling: a, deps: opts.map((o) => a - o.c), tones: done(a - 1) })], { a });
      if (!askedFill && opts.length > 1 && opts.some((o) => o.v < INF)) {
        askedFill = true;
        const best = Math.min(...opts.map((o) => o.v));
        r.predictChoice('fill', `For amount ${a} the options are ${opts.map((o) => (o.v >= INF ? '∞' : o.v)).join(', ')}. What is dp[${a}]?`, best >= INF ? '∞' : String(best), [String(best + 1), String(Math.max(...opts.map((o) => (o.v >= INF ? 0 : o.v))) + 1), String(best + 2)], a, 'Take the coin that leaves the cheapest remainder: the minimum over the options.');
      }
      for (const o of opts) dp[a] = Math.min(dp[a], o.v);
      r.step('fill', dp[a] >= INF ? `No coin leads to a reachable amount: dp[${a}] stays ∞.` : `dp[${a}] = ${dp[a]}.`, [dpTable1D(show(dp), { title: 'dp (fewest coins)', tones: done(a) })], { value: dp[a] });
    }
    if (!askedGreedy) {
      askedGreedy = true;
      const greedy = (() => {
        let left = amount;
        let n = 0;
        for (const c of [...coins].sort((x, y) => y - x)) {
          n += Math.floor(left / c);
          left %= c;
        }
        return left === 0 ? n : -1;
      })();
      const real = dp[amount] >= INF ? -1 : dp[amount];
      if (greedy !== real) r.predict('greedy', 'Taking the biggest coin as often as possible first (greedy) gives a different answer here. Which one is the true fewest?', ['The DP table value: it checks every coin at every amount', 'The greedy value'], 0, 'Greedy can run out of options or use too many coins; the DP tries every coin for every amount.');
    }
    const res = dp[amount] >= INF ? -1 : dp[amount];
    r.step('done', res === -1 ? `Amount ${amount} cannot be made: −1.` : `The fewest coins for ${amount} is ${res}.`, [dpTable1D(show(dp), { title: 'dp (fewest coins)', tones: { ...done(amount - 1), [amount]: res === -1 ? 'compare' : 'found' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ coins, amount }) {
    const INF = amount + 1;
    const dp = [0, ...Array(amount).fill(INF)] as number[];
    for (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);
    return dp[amount] === INF ? -1 : dp[amount];
  },
});

export default problem({
  summary: 'You have coins of several values, each available in unlimited quantity. Find the fewest coins that add up to exactly a given amount, or −1 if it is impossible.',
  example: ['coins [2, 5], amount 9', '3', '2 + 2 + 5 uses three coins; no pair of coins reaches 9.'],
  pattern: ['dp-1d', ['dp-1d', 'greedy', 'backtracking', 'bfs'], 'The fewest coins for amount a is one coin plus the fewest for a − coin, minimised over the coins. Fill amounts from small to large.', {
    greedy: 'Taking the largest coin first fails for sets like {1, 6, 7}.',
    backtracking: 'Trying all combinations is exponential.',
    bfs: 'BFS over amounts works and is the same computation, layer by layer.',
  }],
  hints: [
    'What is the answer for amount 0? For amount a, what could the last coin be?',
    'If the last coin is c, how many coins did you need before it?',
    'dp[a] = min(dp[a − c] + 1) over coins c ≤ a, with dp[0] = 0 and "infinity" meaning unreachable.',
  ],
  insight: 'Try every coin as the last one: dp[a] = 1 + the best of dp[a − c].',
  brute: 'Recursion over every combination: exponential.',
  optimal: 'DP: O(amount × coins) time, O(amount) space.',
  walk: ['dp = [0] + [amount + 1] * amount (amount + 1 stands for "impossible").', 'For a in 1 … amount, for each coin c ≤ a: dp[a] = min(dp[a], dp[a − c] + 1).', 'Return −1 if dp[amount] is still amount + 1, else dp[amount].'],
  edge: ['Amount 0 (0 coins).', 'A coin larger than the amount.', 'No combination works.', 'Greedy-looking choices that fail.'],
  works: ['Any solution for a ends with some coin c, and the rest is a solution for a − c. The minimum over c is optimal because the sub-problem is also optimal.', 'Smaller amounts are always filled first.'],
  time: ['O(amount · coins)', 'Two nested loops.'],
  space: ['O(amount)', 'The table.'],
  solution,
  cases,
  sig: 'def coin_change(coins, amount):\n    # fewest coins that sum to amount (unlimited coins of each value), or -1\n    pass\n',
  viz,
  fromArgs: ([coins, amount]) => ({ coins, amount }),
});
