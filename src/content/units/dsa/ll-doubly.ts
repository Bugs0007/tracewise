import { Recorder } from '@/engine/recorder';
import { linkedListPanel, type LLNodeView } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { requireInts } from '@/content/lib/lists-stacks';

const code = `
class DNode:
    def __init__(self, val):
        self.val = val
        self.prev = None
        self.next = None

class DoublyLinkedList:
    def __init__(self):
        self.head = DNode(None)
        self.tail = DNode(None)
        self.head.next = self.tail
        self.tail.prev = self.head

    def insert(self, i, val):
        p = self.head                                  #@start
        while i > 0 and p.next is not self.tail:       #@cond
            p = p.next                                 #@walk
            i -= 1
        node = DNode(val)                              #@new
        node.prev = p                                  #@setPrev
        node.next = p.next                             #@setNext
        p.next.prev = node                             #@fixNextPrev
        p.next = node                                  #@fixPNext

    def remove(self, val):
        p = self.head.next                             #@rstart
        while p is not self.tail:                      #@rloop
            if p.val == val:                           #@rcmp
                p.prev.next = p.next                   #@unlinkNext
                p.next.prev = p.prev                   #@unlinkPrev
                return True                            #@rret
            p = p.next                                 #@radv
        return False                                   #@rfalse
`;

interface In {
  values: number[];
  at: number;
  val: number;
  rem: number;
}

const H = 'H';
const T = 'T';

