import { Recorder } from '@/engine/recorder';
import { binaryTreePanel, type BTNode } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
class Node:
    def __init__(self, key):
        self.key = key
        self.left = self.right = None
        self.height = 1

def height(n):
    return n.height if n else 0

def balance(n):
    return height(n.left) - height(n.right)

def update(n):
    n.height = 1 + max(height(n.left), height(n.right))

def rotate_right(y):
    x = y.left                                 #@rotRpick
    y.left = x.right
    x.right = y                                #@rotRlift
    update(y)                                  #@rotRupd
    update(x)
    return x

def rotate_left(x):
    y = x.right                                #@rotLpick
    x.right = y.left
    y.left = x                                 #@rotLlift
    update(x)                                  #@rotLupd
    update(y)
    return y

def insert(node, key):
    if not node:
        return Node(key)                       #@new
    if key < node.key:
        node.left = insert(node.left, key)     #@goLeft
    elif key > node.key:
        node.right = insert(node.right, key)   #@goRight
    else:
        return node                            #@dup
    update(node)                               #@update
    b = balance(node)                          #@balance
    if b > 1:                                  #@leftHeavy
        if balance(node.left) < 0:             #@lCase
            node.left = rotate_left(node.left) #@lRot
        return rotate_right(node)              #@rotR
    if b < -1:                                 #@rightHeavy
        if balance(node.right) > 0:            #@rCase
            node.right = rotate_right(node.right)   #@rRot
        return rotate_left(node)               #@rotL
    return node                                #@ok

def build_avl(keys):
    root = None
    for key in keys:                           #@driver
        root = insert(root, key)               #@call
    return root                                #@done
