import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LISTS_HARNESS, chainPanel, requireInts, requireSorted } from '@/content/lib/lists-stacks';

const code = `
def merge_two_lists(l1, l2):
    dummy = ListNode(0)                  #@dummy
    tail = dummy                         #@tail
    while l1 and l2:                     #@loop
        if l1.val <= l2.val:             #@cmp
            tail.next = l1               #@takeA
            l1 = l1.next
        else:
            tail.next = l2               #@takeB
            l2 = l2.next
        tail = tail.next                 #@adv
    tail.next = l1 or l2                 #@rest
    return dummy.next                    #@done
`;

interface In {
  a: number[];
  b: number[];
}

const viz: VizDef<In> = {
  id: 'll-merge',
  title: 'Merge two sorted lists',
  code,
  language: 'python',
  inputs: [
    { key: 'a', label: 'List A (sorted)', kind: 'numbers', default: [1, 4, 6], maxItems: 6 },
    { key: 'b', label: 'List B (sorted)', kind: 'numbers', default: [2, 3, 7, 9], maxItems: 6 },
  ],
  presets: [
    { label: 'One list is empty', input: { a: [], b: [5, 8] } },
    { label: 'Duplicates', input: { a: [1, 2, 2], b: [2, 3] } },
    { label: 'A entirely before B', input: { a: [1, 2], b: [5, 6] } },
    { label: 'Both empty', input: { a: [], b: [] } },
  ],
  run({ a, b }) {
    requireInts(a, 'List A');
    requireInts(b, 'List B');
    requireSorted(a, 'List A');
    requireSorted(b, 'List B');
    const r = new Recorder(code);
    const aIds = a.map((_, i) => `a${i}`);
    const bIds = b.map((_, i) => `b${i}`);
    const label: Record<string, string> = {};
    aIds.forEach((id, i) => (label[id] = String(a[i])));
    bIds.forEach((id, i) => (label[id] = String(b[i])));

    let i = 0; // l1 = aIds[i]
    let j = 0; // l2 = bIds[j]
    const res: string[] = [];
    let withDummy = false;
    let tailId: string | null = null; // 'dummy' or last result id
    let hot: string | null = null; // node being taken
    let compare = false;
    let attached: string[] = [];

    const panels = (): Panel[] => {
      const side = (title: string, ids: string[], k: number, ptr: string): Panel => {
        const tones: Record<string, Tone> = {};
        const tags: Record<string, string[]> = {};
        ids.forEach((id, x) => {
          if (x < k) tones[id] = 'muted';
          if (x === k) {
            tones[id] = hot === id ? 'active' : compare ? 'compare' : 'default';
            tags[id] = [ptr];
          }
        });
        return chainPanel({ title, ids, labels: label, tones, tags, nullTags: k >= ids.length ? [ptr] : undefined });
      };
      const tones: Record<string, Tone> = {};
      for (const id of res) tones[id] = attached.includes(id) ? 'path' : 'done';
      if (hot) tones[hot] = 'new';
      const out: Panel[] = [side('List A', aIds, i, 'l1'), side('List B', bIds, j, 'l2')];
      if (withDummy) {
        out.push(chainPanel({ title: 'Merged', ids: res, labels: label, tones, dummy: { id: 'dummy', label: 'D', tags: tailId === 'dummy' ? ['tail'] : undefined }, tags: tailId && tailId !== 'dummy' ? { [tailId]: ['tail'] } : undefined, nullTone: 'muted' }));
      } else {
        out.push({ type: 'note', text: 'The merged list is empty so far.', tone: 'muted' });
      }
      return out;
    };
    const l1 = () => (i < aIds.length ? a[i] : 'None');
    const l2 = () => (j < bIds.length ? b[j] : 'None');
    const vars = () => ({ l1: l1(), l2: l2() });

    r.step('dummy', 'Make a dummy node: the merged list will hang off it', panels(), vars());
    withDummy = true;
    tailId = 'dummy';
    r.step('tail', 'tail points at the dummy; it always marks the end of the merged list', panels(), vars());
    while (true) {
      r.op();
      if (!(i < aIds.length && j < bIds.length)) {
        r.step('loop', i >= aIds.length ? 'l1 is None: list A is used up' : 'l2 is None: list B is used up', panels(), vars());
        break;
      }
      r.step('loop', 'Both lists still have nodes', panels(), vars());
      compare = true;
      r.op();
      const takeA = a[i] <= b[j];
      r.step('cmp', `Compare ${a[i]} and ${b[j]}: ${takeA ? (a[i] === b[j] ? 'equal, take A (keeps A first)' : `${a[i]} is smaller, take A`) : `${b[j]} is smaller, take B`}`, panels(), vars());
      compare = false;
      const id = takeA ? aIds[i] : bIds[j];
      hot = id;
      res.push(id);
      r.op();
      r.step(takeA ? 'takeA' : 'takeB', `tail.next = ${label[id]}, then ${takeA ? 'l1' : 'l2'} steps forward`, panels(), vars());
      if (takeA) i++;
      else j++;
      hot = null;
      tailId = id;
      r.step('adv', `tail moves onto ${label[id]}`, panels(), vars());
    }
    const restIds = i < aIds.length ? aIds.slice(i) : bIds.slice(j);
    const from = i < aIds.length ? 'A' : 'B';
    attached = restIds;
    res.push(...restIds);
    r.op();
    r.step('rest', restIds.length ? `tail.next = l1 or l2: the rest of ${from} (${restIds.map((x) => label[x]).join(', ')}) joins in one move` : 'Nothing left to attach: tail.next stays None', panels(), vars());
    const merged = res.map((id) => Number(label[id]));
    r.step('done', `Return dummy.next: ${merged.length ? merged.join(' → ') : 'an empty list'}`, panels(), vars());
    return { frames: r.frames, result: merged };
  },
  reference({ a, b }) {
    return [...a, ...b].sort((x, y) => x - y);
  },
};

