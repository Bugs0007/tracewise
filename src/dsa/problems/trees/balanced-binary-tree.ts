import type { Tone } from '@/engine/types';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './balanced-binary-tree.py?raw';
import harness from './balanced-binary-tree.harness.py?raw';
import cases from './balanced-binary-tree.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'balanced-binary-tree',
  title: 'Balanced Binary Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [1, 2, 2, 3, 3, null, null, 4, 4], maxItems: 15 }],
  presets: [
    { label: 'Unbalanced', input: { level: [1, 2, 2, 3, 3, null, null, 4, 4] } },
    { label: 'Balanced', input: { level: [3, 9, 20, null, null, 15, 7] } },
    { label: 'Three-node chain', input: { level: [1, 2, null, 3] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    let askedCheck = false;
    let askedHeight = false;
    let checkNode = '';
    const view = () => [treePanel(root, { title: 'each finished node shows its height (or ✗ if unbalanced)', tones, badges })];
    const height = (node: BTNode | null): number => {
      if (!node) return 0;
      r.op();
      tones[node.id] = 'active';
      r.step('def', `height(${node.val}): check the left subtree, then the right.`, view(), { node: node.val });
      const left = height(node.left);
      if (left === -1) {
        tones[node.id] = 'error';
        badges[node.id] = '✗';
        r.step('leftBadRet', 'The left subtree is already unbalanced: stop and pass −1 upward without looking right.', view(), { left });
        return -1;
      }
      const right = height(node.right);
      tones[node.id] = 'compare';
      if (!askedCheck) {
        askedCheck = true;
        checkNode = node.id;
        const bad = right === -1 || Math.abs(left - right) > 1;
        r.predict(bad ? 'unbalanced' : 'balanced', `${node.val}: left height ${left}, right height ${right === -1 ? '(already bad)' : right}. Is this node balanced?`, ['Yes: the heights differ by at most 1', 'No: they differ by more than 1'], bad ? 1 : 0, bad ? 'A difference above 1 means the tree is not balanced.' : 'Heights within 1 of each other: balanced here.');
      }
      if (right === -1 || Math.abs(left - right) > 1) {
        tones[node.id] = 'error';
        badges[node.id] = '✗';
        r.step('bad', right === -1 ? 'The right subtree is unbalanced: return −1.' : `|${left} − ${right}| = ${Math.abs(left - right)} > 1: this node is unbalanced. Return −1.`, view(), { left, right });
        return -1;
      }
      const res = 1 + Math.max(left, right);
      if (!askedHeight && node.id !== checkNode) {
        askedHeight = true;
        r.predictChoice('height', `left = ${left}, right = ${right}, and the node is balanced. What height does ${node.val} return?`, String(res), [String(left + right), String(Math.max(left, right)), String(res + 1)], Number(node.val), 'Height = 1 for this node + the taller subtree.');
      }
      badges[node.id] = String(res);
      tones[node.id] = 'done';
      r.step('ret', `Balanced here: |${left} − ${right}| ≤ 1. Return the height ${res}.`, view(), { height: res });
      return res;
    };
    if (!root) r.step('def', 'The tree is empty: its height is 0, so no node can be unbalanced.', view(), {});
    const h = height(root);
    r.step('done', h === -1 ? 'A −1 reached the top: the tree is not balanced. Return False.' : 'No node reported −1: the tree is balanced. Return True.', view(), { result: h !== -1 });
    return { frames: r.frames, result: h !== -1 };
  },
  reference({ level }) {
    const ht = (n: BTNode | null): number => (n ? 1 + Math.max(ht(n.left), ht(n.right)) : 0);
    const ok = (n: BTNode | null): boolean => !n || (Math.abs(ht(n.left) - ht(n.right)) <= 1 && ok(n.left) && ok(n.right));
    return ok(treeOf(level));
  },
});

export default problem({
  summary: 'A binary tree is height-balanced if, at every node, the heights of its left and right subtrees differ by at most 1. Decide whether a given tree is balanced.',
  example: ['tree 1 with left child 2, and 2 has left child 3', 'false', 'At the root the left side has height 2 and the right side 0: a difference of 2.'],
  pattern: ['dfs', ['dfs', 'bfs', 'dp-1d', 'divide-conquer'], 'Compute heights bottom-up and check the difference at every node. Returning a sentinel like −1 for "already unbalanced" lets the whole check finish in one pass.', {
    bfs: 'Level order does not give subtree heights.',
    'dp-1d': 'Not a table; it is a post-order tree recursion.',
    'divide-conquer': 'Each subtree is solved independently and combined, which is DFS on trees.',
  }],
  hints: [
    'Calling a separate height function at every node is easy but slow. Can one recursion do both jobs?',
    'What should height(node) return if some node below it is already unbalanced?',
    'Return −1 as a flag for "unbalanced". At each node, if either child returned −1 or the heights differ by more than 1, return −1; otherwise return 1 + max of the heights.',
  ],
  insight: 'One post-order DFS computes heights and aborts with −1 the moment any node is unbalanced.',
  brute: 'At each node call a height function on both children: O(n²) worst case.',
  optimal: 'Single DFS with a −1 sentinel: O(n) time, O(h) space.',
  walk: ['height(None) = 0.', 'Compute the left height. If it is −1, return −1 immediately.', 'Compute the right height. If it is −1 or the two heights differ by more than 1, return −1.', 'Otherwise return 1 + max(left, right). The tree is balanced exactly when the top call does not return −1.'],
  edge: ['Empty tree: balanced.', 'A single node.', 'Unbalanced deep inside while the root looks fine.', 'A three-node chain.'],
  works: ['A tree is balanced iff every node satisfies the height condition. The −1 propagates the first violation to the root, and heights returned for valid subtrees are exact.', 'Each node is processed once.'],
  time: ['O(n)', 'One visit per node.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def is_balanced(root):\n    # True if, at every node, the subtree heights differ by at most 1\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