`;

interface In {
  keys: number[];
}

interface AN {
  key: number;
  left: AN | null;
  right: AN | null;
  h: number;
}

const hOf = (n: AN | null) => (n ? n.h : 0);
const balOf = (n: AN | null) => (n ? hOf(n.left) - hOf(n.right) : 0);
const upd = (n: AN) => {
  n.h = 1 + Math.max(hOf(n.left), hOf(n.right));
};
const sgn = (b: number) => (b > 0 ? `+${b}` : String(b));
const id = (key: number) => `k${key}`;

function levelOrder(root: AN | null): (number | null)[] {
  const out: (number | null)[] = [];
  const q: (AN | null)[] = [root];
  for (let i = 0; i < q.length; i++) {
    const n = q[i];
    if (!n) {
      out.push(null);
      continue;
    }
    out.push(n.key);
    q.push(n.left, n.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

const viz: VizDef<In> = {
  id: 'avl-rotations',
  title: 'AVL insert & rotations',
  code,
  language: 'python',
  inputs: [{ key: 'keys', label: 'Keys, inserted in this order', kind: 'numbers', default: [10, 20, 30, 40, 35], maxItems: 9 }],
  presets: [
    { label: 'RR then RL', input: { keys: [10, 20, 30, 40, 35] } },
    { label: 'LL (rotate right)', input: { keys: [30, 20, 10] } },
    { label: 'LR (double)', input: { keys: [30, 10, 20] } },
    { label: 'Sorted run', input: { keys: [1, 2, 3, 4, 5, 6] } },
    { label: 'Duplicate key', input: { keys: [5, 3, 5, 8] } },
  ],
  run({ keys }) {
    if (!keys.length) throw new Error('Enter at least one key');
    if (keys.some((k) => !Number.isFinite(k))) throw new Error('Keys must be numbers');
    const r = new Recorder(code);
    let root = null as AN | null;
    let inserting = -1;

    const view = (tones: Record<number, Tone> = {}, tags: Record<number, string[]> = {}, edge: Record<string, Tone> = {}): Panel[] => {
      const toBT = (n: AN | null): BTNode | null => (n ? { id: id(n.key), val: n.key, left: toBT(n.left), right: toBT(n.right) } : null);
      const hs: Record<string, number> = {};
      const badges: Record<string, string> = {};
      const tn: Record<string, Tone> = {};
      const tg: Record<string, string[]> = {};
      const walk = (n: AN | null) => {
        if (!n) return;
        hs[id(n.key)] = n.h;
        badges[id(n.key)] = `b=${sgn(balOf(n))}`;
        if (tones[n.key]) tn[id(n.key)] = tones[n.key];
        if (tags[n.key]) tg[id(n.key)] = tags[n.key];
        walk(n.left);
        walk(n.right);
      };
      walk(root);
      const et: Record<string, Tone> = {};
      for (const [k, v] of Object.entries(edge)) {
        const [a, b] = k.split('>');
        et[`${id(Number(a))}>${id(Number(b))}`] = v;
      }
      const panel = binaryTreePanel(toBT(root), { tones: tn, badges, tags: tg, edgeTones: et, title: 'AVL tree  (h = height, b = balance = left - right)' });
      for (const nd of panel.nodes) nd.sub = `h${hs[nd.id]}`;
      const order: Panel = {
        type: 'array',
        title: 'Insert order',
        values: keys,
        hideIndex: true,
        tones: Object.fromEntries(keys.map((_, i) => [i, i < inserting ? 'done' : i === inserting ? 'active' : 'default'])) as Record<number, Tone>,
        pointers: inserting >= 0 && inserting < keys.length ? { now: inserting } : undefined,
      };
      return [panel, order];
    };
    const ancTones = (anc: number[], t: Tone): Record<number, Tone> => Object.fromEntries(anc.map((k) => [k, t]));
    const pathEdges = (anc: number[], cur: number | null, t: Tone): Record<string, Tone> => {
      const chain = cur === null ? anc : [...anc, cur];
      const out: Record<string, Tone> = {};
      for (let i = 1; i < chain.length; i++) out[`${chain[i - 1]}>${chain[i]}`] = t;
      return out;
    };

    // rotation helpers: `set` re-attaches the new subtree root to its parent immediately, so every frame shows a whole tree
    const rotateRight = (y: AN, set: (n: AN) => void, anc: number[]): AN => {
      const x = y.left!;
      const moved = x.right;
      const base = ancTones(anc, 'frontier');
      r.step('rotRpick', `Rotate right at ${y.key}: its left child ${x.key} will become the parent`, view({ ...base, [y.key]: 'error', [x.key]: 'active' }, { [y.key]: ['y'], [x.key]: ['x'] }), { y: y.key, x: x.key });
      y.left = moved;
      x.right = y;
      set(x);
      r.op();
      r.step('rotRlift', `${x.key} moves up; ${y.key} becomes its right child${moved ? `, ${moved.key} moves under ${y.key}` : ''}`, view({ ...base, [y.key]: 'swap', [x.key]: 'swap' }, { [x.key]: ['x'], [y.key]: ['y'] }, { [`${x.key}>${y.key}`]: 'swap' }), { y: y.key, x: x.key });
      upd(y);
      upd(x);
      r.op();
      r.step('rotRupd', `Recompute heights: ${y.key} → ${y.h}, then ${x.key} → ${x.h}. Balance ${sgn(balOf(x))}`, view({ ...base, [y.key]: 'done', [x.key]: 'done' }, { [x.key]: ['top'] }), { x: x.key, 'height(x)': x.h, 'height(y)': y.h });
      return x;
    };
    const rotateLeft = (x: AN, set: (n: AN) => void, anc: number[]): AN => {
      const y = x.right!;
      const moved = y.left;
      const base = ancTones(anc, 'frontier');
      r.step('rotLpick', `Rotate left at ${x.key}: its right child ${y.key} will become the parent`, view({ ...base, [x.key]: 'error', [y.key]: 'active' }, { [x.key]: ['x'], [y.key]: ['y'] }), { x: x.key, y: y.key });
      x.right = moved;
      y.left = x;
      set(y);
      r.op();
      r.step('rotLlift', `${y.key} moves up; ${x.key} becomes its left child${moved ? `, ${moved.key} moves under ${x.key}` : ''}`, view({ ...base, [x.key]: 'swap', [y.key]: 'swap' }, { [y.key]: ['y'], [x.key]: ['x'] }, { [`${y.key}>${x.key}`]: 'swap' }), { x: x.key, y: y.key });
      upd(x);
      upd(y);
      r.op();
      r.step('rotLupd', `Recompute heights: ${x.key} → ${x.h}, then ${y.key} → ${y.h}. Balance ${sgn(balOf(y))}`, view({ ...base, [x.key]: 'done', [y.key]: 'done' }, { [y.key]: ['top'] }), { y: y.key, 'height(x)': x.h, 'height(y)': y.h });
      return y;
    };

    const insert = (node: AN | null, key: number, set: (n: AN) => void, anc: number[]): AN => {
      if (!node) {
        const leaf: AN = { key, left: null, right: null, h: 1 };
        set(leaf);
        r.op();
        r.step('new', `Slot is empty → place ${key} as a new leaf (height 1)`, view({ ...ancTones(anc, 'path'), [key]: 'new' }, {}, pathEdges(anc, key, 'path')), { key });
        return leaf;
      }
      r.op();
      if (key < node.key) {
        r.step('goLeft', `${key} < ${node.key} → go left`, view({ ...ancTones(anc, 'path'), [node.key]: 'compare' }, { [node.key]: ['node'] }, pathEdges(anc, node.key, 'path')), { key, node: node.key });
        node.left = insert(node.left, key, (n) => (node.left = n), [...anc, node.key]);
      } else if (key > node.key) {
        r.step('goRight', `${key} > ${node.key} → go right`, view({ ...ancTones(anc, 'path'), [node.key]: 'compare' }, { [node.key]: ['node'] }, pathEdges(anc, node.key, 'path')), { key, node: node.key });
        node.right = insert(node.right, key, (n) => (node.right = n), [...anc, node.key]);
      } else {
        r.step('dup', `${key} is already in the tree → ignore it`, view({ ...ancTones(anc, 'path'), [node.key]: 'muted' }), { key });
        return node;
      }
      const before = node.h;
      upd(node);
      const b = balOf(node);
      const pending = ancTones(anc, 'frontier');
      const heavy = Math.abs(b) > 1;
      r.op();
      r.step(
        heavy ? (b > 1 ? 'leftHeavy' : 'rightHeavy') : 'balance',
        heavy ? `Node ${node.key}: balance ${sgn(b)} → ${b > 0 ? 'left' : 'right'}-heavy, needs a rotation` : `Node ${node.key}: height ${before} → ${node.h}, balance ${sgn(b)} is fine`,
        view({ ...pending, [node.key]: heavy ? 'error' : 'active' }, { [node.key]: ['node'] }),
        { node: node.key, height: node.h, balance: b },
      );
      if (!heavy) return node;
      if (b > 1) {
        const child = node.left!;
        const cb = balOf(child);
        r.op();
        r.step('lCase', cb < 0 ? `Left child ${child.key} leans right (${sgn(cb)}) → Left-Right case: rotate it left first` : `Left child ${child.key} balance ${sgn(cb)} → Left-Left case: one right rotation`, view({ ...pending, [node.key]: 'error', [child.key]: 'compare' }, { [node.key]: ['node'], [child.key]: ['child'] }), { case: cb < 0 ? 'LR' : 'LL', 'balance(left)': cb });
        if (cb < 0) node.left = rotateLeft(child, (n) => (node.left = n), [...anc, node.key]);
        return rotateRight(node, set, anc);
      }
      const child = node.right!;
      const cb = balOf(child);
      r.op();
      r.step('rCase', cb > 0 ? `Right child ${child.key} leans left (${sgn(cb)}) → Right-Left case: rotate it right first` : `Right child ${child.key} balance ${sgn(cb)} → Right-Right case: one left rotation`, view({ ...pending, [node.key]: 'error', [child.key]: 'compare' }, { [node.key]: ['node'], [child.key]: ['child'] }), { case: cb > 0 ? 'RL' : 'RR', 'balance(right)': cb });
      if (cb > 0) node.right = rotateRight(child, (n) => (node.right = n), [...anc, node.key]);
      return rotateLeft(node, set, anc);
    };

    r.step('driver', `Insert ${keys.length} key${keys.length === 1 ? '' : 's'} one at a time; after each, repair imbalance on the way back up`, view(), { keys: keys.join(' ') });
    keys.forEach((key, i) => {
      inserting = i;
      r.step('call', `insert(${key}): start at the root${root ? '' : ' (empty tree)'}`, view(), { key });
      root = insert(root, key, (n) => (root = n), []);
    });
    inserting = keys.length;
    const out = levelOrder(root);
    r.step('done', `All keys inserted; the tree is balanced (root ${root!.key}, height ${root!.h})`, view(Object.fromEntries(levelKeys(root).map((k) => [k, 'done' as Tone]))), { root: root!.key, height: root!.h });
    return { frames: r.frames, result: out };
  },
  reference({ keys }) {
    interface F {
      k: number;
      l: F | null;
      r: F | null;
      h: number;
    }
    const H = (n: F | null) => (n ? n.h : 0);
    const mk = (k: number, l: F | null, rr: F | null): F => ({ k, l, r: rr, h: 1 + Math.max(H(l), H(rr)) });
    const rotR = (n: F): F => mk(n.l!.k, n.l!.l, mk(n.k, n.l!.r, n.r));
    const rotL = (n: F): F => mk(n.r!.k, mk(n.k, n.l, n.r!.l), n.r!.r);
    const ins = (n: F | null, k: number): F => {
      if (!n) return mk(k, null, null);
      if (k === n.k) return n;
      const t = k < n.k ? mk(n.k, ins(n.l, k), n.r) : mk(n.k, n.l, ins(n.r, k));
      const b = H(t.l) - H(t.r);
      if (b > 1) return H(t.l!.l) >= H(t.l!.r) ? rotR(t) : rotR(mk(t.k, rotL(t.l!), t.r));
      if (b < -1) return H(t.r!.r) >= H(t.r!.l) ? rotL(t) : rotL(mk(t.k, t.l, rotR(t.r!)));
      return t;
    };
    let root: F | null = null;
    for (const k of keys) root = ins(root, k);
    const out: (number | null)[] = [];
    const q: (F | null)[] = [root];
    for (let i = 0; i < q.length; i++) {
      const n = q[i];
      if (!n) {
        out.push(null);
        continue;
      }
      out.push(n.k);
      q.push(n.l, n.r);
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  },
};

function levelKeys(root: AN | null): number[] {
  const out: number[] = [];
  const walk = (n: AN | null) => {
    if (!n) return;
    out.push(n.key);
    walk(n.left);
    walk(n.right);
  };
  walk(root);
  return out;
}

const AVL_HARNESS = `
class AVLNode:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
        self.height = 1

