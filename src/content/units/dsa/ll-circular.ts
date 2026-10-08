import { Recorder } from '@/engine/recorder';
import { linkedListPanel, type LLNodeView } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LISTS_HARNESS } from '@/content/lib/lists-stacks';

const code = `
class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

def last_survivor(n, k):
    head = tail = Node(1)                   #@build
    for v in range(2, n + 1):
        tail.next = Node(v)                 #@grow
        tail = tail.next
    tail.next = head                        #@close
    prev = tail                             #@prev
    while prev.next is not prev:            #@loop
        for _ in range(k - 1):
            prev = prev.next                #@step
        prev.next = prev.next.next          #@remove
    return prev.val                         #@done
`;

interface In {
  n: number;
  k: number;
}

const viz: VizDef<In> = {
  id: 'll-circular',
  title: 'Circular linked list: eliminate every k-th node',
  code,
  language: 'python',
  inputs: [
    { key: 'n', label: 'People in the circle (n)', kind: 'number', default: 7 },
    { key: 'k', label: 'Eliminate every k-th (k)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'k = 2', input: { n: 6, k: 2 } },
    { label: 'k = 1 (in order)', input: { n: 5, k: 1 } },
    { label: 'One person', input: { n: 1, k: 3 } },
    { label: 'Two people', input: { n: 2, k: 5 } },
  ],
  run({ n, k }) {
    if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error('n must be a whole number from 1 to 8');
    if (!Number.isInteger(k) || k < 1 || k > 9) throw new Error('k must be a whole number from 1 to 9');
    const r = new Recorder(code);
    const label: Record<string, string> = {};
    const next: Record<string, string> = {};
    let order: string[] = ['n1'];
    label.n1 = '1';

    let prev: string | null = null;
    let tail: string | null = 'n1';
    let head: string | null = 'n1';
    let victim: string | null = null;
    let hot: string | null = null;
    let hotEdge: string | null = null;

    const panel = () => {
      const idx = new Map(order.map((id, i) => [id, i]));
      const view: LLNodeView[] = order.map((id) => {
        const tags: string[] = [];
        if (id === head) tags.push('head');
        if (id === tail) tags.push('tail');
        if (id === prev) tags.push('prev');
        const tone: Tone = id === victim ? 'error' : id === hot ? 'compare' : id === prev ? 'active' : 'default';
        return { id, label: label[id], tone, tags: tags.length ? tags : undefined };
      });
      const nm: Record<string, string | null> = {};
      const edgeTones: Record<string, Tone> = {};
      for (const id of order) {
        const to = next[id];
        if (to === undefined || to === id) continue; // a node pointing at itself is described in the caption
        nm[id] = to;
        const a = idx.get(id) as number;
        const b = idx.get(to);
        if (b !== undefined && b <= a) edgeTones[`${id}>${to}`] = 'path';
        if (id === victim) edgeTones[`${id}>${to}`] = 'muted';
      }
      if (hotEdge) edgeTones[hotEdge] = 'active';
      return linkedListPanel(view, nm, { title: 'Circular list', edgeTones, showNull: false });
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ prev: prev ? label[prev] : 'None', left: order.length, ...extra });

    r.step('build', 'Node 1 is both head and tail', [panel()], { n, k });
    for (let v = 2; v <= n; v++) {
      const id = `n${v}`;
      label[id] = String(v);
      order.push(id);
      next[tail as string] = id;
      tail = id;
      r.op();
      r.step('grow', `Append node ${v} after the tail; tail moves to ${v}`, [panel()], { v });
    }
    next[tail as string] = head as string;
    hotEdge = `${tail}>${head}`;
    r.op();
    r.step('close', n === 1 ? 'tail.next = head: node 1 points at itself, a circle of one' : `tail.next = head: the last node points back at ${label[head as string]}, no None anywhere`, [panel()], {});
    hotEdge = null;
    prev = tail;
    head = null;
    tail = null;
    r.step('prev', 'prev starts at the old tail, one step BEFORE the first person to count', [panel()], vars());

    let round = 0;
    while (true) {
      r.op();
      if (next[prev as string] === prev) {
        r.step('loop', `prev.next is prev: only ${label[prev as string]} is left`, [panel()], vars());
        break;
      }
      r.step('loop', `${order.length} people left, keep eliminating`, [panel()], vars());
      round++;
      for (let s = 1; s < k; s++) {
        prev = next[prev as string];
        hot = next[prev];
        r.op();
        r.step('step', `Count ${s} of ${k - 1}: prev = ${label[prev]}`, [panel()], vars());
      }
      hot = null;
      const out = next[prev as string];
      const after = next[out];
      victim = out;
      next[prev as string] = after;
      hotEdge = `${prev}>${after}`;
      r.op();
      r.step('remove', `Round ${round}: ${label[out]} is out, prev.next jumps to ${label[after]}`, [panel()], vars());
      hotEdge = null;
      order = order.filter((x) => x !== out);
      victim = null;
    }
    const winner = Number(label[prev as string]);
    r.step('done', `Return ${winner}: the survivor`, [panel()], vars());
    return { frames: r.frames, result: winner };
  },
  reference({ n, k }) {
    let j = 0;
    for (let i = 2; i <= n; i++) j = (j + k) % i;
    return j + 1;
  },
};

const tests = [
  { args: [5, 2], expected: 3 },
  { args: [7, 3], expected: 4 },
  { args: [1, 5], expected: 1, name: 'one person' },
  { args: [6, 1], expected: 6, name: 'k = 1 removes in order' },
  { args: [2, 1], expected: 2, name: 'two people' },
  { args: [41, 3], expected: 31, name: 'larger circle' },
];