const viz: VizDef<In> = {
  id: 'll-doubly',
  title: 'Doubly linked list: insert and remove',
  code,
  language: 'python',
  inputs: [
    { key: 'values', label: 'List values', kind: 'numbers', default: [1, 2, 3, 4], maxItems: 6 },
    { key: 'at', label: 'Insert at index', kind: 'number', default: 2 },
    { key: 'val', label: 'Value to insert', kind: 'number', default: 9 },
    { key: 'rem', label: 'Remove first node equal to', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Insert at front', input: { values: [5, 6, 7], at: 0, val: 4, rem: 7 } },
    { label: 'Append at tail', input: { values: [1, 2, 3], at: 99, val: 4, rem: 1 } },
    { label: 'Remove missing value', input: { values: [1, 2, 3], at: 1, val: 8, rem: 42 } },
    { label: 'Empty list', input: { values: [], at: 0, val: 5, rem: 5 } },
  ],
  run({ values, at, val, rem }) {
    requireInts(values, 'List values');
    if (!Number.isInteger(at) || at < 0) throw new Error('Index must be a whole number, 0 or more');
    const r = new Recorder(code);

    const label: Record<string, string> = { [H]: 'H', [T]: 'T' };
    const next: Record<string, string | null> = {};
    const prv: Record<string, string | null> = {};
    let order: string[] = [H];
    values.forEach((v, i) => {
      label[`n${i}`] = String(v);
      order.push(`n${i}`);
    });
    order.push(T);
    order.forEach((id, i) => {
      next[id] = order[i + 1] ?? null;
      prv[id] = order[i - 1] ?? null;
    });
    const nx = (id: string): string => next[id] as string;

    let p: string | null = null;
    let fresh: string | null = null;
    let dying: string | null = null;
    const hotNext = new Set<string>();
    const hotPrev = new Set<string>();
    const name = (id: string) => (id === H ? 'head' : id === T ? 'tail' : label[id]);

    const panel = () => {
      const view: LLNodeView[] = order.map((id) => {
        const tags: string[] = [];
        if (id === p) tags.push('p');
        const tone: Tone = id === dying ? 'error' : id === fresh ? 'new' : id === p ? 'active' : id === H || id === T ? 'muted' : 'default';
        return { id, label: label[id], tone, tags: tags.length ? tags : undefined };
      });
      const edgeTones: Record<string, Tone> = {};
      for (const k of hotNext) edgeTones[k] = 'active';
      for (const k of hotPrev) edgeTones[k] = 'active';
      return linkedListPanel(view, next, { prev: prv, title: 'Doubly linked list (solid = next, dashed = prev)', edgeTones, showNull: false });
    };
    const forward = (): string[] => {
      const out: string[] = [];
      let c = nx(H);
      while (c !== T) {
        out.push(label[c]);
        c = nx(c);
      }
      return out;
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ p: p ? name(p) : 'None', ...extra });
    const clear = () => {
      hotNext.clear();
      hotPrev.clear();
    };

    // ── insert ──────────────────────────────────────────────
    let i = at;
    p = H;
    r.step('start', `p starts at the head sentinel; we want index ${at}`, [panel()], vars({ i }));
    while (true) {
      r.op();
      if (!(i > 0 && nx(p) !== T)) {
        r.step('cond', i === 0 ? 'i is 0: p is the node just before the new one' : 'p.next is the tail: stop, the list is shorter than i', [panel()], vars({ i }));
        break;
      }
      r.step('cond', `i = ${i} > 0 and p.next is a real node: keep walking`, [panel()], vars({ i }));
      p = nx(p);
      i -= 1;
      r.step('walk', `p moves to ${name(p)}, i = ${i}`, [panel()], vars({ i }));
    }
    const after = nx(p);
    const nid = 'new';
    label[nid] = String(val);
    order.splice(order.indexOf(p) + 1, 0, nid);
    next[nid] = null;
    prv[nid] = null;
    fresh = nid;
    r.step('new', `Create a node holding ${val}, not linked yet`, [panel()], vars({ val }));
    prv[nid] = p;
    hotPrev.add(`${nid}<${p}`);
    r.op();
    r.step('setPrev', `New node's prev points back at ${name(p)}`, [panel()], vars());
    clear();
    next[nid] = after;
    hotNext.add(`${nid}>${after}`);
    r.op();
    r.step('setNext', `New node's next points forward at ${name(after)}`, [panel()], vars());
    clear();
    prv[after] = nid;
    hotPrev.add(`${after}<${nid}`);
    r.op();
    r.step('fixNextPrev', `${name(after)}.prev now points back at the new node`, [panel()], vars());
    clear();
    next[p] = nid;
    hotNext.add(`${p}>${nid}`);
    r.op();
    r.step('fixPNext', `${name(p)}.next now points at the new node: both directions agree`, [panel()], vars());
    clear();
    fresh = null;
    p = null;

    // ── remove ──────────────────────────────────────────────
    p = nx(H);
    r.step('rstart', `Search for ${rem}, starting at the first real node`, [panel()], vars({ rem }));
    while (true) {
      r.op();
      if (p === T) {
        r.step('rloop', 'p reached the tail sentinel: value not found', [panel()], vars({ rem }));
        r.step('rfalse', `No node holds ${rem}: return False`, [panel()], vars({ rem }));
        break;
      }
      if (Number(label[p]) === rem) {
        r.step('rcmp', `${label[p]} == ${rem}: unlink this node`, [panel()], vars({ rem }));
        const before = prv[p] as string;
        const nxt = nx(p);
        next[before] = nxt;
        dying = p;
        hotNext.add(`${before}>${nxt}`);
        r.op();
        r.step('unlinkNext', `${name(before)}.next skips ${label[p]}, but ${name(nxt)}.prev still points at it`, [panel()], vars({ rem }));
        clear();
        prv[nxt] = before;
        hotPrev.add(`${nxt}<${before}`);
        r.op();
        r.step('unlinkPrev', `${name(nxt)}.prev now points at ${name(before)}: ${label[p]} is out of both chains`, [panel()], vars({ rem }));
        clear();
        order = order.filter((x) => x !== p);
        dying = null;
        p = null;
        r.step('rret', `Return True: the list reads ${forward().join(' ⇄ ') || 'empty'}`, [panel()], vars({ rem }));
        break;
      }
      r.step('rcmp', `${label[p]} != ${rem}: keep looking`, [panel()], vars({ rem }));
      p = nx(p);
      r.step('radv', `p = ${name(p)}`, [panel()], vars({ rem }));
    }
    return { frames: r.frames, result: forward().map(Number) };
  },
  reference({ values, at, val, rem }) {
    const a = [...values];
    a.splice(Math.min(at, a.length), 0, val);
    const k = a.indexOf(rem);
    if (k >= 0) a.splice(k, 1);
    return a;
  },
};

const DNODE = `
class DNode:
    def __init__(self, val):
        self.val = val
        self.prev = None
        self.next = None
`;

