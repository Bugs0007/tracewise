import type { Tone } from '@/engine/types';
import { chain, listFromIndices, tagsOf, walk } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './remove-nth-node-from-end-of-list.py?raw';
import harness from './remove-nth-node-from-end-of-list.harness.py?raw';
import cases from './remove-nth-node-from-end-of-list.cases.json';

const viz = vizOf<{ values: number[]; n: number }>({
  id: 'remove-nth-node-from-end-of-list',
  title: 'Remove Nth Node From End of List',
  solution,
  inputs: [
    { key: 'values', label: 'list values', kind: 'numbers', default: [10, 20, 30, 40, 50], maxItems: 9 },
    { key: 'n', label: 'n (from the end)', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Second from the end', input: { values: [10, 20, 30, 40, 50], n: 2 } },
    { label: 'Remove the head', input: { values: [10, 20, 30], n: 3 } },
    { label: 'Remove the tail', input: { values: [10, 20, 30], n: 1 } },
    { label: 'Single node', input: { values: [5], n: 1 } },
  ],
  validate: ({ values, n }) => (values.length < 1 ? 'Enter at least one node' : !Number.isInteger(n) || n < 1 || n > values.length ? `n must be between 1 and ${values.length}` : null),
  run({ values, n }) {
    const r = new TraceRecorder(solution);
    // node 0 is the dummy; real nodes are 1..len
    const labels: (number | string)[] = ['D', ...values];
    const next = chain(labels.length);
    let lead: number | null = null;
    let trail: number | null = null;
    const view = (tones: Record<number, Tone> = {}) => [listFromIndices(labels, next, { title: `remove the ${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} node from the end ("D" is the dummy node)`, tones, tags: tagsOf({ lead, trail }) })];
    r.step('dummy', 'A dummy node in front of the head means removing the head needs no special case.', view(), {});
    lead = 0;
    r.step('lead', 'lead starts at the dummy.', view({ 0: 'active' }), { lead: 'D' });
    for (let k = 0; k < n; k++) {
      lead = next[lead!];
      r.step('leadStep', `Advance lead (${k + 1} of ${n}): it now sits on ${labels[lead!]}.`, view({ [lead!]: 'active' }), { lead: labels[lead!], step: k + 1 });
    }
    trail = 0;
    r.predictChoice('gap', `lead is ${n} node${n === 1 ? '' : 's'} ahead of trail. When lead reaches the last node, how many nodes will trail be behind the end?`, `${n} (the same gap)`, [`${n + 1}`, `${Math.max(0, n - 1)}`, '0'], n, 'Both pointers then move in step, so the gap stays n: trail ends just before the node to delete.');
    r.step('trail', 'trail starts at the dummy. From now on lead and trail move together, keeping the same gap.', view({ [lead!]: 'active', 0: 'compare' }), { gap: n });
    while (next[lead!] !== null) {
      r.op();
      lead = next[lead!];
      trail = next[trail!];
      r.step('lead2', `Move both: lead → ${labels[lead!]}, trail → ${labels[trail!]}.`, view({ [lead!]: 'active', [trail!]: 'compare' }), { lead: labels[lead!], trail: labels[trail!] });
    }
    const doomed = next[trail!]!;
    r.predict('which', `lead is on the last node. trail is on ${labels[trail!]}. Which node will be removed?`, [`${labels[doomed]}, the node right after trail`, `${labels[trail!]}, the node trail is on`, `${labels[lead!]}, the last node`], doomed === lead ? 2 : 0, 'trail stops one node before the target, so trail.next is the node to unlink.');
    r.step('loop', `lead is on the last node, so trail is exactly ${n} from the end, right before the node to remove (${labels[doomed]}).`, view({ [doomed]: 'error', [trail!]: 'compare' }), { target: labels[doomed] });
    next[trail!] = next[doomed];
    r.step('unlink', `trail.next = trail.next.next: ${labels[trail!]} now points past ${labels[doomed]}, which is removed.`, view({ [trail!]: 'done' }), { removed: labels[doomed] });
    const out = walk(next, next[0]).map((k) => labels[k] as number);
    r.step('done', `Return dummy.next: ${out.length ? out.join(' → ') : 'an empty list'}.`, [listFromIndices(out, chain(out.length), { title: 'result', tones: Object.fromEntries(out.map((_, k) => [k, 'found'])) as Record<number, Tone> })], { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ values, n }) {
    const out = [...values];
    out.splice(out.length - n, 1);
    return out;
  },
});

export default problem({
  summary: 'Remove the n-th node counted from the end of a linked list (the last node is the 1st from the end) and return the updated list. Try to do it in a single pass over the list.',
  example: ['list = 6 → 7 → 8 → 9, n = 2', '6 → 7 → 9', 'The 2nd node from the end is 8, so it is unlinked.'],
  pattern: ['linked-list', ['linked-list', 'two-pointers', 'stack', 'hash-lookup'], 'Two pointers n nodes apart: when the front one reaches the end, the back one is exactly where you need it. A dummy head covers removing the first node.', {
    'two-pointers': 'Two pointers is the technique; recognising the fixed gap between them is the insight, and the dummy node is the linked-list detail.',
    stack: 'A stack of nodes works but needs O(n) memory.',
    'hash-lookup': 'Indexing nodes in a map costs O(n) memory and a second pass; the fixed-gap pointers need neither.',
  }],
  hints: [
    'Counting the length first needs two passes. Could two pointers that are always n apart find the right node in one pass?',
    'Move one pointer n steps ahead. Then move both until the front one reaches the last node. Where is the second one?',
    'Start both at a dummy node in front of the head. When the front pointer is on the last node, the back pointer is just before the node to delete: trail.next = trail.next.next.',
  ],
  insight: 'Keep two pointers n nodes apart. When the lead pointer reaches the end, the trail pointer is right before the node to remove.',
  brute: 'Two passes: count the length, then walk to position length − n: O(n).',
  optimal: 'One pass with two pointers and a dummy head: O(n) time, O(1) space.',
  walk: ['Create dummy pointing at the head, and start lead at dummy.', 'Advance lead n steps.', 'Start trail at dummy. Move lead and trail together until lead.next is None.', 'trail is now right before the target: set trail.next = trail.next.next and return dummy.next.'],
  edge: ['Removing the head (n equals the length): the dummy node handles it.', 'Removing the tail (n = 1).', 'A single-node list becomes empty.', 'Two-node lists.'],
  works: ['After the first phase lead is n nodes ahead of trail. Moving both keeps that gap, so when lead is on the last node trail is on the (n + 1)-th node from the end: the predecessor of the target.', 'The dummy guarantees a predecessor exists even for the first node.'],
  time: ['O(n)', 'A single pass.'],
  space: ['O(1)', 'Two pointers and a dummy.'],
  solution,
  cases,
  sig: 'def remove_nth_from_end(head, n):\n    # remove the n-th node from the end; return the head\n    pass\n',
  harness,
  viz,
  fromArgs: ([values, n]) => ({ values, n }),
});