const unit: Unit = {
  id: 'll-circular',
  hook: 'A circular list has no None to stop on, so every loop needs a different exit condition. Round-robin schedulers, ring buffers and the Josephus problem all lean on this.',
  predict: {
    prompt: 'You walk a circular list with `while curr is not None:`. What happens?',
    options: ['It visits each node once and stops', 'It loops forever, because no node ever points to None', 'It raises AttributeError at the tail', 'It skips the head'],
    answer: 1,
    explain: 'The last node points back to the head, so `curr` is never None. Stop when you are back at the start (`curr is head`) or, as in this lesson, when a node points to itself (one node left).',
  },
  viz,
  deeper: {
    points: [
      'A circle is a normal singly linked list whose tail points at the head: one extra line, `tail.next = head`.',
      'Traversal stops on identity, not None: use `do { ... } while curr is not start`, or `curr.next is head`.',
      'Keeping a pointer to the TAIL gives O(1) access to both ends, since tail.next is the head.',
      'Josephus: keep `prev` one node behind the person to remove, walk k-1 steps, then unlink with `prev.next = prev.next.next`.',
      'One node left means `node.next is node`, which is the loop exit used here.',
    ],
    complexity: { time: 'O(n * k) for this simulation', space: 'O(n) to build the circle (O(1) extra)' },
    pitfalls: ['Infinite loops from stopping on None', 'Forgetting that the one-node circle points to itself, not to None', 'Counting k steps instead of k-1 because prev trails by one'],
  },
  practice: {
    language: 'python',
    fnName: 'last_survivor',
    statement: 'n people stand in a circle numbered 1..n. Starting from 1, every k-th person is eliminated (counting continues from the next person). Return the number of the last survivor, using a circular linked list.',
    signature: 'def last_survivor(n, k):',
    solution: `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

def last_survivor(n, k):
    head = tail = Node(1)
    for v in range(2, n + 1):
        tail.next = Node(v)
        tail = @@tail.next@@
    tail.next = @@head@@
    prev = @@tail@@
    while @@prev.next is not prev@@:
        for _ in range(@@k - 1@@):
            prev = prev.next
        prev.next = @@prev.next.next@@
    return prev.val`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'last_survivor',
    statement: 'The circle is built correctly but the wrong person survives. Find the off-by-one.',
    buggy: `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

def last_survivor(n, k):
    head = tail = Node(1)
    for v in range(2, n + 1):
        tail.next = Node(v)
        tail = tail.next
    tail.next = head
    prev = tail
    while prev.next is not prev:
        for _ in range(k):
            prev = prev.next
        prev.next = prev.next.next
    return prev.val`,
    fixed: `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

def last_survivor(n, k):
    head = tail = Node(1)
    for v in range(2, n + 1):
        tail.next = Node(v)
        tail = tail.next
    tail.next = head
    prev = tail
    while prev.next is not prev:
        for _ in range(k - 1):
            prev = prev.next
        prev.next = prev.next.next
    return prev.val`,
    tests,
    bugType: 'off-by-one',
    hint: '`prev` trails the person being counted by one node. How many steps get it just before the k-th person?',
    explanation: 'prev starts one node behind the first person, so after k-1 steps prev.next is the k-th person. Walking k steps lands prev ON the k-th person and the next one is removed instead.',
  },
  boss: {
    title: 'Insert into a sorted circular list',
    statement: 'You get a node `head` from a circular list sorted ascending (it may be any node of the circle, not the smallest) and a value `x`. Insert a new node with value `x` so the circle stays sorted, and return `head` (or the new node if the list was empty). Handle the wrap-around from the largest to the smallest value.',
    language: 'python',
    fnName: 'insert_sorted_circular',
    starter: `def insert_sorted_circular(head, x):
    # your code here
    pass
`,
    solution: `def insert_sorted_circular(head, x):
    node = ListNode(x)
    if head is None:
        node.next = node
        return node
    cur = head
    while True:
        nxt = cur.next
        if cur.val <= x <= nxt.val:
            break
        if cur.val > nxt.val and (x >= cur.val or x <= nxt.val):
            break
        cur = nxt
        if cur is head:
            break
    node.next = cur.next
    cur.next = node
    return head`,
    tests: [
      { args: [[1, 3, 4], 0, 2], expected: [1, 2, 3, 4], name: 'in the middle' },
      { args: [[1, 3, 4], 0, 0], expected: [1, 3, 4, 0], name: 'new minimum (wrap point)' },
      { args: [[1, 3, 4], 0, 9], expected: [1, 3, 4, 9], name: 'new maximum (wrap point)' },
      { args: [[], 0, 6], expected: [6], name: 'empty list' },
      { args: [[5], 0, 7], expected: [5, 7], name: 'single node' },
      { args: [[3, 4, 1], 0, 2], expected: [3, 4, 1, 2], name: 'head is not the smallest' },
      { args: [[2, 2, 2], 0, 2], expected: [2, 2, 2, 2], name: 'all equal' },
    ],
    harness: LISTS_HARNESS,
    adapter: 'run_circ',
    hints: ['Walk once around the circle looking at pairs (cur, cur.next). Insert between them if cur.val <= x <= next.val.', 'The other place to insert is the wrap point, where cur.val > cur.next.val: there x belongs if it is >= cur.val (new max) or <= next.val (new min). If you come all the way back to head, any spot works.'],
    combines: ['ll-circular', 'll-singly'],
  },
};

export default unit;