def height(n):
    return n.height if n else 0

def balance(n):
    return height(n.left) - height(n.right) if n else 0

def update(n):
    n.height = 1 + max(height(n.left), height(n.right))

def run_avl(fn, keys):
    root = None
    for k in keys:
        root = fn(root, k)
    out = []
    q = [root]
    i = 0
    while i < len(q):
        n = q[i]
        i += 1
        if n is None:
            out.append(None)
            continue
        out.append(n.key)
        q.append(n.left)
        q.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return out
`;

const tests = [
  { args: [[10, 20, 30]], expected: [20, 10, 30], name: 'RR: rotate left' },
  { args: [[30, 20, 10]], expected: [20, 10, 30], name: 'LL: rotate right' },
  { args: [[30, 10, 20]], expected: [20, 10, 30], name: 'LR: double rotation' },
  { args: [[10, 30, 20]], expected: [20, 10, 30], name: 'RL: double rotation' },
  { args: [[10, 20, 30, 40, 50, 25]], expected: [30, 20, 40, 10, 25, null, 50] },
  { args: [[7, 6, 5, 4, 3, 2, 1]], expected: [4, 2, 6, 1, 3, 5, 7], name: 'descending run' },
  { args: [[50, 40, 30, 20, 10]], expected: [40, 20, 50, 10, 30], name: 'heights matter after rotating' },
  { args: [[5, 5]], expected: [5], name: 'duplicate key' },
  { args: [[]], expected: [], name: 'no keys' },
];

const unit: Unit = {
  id: 'avl-rotations',
  hook: 'A plain BST degrades to a linked list on sorted input. AVL trees fix that by rotating whenever two subtrees differ in height by more than 1. Interviewers use it to see whether you can reason about pointers and heights, even if you never ship one.',
  predict: {
    prompt: 'You insert 10, 20, 30 (in that order) into an AVL tree. What is the root afterwards?',
    options: ['10, because it was inserted first', '20, after a left rotation at 10', '30, because it is the largest', '20, after a right rotation at 30'],
    answer: 1,
    explain: 'Without balancing you get the chain 10 → 20 → 30. At 10 the right side is two levels taller than the left (balance -2, Right-Right case). One left rotation lifts 20 to the top with 10 and 30 as children.',
  },
  viz,
  deeper: {
    points: [
      'Balance factor = height(left) - height(right). AVL keeps every node in -1, 0, +1.',
      'After inserting, walk back up recomputing heights. The first node with |balance| = 2 is the one to fix; one fix (single or double rotation) restores the whole tree after an insert.',
      'Four cases: Left-Left (rotate right), Right-Right (rotate left), Left-Right (rotate the left child left, then rotate right), Right-Left (mirror).',
      'To tell single from double, look at the heavy child: if it leans the opposite way, you need the extra rotation first.',
      'A rotation keeps the in-order sequence unchanged, so the BST ordering stays valid. Only heights change, and only for the nodes you moved.',
    ],
    complexity: { time: 'O(log n) per insert', space: 'O(h) recursion' },
    pitfalls: ['Forgetting to update heights after a rotation (later balance factors are wrong)', 'Updating the new top before the node that moved down, so its height uses a stale value', 'Using one rotation for a zig-zag (LR / RL) shape, which just mirrors the imbalance'],
  },
  practice: {
    language: 'python',
    fnName: 'avl_insert',
    harness: AVL_HARNESS,
    adapter: 'run_avl',
    statement: 'Write `avl_insert(node, key)`: insert into an AVL tree and return the new subtree root, ignoring duplicates. `AVLNode(key)` (with `.height`), `height`, `balance` and `update` are already provided.',
    signature: 'def avl_insert(node, key):',
    solution: `def rotate_right(y):
    x = @@y.left@@
    y.left = x.right
    x.right = y
    update(y)
    update(x)
    return x

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update(x)
    update(y)
    return y

