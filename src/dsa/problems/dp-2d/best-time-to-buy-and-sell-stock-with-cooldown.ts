import type { Tone } from '@/engine/types';
import { arrayView, dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './best-time-to-buy-and-sell-stock-with-cooldown.py?raw';
import cases from './best-time-to-buy-and-sell-stock-with-cooldown.cases.json';

const fmt = (v: number) => (v === -Infinity ? '−∞' : v);

const viz = vizOf<{ prices: number[] }>({
  id: 'best-time-to-buy-and-sell-stock-with-cooldown',
  title: 'Best Time to Buy and Sell Stock with Cooldown',
  solution,
  inputs: [{ key: 'prices', label: 'price each day', kind: 'numbers', default: [2, 6, 1, 5, 3, 8], maxItems: 10 }],
  presets: [
    { label: 'Cooldown bites', input: { prices: [2, 6, 1, 5, 3, 8] } },
    { label: 'Two peaks', input: { prices: [1, 5, 1, 5, 1, 5] } },
    { label: 'Falling', input: { prices: [9, 7, 4, 1] } },
    { label: 'Empty', input: { prices: [] } },
  ],
  validate: ({ prices }) => (prices.some((p) => p === null || !Number.isFinite(p) || p < 0) ? 'Prices must be numbers ≥ 0' : null),
  run({ prices }) {
    const r = new TraceRecorder(solution);
    let hold = -Infinity;
    let sold = 0;
    let rest = 0;
    const table: number[][] = [[], [], []];
    const rows = ['hold', 'sold today', 'rest (free)'];
    const view = (day = -1) => [
      arrayView(prices, { title: 'prices', pointers: day >= 0 ? { day } : {}, tones: Object.fromEntries(prices.map((_, k) => [k, (k === day ? 'active' : k < day ? 'done' : 'default') as Tone])) }),
      dpTable2D(table.map((row, i) => (row.length ? row.map(fmt) : [hold, sold, rest].map(fmt).slice(i, i + 1))), { title: 'best profit in each state, per day', rowLabels: rows, colLabels: table[0].length ? table[0].map((_, k) => `day ${k}`) : ['start'] }),
    ];
    r.step('init', 'Three states: hold (I own a share), sold (I sold today, so tomorrow is a forced rest), rest (I own nothing and may buy). Profit so far: hold = −∞ (impossible yet), sold = 0, rest = 0.', view(), {});
    if (!prices.length) {
      r.step('done', 'No days: profit 0.', view(), { result: 0 });
      return { frames: r.frames, result: 0 };
    }
    let askedSell = false;
    let askedBuy = false;
    for (let i = 0; i < prices.length; i++) {
      r.op();
      const price = prices[i];
      const prevSold = sold;
      const nSold = hold + price;
      const nHold = Math.max(hold, rest - price);
      const nRest = Math.max(rest, prevSold);
      r.step('loop', `Day ${i}, price ${price}. sold = hold + price = ${fmt(hold)} + ${price}; hold = max(hold, rest − price) = max(${fmt(hold)}, ${rest} − ${price}); rest = max(rest, yesterday's sold) = max(${rest}, ${prevSold}).`, view(i), { i });
      if (!askedSell && i >= 1 && nSold > -Infinity) {
        askedSell = true;
        r.predictChoice('sell', `Today you sell the share you hold (hold = ${fmt(hold)}) at price ${price}. What is the new "sold" value?`, String(nSold), [String(hold - price), String(rest + price), String(nSold + 1)], i, 'Selling adds today’s price to the profit of the best plan that was holding.');
      }
      sold = nSold;
      hold = nHold;
      rest = nRest;
      table[0].push(hold);
      table[1].push(sold);
      table[2].push(rest);
      if (!askedBuy && i === 1) {
        askedBuy = true;
        r.step('buy', `After day ${i}: hold = ${fmt(hold)}, sold = ${fmt(sold)}, rest = ${fmt(rest)}.`, view(i), {});
        r.predict('buy', 'To buy today you must come from the "rest" state, not from "sold". Why?', ['A sale yesterday forces a cooldown day before buying again', 'Selling and buying are the same', 'It is cheaper'], 0, 'The cooldown rule: after selling you cannot buy the next day, so a purchase uses the profit of the plan that was resting.');
      } else {
        r.step('buy', `After day ${i}: hold = ${fmt(hold)}, sold = ${fmt(sold)}, rest = ${fmt(rest)}.`, view(i), {});
      }
    }
    const res = Math.max(sold, rest);
    r.step('done', `Best profit = max(sold, rest) = ${res}. (Ending while still holding a share can never be better.)`, view(prices.length - 1), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ prices }) {
    const n = prices.length;
    const go = (day: number, holding: boolean, cooling: boolean): number => {
      if (day >= n) return 0;
      if (cooling) return go(day + 1, holding, false);
      let best = go(day + 1, holding, false);
      best = Math.max(best, holding ? prices[day] + go(day + 1, false, true) : -prices[day] + go(day + 1, true, false));
      return best;
    };
    return go(0, false, false);
  },
});

export default problem({
  summary: 'You are given the price of a share on each day. You may buy and sell as often as you like, holding at most one share at a time, but after selling you must wait one full day (a cooldown) before you can buy again. Find the largest total profit.',
  example: ['prices [1, 4, 3, 5]', '4', 'Selling on day 1 (profit 3) forces a rest on day 2, and buying on day 3 is pointless. Holding from day 0 to day 3 earns 5 − 1 = 4.'],
  pattern: ['dp-2d', ['dp-2d', 'greedy', 'dp-1d', 'dfs'], 'Each day is in one of three states (holding, just sold, free to buy), and the best profit in each state depends only on yesterday’s states. A state-by-day table captures the cooldown rule exactly.', {
    greedy: 'Greedy selling at every peak ignores the cooldown and loses profit.',
    'dp-1d': 'One value per day is not enough because the best plan depends on which state you are in.',
    dfs: 'Plain recursion over days and states repeats work; the table is its memoised form.',
  }],
  hints: [
    'What do you need to remember at the end of each day to decide what you may do tomorrow?',
    'Define three values: profit when holding, profit when you sold today, profit when you are resting with nothing. How is each computed from yesterday?',
    'sold = hold + price; hold = max(hold, rest − price); rest = max(rest, yesterday’s sold). Answer: max(sold, rest).',
  ],
  insight: 'Model the cooldown as a state: you can only buy from the "rest" state, and "sold" always flows into "rest" the next day.',
  brute: 'Recursion over every buy / sell / wait choice: exponential.',
  optimal: 'Three-state DP: O(n) time, O(1) space.',
  walk: ['hold = −∞, sold = 0, rest = 0.', 'For each price: prev_sold = sold; sold = hold + price; hold = max(hold, rest − price); rest = max(rest, prev_sold).', 'Return max(sold, rest).'],
  edge: ['No prices.', 'Falling prices (profit 0).', 'A single day.', 'The cooldown makes the second-best peak better than the nearest one.'],
  works: ['Every legal sequence of actions is a path through the three states, and each state’s best profit is the maximum over its allowed predecessors.', 'Never ending while holding is optimal because selling would add a non-negative price.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Three variables (a table of three rows if you draw it).'],
  solution,
  cases,
  sig: 'def max_profit(prices):\n    # buy / sell any number of times, one share at a time, one day of cooldown after each sale\n    pass\n',
  viz,
  fromArgs: ([prices]) => ({ prices }),
});
