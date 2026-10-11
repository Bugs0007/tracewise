import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { arrayView, graphView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './cheapest-flights-within-k-stops.py?raw';
import cases from './cheapest-flights-within-k-stops.cases.json';

const e = (a: number, b: number, w: number): EdgeSpec => ({ from: String(a), to: String(b), w });
const fmt = (x: number) => (x === Infinity ? '∞' : String(x));

const viz = vizOf<{ n: number; edges: EdgeSpec[]; src: number; dst: number; k: number }>({
  id: 'cheapest-flights-within-k-stops',
  title: 'Cheapest Flights Within K Stops',
  solution,
  inputs: [
    { key: 'n', label: 'cities (0 … n−1)', kind: 'number', default: 4 },
    { key: 'edges', label: 'flights a->b:price', kind: 'edges', default: [e(0, 1, 80), e(1, 2, 20), e(0, 2, 150), e(2, 3, 30)], maxItems: 8 },
    { key: 'src', label: 'from city', kind: 'number', default: 0 },
    { key: 'dst', label: 'to city', kind: 'number', default: 3 },
    { key: 'k', label: 'max stops in between', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'One stop allowed', input: { n: 4, edges: [e(0, 1, 80), e(1, 2, 20), e(0, 2, 150), e(2, 3, 30)], src: 0, dst: 3, k: 1 } },
    { label: 'Two stops allowed', input: { n: 4, edges: [e(0, 1, 80), e(1, 2, 20), e(0, 2, 150), e(2, 3, 30)], src: 0, dst: 3, k: 2 } },
    { label: 'No route', input: { n: 3, edges: [e(0, 1, 5)], src: 0, dst: 2, k: 3 } },
    { label: 'Direct only', input: { n: 3, edges: [e(0, 1, 10), e(1, 2, 10), e(0, 2, 50)], src: 0, dst: 2, k: 0 } },
  ],
  validate: ({ n, edges, src, dst, k }) => {
    if (!Number.isInteger(n) || n < 2 || n > 6) return 'Use 2 to 6 cities';
    if (![src, dst].every((c) => Number.isInteger(c) && c >= 0 && c < n) || src === dst) return `src and dst must be different cities from 0 to ${n - 1}`;
    if (!Number.isInteger(k) || k < 0 || k > 4) return 'k must be a whole number from 0 to 4';
    return edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) >= n || Number(x.to) >= n || !(x.w !== undefined && x.w >= 1)) ? `Flights look like 0->1:80 with cities 0 to ${n - 1}` : null;
  },
  run({ n, edges, src, dst, k }) {
    const r = new TraceRecorder(solution);
    const ids = Array.from({ length: n }, (_, i) => String(i));
    let prices = Array(n).fill(Infinity) as number[];
    let nxt: number[] | null = null;
    let round = 0;
    const tones: Record<string, Tone> = {};
    const edgeTones: Record<string, Tone> = {};
    let askedCopy = false;
    let askedRound = false;
    let askedRelax = false;
    const view = () => [
      graphView(ids, edges, { title: 'flights (label = price; badge = cheapest known price from the start)', directed: true, layout: 'circle', size: { width: 380, height: 270 }, tones, edgeTones, badges: Object.fromEntries(ids.map((id, i) => [id, fmt(prices[i])])) }),
      arrayView(prices.map(fmt), { title: `prices after ${round} flight${round === 1 ? '' : 's'}`, indexLabels: ids }),
      ...(nxt ? [arrayView(nxt.map(fmt), { title: 'prices being built for this round (nxt)', indexLabels: ids })] : []),
    ];
    prices[src] = 0;
    tones[String(src)] = 'found';
    r.step('init', `prices[c] = cheapest known price from ${src} to c using the flights allowed so far. At the start only ${src} is known (price 0).`, view(), {});
    const rounds = k + 1;
    if (!askedRound) {
      askedRound = true;
      r.predictChoice('round', `With at most ${k} stop${k === 1 ? '' : 's'}, how many flights can the trip use, and so how many rounds do we run?`, String(rounds), [String(k), String(rounds + 1), String(n)], k, 'k stops means k + 1 flights. Each round extends every route by exactly one flight.');
    }
    for (let i = 0; i < rounds; i++) {
      r.op();
      round = i;
      nxt = [...prices];
      r.step('copy', `Round ${i + 1}: start a copy nxt of prices. We read old prices and write nxt, so each round adds exactly one flight.`, view(), {});
      if (!askedCopy) {
        askedCopy = true;
        r.predict('copy', 'Why do we write into a copy (nxt) instead of updating prices directly?', ['So a route cannot use two new flights in the same round', 'It is faster', 'To keep the original input'], 0, 'Updating in place could chain several flights in one round, which would break the "at most k stops" limit.');
      }
      for (const x of edges) {
        const u = Number(x.from);
        const v = Number(x.to);
        const w = x.w as number;
        if (prices[u] + w < nxt[v]) {
          if (!askedRelax) {
            askedRelax = true;
            r.step('scan', `Flight ${u} → ${v} (${w}): ${fmt(prices[u])} + ${w} = ${prices[u] + w} < ${fmt(nxt[v])}.`, view(), {});
            r.predictChoice('relax', `prices[${u}] is ${fmt(prices[u])} and the flight costs ${w}. What price does nxt[${v}] get?`, String(prices[u] + w), [String(w), String(prices[u]), String(prices[u] + w + 1)], u + v, 'The cost to reach u plus the cost of this flight, if that is cheaper than what nxt already has.');
          }
          nxt[v] = prices[u] + w;
          edgeTones[`${u}>${v}`] = 'found';
          tones[String(v)] = 'frontier';
          r.step('relax', `Cheaper: nxt[${v}] = ${prices[u]} + ${w} = ${nxt[v]}.`, view(), {});
        }
      }
      prices = nxt;
      nxt = null;
      round = i + 1;
      r.step('swap', `End of round ${i + 1}: prices now allow routes with up to ${i + 1} flight${i === 0 ? '' : 's'}.`, view(), {});
    }
    const res = prices[dst] === Infinity ? -1 : prices[dst];
    r.step('done', res === -1 ? `City ${dst} cannot be reached within ${k} stop${k === 1 ? '' : 's'}: -1.` : `The cheapest trip from ${src} to ${dst} costs ${res}.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ n, edges, src, dst, k }) {
    let best = Infinity;
    const go = (city: number, cost: number, left: number) => {
      if (city === dst) best = Math.min(best, cost);
      if (left === 0) return;
      for (const x of edges) if (Number(x.from) === city) go(Number(x.to), cost + (x.w as number), left - 1);
    };
    void n;
    go(src, 0, k + 1);
    return best === Infinity ? -1 : best;
  },
});

export default problem({
  summary: 'There are n cities and one-way flights with prices. Find the cheapest price to get from a source city to a destination city using at most k stops in between (so at most k + 1 flights). Return −1 if there is no such trip.',
  example: ['0→1 costs 5, 1→2 costs 5, 0→2 costs 20; from 0 to 2', 'with 0 stops: 20; with 1 stop: 10', 'The cheapest trip may need more flights than the direct one.'],
  pattern: ['dijkstra', ['dijkstra', 'dp-1d', 'bfs', 'dfs'], 'The limit on the number of flights is part of the state. Bellman-Ford runs exactly k + 1 rounds, each extending every route by one flight, so after round i the prices only use at most i flights.', {
    'dp-1d': 'This is exactly a DP over the number of flights, written as Bellman-Ford rounds.',
    bfs: 'BFS counts flights, but not prices.',
    dfs: 'DFS would explore routes of every length; the rounds bound them cleanly.',
  }],
  hints: [
    'Plain Dijkstra may take a cheap route that uses too many flights. What extra thing must you track?',
    'Think in rounds: after round i, what do you know?',
    'prices = [∞…]; prices[src] = 0. Repeat k + 1 times: copy prices to nxt, and for each flight (u, v, w) set nxt[v] = min(nxt[v], prices[u] + w). Then prices = nxt.',
  ],
  insight: 'k + 1 rounds of Bellman-Ford, relaxing from the OLD prices, give the cheapest price using at most k + 1 flights.',
  brute: 'Enumerate all routes of up to k + 1 flights with DFS: exponential.',
  optimal: 'Bellman-Ford rounds: O((k + 1) · E) time, O(n) space.',
  walk: ['prices = [inf] * n; prices[src] = 0.', 'Repeat k + 1 times: nxt = prices[:].', 'For every flight (u, v, w): if prices[u] + w < nxt[v], set nxt[v] = prices[u] + w.', 'prices = nxt. Finally return prices[dst], or −1 if it is still infinite.'],
  edge: ['k = 0 (direct flights only).', 'The destination is unreachable.', 'A cheap route that needs too many stops.', 'Cycles among cities.'],
  works: ['By induction, after round i the array holds the cheapest price using at most i flights; reading from the previous round\'s array adds exactly one flight.', 'After k + 1 rounds the limit is met.'],
  time: ['O((k + 1) · E)', 'One pass over the flights per round.'],
  space: ['O(n)', 'Two price arrays.'],
  solution,
  cases,
  sig: 'def find_cheapest_price(n, flights, src, dst, k):\n    # flights is a list of [from, to, price]; at most k stops between src and dst; return the cheapest price or -1\n    pass\n',
  viz,
  fromArgs: ([n, flights, src, dst, k]) => ({ n, edges: (flights as number[][]).map(([a, b, w]) => e(a, b, w)), src, dst, k }),
});
