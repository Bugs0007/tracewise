import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LISTS_HARNESS, chainPanel, requireInts } from '@/content/lib/lists-stacks';

const code = `
def middle_node(head):
    slow = fast = head                       #@init
    while fast and fast.next:                #@loop
        slow = slow.next                     #@slow
        fast = fast.next.next                #@fast
    return slow                              #@done
`;

interface In {
  values: number[];
}

const viz: VizDef<In> = {
  id: 'll-middle',
  title: 'Find the middle node (slow and fast pointers)',
  code,
  language: 'python',
  inputs: [{ key: 'values', label: 'List values', kind: 'numbers', default: [1, 2, 3, 4, 5, 6], maxItems: 10 }],
  presets: [
    { label: 'Odd length', input: { values: [10, 20, 30, 40, 50] } },
    { label: 'Two nodes', input: { values: [7, 9] } },
    { label: 'One node', input: { values: [42] } },
    { label: 'Empty list', input: { values: [] } },
  ],
  run({ values }) {
    requireInts(values, 'List values');
    const n = values.length;
    const r = new Recorder(code);
    const ids = values.map((_, i) => `n${i}`);
    const labels: Record<string, string> = Object.fromEntries(ids.map((id, i) => [id, String(values[i])]));
    let slow: number | null = n ? 0 : null;
    let fast: number | null = n ? 0 : null;
    let answer: number | null = null;
    const val = (i: number | null) => (i === null ? 'None' : String(values[i]));

    const panels = () => {
      const tags: Record<string, string[]> = {};
      const put = (i: number | null, t: string) => {
        const key = i === null || i >= n ? 'none' : ids[i];
        (tags[key] ??= []).push(t);
      };
      put(slow, 'slow');
      put(fast, 'fast');
      const tones: Record<string, Tone> = {};
      if (fast !== null && fast < n) tones[ids[fast]] = 'compare';
      if (slow !== null) tones[ids[slow]] = 'active';
      if (answer !== null) for (let k = answer; k < n; k++) tones[ids[k]] = k === answer ? 'found' : 'path';
      return [chainPanel({ title: 'Linked list', ids, labels, tones, tags, nullTags: tags.none })];
    };
    const vars = () => ({ slow: val(slow), fast: val(fast) });

    r.step('init', n ? 'slow and fast both start at the head' : 'The list is empty, so head is None', panels(), vars());
    while (true) {
      r.op();
      const f = fast;
      const canJump = f !== null && f < n && f + 1 < n;
      if (!canJump) {
        r.step('loop', f === null || f >= n ? 'fast is None: it ran off the end (even length)' : 'fast.next is None: fast is on the last node (odd length)', panels(), vars());
        break;
      }
      r.step('loop', `fast (${val(fast)}) and fast.next exist: move both`, panels(), vars());
      slow = (slow as number) + 1;
      r.step('slow', `slow steps 1: now at ${val(slow)}`, panels(), vars());
      fast = (fast as number) + 2;
      r.step('fast', fast >= n ? 'fast steps 2: it falls off the end' : `fast steps 2: now at ${val(fast)}`, panels(), vars());
      if (fast >= n) fast = null;
    }
    answer = slow;
    const out = slow === null ? [] : values.slice(slow);
    r.step('done', slow === null ? 'Return None: there is no middle' : `fast is done, so slow is halfway: return ${val(slow)}${n % 2 === 0 ? ' (the second middle of an even list)' : ''}`, panels(), vars());
    return { frames: r.frames, result: out };
  },
  reference({ values }) {
    return values.slice(Math.floor(values.length / 2));
  },
};

const tests = [
  { args: [[1, 2, 3, 4, 5]], expected: [3, 4, 5], name: 'odd length' },
  { args: [[1, 2, 3, 4, 5, 6]], expected: [4, 5, 6], name: 'even length: second middle' },
  { args: [[1]], expected: [1], name: 'single node' },
  { args: [[1, 2]], expected: [2], name: 'two nodes' },
  { args: [[]], expected: [], name: 'empty list' },
  { args: [[1, 2, 3, 4]], expected: [3, 4] },
];

