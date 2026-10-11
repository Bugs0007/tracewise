import type { Tone } from '@/engine/types';
import { arrayView, chipsView, heapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './merge-k-sorted-lists.py?raw';
import harness from './merge-k-sorted-lists.harness.py?raw';
import cases from './merge-k-sorted-lists.cases.json';

type HE = [val: number, list: number, pos: number];
const less = (a: HE, b: HE): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
function push(h: HE[], x: HE): void {
  h.push(x);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
}
function pop(h: HE[]): HE {
  const top = h[0];
  const last = h.pop()!;
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const rr = l + 1;
      let m = i;
      if (l < h.length && less(h[l], h[m])) m = l;
      if (rr < h.length && less(h[rr], h[m])) m = rr;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
  return top;
}

const viz = vizOf<{ lists: number[][] }>({
  id: 'merge-k-sorted-lists',
  title: 'Merge K Sorted Lists',
  solution,
  inputs: [{ key: 'lists', label: 'lists (each sorted), as JSON', kind: 'json', default: [[1, 4, 7], [2, 5, 8], [0, 9]] }],
  presets: [
    { label: 'Three lists', input: { lists: [[1, 4, 7], [2, 5, 8], [0, 9]] } },
    { label: 'Some empty', input: { lists: [[], [2, 4], [], [1, 3]] } },
    { label: 'Duplicates', input: { lists: [[1, 1, 2], [1, 2, 2], [2]] } },
    { label: 'No lists', input: { lists: [] } },
  ],
  validate: ({ lists }) => {
    if (!Array.isArray(lists) || lists.length > 4 || lists.some((l) => !Array.isArray(l) || l.length > 5 || l.some((x) => typeof x !== 'number'))) return 'Use at most 4 lists of at most 5 numbers, like [[1,4],[2,5]]';
    return lists.some((l) => l.some((x, i) => i && x < l[i - 1])) ? 'Every list must be sorted' : null;
  },
  run({ lists }) {
    const r = new TraceRecorder(solution);
    const heap: HE[] = [];
    const out: number[] = [];
    const used = lists.map(() => 0);
    const view = (hot: Record<number, Tone> = {}) => {
      const panels = lists.map((l, i) => arrayView(l.length ? l : [], { title: `list ${i}${l.length ? '' : ' (empty)'}`, tones: Object.fromEntries(l.map((_, k) => [k, k < used[i] ? 'muted' : k === used[i] ? hot[i] ?? 'default' : 'default'])) as Record<number, Tone>, hideIndex: true }));
      const [tree, arr] = heap.length ? heapView(heap.map((h) => h[0]), { title: 'min-heap of each list’s front value' }) : [null, null];
      return [...panels, ...(tree ? [tree, arr!] : []), chipsView(out, { title: 'merged list so far', emptyText: 'none yet', tones: Object.fromEntries(out.map((_, k) => [k, 'done'])) as Record<number, Tone> })];
    };
    r.step('init', 'The heap holds one candidate per list: that list’s current front value. Its minimum is the next value of the merged list.', view(), {});
    lists.forEach((l, i) => {
      r.step('seed', `List ${i}${l.length ? ` starts with ${l[0]}` : ' is empty, so it adds nothing'}.`, view(), { list: i });
      if (l.length) {
        push(heap, [l[0], i, 0]);
        r.step('seedPush', `Push (${l[0]}, list ${i}) onto the heap.`, view({ [i]: 'active' }), { size: heap.length });
      }
    });
    r.step('dummy', 'A dummy head and a tail pointer will build the merged list.', view(), {});
    let askedPop = false;
    let askedNext = false;
    while (heap.length) {
      r.op();
      const top = heap[0];
      if (!askedPop) {
        askedPop = true;
        r.predictChoice('pop', 'Which value does the heap give back next?', String(top[0]), heap.slice(1).map((h) => String(h[0])).concat(String(top[0] + 1)), heap.length, 'A min-heap always returns its smallest element, which is the smallest front value among all lists.');
      }
      pop(heap);
      used[top[1]] = top[2] + 1;
      out.push(top[0]);
      const hasNext = top[2] + 1 < lists[top[1]].length;
      r.step('pop', `Pop (${top[0]}, list ${top[1]}): the smallest front value overall. Attach it to the merged list.`, view({ [top[1]]: 'found' }), { val: top[0], list: top[1] });
      if (!askedNext) {
        askedNext = true;
        r.predict('next', `List ${top[1]} gave up its front value. What goes into the heap in its place?`, ['The next value of the same list (if any)', 'Nothing: the heap just shrinks', 'The front of the next list'], hasNext ? 0 : 1, 'The heap must always contain the current front of every non-empty list, so the popped list contributes its next value.');
      }
      r.step('attach', `tail.next = that node. Merged so far: ${out.join(' → ')}.`, view(), { merged: out.length });
      if (hasNext) {
        const nv = lists[top[1]][top[2] + 1];
        push(heap, [nv, top[1], top[2] + 1]);
        r.step('pushNext', `${top[0]} has a next node ${nv}: push (${nv}, list ${top[1]}).`, view({ [top[1]]: 'active' }), { pushed: nv });
      }
    }
    r.step('done', `The heap is empty, so every node was merged: ${out.length ? out.join(' → ') : 'an empty list'}.`, view(), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ lists }) {
    return lists.flat().sort((a, b) => a - b);
  },
});

export default problem({
  summary: 'You are given several linked lists, each sorted. Merge them into one sorted list and return its head.',
  example: ['lists = [1 → 5], [2 → 3 → 9], [4]', '1 → 2 → 3 → 4 → 5 → 9', 'At every step the next node is the smallest front node among all the lists.'],
  pattern: ['heap', ['heap', 'divide-conquer', 'linked-list', 'sorting'], 'At each step you need the smallest of k front values. A min-heap of the k fronts gives it in O(log k).', {
    'divide-conquer': 'Merging lists pairwise in rounds also gets O(N log k). The heap version is shorter to write.',
    'linked-list': 'The output is built with a dummy head and tail, but choosing the next node is the heap’s job.',
    sorting: 'Collecting and sorting everything costs O(N log N) and ignores that the lists are already sorted.',
  }],
  hints: [
    'With two lists you compare two fronts. With k lists you need the smallest of k fronts at every step. How could you get that quickly?',
    'A min-heap keeps the smallest of its items at the top. What should it contain?',
    'Put the front node of every non-empty list on a heap. Pop the smallest, append it to the result, and push the next node of that same list.',
  ],
  insight: 'A min-heap holds one candidate per list. Pop the smallest, then push the next node from the same list.',
  brute: 'Collect all values and sort: O(N log N). Or scan all k fronts each step: O(N·k).',
  optimal: 'Min-heap of k fronts: O(N log k) time, O(k) extra space.',
  walk: ['Push (value, list index, node) for the head of every non-empty list. The list index breaks ties so nodes are never compared.', 'Create a dummy head and a tail.', 'While the heap is not empty: pop the smallest, attach it to tail and move tail.', 'If the popped node has a next node, push that onto the heap. Return dummy.next.'],
  edge: ['No lists at all.', 'Some or all lists are empty.', 'Equal values across lists (the index breaks the tie).', 'A single list.'],
  works: ['The heap always contains the current front of every non-empty list, and each list is sorted, so its minimum is the smallest value not yet merged.', 'Each of the N nodes is pushed and popped once at O(log k) each.'],
  time: ['O(N log k)', 'N nodes in total, each heap operation costs O(log k).'],
  space: ['O(k)', 'The heap holds at most one node per list.'],
  solution,
  cases,
  sig: 'import heapq\n\n\ndef merge_k_lists(lists):\n    # lists is a list of sorted ListNode lists (or None); return the head of the merged list\n    pass\n',
  harness,
  viz,
  fromArgs: ([lists]) => ({ lists }),
});
