import { Recorder } from '@/engine/recorder';
import type { BTNode } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { edgeKey, fmtList, outputPanel, parseTree, ref, stackPanel, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
def postorder(root):
    result, stack = [], []              #@init
    curr, last = root, None
    while curr or stack:                #@loop
        while curr:
            stack.append(curr)          #@push
            curr = curr.left            #@goLeft
        top = stack[-1]                 #@peek
        if top.right and top.right is not last:     #@checkRight
            curr = top.right            #@goRight
        else:
            result.append(top.val)      #@emit
            last = stack.pop()          #@pop
    return result                       #@done
`;

interface In {
  tree: Level;
}

const viz: VizDef<In> = {
  id: 'tree-postorder',
  title: 'Postorder traversal (left, right, node)',
  code,
  language: 'python',
  inputs: [{ key: 'tree', label: 'Tree (level order, null = empty)', kind: 'numbers', default: [1, 2, 3, 4, 5, null, 6], maxItems: 20, help: 'LeetCode style: [1, 2, 3, null, 4] means 3 is the right child of 1.' }],
  presets: [
    { label: 'Perfect tree', input: { tree: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Left chain', input: { tree: [3, 2, null, 1] } },
    { label: 'Single node', input: { tree: [9] } },
  ],
  run({ tree }) {
    const root = parseTree(tree);
    const r = new Recorder(code);
    const stack: BTNode[] = [];
    const out: number[] = [];
    const seenAt = new Map<string, number>();
    const outAt = new Map<string, number>();
    const walked: Record<string, Tone> = {};
    let curr: BTNode | null = root;
    let top: BTNode | null = null;
    let last: BTNode | null = null;

    const panels = () => [
      treePanel(
        root,
        (n) => {
          const tone: Tone = outAt.has(n.id) ? 'done' : n === top ? 'compare' : n === curr ? 'active' : seenAt.has(n.id) ? 'frontier' : 'default';
          const parts: string[] = [];
          if (seenAt.has(n.id)) parts.push(`↓${seenAt.get(n.id)}`);
          if (outAt.has(n.id)) parts.push(`↑${outAt.get(n.id)}`);
          return { tone, badge: parts.join(' ') || undefined, tags: n === top ? ['top'] : n === curr ? ['curr'] : n === last ? ['last'] : undefined };
        },
        walked,
        'Tree  (↓ = first visit, ↑ = emitted)',
      ),
      stackPanel(stack, 'Stack (visited, not yet emitted)', 'compare'),
      outputPanel(out, 'result', out.length ? { [out.length - 1]: 'new' } : {}),
    ];
    const vars = () => ({ curr: curr ? curr.val : null, top: top ? top.val : null, last: last ? last.val : null, stack: fmtList(stack.map((n) => n.val)), result: fmtList(out) });

    r.step('init', 'Empty result, empty stack, last = None', panels(), vars());
    while (curr || stack.length) {
      while (curr) {
        stack.push(curr);
        seenAt.set(curr.id, seenAt.size + 1);
        r.op();
        r.step('push', `First visit of ${curr.val}: push it, but do not emit yet`, panels(), vars());
        const l: BTNode | null = curr.left;
        if (l) walked[edgeKey(curr, l)] = 'visited';
        curr = l;
        r.step('goLeft', curr ? `Go left to ${curr.val}` : 'No left child: look at the stack top', panels(), vars());
      }
      top = stack[stack.length - 1];
      r.op();
      if (top.right && top.right !== last) {
        r.step('checkRight', `Top is ${top.val}: right child ${top.right.val} not done yet`, panels(), vars());
        walked[edgeKey(top, top.right)] = 'visited';
        curr = top.right;
        top = null;
        r.step('goRight', `Go right to ${curr.val}`, panels(), vars());
      } else {
        r.step('checkRight', top.right ? `Top is ${top.val}: right child ${top.right.val} was just emitted` : `Top is ${top.val}: no right child to wait for`, panels(), vars());
        out.push(top.val as number);
        outAt.set(top.id, out.length);
        r.step('emit', `Emit ${top.val}: both subtrees are finished (output #${out.length})`, panels(), vars());
        last = stack.pop()!;
        top = null;
        r.step('pop', `Pop ${last.val}; last = ${last.val}`, panels(), vars());
      }
    }
    last = null;
    r.step('loop', 'Stack is empty: finished', panels(), vars());
    r.step('done', `Postorder: ${out.join(', ') || '(empty)'}`, panels(), vars());
    return { frames: r.frames, result: out };
  },
  reference: ({ tree }) => ref.postorder(tree),
};

