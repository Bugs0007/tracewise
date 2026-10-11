import type { Tone } from '@/engine/types';
import { chipsView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './last-stone-weight.py?raw';
import cases from './last-stone-weight.cases.json';

const viz = vizOf<{ stones: number[] }>({
  id: 'last-stone-weight',
  title: 'Last Stone Weight',
  solution,
  inputs: [{ key: 'stones', label: 'stone weights', kind: 'numbers', default: [2, 7, 4, 1, 8, 1], maxItems: 9 }],
  presets: [
    { label: 'Classic', input: { stones: [2, 7, 4, 1, 8, 1] } },
    { label: 'Everything cancels', input: { stones: [3, 3, 5, 5] } },
    { label: 'Single stone', input: { stones: [5] } },
    { label: 'Empty', input: { stones: [] } },
  ],
  validate: ({ stones }) => (stones.some((s) => s === null || !Number.isInteger(s) || s < 1) ? 'Stones must be whole numbers of at least 1' : null),
  run({ stones }) {
    const r = new TraceRecorder(solution);
    const heap = new MinHeap<number>([]);
    const log: string[] = [];
    const view = (items: number[], at: number[] = []) => [
      ...heapView(items, { title: 'max-heap stored as negatives (root = heaviest stone)', tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }),
      chipsView(log, { title: 'smashes so far' }),
    ];
    const watch = (anchor: string): Watch<number> => (what, snap, at) =>
      r.step(anchor, what === 'append' ? `Place ${snap[at[0]]} at the end of the array.` : what === 'up' ? `${snap[at[0]]} swaps upward: it is smaller (heavier) than its parent.` : what === 'root' ? `The last element ${snap[0]} moves to the root and sinks down.` : `Sift down from index ${at[0]}.`, view(snap, at), {});
    heap.items = stones.map((s) => -s);
    r.step('build', `Negate every weight: heapq is a min-heap, so the heaviest stone becomes the most negative value, the root. List: [${heap.items.join(', ')}].`, view(heap.items), {});
    heap.heapify(watch('heapify'));
    r.step('heapify', 'heapify arranges the negatives into a valid heap.', view(heap.items, heap.items.length ? [0] : []), {});
    let askedPop = false;
    let askedSmash = false;
    let askedEqual = false;
    while (heap.size > 1) {
      r.op();
      if (!askedPop) {
        askedPop = true;
        r.predict('pop', `The heap holds negatives. What does heappop return first?`, ['The heaviest stone (as a negative)', 'The lightest stone', 'The last stone added'], 0, 'The most negative value is the smallest, and that belongs to the heaviest stone.');
      }
      const first = -heap.pop(watch('popFirst'));
      r.step('popFirst', `Take the heaviest stone: ${first}.`, view(heap.items), { first });
      const second = -heap.pop(watch('popSecond'));
      r.step('popSecond', `Take the next heaviest: ${second}.`, view(heap.items), { second });
      if (first !== second) {
        if (!askedSmash) {
          askedSmash = true;
          r.predictChoice('smash', `Smash ${first} against ${second}. What weight is pushed back?`, String(first - second), [String(first + second), String(second), String(first)], first, 'The lighter stone is destroyed and the heavier loses that much weight.');
        }
        log.push(`${first} vs ${second} → ${first - second}`);
        r.step('differ', `${first} ≠ ${second}: the stone of weight ${first - second} survives.`, view(heap.items), {});
        heap.push(-(first - second), watch('pushDiff'));
        r.step('pushDiff', `Push -${first - second} back into the heap.`, view(heap.items), {});
      } else {
        if (!askedEqual) {
          askedEqual = true;
          r.predict('equal', `${first} and ${second} are equal. What is pushed back?`, ['Nothing: both stones vanish', 'A stone of weight 0', `A stone of weight ${first}`], 0, 'Equal stones destroy each other completely.');
        }
        log.push(`${first} vs ${second} → both gone`);
        r.step('differ', `${first} = ${second}: both stones are destroyed, nothing is pushed.`, view(heap.items), {});
      }
    }
    const res = heap.size ? -heap.items[0] : 0;
    r.step('done', heap.size ? `One stone is left, weighing ${res}.` : 'No stones are left: the answer is 0.', view(heap.items, heap.size ? [0] : []), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ stones }) {
    const s = [...stones].sort((a, b) => a - b);
    while (s.length > 1) {
      const a = s.pop() as number;
      const b = s.pop() as number;
      if (a !== b) {
        s.push(a - b);
        s.sort((x, y) => x - y);
      }
    }
    return s.length ? s[0] : 0;
  },
});

export default problem({
  summary: 'You have a pile of stones with given weights. Repeatedly take the two heaviest stones and smash them together: if they weigh the same, both disappear; otherwise the lighter disappears and the heavier loses the lighter’s weight. Return the weight of the last stone, or 0 if none remain.',
  example: ['stones [3, 9, 4]', '2', '9 and 4 smash into 5; then 5 and 3 smash into 2.'],
  pattern: ['heap', ['heap', 'sorting', 'greedy', 'stack'], 'Each round needs the two largest items of a collection that keeps changing. A max-heap hands them over in O(log n) and accepts the leftover.', {
    sorting: 'Sorting once is not enough because the new stone must be inserted in order each round.',
    greedy: 'The rule is greedy by definition, but the structure that makes it fast is the heap.',
    stack: 'A stack gives the most recent item, not the largest.',
  }],
  hints: [
    'What do you need to be able to do quickly in every round?',
    'You repeatedly remove the largest elements and insert a new one. Which structure does that well?',
    'Python only has a min-heap: store negatives. Pop two, push the difference (if any), repeat while more than one stone remains.',
  ],
  insight: 'A max-heap (negated min-heap) gives the heaviest stone each time and lets the leftover rejoin.',
  brute: 'Re-sort the list every round: O(n² log n).',
  optimal: 'Heap: O(n log n) in total.',
  walk: ['Negate every weight and heapify.', 'While more than one stone remains, pop two and undo the negation.', 'If their weights differ, push the negated difference.', 'Return the remaining stone (negated back) or 0.'],
  edge: ['No stones.', 'One stone.', 'Everything cancels out.', 'A very heavy stone and many light ones.'],
  works: ['Each round the two largest values are removed exactly as the rules say, and the result is reinserted.', 'The loop ends because every round removes at least one stone.'],
  time: ['O(n log n)', 'At most n rounds, each with a constant number of heap operations.'],
  space: ['O(n)', 'The heap.'],
  solution,
  cases,
  sig: 'def last_stone_weight(stones):\n    # return the weight of the last stone, or 0\n    pass\n',
  viz,
  fromArgs: ([stones]) => ({ stones }),
});
