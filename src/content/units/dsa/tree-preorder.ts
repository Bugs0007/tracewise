import { Recorder } from '@/engine/recorder';
import type { BTNode } from '@/engine/layout';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { edgeKey, fmtList, outputPanel, parseTree, ref, stackPanel, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
def preorder(root):
    if not root:
        return []
    result, stack = [], [root]      #@init
    while stack:                    #@loop
        node = stack.pop()          #@pop
        result.append(node.val)     #@visit
        if node.right:              #@right
            stack.append(node.right)    #@pushR
        if node.left:               #@left
            stack.append(node.left)     #@pushL
    return result                   #@done
`;

interface In {
  tree: Level;
}

const viz: VizDef<In> = {
  id: 'tree-preorder',
  title: 'Preorder traversal (node, left, right)',
  code,
  language: 'python',
  inputs: [{ key: 'tree', label: 'Tree (level order, null = empty)', kind: 'numbers', default: [1, 2, 3, 4, 5, null, 6], maxItems: 20, help: 'LeetCode style: [1, 2, 3, null, 4] means 3 is the right child of 1.' }],
  presets: [
    { label: 'Deep left side', input: { tree: [1, 2, 3, 4, null, null, null, 5] } },
    { label: 'Right chain', input: { tree: [1, null, 2, null, 3, null, 4] } },
    { label: 'Single node', input: { tree: [7] } },
  ],
  run({ tree }) {
    const root = parseTree(tree);
    const r = new Recorder(code);
    if (!root) {
      r.step('init', 'Empty tree: return an empty list right away', [treePanel(root, () => undefined), outputPanel([], 'result')], { result: '[]' });
      r.step('done', 'Preorder: (empty)', [treePanel(root, () => undefined), outputPanel([], 'result')], { result: '[]' });
      r.step('done', 'Nothing to visit', [treePanel(root, () => undefined), outputPanel([], 'result')], { result: '[]' });
      return { frames: r.frames, result: [] };
    }
    const stack: BTNode[] = [root];
    const out: number[] = [];
    const order = new Map<string, number>();
    const walked: Record<string, Tone> = {};
    let node: BTNode | null = null;
    let justPushed: BTNode | null = null;

    const panels = () => [
      treePanel(
        root,
        (n) => {
          const tone: Tone = n === node ? 'active' : n === justPushed ? 'new' : order.has(n.id) ? 'done' : stack.includes(n) ? 'frontier' : 'default';
          return { tone, badge: order.has(n.id) ? String(order.get(n.id)) : undefined, tags: n === node ? ['node'] : undefined };
        },
        walked,
      ),
      stackPanel(stack, 'Stack (top pops next)', 'new'),
      outputPanel(out, 'result', out.length ? { [out.length - 1]: 'new' } : {}),
    ];
    const vars = () => ({ node: node ? node.val : null, stack: fmtList(stack.map((n) => n.val)), result: fmtList(out) });

    r.step('init', `Stack starts with the root ${root.val}`, panels(), vars());
    while (stack.length) {
      r.op();
      node = stack.pop()!;
      justPushed = null;
      r.step('pop', `Pop ${node.val} from the top of the stack`, panels(), vars());
      out.push(node.val as number);
      order.set(node.id, out.length);
      r.step('visit', `Visit ${node.val} at once: output position ${out.length}`, panels(), vars());
      if (node.right) {
        stack.push(node.right);
        justPushed = node.right;
        walked[edgeKey(node, node.right)] = 'frontier';
        r.step('pushR', `Push right child ${node.right.val} first: it will wait underneath`, panels(), vars());
      } else r.step('right', `${node.val} has no right child: nothing to push`, panels(), vars());
      if (node.left) {
        stack.push(node.left);
        justPushed = node.left;
        walked[edgeKey(node, node.left)] = 'frontier';
        r.step('pushL', `Push left child ${node.left.val} last: it pops next`, panels(), vars());
      } else r.step('left', `${node.val} has no left child: nothing to push`, panels(), vars());
    }
    node = null;
    justPushed = null;
    r.step('loop', 'Stack is empty: every node was visited', panels(), vars());
    r.step('done', `Preorder: ${out.join(', ')}`, panels(), vars());
    return { frames: r.frames, result: out };
  },
  reference: ({ tree }) => ref.preorder(tree),
};

const tests = [
  { args: [[1, null, 2, 3]], expected: [1, 2, 3], name: 'right child with a left child' },
  { args: [[1, 2, 3, 4, 5, null, 6]], expected: [1, 2, 4, 5, 3, 6] },
  { args: [[4, 2, 6, 1, 3, 5, 7]], expected: [4, 2, 1, 3, 6, 5, 7], name: 'perfect tree' },
  { args: [[3, 2, null, 1]], expected: [3, 2, 1], name: 'left-skewed' },
  { args: [[1]], expected: [1], name: 'single node' },
  { args: [[]], expected: [], name: 'empty tree' },
];

const unit: Unit = {
  id: 'tree-preorder',
  hook: 'Preorder visits a node before its children, which is exactly the order you need to copy or serialize a tree. The iterative version is a favourite follow-up because the order you push children decides everything.',
  predict: {
    prompt: 'In the iterative version, a node is popped and its children are pushed onto the stack. To visit the **left** child first, which child must be pushed first?',
    options: ['The left child', 'The right child', 'Either, the order does not matter', 'Neither: push the node itself again'],
    answer: 1,
    explain: 'A stack is last-in, first-out. The child pushed last is the first to pop. Push right first, then left, and the left child comes off the stack next.',
  },
  viz,
  deeper: {
    points: [
      'Preorder = node, left, right. The node is recorded the moment it is popped, before anything below it.',
      'Push **right before left**: the stack reverses the order, so left pops first.',
      'The stack never holds more than one pending right child per level of the current path: space is O(h), not O(n).',
      'The first element of a preorder is always the root, which is why preorder + inorder can rebuild a unique tree.',
      'Preorder is the natural order for copying a tree or writing it out (serialization), since parents exist before children.',
    ],
    complexity: { time: 'O(n)', space: 'O(h)  (h = tree height)' },
    pitfalls: ['Pushing left before right (you get the mirror order: node, right, left)', 'Not guarding the empty tree: `stack = [None]` crashes on `.val`', 'Pushing None children and then crashing on them when popped'],
  },
  practice: {
    language: 'python',
    fnName: 'preorder',
    statement: 'Return the values of a binary tree in preorder (node, left, right) using an explicit stack, no recursion.',
    signature: 'def preorder(root):',
    solution: `def preorder(root):
    if not root:
        return []
    result, stack = [], [root]
    while @@stack@@:
        node = @@stack.pop()@@
        result.append(@@node.val@@)
        if node.right:
            stack.append(@@node.right@@)
        if node.left:
            stack.append(@@node.left@@)
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
  },
  debug: {
    language: 'python',
    fnName: 'preorder',
    statement: 'This iterative preorder visits every node, but in the wrong order on any tree with a right child. Fix it.',
    buggy: `def preorder(root):
    if not root:
        return []
    result, stack = [], [root]
    while stack:
        node = stack.pop()
        result.append(node.val)
        if node.left:
            stack.append(node.left)
        if node.right:
            stack.append(node.right)
    return result`,
    fixed: `def preorder(root):
    if not root:
        return []
    result, stack = [], [root]
    while stack:
        node = stack.pop()
        result.append(node.val)
        if node.right:
            stack.append(node.right)
        if node.left:
            stack.append(node.left)
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    bugType: 'children pushed in the wrong order',
    hint: 'A stack gives back the most recently pushed item first. Which child do you want to come back first?',
    explanation: 'With left pushed first, the right child sits on top and is visited before the left subtree, giving node, right, left. Swap the two pushes so the left child is pushed last.',
  },
  boss: {
    title: 'Root-to-leaf path sum',
    statement: 'Given a binary tree and an integer `target`, return True if some path that starts at the root and ends at a leaf has values adding up to exactly `target`. A leaf is a node with no children. An empty tree has no such path.',
    language: 'python',
    fnName: 'has_path_sum',
    harness: TREE_HARNESS,
    adapter: 'run_tree_args',
    starter: `def has_path_sum(root, target):
    # your code here
    pass
`,
    solution: `def has_path_sum(root, target):
    if not root:
        return False
    stack = [(root, root.val)]
    while stack:
        node, total = stack.pop()
        if not node.left and not node.right and total == target:
            return True
        if node.right:
            stack.append((node.right, total + node.right.val))
        if node.left:
            stack.append((node.left, total + node.left.val))
    return False`,
    tests: [
      { args: [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1], 22], expected: true },
      { args: [[1, 2, 3], 5], expected: false, name: 'sum exists only to an inner node' },
      { args: [[1, 2], 1], expected: false, name: 'root is not a leaf' },
      { args: [[], 0], expected: false, name: 'empty tree' },
      { args: [[7], 7], expected: true, name: 'single node' },
      { args: [[-2, null, -3], -5], expected: true, name: 'negative values' },
    ],
    hints: ['Push more than the node onto the stack: each entry also needs the running sum from the root down to it.', 'Use stack entries `(node, total)`. Only compare `total` to `target` at a leaf (no left and no right child).'],
    combines: ['tree-preorder', 'stack-basics'],
  },
};

export default unit;