const tests = [
  { args: [[1, null, 2, 3]], expected: [3, 2, 1], name: 'right child with a left child' },
  { args: [[1, 2, 3, 4, 5]], expected: [4, 5, 2, 3, 1] },
  { args: [[1, 2, 3, 4, 5, null, 6]], expected: [4, 5, 2, 6, 3, 1] },
  { args: [[3, 2, null, 1]], expected: [1, 2, 3], name: 'left-skewed' },
  { args: [[1, null, 2, null, 3]], expected: [3, 2, 1], name: 'right-skewed' },
  { args: [[1]], expected: [1], name: 'single node' },
  { args: [[]], expected: [], name: 'empty tree' },
];

const unit: Unit = {
  id: 'tree-postorder',
  hook: 'Postorder handles children before their parent, so it is the order for deleting a tree and for any question where a node needs answers from both subtrees first: height, diameter, balanced checks.',
  predict: {
    prompt: 'A tree has root 1 with children 2 and 3, and node 2 has children 4 and 5. In a postorder traversal, which node is emitted **second**?',
    options: ['2', '5', '3', '4'],
    answer: 1,
    explain: 'Postorder = left, right, node. We dive to 4 (emitted first), then its sibling 5 (second), only then their parent 2, then 3, and finally the root 1. Order: 4, 5, 2, 3, 1.',
  },
  viz,
  deeper: {
    points: [
      'Postorder = left, right, node. A node is **visited** on the way down but **emitted** only after both subtrees are done.',
      'The iterative version needs to know whether we are coming back from the right child. That is the job of `last`, the node emitted most recently.',
      'If the top has a right child that is not `last`, go right. Otherwise both sides are finished and the top can be emitted.',
      'A shortcut for output only: do node-right-left (a flipped preorder) and reverse the result. It is simpler, but cannot interleave work.',
      'In the recursive form this is the pattern behind height, diameter and "does the subtree contain X" questions: compute from the children, then combine at the node.',
    ],
    complexity: { time: 'O(n)', space: 'O(h)  (h = tree height)' },
    pitfalls: ['Emitting a node when it is first seen (that is preorder)', 'Forgetting `last` and looping forever on a node whose right child is already done', 'Recursive version: computing a value but forgetting to `return` it to the caller'],
  },
  practice: {
    language: 'python',
    fnName: 'postorder',
    statement: 'Return the values of a binary tree in postorder (left, right, node) using an explicit stack, no recursion.',
    signature: 'def postorder(root):',
    solution: `def postorder(root):
    result, stack = [], []
    curr, last = root, None
    while @@curr or stack@@:
        while curr:
            stack.append(curr)
            curr = curr.left
        top = @@stack[-1]@@
        if @@top.right and top.right is not last@@:
            curr = @@top.right@@
        else:
            result.append(@@top.val@@)
            last = @@stack.pop()@@
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
  },
  debug: {
    language: 'python',
    fnName: 'postorder',
    statement: 'This recursive postorder returns None for every non-empty tree. Fix it.',
    buggy: `def postorder(root):
    if root is None:
        return []
    left = postorder(root.left)
    right = postorder(root.right)
    left + right + [root.val]`,
    fixed: `def postorder(root):
    if root is None:
        return []
    left = postorder(root.left)
    right = postorder(root.right)
    return left + right + [root.val]`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    bugType: 'missing return',
    hint: 'The last line builds a list. What happens to that list afterwards?',
    explanation: 'The expression `left + right + [root.val]` is computed and thrown away, so the function falls off the end and returns None. A recursive function must return the value its caller will combine.',
  },
  boss: {
    title: 'Longest path in the tree',
    statement: 'Return the diameter of a binary tree: the number of edges on the longest path between any two nodes. The path may or may not pass through the root. A single node or empty tree has diameter 0.',
    language: 'python',
    fnName: 'diameter',
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    starter: `def diameter(root):
    # your code here
    pass
`,
    solution: `def diameter(root):
    best = 0

    def height(node):
        nonlocal best
        if node is None:
            return 0
        left = height(node.left)
        right = height(node.right)
        best = max(best, left + right)
        return 1 + max(left, right)

    height(root)
    return best`,
    tests: [
      { args: [[1, 2, 3, 4, 5]], expected: 3 },
      { args: [[1, 2]], expected: 1, name: 'two nodes' },
      { args: [[1]], expected: 0, name: 'single node' },
      { args: [[]], expected: 0, name: 'empty tree' },
      { args: [[1, 2, null, 3, 4, 5, null, null, 6]], expected: 4, name: 'longest path avoids the root' },
      { args: [[1, 2, 3, 4, null, null, 5, 6, null, null, 7]], expected: 6, name: 'path through the root' },
    ],
    hints: ['At each node, the longest path that bends there uses the height of the left side plus the height of the right side. Which traversal gives you both heights first?', 'Write `height(node)` recursively (postorder). Before returning `1 + max(left, right)`, update a `best` variable with `left + right`.'],
    combines: ['tree-postorder'],
  },
};

export default unit;
