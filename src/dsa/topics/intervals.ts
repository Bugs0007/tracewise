import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'An interval problem gives you ranges (meetings, jobs, segments on a number line) and asks about overlaps: merge them, insert one, remove the fewest so none overlap, count how many run at once, or find the smallest range covering a point.',
    'Almost every one of them starts the same way: sort. Sorting by start time puts the intervals that can overlap next to each other, so a single sweep with a "current merged interval" or "last end" variable is enough. Sorting by END time is the right choice when you want to keep as many intervals as possible (the one that finishes first leaves the most room).',
    'Two details decide correctness more often than the algorithm: whether touching endpoints (one interval ends where the next begins) count as an overlap, and whether both endpoints are included. Decide that first and write the comparison (<, <=) to match.',
  ],
  checklist: [
    'The data are ranges with a start and an end.',
    'The question is about overlaps, gaps, merging, or how many ranges are active at once.',
    'Sorting by start makes neighbours the only candidates for overlap: merging, inserting, attending meetings.',
    'Sorting by end and keeping the earliest finisher maximises the number kept (activity selection).',
    'The peak overlap equals the number of resources needed: sort starts and ends separately, or use a heap of end times.',
    'Queries about points inside ranges: sort the queries too and sweep with a heap.',
    'You have decided whether touching endpoints overlap, and whether both ends are included.',
  ],
  template: [
    {
      title: 'Merge overlapping intervals',
      code: `merged = []
for start, end in sorted(intervals):
    if merged and start <= merged[-1][1]:       # overlaps the last one
        merged[-1][1] = max(merged[-1][1], end)
    else:
        merged.append([start, end])`,
    },
    {
      title: 'Keep the most intervals (sort by end)',
      code: `removed, last_end = 0, float("-inf")
for start, end in sorted(intervals, key=lambda x: x[1]):
    if start >= last_end:
        last_end = end
    else:
        removed += 1`,
    },
    {
      title: 'Peak overlap with sorted starts and ends',
      code: `starts, ends = sorted(s for s, _ in iv), sorted(e for _, e in iv)
rooms = j = 0
for s in starts:
    if s >= ends[j]: j += 1          # a room frees up
    else: rooms += 1`,
    },
  ],
  boss: {
    seconds: 420,
    problem: 'minimum-interval-to-include-each-query',
    note: 'The boss problem is Minimum Interval to Include Each Query. Say why the queries are sorted, what the heap holds, and why an expired interval can be dropped forever.',
    quiz: [
      {
        prompt: 'After sorting intervals by start, which interval can a new interval overlap when merging?',
        options: ['Only the last merged interval', 'Any earlier interval', 'The first interval', 'None'],
        answer: 0,
        explain: 'Everything before the last merged interval ends before the last one starts, so the new one (which starts later) cannot reach it.',
      },
      {
        prompt: 'To keep as many non-overlapping intervals as possible, which one do you keep first?',
        options: ['The one that ends first', 'The one that starts first', 'The longest', 'The shortest'],
        answer: 0,
        explain: 'The earliest finish leaves the most room for the rest (exchange argument).',
      },
      {
        prompt: 'Two meetings [1, 3] and [3, 5]: do they overlap?',
        options: ['No: one ends exactly when the other starts', 'Yes, at time 3', 'Only in the same room', 'It depends on the sort'],
        answer: 0,
        explain: 'With half-open meeting times a shared endpoint is not an overlap, which is why the check is start < previous end.',
      },
      {
        prompt: 'Why can Meeting Rooms II sort the start times and the end times separately?',
        options: ['Only the number of meetings running at once matters, not which meeting ends when', 'The meetings are all equal length', 'Because the end times are always sorted', 'It cannot'],
        answer: 0,
        explain: 'The count at a moment is (starts so far) − (ends so far); the pairing between a start and its end is irrelevant.',
      },
      {
        prompt: 'In the query problem, why can an interval that ended before the current query be discarded permanently?',
        options: ['Queries are processed in increasing order, so every later query is even farther right', 'Intervals can be reused', 'The heap forbids it', 'Because intervals are sorted by size'],
        answer: 0,
        explain: 'If it does not reach this query, it cannot reach any larger one.',
      },
    ],
  },
};

export default topic;
