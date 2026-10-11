import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './merge-two-sorted-lists.py?raw';
import harness from './merge-two-sorted-lists.harness.py?raw';
import cases from './merge-two-sorted-lists.cases.json';

const sortedCheck = (v: number[]): boolean => v.every((x, i) => !i || x >= v[i - 1]);

const viz = vizOf<{ a: number[]; b: number[] }>({
  id: 'merge-two-sorted-lists',
  title: 'Merge Two Sorted Lists',
  solution,
  inputs: [
    { key: 'a', label: 'list 1 (sorted)', kind: 'numbers', default: [1, 4, 9], maxItems: 6 },
    { key: 'b', label: 'list 2 (sorted)', kind: 'numbers', default: [2, 3, 10], maxItems: 6 },
  ],
  presets: [
    { label: 'Interleaving', input: { a: [1, 4, 9], b: [2, 3, 10] } },
    { label: 'One list first', input: { a: [1, 2, 3], b: [7, 8] } },
    { label: 'One empty', input: { a: [], b: [5, 6] } },
    { label: 'Duplicates', input: { a: [2, 2, 5], b: [2, 5, 5] } },
  ],
  validate: ({ a, b }) => (!sortedCheck(a) || !sortedCheck(b) ? 'Both lists must be sorted from smallest to largest' : null),
  run({ a, b }) {
    const r = new TraceRecorder(solution);
    let i: number | null = a.length ? 0 : null;
    let j: number | null = b.length ? 0 : null;
    const out: number[] = [];
    const view = (hot: Tone | null = null) => {
      const ta: Record<number, Tone> = {};
      const tb: Record<number, Tone> = {};
      a.forEach((_, k) => {
        if (i === null || k < i) ta[k] = 'muted';
      });
      b.forEach((_, k) => {
        if (j === null || k < j) tb[k] = 'muted';
      });
      if (i !== null && hot) ta[i] = hot;
      if (j !== null && hot) tb[j] = hot;
      const panels = [listFromIndices(a, chain(a.length), { title: 'l1', tones: ta, tags: tagsOf({ l1: i }) }), listFromIndices(b, chain(b.length), { title: 'l2', tones: tb, tags: tagsOf({ l2: j }) })];
      panels.push(listFromIndices(['dummy', ...out], chain(out.length + 1), { title: 'merged list so far (tail is the last node)', tones: Object.fromEntries(out.map((_, k) => [k + 1, 'done'])) as Record<number, Tone>, tags: tagsOf({ tail: out.length }) }));
      return panels;
    };
    r.step('dummy', 'A dummy node gives the merged list a starting point, so the first real node needs no special case.', view(), {});
    r.step('tail', 'tail points at the end of the merged list so far.', view(), {});
    while (i !== null && j !== null) {
      r.op();
      const first = a[i] <= b[j];
      r.step('cmp', `Compare the two heads: ${a[i]} (l1) versus ${b[j]} (l2).`, view('compare'), { l1: a[i], l2: b[j] });
      r.predict(first ? 'one' : 'two', `${a[i]} (from l1) versus ${b[j]} (from l2). Which node is attached next?`, [`${a[i]}, from l1 (it is ≤ ${b[j]})`, `${b[j]}, from l2 (it is smaller)`], first ? 0 : 1, 'The smaller head must come next, because both lists are sorted. Ties go to l1.');
      if (first) {
        out.push(a[i]);
        i = i + 1 < a.length ? i + 1 : null;
        r.step('take1', `Attach l1's ${out[out.length - 1]} to the merged list and advance l1.`, view(), { added: out[out.length - 1] });
      } else {
        out.push(b[j]);
        j = j + 1 < b.length ? j + 1 : null;
        r.step('take2', `Attach l2's ${out[out.length - 1]} to the merged list and advance l2.`, view(), { added: out[out.length - 1] });
      }
      r.step('move', 'tail moves to the node we just added.', view(), { merged: out.length });
    }
    const rest = i !== null ? a.slice(i) : j !== null ? b.slice(j) : [];
    r.predict('rest', `One list is used up. ${rest.length ? `The other still has ${rest.join(', ')}.` : 'Both are used up.'} What happens to what is left?`, ['It is attached as one piece: it is already sorted', 'Each leftover value is compared again one by one'], 0, 'The leftover is a sorted run bigger than everything merged, so one pointer assignment finishes the job.');
    out.push(...rest);
    r.step('rest', rest.length ? `tail.next = the remaining list (${rest.join(' → ')}). No more comparing is needed.` : 'Both lists are exhausted: tail.next is None.', [listFromIndices(['dummy', ...out], chain(out.length + 1), { title: 'merged list', tones: Object.fromEntries(out.map((_, k) => [k + 1, 'done'])) as Record<number, Tone> })], { rest: rest.length });
    r.step('done', `Return dummy.next: ${out.length ? out.join(' → ') : 'an empty list'}.`, [listFromIndices(out, chain(out.length), { title: 'result', tones: Object.fromEntries(out.map((_, k) => [k, 'found'])) as Record<number, Tone> })], { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ a, b }) {
    return [...a, ...b].sort((x, y) => x - y);
  },
});

export default problem({
  summary: 'Two linked lists are each sorted from smallest to largest. Join them into one sorted list by reusing their nodes, and return its first node.',
  example: ['l1 = 1 → 5 → 8, l2 = 2 → 3 → 9', '1 → 2 → 3 → 5 → 8 → 9', 'Always take the smaller of the two front nodes next.'],
  pattern: ['linked-list', ['linked-list', 'two-pointers', 'heap', 'sorting'], 'Walk both lists with one pointer each and splice the smaller node onto a growing tail. A dummy head removes the special case for the first node.', {
    'two-pointers': 'Two pointers, one per list, is exactly the approach; the linked-list part is how you splice nodes onto a tail with a dummy head.',
    heap: 'A heap is for merging many lists. Two lists need only two comparisons per step.',
    sorting: 'Re-sorting would waste the fact that both lists are already sorted.',
  }],
  hints: [
    'At each step, which node must come next in the merged list? You only need to look at the two front nodes.',
    'Keep a tail pointer to the end of the merged list. What awkward case appears when the merged list is still empty?',
    'Start with a dummy node and attach the smaller front node to tail.next each time. When one list ends, attach the other list whole.',
  ],
  insight: 'A dummy head plus a tail pointer: repeatedly attach the smaller front node, then attach whatever remains.',
  brute: 'Dump both lists into an array, sort, and rebuild: O((m + n) log (m + n)).',
  optimal: 'Splice nodes with two pointers: O(m + n) time, O(1) extra space.',
  walk: ['Create dummy and set tail = dummy.', 'While both lists have nodes, compare their front values (ties take l1), attach the smaller node to tail.next and advance that list.', 'Move tail to the node just attached.', 'When one list runs out, set tail.next to the other list. Return dummy.next.'],
  edge: ['One or both lists empty.', 'Equal values in both lists.', 'One list entirely smaller than the other.', 'Lists of different lengths.'],
  works: ['The merged list so far contains the smallest values in order. Taking the smaller front node keeps it sorted and never skips a smaller value, since each list is sorted.', 'Each node is attached once, so the work is linear.'],
  time: ['O(m + n)', 'Each node is attached exactly once.'],
  space: ['O(1)', 'Nodes are reused; only a few pointers are stored.'],
  solution,
  cases,
  sig: 'def merge_two_lists(l1, l2):\n    # l1 and l2 are sorted ListNode lists (or None); return the head of the merged sorted list\n    pass\n',
  harness,
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
