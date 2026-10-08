import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { parseIntervals, type Interval } from '@/content/lib/recursion-greedy';

const code = `
def max_activities(intervals):
    intervals = sorted(intervals, key=lambda iv: iv[1])   #@sort
    count = 0                                             #@init
    last_end = float('-inf')
    for start, end in intervals:                          #@loop
        if start >= last_end:                             #@check
            count += 1                                    #@pick
            last_end = end
        else:
            continue                                      #@skip
    return count                                          #@done
`;

interface In {
  intervals: Interval[];
}

const fmt = (iv: Interval) => `[${iv[0]}, ${iv[1]}]`;

const viz: VizDef<In> = {
  id: 'greedy-activity',
  title: 'Activity selection',
  code,
  language: 'python',
  inputs: [{ key: 'intervals', label: 'Activities [start, end]', kind: 'json', default: [[1, 3], [2, 5], [4, 7], [1, 8], [5, 9], [8, 10], [9, 11]], help: 'At most 8 activities, non-negative numbers' }],
  presets: [
    { label: 'Long one first', input: { intervals: [[1, 10], [2, 3], [4, 5], [6, 7]] } },
    { label: 'Touching ends', input: { intervals: [[1, 2], [2, 3], [3, 4]] } },
    { label: 'All overlap', input: { intervals: [[1, 5], [2, 6], [3, 7]] } },
    { label: 'Single', input: { intervals: [[0, 1]] } },
  ],
  run(input) {
    const raw = parseIntervals(input.intervals);
    const r = new Recorder(code);
    const sorted = [...raw].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const tMax = Math.max(1, ...raw.map((iv) => iv[1])) + 1;
    const state: Tone[] = sorted.map(() => 'frontier');
    const chosen: Interval[] = [];
    let order: Interval[] = raw;
    let lastEnd = -Infinity;
    let count = 0;

    const board = (): Panel => ({
      type: 'timeline',
      title: 'Activities (sorted by END) and the chosen schedule',
      tMax,
      now: Number.isFinite(lastEnd) ? lastEnd : undefined,
      lanes: [
        ...order.map((iv, i) => ({
          label: fmt(iv),
          events: [{ t: iv[0], dur: iv[1] - iv[0], label: `${iv[0]}–${iv[1]}`, tone: order === raw ? ('compare' as Tone) : state[i] }],
        })),
        { label: 'schedule', events: chosen.map((iv) => ({ t: iv[0], dur: iv[1] - iv[0], label: `${iv[0]}–${iv[1]}`, tone: 'found' as Tone })) },
      ],
    });
    const vars = (extra: Record<string, unknown> = {}) => ({ count, last_end: Number.isFinite(lastEnd) ? lastEnd : '-inf', ...extra });

    r.step('sort', 'Activities as given — in no useful order', [board()], vars());
    order = sorted;
    r.op(sorted.length);
    r.step('sort', `Sorted by END time: ${sorted.map(fmt).join(' ')}`, [board()], vars());
    r.step('init', 'count = 0 and last_end = -inf: nothing chosen, so anything may start', [board()], vars());

    sorted.forEach((iv, i) => {
      const [start, end] = iv;
      state[i] = 'active';
      r.op();
      const ok = start >= lastEnd;
      r.step('check', `${fmt(iv)}: start ${start} ${ok ? '≥' : '<'} last_end ${Number.isFinite(lastEnd) ? lastEnd : '-inf'} → ${ok ? 'free to pick' : 'it clashes'}`, [board()], vars({ start, end }));
      if (ok) {
        count++;
        chosen.push(iv);
        lastEnd = end;
        state[i] = 'found';
        r.step('pick', `Pick ${fmt(iv)} → last_end = ${end}, count = ${count}`, [board()], vars({ start, end }));
      } else {
        state[i] = 'muted';
        r.step('skip', `Skip ${fmt(iv)}: it would overlap the activity ending at ${lastEnd}`, [board()], vars({ start, end }));
      }
    });
    r.step('done', `Maximum ${count} non-overlapping activit${count === 1 ? 'y' : 'ies'}: ${chosen.map(fmt).join(' ') || '(none)'}`, [board()], vars());
    return { frames: r.frames, result: count };
  },
  reference({ intervals }) {
    // independent: O(n^2) dynamic programming over activities ordered by end
    const iv = [...intervals].sort((a, b) => a[1] - b[1]);
    const dp: number[] = [];
    iv.forEach(([s], i) => {
      let best = 0;
      for (let j = 0; j < i; j++) if (iv[j][1] <= s) best = Math.max(best, dp[j]);
      dp.push(best + 1);
    });
    return Math.max(0, ...dp);
  },
};

const tests = [
  { args: [[[1, 3], [2, 5], [4, 7], [1, 8], [5, 9], [8, 10], [9, 11]]], expected: 3 },
  { args: [[[1, 10], [2, 3], [4, 5], [6, 7]]], expected: 3, name: 'long early activity' },
  { args: [[[1, 2], [2, 3], [3, 4]]], expected: 3, name: 'touching ends are allowed' },
  { args: [[[1, 5], [2, 6], [3, 7]]], expected: 1, name: 'everything overlaps' },
  { args: [[[1, 4], [3, 5], [0, 6], [5, 7], [3, 9], [5, 9], [6, 10], [8, 11], [8, 12], [2, 14], [12, 16]]], expected: 4 },
  { args: [[[0, 1]]], expected: 1, name: 'single' },
  { args: [[]], expected: 0, name: 'empty' },
];

