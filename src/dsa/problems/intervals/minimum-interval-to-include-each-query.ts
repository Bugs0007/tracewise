import type { Tone } from '@/engine/types';
import { chipsView, hashMapView, intervalsView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './minimum-interval-to-include-each-query.py?raw';
import cases from './minimum-interval-to-include-each-query.cases.json';

type Entry = [number, number];

const viz = vizOf<{ intervals: number[][]; queries: number[] }>({
  id: 'minimum-interval-to-include-each-query',
  title: 'Minimum Interval to Include Each Query',
  solution,
  inputs: [
    { key: 'intervals', label: 'intervals (one "start end" per line, both ends included)', kind: 'grid', default: [[1, 6], [2, 4], [5, 9], [10, 11]], maxItems: 10 },
    { key: 'queries', label: 'query points', kind: 'numbers', default: [3, 5, 8, 12], maxItems: 6 },
  ],
  presets: [
    { label: 'Mixed', input: { intervals: [[1, 6], [2, 4], [5, 9], [10, 11]], queries: [3, 5, 8, 12] } },
    { label: 'Boundaries included', input: { intervals: [[2, 4], [4, 9]], queries: [2, 4, 9] } },
    { label: 'Queries out of order', input: { intervals: [[1, 10], [3, 5]], queries: [6, 4, 3] } },
    { label: 'No interval', input: { intervals: [[4, 5]], queries: [1, 9] } },
  ],
  validate: ({ intervals, queries }) => (!intervals.length || intervals.some((p) => p.length !== 2 || p[0] > p[1]) ? 'Each interval needs start ≤ end' : !queries.length || queries.some((q) => q === null) ? 'Enter at least one query' : null),
  run({ intervals: input, queries }) {
    const r = new TraceRecorder(solution);
    const intervals = input.map((p) => [...p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const heap = new MinHeap<Entry>([]);
    const answer = new Map<number, number>();
    const lo = Math.min(...intervals.flat(), ...queries);
    const hi = Math.max(...intervals.flat(), ...queries) + 1;
    const tones: Record<number, Tone> = {};
    let i = 0;
    let q = 0;
    let askedAdd = false;
    let askedExpire = false;
    let askedSet = false;
    const view = (items: Entry[] = heap.items, at: number[] = []) => [
      intervalsView(intervals.map((p, k) => ({ start: p[0], end: p[1], label: `[${p[0]},${p[1]}] size ${p[1] - p[0] + 1}`, tone: tones[k] })), { title: 'intervals sorted by start', min: lo, max: hi, marks: [{ at: q, label: `query ${q}`, tone: 'active' }] }),
      chipsView(items.map(([size, end]) => `size ${size}, ends ${end}`), { title: 'heap of candidate intervals (smallest size first)', tones: Object.fromEntries(at.map((k) => [k, 'active' as Tone])) }),
      hashMapView(Object.fromEntries([...answer.entries()].map(([k, v]) => [`query ${k}`, v])), { title: 'answers so far' }),
    ];
    const watch: Watch<Entry> = (what, snap, at) => r.step('push', what === 'append' ? `Add (${snap[at[0]][0]}, ${snap[at[0]][1]}) to the heap array.` : `(${snap[at[0]][0]}, ${snap[at[0]][1]}) moves up: smaller size.`, view(snap, at), {});
    r.step('sort', `Intervals sorted by start. Queries will be answered in increasing order (answers are stored by query value, so the original order is restored at the end).`, view(), {});
    for (const query of [...queries].sort((a, b) => a - b)) {
      r.op();
      q = query;
      r.step('loop', `Query ${query}: add every interval that starts at or before ${query}.`, view(), { query });
      while (i < intervals.length && intervals[i][0] <= query) {
        const [s, e] = intervals[i];
        if (!askedAdd) {
          askedAdd = true;
          r.predictChoice('add', `[${s}, ${e}] starts at ${s} ≤ ${query}. What size is pushed (size = end − start + 1)?`, String(e - s + 1), [String(e - s), String(e), String(e - s + 2)], i, 'Both endpoints are included, so the size is end − start + 1.');
        }
        heap.push([e - s + 1, e], watch);
        tones[i] = 'frontier';
        r.step('push', `Push [${s}, ${e}] with size ${e - s + 1}.`, view(), {});
        i++;
      }
      while (heap.size && heap.items[0][1] < query) {
        const gone = heap.pop();
        if (!askedExpire) {
          askedExpire = true;
          r.predict('expire', `The smallest interval in the heap ends at ${gone[1]}, which is before the query ${query}. What do we do?`, ['Pop it: it can never contain this or any later query', 'Keep it', 'Return -1'], 0, 'Queries are processed in increasing order, so an interval that ended before this query ends before all following ones too.');
        }
        r.step('pop', `The interval ending at ${gone[1]} is too early for query ${query}: discard it.`, view(), {});
      }
      const best = heap.size ? heap.items[0][0] : -1;
      if (!askedSet) {
        askedSet = true;
        r.predictChoice('set', `Query ${query}: the root of the heap is ${heap.size ? `size ${best}` : 'empty'}. What is the answer?`, String(best), [String(best + 1), best === -1 ? '0' : '-1', String(best + 2)], query, heap.size ? 'The heap root is the smallest interval that started at or before the query and has not ended before it.' : 'No interval contains the query: −1.');
      }
      answer.set(query, best);
      r.step('set', best === -1 ? `Query ${query}: no interval contains it → −1.` : `Query ${query}: the smallest containing interval has size ${best}.`, view(), { query, best });
    }
    const res = queries.map((x) => answer.get(x) as number);
    r.step('done', `Answers in the original query order: [${res.join(', ')}].`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ intervals, queries }) {
    return queries.map((q) => {
      const sizes = intervals.filter((p) => p[0] <= q && q <= p[1]).map((p) => p[1] - p[0] + 1);
      return sizes.length ? Math.min(...sizes) : -1;
    });
  },
});

export default problem({
  summary: 'You have intervals [left, right] (both ends included; the size of an interval is right − left + 1) and a list of query points. For each query, find the size of the smallest interval that contains it, or −1 if none does. Return the answers in the order of the queries.',
  example: ['intervals [[1, 3], [2, 2]], queries [2, 5]', '[1, -1]', 'Query 2 lies in both intervals; the smaller has size 1. Query 5 lies in none.'],
  pattern: ['intervals', ['intervals', 'heap', 'sorting', 'binary-search'], 'Process the queries from smallest to largest while sweeping through the sorted intervals. A min-heap of (size, end) holds the intervals that have started; the ones that ended before the query are discarded, and the root is the answer.', {
    heap: 'The heap is the key helper, and it works because the sweep order makes expired intervals permanently useless.',
    sorting: 'Sorting queries and intervals is what enables the sweep.',
    'binary-search': 'It is hard to binary search for "smallest size containing q" directly.',
  }],
  hints: [
    'Checking every interval for every query is O(n · q). How can sorting the queries help?',
    'For a query q, which intervals are candidates? Which can be discarded forever once q has passed their end?',
    'Sort intervals by start and queries ascending. Push (size, end) for intervals with start ≤ q; pop while the heap root ends before q; the root’s size is the answer.',
  ],
  insight: 'Answer the queries in increasing order so that an interval which has ended can be thrown away for good.',
  brute: 'For each query scan all intervals: O(n · q).',
  optimal: 'Sort + min-heap sweep: O((n + q) log(n + q)).',
  walk: ['Sort intervals by start; keep a pointer i.', 'For each query in sorted order, push intervals with start ≤ query as (size, end).', 'Pop while the root’s end < query.', 'Record the root’s size (or −1) in a dict; return the answers in the original order.'],
  edge: ['A query before every interval or after every interval.', 'Duplicate queries.', 'Intervals of size 1.', 'Both endpoints are included.'],
  works: ['After the pushes, the heap holds exactly the intervals that start at or before the query; popping the expired ones leaves those that contain it.', 'The smallest size among them is at the root.'],
  time: ['O((n + q) log n)', 'Sorting plus heap operations.'],
  space: ['O(n + q)', 'The heap and the answer dictionary.'],
  solution,
  cases,
  sig: 'def min_interval(intervals, queries):\n    # intervals: [left, right] pairs (both included); return, for each query, the size of the smallest interval containing it, or -1\n    pass\n',
  viz,
  fromArgs: ([intervals, queries]) => ({ intervals, queries }),
});
