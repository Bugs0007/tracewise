import type { Tone } from '@/engine/types';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './maximum-depth-of-binary-tree.py?raw';
import harness from './maximum-depth-of-binary-tree.harness.py?raw';
import cases from './maximum-depth-of-binary-tree.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'maximum-depth-of-binary-tree',
  title: 'Maximum Depth of Binary Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [3, 9, 20, null, null, 15, 7, 4], maxItems: 15 }],
  presets: [
    { label: 'Uneven', input: { level: [3, 9, 20, null, null, 15, 7, 4] } },
    { label: 'Left chain', input: { level: [1, 2, null, 3, null, 4, null, 5] } },
    { label: 'Complete', input: { level: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    let askedLeaf = false;
    let askedJoin = false;
    const view = () => [treePanel(root, { title: 'tree (each finished node shows the depth below it)', tones, badges })];
    if (!root) {
      r.step('base', 'The tree is empty, so the depth is 0.', view(), {});
      r.step('baseRet', 'Return 0.', view(), { result: 0 });
      return { frames: r.frames, result: 0 };
    }
    const depth = (node: BTNode | null): number => {
      if (!node) return 0;
      r.op();
      tones[node.id] = 'active';
      r.step('base', `max_depth(${node.val}): ask for the depth of its left and right subtrees.`, view(), { node: node.val });
      const left = depth(node.left);
      const right = depth(node.right);
      tones[node.id] = 'compare';
      if (!node.left && !node.right && !askedLeaf) {
        askedLeaf = true;
        r.predict('leaf', `${node.val} is a leaf: both subtrees are empty (depth 0). What does max_depth(${node.val}) return?`, ['1 (just this node)', '0', '2'], 0, 'A leaf counts itself: 1 + max(0, 0).');
      } else if (!askedJoin && node.left && node.right) {
        askedJoin = true;
        r.predictChoice('join', `left = ${left}, right = ${right}. What does ${node.val} return?`, String(1 + Math.max(left, right)), [String(left + right + 1), String(Math.max(left, right)), String(1 + Math.min(left, right))], Number(node.val), 'Depth = 1 for this node + the deeper of the two subtrees.');
      }
      const res = 1 + Math.max(left, right);
      badges[node.id] = String(res);
      tones[node.id] = 'done';
      r.step('done', `max_depth(${node.val}) = 1 + max(${left}, ${right}) = ${res}.`, view(), { node: node.val, depth: res });
      return res;
    };
    const d = depth(root);
    r.step('done', `The root’s answer is the depth of the whole tree: ${d}.`, view(), { result: d });
    return { frames: r.frames, result: d };
  },
  reference({ level }) {
    const h = (n: BTNode | null): number => (n ? 1 + Math.max(h(n.left), h(n.right)) : 0);
    return h(treeOf(level));
  },
});

export default problem({
  summary: 'Find how many levels a binary tree has: the number of nodes on the longest path from the root down to a leaf. An empty tree has depth 0.',
  example: ['tree 7 with children 3 and 9, and 9 has a child 12', '3', 'The longest path is 7 → 9 → 12, three nodes.'],
  pattern: ['dfs', ['dfs', 'bfs', 'dp-1d', 'divide-conquer'], 'The depth of a tree is 1 plus the larger depth of its two subtrees. That recursive definition is a depth-first traversal.', {
    bfs: 'Counting levels with a queue works too, but the recursion is a one-liner.',
    'dp-1d': 'Each node’s answer depends on its children’s answers, but trees call that recursion, not DP.',
    'divide-conquer': 'It is divide and conquer: solve each subtree, combine with max + 1.',
  }],
  hints: [
    'What is the depth of an empty tree? What about a single node?',
    'If you already knew the depth of the left subtree and the right subtree, how would you get the depth of the whole tree?',
    'max_depth(node) = 0 for None, otherwise 1 + max(max_depth(left), max_depth(right)).',
  ],
  insight: 'depth(node) = 1 + max(depth(left), depth(right)), with depth(None) = 0.',
  brute: 'Enumerate every root-to-leaf path and take the longest: more code, same O(n).',
  optimal: 'Recursion: O(n) time, O(h) space.',
  walk: ['Base case: an empty tree has depth 0.', 'Recursively compute the depth of the left subtree and of the right subtree.', 'The tree’s depth is 1 (this node) plus the larger of the two.', 'The answer for the root is the answer for the whole tree.'],
  edge: ['Empty tree: 0.', 'A single node: 1.', 'A chain: depth equals the number of nodes.', 'Very deep trees may exceed Python’s recursion limit in practice.'],
  works: ['Induction on height: if both subtree depths are right, then adding the current node on top of the deeper one is the longest path through this node.', 'Every node is visited once.'],
  time: ['O(n)', 'Every node is visited once.'],
  space: ['O(h)', 'Recursion depth equals the tree height.'],
  solution,
  cases,
  sig: 'def max_depth(root):\n    # number of nodes on the longest path from the root to a leaf\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
