import type { Tone } from '@/engine/types';
import { hashMapView } from '@/dsa/viz/prims';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './validate-binary-search-tree.py?raw';
import harness from './validate-binary-search-tree.harness.py?raw';
import cases from './validate-binary-search-tree.cases.json';

const fmt = (x: number) => (x === -Infinity ? '−∞' : x === Infinity ? '∞' : String(x));

const viz = vizOf<{ level: Level }>({
  id: 'validate-binary-search-tree',
  title: 'Validate Binary Search Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [5, 3, 8, 2, 6, 7, 9], maxItems: 15 }],
  presets: [
    { label: 'Deep violation', input: { level: [5, 3, 8, 2, 6, 7, 9] } },
    { label: 'Valid', input: { level: [8, 4, 12, 2, 6, 10, 14] } },
    { label: 'Duplicate', input: { level: [4, 4] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    let low = -Infinity;
    let high = Infinity;
    let askedRange = false;
    let askedBound = false;
    const view = () => [treePanel(root, { title: 'each visited node shows the range it must stay inside', tones, badges }), hashMapView({ low: fmt(low), high: fmt(high) }, { title: 'allowed range for the current node (exclusive)' })];
    const check = (node: BTNode | null, lo: number, hi: number): boolean => {
      if (!node) return true;
      r.op();
      low = lo;
      high = hi;
      const v = Number(node.val);
      tones[node.id] = 'active';
      badges[node.id] = `(${fmt(lo)}, ${fmt(hi)})`;
      r.step('def', `check(${v}): every value here must be strictly between ${fmt(lo)} and ${fmt(hi)}.`, view(), { node: v });
      const ok = lo < v && v < hi;
      if (!askedRange) {
        askedRange = true;
        r.predict('range', `Is ${v} strictly inside (${fmt(lo)}, ${fmt(hi)})?`, ['Yes', 'No'], ok ? 0 : 1, ok ? `${fmt(lo)} < ${v} < ${fmt(hi)}.` : `${v} is outside the allowed range.`);
      }
      if (!ok) {
        tones[node.id] = 'error';
        r.step('bad', `${v} is not inside (${fmt(lo)}, ${fmt(hi)}): the BST rule is broken. Return False.`, view(), { result: false });
        return false;
      }
      tones[node.id] = 'compare';
      r.step('recurse', `${v} is valid. Now check its left subtree, then its right subtree.`, view(), {});
      if (!askedBound && (node.left || node.right)) {
        askedBound = true;
        r.predict('bound', `${v} is fine. What do its left child and its right child inherit?`, [`Left: the range up to ${v}; right: the range from ${v}`, `Both keep (${fmt(lo)}, ${fmt(hi)})`, `Left: from ${v}; right: up to ${v}`], 0, 'Everything on the left must stay below this node, everything on the right above it, while the old outer bounds still apply.');
      }
      const good = check(node.left, lo, v) && check(node.right, v, hi);
      if (good) tones[node.id] = 'done';
      return good;
    };
    if (!root) r.step('base', 'An empty tree has no node to break the rule: it is valid.', view(), {});
    const res = check(root, -Infinity, Infinity);
    r.step('start', res ? 'No node broke its range. It is a valid BST.' : 'A violation was found, so the answer is False.', view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ level }) {
    const go = (n: BTNode | null, lo: number, hi: number): boolean => !n || (lo < Number(n.val) && Number(n.val) < hi && go(n.left, lo, Number(n.val)) && go(n.right, Number(n.val), hi));
    return go(treeOf(level), -Infinity, Infinity);
  },
});

export default problem({
  summary: 'Decide whether a binary tree is a valid binary search tree: for every node, all values in its left subtree are strictly smaller and all values in its right subtree are strictly larger.',
  example: ['tree 5 with children 3, 8; and 3 has a right child 6', 'false', '6 is in the left subtree of 5, but 6 is bigger than 5. Checking only parent and child would miss it.'],
  pattern: ['bst', ['bst', 'dfs', 'bfs', 'divide-conquer'], 'The BST rule is about whole subtrees, so each node must carry the range of values allowed there. A DFS that narrows the range as it goes down checks the full rule.', {
    dfs: 'The traversal is DFS, but the key idea (passing a value range down) is the BST property.',
    bfs: 'BFS could carry ranges in the queue, but recursion is simpler.',
    'divide-conquer': 'Each subtree is validated independently with the proper bounds.',
  }],
  hints: [
    'Is it enough to check that each node is bigger than its left child and smaller than its right child?',
    'A node deep in the left subtree must still be smaller than the root. What do you need to remember as you go down?',
    'Pass (low, high) bounds: the root has (−∞, ∞); going left sets high = node.val; going right sets low = node.val; the value must be strictly inside.',
  ],
  insight: 'Every node lives inside an open interval set by its ancestors; going down only ever shrinks that interval.',
  brute: 'For each node compute the min and max of both subtrees: O(n²) worst case.',
  optimal: 'DFS with bounds: O(n) time, O(h) space. An inorder traversal that checks strictly increasing values is an equivalent alternative.',
  walk: ['check(node, low, high) returns True for None.', 'If node.val is not strictly between low and high, return False.', 'Check the left subtree with high = node.val and the right subtree with low = node.val.', 'Start with check(root, −∞, ∞).'],
  edge: ['Empty tree and single node are valid.', 'Duplicates are invalid (strict inequality).', 'A violation far from the offending ancestor.', 'Values equal to the extreme integers (using infinities avoids sentinel clashes).'],
  works: ['The interval for a node is exactly the intersection of the constraints from all its ancestors.', 'The tree is a BST iff every node satisfies its own interval.'],
  time: ['O(n)', 'Each node is checked once.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def is_valid_bst(root):\n    # True if every left subtree is strictly smaller and every right subtree strictly larger\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
