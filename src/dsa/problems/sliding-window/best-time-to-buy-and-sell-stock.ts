import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './best-time-to-buy-and-sell-stock.py?raw';
import cases from './best-time-to-buy-and-sell-stock.cases.json';

const viz = vizOf<{ prices: number[] }>({
  id: 'best-time-to-buy-and-sell-stock',
  title: 'Best Time to Buy and Sell Stock',
  solution,
  inputs: [{ key: 'prices', label: 'daily prices', kind: 'numbers', default: [8, 5, 9, 3, 6, 10, 4], maxItems: 14 }],
  presets: [
    { label: 'Buy low, sell later', input: { prices: [8, 5, 9, 3, 6, 10, 4] } },
    { label: 'Only falling', input: { prices: [9, 7, 4, 2] } },
    { label: 'Rising', input: { prices: [1, 2, 3, 4, 5] } },
    { label: 'Empty', input: { prices: [] } },
  ],
  run({ prices }) {
    const r = new TraceRecorder(solution);
    let lowest = Infinity;
    let lowAt = -1;
    let best = 0;
    let sellAt = -1;
    const view = (i: number, hot: Tone | null) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      if (lowAt >= 0) tones[lowAt] = 'frontier';
      if (sellAt >= 0) tones[sellAt] = 'found';
      if (hot && i < prices.length) tones[i] = hot;
      return [arrayView(prices, { title: 'price each day', tones, pointers: i < prices.length ? { p: i } : undefined }), hashMapView({ lowest: lowest === Infinity ? '∞' : lowest, best }, { title: 'buy at the lowest so far' })];
    };
    r.step('init', 'lowest is the cheapest price seen so far. Before any day, it is infinite.', view(0, null), { lowest: '∞' });
    r.step('best', 'best is the largest profit found so far.', view(0, null), { best });
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      r.op();
      const outcome = p < lowest ? 'low' : p - lowest > best ? 'better' : 'same';
      r.step('loop', `Day ${i}: price ${p}.`, view(i, 'active'), { i, p, lowest: lowest === Infinity ? '∞' : lowest, best });
      if (i > 0) r.predict(outcome, `Price ${p}; the lowest so far is ${lowest}; best profit is ${best}. What does this day do?`, ['A new lowest price: remember it', `A better profit (${p} − ${lowest}): update best`, 'Nothing changes'], outcome === 'low' ? 0 : outcome === 'better' ? 1 : 2, outcome === 'low' ? 'A cheaper day is a better day to buy.' : outcome === 'better' ? 'Selling today after buying at the lowest beats the previous best.' : 'Not cheaper, and selling today would not beat best.');
      if (outcome === 'low') {
        lowest = p;
        lowAt = i;
        r.step('newLow', `${p} is the cheapest so far: buy here (lowest = ${p}).`, view(i, 'active'), { lowest });
      } else if (outcome === 'better') {
        best = p - lowest;
        sellAt = i;
        r.step('update', `Selling today earns ${p} − ${lowest} = ${best}: a new best.`, view(i, 'found'), { best });
      } else {
        r.step('isBetter', `Selling today would earn ${p - lowest}, which does not beat ${best}. Move on.`, view(i, 'compare'), { best });
      }
    }
    r.step('done', `The best profit is ${best}${best === 0 ? ' (no profitable trade exists)' : ''}.`, view(prices.length, null), { best });
    return { frames: r.frames, result: best };
  },
  reference({ prices }) {
    let best = 0;
    for (let i = 0; i < prices.length; i++) for (let j = i + 1; j < prices.length; j++) best = Math.max(best, prices[j] - prices[i]);
    return best;
  },
});

export default problem({
  summary: 'You get one price per day for a stock. Buy on one day and sell on a later day to make as much profit as possible. If no trade can make money, the answer is 0.',
  example: ['prices = [7, 2, 6, 1, 9, 3]', '8', 'Buy at 1, sell at 9. Buying at 2 and selling at 6 would only make 4.'],
  pattern: ['sliding-window', ['sliding-window', 'dp-1d', 'binary-search', 'monotonic-stack'], 'Keep the best buy price seen so far (the left edge of the window) and test each new day as the sell day. One pass, constant memory.', {
    'dp-1d': 'The one-pass solution is really a tiny DP (the best buy so far), but it is usually taught as a moving window of "buy low, then look right".',
    'binary-search': 'Prices are not sorted, so there is nothing to bisect.',
    'monotonic-stack': 'A stack would store more than needed; one running minimum is enough.',
  }],
  hints: [
    'For a given sell day, which buy day would be best? Think about all the days before it.',
    'You only need the cheapest price so far, not the whole history. Update it as you go.',
    'For each day, compute the profit of selling today after buying at the cheapest earlier price, and keep the maximum.',
  ],
  insight: 'The best buy for any sell day is the cheapest price before it. Track that minimum while scanning.',
  brute: 'Try every buy/sell pair: O(n²) time.',
  optimal: 'One pass with a running minimum: O(n) time, O(1) space.',
  walk: ['Start with lowest = infinity and best = 0.', 'For each day, if the price is lower than lowest, it becomes the new lowest (it is a better day to buy).', 'Otherwise compute the profit price − lowest. If it beats best, update best.', 'After the last day best is the maximum profit (0 if prices only fell).'],
  edge: ['Empty input or a single day: nothing to trade, answer 0.', 'Strictly decreasing prices: 0.', 'The cheapest day is the last day: it cannot be used to buy.', 'Equal prices: profit 0.'],
  works: ['When a day is processed, lowest is the minimum of every earlier day, so price − lowest is the best profit achievable selling today.', 'Taking the maximum over all days covers every possible sell day, so no trade is missed.'],
  time: ['O(n)', 'One pass over the prices.'],
  space: ['O(1)', 'Two numbers.'],
  solution,
  cases,
  sig: 'def max_profit(prices):\n    # best profit from one buy then one later sell (0 if none)\n    pass\n',
  viz,
  fromArgs: ([prices]) => ({ prices }),
});
