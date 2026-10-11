import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './trapping-rain-water.py?raw';
import cases from './trapping-rain-water.cases.json';

const viz = vizOf<{ height: number[] }>({
  id: 'trapping-rain-water',
  title: 'Trapping Rain Water',
  solution,
  inputs: [{ key: 'height', label: 'bar heights', kind: 'numbers', default: [4, 0, 2, 1, 3, 0, 5], maxItems: 14 }],
  presets: [
    { label: 'Two basins', input: { height: [4, 0, 2, 1, 3, 0, 5] } },
    { label: 'Single basin', input: { height: [4, 1, 1, 4] } },
    { label: 'Staircase', input: { height: [0, 1, 2, 3, 4] } },
    { label: 'Flat', input: { height: [2, 2, 2] } },
  ],
  validate: ({ height }) => (height.some((h) => h < 0) ? 'Heights cannot be negative' : null),
  run({ height: h }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = h.length - 1;
    let lmax = 0;
    let rmax = 0;
    let water = 0;
    const per = h.map(() => 0);
    const view = (hot: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      h.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'visited';
      });
      return [
        arrayView(h, { title: 'bars', bars: true, tones: { ...tones, ...hot }, pointers: h.length ? { lo, hi } : undefined }),
        arrayView(per, { title: 'water above each bar', tones: Object.fromEntries(per.map((v, i) => [i, v > 0 ? 'new' : 'default'])) as Record<number, Tone> }),
        hashMapView({ left_max: lmax, right_max: rmax, water }, { title: 'running totals' }),
      ];
    };
    r.step('init', `Two pointers at the ends of ${h.length} bar${h.length === 1 ? '' : 's'}.`, view(), { lo, hi });
    r.step('maxes', 'left_max and right_max remember the tallest bar seen from each side.', view(), { left_max: lmax, right_max: rmax });
    r.step('water', 'water counts the total trapped so far.', view(), { water });
    while (lo < hi) {
      r.op();
      const leftSide = h[lo] < h[hi];
      r.step('loop', `Compare the two ends: height[lo] = ${h[lo]}, height[hi] = ${h[hi]}.`, view({ [lo]: 'compare', [hi]: 'compare' }), { lo, hi });
      r.predict('side', `${h[lo]} versus ${h[hi]}. Which side is safe to finish first?`, ['The left side: its bar is lower', 'The right side: its bar is lower'], leftSide ? 0 : 1, 'The side with the lower end is bounded by that end on the far side, so its water level is already decided by its own running max.');
      if (leftSide) {
        lmax = Math.max(lmax, h[lo]);
        r.step('lmax', `left_max is now ${lmax} (the tallest bar seen from the left).`, view({ [lo]: 'active' }), { left_max: lmax });
        const add = lmax - h[lo];
        r.predictChoice('add', `Water above bar ${lo} (height ${h[lo]}) with left_max = ${lmax}. How much?`, `${add}`, [`${add + 1}`, `${add + 2}`, `${lmax}`], lo, 'Water above a bar is the level (left_max here) minus its own height.');
        water += add;
        per[lo] = add;
        r.step('addL', `Water above bar ${lo} = ${lmax} − ${h[lo]} = ${add}. Total ${water}.`, view({ [lo]: 'new' }), { water });
        lo++;
        r.step('moveLo', `Move lo right to ${lo}.`, view(), { lo, hi });
      } else {
        rmax = Math.max(rmax, h[hi]);
        r.step('rmax', `right_max = ${rmax}.`, view({ [hi]: 'active' }), { right_max: rmax });
        const add = rmax - h[hi];
        water += add;
        per[hi] = add;
        r.step('addR', `Water above bar ${hi} = ${rmax} − ${h[hi]} = ${add}. Total ${water}.`, view({ [hi]: 'new' }), { water });
        hi--;
        r.step('moveHi', `Move hi left to ${hi}.`, view(), { lo, hi });
      }
    }
    r.step('done', `Done: ${water} unit${water === 1 ? '' : 's'} of water trapped.`, view(), { water });
    return { frames: r.frames, result: water };
  },
  reference({ height: h }) {
    let total = 0;
    for (let i = 0; i < h.length; i++) total += Math.max(0, Math.min(Math.max(...h.slice(0, i + 1)), Math.max(...h.slice(i))) - h[i]);
    return total;
  },
});

export default problem({
  summary: 'Bars of the given heights stand side by side, each one unit wide. After rain, water collects in the gaps between taller bars. Work out the total volume of water the bars trap.',
  example: ['bars = [3, 0, 1, 0, 2]', '5', 'Water sits above the three inner bars: 2 + 1 + 2. Each is limited by the shorter of the two tall sides, 3 on the left and 2 on the right.'],
  pattern: ['two-pointers', ['two-pointers', 'monotonic-stack', 'prefix-suffix', 'dp-1d'], 'Water above a bar depends on the tallest bar to its left and the tallest to its right. Two pointers track both maxima while moving inward, handling the lower side first.', {
    'monotonic-stack': 'A monotonic stack also works in O(n), but it needs O(n) memory. Two pointers get O(1).',
    'prefix-suffix': 'Precomputing the max from each side works (O(n) space). Two pointers fold both passes into one without arrays.',
    'dp-1d': 'The prefix/suffix arrays version is a form of this; two pointers is the space-optimised idea.',
  }],
  hints: [
    'Think about a single bar. How high does the water above it get? What two things limit it?',
    'The level above a bar is the lower of the tallest bar on its left and the tallest on its right, minus the bar itself.',
    'Walk inward from both ends. The side with the lower end can be settled immediately, because the other end is at least as tall.',
  ],
  insight: 'Water above a bar = min(tallest to the left, tallest to the right) − bar height. Move from the lower end, whose limit is already known.',
  brute: 'For each bar scan left and right for the tallest bars: O(n²) time.',
  optimal: 'Two pointers carrying a running max for each side: O(n) time, O(1) space.',
  walk: ['Keep lo and hi at the ends, with left_max and right_max starting at 0.', 'Compare height[lo] and height[hi]. Work on the lower side. Say it is the left: update left_max with height[lo].', 'Add left_max − height[lo] to the answer: the right end is at least as tall as anything seen on the left, so the left maximum is the limit.', 'Move that pointer inward. Do the mirror image if the right side is lower. Stop when they meet.'],
  edge: ['Fewer than three bars: nothing can be trapped.', 'Flat bars: zero.', 'A staircase: zero, since there is never a wall on both sides.', 'A deep basin between two tall walls.'],
  works: ['When height[lo] < height[hi], the bar at hi (or something even taller beyond it) guarantees the right limit for lo is at least height[hi] > height[lo]. So the water above lo is governed by left_max alone.', 'Symmetrically for the right side. Every bar is settled exactly once.'],
  time: ['O(n)', 'The pointers cross the array once.'],
  space: ['O(1)', 'Two pointers and two running maxima.'],
  solution,
  cases,
  sig: 'def trap(height):\n    # total units of water the bars trap\n    pass\n',
  viz,
  fromArgs: ([height]) => ({ height }),
});
