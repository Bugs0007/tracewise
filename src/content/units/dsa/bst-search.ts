import { Recorder } from '@/engine/recorder';
import { buildTree, treeToLevel, type BTNode } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { checkBst, edgeKey, levelOf, nodesOf, outputPanel, parseTree, subtreeIds, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
def search(root, target):
    curr = root                          #@init
    while curr:                          #@loop
        if target == curr.val:           #@found
            return curr
        if target < curr.val:            #@cmp
            curr = curr.left             #@goL
        else:
            curr = curr.right            #@goR
    return None                          #@miss
`;

interface In {
  tree: Level;
  target: number;
}

const viz: VizDef<In> = {
  id: 'bst-search',
  title: 'BST search',
  code,
  language: 'python',
  inputs: [
    { key: 'tree', label: 'BST (level order, null = empty)', kind: 'numbers', default: [8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13], maxItems: 20, help: 'Must be a valid BST with no duplicates.' },
    { key: 'target', label: 'Target', kind: 'number', default: 7 },
  ],
  presets: [
    { label: 'Not found', input: { target: 5 } },
    { label: 'Target is the root', input: { target: 8 } },
    { label: 'Deep leaf', input: { target: 13 } },
    { label: 'Skewed tree', input: { tree: [1, null, 2, null, 3, null, 4], target: 4 } },
  ],
  run({ tree, target }) {
    const root = parseTree(tree);
    checkBst(root);
    const total = nodesOf(root).length;
    const r = new Recorder(code);
    const path: BTNode[] = [];
    const edgeTones: Record<string, Tone> = {};
    let curr: BTNode | null = root;
    let lo = '-∞';
    let hi = '+∞';
    let alive = subtreeIds(root);
    let foundNode: BTNode | null = null;
    let hot: Tone = 'active';

    const panels = () => {
      const keep = foundNode ? subtreeIds(foundNode) : null;
      return [
        treePanel(
          root,
          (n) => {
            if (keep) return { tone: keep.has(n.id) ? 'found' : path.includes(n) ? 'visited' : 'muted', tags: n === foundNode ? ['found'] : undefined };
            if (n === curr) return { tone: hot, tags: ['curr'] };
            if (path.includes(n)) return { tone: 'visited' };
            return { tone: alive.has(n.id) ? 'default' : 'muted' };
          },
          edgeTones,
        ),
        {
          type: 'kv' as const,
          title: 'Search state',
          entries: [
            { k: 'target', v: target, tone: 'new' as Tone },
            { k: 'target must be in', v: `(${lo}, ${hi})` },
            { k: 'nodes still possible', v: `${alive.size} of ${total}`, tone: (alive.size === 0 ? 'error' : 'default') as Tone },
          ],
        },
        outputPanel(path.map((p) => p.val), 'Nodes compared so far'),
      ];
    };
    const vars = () => ({ target, curr: curr ? curr.val : null });

    r.step('init', `Start at the root${root ? ` (${root.val})` : ''}, looking for ${target}`, panels(), vars());
    while (curr) {
      r.op();
      path.push(curr);
      if (target === curr.val) {
        foundNode = curr;
        r.step('found', `${target} = ${curr.val}: found it`, panels(), vars());
        r.step('found', `Return the node: the subtree ${fmtSub(curr)} comes back`, panels(), vars());
        return { frames: r.frames, result: levelOf(curr) };
      }
      r.step('found', `${target} ≠ ${curr.val}: not this node`, panels(), vars());
      const left = target < (curr.val as number);
      const discarded = left ? curr.right : curr.left;
      const next: BTNode | null = left ? curr.left : curr.right;
      hot = 'compare';
      alive = subtreeIds(next);
      if (left) hi = String(curr.val);
      else lo = String(curr.val);
      const dropped = nodesOf(discarded).length + 1;
      r.step('cmp', `${target} ${left ? '<' : '>'} ${curr.val} → go ${left ? 'left' : 'right'}, drop ${dropped} node${dropped === 1 ? '' : 's'}`, panels(), vars());
      hot = 'active';
      if (next) edgeTones[edgeKey(curr, next)] = 'path';
      curr = next;
      r.step(left ? 'goL' : 'goR', curr ? `curr = ${curr.val}` : `That side is empty: curr = None`, panels(), vars());
    }
    r.step('loop', 'curr is None: no node left to check', panels(), vars());
    r.step('miss', `${target} is not in the tree: return None`, panels(), vars());
    return { frames: r.frames, result: [] };
  },
  reference({ tree, target }) {
    const walk = (n: BTNode | null): BTNode | null => {
      if (!n) return null;
      if (n.val === target) return n;
      return walk(target < (n.val as number) ? n.left : n.right);
    };
    return treeToLevel(walk(buildTree(tree)));
  },
};

function fmtSub(n: BTNode): string {
  return `[${levelOf(n).map((v) => (v === null ? 'null' : v)).join(', ')}]`;
}

const tests = [
  { args: [[4, 2, 7, 1, 3], 2], expected: [2, 1, 3], name: 'returns the whole subtree' },
  { args: [[4, 2, 7, 1, 3], 5], expected: [], name: 'not present' },
  { args: [[4, 2, 7, 1, 3], 4], expected: [4, 2, 7, 1, 3], name: 'target at the root' },
  { args: [[8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13], 7], expected: [7] },
  { args: [[1, null, 2, null, 3, null, 4], 4], expected: [4], name: 'right-skewed' },
  { args: [[5], 5], expected: [5], name: 'single node' },
  { args: [[], 5], expected: [], name: 'empty tree' },
];

const unit: Unit = {
  id: 'bst-search',
  hook: 'BST search is binary search on a tree: each comparison throws away an entire subtree. The ordering rule is the point of a BST, and almost every BST question starts by exploiting it.',
  predict: {
    prompt: 'You search for 5 in a BST whose root is 8, and 5 < 8. How much of the tree can you rule out with that one comparison?',
    options: ['Only the root', 'Only the root\'s right child', 'The root and its entire right subtree', 'Nothing: the left side might also miss it'],
    answer: 2,
    explain: 'Every value in the right subtree is larger than 8, so none of them can equal 5. One comparison removes the root and every node to its right. This is what makes a balanced BST search O(log n).',
  },
  viz,
  deeper: {
    points: [
      'At each node there are only three outcomes: equal (done), smaller (go left), larger (go right).',
      'Going left means every value in the right subtree is ruled out. The window of allowed values shrinks like the `lo`/`hi` of binary search.',
      'The loop ends either at the target or at `None`, which means the target would have to hang below a missing child, so it is absent.',
      'It works because of the BST invariant. On an ordinary binary tree you would have to search both children.',
      'Iterative search uses no extra memory; the recursive version is shorter but uses a call stack as deep as the tree.',
    ],
    complexity: { time: 'O(h)  (O(log n) balanced, O(n) skewed)', space: 'O(1) iterative' },
    pitfalls: ['Running two independent `if` statements instead of `if / else`: after moving, the second check reads the new `curr`', 'Recursive version: calling `search(root.left, t)` without `return`', 'Going the wrong direction because the comparison is written backwards'],
  },
  practice: {
    language: 'python',
    fnName: 'search_bst',
    statement: 'Find `target` in a binary search tree and return the node that holds it (the harness shows it as the subtree rooted there). Return None if it is not present.',
    signature: 'def search_bst(root, target):',
    solution: `def search_bst(root, target):
    curr = root
    while @@curr@@:
        if @@target == curr.val@@:
            return curr
        if @@target < curr.val@@:
            curr = @@curr.left@@
        else:
            curr = @@curr.right@@
    return @@None@@`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
  },
  debug: {
    language: 'python',
    fnName: 'search_bst',
    statement: 'This search crashes with an AttributeError on some inputs and returns wrong nodes on others. Fix it.',
    buggy: `def search_bst(root, target):
    curr = root
    while curr:
        if target == curr.val:
            return curr
        if target < curr.val:
            curr = curr.left
        if target > curr.val:
            curr = curr.right
    return None`,
    fixed: `def search_bst(root, target):
    curr = root
    while curr:
        if target == curr.val:
            return curr
        if target < curr.val:
            curr = curr.left
        else:
            curr = curr.right
    return None`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
    bugType: 'if instead of else',
    hint: 'After `curr = curr.left`, which node does the second `if` read `curr.val` from?',
    explanation: 'Two separate `if`s run one after the other. After stepping left, the second check reads the new `curr`, which can be None (crash) or a node that makes us step again. The two moves are mutually exclusive: use `else`.',
  },
  boss: {
    title: 'Lowest common ancestor in a BST',
    statement: 'Given a BST with distinct values and two values `p` and `q` that both exist in it, return the value of their lowest common ancestor: the deepest node that has both `p` and `q` in its subtree (a node counts as a descendant of itself).',
    language: 'python',
    fnName: 'lowest_common_ancestor',
    harness: TREE_HARNESS,
    adapter: 'run_tree_args',
    starter: `def lowest_common_ancestor(root, p, q):
    # your code here
    pass
`,
    solution: `def lowest_common_ancestor(root, p, q):
    curr = root
    while curr:
        if p < curr.val and q < curr.val:
            curr = curr.left
        elif p > curr.val and q > curr.val:
            curr = curr.right
        else:
            return curr.val
    return None`,
    tests: [
      { args: [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 8], expected: 6 },
      { args: [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 4], expected: 2, name: 'one value is the ancestor' },
      { args: [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 3, 5], expected: 4 },
      { args: [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 7, 9], expected: 8 },
      { args: [[2, 1], 2, 1], expected: 2, name: 'tiny tree' },
      { args: [[5], 5, 5], expected: 5, name: 'same node' },
    ],
    hints: ['Use the ordering: if both values are smaller than the current node, the answer is in the left subtree. What happens when they are on different sides?', 'Walk down from the root. Both smaller: go left. Both larger: go right. Otherwise (they split, or one equals the node) the current node is the lowest common ancestor.'],
    combines: ['bst-search'],
  },
};

export default unit;
