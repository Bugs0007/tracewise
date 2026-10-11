import type { Tone } from '@/engine/types';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './subtree-of-another-tree.py?raw';
import harness from './subtree-of-another-tree.harness.py?raw';
import cases from './subtree-of-another-tree.cases.json';

interface Same {
  ok: boolean;
  why: string;
  at: [BTNode | null, BTNode | null];
}

const sameTree = (a: BTNode | null, b: BTNode | null): Same => {
  if (!a && !b) return { ok: true, why: '', at: [a, b] };
  if (!a || !b) return { ok: false, why: `${a ? a.val : 'None'} vs ${b ? b.val : 'None'}: one side ends where the other continues`, at: [a, b] };
  if (a.val !== b.val) return { ok: false, why: `${a.val} ≠ ${b.val}`, at: [a, b] };
  const l = sameTree(a.left, b.left);
  return l.ok ? sameTree(a.right, b.right) : l;
};

const viz = vizOf<{ root: Level; sub: Level }>({
  id: 'subtree-of-another-tree',
  title: 'Subtree of Another Tree',
  solution,
  inputs: [
    { key: 'root', label: 'big tree (level order)', kind: 'numbers', default: [7, 2, 9, 1, 4, null, null, 0], maxItems: 12 },
    { key: 'sub', label: 'candidate subtree (level order)', kind: 'numbers', default: [2, 1, 4], maxItems: 8 },
  ],
  presets: [
    { label: 'Extra node breaks it', input: { root: [7, 2, 9, 1, 4, null, null, 0], sub: [2, 1, 4] } },
    { label: 'Exact match', input: { root: [7, 2, 9, 1, 4], sub: [2, 1, 4] } },
    { label: 'Single leaf', input: { root: [7, 2, 9, 1, 4], sub: [4] } },
    { label: 'Not present', input: { root: [1, 2, 3], sub: [3, 4] } },
  ],
  validate: ({ root, sub }) => levelProblem(root) ?? levelProblem(sub),
  run({ root, sub }) {
    const r = new TraceRecorder(solution);
    const big = treeOf(root);
    const small = treeOf(sub);
    const tb: Record<string, Tone> = {};
    const ts: Record<string, Tone> = {};
    let askedTry = false;
    let askedDeep = false;
    let askedDown = false;
    let askedNone = false;
    const view = () => [treePanel(big, { title: 'root', tones: tb }), treePanel(small, { title: 'sub_root', tones: ts })];
    const clearSub = () => Object.keys(ts).forEach((k) => delete ts[k]);
    const mark = (a: BTNode | null, b: BTNode | null, tone: Tone) => {
      if (a && b) {
        tb[a.id] = tone;
        ts[b.id] = tone;
        mark(a.left, b.left, tone);
        mark(a.right, b.right, tone);
      }
    };
    const isSub = (n: BTNode | null): boolean => {
      r.op();
      if (!n) {
        if (!askedNone) {
          askedNone = true;
          r.step('noRoot', small ? 'Ran out of tree: there is no place left to try. Return False (sub_root is not empty).' : 'Ran out of tree and sub_root is empty too: an empty tree sits at every leaf’s child. Return True.', view(), {});
        }
        return small === null;
      }
      clearSub();
      tb[n.id] = 'active';
      r.step('try', `Try ${n.val}: does the whole subtree rooted at ${n.val} equal sub_root?`, view(), { node: n.val });
      const res = sameTree(n, small);
      if (!askedTry) {
        askedTry = true;
        r.predict('try', `Does the whole subtree under ${n.val} match sub_root exactly (same shape, same values)?`, ['Yes', 'No'], res.ok ? 0 : 1, res.ok ? 'Every pair of nodes lines up.' : `They differ: ${res.why}.`);
      }
      if (res.ok) {
        mark(n, small, 'found');
        r.step('hit', `Match! The subtree at ${n.val} is identical to sub_root. Return True.`, view(), { result: true });
        return true;
      }
      if (!askedDeep && small && n.val === small.val) {
        askedDeep = true;
        r.predict('deep', `The root values match (${n.val} = ${small.val}). Is that enough to say it is a subtree?`, ['No: every node below must match too', 'Yes: matching roots is enough'], 0, 'A subtree must match completely: extra or missing nodes lower down break it.');
      }
      const [a, b] = res.at;
      if (a) tb[a.id] = 'error';
      if (b) ts[b.id] = 'error';
      r.step('sameMismatch', `Not equal here: ${res.why}. Try the left and right subtrees of ${n.val} instead.`, view(), { node: n.val });
      if (!askedDown) {
        askedDown = true;
        r.predict('down', `The subtree at ${n.val} did not match. Where can sub_root still be?`, ['Inside the left or right subtree of this node', 'Nowhere: the answer is False', 'Only at the root'], 0, 'The match could start at any node deeper in the tree, so try both children.');
      }
      tb[n.id] = 'compare';
      return isSub(n.left) || isSub(n.right);
    };
    const res = isSub(big);
    r.step('down', res ? 'A match was found, so the answer is True.' : 'No node of root has a subtree equal to sub_root. The answer is False.', view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ root, sub }) {
    const big = treeOf(root);
    const small = treeOf(sub);
    const eq = (a: BTNode | null, b: BTNode | null): boolean => (!a && !b) || (!!a && !!b && a.val === b.val && eq(a.left, b.left) && eq(a.right, b.right));
    const go = (n: BTNode | null): boolean => (n ? eq(n, small) || go(n.left) || go(n.right) : small === null);
    return go(big);
  },
});