const dllTests = [
  { args: [['DoublyLinkedList', 'insert', 'insert', 'insert', 'to_list', 'to_list_reversed'], [[], [0, 1], [1, 3], [1, 2], [], []]], expected: [null, null, null, null, [1, 2, 3], [3, 2, 1]], name: 'insert in the middle' },
  { args: [['DoublyLinkedList', 'insert', 'insert', 'insert', 'remove', 'to_list', 'to_list_reversed'], [[], [0, 1], [1, 2], [2, 3], [2], [], []]], expected: [null, null, null, null, true, [1, 3], [3, 1]], name: 'remove the middle' },
  { args: [['DoublyLinkedList', 'to_list', 'to_list_reversed', 'remove'], [[], [], [], [5]]], expected: [null, [], [], false], name: 'empty list' },
  { args: [['DoublyLinkedList', 'insert', 'insert', 'insert', 'to_list', 'to_list_reversed'], [[], [0, 5], [0, 4], [9, 6], [], []]], expected: [null, null, null, null, [4, 5, 6], [6, 5, 4]], name: 'front and past the end' },
  { args: [['DoublyLinkedList', 'insert', 'insert', 'insert', 'remove', 'to_list', 'remove', 'to_list_reversed', 'remove'], [[], [0, 1], [1, 1], [2, 2], [1], [], [2], [], [7]]], expected: [null, null, null, null, true, [1, 2], true, [1], false], name: 'duplicates, tail, missing' },
];

const dllClass = (removeBody: string) => `class DoublyLinkedList:
    def __init__(self):
        self.head = DNode(None)
        self.tail = DNode(None)
        self.head.next = self.tail
        self.tail.prev = self.head

    def insert(self, i, val):
        p = self.head
        while i > 0 and p.next is not self.tail:
            p = p.next
            i -= 1
        node = DNode(val)
        node.prev = p
        node.next = p.next
        p.next.prev = node
        p.next = node

    def remove(self, val):
        p = self.head.next
        while p is not self.tail:
            if p.val == val:
${removeBody}
                return True
            p = p.next
        return False

    def to_list(self):
        out, p = [], self.head.next
        while p is not self.tail:
            out.append(p.val)
            p = p.next
        return out

    def to_list_reversed(self):
        out, p = [], self.tail.prev
        while p is not self.head:
            out.append(p.val)
            p = p.prev
        return out`;