def avl_insert(node, key):
    if not node:
        return AVLNode(key)
    if key < node.key:
        node.left = avl_insert(node.left, key)
    elif key > node.key:
        node.right = avl_insert(node.right, key)
    else:
        return node
    update(node)
    b = @@balance(node)@@
    if @@b > 1@@:
        if balance(node.left) < 0:
            node.left = rotate_left(node.left)
        return rotate_right(node)
    if b < -1:
        if @@balance(node.right) > 0@@:
            node.right = rotate_right(node.right)
        return rotate_left(node)
    return node`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'avl_insert',
    harness: AVL_HARNESS,
    adapter: 'run_avl',
    statement: 'Short sequences come out right, but after a few rotations the shape becomes wrong. Find the bug in a rotation.',
    buggy: `def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update(x)
    update(y)
    return x

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update(x)
    update(y)
    return y

def avl_insert(node, key):
    if not node:
        return AVLNode(key)
    if key < node.key:
        node.left = avl_insert(node.left, key)
    elif key > node.key:
        node.right = avl_insert(node.right, key)
    else:
        return node
    update(node)
    b = balance(node)
    if b > 1:
        if balance(node.left) < 0:
            node.left = rotate_left(node.left)
        return rotate_right(node)
    if b < -1:
        if balance(node.right) > 0:
            node.right = rotate_right(node.right)
        return rotate_left(node)
    return node`,
    fixed: `def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update(y)
    update(x)
    return x

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update(x)
    update(y)
    return y

