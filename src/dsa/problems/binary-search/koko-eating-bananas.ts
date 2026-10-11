import type { Panel, Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './koko-eating-bananas.py?raw';
import cases from './koko-eating-bananas.cases.json';

const viz = vizOf<{ piles: number[]; h: number }>({
  id: 'koko-eating-bananas',
  title: 'Koko Eating Bananas',
  solution,
  inputs: [
    { key: 'piles', label: 'banana piles', kind: 'numbers', default: [4, 9, 7, 12], maxItems: 8 },
    { key: 'h', label: 'hours available', kind: 'number', default: 8 },
  ],
  presets: [
    { label: 'Moderate', input: { piles: [4, 9, 7, 12], h: 8 } },
    { label: 'One pile per hour', input: { piles: [3, 6, 9], h: 3 } },
    { label: 'Lots of time', input: { piles: [10, 20, 30], h: 60 } },
  ],
  validate: ({ piles, h }) => (piles.length < 1 || piles.some((p) => !Number.isInteger(p) || p < 1) ? 'Piles must be whole numbers of at least 1' : !Number.isInteger(h) || h < piles.length ? `h must be at least the number of piles (${piles.length})` : null),
  run({ piles, h }) {
    const r = new TraceRecorder(solution);
    let lo = 1;
    let hi = Math.max(...piles);
    const speeds = (): number[] => (hi - lo + 1 <= 40 ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : []);
    const view = (mid: number | null, per: number[] | null = null) => {
      const panels: Panel[] = [arrayView(piles, { title: 'pile sizes', tones: per ? Object.fromEntries(per.map((_, i) => [i, 'active'])) as Record<number, Tone> : undefined })];
      if (per) panels.push(arrayView(per, { title: `hours needed per pile at speed ${mid}` }));
      const sp = speeds();
      if (sp.length) panels.push(arrayView(sp, { title: 'speeds still possible', tones: mid !== null && mid >= lo && mid <= hi ? { [mid - lo]: 'active' } : {}, hideIndex: true }));
      panels.push(hashMapView({ lo, hi, ...(mid !== null ? { mid } : {}), 'hours allowed': h }, {}));
      return panels;
    };
    r.step('init', `Search the speed: at least 1 banana/hour, at most the biggest pile (${hi}), which finishes any pile in one hour.`, view(null), { lo, hi });
    while (lo < hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `Try the middle speed: mid = ${mid} bananas per hour.`, view(mid), { lo, hi, mid });
      const per = piles.map((p) => Math.ceil(p / mid));
      const hours = per.reduce((a, b) => a + b, 0);
      r.predictChoice('hours', `At speed ${mid}, how many hours in total does she need? (each pile takes ceil(pile / ${mid}) hours)`, String(hours), [String(hours + 1), String(Math.max(1, hours - 1)), String(Math.floor(piles.reduce((a, b) => a + b, 0) / mid))], mid, 'Each pile is rounded up, because a partly eaten pile still costs a full hour.');
      r.step('hours', `Total hours at speed ${mid}: ${per.join(' + ')} = ${hours}. Allowed: ${h}.`, view(mid, per), { mid, hours });
      const ok = hours <= h;
      r.predict(ok ? 'ok' : 'slow', `${hours} hours versus ${h} allowed. Is speed ${mid} fast enough?`, ['Yes: it works, so try something slower (go left)', 'No: too slow, she needs to eat faster (go right)'], ok ? 0 : 1, ok ? 'It works, but a smaller speed might too: keep mid as a candidate and search below it.' : 'Any slower speed would be worse, so discard mid and everything below.');
      if (ok) {
        hi = mid;
        r.step('goLeft', `${hours} ≤ ${h}: mid works. The answer is mid or smaller: hi = ${hi}.`, view(null), { lo, hi });
      } else {
        lo = mid + 1;
        r.step('goRight', `${hours} > ${h}: too slow. lo = ${lo}.`, view(null), { lo, hi });
      }
    }
    r.step('done', `lo = hi = ${lo}: the slowest speed that still finishes in time is ${lo}.`, view(null), { result: lo });
    return { frames: r.frames, result: lo };
  },
  reference({ piles, h }) {
    let k = 1;
    while (piles.reduce((a, p) => a + Math.ceil(p / k), 0) > h) k++;
    return k;
  },
});

export default problem({
  summary: 'There are piles of bananas and a fixed number of hours. Each hour you pick one pile and eat up to k bananas from it (if the pile has fewer, you finish it and waste the rest of the hour). Find the smallest k that lets you eat everything within the allowed hours.',
  example: ['piles = [5, 8, 3], hours = 4', '5', 'At speed 5 the piles take 1 + 2 + 1 = 4 hours. At speed 4 they would take 2 + 2 + 1 = 5 hours, too many.'],
  pattern: ['binary-search-answer', ['binary-search-answer', 'binary-search', 'greedy', 'heap'], 'The answer k is a number in a known range, and feasibility is monotone: if speed k is fast enough, every larger speed is too. Binary search the speed itself.', {
    'binary-search': 'It is binary search, but on the range of possible answers rather than on the input array. That is the pattern to recognise.',
    greedy: 'There is no greedy choice among piles; the question is whether a given speed works.',
    heap: 'A heap does not help: the order of piles does not matter, only the sum of rounded-up hours.',
  }],
  hints: [
    'Suppose someone tells you a speed k. How would you check whether it is fast enough?',
    'If speed k is fast enough, what about k + 1? What does that say about the set of working speeds?',
    'The working speeds form a range starting at some minimum. Binary search for that minimum between 1 and the biggest pile, using the feasibility check.',
  ],
  insight: 'Feasibility is monotone in the speed, so binary search the speed: if mid is fast enough keep it and look lower, otherwise look higher.',
  brute: 'Try every speed from 1 upward: O(max · n).',
  optimal: 'Binary search over speeds with an O(n) feasibility check: O(n log max).',
  walk: ['The answer lies between 1 and max(piles).', 'For a candidate speed mid, total hours = sum of ceil(p / mid) over all piles.', 'If hours ≤ h, mid works: set hi = mid (a smaller speed might also work).', 'Otherwise mid is too slow: set lo = mid + 1. When lo meets hi that is the minimum speed.'],
  edge: ['A single pile.', 'h equal to the number of piles forces speed = max pile.', 'Piles of equal size.', 'Very large piles (binary search keeps it fast).'],
  works: ['Hours needed is non-increasing as the speed grows, so the set of valid speeds is an up-closed range. Binary search finds its left end.', 'Keeping hi = mid on success never discards a valid speed, and lo = mid + 1 on failure only discards invalid ones.'],
  time: ['O(n log m)', 'm = the largest pile; about log m checks, each O(n).'],
  space: ['O(1)', 'A few integers.'],
  solution,
  cases,
  sig: 'def min_eating_speed(piles, h):\n    # smallest bananas-per-hour that finishes all piles within h hours\n    pass\n',
  viz,
  fromArgs: ([piles, h]) => ({ piles, h }),
});
