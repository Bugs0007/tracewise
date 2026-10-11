import type { Tone } from '@/engine/types';
import { listFromIndices, tagsOf } from '@/dsa/viz/ll';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './linked-list-cycle.py?raw';
import harness from './linked-list-cycle.harness.py?raw';
import cases from './linked-list-cycle.cases.json';

const viz = vizOf<{ values: number[]; pos: number }>({
  id: 'linked-list-cycle',
  title: 'Linked List Cycle',
  solution,
  inputs: [
    { key: 'values', label: 'list values', kind: 'numbers', default: [8, 5, 1, -3, 6], maxItems: 9 },
    { key: 'pos', label: 'tail connects back to position (−1 = no cycle)', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'Cycle', input: { values: [8, 5, 1, -3, 6], pos: 1 } },
    { label: 'No cycle', input: { values: [1, 2, 3, 4], pos: -1 } },
    { label: 'Loops to head', input: { values: [1, 2], pos: 0 } },
    { label: 'Self loop', input: { values: [5], pos: 0 } },
  ],
  validate: ({ values, pos }) => (values.length < 1 ? 'Enter at least one node' : !Number.isInteger(pos) || pos < -1 || pos >= values.length ? `pos must be −1 or between 0 and ${values.length - 1}` : null),
  run({ values, pos }) {
    const r = new TraceRecorder(solution);
    const n = values.length;
    const next: (number | null)[] = Array.from({ length: n }, (_, i) => (i + 1 < n ? i + 1 : pos >= 0 ? pos : null));
    let slow: number | null = n ? 0 : null;
    let fast: number | null = n ? 0 : null;
    const view = (tones: Record<number, Tone> = {}) => [listFromIndices(values, next, { title: pos >= 0 ? `the tail points back to ${values[pos]}` : 'the last node points to None', tones, tags: tagsOf({ slow, fast }), backTone: 'error' })];
    r.step('init', 'slow and fast both start at the head. slow moves one node per step, fast moves two.', view(n ? { 0: 'active' } : {}), {});
    let asked = 0;
    while (fast !== null && next[fast] !== null) {
      r.op();
      slow = next[slow!];
      fast = next[next[fast]!];
      r.step('slow', `slow moves one: ${values[slow!]}.`, view({ [slow!]: 'active' }), { slow: values[slow!] });
      if (asked < 1 && fast !== null) {
        asked++;
        r.predictChoice('fast', `fast moves two nodes. Where does it land?`, String(values[fast]), [...values.filter((_, k) => k !== fast).map(String), String(values[fast] + 1), String(values[fast] - 1)], n, 'Two next-pointer hops from where fast was.');
      }
      r.step('fast', fast === null ? 'fast ran off the end of the list.' : `fast moves two: ${values[fast]}.`, view({ ...(slow !== null ? { [slow]: 'active' } : {}), ...(fast !== null ? { [fast]: 'compare' } : {}) }), { fast: fast === null ? 'None' : values[fast] });
      const met = fast !== null && slow === fast;
      if (fast !== null) r.predict(met ? 'meet' : 'apart', 'Are slow and fast on the same node now?', ['Yes: the fast pointer lapped the slow one, so there is a cycle', 'No: keep going'], met ? 0 : 1, met ? 'Inside a cycle the fast pointer gains one node per step, so it must eventually land on slow.' : 'They are on different nodes. Either the list ends soon or they will meet inside a loop.');
      if (met) {
        r.step('meet', `slow and fast are both on ${values[slow!]}: they met, so the list has a cycle.`, view({ [slow!]: 'found' }), { result: true });
        r.step('yes', 'Return True.', view({ [slow!]: 'found' }), { result: true });
        return { frames: r.frames, result: true };
      }
    }
    r.step('no', 'fast reached the end (None): the list has no cycle. Return False.', view(), { result: false });
    return { frames: r.frames, result: false };
  },
  reference({ pos }) {
    return pos >= 0;
  },
});

export default problem({
  summary: 'Decide whether following the next pointers of a linked list can ever go on forever, because some node points back to an earlier one, or whether the list simply ends.',
  example: ['list = 4 → 7 → 1 → 9, with 9 pointing back to 7', 'true', 'Walking forever visits 7, 1, 9, 7, 1, 9, … A list that ends in None has no cycle.'],
  pattern: ['fast-slow', ['fast-slow', 'hash-lookup', 'two-pointers', 'dfs'], 'Two pointers moving at different speeds: if there is a loop the fast one eventually catches the slow one inside it; if not, the fast one falls off the end.', {
    'hash-lookup': 'A set of visited nodes also works, but needs O(n) memory. Fast and slow needs O(1).',
    'two-pointers': 'It is a two-pointer idea; the specific variant to name is fast and slow (Floyd’s cycle detection).',
    dfs: 'Walking the list is already a path; there is nothing to search or backtrack.',
  }],
  hints: [
    'You could remember every node you have visited. What would give it away if you saw one twice, and what does that cost in memory?',
    'Imagine two runners on a circular track, one faster than the other. What happens?',
    'Move slow by one and fast by two each step. If they ever stand on the same node there is a cycle; if fast reaches the end there is none.',
  ],
  insight: 'In a cycle the fast pointer gains one node per step on the slow one, so they must meet. With no cycle, fast reaches the end.',
  brute: 'Store visited nodes in a set and stop when one repeats: O(n) time, O(n) space.',
  optimal: 'Floyd’s tortoise and hare: O(n) time, O(1) space.',
  walk: ['Start slow and fast at the head.', 'While fast and fast.next exist, move slow one step and fast two.', 'If slow is fast at any point, return True.', 'If the loop ends (fast fell off the end), return False.'],
  edge: ['Empty list or a single node with no cycle.', 'A single node pointing to itself.', 'The tail points back to the head.', 'A long tail before the cycle starts.'],
  works: ['Once both pointers are inside the cycle, the gap between them (measured around the loop) shrinks by 1 each step, so it reaches 0: they meet.', 'Without a cycle fast reaches the end in at most n/2 steps.'],
  time: ['O(n)', 'They meet within about n steps of both entering the cycle.'],
  space: ['O(1)', 'Two pointers.'],
  solution,
  cases,
  sig: 'def has_cycle(head):\n    # True if following next pointers from head can go on forever\n    pass\n',
  harness,
  viz,
  fromArgs: ([values, pos]) => ({ values, pos }),
});
