import type { Tone } from '@/engine/types';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './same-tree.py?raw';
import harness from './same-tree.harness.py?raw';
import cases from './same-tree.cases.json';

const viz = vizOf<{ a: Level; b: Level }>({
  id: 'same-tree',
  title: 'Same Tree',
  solution,
  inputs: [
    { key: 'a', label: 'tree p (level order)', kind: 'numbers', default: [1, 2, 3, 4], maxItems: 10 },
    { key: 'b', label: 'tree q (level order)', kind: 'numbers', default: [1, 2, 3, 5], maxItems: 10 },
  ],
  presets: [
    { label: 'Differ deep down', input: { a: [1, 2, 3, 4], b: [1, 2, 3, 5] } },
    { label: 'Identical', input: { a: [1, 2, 3], b: [1, 2, 3] } },
    { label: 'Different shape', input: { a: [1, 2], b: [1, null, 2] } },
    { label: 'Both empty', input: { a: [], b: [] } },
  ],
  validate: ({ a, b }) => levelProblem(a) ?? levelProblem(b),
  run({ a, b }) {
    const r = new TraceRecorder(solution);
    const ra = treeOf(a);
    const rb = treeOf(b);
    const ta: Record<string, Tone> = {};
    const tb: Record<string, Tone> = {};
    let askedMatch = false;
    let askedDiffer = false;
    const view = () => [treePanel(ra, { title: 'p', tones: ta }), treePanel(rb, { title: 'q', tones: tb })];
    const same = (p: BTNode | null, q: BTNode | null): boolean => {
      r.op();
      if (!p && !q) {
        r.step('bothNone', 'Both are empty: that matches (two missing children are the same).', view(), {});
        return true;
      }
      if (p) ta[p.id] = 'active';
      if (q) tb[q.id] = 'active';
      const bad = !p || !q || p.val !== q.val;
      r.step('mismatch', `Compare ${p ? p.val : 'None'} (in p) with ${q ? q.val : 'None'} (in q).`, view(), { p: p ? p.val : 'None', q: q ? q.val : 'None' });
      if (bad ? !askedDiffer : !askedMatch) {
        if (bad) askedDiffer = true;
        else askedMatch = true;
        r.predict(bad ? 'differ' : 'equal', `p has ${p ? p.val : 'None'}, q has ${q ? q.val : 'None'} at this position. Do they match?`, ['Yes: check the children next', 'No: the trees differ, return False'], bad ? 1 : 0, bad ? 'A value or shape difference at the same position means the trees are not the same.' : 'Same value here, so compare the left children then the right children.');
      }
      if (bad) {
        if (p) ta[p.id] = 'error';
        if (q) tb[q.id] = 'error';
        r.step('mismatchRet', !p || !q ? 'One side is missing a node the other has: different shape. Return False.' : `${p.val} ≠ ${q.val}: return False.`, view(), { result: false });
        return false;
      }
      ta[p!.id] = 'compare';
      tb[q!.id] = 'compare';
      const ok = same(p!.left, q!.left) && same(p!.right, q!.right);
      ta[p!.id] = ok ? 'done' : 'error';
      tb[q!.id] = ok ? 'done' : 'error';
      r.step('recurse', ok ? `Both subtrees of ${p!.val} match: this pair is the same.` : `A subtree below ${p!.val} differs, so this pair is not the same.`, view(), { ok });
      return ok;
    };
    const res = same(ra, rb);
    r.step('recurse', res ? 'Every pair matched: the trees are the same. Return True.' : 'A pair differed, so the trees are not the same. Return False.', view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ a, b }) {
    const eq = (p: BTNode | null, q: BTNode | null): boolean => (!p && !q) || (!!p && !!q && p.val === q.val && eq(p.left, q.left) && eq(p.right, q.right));
    return eq(treeOf(a), treeOf(b));
  },
});

export default problem({
  summary: 'Two binary trees are the same if they have exactly the same shape and every pair of corresponding nodes holds the same value. Decide whether two given trees are the same.',
  example: ['p: 2 with children 1, 3; q: 2 with children 1, 3', 'true', 'If q had 4 instead of 3, or a missing child, the answer would be false.'],
  pattern: ['dfs', ['dfs', 'bfs', 'two-pointers', 'hash-lookup'], 'Walk both trees in lockstep. Two empty nodes match; one empty or different values do not; otherwise both children pairs must match.', {
    bfs: 'A parallel level-order traversal also works, but recursion matches the structure directly.',
    'two-pointers': 'You advance two cursors (one per tree), but the recursion on child pairs is DFS.',
    'hash-lookup': 'Serialising both trees and comparing strings is an alternative, not a lookup.',
  }],
  hints: [
    'When are two empty subtrees the same? When is an empty tree different from a non-empty one?',
    'If the current nodes have equal values, what remains to check?',
    'is_same(p, q): both None → True; one None or values differ → False; else is_same(left, left) and is_same(right, right).',
  ],
  insight: 'Compare the roots, then recurse on the matching left children and matching right children.',
  brute: 'Serialise both trees (with markers for missing children) and compare the strings: O(n).',
  optimal: 'Simultaneous DFS: O(n) time, O(h) space; it stops at the first difference.',
  walk: ['If both nodes are None, return True.', 'If exactly one is None, or the values differ, return False.', 'Otherwise return is_same(p.left, q.left) and is_same(p.right, q.right).', 'Short-circuiting stops at the first mismatch.'],
  edge: ['Both empty.', 'One empty and one not.', 'Same values but different shapes.', 'A difference only deep in one branch.'],
  works: ['By induction on size: two trees are the same iff their roots match and both subtree pairs are the same.', 'Each node pair is compared at most once.'],
  time: ['O(n)', 'n = the size of the smaller tree in the worst case.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def is_same_tree(p, q):\n    # True if both trees have the same shape and values\n    pass\n',
  harness,
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