const unit: Unit = {
  id: 'll-doubly',
  hook: 'Doubly linked lists power LRU caches, browser history and undo stacks. Interviewers watch one thing: do you update BOTH `next` and `prev` on all four affected links, in a safe order?',
  predict: {
    prompt: 'Node X is spliced between A and B in a doubly linked list. How many pointer assignments are needed?',
    options: ['2: A.next and B.prev', '3: X.next, A.next and B.prev', '4: X.prev, X.next, A.next and B.prev', '6: every node touches all its pointers'],
    answer: 2,
    explain: 'The new node needs its own two pointers (prev and next), and each neighbour needs one pointer redirected to it (A.next and B.prev). Miss any one and walking forward and backward give different lists.',
  },
  viz,
  deeper: {
    points: [
      'Sentinel head and tail nodes mean every real node has both a prev and a next, so insert and delete never test for None.',
      'Insert: set the new node\'s two pointers first, then redirect the neighbours. Use `p.next` before you overwrite it.',
      'Delete needs no traversal to the predecessor when you already hold the node: `p.prev.next = p.next; p.next.prev = p.prev`. That is why LRU caches use it.',
      'Between the two unlink lines the list is briefly inconsistent: forward skips the node, backward does not.',
    ],
    complexity: { time: 'O(1) to rewire a known node, O(n) to find it', space: 'O(1) extra per node (one extra pointer)' },
    pitfalls: ['Updating `next` pointers but forgetting `prev` (the list looks fine forward and is corrupt backward)', 'Overwriting `p.next` before copying it into `node.next`', 'Forgetting the neighbour at the end of the list when you have no tail sentinel'],
  },
  practice: {
    language: 'python',
    fnName: 'DoublyLinkedList',
    statement: 'Complete the class using head and tail sentinel nodes (DNode with val, prev, next is provided). `insert(i, val)` puts the value at index i (append if i is past the end); `remove(val)` unlinks the first match and returns True/False.',
    signature: 'class DoublyLinkedList:',
    solution: `class DoublyLinkedList:
    def __init__(self):
        self.head = DNode(None)
        self.tail = DNode(None)
        self.head.next = self.tail
        self.tail.prev = self.head

    def insert(self, i, val):
        p = self.head
        while i > 0 and @@p.next is not self.tail@@:
            p = p.next
            i -= 1
        node = DNode(val)
        node.prev = @@p@@
        node.next = @@p.next@@
        p.next.prev = @@node@@
        p.next = @@node@@

    def remove(self, val):
        p = self.head.next
        while p is not self.tail:
            if p.val == val:
                p.prev.next = @@p.next@@
                p.next.prev = @@p.prev@@
                return True
            p = p.next
        return False

    def to_list(self):
        out, p = [], self.head.next
        while p is not self.tail:
            out.append(p.val)
            p = p.next
        return out

    def to_list_reversed(self):
        out, p = [], self.tail.prev
        while p is not self.head:
            out.append(p.val)
            p = p.prev
        return out`,
    tests: dllTests,
    harness: OPS_HARNESS + DNODE,
    adapter: 'run_ops',
  },
  debug: {
    language: 'python',
    fnName: 'DoublyLinkedList',
    statement: 'After `remove`, walking the list forward looks right but `to_list_reversed()` still visits the removed node. Fix `remove`.',
    buggy: dllClass('                p.prev.next = p.next'),
    fixed: dllClass('                p.prev.next = p.next\n                p.next.prev = p.prev'),
    tests: dllTests,
    harness: OPS_HARNESS + DNODE,
    adapter: 'run_ops',
    bugType: 'forgot to update prev',
    hint: 'Count the pointers that referenced the removed node. How many did you change?',
    explanation: 'Two pointers point at the removed node: its predecessor\'s next and its successor\'s prev. Only the first was redirected, so the backward chain still passes through the dead node. Add `p.next.prev = p.prev`.',
  },
  boss: {
    title: 'Browser history',
    statement: 'Design `BrowserHistory(homepage)` with `visit(url)`, `back(steps)` and `forward(steps)`. `visit` opens a page and discards all forward history. `back`/`forward` move up to `steps` pages (stopping at the ends) and return the current URL.',
    language: 'python',
    fnName: 'BrowserHistory',
    starter: `class BrowserHistory:
    # your code here
    pass
`,
    solution: `class Page:
    def __init__(self, url):
        self.url = url
        self.prev = None
        self.next = None

class BrowserHistory:
    def __init__(self, homepage):
        self.cur = Page(homepage)

    def visit(self, url):
        page = Page(url)
        page.prev = self.cur
        self.cur.next = page
        self.cur = page

    def back(self, steps):
        while steps > 0 and self.cur.prev:
            self.cur = self.cur.prev
            steps -= 1
        return self.cur.url

    def forward(self, steps):
        while steps > 0 and self.cur.next:
            self.cur = self.cur.next
            steps -= 1
        return self.cur.url`,
    tests: [
      { args: [['BrowserHistory', 'visit', 'visit', 'visit', 'back', 'back', 'forward', 'visit', 'forward', 'back', 'back'], [['home'], ['a'], ['b'], ['c'], [1], [1], [1], ['d'], [2], [2], [7]]], expected: [null, null, null, null, 'b', 'a', 'b', null, 'd', 'a', 'home'], name: 'mixed session' },
      { args: [['BrowserHistory', 'back', 'forward'], [['x'], [3], [3]]], expected: [null, 'x', 'x'], name: 'nothing to go back to' },
      { args: [['BrowserHistory', 'visit', 'back', 'forward', 'forward'], [['x'], ['y'], [1], [1], [1]]], expected: [null, null, 'x', 'y', 'y'], name: 'stops at the newest page' },
      { args: [['BrowserHistory', 'visit', 'visit', 'back', 'visit', 'forward', 'back'], [['p'], ['q'], ['r'], [2], ['s'], [5], [1]]], expected: [null, null, null, 'p', null, 's', 'p'], name: 'visit clears forward history' },
    ],
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    hints: ['Think of each page as a node with prev (back) and next (forward) links, plus one pointer to the current page.', 'visit links a new node after the current one and simply drops cur.next (that is the forward history). back and forward walk up to `steps` links, stopping when the link is None.'],
    combines: ['ll-doubly', 'll-singly'],
  },
};

export default unit;