def avl_insert(node, key):
    if not node:
        return AVLNode(key)
    if key < node.key:
        node.left = avl_insert(node.left, key)
    elif key > node.key:
        node.right = avl_insert(node.right, key)
    else:
        return node
    update(node)
    b = balance(node)
    if b > 1:
        if balance(node.left) < 0:
            node.left = rotate_left(node.left)
        return rotate_right(node)
    if b < -1:
        if balance(node.right) > 0:
            node.right = rotate_right(node.right)
        return rotate_left(node)
    return node`,
    tests,
    bugType: 'stale height after rotation',
    hint: 'Compare the two update() calls in rotate_right with rotate_left. After the rotation, which node is the CHILD and which is the parent?',
    explanation: 'After rotate_right, y is the lower node and x sits above it, so x\'s height depends on y\'s. update(y) must run first; updating x first reads y\'s old, too-large height, and later balance checks see wrong values.',
  },
  boss: {
    title: 'Is the tree balanced?',
    statement: 'A binary tree is height-balanced if, for every node, the heights of its left and right subtrees differ by at most 1. Given the root, return True or False. Aim for O(n): compute heights bottom-up and bail out early.',
    language: 'python',
    fnName: 'is_balanced',
    harness: `
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

from collections import deque as _deque

def _build_tree(level):
    if not level or level[0] is None:
        return None
    root = TreeNode(level[0])
    q = _deque([root])
    i = 1
    while q and i < len(level):
        node = q.popleft()
        if i < len(level) and level[i] is not None:
            node.left = TreeNode(level[i])
            q.append(node.left)
        i += 1
        if i < len(level) and level[i] is not None:
            node.right = TreeNode(level[i])
            q.append(node.right)
        i += 1
    return root

