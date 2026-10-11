import type { Tone } from '@/engine/types';
import { hashMapView } from '@/dsa/viz/prims';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './binary-tree-maximum-path-sum.py?raw';
import harness from './binary-tree-maximum-path-sum.harness.py?raw';
import cases from './binary-tree-maximum-path-sum.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'binary-tree-maximum-path-sum',
  title: 'Binary Tree Maximum Path Sum',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [2, -4, 3, 5, -1, null, 6], maxItems: 15 }],
  presets: [
    { label: 'Negative branch', input: { level: [2, -4, 3, 5, -1, null, 6] } },
    { label: 'Classic', input: { level: [-10, 9, 20, null, null, 15, 7] } },
    { label: 'All negative', input: { level: [-3, -1, -2] } },
    { label: 'Single node', input: { level: [7] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    let best = -Infinity;
    let askedClip = false;
    let askedCand = false;
    const fmt = (x: number) => (x === -Infinity ? '−∞' : String(x));
    const view = () => [treePanel(root, { title: 'each finished node shows the best gain it hands to its parent', tones, badges }), hashMapView({ best: fmt(best) }, { title: 'best path sum so far' })];
    r.step('init', 'best starts at −∞: every path sum, even a negative one, will beat it.', view(), {});
    const gain = (node: BTNode | null): number => {
      if (!node) return 0;
      r.op();
      const v = Number(node.val);
      tones[node.id] = 'active';
      r.step('def', `gain(${v}): the best sum of a downward path that starts at ${v}. First get the gains of both children.`, view(), { node: v });
      const gl = gain(node.left);
      const gr = gain(node.right);
      tones[node.id] = 'compare';
      const left = Math.max(gl, 0);
      const right = Math.max(gr, 0);
      if (!askedClip && (gl < 0 || gr < 0)) {
        askedClip = true;
        const neg = gl < 0 ? gl : gr;
        r.predict('clip', `A child offers gain ${neg} (negative). How much do we take from that side?`, ['0: ignore it, a path can simply stop earlier', `${neg}: it is part of the tree so we must include it`, `${-neg}`], 0, 'A negative branch only lowers the sum, so we skip it with max(gain, 0).');
      }
      r.step('right', `Child gains: left ${gl}, right ${gr}. Negative ones are clipped to 0, so use left = ${left}, right = ${right}.`, view(), { left, right });
      const cand = v + left + right;
      if (!askedCand) {
        askedCand = true;
        r.predictChoice('cand', `A path that bends at ${v} uses ${left} on the left and ${right} on the right. What is its sum?`, String(cand), [String(v + Math.max(left, right)), String(left + right), String(cand + 1)], v, 'The bending path adds the node and both clipped child gains.');
      }
      const improved = cand > best;
      best = Math.max(best, cand);
      r.step('update', improved ? `Path through ${v}: ${v} + ${left} + ${right} = ${cand}. That beats the old best, so best = ${best}.` : `Path through ${v}: ${cand}. Not better than best = ${best}.`, view(), { cand, best });
      const out = v + Math.max(left, right);
      badges[node.id] = String(out);
      tones[node.id] = improved ? 'found' : 'done';
      r.step('ret', `${v} offers its parent a straight path worth ${v} + max(${left}, ${right}) = ${out} (a parent cannot use both branches).`, view(), { gain: out });
      return out;
    };
    if (root) gain(root);
    r.step('done', `Largest path sum: ${fmt(best)}.`, view(), { result: Number(best) });
    return { frames: r.frames, result: Number(best) };
  },
  reference({ level }) {
    let best = -Infinity;
    const g = (n: BTNode | null): number => {
      if (!n) return 0;
      const l = Math.max(g(n.left), 0);
      const rr = Math.max(g(n.right), 0);
      best = Math.max(best, Number(n.val) + l + rr);
      return Number(n.val) + Math.max(l, rr);
    };
    g(treeOf(level));
    return best;
  },
});

export default problem({
  summary: 'A path in a binary tree is a chain of connected nodes that never revisits a node; it may start and end anywhere and need not pass through the root. Find the largest possible sum of the values along a path (it must contain at least one node).',
  example: ['tree 1 with children -2 and 3', '4', 'The path 1 → 3 sums to 4. Including -2 would only make it smaller.'],
  pattern: ['dfs', ['dfs', 'dp-1d', 'divide-conquer', 'greedy'], 'At each node, combine what the two subtrees can offer. Return the best one-sided path upward and use both sides to update the global best.', {
    'dp-1d': 'Each node’s answer builds on its children’s answers, but it is tree recursion rather than a table.',
    'divide-conquer': 'It splits per subtree, but the technique is post-order DFS.',
    greedy: 'Dropping negative branches is greedy, inside a DFS.',
  }],
  hints: [
    'Think about the best path whose highest node is a given node. What goes into its sum?',
    'A path can use the node plus a downward path into the left child plus a downward path into the right child. When is it better to leave a side out?',
    'gain(node) = node.val + max(0, best left gain, best right gain); update the answer with node.val + max(0,left) + max(0,right).',
  ],
  insight: 'Return only a straight (one-branch) gain to the parent, but record the bent (two-branch) sum as a candidate answer.',
  brute: 'Try every pair of endpoints and sum the path: O(n²) or worse.',
  optimal: 'One post-order DFS: O(n) time, O(h) space.',
  walk: ['Keep best = −∞.', 'gain(None) = 0.', 'left = max(gain(left child), 0); right = max(gain(right child), 0).', 'Update best with node.val + left + right.', 'Return node.val + max(left, right) so the parent extends a single branch.'],
  edge: ['All values negative (the answer is the largest single value).', 'Single node.', 'Best path avoiding the root.', 'A very negative node between two large ones.'],
  works: ['Every path has a unique highest node and is two downward chains joined there; we evaluate that for every node.', 'Clipping negatives at 0 is optimal because stopping early is always allowed.'],
  time: ['O(n)', 'Each node is visited once.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def max_path_sum(root):\n    # largest sum of any connected downward-then-upward path (at least one node)\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