export default problem({
  summary: 'Given a big binary tree and a smaller one, decide whether the big tree contains a node whose entire subtree (shape and values, all the way down) is identical to the smaller tree.',
  example: ['big: 7 with children 2, 9 and 2 has children 1, 4; small: 2 with children 1, 4', 'true', 'The subtree under the 4 matches exactly. If the 1 had an extra child it would not.'],
  pattern: ['dfs', ['dfs', 'bfs', 'hash-lookup', 'divide-conquer'], 'Visit every node of the big tree as a possible starting point, and at each one run the "same tree" comparison. Both parts are depth-first recursions.', {
    bfs: 'You could try nodes in level order, but the recursion is shorter.',
    'hash-lookup': 'Serialising the trees to strings and checking containment is possible but needs null markers to be correct.',
    'divide-conquer': 'It splits into subtrees, but the technique is DFS plus a comparison helper.',
  }],
  hints: [
    'If the answer is yes, sub_root must match the subtree that starts at some node of root. How do you check one starting node?',
    'You already know how to compare two trees for equality (Same Tree).',
    'For each node of root, run same(node, sub_root); if none match, recurse into the left and right children.',
  ],
  insight: 'Subtree = Same Tree applied at every node of the big tree.',
  brute: 'Try every node and compare: O(n · m).',
  optimal: 'The same idea; smarter methods (tree hashing) get O(n + m) but the recursion is fine in practice.',
  walk: ['If root is None, the answer is whether sub_root is also None.', 'If same(root, sub_root), return True.', 'Otherwise return is_subtree(root.left, sub_root) or is_subtree(root.right, sub_root).', 'same(a, b) is the equality check from Same Tree.'],
  edge: ['Empty sub_root (always contained).', 'Matching root values but an extra node deeper in the big tree.', 'sub_root equals the whole tree.', 'Repeated values in several places.'],
  works: ['A subtree always starts at one specific node, and we try every node.', 'same() returns True only when shape and every value match.'],
  time: ['O(n · m)', 'Up to n starting points, each compared with up to m nodes.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def is_subtree(root, sub_root):\n    # True if some node of root has a subtree identical to sub_root\n    pass\n',
  harness,
  viz,
  fromArgs: ([root, sub]) => ({ root, sub }),
});
