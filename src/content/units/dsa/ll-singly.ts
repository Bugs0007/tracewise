import { Recorder } from '@/engine/recorder';
import { linkedListPanel, type LLNodeView } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LISTS_HARNESS, requireInts } from '@/content/lib/lists-stacks';

const code = `
def insert_at(head, pos, val):
    dummy = ListNode(0, head)            #@dummyI
    prev = dummy                         #@prevI
    for _ in range(pos):                 #@walkI
        if prev.next is None:            #@endI
            break
        prev = prev.next                 #@advI
    node = ListNode(val)                 #@newI
    node.next = prev.next                #@linkNew
    prev.next = node                     #@linkPrev
    return dummy.next                    #@retI

def delete_value(head, target):
    dummy = ListNode(0, head)            #@dummyD
    prev = dummy                         #@prevD
    while prev.next:                     #@loopD
        if prev.next.val == target:      #@cmpD
            prev.next = prev.next.next   #@unlink
        else:
            prev = prev.next             #@advD
    return dummy.next                    #@retD
`;

interface In {
  values: number[];
  pos: number;
  val: number;
  target: number;
}

const NONE = 'none';

const viz: VizDef<In> = {
  id: 'll-singly',
  title: 'Singly linked list: insert and delete',
  code,
  language: 'python',
  inputs: [
    { key: 'values', label: 'List values', kind: 'numbers', default: [10, 20, 30, 20, 40], maxItems: 7 },
    { key: 'pos', label: 'Insert at position', kind: 'number', default: 2 },
    { key: 'val', label: 'Value to insert', kind: 'number', default: 25 },
    { key: 'target', label: 'Delete every node equal to', kind: 'number', default: 20 },
  ],
  presets: [
    { label: 'Insert at head', input: { values: [10, 20, 30], pos: 0, val: 5, target: 99 } },
    { label: 'Append past the end', input: { values: [1, 2, 3], pos: 9, val: 4, target: 3 } },
    { label: 'Empty list', input: { values: [], pos: 0, val: 7, target: 7 } },
    { label: 'Back-to-back duplicates', input: { values: [5, 5, 5, 2], pos: 1, val: 5, target: 5 } },
  ],
  run({ values, pos, val, target }) {
    requireInts(values, 'List values');
    if (!Number.isInteger(pos) || pos < 0) throw new Error('Position must be a whole number, 0 or more');
    const r = new Recorder(code);

    const label: Record<string, string> = {};
    const next: Record<string, string> = {};
    let order: string[] = [];
    values.forEach((v, i) => {
      label[`n${i}`] = String(v);
      order.push(`n${i}`);
    });
    order.forEach((id, i) => (next[id] = order[i + 1] ?? NONE));
    label.dummy = 'D';
    label[NONE] = 'None';

    let prev: string | null = null;
    let hot: string | null = null; // node being looked at / written
    let fresh: string | null = null; // newly created node
    let dying: string | null = null; // node just unlinked
    const edgeHot = new Set<string>();

    const head = () => (order.includes('dummy') ? next.dummy : order[0] ?? NONE);

    const panel = (title: string) => {
      const view: LLNodeView[] = order.map((id) => {
        const tags: string[] = [];
        if (id === 'dummy') tags.push('dummy');
        if (id === prev) tags.push('prev');
        const tone: Tone = id === dying ? 'error' : id === fresh ? 'new' : id === hot ? 'compare' : id === prev ? 'active' : id === 'dummy' ? 'muted' : 'default';
        return { id, label: label[id], tone, tags: tags.length ? tags : undefined };
      });
      view.push({ id: NONE, label: 'None', tone: 'muted' });
      const edgeTones: Record<string, Tone> = {};
      for (const k of edgeHot) edgeTones[k] = 'active';
      const nm: Record<string, string | null> = {};
      for (const id of order) if (next[id] !== undefined) nm[id] = next[id];
      return linkedListPanel(view, nm, { title, edgeTones, showNull: false });
    };
    const list = (): number[] => {
      const out: number[] = [];
      let c = head();
      while (c && c !== NONE) {
        out.push(Number(label[c]));
        c = next[c];
      }
      return out;
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ prev: prev ? label[prev] : 'None', ...extra });

    // ── insert_at ───────────────────────────────────────────
    const T1 = 'Insert';
    order = ['dummy', ...order];
    next.dummy = order[1] ?? NONE;
    edgeHot.add(`dummy>${next.dummy}`);
    r.step('dummyI', `Put a dummy node in front of the head so every position has a predecessor`, [panel(T1)], vars({ pos, val }));
    edgeHot.clear();
    prev = 'dummy';
    r.step('prevI', 'prev starts at the dummy: it will stop just before position ' + pos, [panel(T1)], vars({ pos, val }));
    for (let k = 0; k < pos; k++) {
      r.op();
      if (next[prev] === NONE) {
        r.step('endI', 'prev.next is None: the list is shorter than pos, so stop at the end', [panel(T1)], vars({ step: k }));
        break;
      }
      r.step('walkI', `Step ${k + 1} of ${pos}: advance prev one node`, [panel(T1)], vars({ step: k + 1 }));
      prev = next[prev];
      r.step('advI', `prev = ${label[prev]}`, [panel(T1)], vars({ step: k + 1 }));
    }
    const after = next[prev];
    // the new node sits right after prev in the drawing
    const id = 'new';
    label[id] = String(val);
    order.splice(order.indexOf(prev) + 1, 0, id);
    fresh = id;
    r.step('newI', `Create a node holding ${val} (not linked yet)`, [panel(T1)], vars({ val }));
    next[id] = after;
    edgeHot.add(`${id}>${after}`);
    r.op();
    r.step('linkNew', `New node points at prev.next (${after === NONE ? 'None' : label[after]}) first, so nothing is lost`, [panel(T1)], vars());
    edgeHot.clear();
    next[prev] = id;
    edgeHot.add(`${prev}>${id}`);
    r.op();
    r.step('linkPrev', `Now prev.next = new node: ${label[prev] === 'D' ? 'dummy' : label[prev]} → ${val}`, [panel(T1)], vars());
    edgeHot.clear();
    fresh = null;
    prev = null;
    order = order.filter((x) => x !== 'dummy');
    r.step('retI', `Return dummy.next: the list reads ${list().join(' → ')}`, [panel(T1)], vars());

    // ── delete_value ────────────────────────────────────────
    const T2 = 'Delete';
    order = ['dummy', ...order];
    next.dummy = order[1] ?? NONE;
    r.step('dummyD', `Dummy node again, so deleting the head needs no special case`, [panel(T2)], vars({ target }));
    prev = 'dummy';
    r.step('prevD', 'prev starts at the dummy', [panel(T2)], vars({ target }));
    while (true) {
      r.op();
      const cur: string = next[prev as string];
      if (cur === NONE) {
        hot = null;
        r.step('loopD', 'prev.next is None: end of the list', [panel(T2)], vars({ target }));
        break;
      }
      hot = cur;
      if (Number(label[cur]) === target) {
        r.step('cmpD', `${label[cur]} == ${target}: this node must go`, [panel(T2)], vars({ target }));
        next[prev as string] = next[cur];
        dying = cur;
        hot = null;
        edgeHot.add(`${prev}>${next[prev as string]}`);
        r.op();
        r.step('unlink', `prev.next skips over ${label[cur]}; prev stays put in case the next node matches too`, [panel(T2)], vars({ target }));
        edgeHot.clear();
        order = order.filter((x) => x !== cur);
        dying = null;
      } else {
        r.step('cmpD', `${label[cur]} != ${target}: keep it`, [panel(T2)], vars({ target }));
        prev = cur;
        hot = null;
        r.step('advD', `prev = ${label[prev as string]}`, [panel(T2)], vars({ target }));
      }
    }
    prev = null;
    order = order.filter((x) => x !== 'dummy');
    const out = list();
    r.step('retD', `Return dummy.next: ${out.length ? out.join(' → ') : 'the list is empty'}`, [panel(T2)], vars());
    return { frames: r.frames, result: out };
  },
  reference({ values, pos, val, target }) {
    const a = [...values];
    a.splice(Math.min(pos, a.length), 0, val);
    return a.filter((x) => x !== target);
  },
};