def run_tree(fn, level):
    return fn(_build_tree(level))
`,
    adapter: 'run_tree',
    starter: `def is_balanced(root):
    # your code here
    pass
`,
    solution: `def is_balanced(root):
    def height(node):
        if not node:
            return 0
        lh = height(node.left)
        if lh < 0:
            return -1
        rh = height(node.right)
        if rh < 0 or abs(lh - rh) > 1:
            return -1
        return 1 + max(lh, rh)
    return height(root) >= 0`,
    tests: [
      { args: [[3, 9, 20, null, null, 15, 7]], expected: true },
      { args: [[1, 2, 2, 3, 3, null, null, 4, 4]], expected: false, name: 'deep on the left' },
      { args: [[]], expected: true, name: 'empty tree' },
      { args: [[1]], expected: true, name: 'single node' },
      { args: [[1, 2, null, 3]], expected: false, name: 'a left-leaning chain' },
      { args: [[1, 2, 3, 4, null, null, 5]], expected: true, name: 'unbalanced children but balanced heights' },
    ],
    hints: ['Computing the height of every subtree separately repeats work. Can one recursion return the height and signal "unbalanced" at the same time?', 'Return -1 as soon as a subtree is unbalanced (or a child already returned -1); otherwise return 1 + max of the child heights. The tree is balanced if the root does not return -1.'],
    combines: ['tree-postorder', 'avl-rotations'],
  },
};

export default unit;
