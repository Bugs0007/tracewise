import type { Tone } from '@/engine/types';
import { hashMapView, intervalsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './non-overlapping-intervals.py?raw';
import cases from './non-overlapping-intervals.cases.json';

const viz = vizOf<{ intervals: number[][] }>({
  id: 'non-overlapping-intervals',
  title: 'Non-overlapping Intervals',
  solution,
  inputs: [{ key: 'intervals', label: 'intervals (one "start end" per line)', kind: 'grid', default: [[1, 6], [2, 4], [5, 7], [4, 5]], maxItems: 14 }],
  presets: [
    { label: 'Drop the long one', input: { intervals: [[1, 6], [2, 4], [5, 7], [4, 5]] } },
    { label: 'Already fine', input: { intervals: [[1, 2], [2, 3], [3, 4]] } },
    { label: 'All the same', input: { intervals: [[1, 4], [1, 4], [1, 4]] } },
    { label: 'Chain of overlaps', input: { intervals: [[1, 3], [2, 4], [3, 5], [4, 6]] } },
  ],
  validate: ({ intervals }) => (!intervals.length || intervals.some((p) => p.length !== 2 || p[0] >= p[1]) ? 'Each interval needs start < end' : null),
  run({ intervals }) {
    const r = new TraceRecorder(solution);
    const sorted = intervals.map((p) => [...p]).sort((a, b) => a[1] - b[1]);
    const lo = Math.min(...sorted.flat());
    const hi = Math.max(...sorted.flat()) + 1;
    const tone: Record<number, Tone> = {};
    let removed = 0;
    let lastEnd = -Infinity;
    let at = -1;
    let askedFits = false;
    let askedDrop = false;
    const view = () => [
      intervalsView(sorted.map((p, k) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]`, tone: k === at ? ('active' as Tone) : tone[k] })), { title: 'intervals sorted by END (green = kept, red = removed)', min: lo, max: hi, marks: lastEnd > -Infinity ? [{ at: lastEnd, label: 'last kept end', tone: 'found' }] : [] }),
      hashMapView({ removed, 'end of the last kept interval': lastEnd === -Infinity ? '−∞' : lastEnd }),
    ];
    r.step('init', 'Sort by END time. Always keep the interval that finishes first: it leaves the most room for the rest. Anything that starts before the last kept end overlaps and is removed.', view(), {});
    for (let k = 0; k < sorted.length; k++) {
      r.op();
      at = k;
      const [s, e] = sorted[k];
      r.step('loop', `[${s}, ${e}]: does it start at or after the last kept end (${lastEnd === -Infinity ? '−∞' : lastEnd})?`, view(), { s, e });
      if (s >= lastEnd) {
        if (!askedFits) {
          askedFits = true;
          r.predict('fits', `${s} ≥ ${lastEnd === -Infinity ? '−∞' : lastEnd}: the interval does not overlap what we kept. What do we do?`, ['Keep it and update the last end', 'Remove it', 'Skip it'], 0, 'It fits after the kept intervals, so keep it. Touching ends (start = end) count as not overlapping.');
        }
        lastEnd = e;
        tone[k] = 'found';
        r.step('keep', `Keep it. The last kept end is now ${e}.`, view(), {});
      } else {
        if (!askedDrop) {
          askedDrop = true;
          r.predict('drop', `[${s}, ${e}] starts before ${lastEnd}, so it overlaps the last kept interval. Which one do we remove?`, ['This one: it ends no earlier than the kept one', 'The kept one', 'Both'], 0, 'Intervals are sorted by end time, so this one ends later; removing it leaves the most room.');
        }
        removed++;
        tone[k] = 'error';
        r.step('drop', `Overlap: remove [${s}, ${e}]. Removed: ${removed}.`, view(), {});
      }
    }
    at = -1;
    r.step('done', `Remove ${removed} interval${removed === 1 ? '' : 's'} to make the rest non-overlapping.`, view(), { result: removed });
    return { frames: r.frames, result: removed };
  },
  reference({ intervals }) {
    const sorted = intervals.map((p) => [...p]).sort((a, b) => a[1] - b[1]);
    let removed = 0;
    let last = -Infinity;
    for (const [s, e] of sorted) {
      if (s >= last) last = e;
      else removed++;
    }
    return removed;
  },
});

export default problem({
  summary: 'Given a list of intervals, remove as few as possible so that no two of the remaining intervals overlap. Intervals that only touch at an endpoint (one ends where the next begins) do not overlap. Return the number removed.',
  example: ['[[1, 4], [2, 3], [3, 5]]', '1', 'Remove [1, 4]; then [2, 3] and [3, 5] touch but do not overlap.'],
  pattern: ['intervals', ['intervals', 'greedy', 'dp-1d', 'sorting'], 'This is the classic activity-selection problem: keep the largest set of non-overlapping intervals by always choosing the one that finishes first. The answer is the total minus the number kept.', {
    greedy: 'Greedy by earliest finishing time is the technique, applied to intervals.',
    'dp-1d': 'DP works in O(n²), but the greedy exchange argument gives O(n log n).',
    sorting: 'Sorting by end is the preparation step.',
  }],
  hints: [
    'Removing the minimum is the same as keeping the maximum. How do you pick which to keep?',
    'Which interval, among those that overlap, leaves the most room for later ones?',
    'Sort by end. Keep an interval if its start >= last_end (then last_end = its end); otherwise count it as removed.',
  ],
  insight: 'Choose the interval that ends first; it blocks the least of the future.',
  brute: 'Try every subset to keep: O(2ⁿ).',
  optimal: 'Sort by end + greedy: O(n log n) time.',
  walk: ['Sort intervals by end.', 'removed = 0, last_end = −∞.', 'For each (start, end): if start >= last_end, keep it and set last_end = end.', 'Otherwise removed += 1. Return removed.'],
  edge: ['Touching intervals (keep both).', 'Identical intervals.', 'One long interval covering many short ones.', 'A single interval.'],
  works: ['Exchange argument: in any optimal selection, replacing the first chosen interval with the one that ends earliest never causes a new overlap.', 'Repeating that argument shows the greedy choice is optimal.'],
  time: ['O(n log n)', 'Sorting dominates.'],
  space: ['O(1)', 'Besides the sort.'],
  solution,
  cases,
  sig: 'def erase_overlap_intervals(intervals):\n    # fewest intervals to remove so the rest do not overlap (touching ends are fine)\n    pass\n',
  viz,
  fromArgs: ([intervals]) => ({ intervals }),
});
