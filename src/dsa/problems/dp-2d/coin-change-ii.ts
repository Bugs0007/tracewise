import { dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './coin-change-ii.py?raw';
import cases from './coin-change-ii.cases.json';

const viz = vizOf<{ amount: number; coins: number[] }>({
  id: 'coin-change-ii',
  title: 'Coin Change II',
  solution,
  inputs: [
    { key: 'amount', label: 'amount (0 to 12)', kind: 'number', default: 6 },
    { key: 'coins', label: 'coin values (unlimited of each)', kind: 'numbers', default: [1, 2, 3], maxItems: 3 },
  ],
  presets: [
    { label: 'Combinations', input: { amount: 6, coins: [1, 2, 3] } },
    { label: 'No way', input: { amount: 3, coins: [2] } },
    { label: 'Two coins', input: { amount: 9, coins: [3, 4] } },
    { label: 'Zero', input: { amount: 0, coins: [2] } },
  ],
  validate: ({ amount, coins }) => (!Number.isInteger(amount) || amount < 0 || amount > 12 ? 'The amount must be a whole number from 0 to 12' : !coins.length || coins.some((c) => c === null || !Number.isInteger(c) || c < 1) ? 'Coins must be whole numbers ≥ 1' : null),
  run({ amount, coins }) {
    const r = new TraceRecorder(solution);
    const history: number[][] = [[1, ...Array(amount).fill(0)]];
    let dp = [...history[0]];
    const labels = ['start', ...coins.map((c) => `after coin ${c}`)];
    const view = (cur: number[], filling?: [number, number], deps: [number, number][] = []) => [dpTable2D([...history.slice(0, -1), cur], { title: 'dp[a] = number of combinations making a (each row is after one more coin kind)', rowLabels: labels.slice(0, history.length), colLabels: Array.from({ length: amount + 1 }, (_, a) => String(a)), filling, deps })];
    r.step('init', 'dp[0] = 1: there is one way to make 0 (take nothing). Every other amount starts at 0 ways.', view(dp), {});
    let askedOrder = false;
    let askedAdd = false;
    if (amount === 0) {
      r.step('done', 'Amount 0 has exactly one combination: the empty one.', view(dp), { result: 1 });
      return { frames: r.frames, result: 1 };
    }
    for (const coin of coins) {
      r.op();
      dp = [...dp];
      history.push(dp);
      const row = history.length - 1;
      r.step('coin', `Now allow coin ${coin}: for every amount a ≥ ${coin}, add the ways to make a − ${coin} (using coins up to ${coin}).`, view(dp), { coin });
      if (!askedOrder) {
        askedOrder = true;
        r.predict('coin', 'The coins are in the OUTER loop and the amounts in the inner loop. What does that count?', ['Combinations: {1, 2} and {2, 1} are the same', 'Orders: 1 + 2 and 2 + 1 are different', 'Only single coins'], 0, 'Handling one coin kind at a time means a combination is always built in coin order, so each multiset is counted once.');
      }
      for (let a = coin; a <= amount; a++) {
        const before = dp[a];
        const add = dp[a - coin];
        if (!askedAdd && add > 0) {
          askedAdd = true;
          r.step('amount', `a = ${a}: dp[${a}] currently ${before}; dp[${a - coin}] = ${add}.`, view(dp, [row, a], [[row, a - coin], ...(row > 0 ? ([[row - 1, a]] as [number, number][]) : [])]), {});
          r.predictChoice('add', `dp[${a}] is ${before} and dp[${a - coin}] is ${add}. What is dp[${a}] after this coin?`, String(before + add), [String(before), String(add), String(before + add + 1)], a, `Every combination for ${a - coin} can be completed by one more coin ${coin}, so add them to the combinations that already exist.`);
        }
        dp[a] += add;
        history[row] = dp;
        r.step('add', add > 0 ? `dp[${a}] += dp[${a - coin}] → ${dp[a]}.` : `dp[${a}] stays ${dp[a]} (dp[${a - coin}] = 0).`, view(dp, [row, a], [[row, a - coin]]), { a });
      }
    }
    r.step('done', `${dp[amount]} combination${dp[amount] === 1 ? '' : 's'} make ${amount}.`, view(dp), { result: dp[amount] });
    return { frames: r.frames, result: dp[amount] };
  },
  reference({ amount, coins }) {
    const dp = [1, ...Array(amount).fill(0)] as number[];
    for (const c of coins) for (let a = c; a <= amount; a++) dp[a] += dp[a - c];
    return dp[amount];
  },
});

export default problem({
  summary: 'Given coin values (unlimited quantity of each) and a target amount, count how many different combinations of coins add up to the amount. Two combinations are different if some coin value is used a different number of times; the order of the coins does not matter.',
  example: ['coins [1, 2], amount 3', '2', '1+1+1 and 1+2. (2+1 is the same combination as 1+2.)'],
  pattern: ['dp-2d', ['dp-2d', 'dp-1d', 'backtracking', 'greedy'], 'Count combinations by letting coins in one kind at a time: after considering the first k coin kinds, dp[a] counts combinations that use only those. The outer loop over coins is what stops orderings from being counted separately.', {
    'dp-1d': 'It compresses to one line, but the loop order (coins outside, amounts inside) comes from the 2-D table over (coins, amounts).',
    backtracking: 'Listing all combinations is exponential when we only need the count.',
    greedy: 'Greedy picks one combination; we need the number of all of them.',
  }],
  hints: [
    'How is this different from the fewest-coins problem?',
    'If you allowed only the first k coin kinds, how many ways would there be to make a? How does the (k+1)-th kind change it?',
    'dp[0] = 1. For each coin, for a from coin to amount: dp[a] += dp[a − coin]. The coin loop must be the outer one.',
  ],
  insight: 'Process one coin kind at a time; dp[a] then counts combinations, not sequences.',
  brute: 'Recursion over (coin index, remaining amount): exponential without memory.',
  optimal: 'DP: O(coins · amount) time, O(amount) space.',
  walk: ['dp = [1] + [0] * amount.', 'For each coin: for a in range(coin, amount + 1): dp[a] += dp[a − coin].', 'Return dp[amount].'],
  edge: ['Amount 0 (1 combination).', 'No combination.', 'A coin larger than the amount.', 'Swapping the loops would count orders (a classic mistake).'],
  works: ['After processing the first k coin kinds, dp[a] counts multisets using only those kinds.', 'Adding kind k + 1 lets any multiset use it any number of times; the in-place update dp[a] += dp[a − coin] does exactly that.'],
  time: ['O(coins · amount)', 'Two loops.'],
  space: ['O(amount)', 'One line (the table drawn here has one row per coin).'],
  solution,
  cases,
  sig: 'def change(amount, coins):\n    # number of combinations of coins that sum to amount\n    pass\n',
  viz,
  fromArgs: ([amount, coins]) => ({ amount, coins }),
});
