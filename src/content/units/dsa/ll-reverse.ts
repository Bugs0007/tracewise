import { Recorder } from '@/engine/recorder';
import { linkedListPanel, type LLNodeView } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def reverse_list(head):
    prev = None                  #@init
    curr = head                  #@initCurr
    while curr:                  #@loop
        nxt = curr.next          #@save
        curr.next = prev         #@rewire
        prev = curr              #@advPrev
        curr = nxt               #@advCurr
    return prev                  #@done
`;

/** Hidden helpers shared by every linked-list task: build from a Python list, convert back. */
export const LIST_HARNESS = `
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _build(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    return head

def _to_list(node, limit=10000):
    out = []
    while node is not None and len(out) < limit:
        out.append(node.val)
        node = node.next
    return out

def run_list(fn, vals):
    return _to_list(fn(_build(vals)))

def run_list_value(fn, vals):
    return fn(_build(vals))
`;

interface In {
  values: number[];
}

const viz: VizDef<In> = {
  id: 'll-reverse',
  title: 'Reverse a linked list',
  code,
  language: 'python',
  inputs: [{ key: 'values', label: 'List values', kind: 'numbers', default: [1, 2, 3, 4, 5], maxItems: 8 }],
  presets: [
    { label: 'Two nodes', input: { values: [7, 9] } },
    { label: 'One node', input: { values: [42] } },
    { label: 'Six nodes', input: { values: [3, 1, 4, 1, 5, 9] } },
  ],
  run({ values }) {
    const r = new Recorder(code);
    const ids = values.map((_, i) => `n${i}`);
    const label: Record<string, string> = Object.fromEntries(ids.map((id, i) => [id, String(values[i])]));
    const next: Record<string, string | null> = Object.fromEntries(ids.map((id, i) => [id, ids[i + 1] ?? null]));
    const reversed = new Set<string>();
    let prev: string | null = null;
    let curr: string | null = ids[0] ?? null;
    let nxt: string | null = null;

    const panel = (hot?: string) => {
      const order: LLNodeView[] = [{ id: 'nullL', label: 'None', tone: 'muted' }];
      const tags: Record<string, string[]> = {};
      const tag = (id: string | null, t: string) => {
        const key = id ?? (t === 'prev' ? 'nullL' : 'nullR');
        (tags[key] ??= []).push(t);
      };
      tag(prev, 'prev');
      tag(curr, 'curr');
      if (nxt) tag(nxt, 'nxt');
      for (const id of ids) {
        const tone: Tone = id === hot ? 'active' : id === curr ? 'compare' : reversed.has(id) ? 'done' : 'default';
        order.push({ id, label: label[id], tone, tags: tags[id] });
      }
      order.push({ id: 'nullR', label: 'None', tone: 'muted', tags: tags.nullR });
      order[0].tags = tags.nullL;
      const nm: Record<string, string | null> = {};
      const edgeTones: Record<string, Tone> = {};
      for (const id of ids) {
        // a None pointer is drawn to the left None once the node is flipped, else to the right one
        const to = next[id] ?? (reversed.has(id) ? 'nullL' : 'nullR');
        nm[id] = to;
        if (reversed.has(id)) edgeTones[`${id}>${to}`] = 'done';
        if (id === hot) edgeTones[`${id}>${to}`] = 'active';
      }
      return linkedListPanel(order, nm, { edgeTones, showNull: false, title: 'Linked list' });
    };
    const vars = () => ({ prev: prev ? label[prev] : 'None', curr: curr ? label[curr] : 'None', nxt: nxt ? label[nxt] : 'None' });

    r.step('init', 'prev starts at None — it will become the new tail', [panel()], vars());
    r.step('initCurr', 'curr starts at the head', [panel()], vars());
    while (true) {
      r.op();
      if (!curr) {
        r.step('loop', 'curr is None — every node has been flipped', [panel()], vars());
        break;
      }
      r.step('loop', `curr = ${label[curr]}, keep going`, [panel()], vars());
      nxt = next[curr];
      r.step('save', `Save curr.next (${nxt ? label[nxt] : 'None'}) before we overwrite it`, [panel(curr)], vars());
      next[curr] = prev;
      reversed.add(curr);
      r.op();
      r.step('rewire', `Point ${label[curr]} backwards to ${prev ? label[prev] : 'None'}`, [panel(curr)], vars());
      prev = curr;
      r.step('advPrev', `prev moves up to ${label[prev]}`, [panel()], vars());
      curr = nxt;
      r.step('advCurr', `curr moves to the saved node (${curr ? label[curr] : 'None'})`, [panel()], vars());
    }
    const out: number[] = [];
    let p = prev;
    while (p) {
      out.push(Number(label[p]));
      p = next[p];
    }
    r.step('done', `Return prev: the list now reads ${out.join(' → ') || 'empty'}`, [panel()], vars());
    return { frames: r.frames, result: out };
  },
  reference({ values }) {
    return [...values].reverse();
  },
};

const tests = [
  { args: [[1, 2, 3, 4, 5]], expected: [5, 4, 3, 2, 1] },
  { args: [[1, 2]], expected: [2, 1], name: 'two nodes' },
  { args: [[7]], expected: [7], name: 'one node' },
  { args: [[]], expected: [], name: 'empty list' },
];

const unit: Unit = {
  id: 'll-reverse',
  hook: 'Reversing a linked list is the classic pointer-juggling question. It tests whether you can change links without losing the rest of the list — the same move appears inside palindrome checks, k-group reversal and reorder-list.',
  predict: {
    prompt: 'You run `curr.next = prev` **before** saving `curr.next` anywhere. What happens?',
    options: ['Nothing — Python keeps a copy', 'You lose the only reference to the rest of the list', 'It raises an exception', 'The list is reversed twice'],
    answer: 1,
    explain: 'curr.next was the only way to reach the remaining nodes. Overwrite it first and they are unreachable. Always save `nxt = curr.next` first.',
  },
  viz,
  deeper: {
    points: [
      'Three pointers: `prev` (already reversed part), `curr` (node being flipped), `nxt` (the rest, saved before rewiring).',
      'Order inside the loop: save → rewire → advance prev → advance curr.',
      'When the loop ends, `curr` is None and `prev` is the new head.',
      'Recursive version: reverse the rest, then `head.next.next = head; head.next = None` — O(n) stack space.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Returning `head` instead of `prev`', 'Forgetting to save `curr.next` before overwriting it', 'Forgetting that the old head must end up pointing to None'],
  },
  practice: {
    language: 'python',
    fnName: 'reverse_list',
    statement: 'Reverse a singly linked list in place and return the new head. Nodes have `.val` and `.next`.',
    signature: 'def reverse_list(head):',
    solution: `def reverse_list(head):
    prev = @@None@@
    curr = head
    while @@curr@@:
        nxt = @@curr.next@@
        curr.next = @@prev@@
        prev = @@curr@@
        curr = @@nxt@@
    return @@prev@@`,
    tests,
    harness: LIST_HARNESS,
    adapter: 'run_list',
  },
  debug: {
    language: 'python',
    fnName: 'reverse_list',
    statement: 'This reversal only ever returns the first node. Fix it.',
    buggy: `def reverse_list(head):
    prev = None
    curr = head
    while curr:
        curr.next = prev
        prev = curr
        curr = curr.next
    return prev`,
    fixed: `def reverse_list(head):
    prev = None
    curr = head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    return prev`,
    tests,
    harness: LIST_HARNESS,
    adapter: 'run_list',
    bugType: 'lost reference',
    hint: 'After `curr.next = prev`, what does `curr.next` point to?',
    explanation: 'Once curr.next is overwritten with prev, `curr = curr.next` walks backwards (to None on the first step). Save the next node before rewiring.',
  },
  boss: {
    title: 'Palindrome linked list',
    statement: 'Return True if the linked list reads the same forwards and backwards. Aim for O(n) time and O(1) extra space: find the middle, reverse the second half, compare.',
    language: 'python',
    fnName: 'is_palindrome',
    starter: `def is_palindrome(head):
    # your code here
    pass
`,
    solution: `def is_palindrome(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    prev = None
    while slow:
        nxt = slow.next
        slow.next = prev
        prev = slow
        slow = nxt
    left, right = head, prev
    while right:
        if left.val != right.val:
            return False
        left = left.next
        right = right.next
    return True`,
    tests: [
      { args: [[1, 2, 2, 1]], expected: true },
      { args: [[1, 2, 3, 2, 1]], expected: true, name: 'odd length' },
      { args: [[1, 2]], expected: false },
      { args: [[1]], expected: true, name: 'single' },
      { args: [[1, 2, 3, 1]], expected: false },
      { args: [[]], expected: true, name: 'empty' },
    ],
    harness: LIST_HARNESS,
    adapter: 'run_list_value',
    hints: ['Use fast/slow pointers to find the middle, then reverse from the middle onward.', 'After reversing the second half, walk one pointer from the head and one from the reversed half, comparing values until the reversed half runs out.'],
    combines: ['ll-reverse', 'll-middle', 'fast-slow'],
  },
};

export default unit;
