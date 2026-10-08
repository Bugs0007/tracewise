import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { parseIntervals } from '@/content/lib/recursion-greedy';

const code = `
def merge(intervals):
    intervals = sorted(intervals)                      #@sort
    merged = []                                        #@init
    for start, end in intervals:                       #@loop
        if merged and start <= merged[-1][1]:          #@check
            merged[-1][1] = max(merged[-1][1], end)    #@extend
        else:
            merged.append([start, end])                #@push
    return merged                                      #@done
`;

type Iv = [number, number];

interface In {
  intervals: Iv[];
}

const fmt = (iv: Iv) => `[${iv[0]}, ${iv[1]}]`;

const viz: VizDef<In> = {
  id: 'greedy-intervals',
  title: 'Merge intervals',
  code,
  language: 'python',
  inputs: [{ key: 'intervals', label: 'Intervals [start, end]', kind: 'json', default: [[8, 10], [1, 3], [2, 6], [15, 18], [17, 20], [6, 7]], help: 'At most 8 intervals, non-negative numbers' }],
  presets: [
    { label: 'Nested', input: { intervals: [[1, 10], [2, 3], [4, 5]] } },
    { label: 'Touching ends', input: { intervals: [[1, 2], [2, 3], [3, 4]] } },
    { label: 'No overlap', input: { intervals: [[1, 2], [5, 6]] } },
    { label: 'Single', input: { intervals: [[3, 4]] } },
  ],
  run(input) {
    const raw = parseIntervals(input.intervals);
    const r = new Recorder(code);
    const sorted = [...raw].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const tMax = Math.max(1, ...raw.map((iv) => iv[1])) + 1;
    const merged: Iv[] = [];
    let order: Iv[] = raw;
    const state: Record<number, Tone> = {}; // index in `sorted` -> tone
    let tail: Tone = 'found';

    const board = (now?: number): Panel => ({
      type: 'timeline',
      title: 'Intervals (one lane each) and the merged result',
      tMax,
      now,
      lanes: [
        ...order.map((iv, i) => ({
          label: fmt(iv),
          events: [{ t: iv[0], dur: iv[1] - iv[0], label: `${iv[0]}–${iv[1]}`, tone: order === raw ? ('default' as Tone) : (state[i] ?? 'muted') }],
        })),
        { label: 'merged', events: merged.map((iv, k) => ({ t: iv[0], dur: iv[1] - iv[0], label: `${iv[0]}–${iv[1]}`, tone: k === merged.length - 1 ? tail : ('found' as Tone) })) },
      ],
    });
    const vars = (extra: Record<string, unknown> = {}) => ({ merged: `[${merged.map(fmt).join(', ')}]`, ...extra });

    const alreadySorted = raw.every((iv, i) => iv[0] === sorted[i][0] && iv[1] === sorted[i][1]);
    r.step('sort', alreadySorted ? 'Intervals as given (already ordered by start)' : 'Intervals as given — not ordered by start yet', [board()], vars());
    order = sorted;
    sorted.forEach((_, i) => (state[i] = 'muted'));
    r.op(sorted.length);
    r.step('sort', `Sorted by start: ${sorted.map(fmt).join(' ')}`, [board()], vars());
    r.step('init', 'merged = [] — the answer so far is empty', [board()], vars());

    sorted.forEach(([start, end], i) => {
      state[i] = 'active';
      r.op();
      if (merged.length && start <= merged[merged.length - 1][1]) {
        const last = merged[merged.length - 1];
        tail = 'compare';
        r.step('check', `start ${start} ≤ last end ${last[1]} → overlap, the block grows`, [board(start)], vars({ start, end, 'last end': last[1] }));
        const oldEnd = last[1];
        const newEnd = Math.max(oldEnd, end);
        const why = end > oldEnd ? `${end} reaches further` : `${oldEnd} already covers it`;
        last[1] = newEnd;
        tail = 'swap';
        r.step('extend', `last end = max(${oldEnd}, ${end}) = ${newEnd} (${why})`, [board(start)], vars({ start, end, 'last end': newEnd }));
      } else {
        tail = 'compare';
        const note = merged.length ? `start ${start} > last end ${merged[merged.length - 1][1]} → gap` : 'merged is empty → nothing to compare with';
        r.step('check', note, [board(start)], vars({ start, end, 'last end': merged.length ? merged[merged.length - 1][1] : null }));
        merged.push([start, end]);
        tail = 'new';
        r.step('push', `Start a new block ${fmt([start, end])}`, [board(start)], vars({ start, end }));
      }
      state[i] = 'visited';
      tail = 'found';
    });
    r.step('done', `${merged.length} merged interval${merged.length === 1 ? '' : 's'}: ${merged.map(fmt).join(' ') || '(none)'}`, [board()], vars());
    return { frames: r.frames, result: merged };
  },
  reference({ intervals }) {
    // independent: keep merging any overlapping pair until none is left
    let list = intervals.map((iv) => [...iv] as Iv);
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          if (list[a][0] <= list[b][1] && list[b][0] <= list[a][1]) {
            const m: Iv = [Math.min(list[a][0], list[b][0]), Math.max(list[a][1], list[b][1])];
            list = list.filter((_, k) => k !== a && k !== b);
            list.push(m);
            changed = true;
            break outer;
          }
        }
      }
    }
    return list.sort((x, y) => x[0] - y[0]);
  },
};

