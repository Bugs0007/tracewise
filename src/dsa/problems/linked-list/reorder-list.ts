import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf, walk } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './reorder-list.py?raw';
import harness from './reorder-list.harness.py?raw';
import cases from './reorder-list.cases.json';

const viz = vizOf<{ values: number[] }>({
  id: 'reorder-list',
  title: 'Reorder List',
  solution,
  inputs: [{ key: 'values', label: 'list values', kind: 'numbers', default: [1, 2, 3, 4, 5, 6], maxItems: 9 }],
  presets: [
    { label: 'Six nodes', input: { values: [1, 2, 3, 4, 5, 6] } },
    { label: 'Five nodes', input: { values: [1, 2, 3, 4, 5] } },
    { label: 'Two nodes', input: { values: [3, 8] } },
    { label: 'Single node', input: { values: [9] } },
  ],
  run({ values }) {
    const r = new TraceRecorder(solution);
    const n = values.length;
    const next = chain(n);
    if (n < 2) {
      r.step('guard', 'With zero or one node there is nothing to reorder.', [listFromIndices(values, next, { title: 'list' })], {});
      r.step('guardRet', 'Return.', [listFromIndices(values, next, { title: 'list' })], { result: JSON.stringify(values) });
      return { frames: r.frames, result: [...values] };
    }
    let slow: number | null = 0;
    let fast: number | null = 0;
    let second: number | null = null;
    let prev: number | null = null;
    let first: number | null = null;
    const view = (title: string, tones: Record<number, Tone> = {}, cursors: Record<string, number | null> = {}) => [listFromIndices(values, next, { title, tones, tags: tagsOf(cursors) })];
    r.step('guard', 'Plan: (1) find the middle, (2) reverse the second half, (3) weave the two halves together.', view('list'), {});
    r.step('ptrs', 'slow and fast both start at the head. fast moves two steps for every one of slow.', view('Step 1: find the middle', {}, { slow, fast }), {});
    while (next[fast!] !== null && next[next[fast!]!] !== null) {
      slow = next[slow!];
      fast = next[next[fast!]!];
      r.step('fast', `slow → ${values[slow!]}, fast → ${values[fast!]}.`, view('Step 1: find the middle', {}, { slow, fast }), { slow: values[slow!], fast: values[fast!] });
    }
    r.predict('mid', 'fast cannot move two more steps. Where is slow?', ['At the last node of the first half (the middle)', 'At the head', 'At the very last node'], 0, 'slow ran half as fast as fast, so it stops at the end of the first half.');
    second = next[slow!];
    r.step('split', `second = slow.next = ${second === null ? 'None' : values[second]}: the start of the second half.`, view('Step 1: find the middle', {}, { slow, second }), { second: second === null ? 'None' : values[second] });
    next[slow!] = null;
    r.step('cut', 'Cut the list: slow.next = None. Now there are two separate lists.', view('The list is cut in two', Object.fromEntries(walk(next, second).map((k) => [k, 'frontier'])) as Record<number, Tone>, { slow, second }), {});
    r.step('revInit', 'Step 2: reverse the second half in place.', view('Step 2: reverse the second half', {}, { second, prev }), {});
    while (second !== null) {
      const nxt: number | null = next[second];
      next[second] = prev;
      prev = second;
      second = nxt;
      r.step('revFlip', `Flipped a node. prev now heads the reversed half: ${walk(next, prev).map((k) => values[k]).join(' → ')}.`, view('Step 2: reverse the second half', Object.fromEntries(walk(next, prev).map((k) => [k, 'done'])) as Record<number, Tone>, { prev, second }), { prev: values[prev] });
    }
    first = 0;
    second = prev;
    r.step('merge', `Step 3: weave. first starts at the head (${values[0]}), second at the reversed half (${values[second!]}).`, view('Step 3: weave the halves', {}, { first, second }), {});
    let asked = false;
    while (second !== null) {
      const n1: number | null = next[first!];
      const n2: number | null = next[second];
      if (!asked) {
        asked = true;
        r.predictChoice('weave', `first = ${values[first!]}, second = ${values[second]}. After first.next = second, what does second.next become?`, n1 === null ? 'None' : `${values[n1]} (the old first.next)`, [String(values[second]), String(values[first!]), n2 === null ? 'None' : String(values[n2])], 3, 'second must point at the node first used to point to, otherwise that part of the list is lost.');
      }
      next[first!] = second;
      next[second] = n1;
      r.step('link2', `${values[first!]} → ${values[second]} → ${n1 === null ? 'None' : values[n1]}.`, view('Step 3: weave the halves', {}, { first, second }), { first: values[first!], second: values[second] });
      first = n1;
      second = n2;
    }
    const out = walk(next, 0).map((k) => values[k]);
    r.step('adv', `Reordered: ${out.join(' → ')}.`, view('result', Object.fromEntries(walk(next, 0).map((k) => [k, 'found'])) as Record<number, Tone>), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ values }) {
    const out: number[] = [];
    let i = 0;
    let j = values.length - 1;
    while (i <= j) {
      out.push(values[i++]);
      if (i <= j) out.push(values[j--]);
    }
    return out;
  },
});

export default problem({
  summary: 'Rearrange a linked list in place so that it alternates between the front and the back: first node, last node, second node, second-to-last node, and so on. You may not just change node values; the nodes must be re-linked.',
  example: ['list = 1 → 2 → 3 → 4 → 5', '1 → 5 → 2 → 4 → 3', 'The new order takes one node from the front, then one from the back, alternately.'],
  pattern: ['fast-slow', ['fast-slow', 'linked-list', 'stack', 'two-pointers'], 'Three linked-list techniques in a row: fast and slow pointers find the middle, the second half is reversed in place, and the two halves are woven together.', {
    'linked-list': 'True, and the sub-steps are classic linked-list rewiring, but the first move that unlocks the problem is the fast and slow pointer to find the middle.',
    stack: 'A stack of the second half would work with O(n) memory; the in-place reversal uses O(1).',
    'two-pointers': 'Fast and slow is the specific two-pointer technique used to find the middle.',
  }],
  hints: [
    'The target order pairs the first node with the last, the second with the second-to-last. Which half of the list do you want to read backwards?',
    'You can reach the middle in one pass without counting: what do two pointers moving at different speeds tell you?',
    'Find the middle, cut the list, reverse the second half, then interleave: take one from the first half, one from the reversed second half.',
  ],
  insight: 'Find the middle with fast and slow, reverse the second half, and interleave the two halves.',
  brute: 'Store the nodes in an array and re-link from both ends: O(n) time, O(n) space.',
  optimal: 'Middle + in-place reversal + merge: O(n) time, O(1) space.',
  walk: ['Use slow and fast pointers to reach the end of the first half. Set second = slow.next and cut with slow.next = None.', 'Reverse the second half with the usual prev/curr loop.', 'Weave: for each pair, save both next pointers, link first → second → first’s old next, then move both pointers on.', 'The result keeps the original head, now followed by the old tail, and so on.'],
  edge: ['Zero or one node: nothing to do.', 'Two nodes.', 'Odd length: the middle node ends last.', 'Even length.'],
  works: ['After the cut the first half is at least as long as the reversed second half, so every node of the second half has a partner to follow.', 'Weaving saves both old next pointers before relinking, so no node is lost.'],
  time: ['O(n)', 'Three linear passes.'],
  space: ['O(1)', 'A handful of pointers.'],
  solution,
  cases,
  sig: 'def reorder_list(head):\n    # reorder in place: first, last, second, second-to-last, ... (return nothing)\n    pass\n',
  harness,
  viz,
  fromArgs: ([values]) => ({ values }),
});
