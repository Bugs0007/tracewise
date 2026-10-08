import { Recorder } from '@/engine/recorder';
import { linkedListPanel, type LLNodeView } from '@/engine/layout';
import type { NotePanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LISTS_HARNESS, requireInts } from '@/content/lib/lists-stacks';

const code = `
def detect_cycle(head):
    slow = fast = head                       #@init
    while fast and fast.next:                #@loop
        slow = slow.next                     #@slow
        fast = fast.next.next                #@fast
        if slow is fast:                     #@meet
            slow = head                      #@reset
            while slow is not fast:          #@find
                slow = slow.next             #@s2
                fast = fast.next             #@f2
            return slow                      #@found
    return None                              #@none
`;

interface In {
  values: number[];
  pos: number;
}

const viz: VizDef<In> = {
  id: 'll-floyd',
  title: 'Floyd cycle detection',
  code,
  language: 'python',
  inputs: [
    { key: 'values', label: 'List values', kind: 'numbers', default: [3, 2, 0, -4, 7, 5, 1], maxItems: 8 },
    { key: 'pos', label: 'Tail links back to index (-1 = no cycle)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'No cycle', input: { values: [1, 2, 3, 4, 5, 6], pos: -1 } },
    { label: 'Cycle at the head', input: { values: [1, 2, 3, 4, 5], pos: 0 } },
    { label: 'Tail loops to itself', input: { values: [4, 8, 15, 16], pos: 3 } },
    { label: 'Empty list', input: { values: [], pos: -1 } },
  ],
  run({ values, pos }) {
    requireInts(values, 'List values');
    const n = values.length;
    if (!Number.isInteger(pos) || pos < -1 || pos >= Math.max(n, 1)) throw new Error(`pos must be -1 (no cycle) or an index from 0 to ${Math.max(n - 1, 0)}`);
    const cyc = n > 0 && pos >= 0;
    const r = new Recorder(code);

    const nxt = (i: number): number | null => (i < n - 1 ? i + 1 : cyc ? pos : null);
    const idOf = (i: number | null): string => (i === null ? 'none' : `n${i}`);
    const val = (i: number | null): string => (i === null ? 'None' : String(values[i]));

    let slow: number | null = n ? 0 : null;
    let fast: number | null = n ? 0 : null;
    let foundAt: number | null = null;

    const panels = (): Panel[] => {
      const tags = new Map<string, string[]>();
      const tag = (i: number | null, t: string) => tags.set(idOf(i), [...(tags.get(idOf(i)) ?? []), t]);
      tag(slow, 'slow');
      tag(fast, 'fast');
      const view: LLNodeView[] = values.map((v, i) => {
        const id = idOf(i);
        const both = slow === i && fast === i;
        const tone: Tone = foundAt === i ? 'found' : both ? 'swap' : slow === i ? 'active' : fast === i ? 'compare' : 'default';
        return { id, label: String(v), tone, tags: tags.get(id) };
      });
      if (!cyc) view.push({ id: 'none', label: 'None', tone: 'muted', tags: tags.get('none') });
      const nm: Record<string, string | null> = {};
      const edgeTones: Record<string, Tone> = {};
      for (let i = 0; i < n; i++) {
        const to = nxt(i);
        if (to === i) continue; // self-loop: described in the note below
        nm[idOf(i)] = idOf(to);
        if (to !== null && to <= i) edgeTones[`${idOf(i)}>${idOf(to)}`] = 'path';
      }
      const out: Panel[] = [linkedListPanel(view, nm, { title: cyc ? `Linked list (tail links back to index ${pos})` : 'Linked list', edgeTones, showNull: false })];
      if (cyc && nxt(n - 1) === n - 1) out.push({ type: 'note', text: 'The tail points at itself: a cycle of length 1.', tone: 'muted' } as NotePanel);
      return out;
    };
    const vars = () => ({ slow: val(slow), fast: val(fast) });

    r.step('init', n ? 'slow and fast both start at the head' : 'The list is empty: head is None', panels(), vars());
    let met = false;
    while (true) {
      r.op();
      if (!(fast !== null && nxt(fast) !== null)) {
        r.step('loop', fast === null ? 'fast is None: it fell off the end, so the list has an end' : 'fast.next is None: fast reached the last node, so the list has an end', panels(), vars());
        break;
      }
      r.step('loop', `fast (${val(fast)}) and fast.next exist: another round`, panels(), vars());
      slow = nxt(slow as number);
      r.step('slow', `slow takes 1 step to ${val(slow)}`, panels(), vars());
      fast = nxt(nxt(fast) as number);
      r.step('fast', `fast takes 2 steps to ${val(fast)}`, panels(), vars());
      r.op();
      if (slow === fast) {
        r.step('meet', `slow is fast at ${val(slow)}: they met, so there is a cycle`, panels(), vars());
        met = true;
        break;
      }
      r.step('meet', `slow (${val(slow)}) is not fast (${val(fast)}): keep going`, panels(), vars());
    }
    if (!met) {
      r.step('none', 'Return None: no cycle', panels(), vars());
      return { frames: r.frames, result: -1 };
    }
    slow = 0;
    r.step('reset', 'Reset slow to the head; fast stays at the meeting point. Now both move 1 step.', panels(), vars());
    while (true) {
      r.op();
      if (slow === fast) {
        r.step('find', 'slow is fast: both stand on the first node of the cycle', panels(), vars());
        break;
      }
      r.step('find', `slow (${val(slow)}) is not fast (${val(fast)}): step both`, panels(), vars());
      slow = nxt(slow as number);
      r.step('s2', `slow moves to ${val(slow)}`, panels(), vars());
      fast = nxt(fast as number);
      r.step('f2', `fast moves to ${val(fast)}`, panels(), vars());
    }
    foundAt = slow;
    r.step('found', `Return the node holding ${val(slow)} (index ${slow}): the cycle starts here`, panels(), vars());
    return { frames: r.frames, result: slow };
  },
  reference({ values, pos }) {
    // independent: walk with a visited set; the first node seen twice is the cycle start
    const n = values.length;
    const seen = new Set<number>();
    let i: number | null = n ? 0 : null;
    while (i !== null) {
      if (seen.has(i)) return i;
      seen.add(i);
      i = i < n - 1 ? i + 1 : pos >= 0 ? pos : null;
    }
    return -1;
  },
};

const floydTests = [
  { args: [[3, 2, 0, -4], 1], expected: 1, name: 'cycle in the middle' },
  { args: [[1, 2], 0], expected: 0, name: 'cycle at the head' },
  { args: [[1], -1], expected: -1, name: 'single node, no cycle' },
  { args: [[], -1], expected: -1, name: 'empty list' },
  { args: [[1], 0], expected: 0, name: 'single node loops to itself' },
  { args: [[1, 2, 3, 4, 5, 6], -1], expected: -1, name: 'even length, no cycle' },
  { args: [[1, 2, 3, 4, 5], 4], expected: 4, name: 'tail loops to itself' },
];

const unit: Unit = {
  id: 'll-floyd',
  hook: 'Detecting a cycle with O(1) memory is the standard "can you do better than a hash set?" follow-up. The tortoise-and-hare trick, and why it also finds the cycle start, is a favourite explain-your-reasoning question.',
  predict: {
    prompt: 'Inside a cycle, fast moves 2 nodes per round and slow moves 1. Could fast jump OVER slow without ever landing on the same node?',
    options: ['Yes, if the cycle length is even', 'Yes, if the cycle length is odd', 'No: the gap between them shrinks by exactly 1 each round, so it must hit 0', 'No, but only because both start at the head'],
    answer: 2,
    explain: 'Each round fast gains exactly one node on slow, so the distance goes ..., 3, 2, 1, 0 and cannot skip 0. (A speed difference of 2 or more could skip over.)',
  },
  viz,
  deeper: {
    points: [
      'Phase 1: slow moves 1, fast moves 2. If fast reaches None there is no cycle; if they meet there is one.',
      'Phase 2: put slow back at the head and move both 1 step at a time. They meet at the first node of the cycle.',
      'Why: if the head is `a` steps from the cycle start and they meet `b` steps past it, then a = (cycle length - b) mod cycle length, so walking `a` steps from either end lands on the start.',
      'The loop test is `fast and fast.next` because fast jumps two nodes: both must exist.',
      'The same pointer pair finds the middle (when fast ends, slow is halfway) and powers "find the duplicate number".',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Checking only `fast.next` (crashes when fast is None on even-length lists)', 'Comparing values instead of node identity (`is`): duplicates give false positives', 'Moving fast in phase 2 by two steps'],
  },
  practice: {
    language: 'python',
    fnName: 'detect_cycle',
    statement: 'Return the first node of the cycle in a linked list, or None if there is no cycle. Use O(1) extra memory (slow/fast pointers).',
    signature: 'def detect_cycle(head):',
    solution: `def detect_cycle(head):
    slow = fast = head
    while @@fast and fast.next@@:
        slow = slow.next
        fast = @@fast.next.next@@
        if @@slow is fast@@:
            slow = @@head@@
            while slow is not fast:
                slow = slow.next
                fast = @@fast.next@@
            return slow
    return None`,
    tests: floydTests,
    harness: LISTS_HARNESS,
    adapter: 'run_cycle_index',
  },
  debug: {
    language: 'python',
    fnName: 'detect_cycle',
    statement: 'This crashes on some acyclic lists (and on the empty list). Fix the loop condition.',
    buggy: `def detect_cycle(head):
    slow = fast = head
    while fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            slow = head
            while slow is not fast:
                slow = slow.next
                fast = fast.next
            return slow
    return None`,
    fixed: `def detect_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            slow = head
            while slow is not fast:
                slow = slow.next
                fast = fast.next
            return slow
    return None`,
    tests: floydTests,
    harness: LISTS_HARNESS,
    adapter: 'run_cycle_index',
    bugType: 'missing None check',
    hint: 'On an even-length list without a cycle, what is `fast` after its last two-step jump?',
    explanation: 'fast jumps two nodes, so on even-length lists it lands on None, and `None.next` raises AttributeError (empty lists crash immediately). The condition must check `fast` itself before `fast.next`.',
  },
  boss: {
    title: 'Find the duplicate number',
    statement: 'An array of n + 1 integers contains values from 1 to n, so at least one value repeats (exactly one value is the repeated one, possibly several times). Return it without modifying the array and with O(1) extra space. Hint: treat `i -> nums[i]` as a linked list.',
    language: 'python',
    fnName: 'find_duplicate',
    starter: `def find_duplicate(nums):
    # your code here
    pass
`,
    solution: `def find_duplicate(nums):
    slow = fast = nums[0]
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    slow = nums[0]
    while slow != fast:
        slow = nums[slow]
        fast = nums[fast]
    return slow`,
    tests: [
      { args: [[1, 3, 4, 2, 2]], expected: 2 },
      { args: [[3, 1, 3, 4, 2]], expected: 3 },
      { args: [[1, 1]], expected: 1, name: 'smallest case' },
      { args: [[2, 2, 2, 2, 2]], expected: 2, name: 'one value repeated many times' },
      { args: [[1, 4, 4, 2, 3]], expected: 4 },
    ],
    hints: ['Every index points to nums[index]. Two indices share a target exactly when they hold the same value, so there is a cycle.', 'Run Floyd starting from index 0: find the meeting point, reset one pointer to the start, and advance both one step at a time. The node where they meet is the duplicate value.'],
    combines: ['ll-floyd', 'fast-slow'],
  },
};

export default unit;
