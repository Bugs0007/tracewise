import { btNode } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { levelOf, treePanel, type BTNode } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './construct-binary-tree-from-preorder-and-inorder-traversal.py?raw';
import harness from './construct-binary-tree-from-preorder-and-inorder-traversal.harness.py?raw';
import cases from './construct-binary-tree-from-preorder-and-inorder-traversal.cases.json';

const viz = vizOf<{ pre: number[]; ino: number[] }>({
  id: 'construct-binary-tree-from-preorder-and-inorder-traversal',
  title: 'Construct Binary Tree from Preorder and Inorder Traversal',
  solution,
  inputs: [
    { key: 'pre', label: 'preorder (root, left, right)', kind: 'numbers', default: [4, 2, 1, 3, 6, 5, 7], maxItems: 9 },
    { key: 'ino', label: 'inorder (left, root, right)', kind: 'numbers', default: [1, 2, 3, 4, 5, 6, 7], maxItems: 9 },
  ],
  presets: [
    { label: 'Balanced', input: { pre: [4, 2, 1, 3, 6, 5, 7], ino: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Left chain', input: { pre: [3, 2, 1], ino: [1, 2, 3] } },
    { label: 'Right chain', input: { pre: [1, 2, 3], ino: [1, 2, 3] } },
    { label: 'Mixed', input: { pre: [8, 3, 1, 6, 9], ino: [1, 3, 6, 8, 9] } },
  ],
  validate: ({ pre, ino }) => {
    if (pre.length !== ino.length) return 'Both traversals must have the same number of values';
    if (new Set(ino).size !== ino.length) return 'Values must be unique';
    const a = [...pre].sort((x, y) => x - y).join();
    const b = [...ino].sort((x, y) => x - y).join();
    return a === b ? null : 'Both traversals must contain the same values';
  },
  run({ pre, ino }) {
    const r = new TraceRecorder(solution);
    const tones: Record<string, Tone> = {};
    let root: BTNode | null = null;
    let p = 0;
    let lo = 0;
    let hi = ino.length - 1;
    let mid: number | undefined;
    let askedRoot = false;
    let askedSize = false;
    const index: Record<string, number> = Object.fromEntries(ino.map((v, i) => [String(v), i]));
    const view = () => [
      arrayView(pre, { title: 'preorder: the next unused value is the next root', pointers: p < pre.length ? { next: p } : {}, tones: Object.fromEntries(pre.slice(0, p).map((_, i) => [i, 'done' as Tone])) }),
      arrayView(ino, { title: 'inorder: the current range is bracketed', pointers: mid !== undefined ? { mid } : {}, window: lo <= hi ? { from: lo, to: hi, label: 'range', tone: 'active' } : undefined }),
      treePanel(root, { title: 'tree built so far', tones }),
    ];
    r.step('index', 'Map every inorder value to its position so we can find a root in O(1).', [hashMapView(index, { title: 'inorder positions' }), ...view().slice(0, 2)], {});
    r.step('iter', 'preorder will be consumed one value at a time, left to right.', view(), {});
    const build = (a: number, b: number, parent: BTNode | null, side: 'left' | 'right' | null): BTNode | null => {
      r.op();
      lo = a;
      hi = b;
      mid = undefined;
      if (a > b) {
        r.step('base', `Range [${a}..${b}] is empty: no nodes here. Return None.`, view(), {});
        return null;
      }
      const val = pre[p];
      r.step('def', `build over inorder positions ${a}..${b}: the next preorder value ${val} is the root of this range.`, view(), { lo: a, hi: b });
      p++;
      const node = btNode(val);
      if (parent && side) parent[side] = node;
      else root = node;
      tones[node.id] = 'active';
      const m = index[String(val)];
      mid = m;
      if (!askedRoot) {
        askedRoot = true;
        r.predict('root', `The first preorder value (${val}) is the root. In inorder, what sits to its left?`, ['Exactly the nodes of its left subtree', 'Exactly the nodes of its right subtree', 'Its ancestors'], 0, 'Inorder is left, root, right, so everything before the root belongs to the left subtree.');
      } else if (!askedSize && m > a) {
        askedSize = true;
        r.predictChoice('size', `Root ${val} is at inorder position ${m} and the range starts at ${a}. How many nodes are in its left subtree?`, String(m - a), [String(m - a + 1), String(b - m), String(m)], m, 'Positions a..m−1 are the left subtree: that is m − a nodes.');
      }
      r.step('mid', `${val} sits at inorder position ${m}. Positions ${a}..${m - 1} form its left subtree, ${m + 1}..${b} its right subtree.`, view(), { mid: m });
      r.step('left', `Build the left subtree from positions ${a}..${m - 1} (it uses the next preorder values).`, view(), {});
      build(a, m - 1, node, 'left');
      lo = a;
      hi = b;
      mid = m;
      r.step('right', `The left side is complete. Build the right subtree from positions ${m + 1}..${b}.`, view(), {});
      build(m + 1, b, node, 'right');
      tones[node.id] = 'done';
      lo = a;
      hi = b;
      r.step('ret', `Node ${val} has both subtrees. Return it.`, view(), { node: val });
      return node;
    };
    build(0, ino.length - 1, null, null);
    const res = levelOf(root);
    lo = 0;
    hi = -1;
    mid = undefined;
    r.step('start', `The tree is complete. Level order: ${JSON.stringify(res)}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ pre, ino }) {
    const index = new Map(ino.map((v, i) => [v, i]));
    let p = 0;
    const go = (a: number, b: number): BTNode | null => {
      if (a > b) return null;
      const v = pre[p++];
      const n = btNode(v);
      const m = index.get(v)!;
      n.left = go(a, m - 1);
      n.right = go(m + 1, b);
      return n;
    };
    return levelOf(go(0, ino.length - 1));
  },
});

export default problem({
  summary: 'You are given the preorder (root, left, right) and the inorder (left, root, right) listings of a binary tree whose values are all different. Rebuild the tree and return its root.',
  example: ['preorder [2, 1, 3], inorder [1, 2, 3]', 'a tree with root 2, left child 1, right child 3', 'The first preorder value is always the root; in inorder, 1 is to its left and 3 to its right.'],
  pattern: ['dfs', ['dfs', 'divide-conquer', 'hash-lookup', 'stack'], 'Each call builds a subtree: take the next preorder value as the root, split the inorder range around it, and recurse on the two halves. A map from value to inorder position makes the split O(1). The structure is DFS.', {
    'divide-conquer': 'It is divide and conquer, and the pattern label used here for the tree recursion is DFS.',
    'hash-lookup': 'The map is a helper; the main idea is the recursive split.',
    stack: 'There is an iterative stack solution, but the recursive one is clearer.',
  }],
  hints: [
    'Which single value in the preorder list do you know for certain is the root?',
    'Once you know the root, where does it sit in the inorder list, and what do the two sides mean?',
    'Recursive build(lo, hi) over inorder positions: take the next preorder value as the root, find its inorder position mid, then build the left (lo..mid−1) and right (mid+1..hi). Use a dictionary for positions.',
  ],
  insight: 'Preorder tells you the next root; inorder tells you how many nodes go left and right of it.',
  brute: 'Search for the root in inorder each time with a linear scan: O(n²).',
  optimal: 'A hash map of inorder positions and one pass over preorder: O(n) time and space.',
  walk: ['Build a map from value to inorder index.', 'Create an iterator over preorder.', 'build(lo, hi): if lo > hi return None; take the next preorder value as the root; find mid in the map.', 'root.left = build(lo, mid − 1) first (it consumes the next preorder values), then root.right = build(mid + 1, hi).'],
  edge: ['Single node.', 'All nodes on the left or all on the right.', 'Empty input.', 'The left subtree must be built before the right one because preorder lists it first.'],
  works: ['Preorder lists a root before everything in its subtrees, so the next unused value is the root of the current range.', 'Inorder around that root separates left from right, and consuming preorder in the same order keeps both aligned.'],
  time: ['O(n)', 'Each value is placed once, and lookups are O(1).'],
  space: ['O(n)', 'The map, plus recursion depth up to n.'],
  solution,
  cases,
  sig: 'def build_tree(preorder, inorder):\n    # TreeNode(val, left, right) is provided; return the root of the tree\n    pass\n',
  harness,
  viz,
  fromArgs: ([pre, ino]) => ({ pre, ino }),
});
