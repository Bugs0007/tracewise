import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertInt, assertIntList, dpRow, type DpCell } from '@/content/lib/dp';

const code = `
def coin_change(coins, amount):
    INF = float('inf')
    dp = [0] + [INF] * amount                    #@init
    for a in range(1, amount + 1):               #@loop
        for c in coins:                          #@coin
            if c <= a:                           #@fits
                dp[a] = min(dp[a], dp[a - c] + 1)    #@relax
    return dp[amount] if dp[amount] != INF else -1   #@done
`;

interface In {
  coins: number[];
  amount: number;
}

const viz: VizDef<In> = {
  id: 'dp-coin-change',
  title: 'Coin change (fewest coins)',
  code,
  language: 'python',
  inputs: [
    { key: 'coins', label: 'Coin values', kind: 'numbers', default: [1, 3, 4], maxItems: 4, help: 'Whole numbers 1..12' },
    { key: 'amount', label: 'Amount', kind: 'number', default: 6, help: 'Whole number from 0 to 12' },
  ],
  presets: [
    { label: 'Greedy fails (6)', input: { coins: [1, 3, 4], amount: 6 } },
    { label: 'Impossible', input: { coins: [2], amount: 5 } },
    { label: 'Amount 0', input: { coins: [1, 2, 5], amount: 0 } },
    { label: 'Classic 11', input: { coins: [1, 2, 5], amount: 11 } },
  ],
  run({ coins, amount }) {
    assertIntList('Coins', coins, { max: 4, lo: 1, hi: 12 });
    assertInt('Amount', amount, 0, 12);
    const r = new Recorder(code);
    const dp: number[] = [0, ...Array(amount).fill(Infinity)];
    const done = new Set<number>([0]);
    const panels = (cur?: number, coinIdx?: number, from?: number, relaxed = false) => {
      const tones: Record<number, Tone> = {};
      for (const i of done) tones[i] = 'done';
      if (cur !== undefined) tones[cur] = relaxed ? 'swap' : 'active';
      if (from !== undefined) tones[from] = 'compare';
      const arrows = cur !== undefined && from !== undefined ? [{ from: [0, from] as [number, number], to: [0, cur] as [number, number] }] : [];
      const coinTones: Record<number, Tone> = {};
      if (coinIdx !== undefined) coinTones[coinIdx] = 'active';
      return [
        dpRow(dp as DpCell[], { title: 'dp[a] = fewest coins that make amount a', tones: tones as Record<string, Tone>, arrows, rowLabels: ['min'] }),
        { type: 'array' as const, title: 'Coins', values: coins, tones: coinTones, hideIndex: true },
      ];
    };
    r.step('init', `dp[0] = 0 (zero coins make 0); every other amount starts at ∞ (unreachable)`, panels(), { amount, coins: `[${coins.join(', ')}]` });
    if (amount === 0) r.step('loop', 'amount is 0, so range(1, 1) is empty: there is nothing to fill', panels(), { amount });
    for (let a = 1; a <= amount; a++) {
      for (let k = 0; k < coins.length; k++) {
        const c = coins[k];
        r.op();
        if (c > a) {
          r.step('fits', `Coin ${c} > amount ${a}: too big, skip`, panels(a, k), { a, c });
          continue;
        }
        const cand = dp[a - c] + 1;
        const before = dp[a];
        const candText = Number.isFinite(dp[a - c]) ? String(cand) : '∞';
        if (cand < before) {
          dp[a] = cand;
          r.step('relax', `a=${a}, coin ${c}: dp[${a - c}] + 1 = ${candText} beats ${Number.isFinite(before) ? before : '∞'} → dp[${a}] = ${cand}`, panels(a, k, a - c, true), { a, c, 'dp[a-c]': dp[a - c] });
        } else {
          r.step('relax', `a=${a}, coin ${c}: dp[${a - c}] + 1 = ${candText}, not better than ${Number.isFinite(before) ? before : '∞'}`, panels(a, k, a - c), { a, c, 'dp[a-c]': dp[a - c] });
        }
      }
      done.add(a);
    }
    const result = Number.isFinite(dp[amount]) ? dp[amount] : -1;
    r.step('done', result === -1 ? `dp[${amount}] is still ∞ → no combination works, return -1` : `dp[${amount}] = ${result} → fewest coins`, panels(amount), { amount, result });
    return { frames: r.frames, result };
  },
  reference({ coins, amount }) {
    // coin-outer ordering (unbounded knapsack form): independent of the viz's amount-outer loops
    const best = Array(amount + 1).fill(Infinity);
    best[0] = 0;
    for (const c of coins) for (let a = c; a <= amount; a++) best[a] = Math.min(best[a], best[a - c] + 1);
    return Number.isFinite(best[amount]) ? best[amount] : -1;
  },
};