const insertTests = [
  { args: [[1, 2, 4], 2, 3], expected: [1, 2, 3, 4], name: 'middle' },
  { args: [[1, 2], 0, 9], expected: [9, 1, 2], name: 'at the head' },
  { args: [[], 0, 5], expected: [5], name: 'empty list' },
  { args: [[1, 2, 3], 3, 4], expected: [1, 2, 3, 4], name: 'at the tail' },
  { args: [[1, 2, 3], 10, 4], expected: [1, 2, 3, 4], name: 'past the end appends' },
  { args: [[7], 1, 8], expected: [7, 8], name: 'single node' },
];

const deleteTests = [
  { args: [[1, 2, 3, 2], 2], expected: [1, 3], name: 'two matches' },
  { args: [[1, 2, 2, 3], 2], expected: [1, 3], name: 'back-to-back duplicates' },
  { args: [[2, 2, 2], 2], expected: [], name: 'everything matches' },
  { args: [[1, 2], 5], expected: [1, 2], name: 'no match' },
  { args: [[], 1], expected: [], name: 'empty list' },
  { args: [[1, 1, 2], 1], expected: [2], name: 'head matches' },
];

const unit: Unit = {
  id: 'll-singly',
  hook: 'Every pointer-surgery question starts here: splice a node in, cut a node out, and never lose the rest of the list. A dummy head removes the "is it the head?" special cases that sink many whiteboard answers.',
  predict: {
    prompt: 'You delete the node holding 5 from [5, 7, 9] using the pattern `prev.next = prev.next.next`, but with no dummy node. What goes wrong?',
    options: [
      'Nothing, the pattern works on any node',
      'The head has no prev node, so deleting it needs a separate special case',
      'The 7 is deleted along with the 5',
      'Python frees the whole list',
    ],
    answer: 1,
    explain: 'The pattern rewires the node BEFORE the target, and the head has nothing before it. A dummy node in front of the head gives every real node a predecessor, so one loop handles head, middle and tail.',
  },
  viz,
  deeper: {
    points: [
      'Insert at position `pos`: walk `prev` to the node just before it, then do `node.next = prev.next` BEFORE `prev.next = node`.',
      'Delete: find the predecessor and set `prev.next = prev.next.next`. The deleted node becomes unreachable, so Python garbage-collects it.',
      'The dummy node is returned as `dummy.next`, so the head can change (insert at 0, delete the head) without extra code.',
      'After an unlink, do NOT advance `prev`: the new `prev.next` has not been checked yet (this is how duplicates survive).',
    ],
    complexity: { time: 'O(n) to reach the position, O(1) to rewire', space: 'O(1)' },
    pitfalls: [
      'Linking in the wrong order (`prev.next = node` first) makes the node point to itself and orphans the tail',
      'Advancing `prev` after a delete skips the next candidate, so back-to-back duplicates survive',
      'Walking past the end: check `prev.next is None` while stepping',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'insert_at',
    statement: 'Insert a new node holding `val` so that it ends up at index `pos` (0 = new head). If `pos` is past the end, append it. Return the head. Use a dummy node.',
    signature: 'def insert_at(head, pos, val):',
    solution: `def insert_at(head, pos, val):
    dummy = ListNode(0, head)
    prev = dummy
    for _ in range(pos):
        if @@prev.next is None@@:
            break
        prev = @@prev.next@@
    node = ListNode(val)
    node.next = @@prev.next@@
    prev.next = @@node@@
    return @@dummy.next@@`,
    tests: insertTests,
    harness: LISTS_HARNESS,
    adapter: 'run_list_args',
  },
  debug: {
    language: 'python',
    fnName: 'delete_value',
    statement: 'This should remove every node equal to `target`, but runs of equal values survive (or it crashes at the tail). Fix it.',
    buggy: `def delete_value(head, target):
    dummy = ListNode(0, head)
    prev = dummy
    while prev.next:
        if prev.next.val == target:
            prev.next = prev.next.next
        prev = prev.next
    return dummy.next`,
    fixed: `def delete_value(head, target):
    dummy = ListNode(0, head)
    prev = dummy
    while prev.next:
        if prev.next.val == target:
            prev.next = prev.next.next
        else:
            prev = prev.next
    return dummy.next`,
    tests: deleteTests,
    harness: LISTS_HARNESS,
    adapter: 'run_list_args',
    bugType: 'pointer advanced after unlink',
    hint: 'After `prev.next = prev.next.next`, has the NEW prev.next been checked yet?',
    explanation: 'Unlinking already moves a fresh node into prev.next. Advancing prev as well steps over it unchecked (so [2, 2] keeps one 2) or even runs off the end. Only advance prev in the else branch.',
  },
  boss: {
    title: 'Remove the N-th node from the end',
    statement: 'Given the head of a list and an integer `n` (1 <= n <= length), delete the n-th node counting from the END and return the head. Do it in a single pass.',
    language: 'python',
    fnName: 'remove_nth_from_end',
    starter: `def remove_nth_from_end(head, n):
    # your code here
    pass
`,
    solution: `def remove_nth_from_end(head, n):
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n):
        fast = fast.next
    while fast.next:
        fast = fast.next
        slow = slow.next
    slow.next = slow.next.next
    return dummy.next`,
    tests: [
      { args: [[1, 2, 3, 4, 5], 2], expected: [1, 2, 3, 5] },
      { args: [[1], 1], expected: [], name: 'single node' },
      { args: [[1, 2], 1], expected: [1], name: 'remove tail' },
      { args: [[1, 2], 2], expected: [2], name: 'remove head' },
      { args: [[1, 2, 3], 3], expected: [2, 3], name: 'n equals length' },
    ],
    harness: LISTS_HARNESS,
    adapter: 'run_list_args',
    hints: ['Start two pointers at a dummy node. Move one of them n steps ahead first.', 'Then move both together until the leading one is on the last node. The trailing one is now just before the node to delete.'],
    combines: ['ll-singly', 'two-pointers'],
  },
};

export default unit;