const unit: Unit = {
  id: 'greedy-activity',
  hook: 'Activity selection is the textbook greedy problem: one sorting key and one comparison solve it, but only the RIGHT key works. Interviewers use it to see whether you can justify a greedy choice, not just code it.',
  predict: {
    prompt: 'Activities: [1, 10], [2, 3], [4, 5], [6, 7]. You greedily pick by EARLIEST START (take the first one that fits). How many activities do you end up with, and what is the true maximum?',
    options: ['You get 1; the maximum is 3', 'You get 3; the maximum is 3', 'You get 2; the maximum is 3', 'You get 1; the maximum is 1'],
    answer: 0,
    explain: 'Earliest start grabs [1, 10], which blocks the other three. Sorting by earliest END picks [2, 3], [4, 5], [6, 7]: three activities. The sort key matters.',
  },
  viz,
  deeper: {
    points: [
      'Sort by END time. Keep `last_end`, the finish time of the last chosen activity, and take any activity whose start is at or after it.',
      'Why earliest-finish is safe (exchange argument): take any optimal schedule and look at its first activity o. Let g be the activity that finishes earliest of all. Since g ends no later than o, swapping o for g cannot clash with the rest of the schedule, so an optimal schedule that starts with g exists.',
      'After picking g, the problem shrinks to the activities that start at or after g ends, and the same argument repeats. By induction the greedy picks are always part of some optimal solution.',
      'Other keys fail: earliest start (a long early activity blocks everything), shortest duration (a short one in the middle can block two others), fewest conflicts (counter-examples exist). Say why your key is right, not just that it works.',
    ],
    complexity: { time: 'O(n log n) — sort, then one O(n) pass', space: 'O(1) extra (O(n) if you keep the chosen list)' },
    pitfalls: ['Sorting by start time or duration', '`>` instead of `>=` when ending and starting at the same moment is allowed', 'Updating `last_end` for skipped activities'],
  },
  practice: {
    language: 'python',
    fnName: 'max_activities',
    statement: 'Given activities as [start, end] pairs, return the largest number you can attend without overlap. An activity may start exactly when another ends.',
    signature: 'def max_activities(intervals):',
    solution: `def max_activities(intervals):
    intervals = sorted(intervals, key=@@lambda iv: iv[1]@@)
    count = 0
    last_end = @@float('-inf')@@
    for start, end in intervals:
        if @@start >= last_end@@:
            count += 1
            last_end = @@end@@
    return count`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'max_activities',
    statement: 'For [[1, 10], [2, 3], [4, 5], [6, 7]] this returns 1 instead of 3. Find and fix the bug.',
    buggy: `def max_activities(intervals):
    intervals = sorted(intervals, key=lambda iv: iv[0])
    count = 0
    last_end = float('-inf')
    for start, end in intervals:
        if start >= last_end:
            count += 1
            last_end = end
    return count`,
    fixed: `def max_activities(intervals):
    intervals = sorted(intervals, key=lambda iv: iv[1])
    count = 0
    last_end = float('-inf')
    for start, end in intervals:
        if start >= last_end:
            count += 1
            last_end = end
    return count`,
    tests,
    bugType: 'wrong greedy key',
    hint: 'The loop is fine. Which activity does the code take first for [[1, 10], [2, 3], [4, 5], [6, 7]], and what does that choice block?',
    explanation: 'Sorting by start picks [1, 10] first and it blocks everything else. Greedy only works with the right key: sort by END so the activity that frees you up soonest is always taken first.',
  },
  boss: {
    title: 'Fewest removals',
    statement: 'Given a list of intervals, return the minimum number you must remove so that the remaining intervals do not overlap. Intervals that only touch ([1, 2] and [2, 3]) do not overlap.',
    language: 'python',
    fnName: 'erase_overlap_intervals',
    starter: `def erase_overlap_intervals(intervals):
    # your code here
    pass
`,
    solution: `def erase_overlap_intervals(intervals):
    intervals = sorted(intervals, key=lambda iv: iv[1])
    kept = 0
    last_end = float('-inf')
    for start, end in intervals:
        if start >= last_end:
            kept += 1
            last_end = end
    return len(intervals) - kept`,
    tests: [
      { args: [[[1, 2], [2, 3], [3, 4], [1, 3]]], expected: 1 },
      { args: [[[1, 2], [1, 2], [1, 2]]], expected: 2, name: 'identical intervals' },
      { args: [[[1, 2], [2, 3]]], expected: 0, name: 'touching is fine' },
      { args: [[]], expected: 0, name: 'empty' },
      { args: [[[1, 100], [11, 22], [1, 11], [2, 12]]], expected: 2 },
      { args: [[[5, 9], [1, 3], [3, 6]]], expected: 1, name: 'unsorted input' },
    ],
    hints: ['Removing the fewest intervals is the same as KEEPING the most. Which problem from this unit keeps the maximum number of non-overlapping intervals?', 'Run activity selection (sort by end, take when start >= last_end) and return len(intervals) - kept.'],
    combines: ['greedy-activity', 'greedy-intervals'],
  },
  quiz: [
    {
      prompt: 'In the exchange argument for activity selection, why can we swap the first activity of an optimal schedule for the earliest-finishing one?',
      options: ['It starts earlier, so it fits more activities', 'It ends no later, so it still does not clash with the rest of the schedule', 'It is always the shortest', 'It removes the need to sort'],
      answer: 1,
      explain: 'The rest of the optimal schedule starts after the replaced activity ends. The earliest-finishing activity ends even sooner, so the swapped schedule is still valid and just as large.',
    },
  ],
};

export default unit;
