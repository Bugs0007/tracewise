import type { Tone } from '@/engine/types';
import { chipsView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './find-median-from-data-stream.py?raw';
import harness from './find-median-from-data-stream.harness.py?raw';
import cases from './find-median-from-data-stream.cases.json';

const OPS = ['add_num', 'find_median'];
const parse = (line: string): { op: string; arg?: number } => {
  const [op, a] = line.trim().split(/\s+/);
  return { op, arg: a === undefined ? undefined : Number(a) };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'find-median-from-data-stream',
  title: 'Find Median from Data Stream',
  solution,
  inputs: [{ key: 'ops', label: 'operations: add_num N / find_median', kind: 'strings', default: ['add_num 5', 'add_num 2', 'find_median', 'add_num 8', 'find_median', 'add_num 1', 'find_median'], maxItems: 14 }],
  presets: [
    { label: 'Median shifts', input: { ops: ['add_num 5', 'add_num 2', 'find_median', 'add_num 8', 'find_median', 'add_num 1', 'find_median'] } },
    { label: 'Descending', input: { ops: ['add_num 9', 'add_num 5', 'add_num 1', 'find_median', 'add_num 0', 'find_median'] } },
    { label: 'Duplicates', input: { ops: ['add_num 4', 'add_num 4', 'add_num 4', 'find_median'] } },
  ],
  validate: ({ ops }) => {
    let size = 0;
    for (const line of ops) {
      const { op, arg } = parse(line);
      if (!OPS.includes(op)) return `Unknown operation "${op}". Use add_num N or find_median`;
      if (op === 'add_num') {
        if (arg === undefined || !Number.isFinite(arg)) return 'add_num needs a number, like "add_num 4"';
        size++;
      } else if (!size) return 'find_median is called before any number was added';
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    const low = new MinHeap<number>([]); // negatives: a max-heap
    const high = new MinHeap<number>([]);
    const out: (number | null)[] = [null];
    const show = (l: number[], h: number[], atL: number[] = [], atH: number[] = []) => [
      ...heapView(l.map((x) => -x), { title: 'low half (max-heap, root = largest of the small numbers)', max: true, tones: Object.fromEntries(atL.map((i) => [i, 'active' as Tone])) }),
      ...heapView(h, { title: 'high half (min-heap, root = smallest of the big numbers)', tones: Object.fromEntries(atH.map((i) => [i, 'active' as Tone])) }),
      chipsView(out.map((x) => (x === null ? 'None' : x)), { title: 'results of each call' }),
    ];
    const watchLow = (anchor: string): Watch<number> => (what, snap, at) => r.step(anchor, what === 'append' ? `Place ${-snap[at[0]]} at the end of the low heap.` : what === 'up' ? `${-snap[at[0]]} swaps upward in the low heap.` : 'The last element moves to the root of the low heap and sinks.', show(snap, high.items, at, []), {});
    const watchHigh = (anchor: string): Watch<number> => (what, snap, at) => r.step(anchor, what === 'append' ? `Place ${snap[at[0]]} at the end of the high heap.` : what === 'up' ? `${snap[at[0]]} swaps upward in the high heap.` : 'The last element moves to the root of the high heap and sinks.', show(low.items, snap, [], at), {});
    r.step('init', 'Two heaps: low holds the smaller half (a max-heap built from negatives), high holds the larger half (a min-heap). Their roots are the middle values.', show([], []), {});
    let askedMove = false;
    let askedBalance = false;
    let askedMedian = false;
    for (const line of ops) {
      const { op, arg } = parse(line);
      r.op();
      if (op === 'add_num') {
        const num = arg as number;
        low.push(-num, watchLow('pushLow'));
        r.step('pushLow', `add_num(${num}): push it into the low half first.`, show(low.items, high.items, [0], []), { num });
        if (!askedMove && low.size > 1) {
          askedMove = true;
          const maxLow = Math.max(...low.items.map((x) => -x));
          r.predictChoice('move', `Now move the largest of the low half to the high half. Which number moves?`, String(maxLow), [String(Math.min(...low.items.map((x) => -x))), String(num === maxLow ? maxLow + 1 : num), String(maxLow + 1)], num, 'The low heap’s root is its largest value; moving it keeps every low number ≤ every high number.');
        }
        const moved = -low.pop(watchLow('move'));
        r.step('move', `Pop the largest of low (${moved}) ...`, show(low.items, high.items), { moved });
        high.push(moved, watchHigh('move'));
        r.step('move', `... and push ${moved} into the high half.`, show(low.items, high.items, [], [high.items.indexOf(moved)]), {});
        if (high.size > low.size) {
          if (!askedBalance) {
            askedBalance = true;
            r.predict('balance', `The high half has ${high.size} numbers, the low half ${low.size}. What now?`, ['Move the smallest of high back to low', 'Do nothing', 'Remove one number'], 0, 'low must keep the same size as high or one more, so the middle value is always at a root.');
          }
          const back = high.pop(watchHigh('back'));
          r.step('balance', `high is larger than low. Pop its smallest (${back}) ...`, show(low.items, high.items), { back });
          low.push(-back, watchLow('back'));
          r.step('back', `... and push it into low.`, show(low.items, high.items), {});
        } else {
          r.step('balance', `Sizes are balanced (low ${low.size}, high ${high.size}).`, show(low.items, high.items), {});
        }
        out.push(null);
      } else {
        let res: number;
        if (low.size > high.size) {
          res = -low.items[0];
          r.step('oddRet', `low has one more element, so the median is its root: ${res}.`, show(low.items, high.items, [0], []), { result: res });
        } else {
          if (!askedMedian) {
            askedMedian = true;
            const exp = (-low.items[0] + high.items[0]) / 2;
            r.predictChoice('median', `low's root is ${-low.items[0]} and high's root is ${high.items[0]}. The counts are equal. What is the median?`, String(exp), [String(-low.items[0]), String(high.items[0]), String(exp + 0.5)], high.items[0], 'With an even count the median is the average of the two middle values, the two roots.');
          }
          res = (-low.items[0] + high.items[0]) / 2;
          r.step('even', `Equal sizes: the median is the average of the two roots, (${-low.items[0]} + ${high.items[0]}) / 2 = ${res}.`, show(low.items, high.items, [0], [0]), { result: res });
        }
        out.push(res);
      }
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    const nums: number[] = [];
    const out: (number | null)[] = [null];
    for (const line of ops) {
      const { op, arg } = parse(line);
      if (op === 'add_num') {
        nums.push(arg as number);
        out.push(null);
      } else {
        const s = [...nums].sort((a, b) => a - b);
        const m = s.length >> 1;
        out.push(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Design a structure that receives numbers one at a time and can report the median of everything received so far at any moment. With an even count the median is the average of the two middle values.',
  example: ['add 5, add 2, median, add 8, median', 'None, None, 3.5, None, 5.0', 'Sorted [2, 5] has median 3.5; sorted [2, 5, 8] has median 5.'],
  pattern: ['two-heaps', ['two-heaps', 'heap', 'sorting', 'binary-search'], 'Split the numbers into a small half and a large half. A max-heap holds the small half and a min-heap the large half, so the middle value(s) are always at the two roots.', {
    heap: 'One heap gives only the minimum or maximum, not the middle. Two heaps, one for each half, give the median.',
    sorting: 'Re-sorting or inserting into a sorted list costs O(n) per number.',
    'binary-search': 'Binary search finds the insert position but shifting the list is still O(n).',
  }],
  hints: [
    'The median is the boundary between the smaller half and the larger half. What do you need to be able to read quickly at that boundary?',
    'The largest of the small half and the smallest of the large half. Which structures give those?',
    'Keep a max-heap low and a min-heap high with sizes equal or low one larger. Insert, move one number across, and rebalance.',
  ],
  insight: 'Two heaps meeting in the middle keep the median at their roots with O(log n) updates.',
  brute: 'Sort on every query: O(n log n) per median, or keep a sorted list with O(n) inserts.',
  optimal: 'Two heaps: O(log n) per add, O(1) per median.',
  walk: ['low is a max-heap (store negatives), high is a min-heap.', 'add_num: push the number into low, pop low’s largest into high.', 'If high has more elements than low, move high’s smallest back to low.', 'find_median: if low is larger, return its root; otherwise return the average of the two roots.'],
  edge: ['Single number.', 'Duplicates.', 'Numbers added in sorted or reverse order.', 'Negative numbers.'],
  works: ['Every number in low is ≤ every number in high, because each add routes through low into high before rebalancing.', 'The size rule puts the middle element(s) exactly at the roots.'],
  time: ['O(log n) per add, O(1) per median', 'Heap operations on at most n numbers.'],
  space: ['O(n)', 'All numbers are stored.'],
  solution,
  cases,
  sig: 'class MedianFinder:\n    def __init__(self):\n        pass\n\n    def add_num(self, num):\n        pass\n\n    def find_median(self):\n        # return the median as a float\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => ((args as number[][])[i + 1].length ? `${o} ${(args as number[][])[i + 1][0]}` : o)) }),
});