const tests = [
  { args: [[1, 2, 5], 11], expected: 3 },
  { args: [[2], 3], expected: -1, name: 'impossible' },
  { args: [[1], 0], expected: 0, name: 'amount 0' },
  { args: [[1, 3, 4], 6], expected: 2, name: 'greedy fails' },
  { args: [[3, 7], 11], expected: -1, name: 'no combination' },
  { args: [[2, 5], 7], expected: 2 },
  { args: [[5], 10], expected: 2 },
];

const unit: Unit = {
  id: 'dp-coin-change',
  hook: 'The standard "greedy is not enough" problem. It forces you to define an unreachable state (infinity) and shows why a table of subproblems beats picking the biggest coin first.',
  predict: {
    prompt: 'Coins are [1, 3, 4] and the amount is 6. Greedy (always take the biggest coin that fits) gives 4+1+1. What is the true minimum number of coins?',
    options: ['1', '2', '3', '4'],
    answer: 1,
    explain: '3 + 3 = 6 uses two coins. Greedy used three. DP tries every coin for every sub-amount: dp[6] = min(dp[5]+1, dp[3]+1, dp[2]+1) = min(3, 2, 3) = 2.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[a]` = fewest coins that sum to exactly a. Amount 0 needs 0 coins.',
      'Recurrence: `dp[a] = min(dp[a - c] + 1)` over every coin c with c <= a (use one coin c, then solve the rest).',
      'Unreachable amounts start at infinity. `min` then ignores them, and `inf + 1` stays infinity.',
      'Order: increasing amount, so dp[a - c] is already final. Answer -1 if dp[amount] is still infinity.',
      'Greedy fails for general coin systems ([1, 3, 4] and 6), which is why the table is needed.',
    ],
    complexity: { time: 'O(amount × coins)', space: 'O(amount)' },
    pitfalls: ['Initialising dp with 0 (min picks 0 forever)', 'Using a huge finite number and then adding to it past the limit', 'Forgetting to convert infinity to -1', 'Not guarding c <= a (negative index wraps around in Python)'],
  },
  practice: {
    language: 'python',
    fnName: 'coin_change',
    statement: 'Given coin values `coins` (unlimited supply of each) and a target `amount`, return the fewest coins that sum exactly to `amount`, or -1 if impossible.',
    signature: 'def coin_change(coins, amount):',
    solution: `def coin_change(coins, amount):
    INF = float('inf')
    dp = @@[0]@@ + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if @@c <= a@@:
                dp[a] = @@min(dp[a], dp[a - c] + 1)@@
    return @@dp[amount]@@ if dp[amount] != INF else @@-1@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'coin_change',
    statement: 'This always returns 0 (or the wrong count) even when coins are needed. Find the bug.',
    buggy: `def coin_change(coins, amount):
    INF = float('inf')
    dp = [0] * (amount + 1)
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)
    return dp[amount] if dp[amount] != INF else -1`,
    fixed: `def coin_change(coins, amount):
    INF = float('inf')
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)
    return dp[amount] if dp[amount] != INF else -1`,
    tests,
    bugType: 'bad initial value for min',
    hint: 'What is min(dp[a], something) when dp[a] starts at 0?',
    explanation: 'Taking the minimum only works if every unknown cell starts at infinity, meaning "no way found yet". Starting them at 0 means min can never go up, so every amount looks free. Only dp[0] should be 0.',
  },
  boss: {
    title: 'Coin Change II (count the ways)',
    statement: 'Given a target `amount` and a list of coin values `coins` (unlimited supply of each), return the number of different combinations that make exactly `amount`. Order does not matter: 1+2 and 2+1 are the same combination. Return 1 for amount 0 and 0 if it is impossible.',
    language: 'python',
    fnName: 'count_ways',
    starter: `def count_ways(amount, coins):
    # your code here
    pass
`,
    solution: `def count_ways(amount, coins):
    dp = [0] * (amount + 1)
    dp[0] = 1
    for c in coins:
        for a in range(c, amount + 1):
            dp[a] += dp[a - c]
    return dp[amount]`,
    tests: [
      { args: [5, [1, 2, 5]], expected: 4 },
      { args: [3, [2]], expected: 0, name: 'impossible' },
      { args: [10, [10]], expected: 1 },
      { args: [0, [7]], expected: 1, name: 'amount 0' },
      { args: [4, [1, 2, 3]], expected: 4 },
      { args: [6, [1, 2]], expected: 4 },
    ],
    hints: ['Counting combinations, not minimising. dp[a] = number of ways to make a, with dp[0] = 1.', 'Put the coin loop OUTSIDE the amount loop; that way each combination is counted once, in coin order, instead of as every permutation.'],
    combines: ['dp-coin-change', 'dp-climbing-stairs'],
  },
  quiz: [
    {
      prompt: 'Why must dp[a - c] be computed before dp[a] in the amount-outer loop?',
      options: ['Python evaluates left to right', 'dp[a] is built from the already-final smaller amount a - c', 'To save memory', 'Coins are sorted'],
      answer: 1,
      explain: 'Amounts are filled in increasing order so that every sub-answer a recurrence reads is already final.',
    },
  ],
};

export default unit;