const unit: Unit = {
  id: 'll-middle',
  hook: 'Finding the middle in one pass, without knowing the length, is the entry point to palindrome checks, merge sort on lists and reorder-list. The even-length rule (which middle?) is where answers go wrong.',
  predict: {
    prompt: 'The slow/fast loop below runs on [1, 2, 3, 4]. Which node does it return?',
    code: 'slow = fast = head\nwhile fast and fast.next:\n    slow = slow.next\n    fast = fast.next.next\nreturn slow',
    codeLang: 'python',
    options: ['2 (the first middle)', '3 (the second middle)', '4', 'None'],
    answer: 1,
    explain: 'After one round slow is at 2 and fast at 3. A second round moves slow to 3 and fast falls off the end. So even-length lists return the SECOND middle.',
  },
  viz,
  deeper: {
    points: [
      'Fast covers two nodes for every one slow covers, so when fast finishes, slow is halfway: no length counting needed.',
      'Odd length: fast stops ON the last node (`fast.next` is None). Even length: fast stops at None (past the last node).',
      'This version returns the second middle for even lengths. For the first middle, start `fast = head.next`.',
      'The loop condition `fast and fast.next` checks both nodes fast is about to jump over.',
      'Used by: palindrome list (reverse the second half), sort list (split in half), reorder list.',
    ],
    complexity: { time: 'O(n), a single pass of n/2 rounds', space: 'O(1)' },
    pitfalls: ['`while fast.next` alone crashes when fast becomes None', 'Mixing up first and second middle for even lengths', 'Forgetting that you must cut the list (`slow.next = None`) when splitting it in two'],
  },
  practice: {
    language: 'python',
    fnName: 'middle_node',
    statement: 'Return the middle node of a singly linked list in one pass. If there are two middle nodes, return the second one.',
    signature: 'def middle_node(head):',
    solution: `def middle_node(head):
    slow = fast = @@head@@
    while @@fast and fast.next@@:
        slow = @@slow.next@@
        fast = @@fast.next.next@@
    return @@slow@@`,
    tests,
    harness: LISTS_HARNESS,
    adapter: 'run_list',
  },
  debug: {
    language: 'python',
    fnName: 'middle_node',
    statement: 'Even-length lists return the first middle instead of the second (and the empty list crashes). Fix the initialisation.',
    buggy: `def middle_node(head):
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow`,
    fixed: `def middle_node(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow`,
    tests,
    harness: LISTS_HARNESS,
    adapter: 'run_list',
    bugType: 'wrong start for even length',
    hint: 'Trace [1, 2] by hand. Where do slow and fast end up?',
    explanation: 'Starting fast one node ahead makes slow stop one node earlier on even lengths (first middle). It also reads head.next on an empty list, which raises. Both pointers must start at head.',
  },
  boss: {
    title: 'Reorder a list',
    statement: 'Reorder L0 → L1 → … → Ln-1 → Ln into L0 → Ln → L1 → Ln-1 → L2 → … in place (change links, not values). Return the head. Hint: find the middle, reverse the second half, then interleave the two halves.',
    language: 'python',
    fnName: 'reorder_list',
    starter: `def reorder_list(head):
    # your code here
    pass
`,
    solution: `def reorder_list(head):
    if head is None or head.next is None:
        return head
    slow = fast = head
    while fast.next and fast.next.next:
        slow = slow.next
        fast = fast.next.next
    second = slow.next
    slow.next = None
    prev = None
    while second:
        nxt = second.next
        second.next = prev
        prev = second
        second = nxt
    first, second = head, prev
    while second:
        n1, n2 = first.next, second.next
        first.next = second
        second.next = n1
        first, second = n1, n2
    return head`,
    tests: [
      { args: [[1, 2, 3, 4]], expected: [1, 4, 2, 3] },
      { args: [[1, 2, 3, 4, 5]], expected: [1, 5, 2, 4, 3], name: 'odd length' },
      { args: [[1]], expected: [1], name: 'single node' },
      { args: [[]], expected: [], name: 'empty' },
      { args: [[1, 2]], expected: [1, 2], name: 'two nodes' },
      { args: [[1, 2, 3]], expected: [1, 3, 2], name: 'three nodes' },
    ],
    harness: LISTS_HARNESS,
    adapter: 'run_list',
    hints: ['Three steps you already know: find the middle, cut the list there, reverse the second half.', 'Interleave: take one node from the first half, then one from the reversed second half. Save both next pointers before you rewire, and stop when the second half runs out.'],
    combines: ['ll-middle', 'll-reverse', 'll-merge'],
  },
};

export default unit;
