import type { Tone } from '@/engine/types';
import { intervalsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './merge-intervals.py?raw';
import cases from './merge-intervals.cases.json';

const viz = vizOf<{ intervals: number[][] }>({
  id: 'merge-intervals',
  title: 'Merge Intervals',
  solution,
  inputs: [{ key: 'intervals', label: 'intervals (one "start end" per line, any order)', kind: 'grid', default: [[8, 11], [1, 4], [3, 6], [14, 16]], maxItems: 16 }],
  presets: [
    { label: 'Overlaps and a gap', input: { intervals: [[8, 11], [1, 4], [3, 6], [14, 16]] } },
    { label: 'Touching intervals', input: { intervals: [[1, 2], [2, 3], [3, 4]] } },
    { label: 'Nested', input: { intervals: [[1, 10], [3, 4], [5, 6]] } },
    { label: 'All separate', input: { intervals: [[1, 2], [4, 5], [7, 8]] } },
  ],
  validate: ({ intervals }) => (!intervals.length || intervals.some((p) => p.length !== 2 || p[0] > p[1]) ? 'Each interval needs start ≤ end' : null),
  run({ intervals }) {
    const r = new TraceRecorder(solution);
    const sorted = intervals.map((p) => [...p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: number[][] = [];
    const hi = Math.max(...sorted.flat()) + 1;
    const lo = Math.min(...sorted.flat());
    let at = -1;
    let askedOverlap = false;
    let askedAdd = false;
    const view = () => [
      intervalsView(sorted.map((p, k) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]`, tone: (k === at ? 'active' : k < at ? 'done' : 'default') as Tone })), { title: 'intervals sorted by start', min: lo, max: hi }),
      intervalsView(merged.map((p) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]`, tone: 'found' as Tone })), { title: 'merged', min: lo, max: hi }),
    ];
    r.step('init', `Sort by start: ${sorted.map((p) => `[${p[0]}, ${p[1]}]`).join(' ')}. After sorting, an interval can only overlap the LAST merged interval.`, view(), {});
    for (let k = 0; k < sorted.length; k++) {
      r.op();
      at = k;
      const [s, e] = sorted[k];
      const last = merged[merged.length - 1];
      r.step('loop', `Next: [${s}, ${e}].${last ? ` Compare its start ${s} with the last merged end ${last[1]}.` : ' Nothing merged yet.'}`, view(), { s, e });
      if (last && s <= last[1]) {
        if (!askedOverlap) {
          askedOverlap = true;
          r.predictChoice('overlap', `[${s}, ${e}] starts at ${s} ≤ ${last[1]}. What is the merged interval's new end?`, String(Math.max(last[1], e)), [String(e), String(last[1]), String(Math.max(last[1], e) + 1)], k, 'The new end is the larger of the two ends (one interval may sit inside the other).');
        }
        last[1] = Math.max(last[1], e);
        r.step('extend', `Overlap: extend the last merged interval to [${last[0]}, ${last[1]}].`, view(), {});
      } else {
        if (!askedAdd && last) {
          askedAdd = true;
          r.predict('add', `[${s}, ${e}] starts after the last merged end (${last[1]}). What do we do?`, ['Add it as a new separate interval', 'Merge it anyway', 'Skip it'], 0, 'There is a gap, so it cannot be merged with anything before it.');
        }
        merged.push([s, e]);
        r.step('add', `No overlap: start a new merged interval [${s}, ${e}].`, view(), {});
      }
    }
    at = sorted.length;
    r.step('done', `Merged: ${merged.map((p) => `[${p[0]}, ${p[1]}]`).join(' ')}.`, view(), { result: JSON.stringify(merged) });
    return { frames: r.frames, result: merged };
  },
  reference({ intervals }) {
    const items = intervals.map((p) => [...p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out: number[][] = [];
    for (const [s, e] of items) {
      if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
      else out.push([s, e]);
    }
    return out;
  },
});

export default problem({
  summary: 'Given a list of intervals in any order, merge all overlapping ones (intervals that touch at an endpoint also count as overlapping) and return the resulting list of disjoint intervals, sorted by start.',
  example: ['[[5, 8], [1, 3], [2, 4]]', '[[1, 4], [5, 8]]', '[1, 3] and [2, 4] overlap and merge into [1, 4]; [5, 8] stands alone.'],
  pattern: ['intervals', ['intervals', 'sorting', 'greedy', 'union-find'], 'Sort by start. Then each interval either overlaps the last merged one (extend its end) or begins a new one. Only the last merged interval ever needs to be compared.', {
    sorting: 'Sorting is the first step, but the sweep that follows is the intervals pattern.',
    greedy: 'The sweep makes the obvious local choice; the intervals pattern names the whole technique.',
    'union-find': 'Union-find can merge intervals but is far heavier than a sorted sweep.',
  }],
  hints: [
    'What would make it easy to find all intervals that overlap a given one?',
    'After sorting, which merged interval can the next one overlap?',
    'Sort by start. For each interval: if start <= merged[-1][1], set merged[-1][1] = max(merged[-1][1], end); otherwise append it.',
  ],
  insight: 'In sorted order, overlapping intervals are neighbours, so merging is one pass.',
  brute: 'Repeatedly merge any overlapping pair until none remain: O(n²).',
  optimal: 'Sort + sweep: O(n log n) time, O(n) space.',
  walk: ['Sort the intervals by start.', 'merged = [].', 'For each (start, end): if merged is non-empty and start <= merged[-1][1], widen merged[-1][1] to max(merged[-1][1], end).', 'Otherwise append [start, end]. Return merged.'],
  edge: ['A single interval.', 'Touching endpoints (merge).', 'One interval completely inside another.', 'Identical intervals.'],
  works: ['After sorting by start, all intervals that can join a merged interval come right after it, and the merged end is the maximum end seen.', 'A gap is detected exactly when the next start exceeds that maximum.'],
  time: ['O(n log n)', 'Sorting dominates.'],
  space: ['O(n)', 'The output.'],
  solution,
  cases,
  sig: 'def merge(intervals):\n    # intervals is a list of [start, end]; return the merged, sorted list\n    pass\n',
  viz,
  fromArgs: ([intervals]) => ({ intervals }),
});
