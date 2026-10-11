import type { Tone } from '@/engine/types';
import { levelProblem, preorder, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './lowest-common-ancestor-of-a-binary-search-tree.py?raw';
import harness from './lowest-common-ancestor-of-a-binary-search-tree.harness.py?raw';
import cases from './lowest-common-ancestor-of-a-binary-search-tree.cases.json';

const isBst = (n: BTNode | null, lo = -Infinity, hi = Infinity): boolean => !n || (Number(n.val) > lo && Number(n.val) < hi && isBst(n.left, lo, Number(n.val)) && isBst(n.right, Number(n.val), hi));

const viz = vizOf<{ level: Level; p: number; q: number }>({
  id: 'lowest-common-ancestor-of-a-binary-search-tree',
  title: 'Lowest Common Ancestor of a BST',
  solution,
  inputs: [
    { key: 'level', label: 'binary search tree (level order)', kind: 'numbers', default: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], maxItems: 15 },
    { key: 'p', label: 'p (a value in the tree)', kind: 'number', default: 3 },
    { key: 'q', label: 'q (another value)', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Split below root', input: { level: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 3, q: 5 } },
    { label: 'Split at root', input: { level: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 2, q: 8 } },
    { label: 'One is the ancestor', input: { level: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 2, q: 4 } },
    { label: 'Right side', input: { level: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], p: 7, q: 9 } },
  ],
  validate: ({ level, p, q }) => {
    const bad = levelProblem(level);
    if (bad) return bad;
    const root = treeOf(level);
    if (!isBst(root)) return 'This needs a valid binary search tree (smaller values left, larger right, no repeats)';
    const vals = preorder(root).map((n) => n.val);
    return vals.includes(p) && vals.includes(q) ? null : 'p and q must both be values that appear in the tree';
  },
  run({ level, p, q }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const find = (v: number) => preorder(root).find((n) => n.val === v)!;
    const pn = find(p);
    const qn = find(q);
    const tones: Record<string, Tone> = {};
    let node: BTNode | null = root;
    let askedDir = false;
    const view = () => {
      const tags: Record<string, string[]> = {};
      const add = (n: BTNode | null, t: string) => n && (tags[n.id] = [...(tags[n.id] ?? []), t]);
      add(pn, 'p');
      add(qn, 'q');
      add(node, 'node');
      return [treePanel(root, { title: `looking for the lowest common ancestor of ${p} and ${q}`, tones, tags })];
    };
    r.step('init', `Start at the root, ${root!.val}. Because it is a BST, comparing p and q with the node tells us which way both of them lie.`, view(), {});
    while (node) {
      r.op();
      tones[node.id] = 'active';
      const lo = Math.min(p, q);
      const hi = Math.max(p, q);
      const v = Number(node.val);
      r.step('loop', `At ${v}: p = ${p}, q = ${q}.`, view(), { node: v });
      const dir = hi < v ? 0 : lo > v ? 1 : 2;
      if (!askedDir) {
        askedDir = true;
        r.predict('dir', `At ${v} with p = ${p} and q = ${q}: what now?`, ['Both are smaller: go left', 'Both are larger: go right', 'They lie on different sides (or one equals this node): this is the answer'], dir, dir === 0 ? 'Both values are below this node, so the ancestor is in the left subtree.' : dir === 1 ? 'Both values are above this node, so the ancestor is in the right subtree.' : 'The paths to p and q split here, so this is the lowest node that has both below it.');
      }
      if (dir === 0) {
        tones[node.id] = 'done';
        r.step('bothLeft', `Both ${p} and ${q} are smaller than ${v}: they are both in the left subtree. Move left.`, view(), {});
        node = node.left;
      } else if (dir === 1) {
        tones[node.id] = 'done';
        r.step('bothRight', `Both ${p} and ${q} are larger than ${v}: they are both in the right subtree. Move right.`, view(), {});
        node = node.right;
      } else {
        tones[node.id] = 'found';
        r.predict('found', `${lo} ≤ ${v} ≤ ${hi}. What does the function return?`, [`${v}, the current node`, `${lo}`, `${hi}`], 0, 'When the values straddle the node (or one equals it), no child can contain both, so this node is the lowest common ancestor.');
        r.step('found', `${lo} ≤ ${v} ≤ ${hi}: p and q split here (or one of them is this node). The answer is ${v}.`, view(), { result: v });
        return { frames: r.frames, result: v };
      }
    }
    r.step('none', 'Ran off the tree without a split.', view(), { result: null });
    return { frames: r.frames, result: null };
  },
  reference({ level, p, q }) {
    let n = treeOf(level);
    while (n) {
      const v = Number(n.val);
      if (p < v && q < v) n = n.left;
      else if (p > v && q > v) n = n.right;
      else return v;
    }
    return null;
  },
});

export default problem({
  summary: 'In a binary search tree (smaller values on the left, larger on the right), find the lowest node that has both of two given values somewhere below it (a node counts as below itself).',
  example: ['BST: 6 with children 2, 8; 2 has children 0, 4; p = 0, q = 4', '2', '0 and 4 are both under 2, and no lower node contains both.'],
  pattern: ['bst', ['bst', 'dfs', 'bfs', 'binary-search'], 'In a BST, comparing the target values with the current node tells you which side they are on. The first node where they stop agreeing is the answer, found by walking a single path.', {
    dfs: 'A general-tree DFS works but ignores the ordering that makes this easy.',
    bfs: 'Level order is unnecessary for a single path.',
    'binary-search': 'It is the same halving idea, and the named pattern in this track is the BST property.',
  }],
  hints: [
    'Where must p and q be if both are smaller than the current node?',
    'When can neither child contain both values?',
    'Walk down from the root: both smaller → go left, both larger → go right, otherwise stop: that node is the answer.',
  ],
  insight: 'The answer is where the paths to p and q split; the BST order lets you find that split without searching.',
  brute: 'Find the root-to-node path for p and for q and take the last common node: O(n) and extra space.',
  optimal: 'Walk down one path using the BST order: O(h) time, O(1) space.',
  walk: ['Start at the root.', 'If both p and q are smaller than the node, move to its left child.', 'If both are larger, move to its right child.', 'Otherwise the values split here (or one equals this node): return this node.'],
  edge: ['p or q is the answer itself.', 'p equals q.', 'The answer is the root.', 'A skewed tree.'],
  works: ['While both values stay on the same side, any common ancestor is in that subtree, so the lowest one is too.', 'The first node where they are on different sides is a common ancestor with no lower one possible.'],
  time: ['O(h)', 'One step per level of the tree.'],
  space: ['O(1)', 'Iterative walk.'],
  solution,
  cases,
  sig: 'def lowest_common_ancestor(root, p, q):\n    # root is a BST node; p and q are values present in it; return the value of the lowest common ancestor\n    pass\n',
  harness,
  viz,
  fromArgs: ([level, p, q]) => ({ level, p, q }),
});