const mergeTests = [
  { args: [[1, 2, 4], [1, 3, 4]], expected: [1, 1, 2, 3, 4, 4] },
  { args: [[], []], expected: [], name: 'both empty' },
  { args: [[], [0]], expected: [0], name: 'A empty' },
  { args: [[5], []], expected: [5], name: 'B empty' },
  { args: [[1, 2], [5, 6]], expected: [1, 2, 5, 6], name: 'A entirely before B' },
  { args: [[5, 6], [1, 2, 3]], expected: [1, 2, 3, 5, 6], name: 'B entirely before A' },
  { args: [[2, 2], [2]], expected: [2, 2, 2], name: 'all duplicates' },
];

const unit: Unit = {
  id: 'll-merge',
  hook: 'Merging two sorted lists is the building block of merge sort on linked lists and of merging k lists. It tests the dummy-node-plus-tail pattern and whether you remember the leftover nodes.',
  predict: {
    prompt: 'One list runs out while the other still has 3 nodes. What is the cheapest correct way to finish?',
    options: ['Loop over the 3 nodes and copy them one by one', 'One assignment: `tail.next = remaining`, since the rest is already sorted and linked', 'Sort the remaining nodes first', 'Restart the merge from the dummy node'],
    answer: 1,
    explain: 'The leftover chain is already sorted and every value in it is >= what we have merged, so we just hang the whole chain off tail in O(1).',
  },
  viz,
  deeper: {
    points: [
      'Dummy node + `tail` pointer: append by `tail.next = node; tail = tail.next`, no special case for the first node.',
      'Nodes are relinked, not copied, so the merge uses O(1) extra space.',
      'Use `<=` to keep the merge stable: on ties the node from the first list goes first.',
      'When the loop ends, at most one list still has nodes: attach it with `tail.next = l1 or l2`.',
      'Return `dummy.next`, never `dummy`.',
    ],
    complexity: { time: 'O(n + m)', space: 'O(1)' },
    pitfalls: ['Forgetting to attach the leftover list', 'Returning `dummy` (an extra 0 at the front)', 'Forgetting `tail = tail.next`, so each new node overwrites the previous one'],
  },
  practice: {
    language: 'python',
    fnName: 'merge_two_lists',
    statement: 'Merge two sorted linked lists into one sorted list by splicing together their nodes. Return the head of the merged list.',
    signature: 'def merge_two_lists(l1, l2):',
    solution: `def merge_two_lists(l1, l2):
    dummy = ListNode(0)
    tail = @@dummy@@
    while @@l1 and l2@@:
        if @@l1.val <= l2.val@@:
            tail.next = l1
            l1 = l1.next
        else:
            tail.next = l2
            l2 = l2.next
        tail = @@tail.next@@
    tail.next = @@l1 or l2@@
    return dummy.next`,
    tests: mergeTests,
    harness: LISTS_HARNESS,
    adapter: 'run_two_lists',
  },
  debug: {
    language: 'python',
    fnName: 'merge_two_lists',
    statement: 'Lists of different lengths lose nodes at the end of the merged result. Fix it.',
    buggy: `def merge_two_lists(l1, l2):
    dummy = ListNode(0)
    tail = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            tail.next = l1
            l1 = l1.next
        else:
            tail.next = l2
            l2 = l2.next
        tail = tail.next
    tail.next = l1
    return dummy.next`,
    fixed: `def merge_two_lists(l1, l2):
    dummy = ListNode(0)
    tail = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            tail.next = l1
            l1 = l1.next
        else:
            tail.next = l2
            l2 = l2.next
        tail = tail.next
    tail.next = l1 or l2
    return dummy.next`,
    tests: mergeTests,
    harness: LISTS_HARNESS,
    adapter: 'run_two_lists',
    bugType: 'dropped leftover nodes',
    hint: 'The loop stops when EITHER list is empty. Which list can still have nodes?',
    explanation: '`tail.next = l1` only handles the case where l1 is the leftover. If l2 has nodes left, l1 is None and the whole remainder of l2 is thrown away. `l1 or l2` picks whichever list is not empty.',
  },
  boss: {
    title: 'Sort a linked list',
    statement: 'Sort a singly linked list in ascending order in O(n log n) time. Merge sort fits a linked list well: split at the middle, sort both halves, merge them. Return the head.',
    language: 'python',
    fnName: 'sort_list',
    starter: `def sort_list(head):
    # your code here
    pass
`,
    solution: `def sort_list(head):
    if head is None or head.next is None:
        return head
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    second = slow.next
    slow.next = None
    left = sort_list(head)
    right = sort_list(second)
    dummy = ListNode(0)
    tail = dummy
    while left and right:
        if left.val <= right.val:
            tail.next = left
            left = left.next
        else:
            tail.next = right
            right = right.next
        tail = tail.next
    tail.next = left or right
    return dummy.next`,
    tests: [
      { args: [[4, 2, 1, 3]], expected: [1, 2, 3, 4] },
      { args: [[-1, 5, 3, 4, 0]], expected: [-1, 0, 3, 4, 5], name: 'negatives, odd length' },
      { args: [[]], expected: [], name: 'empty' },
      { args: [[1]], expected: [1], name: 'single node' },
      { args: [[3, 3, 1, 1]], expected: [1, 1, 3, 3], name: 'duplicates' },
      { args: [[2, 1]], expected: [1, 2], name: 'two nodes' },
    ],
    harness: LISTS_HARNESS,
    adapter: 'run_list',
    hints: ['Base case: an empty or one-node list is already sorted. Otherwise find the middle with slow/fast pointers and cut the list in two (set slow.next = None).', 'Recursively sort each half, then merge the two sorted halves with a dummy node and a tail pointer, exactly like merge_two_lists.'],
    combines: ['ll-merge', 'll-middle', 'merge-sort'],
  },
};

export default unit;