const tests = [
  { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
  { args: [[[1, 4], [4, 5]]], expected: [[1, 5]], name: 'touching ends merge' },
  { args: [[[1, 4], [2, 3]]], expected: [[1, 4]], name: 'nested interval' },
  { args: [[[5, 6], [1, 2], [3, 4]]], expected: [[1, 2], [3, 4], [5, 6]], name: 'unsorted, no overlap' },
  { args: [[[2, 3], [4, 5], [6, 7], [8, 9], [1, 10]]], expected: [[1, 10]], name: 'one big interval swallows all' },
  { args: [[[7, 9]]], expected: [[7, 9]], name: 'single interval' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'greedy-intervals',
  hook: 'Merge intervals is the gateway to the whole interval family (meeting rooms, insert interval, calendar booking). The trick is one sort that turns a messy overlap problem into a single left-to-right pass.',
  predict: {
    prompt: 'You merge `[[1, 4], [4, 5], [7, 9]]` and treat intervals that merely TOUCH (like 4 and 4) as overlapping. What is the result?',
    options: ['[[1, 4], [4, 5], [7, 9]]', '[[1, 5], [7, 9]]', '[[1, 9]]', '[[1, 4], [7, 9]]'],
    answer: 1,
    explain: '[1, 4] and [4, 5] share the point 4, so with start <= last end they merge into [1, 5]. [7, 9] starts after 5, a real gap, so it stays separate.',
  },
  viz,
  deeper: {
    points: [
      'Sort by START. After that, an interval can only overlap the block you are currently building, never anything you already closed.',
      'Why the greedy choice is safe: let the current block end at e. The next interval starts at s ≥ every earlier start. If s ≤ e it overlaps the block, so it must join it. If s > e then every later interval starts even later (sorted), so nothing can ever reach this block again — closing it is final.',
      'Extend with `max(last_end, end)`, not `end`: a later interval can sit entirely inside the block ([1, 10] then [2, 3]) and must not shrink it.',
      'Whether touching intervals merge ([1, 2] and [2, 3]) is a problem decision: `<=` merges them, `<` keeps them apart. Ask the interviewer.',
    ],
    complexity: { time: 'O(n log n) — the sort dominates, the sweep is O(n)', space: 'O(n) for the output (O(1) extra if you ignore it)' },
    pitfalls: ['Not sorting first (or sorting by end)', 'Setting the end to `end` instead of `max(last_end, end)`', '`<` vs `<=` on touching intervals', 'Mutating the caller\'s lists by reusing intervals[0] as the first block'],
  },
  practice: {
    language: 'python',
    fnName: 'merge',
    statement: 'Merge all overlapping intervals (intervals that touch, such as [1, 2] and [2, 3], also merge) and return the merged list ordered by start.',
    signature: 'def merge(intervals):',
    solution: `def merge(intervals):
    intervals = @@sorted(intervals)@@
    merged = []
    for start, end in intervals:
        if @@merged and start <= merged[-1][1]@@:
            merged[-1][1] = @@max(merged[-1][1], end)@@
        else:
            merged.append(@@[start, end]@@)
    return merged`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'merge',
    statement: 'merge([[1, 4], [2, 3]]) returns [[1, 3]] instead of [[1, 4]]. Find and fix the bug.',
    buggy: `def merge(intervals):
    intervals = sorted(intervals)
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = end
        else:
            merged.append([start, end])
    return merged`,
    fixed: `def merge(intervals):
    intervals = sorted(intervals)
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged`,
    tests,
    bugType: 'wrong update when merging',
    hint: 'Look at what happens when the new interval is completely inside the current block. Which end should win?',
    explanation: 'The block\'s end was overwritten with the new interval\'s end even when that end is smaller, shrinking the block. The merged end must be max(last end, end).',
  },
  boss: {
    title: 'Insert interval',
    statement: 'You are given a list of non-overlapping intervals sorted by start, and one new interval. Insert the new interval, merging anything it overlaps or touches, and return the sorted result.',
    language: 'python',
    fnName: 'insert_interval',
    starter: `def insert_interval(intervals, new):
    # your code here
    pass
`,
    solution: `def insert_interval(intervals, new):
    result = []
    i, n = 0, len(intervals)
    while i < n and intervals[i][1] < new[0]:
        result.append(intervals[i])
        i += 1
    while i < n and intervals[i][0] <= new[1]:
        new = [min(new[0], intervals[i][0]), max(new[1], intervals[i][1])]
        i += 1
    result.append(new)
    result.extend(intervals[i:])
    return result`,
    tests: [
      { args: [[[1, 3], [6, 9]], [2, 5]], expected: [[1, 5], [6, 9]] },
      { args: [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]], expected: [[1, 2], [3, 10], [12, 16]], name: 'swallows several' },
      { args: [[], [5, 7]], expected: [[5, 7]], name: 'empty list' },
      { args: [[[3, 5]], [1, 2]], expected: [[1, 2], [3, 5]], name: 'goes first' },
      { args: [[[1, 5]], [6, 8]], expected: [[1, 5], [6, 8]], name: 'goes last' },
      { args: [[[1, 2], [3, 4]], [2, 3]], expected: [[1, 4]], name: 'touches both sides' },
    ],
    hints: ['The list is already sorted, so no sort is needed. Split it into: intervals entirely before the new one, intervals that overlap it, and intervals entirely after.', 'Copy while intervals[i][1] < new[0]. Then, while intervals[i][0] <= new[1], grow `new` to cover them (min of starts, max of ends). Append `new`, then copy the rest.'],
    combines: ['greedy-intervals'],
  },
  quiz: [
    {
      prompt: 'Why must merge intervals sort by start time (not by end time)?',
      options: ['Python only sorts by the first item', 'So a closed block can never be reached by a later interval', 'To make the output unique', 'It reduces the number of intervals'],
      answer: 1,
      explain: 'With starts in order, once an interval starts after the block\'s end, every later interval does too. The block is final and can be pushed without ever looking back.',
    },
  ],
};

export default unit;
