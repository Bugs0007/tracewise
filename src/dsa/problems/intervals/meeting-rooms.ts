import type { Tone } from '@/engine/types';
import { intervalsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './meeting-rooms.py?raw';
import cases from './meeting-rooms.cases.json';

const viz = vizOf<{ meetings: number[][] }>({
  id: 'meeting-rooms',
  title: 'Meeting Rooms',
  solution,
  inputs: [{ key: 'meetings', label: 'meetings (one "start end" per line)', kind: 'grid', default: [[1, 3], [3, 5], [4, 8]], maxItems: 12 }],
  presets: [
    { label: 'Third clashes', input: { meetings: [[1, 3], [3, 5], [4, 8]] } },
    { label: 'Back to back', input: { meetings: [[1, 3], [3, 5], [5, 7]] } },
    { label: 'Unsorted, clear', input: { meetings: [[9, 10], [1, 2], [4, 5]] } },
    { label: 'Tiny overlap', input: { meetings: [[1, 4], [3, 6]] } },
  ],
  validate: ({ meetings }) => (!meetings.length || meetings.some((p) => p.length !== 2 || p[0] >= p[1]) ? 'Each meeting needs start < end' : null),
  run({ meetings }) {
    const r = new TraceRecorder(solution);
    const sorted = meetings.map((p) => [...p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lo = Math.min(...sorted.flat());
    const hi = Math.max(...sorted.flat()) + 1;
    const tone: Record<number, Tone> = {};
    const view = () => [intervalsView(sorted.map((p, k) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]`, tone: tone[k] })), { title: 'meetings sorted by start', min: lo, max: hi })];
    r.step('sort', `Sort by start time: ${sorted.map((p) => `[${p[0]}, ${p[1]}]`).join(' ')}. Only neighbours in this order can clash.`, view(), {});
    let askedClash = false;
    let askedOk = false;
    for (let i = 1; i < sorted.length; i++) {
      r.op();
      tone[i - 1] = 'active';
      tone[i] = 'active';
      const clash = sorted[i][0] < sorted[i - 1][1];
      r.step('loop', `Compare meeting ${i} (starts at ${sorted[i][0]}) with the one before it (ends at ${sorted[i - 1][1]}).`, view(), { i });
      if (!(clash ? askedClash : askedOk)) {
        if (clash) askedClash = true;
        else askedOk = true;
        r.predict(clash ? 'clash' : 'ok', `The next meeting starts at ${sorted[i][0]}; the previous one ends at ${sorted[i - 1][1]}. Can you attend both?`, ['Yes', 'No'], clash ? 1 : 0, clash ? 'It starts before the previous one ends, so they overlap.' : sorted[i][0] === sorted[i - 1][1] ? 'It starts exactly when the other ends: back to back is fine.' : 'There is a gap between them.');
      }
      if (clash) {
        tone[i - 1] = 'error';
        tone[i] = 'error';
        r.step('clashRet', `${sorted[i][0]} < ${sorted[i - 1][1]}: the meetings overlap. Return False.`, view(), { result: false });
        return { frames: r.frames, result: false };
      }
      tone[i - 1] = 'done';
      tone[i] = 'done';
    }
    r.step('done', 'No two neighbouring meetings overlap: you can attend them all.', view(), { result: true });
    return { frames: r.frames, result: true };
  },
  reference({ meetings }) {
    return !meetings.some((a, i) => meetings.slice(i + 1).some((b) => a[0] < b[1] && b[0] < a[1]));
  },
});

export default problem({
  summary: 'Given the start and end times of meetings, decide whether one person can attend all of them. A meeting that ends exactly when the next one starts is fine.',
  example: ['[[1, 4], [4, 6], [8, 9]]', 'true', 'The first two touch at time 4, which is allowed, and the third is later.'],
  pattern: ['intervals', ['intervals', 'sorting', 'greedy', 'heap'], 'Sort the meetings by start time. Then any overlap must show up between two neighbours, so one pass comparing each start with the previous end decides.', {
    sorting: 'Sorting is the step that makes the neighbour check enough.',
    greedy: 'There is no choice to make; it is a yes / no check.',
    heap: 'A heap is only needed to count simultaneous meetings, not to check for any overlap.',
  }],
  hints: [
    'Checking every pair works but is slow. After sorting, which pairs matter?',
    'When does the meeting after another one clash with it?',
    'Sort by start. For each i ≥ 1: if start[i] < end[i − 1], return False. Otherwise return True.',
  ],
  insight: 'Sorted by start, a clash with anything earlier implies a clash with the immediately preceding meeting.',
  brute: 'Compare every pair: O(n²).',
  optimal: 'Sort + one pass: O(n log n).',
  walk: ['Sort the meetings.', 'For i from 1: if meetings[i][0] < meetings[i − 1][1] return False.', 'Return True.'],
  edge: ['Empty list or one meeting.', 'Meetings that touch.', 'Identical meetings.', 'Unsorted input.'],
  works: ['If meeting j clashes with an earlier meeting i < j then start[j] < end[i], and since meetings are sorted by start, end of the meeting just before j reaches at least that far or that meeting itself clashes with i.'],
  time: ['O(n log n)', 'Sorting dominates.'],
  space: ['O(1)', 'Besides the sort.'],
  solution,
  cases,
  sig: 'def can_attend_meetings(intervals):\n    # intervals is a list of [start, end]; True if no two meetings overlap\n    pass\n',
  viz,
  fromArgs: ([meetings]) => ({ meetings }),
});
