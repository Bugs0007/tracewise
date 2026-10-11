import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf, walk } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './reverse-linked-list.py?raw';
import harness from './reverse-linked-list.harness.py?raw';
import cases from './reverse-linked-list.cases.json';

const viz = vizOf<{ values: number[] }>({
  id: 'reverse-linked-list',
  title: 'Reverse Linked List',
  solution,
  inputs: [{ key: 'values', label: 'list values', kind: 'numbers', default: [4, 8, 15, 16, 23], maxItems: 8 }],
  presets: [
    { label: 'Five nodes', input: { values: [4, 8, 15, 16, 23] } },
    { label: 'Two nodes', input: { values: [1, 2] } },
    { label: 'Single node', input: { values: [7] } },
    { label: 'Empty', input: { values: [] } },
  ],
  run({ values }) {
    const r = new TraceRecorder(solution);
    const n = values.length;
    const next = chain(n);
    let prev: number | null = null;
    let curr: number | null = n ? 0 : null;
    let nxt: number | null = null;
    const done = new Set<number>();
    const view = (hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      done.forEach((i) => (tones[i] = 'done'));
      if (nxt !== null) tones[nxt] = 'frontier';
      if (curr !== null && hot) tones[curr] = hot;
      return [listFromIndices(values, next, { title: 'the list: each arrow is a next pointer', tones, tags: tagsOf({ prev, curr, nxt }) })];
    };
    r.step('init', 'prev is the part already reversed. It starts empty (None).', view(), { prev: 'None' });
    r.step('curr', 'curr is the node we are about to turn around: start at the head.', view('active'), { curr: curr === null ? 'None' : values[curr] });
    while (curr !== null) {
      r.op();
      r.step('loop', `curr = ${values[curr]}.`, view('active'), { curr: values[curr] });
      nxt = next[curr];
      r.step('save', `Save curr.next first: nxt = ${nxt === null ? 'None' : values[nxt]}. Once we change curr.next the rest of the list would be lost.`, view('active'), { nxt: nxt === null ? 'None' : values[nxt] });
      r.predictChoice('flip', `Now curr.next = prev. Where will ${values[curr]} point?`, prev === null ? 'None (it becomes the tail)' : `${values[prev]}`, [...values.filter((_, i) => i !== prev && i !== curr).slice(0, 2).map(String), prev === null ? String(values[nxt ?? 0]) : 'None'], curr, 'Each node is turned to point at the node before it, which is what prev holds.');
      next[curr] = prev;
      r.step('flip', `curr.next = prev: ${values[curr]} now points ${prev === null ? 'to None' : `back at ${values[prev]}`}.`, view('swap'), { prev: prev === null ? 'None' : values[prev] });
      done.add(curr);
      prev = curr;
      r.step('advPrev', `prev moves up to ${values[prev]}.`, view('active'), { prev: values[prev] });
      curr = nxt;
      nxt = null;
      r.step('advCurr', curr === null ? 'curr = nxt = None: every node has been turned.' : `curr moves on to the saved node ${values[curr]}.`, view('active'), { curr: curr === null ? 'None' : values[curr] });
    }
    const out = walk(next, prev).map((i) => values[i]);
    r.predict('end', 'The loop is over. Which node does the function return?', ['prev: the last node visited, the new head', 'curr: which is None', 'The old head'], 0, 'prev ends on the old tail, which is now the head of the reversed list.');
    r.step('done', `Return prev: the reversed list is ${out.length ? out.join(' → ') : 'empty'}.`, view(), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ values }) {
    return [...values].reverse();
  },
});

export default problem({
  summary: 'You are given the first node of a singly linked list. Reverse the list so that every node points to the one that used to come before it, and return the new first node.',
  example: ['list = 3 → 6 → 9', '9 → 6 → 3', 'The arrows are turned around; the old last node becomes the new head.'],
  pattern: ['linked-list', ['linked-list', 'stack', 'two-pointers', 'dfs'], 'Walk once, keeping a pointer to the previous node, and flip each node’s next pointer. Careful pointer rewiring is the whole pattern.', {
    stack: 'Pushing nodes on a stack and popping them would work but uses O(n) extra memory; rewiring in place needs none.',
    'two-pointers': 'You do keep prev and curr, but the point is the in-place pointer reversal.',
    dfs: 'A recursive reversal exists, but the iterative version is simpler and avoids deep recursion.',
  }],
  hints: [
    'Each node must end up pointing at its predecessor. Which pointer do you need to remember so you can do that?',
    'If you set curr.next = prev, you lose the rest of the list. What must you save before doing it?',
    'Loop with prev, curr, and nxt: save nxt = curr.next, set curr.next = prev, then move prev and curr forward.',
  ],
  insight: 'Save the next node, point the current node backwards, then step both pointers forward.',
  brute: 'Copy values into an array and rewrite the list backwards: O(n) time, O(n) space.',
  optimal: 'Reverse the pointers in place with three variables: O(n) time, O(1) space.',
  walk: ['Start with prev = None and curr = head.', 'While curr is not None: save nxt = curr.next, set curr.next = prev (the flip).', 'Move prev to curr and curr to nxt.', 'When curr runs off the end, prev is the old tail and the new head: return it.'],
  edge: ['Empty list: return None.', 'A single node: unchanged.', 'Two nodes.', 'The original head must end up pointing to None.'],
  works: ['Invariant: nodes before curr form an already reversed list headed by prev, and nodes from curr onward are still in the original order.', 'Each iteration moves one node from the second group to the first without breaking either, so at the end everything is reversed.'],
  time: ['O(n)', 'Each node is visited once.'],
  space: ['O(1)', 'Three pointers, no extra structure.'],
  solution,
  cases,
  sig: 'def reverse_list(head):\n    # head is a ListNode (val, next) or None; return the new head\n    pass\n',
  harness,
  viz,
  fromArgs: ([values]) => ({ values }),
});
