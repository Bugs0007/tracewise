import type { Tone } from '@/engine/types';
import { levelOf, levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './invert-binary-tree.py?raw';
import harness from './invert-binary-tree.harness.py?raw';
import cases from './invert-binary-tree.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'invert-binary-tree',
  title: 'Invert Binary Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [4, 2, 7, 1, 3, 6, 9], maxItems: 15 }],
  presets: [
    { label: 'Full tree', input: { level: [4, 2, 7, 1, 3, 6, 9] } },
    { label: 'Skewed', input: { level: [5, 3, null, 2, null, 1] } },
    { label: 'Single node', input: { level: [8] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    let askedSwap = false;
    let askedLeaf = false;
    const view = (title = 'tree') => [treePanel(root, { title, tones })];
    if (!root) {
      r.step('base', 'The tree is empty: nothing to invert.', view(), {});
      r.step('baseRet', 'Return None.', view(), { result: '[]' });
      return { frames: r.frames, result: [] };
    }
    const invert = (node: BTNode): BTNode => {
      r.op();
      tones[node.id] = 'active';
      r.step('base', `invert(${node.val}): not None, so swap its two subtrees, inverting each first.`, view(), { node: node.val });
      if (!node.left && !node.right && !askedLeaf) {
        askedLeaf = true;
        r.predict('leaf', `${node.val} is a leaf: both children are None. What does inverting it do?`, ['Nothing visible: it swaps two None children', 'It removes the node', 'It becomes the root'], 0, 'Swapping two empty children changes nothing; the base case None just returns None.');
      }
      const l = node.left;
      const rt = node.right;
      const newLeft = rt ? invert(rt) : null;
      const newRight = l ? invert(l) : null;
      tones[node.id] = 'compare';
      r.step('swap', `Both subtrees of ${node.val} are inverted. Now hang the inverted right one on the left and the inverted left one on the right.`, view(), { node: node.val });
      if (!askedSwap && (l || rt)) {
        askedSwap = true;
        r.predict('swap', `${node.val} has left = ${l ? l.val : 'None'} and right = ${rt ? rt.val : 'None'}. After the swap which is on the left?`, [`${rt ? rt.val : 'None'} (the old right child)`, `${l ? l.val : 'None'} (the old left child)`], 0, 'Left and right trade places, so the old right child is now on the left.');
      }
      node.left = newLeft;
      node.right = newRight;
      tones[node.id] = 'done';
      r.step('swap', `Swapped: ${node.val} now has left = ${node.left ? node.left.val : 'None'} and right = ${node.right ? node.right.val : 'None'}.`, view(), { node: node.val });
      return node;
    };
    invert(root);
    r.predict('end', 'The outermost call finishes. What does it return?', ['The same root node, with its children swapped', 'A brand new tree', 'None'], 0, 'The tree is modified in place, so the root node is returned.');
    r.step('done', `Done: the tree is mirrored. Level order: ${JSON.stringify(levelOf(root))}.`, view('inverted tree'), { result: JSON.stringify(levelOf(root)) });
    return { frames: r.frames, result: levelOf(root) };
  },
  reference({ level }) {
    const mirror = (n: BTNode | null): BTNode | null => (n ? { ...n, left: mirror(n.right), right: mirror(n.left) } : null);
    return levelOf(mirror(treeOf(level)));
  },
});

export default problem({
  summary: 'Flip a binary tree left to right: at every node, the left and right subtrees trade places. Return the root of the mirrored tree.',
  example: ['tree 5 with children 3 and 8, and 3 has children 1 and 4', '5 with children 8 and 3, and 3 has children 4 and 1', 'Every node’s children are swapped, all the way down.'],
  pattern: ['dfs', ['dfs', 'bfs', 'divide-conquer', 'stack'], 'The same small operation, swap the two children, applies at every node. Recursing on both subtrees and then swapping is the natural depth-first solution.', {
    bfs: 'A level-by-level traversal also works (swap at each node as you dequeue it), but recursion mirrors the tree shape more directly.',
    'divide-conquer': 'It is divide and conquer, where "conquer" is the swap. The named pattern for trees is DFS.',
    stack: 'An explicit stack can replace recursion, but recursion is shorter.',
  }],
  hints: [
    'What does the mirrored version of a tiny tree (one node with two leaf children) look like?',
    'The mirror of a tree is: its root, with the mirror of the right subtree on the left and the mirror of the left subtree on the right.',
    'Recursive function: if the node is None return None; otherwise set node.left, node.right to the inverted right and inverted left, and return the node.',
  ],
  insight: 'The mirror of a tree is the root with its two subtrees mirrored and swapped. That is one line of recursion.',
  brute: 'Rebuild a new tree from a traversal with mirrored order: more code, same O(n).',
  optimal: 'Recursive swap: O(n) time, O(h) space for the recursion (h = height).',
  walk: ['If the node is None, return None.', 'Recursively invert the right subtree and the left subtree.', 'Assign them crosswise: node.left gets the inverted right, node.right gets the inverted left.', 'Return the node.'],
  edge: ['Empty tree.', 'A single node.', 'A tree with only one child at every node (a chain).', 'Skewed trees make recursion as deep as n.'],
  works: ['By induction on the height: if the recursive calls mirror their subtrees correctly, swapping them mirrors the whole tree.', 'Every node is visited exactly once.'],
  time: ['O(n)', 'Each node is processed once.'],
  space: ['O(h)', 'The recursion stack is as deep as the tree is tall.'],
  solution,
  cases,
  sig: 'def invert_tree(root):\n    # TreeNode(val, left, right) is provided; return the root of the mirrored tree\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
