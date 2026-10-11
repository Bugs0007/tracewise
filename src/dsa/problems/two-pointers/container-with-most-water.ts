import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './container-with-most-water.py?raw';
import cases from './container-with-most-water.cases.json';

const viz = vizOf<{ height: number[] }>({
  id: 'container-with-most-water',
  title: 'Container With Most Water',
  solution,
  inputs: [{ key: 'height', label: 'wall heights', kind: 'numbers', default: [3, 8, 2, 6, 9, 4, 5], maxItems: 14 }],
  presets: [
    { label: 'Mixed walls', input: { height: [3, 8, 2, 6, 9, 4, 5] } },
    { label: 'Two walls', input: { height: [5, 5] } },
    { label: 'Increasing', input: { height: [1, 2, 3, 4, 5, 6] } },
    { label: 'One tall wall', input: { height: [1, 1, 20, 1, 1] } },
  ],
  validate: ({ height }) => (height.length < 2 ? 'Enter at least two heights' : height.some((h) => h < 0) ? 'Heights cannot be negative' : null),
  run({ height: h }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = h.length - 1;
    let best = 0;
    const view = (hot: Record<number, Tone> = {}, area?: number) => {
      const tones: Record<number, Tone> = {};
      h.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      return [arrayView(h, { title: 'wall heights', bars: true, tones: { ...tones, ...hot }, pointers: { lo, hi }, window: lo <= hi ? { from: lo, to: hi, label: 'container', tone: 'active' } : undefined }), hashMapView(area === undefined ? { best } : { area, best }, { title: 'water held' })];
    };
    r.step('init', `Start with the widest container: walls ${lo} and ${hi}.`, view(), { lo, hi });
    r.step('best', 'best remembers the largest area seen so far.', view(), { best });
    while (lo < hi) {
      r.op();
      const area = (hi - lo) * Math.min(h[lo], h[hi]);
      r.step('area', `Width ${hi - lo} × the shorter wall ${Math.min(h[lo], h[hi])} = ${area}. Water is limited by the lower wall.`, view({ [lo]: 'compare', [hi]: 'compare' }, area), { lo, hi, area, best });
      r.predict('bigger', `This container holds ${area}. The best so far is ${best}. Does best change?`, ['Yes: this is a new best', 'No: keep the old best'], area > best ? 0 : 1, area > best ? 'A larger area replaces best.' : 'It does not beat the best seen so far.');
      best = Math.max(best, area);
      r.step('update', `best = max(best, ${area}) = ${best}.`, view({ [lo]: 'compare', [hi]: 'compare' }, area), { best });
      const moveLo = h[lo] < h[hi];
      r.predict('move', `Walls are ${h[lo]} (left) and ${h[hi]} (right). Which pointer should move?`, ['The left one: it is the shorter wall', 'The right one: it is the taller wall'], moveLo ? 0 : 1, 'The shorter wall is the limit. Moving the taller one inward can only shrink the width without raising the limit, so move the shorter one.');
      if (moveLo) {
        lo++;
        r.step('moveLo', `Left wall ${h[lo - 1]} is shorter: move lo right to look for a taller one.`, view(), { lo, hi, best });
      } else {
        hi--;
        r.step('moveHi', `Right wall ${h[hi + 1]} is not taller: move hi left.`, view(), { lo, hi, best });
      }
    }
    r.step('done', `The pointers met. The largest container holds ${best}.`, view(), { best });
    return { frames: r.frames, result: best };
  },
  reference({ height: h }) {
    let best = 0;
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) best = Math.max(best, (j - i) * Math.min(h[i], h[j]));
    return best;
  },
});

export default problem({
  summary: 'A row of vertical walls has the given heights. Pick two walls to form a container with the floor; the water it holds is the distance between the walls times the shorter wall. Find the most water any pair can hold.',
  example: ['heights = [4, 1, 7, 2, 6]', '16', 'Walls 4 and 6 (positions 0 and 4) are 4 apart and the shorter is 4, so 16. Taller-but-closer walls hold less.'],
  pattern: ['two-pointers', ['two-pointers', 'sliding-window', 'dp-1d', 'binary-search'], 'Start with the widest container and shrink inwards. At each step one wall is the limit, and only moving that limiting wall can possibly help.', {
    'sliding-window': 'The two walls are not a fixed or growing window; they converge from both ends.',
    'dp-1d': 'Each pair is independent; there is no overlapping subproblem to store.',
    'binary-search': 'Nothing is sorted and no target is searched for.',
  }],
  hints: [
    'Checking every pair works but is O(n²). The widest container is the pair of end walls. How can you tell what to try next?',
    'The water level is set by the shorter wall. If you move the taller wall inward, can the area ever grow?',
    'Always move the pointer at the shorter wall: that is the only move that could find a higher limit to make up for the lost width.',
  ],
  insight: 'Begin at the widest pair and always move the shorter wall inward; moving the taller one can never help.',
  brute: 'Compute the area of every pair: O(n²) time.',
  optimal: 'Two pointers from the ends: O(n) time, O(1) space.',
  walk: ['Place lo and hi at the two ends and track the best area seen.', 'Compute the current area (distance times the shorter height) and update best.', 'Move the pointer sitting at the shorter wall one step inward.', 'Repeat until the pointers meet. best is the answer.'],
  edge: ['Exactly two walls.', 'Walls of height zero.', 'Strictly increasing or decreasing heights.', 'One very tall wall in the middle that never limits anything.'],
  works: ['Say the left wall is shorter. Any container using this left wall and a wall closer than hi has less width and is still capped by the same left wall, so it cannot beat the current area. Hence the left wall can be discarded.', 'Every discarded wall is proven useless, so the best pair is never skipped.'],
  time: ['O(n)', 'Each step moves one pointer inward, so at most n steps.'],
  space: ['O(1)', 'Two indices and a running best.'],
  solution,
  cases,
  sig: 'def max_area(height):\n    # most water any two walls can hold\n    pass\n',
  viz,
  fromArgs: ([height]) => ({ height }),
});
