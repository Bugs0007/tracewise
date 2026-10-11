import type { Tone } from '@/engine/types';
import { intervalsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './insert-interval.py?raw';
import cases from './insert-interval.cases.json';

const viz = vizOf<{ intervals: number[][]; add: number[] }>({
  id: 'insert-interval',
  title: 'Insert Interval',
  solution,
  inputs: [
    { key: 'intervals', label: 'sorted, non-overlapping intervals (one "start end" per line)', kind: 'grid', default: [[1, 2], [4, 6], [8, 10], [13, 15]], maxItems: 14 },
    { key: 'add', label: 'new interval "start end"', kind: 'numbers', default: [5, 9], maxItems: 2 },
  ],
  presets: [
    { label: 'Swallows two', input: { intervals: [[1, 2], [4, 6], [8, 10], [13, 15]], add: [5, 9] } },
    { label: 'Fits in a gap', input: { intervals: [[1, 2], [8, 9]], add: [4, 5] } },
    { label: 'Touching merges', input: { intervals: [[1, 3], [6, 8]], add: [3, 6] } },
    { label: 'Single point before', input: { intervals: [[1, 1]], add: [3, 4] } },
  ],
  validate: ({ intervals, add }) => {
    if (add.length !== 2 || add.some((v) => v === null) || add[0] > add[1]) return 'The new interval needs two numbers: start ≤ end';
    if (intervals.some((p) => p.length !== 2 || p[0] > p[1])) return 'Each interval needs start ≤ end';
    for (let i = 1; i < intervals.length; i++) if (intervals[i][0] <= intervals[i - 1][1]) return 'The existing intervals must be sorted and must not overlap';
    return null;
  },
  run({ intervals, add }) {
    const r = new TraceRecorder(solution);
    const result: number[][] = [];
    let [start, end] = add;
    let i = 0;
    const n = intervals.length;
    const tones: Record<number, Tone> = {};
    let askedBefore = false;
    let askedOverlap = false;
    let askedAfter = false;
    const hi = Math.max(...intervals.flat(), ...add) + 1;
    const view = () => [
      intervalsView(intervals.map((p, k) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]`, tone: tones[k] })), { title: 'existing intervals', min: 0, max: hi }),
      intervalsView([{ start, end, label: `new [${start},${end}]`, tone: 'active' }], { title: 'the interval being built', min: 0, max: hi }),
      intervalsView(result.map((p) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]`, tone: 'done' as Tone })), { title: 'result so far', min: 0, max: hi }),
    ];
    r.step('init', `Insert [${start}, ${end}] into the sorted list. Three phases: copy intervals that end before the new one starts, merge every interval that overlaps it, copy the rest.`, view(), {});
    while (i < n && intervals[i][1] < start) {
      r.op();
      if (!askedBefore) {
        askedBefore = true;
        r.step('before', `[${intervals[i][0]}, ${intervals[i][1]}] ends at ${intervals[i][1]}, before the new interval starts at ${start}.`, view(), {});
        r.predict('before', 'This interval ends before the new one begins. What do we do with it?', ['Copy it unchanged to the result', 'Merge it', 'Drop it'], 0, 'No overlap, so it stays as it is, and so does everything before it.');
      }
      tones[i] = 'done';
      result.push(intervals[i]);
      r.step('keep', `Keep [${intervals[i][0]}, ${intervals[i][1]}].`, view(), {});
      i++;
    }
    while (i < n && intervals[i][0] <= end) {
      r.op();
      tones[i] = 'compare';
      const ns = Math.min(start, intervals[i][0]);
      const ne = Math.max(end, intervals[i][1]);
      r.step('overlap', `[${intervals[i][0]}, ${intervals[i][1]}] starts at ${intervals[i][0]} ≤ ${end}: it overlaps the new interval.`, view(), {});
      if (!askedOverlap) {
        askedOverlap = true;
        r.predictChoice('overlap', `Merging [${start}, ${end}] with [${intervals[i][0]}, ${intervals[i][1]}] gives which interval?`, `[${ns}, ${ne}]`, [`[${start}, ${end}]`, `[${intervals[i][0]}, ${intervals[i][1]}]`, `[${ns}, ${ne + 1}]`], i, 'The union runs from the smaller start to the larger end.');
      }
      start = ns;
      end = ne;
      r.step('mergeEnd', `Merge: the new interval becomes [${start}, ${end}].`, view(), {});
      i++;
    }
    result.push([start, end]);
    r.step('place', `Place the merged interval [${start}, ${end}].`, view(), {});
    if (!askedAfter && i < n) {
      askedAfter = true;
      r.predict('after', 'The remaining intervals all start after the merged one ends. What happens to them?', ['They are appended unchanged', 'They are merged', 'They are dropped'], 0, 'None can overlap, because the list was sorted and non-overlapping.');
    }
    for (let k = i; k < n; k++) {
      result.push(intervals[k]);
      tones[k] = 'done';
    }
    r.step('done', `Result: ${result.map((p) => `[${p[0]}, ${p[1]}]`).join(' ')}.`, view(), { result: JSON.stringify(result) });
    return { frames: r.frames, result };
  },
  reference({ intervals, add }) {
    const all = [...intervals.map((p) => [...p]), [...add]].sort((a, b) => a[0] - b[0]);
    const out: number[][] = [];
    for (const [s, e] of all) {
      if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
      else out.push([s, e]);
    }
    return out;
  },
});

export default problem({
  summary: 'You are given a list of intervals sorted by start with no overlaps, plus one more interval. Insert it so the list stays sorted and has no overlaps, merging any intervals that overlap or touch it. Return the new list.',
  example: ['intervals [[2, 4], [7, 9]], new [3, 8]', '[[2, 9]]', 'The new interval overlaps both, and the three merge into one.'],
  pattern: ['intervals', ['intervals', 'sorting', 'binary-search', 'two-pointers'], 'The list is already sorted, so a single left-to-right pass handles three phases: intervals entirely before the new one, intervals overlapping it (merge them), and intervals entirely after.', {
    sorting: 'The input is already sorted; re-sorting would waste time.',
    'binary-search': 'You could binary search the positions, but copying the result is O(n) anyway.',
    'two-pointers': 'One index moves through the list in three phases; this is the intervals pattern.',
  }],
  hints: [
    'Which intervals can stay exactly as they are?',
    'When does an interval overlap [start, end]? What does the merged interval look like?',
    'Copy while interval.end < start. Then while interval.start <= end: start = min(...), end = max(...). Append [start, end], then the rest.',
  ],
  insight: 'Because the list is sorted, the overlapping intervals form one contiguous block that merges into a single interval.',
  brute: 'Add the interval and re-run Merge Intervals (sort + merge): O(n log n).',
  optimal: 'Single pass: O(n) time, O(n) for the output.',
  walk: ['Copy every interval that ends before the new start.', 'While intervals overlap the new one, widen start and end.', 'Append the merged interval.', 'Append all remaining intervals.'],
  edge: ['Empty list.', 'The new interval touches an end (it merges).', 'The new interval covers everything.', 'The new interval is before or after all of them.'],
  works: ['Intervals ending before the new start cannot overlap it, and those starting after the (widened) end cannot either.', 'The ones in between all overlap and collapse into one interval.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(n)', 'The output list.'],
  solution,
  cases,
  sig: 'def insert(intervals, new_interval):\n    # intervals: sorted, non-overlapping [start, end] pairs; return the new list after inserting new_interval\n    pass\n',
  viz,
  fromArgs: ([intervals, add]) => ({ intervals, add }),
});
