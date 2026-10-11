import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './gas-station.py?raw';
import cases from './gas-station.cases.json';

const viz = vizOf<{ gas: number[]; cost: number[] }>({
  id: 'gas-station',
  title: 'Gas Station',
  solution,
  inputs: [
    { key: 'gas', label: 'fuel available at each station', kind: 'numbers', default: [2, 3, 5, 1], maxItems: 8 },
    { key: 'cost', label: 'fuel needed to drive to the next station', kind: 'numbers', default: [3, 4, 2, 2], maxItems: 8 },
  ],
  presets: [
    { label: 'Start at the rich one', input: { gas: [2, 3, 5, 1], cost: [3, 4, 2, 2] } },
    { label: 'Not enough fuel', input: { gas: [1, 1, 1], cost: [2, 2, 2] } },
    { label: 'Start at the end', input: { gas: [1, 1, 6], cost: [3, 3, 1] } },
    { label: 'Single station', input: { gas: [5], cost: [4] } },
  ],
  validate: ({ gas, cost }) => (gas.length !== cost.length || !gas.length ? 'gas and cost need the same (non-zero) number of stations' : [...gas, ...cost].some((v) => v === null || !Number.isFinite(v) || v < 0) ? 'Use numbers ≥ 0' : null),
  run({ gas, cost }) {
    const r = new TraceRecorder(solution);
    const n = gas.length;
    const net = gas.map((g, i) => g - cost[i]);
    const sumG = gas.reduce((a, b) => a + b, 0);
    const sumC = cost.reduce((a, b) => a + b, 0);
    const view = (i: number, start: number, tank: number) => [
      arrayView(gas, { title: 'gas at each station', tones: Object.fromEntries(gas.map((_, k) => [k, (k === i ? 'active' : k >= start && k < i ? 'done' : 'default') as Tone])) }),
      arrayView(cost, { title: 'cost to the next station' }),
      arrayView(net, { title: 'net = gas − cost (positive = you gain fuel)', pointers: { start }, tones: Object.fromEntries(net.map((v, k) => [k, (k === i ? 'active' : v < 0 ? 'compare' : 'default') as Tone])) }),
      hashMapView({ 'candidate start': start, tank }),
    ];
    r.step('total', `Total fuel ${sumG}, total cost ${sumC}.`, view(-1, 0, 0), {});
    r.predict('total', 'The total gas is less than the total cost. Can any starting station work?', sumG < sumC ? ['No: you can never collect enough fuel for the whole trip', 'Yes'] : ['It might: there is enough fuel overall', 'No'], 0, sumG < sumC ? 'Whatever the start, the trip burns more fuel than the stations hold.' : 'With at least as much fuel as cost, some station always works (a known fact the greedy relies on).');
    if (sumG < sumC) {
      r.step('totalRet', 'Not enough fuel in total: return −1.', view(-1, 0, 0), { result: -1 });
      return { frames: r.frames, result: -1 };
    }
    let start = 0;
    let tank = 0;
    let askedFail = false;
    let askedTank = false;
    r.step('init', 'Try station 0 as the start with an empty tank. Walk along and add each net gain. If the tank ever goes negative, no start up to this point can work, so move the candidate to the next station.', view(-1, start, tank), {});
    for (let i = 0; i < n; i++) {
      r.op();
      tank += net[i];
      if (!askedTank) {
        askedTank = true;
        r.step('tank', `Station ${i}: tank += ${gas[i]} − ${cost[i]} → ${tank}.`, view(i, start, tank), { i });
        r.predict('tank', tank < 0 ? 'The tank is negative. What now?' : 'The tank is not negative. What now?', tank < 0 ? ['This start fails: the next station becomes the candidate and the tank resets', 'Keep going anyway'] : ['Keep going from the same start', 'Move the start'], 0, tank < 0 ? 'We could not reach the next station, and starting anywhere between the old start and here is no better.' : 'The trip is still possible from this start so far.');
      } else {
        r.step('tank', `Station ${i}: tank += ${gas[i]} − ${cost[i]} → ${tank}.`, view(i, start, tank), { i });
      }
      if (tank < 0) {
        if (!askedFail) {
          askedFail = true;
          r.predictChoice('fail', `The tank dropped to ${tank} at station ${i}. Which station is the new candidate start?`, String(i + 1), [String(i), String(start), String(i + 2)], i, 'Starting at any station between the old start and i would have even less fuel on arrival, so all of them fail.');
        }
        start = i + 1;
        tank = 0;
        r.step('restart', `Tank below zero: no start between the old candidate and station ${i} can work. New candidate: station ${start}, tank reset to 0.`, view(i, start, tank), { start });
      }
    }
    r.step('done', `Start at station ${start}. (Because total fuel ≥ total cost, that start completes the circle.)`, view(n - 1, start, tank), { result: start });
    return { frames: r.frames, result: start };
  },
  reference({ gas, cost }) {
    const n = gas.length;
    for (let s = 0; s < n; s++) {
      let tank = 0;
      let ok = true;
      for (let k = 0; k < n; k++) {
        const i = (s + k) % n;
        tank += gas[i] - cost[i];
        if (tank < 0) {
          ok = false;
          break;
        }
      }
      if (ok) return s;
    }
    return -1;
  },
});

export default problem({
  summary: 'Gas stations sit on a circular road. Station i gives gas[i] units of fuel, and driving from station i to the next costs cost[i] units. Starting with an empty tank at some station, can you drive all the way around? Return the (smallest) starting station index that works, or −1.',
  example: ['gas [1, 4], cost [2, 2]', '1', 'Start at station 1: tank 4, pay 2 (2 left), reach station 0, add 1 (3), pay 2 (1): complete. Starting at station 0 fails immediately.'],
  pattern: ['greedy', ['greedy', 'two-pointers', 'dp-1d', 'prefix-sum'], 'If the running tank drops below zero at station i, every start between the old candidate and i also fails, so the next candidate is i + 1. And if total fuel is at least total cost, the last candidate must work.', {
    'two-pointers': 'A circular two-pointer expansion works but is more fiddly.',
    'dp-1d': 'There is no table to fill; one pass of running sums is enough.',
    'prefix-sum': 'The running tank is a prefix sum of net gains; the greedy chooses the start after the lowest dip.',
  }],
  hints: [
    'If total gas is less than total cost, what is the answer?',
    'Suppose you start at A and first run out of fuel on the way to station B. Can starting at a station between A and B help?',
    'Check the totals. Then scan once: add net gains; when the tank goes negative, set start = i + 1 and reset the tank.',
  ],
  insight: 'A failing stretch rules out every start inside it, so a single pass can discard candidates in blocks.',
  brute: 'Simulate the trip from every station: O(n²).',
  optimal: 'One pass: O(n) time, O(1) space.',
  walk: ['If sum(gas) < sum(cost) return −1.', 'start = tank = 0.', 'For each station: tank += gas[i] − cost[i].', 'If tank < 0: start = i + 1 and tank = 0. Return start.'],
  edge: ['Total gas below total cost.', 'A single station.', 'The answer is the last station.', 'Equal gas and cost everywhere (start 0 works).'],
  works: ['Any start in the block that ended with a negative tank also reaches that point with at most the same fuel, so it fails there too.', 'When the totals allow it, the leftover surplus after the last candidate covers the earlier deficits, so the circle completes.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Two variables.'],
  solution,
  cases,
  sig: 'def can_complete_circuit(gas, cost):\n    # smallest starting station that lets you drive around the circle, or -1\n    pass\n',
  viz,
  fromArgs: ([gas, cost]) => ({ gas, cost }),
});
