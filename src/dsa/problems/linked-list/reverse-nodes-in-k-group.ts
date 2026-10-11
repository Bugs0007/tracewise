import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf, walk } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './reverse-nodes-in-k-group.py?raw';
import harness from './reverse-nodes-in-k-group.harness.py?raw';
import cases from './reverse-nodes-in-k-group.cases.json';

const viz = vizOf<{ values: number[]; k: number }>({
  id: 'reverse-nodes-in-k-group',
  title: 'Reverse Nodes in k-Group',
  solution,
  inputs: [
    { key: 'values', label: 'list values', kind: 'numbers', default: [1, 2, 3, 4, 5, 6, 7], maxItems: 10 },
    { key: 'k', label: 'k (group size)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'k = 3', input: { values: [1, 2, 3, 4, 5, 6, 7], k: 3 } },
    { label: 'k = 2', input: { values: [1, 2, 3, 4, 5], k: 2 } },
    { label: 'k = 1', input: { values: [1, 2, 3], k: 1 } },
    { label: 'k too large', input: { values: [1, 2], k: 3 } },
  ],
  validate: ({ k }) => (!Number.isInteger(k) || k < 1 ? 'k must be a whole number of at least 1' : null),
  run({ values, k }) {
    const r = new TraceRecorder(solution);
    const labels: (number | string)[] = ['D', ...values];
    const next = chain(labels.length);
    let gp: number | null = null;
    let kth: number | null = null;
    let gn: number | null = null;
    let prev: number | null = null;
    let curr: number | null = null;
    const view = (title: string, tones: Record<number, Tone> = {}) => [listFromIndices(labels, next, { title, tones, tags: tagsOf({ group_prev: gp, kth, group_next: gn, prev, curr }) })];
    r.step('dummy', 'A dummy node in front of the head lets the first group be hooked in like any other.', view('list ("D" is the dummy)'), {});
    gp = 0;
    r.step('gp', 'group_prev is the node just before the next group to reverse.', view('list', { 0: 'active' }), {});
    let askedKth = false;
    for (;;) {
      kth = gp;
      r.step('findStart', `Look ahead ${k} node${k === 1 ? '' : 's'} from group_prev to see whether a full group remains.`, view('looking for k nodes', { [gp!]: 'active' }), { k });
      let ok = true;
      for (let s = 0; s < k; s++) {
        kth = next[kth!];
        if (kth === null) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        r.predict('short', `Fewer than ${k} nodes remain after ${labels[gp!]}. What happens?`, ['Stop: leave the rest as it is', 'Reverse what is left anyway'], 0, 'Only complete groups of k are reversed; a short leftover keeps its order.');
        kth = null;
        r.step('short', `Not enough nodes left for a full group of ${k}. Stop and leave the rest unchanged.`, view('done', Object.fromEntries(walk(next, next[0]).map((q) => [q, 'found'])) as Record<number, Tone>), {});
        break;
      }
      if (!askedKth) {
        askedKth = true;
        r.predict('full', `Is there a complete group of ${k} after group_prev?`, ['Yes: kth lands on the last node of the group', 'No: the list is too short'], 0, `Walking ${k} steps from group_prev lands on the group's last node, called kth.`);
      }
      r.step('findStep', `kth = ${labels[kth!]}: the last node of this group.`, view('a full group', Object.fromEntries(walk(next, next[gp!]).slice(0, k).map((q) => [q, 'frontier'])) as Record<number, Tone>), { kth: labels[kth!] });
      gn = next[kth!];
      r.step('next', `group_next = ${gn === null ? 'None' : labels[gn]}: the first node after the group. The reversed group will be linked to it.`, view('group_next remembered', {}), { group_next: gn === null ? 'None' : labels[gn] });
      prev = gn;
      curr = next[gp!];
      r.step('revInit', 'Reverse the group in place. prev starts as group_next so the reversed group ends up pointing there.', view('reversing', {}), {});
      while (curr !== gn) {
        const nxt: number | null = next[curr!];
        next[curr!] = prev;
        r.step('revFlip', `${labels[curr!]}.next → ${prev === null ? 'None' : labels[prev]}.`, view('reversing', { [curr!]: 'swap' }), { curr: labels[curr!] });
        prev = curr;
        curr = nxt;
      }
      const tmp: number = next[gp!] as number;
      r.step('tmp', `tmp = group_prev.next = ${labels[tmp]}: this was the group's first node and is now its last.`, view('hooking the group in', {}), { tmp: labels[tmp] });
      next[gp!] = kth;
      r.step('hook', `group_prev.next = kth: ${labels[gp!]} → ${labels[kth!]}. The group is hooked in, reversed.`, view('hooked in', Object.fromEntries(walk(next, next[0]).slice(0, 12).map((q) => [q, 'done'])) as Record<number, Tone>), {});
      gp = tmp;
      kth = null;
      gn = null;
      prev = null;
      curr = null;
      r.step('advance', `group_prev = tmp (${labels[gp]}): ready for the next group.`, view('next group', { [gp]: 'active' }), {});
    }
    const out = walk(next, next[0]).map((q) => labels[q] as number);
    r.step('done', `Result: ${out.length ? out.join(' → ') : 'an empty list'}.`, [listFromIndices(out, chain(out.length), { title: 'result', tones: Object.fromEntries(out.map((_, q) => [q, 'found'])) as Record<number, Tone> })], { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ values, k }) {
    const out: number[] = [];
    for (let i = 0; i < values.length; i += k) {
      const chunk = values.slice(i, i + k);
      out.push(...(chunk.length === k ? chunk.reverse() : chunk));
    }
    return out;
  },
});

export default problem({
  summary: 'Given a linked list and a number k, reverse the nodes in consecutive groups of k and return the new list. If the final group has fewer than k nodes, leave it as it is. Reconnect the nodes themselves rather than copying values.',
  example: ['list = 1 → 2 → 3 → 4 → 5 → 6 → 7, k = 3', '3 → 2 → 1 → 6 → 5 → 4 → 7', 'Two full groups are reversed; the lone 7 is a short group and stays.'],
  pattern: ['linked-list', ['linked-list', 'stack', 'divide-conquer', 'two-pointers'], 'Reverse each group of k with the standard in-place reversal, and carefully hook it between the end of the previous group and the start of the next one. A dummy head and a group_prev pointer make that bookkeeping clean.', {
    stack: 'Pushing k nodes and popping them reverses a group but uses O(k) memory and is clumsy to relink.',
    'divide-conquer': 'A recursive version exists, but the iterative one uses O(1) space.',
    'two-pointers': 'Several pointers are in play, but the skill being tested is rewiring.',
  }],
  hints: [
    'First, how will you know whether a full group of k nodes remains before you start reversing it?',
    'Reversing one group is the normal reverse-list loop, except it must stop at the group boundary and the reversed group must point to what follows it.',
    'Keep group_prev (the node before the group). Find kth, remember group_next = kth.next, reverse the nodes in between with prev starting at group_next, then hook group_prev.next = kth and move group_prev to the old first node.',
  ],
  insight: 'Per group: look ahead k nodes, reverse them with prev starting at the node after the group, then hook the group between group_prev and group_next.',
  brute: 'Copy values into an array, reverse each chunk, and rebuild the list: O(n) time and space.',
  optimal: 'In-place group reversal: O(n) time, O(1) space.',
  walk: ['Put a dummy node before the head and set group_prev = dummy.', 'Walk kth forward k nodes from group_prev. If you run off the end, stop: the rest stays as it is.', 'Set group_next = kth.next. Reverse the nodes from group_prev.next up to group_next, starting with prev = group_next.', 'Save tmp = group_prev.next (the old first node, now the group’s last), set group_prev.next = kth, then group_prev = tmp. Repeat.'],
  edge: ['k = 1: nothing changes.', 'k equal to the length: the whole list reverses.', 'k larger than the length: unchanged.', 'A leftover group shorter than k.'],
  works: ['Starting prev at group_next makes the first node of the group point to the rest of the list after reversal, so the chain stays connected.', 'Each node is relinked once, and the leftover short group is never touched.'],
  time: ['O(n)', 'Each node is visited a constant number of times.'],
  space: ['O(1)', 'A handful of pointers.'],
  solution,
  cases,
  sig: 'def reverse_k_group(head, k):\n    # reverse each full group of k nodes; leave a short last group alone; return the head\n    pass\n',
  harness,
  viz,
  fromArgs: ([values, k]) => ({ values, k }),
});
