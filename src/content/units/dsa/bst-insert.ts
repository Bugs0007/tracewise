import { Recorder } from '@/engine/recorder';
import { buildTree, treeToLevel, type BTNode } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { checkBst, edgeKey, levelOf, mkNode, outputPanel, parseTree, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
def insert(root, val):
    node = TreeNode(val)
    if root is None:
        return node                         #@newRoot
    curr = root                             #@init
    while True:
        if val < curr.val:                  #@cmp
            if curr.left is None:           #@checkL
                curr.left = node            #@attachL
                break
            curr = curr.left                #@goL
        else:
            if curr.right is None:          #@checkR
                curr.right = node           #@attachR
                break
            curr = curr.right               #@goR
    return root                             #@done
`;

interface In {
  tree: Level;
  value: number;
}

const viz: VizDef<In> = {
  id: 'bst-insert',
  title: 'BST insert',
  code,
  language: 'python',
  inputs: [
    { key: 'tree', label: 'BST (level order, null = empty)', kind: 'numbers', default: [8, 3, 10, 1, 6, null, 14], maxItems: 20, help: 'Must be a valid BST: smaller values on the left, larger on the right.' },
    { key: 'value', label: 'Value to insert', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'New maximum', input: { tree: [8, 3, 10, 1, 6, null, 14], value: 20 } },
    { label: 'Duplicate goes right', input: { tree: [8, 3, 10, 1, 6, null, 14], value: 6 } },
    { label: 'Into a chain', input: { tree: [1, null, 2, null, 3], value: 4 } },
    { label: 'Empty tree', input: { tree: [], value: 4 } },
  ],
  run({ tree, value }) {
    const root0 = parseTree(tree);
    checkBst(root0, true);
    const r = new Recorder(code);
    const nn = mkNode(value, 'new');
    const edgeTones: Record<string, Tone> = {};
    const path: BTNode[] = [];
    let root: BTNode | null = root0;
    let curr: BTNode | null = null;
    let cmpNode: BTNode | null = null;

    const panels = () => [
      treePanel(
        root,
        (n) => {
          if (n === nn) return { tone: 'new', tags: ['new'] };
          if (n === curr) return { tone: cmpNode === n ? 'compare' : 'active', tags: ['curr'] };
          return { tone: path.includes(n) ? 'visited' : 'default' };
        },
        edgeTones,
      ),
      outputPanel(path.map((p) => p.val), 'Path walked so far'),
      { type: 'kv' as const, title: 'Inserting', entries: [{ k: 'val', v: value, tone: 'new' as Tone }, { k: 'rule', v: 'smaller: left, otherwise: right' }] },
    ];
    const vars = () => ({ val: value, curr: curr ? curr.val : null });

    if (!root0) {
      r.step('newRoot', 'Tree is empty: the new node becomes the root', [treePanel(null, () => undefined), outputPanel([], 'Path walked so far')], { val: value });
      root = nn;
      r.step('newRoot', `${value} is now the root`, panels(), { val: value, root: value });
      r.step('done', 'Return the root: tree has 1 node', panels(), { val: value, root: value });
      return { frames: r.frames, result: levelOf(root) };
    }
    r.step('init', `Create node ${value} (not attached yet) and start at the root`, panels(), vars());
    curr = root0;
    path.push(curr);
    r.step('init', `curr = ${curr.val}`, panels(), vars());
    while (true) {
      cmpNode = curr;
      r.op();
      const goLeft: boolean = value < (curr.val as number);
      r.step('cmp', goLeft ? `${value} < ${curr.val} → go left` : value === curr.val ? `${value} = ${curr.val} → duplicates go right` : `${value} > ${curr.val} → go right`, panels(), vars());
      cmpNode = null;
      const child: BTNode | null = goLeft ? curr.left : curr.right;
      r.step(goLeft ? 'checkL' : 'checkR', child ? `${curr.val}.${goLeft ? 'left' : 'right'} is ${child.val}: occupied, keep walking` : `${curr.val}.${goLeft ? 'left' : 'right'} is empty: this is the spot`, panels(), vars());
      if (!child) {
        if (goLeft) curr.left = nn;
        else curr.right = nn;
        edgeTones[edgeKey(curr, nn)] = 'new';
        r.op();
        r.step(goLeft ? 'attachL' : 'attachR', `Attach ${value} as the ${goLeft ? 'left' : 'right'} child of ${curr.val}`, panels(), vars());
        break;
      }
      edgeTones[edgeKey(curr, child)] = 'path';
      curr = child;
      path.push(curr);
      r.step(goLeft ? 'goL' : 'goR', `curr = ${curr.val}`, panels(), vars());
    }
    curr = null;
    r.step('done', `Return the root: ${value} is a new leaf, ${path.length} comparison${path.length === 1 ? '' : 's'} made`, panels(), { val: value });
    return { frames: r.frames, result: levelOf(root) };
  },
  reference({ tree, value }) {
    const ins = (n: BTNode | null): BTNode => {
      if (!n) return { id: 'x', val: value, left: null, right: null };
      if (value < (n.val as number)) n.left = ins(n.left);
      else n.right = ins(n.right);
      return n;
    };
    return treeToLevel(ins(buildTree(tree)));
  },
};

const tests = [
  { args: [[4, 2, 7, 1, 3], 5], expected: [4, 2, 7, 1, 3, 5], name: 'left child of 7' },
  { args: [[8, 3, 10, 1, 6, null, 14], 7], expected: [8, 3, 10, 1, 6, null, 14, null, null, null, 7], name: 'right child of 6' },
  { args: [[], 5], expected: [5], name: 'empty tree' },
  { args: [[5], 3], expected: [5, 3], name: 'single node, smaller' },
  { args: [[5], 8], expected: [5, null, 8], name: 'single node, larger' },
  { args: [[2, 1, 3], 2], expected: [2, 1, 3, null, null, 2], name: 'duplicate goes right' },
  { args: [[1, null, 2, null, 3], 4], expected: [1, null, 2, null, 3, null, 4], name: 'right-skewed' },
];

const unit: Unit = {
  id: 'bst-insert',
  hook: 'BST insert is the smallest example of the "compare, then discard half" idea that powers search, delete and every balanced tree. Interviewers use it to check that you can change a structure, not just read it.',
  predict: {
    prompt: 'You insert 1, 2, 3, 4, 5 (in that order) into an empty BST, with no rebalancing. What does the tree look like?',
    options: ['A perfectly balanced tree with 3 at the root', 'A chain leaning right: 1 → 2 → 3 → 4 → 5', 'A chain leaning left', 'A tree with 1 at the root and four children'],
    answer: 1,
    explain: 'Each new value is larger than everything in the tree, so it walks all the way right and becomes the right child of the last node. The shape depends on insertion order, and sorted input gives the worst case: height n.',
  },
  viz,
  deeper: {
    points: [
      'Compare with the current node: smaller goes left, otherwise right. Keep going until the child slot you want is empty.',
      'The new value always becomes a **leaf**. Existing nodes never move, which is why insert is simpler than delete.',
      'Duplicates: this version sends equal values to the right. Say that choice out loud in an interview, since some BSTs forbid duplicates.',
      'Handle the empty tree first: the new node itself is the answer, and returning `root` is how callers get the updated tree.',
      'Cost is the height of the tree: O(log n) when balanced, O(n) for sorted input. That gap is why AVL and red-black trees exist.',
    ],
    complexity: { time: 'O(h)  (O(log n) balanced, O(n) worst)', space: 'O(1) iterative' },
    pitfalls: ['Walking to None and then assigning to the loop variable: `curr = TreeNode(val)` changes a local name, not the tree', 'Forgetting to return `root` (or returning the new node instead of the root)', 'Not handling the empty tree before touching `root.val`'],
  },
  practice: {
    language: 'python',
    fnName: 'insert_bst',
    statement: 'Insert `val` into a binary search tree and return its root. Values smaller than a node go left, all others (including equal) go right. The new value becomes a leaf.',
    signature: 'def insert_bst(root, val):',
    solution: `def insert_bst(root, val):
    node = TreeNode(val)
    if root is None:
        return @@node@@
    curr = root
    while True:
        if @@val < curr.val@@:
            if curr.left is None:
                curr.left = @@node@@
                break
            curr = @@curr.left@@
        else:
            if @@curr.right is None@@:
                curr.right = node
                break
            curr = @@curr.right@@
    return root`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
  },
  debug: {
    language: 'python',
    fnName: 'insert_bst',
    statement: 'After inserting, the tree comes back unchanged. The walk down looks right. Find the bug.',
    buggy: `def insert_bst(root, val):
    if root is None:
        return TreeNode(val)
    curr = root
    while curr:
        if val < curr.val:
            curr = curr.left
        else:
            curr = curr.right
    curr = TreeNode(val)
    return root`,
    fixed: `def insert_bst(root, val):
    if root is None:
        return TreeNode(val)
    curr = root
    while True:
        if val < curr.val:
            if curr.left is None:
                curr.left = TreeNode(val)
                break
            curr = curr.left
        else:
            if curr.right is None:
                curr.right = TreeNode(val)
                break
            curr = curr.right
    return root`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
    bugType: 'new node never linked',
    hint: 'When the loop ends, `curr` is None. What does `curr = TreeNode(val)` actually change?',
    explanation: 'The loop walks off the bottom, so `curr` is None and has lost its parent. Assigning a new node to the local variable never touches the tree. Stop one step earlier, at the parent, and set `parent.left` or `parent.right`.',
  },
  boss: {
    title: 'Balanced BST from a sorted list',
    statement: 'Given a list of distinct integers in ascending order, build a height-balanced BST and return its root. In every range of the list use the element at index `(lo + hi) // 2` as the root (so for an even-length range, the left one of the two middles), then build the left and right subtrees from the elements on each side.',
    language: 'python',
    fnName: 'sorted_to_bst',
    harness: `${TREE_HARNESS}
def run_list_tree(fn, nums):
    return _tree_to_level(fn(nums))
`,
    adapter: 'run_list_tree',
    starter: `def sorted_to_bst(nums):
    # your code here
    pass
`,
    solution: `def sorted_to_bst(nums):
    def build(lo, hi):
        if lo > hi:
            return None
        mid = (lo + hi) // 2
        node = TreeNode(nums[mid])
        node.left = build(lo, mid - 1)
        node.right = build(mid + 1, hi)
        return node

    return build(0, len(nums) - 1)`,
    tests: [
      { args: [[1, 2, 3, 4, 5, 6, 7]], expected: [4, 2, 6, 1, 3, 5, 7] },
      { args: [[-10, -3, 0, 5, 9]], expected: [0, -10, 5, null, -3, null, 9], name: 'odd length' },
      { args: [[1, 2, 3, 4]], expected: [2, 1, 3, null, null, null, 4], name: 'even length uses the left middle' },
      { args: [[1, 2]], expected: [1, null, 2] },
      { args: [[5]], expected: [5], name: 'single value' },
      { args: [[]], expected: [], name: 'empty list' },
    ],
    hints: ['The middle value must be the root so both sides stay about the same size. What do the two halves of the list become?', 'Write `build(lo, hi)`: return None if `lo > hi`; `mid = (lo + hi) // 2`; make a node for `nums[mid]`; recurse on `(lo, mid - 1)` for the left and `(mid + 1, hi)` for the right.'],
    combines: ['bst-insert', 'binary-search'],
  },
};

export default unit;
