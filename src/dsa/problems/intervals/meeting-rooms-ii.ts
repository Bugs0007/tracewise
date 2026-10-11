import type { Tone } from '@/engine/types';
import { arrayView, hashMapView, intervalsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './meeting-rooms-ii.py?raw';
import cases from './meeting-rooms-ii.cases.json';

const viz = vizOf<{ meetings: number[][] }>({
  id: 'meeting-rooms-ii',
  title: 'Meeting Rooms II',
  solution,
  inputs: [{ key: 'meetings', label: 'meetings (one "start end" per line)', kind: 'grid', default: [[2, 40], [6, 12], [18, 24], [10, 30]], maxItems: 12 }],
  presets: [
    { label: 'Busy middle', input: { meetings: [[2, 40], [6, 12], [18, 24], [10, 30]] } },
    { label: 'Sequential', input: { meetings: [[1, 2], [2, 3], [3, 4]] } },
    { label: 'All together', input: { meetings: [[1, 5], [2, 6], [3, 7], [4, 8]] } },
    { label: 'Reuse a room', input: { meetings: [[1, 4], [2, 5], [4, 6]] } },
  ],
  validate: ({ meetings }) => (!meetings.length || meetings.some((p) => p.length !== 2 || p[0] >= p[1]) ? 'Each meeting needs start < end' : null),
  run({ meetings }) {
    const r = new TraceRecorder(solution);
    const starts = meetings.map((p) => p[0]).sort((a, b) => a - b);
    const ends = meetings.map((p) => p[1]).sort((a, b) => a - b);
    const lo = Math.min(...starts);
    const hi = Math.max(...ends) + 1;
    let rooms = 0;
    let j = 0;
    let at = -1;
    let askedFree = false;
    let askedOpen = false;
    const view = () => [
      intervalsView(meetings.map((p) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}]` })), { title: 'meetings', min: lo, max: hi, marks: at >= 0 ? [{ at: starts[at], label: 'now', tone: 'active' }] : [] }),
      arrayView(starts, { title: 'start times, sorted', tones: Object.fromEntries(starts.map((_, k) => [k, (k === at ? 'active' : k < at ? 'done' : 'default') as Tone])) }),
      arrayView(ends, { title: 'end times, sorted (j = the earliest meeting still running)', pointers: j < ends.length ? { j } : {}, tones: Object.fromEntries(ends.map((_, k) => [k, (k < j ? 'done' : k === j ? 'compare' : 'default') as Tone])) }),
      hashMapView({ rooms }),
    ];
    r.step('starts', `Sort the start times: [${starts.join(', ')}].`, view(), {});
    r.step('ends', `Sort the end times separately: [${ends.join(', ')}]. We do not need to know which end belongs to which start, only how many meetings are running at each moment.`, view(), {});
    r.step('init', 'rooms counts the rooms opened. j points at the earliest end time among meetings still running.', view(), {});
    for (let k = 0; k < starts.length; k++) {
      r.op();
      at = k;
      const s = starts[k];
      r.step('loop', `A meeting starts at ${s}. The earliest running meeting ends at ${ends[j]}.`, view(), { s });
      if (s >= ends[j]) {
        if (!askedFree) {
          askedFree = true;
          r.predict('free', `The new meeting starts at ${s}, and some running meeting ended at ${ends[j]} ≤ ${s}. Do we need a new room?`, ['No: reuse the room that just became free', 'Yes: always open a room'], 0, 'A room is free once its meeting has ended, so the new meeting can use it.');
        }
        j++;
        r.step('reuse', `${s} ≥ ${ends[j - 1]}: that room is free. Reuse it (rooms stays ${rooms}).`, view(), {});
      } else {
        if (!askedOpen) {
          askedOpen = true;
          r.predictChoice('open', `Every running meeting is still going at ${s}. rooms is ${rooms}. What is rooms afterwards?`, String(rooms + 1), [String(rooms), String(rooms + 2), String(j)], k, 'Nothing is free, so one more room is needed.');
        }
        rooms++;
        r.step('open', `${s} < ${ends[j]}: nothing has ended yet. Open a new room. rooms = ${rooms}.`, view(), { rooms });
      }
    }
    at = -1;
    r.step('done', `${rooms} room${rooms === 1 ? ' is' : 's are'} needed at the busiest moment.`, view(), { result: rooms });
    return { frames: r.frames, result: rooms };
  },
  reference({ meetings }) {
    const lo = Math.min(...meetings.map((p) => p[0]));
    const hi = Math.max(...meetings.map((p) => p[1]));
    let best = 0;
    for (let t = lo; t <= hi; t++) best = Math.max(best, meetings.filter((p) => p[0] <= t && t < p[1]).length);
    return best;
  },
});

export default problem({
  summary: 'Given the start and end times of meetings, find the minimum number of rooms needed so that every meeting has a room to itself while it runs. A room can be reused the moment its meeting ends.',
  example: ['[[1, 5], [2, 6], [5, 8]]', '2', 'The first two overlap, so they need two rooms; the third starts when the first ends and reuses its room.'],
  pattern: ['intervals', ['intervals', 'heap', 'sorting', 'two-pointers'], 'The number of rooms needed equals the largest number of meetings running at the same time. Sorting the start times and the end times separately lets one sweep count that without matching meetings to rooms.', {
    heap: 'A min-heap of end times is the other classic solution; the sorted-arrays sweep is a lighter version of the same idea.',
    sorting: 'Sorting both lists is the preparation for the sweep.',
    'two-pointers': 'The sweep uses a pointer into the sorted end times and iterates the sorted start times.',
  }],
  hints: [
    'What single number do you really need? Think about one instant in time.',
    'If you only knew the sorted start times and the sorted end times, could you count meetings running at each start?',
    'For each start in order: if it is >= the earliest unused end time, a room frees up (advance the end pointer); otherwise open a new room.',
  ],
  insight: 'Rooms needed = the maximum overlap, which a sweep over sorted starts and sorted ends computes.',
  brute: 'Check the overlap count at every time: O(n · T).',
  optimal: 'Sort both lists + sweep: O(n log n) time, O(n) space.',
  walk: ['starts = sorted starts, ends = sorted ends.', 'rooms = 0, j = 0.', 'For each start s: if s >= ends[j], j += 1 (a room frees up).', 'Otherwise rooms += 1. Return rooms.'],
  edge: ['Meetings that touch (end = next start reuse the room).', 'All meetings identical.', 'One meeting.', 'Nested meetings.'],
  works: ['At each start, the number of ended meetings is the number of ends ≤ s; the pointer j counts exactly those that have been matched to a start. Opening a room only when none has ended makes rooms equal to the peak concurrency.'],
  time: ['O(n log n)', 'Sorting dominates.'],
  space: ['O(n)', 'The two sorted arrays.'],
  solution,
  cases,
  sig: 'def min_meeting_rooms(intervals):\n    # intervals is a list of [start, end]; return the minimum number of rooms\n    pass\n',
  viz,
  fromArgs: ([meetings]) => ({ meetings }),
});
