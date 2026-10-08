import { Recorder } from '@/engine/recorder';
import type { BTNode } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { edgeKey, fmtList, outputPanel, parseTree, ref, stackPanel, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
def inorder(root):
    result, stack = [], []          #@init
    curr = root
    while curr or stack:            #@loop
        while curr:
            stack.append(curr)      #@push
            curr = curr.left        #@goLeft
        curr = stack.pop()          #@pop
        result.append(curr.val)     #@visit
        curr = curr.right           #@goRight
    return result                   #@done
`;

interface In {
  tree: Level;
}

const viz: VizDef<In> = {
  id: 'tree-inorder',
  title: 'Inorder traversal (left, node, right)',
  code,
  language: 'python',
  inputs: [{ key: 'tree', label: 'Tree (level order, null = empty)', kind: 'numbers', default: [1, 2, 3, 4, 5, null, 6, 7], maxItems: 20, help: 'LeetCode style: [1, 2, 3, null, 4] means 3 is the right child of 1.' }],
  presets: [
    { label: 'Right-leaning', input: { tree: [1, null, 2, 3] } },
    { label: 'BST (sorted output)', input: { tree: [4, 2, 6, 1, 3, 5, 7] } },
    { label: 'Left chain', input: { tree: [4, 3, null, 2, null, 1] } },
    { label: 'Single node', input: { tree: [5] } },
  ],
  run({ tree }) {
    const root = parseTree(tree);
    const r = new Recorder(code);
    const stack: BTNode[] = [];
    const out: number[] = [];
    const order = new Map<string, number>();
    const walked: Record<string, Tone> = {};
    let lastEdge = '';
    let curr: BTNode | null = root;

    const panels = () => {
      const edgeTones: Record<string, Tone> = { ...walked };
      if (lastEdge) edgeTones[lastEdge] = 'path';
      return [
        treePanel(
          root,
          (n) => {
            const tone: Tone = n === curr ? 'active' : order.has(n.id) ? 'done' : stack.includes(n) ? 'frontier' : 'default';
            return { tone, badge: order.has(n.id) ? String(order.get(n.id)) : undefined, tags: n === curr ? ['curr'] : undefined };
          },
          edgeTones,
        ),
        stackPanel(stack, 'Stack (nodes waiting for their turn)'),
        outputPanel(out, 'result', out.length ? { [out.length - 1]: 'new' } : {}),
      ];
    };
    const vars = () => ({ curr: curr ? curr.val : null, stack: fmtList(stack.map((n) => n.val)), result: fmtList(out) });
    const go = (to: BTNode | null) => {
      if (curr && to) {
        walked[edgeKey(curr, to)] = 'visited';
        lastEdge = edgeKey(curr, to);
      } else lastEdge = '';
      curr = to;
    };

    r.step('init', 'Start with an empty result and an empty stack', panels(), vars());
    while (curr || stack.length) {
      while (curr) {
        stack.push(curr);
        r.op();
        r.step('push', `Push ${curr.val}: its left side must be finished first`, panels(), vars());
        go(curr.left);
        r.step('goLeft', curr ? `Go left to ${curr.val}` : 'No left child: curr = None, time to pop', panels(), vars());
      }
      curr = stack.pop()!;
      lastEdge = '';
      r.step('pop', `Pop ${curr.val}: everything left of it is already in the output`, panels(), vars());
      out.push(curr.val as number);
      order.set(curr.id, out.length);
      r.op();
      r.step('visit', `Visit ${curr.val}: output position ${out.length}`, panels(), vars());
      const right: BTNode | null = curr.right;
      go(right);
      r.step('goRight', curr ? `Go right to ${curr.val}` : 'No right child: pop the next node', panels(), vars());
    }
    r.step('loop', 'curr is None and the stack is empty: finished', panels(), vars());
    r.step('done', `Inorder: ${out.join(', ') || '(empty)'}`, panels(), vars());
    return { frames: r.frames, result: out };
  },
  reference: ({ tree }) => ref.inorder(tree),
};

const tests = [
  { args: [[1, null, 2, 3]], expected: [1, 3, 2], name: 'right child with a left child' },
  { args: [[4, 2, 6, 1, 3, 5, 7]], expected: [1, 2, 3, 4, 5, 6, 7], name: 'BST gives sorted order' },
  { args: [[1, 2, 3, 4, 5, null, 6, 7]], expected: [7, 4, 2, 5, 1, 3, 6] },
  { args: [[3, 2, null, 1]], expected: [1, 2, 3], name: 'left-skewed' },
  { args: [[1]], expected: [1], name: 'single node' },
  { args: [[]], expected: [], name: 'empty tree' },
];

const unit: Unit = {
  id: 'tree-inorder',
  hook: 'On a binary search tree, inorder visits the values in sorted order, so it hides inside validate-BST, kth-smallest and BST-iterator questions. Interviewers ask for the stack version to see if you can unroll recursion by hand.',
  predict: {
    prompt: 'Node 1 has no left child and a right child 2. Node 2 has a left child 3 and no right child. What does an inorder traversal output?',
    options: ['1, 2, 3', '1, 3, 2', '3, 2, 1', '2, 3, 1'],
    answer: 1,
    explain: 'Inorder = left, node, right. At 1 the left side is empty, so 1 comes out first. Then we go right into 2, but 2 has a left child: 3 is emitted before 2. Result: 1, 3, 2.',
  },
  viz,
  deeper: {
    points: [
      'Inorder means: finish the whole left subtree, emit the node, then do the right subtree. On a BST that is ascending order.',
      'The stack holds the ancestors whose left side we are still exploring. Pushing = "come back to me later".',
      'The node is written to the output when it is **popped**, not when it is pushed. Output on push gives preorder.',
      'The outer condition is `curr or stack`: curr may be None while the stack still has work, and the other way round at the start.',
      'Morris traversal does the same in O(1) extra space by temporarily threading links; rarely required, nice to mention.',
    ],
    complexity: { time: 'O(n)', space: 'O(h)  (h = tree height: O(log n) balanced, O(n) skewed)' },
    pitfalls: ['Looping on `while stack` only: the first push never happens', 'Appending to the result at push time (that is preorder)', 'Forgetting `curr = curr.right` after the visit, which loses the whole right side'],
  },
  practice: {
    language: 'python',
    fnName: 'inorder',
    statement: 'Return the values of a binary tree in inorder (left, node, right) using an explicit stack, no recursion. Nodes have `.val`, `.left`, `.right`.',
    signature: 'def inorder(root):',
    solution: `def inorder(root):
    result, stack = [], []
    curr = root
    while @@curr or stack@@:
        while @@curr@@:
            stack.append(curr)
            curr = @@curr.left@@
        curr = @@stack.pop()@@
        result.append(@@curr.val@@)
        curr = @@curr.right@@
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
  },
  debug: {
    language: 'python',
    fnName: 'inorder',
    statement: 'This recursive inorder returns the wrong order on almost every tree. Fix it.',
    buggy: `def inorder(root):
    result = []

    def walk(node):
        if node is None:
            return
        result.append(node.val)
        walk(node.left)
        walk(node.right)

    walk(root)
    return result`,
    fixed: `def inorder(root):
    result = []

    def walk(node):
        if node is None:
            return
        walk(node.left)
        result.append(node.val)
        walk(node.right)

    walk(root)
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    bugType: 'wrong recursion order',
    hint: 'Where in `walk` is the node written to the result, compared with the two recursive calls?',
    explanation: 'The three lines of the recursion define the traversal. Writing the node first and then recursing left and right is preorder. Inorder needs: recurse left, record the node, recurse right.',
  },
  boss: {
    title: 'Is it a real BST?',
    statement: 'Given the root of a binary tree, return True if it is a valid binary search tree: for every node, all values in its left subtree are strictly smaller and all values in its right subtree are strictly larger. Duplicates make a tree invalid.',
    language: 'python',
    fnName: 'is_valid_bst',
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    starter: `def is_valid_bst(root):
    # your code here
    pass
`,
    solution: `def is_valid_bst(root):
    stack, curr = [], root
    prev = None
    while curr or stack:
        while curr:
            stack.append(curr)
            curr = curr.left
        curr = stack.pop()
        if prev is not None and curr.val <= prev:
            return False
        prev = curr.val
        curr = curr.right
    return True`,
    tests: [
      { args: [[2, 1, 3]], expected: true },
      { args: [[5, 1, 4, null, null, 3, 6]], expected: false, name: 'right child smaller than root' },
      { args: [[5, 4, 6, null, null, 3, 7]], expected: false, name: '3 hides in the right subtree of 5' },
      { args: [[2, 2, 2]], expected: false, name: 'duplicates' },
      { args: [[]], expected: true, name: 'empty tree' },
      { args: [[8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13]], expected: true },
    ],
    hints: ['A valid BST has a strictly increasing inorder sequence. What is the only value you need to remember from the previous step?', 'Do an iterative inorder and keep `prev`, the last visited value. If a node you pop has `val <= prev`, return False immediately.'],
    combines: ['tree-inorder', 'stack-basics'],
  },
};

export default unit;
