import type { Tone } from '@/engine/types';
import { hashMapView } from '@/dsa/viz/prims';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './diameter-of-binary-tree.py?raw';
import harness from './diameter-of-binary-tree.harness.py?raw';
import cases from './diameter-of-binary-tree.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'diameter-of-binary-tree',
  title: 'Diameter of Binary Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [1, 2, null, 3, 4, 5, null, null, null, 6], maxItems: 15 }],
  presets: [
    { label: 'Path avoids the root', input: { level: [1, 2, null, 3, 4, 5, null, null, null, 6] } },
    { label: 'Through the root', input: { level: [1, 2, 3, 4, 5] } },
    { label: 'Chain', input: { level: [1, null, 2, null, 3, null, 4] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    let best = 0;
    let bestAt: string | null = null;
    let askedPath = false;
    let askedBest = false;
    const view = () => [treePanel(root, { title: 'each finished node shows its height', tones, badges }), hashMapView({ best }, { title: 'longest path so far (in edges)' })];
    r.step('init', 'best is the longest path found so far, counted in edges.', view(), { best });
    const height = (node: BTNode | null): number => {
      if (!node) return 0;
      r.op();
      tones[node.id] = 'active';
      r.step('def', `height(${node.val}): measure the left and right subtrees first.`, view(), { node: node.val });
      const left = height(node.left);
      const right = height(node.right);
      tones[node.id] = 'compare';
      if (!askedPath) {
        askedPath = true;
        r.predictChoice('path', `left = ${left}, right = ${right}. The longest path that bends at ${node.val} has how many edges?`, String(left + right), [String(left + right + 1), String(Math.max(left, right)), String(left * right)], Number(node.val), 'Going down the left side then the right side adds the two heights: left + right edges.');
      }
      const through = left + right;
      if (through > best && !askedBest && best > 0) {
        askedBest = true;
        r.predict('best', `This path has ${through} edges and best is ${best}. Does best change?`, ['Yes: this is a new longest path', 'No: keep best'], 0, 'A longer path replaces best, even if it does not pass through the root.');
      }
      if (through > best) {
        best = through;
        bestAt = node.id;
      }
      r.step('update', `A path bending at ${node.val} has ${left} + ${right} = ${through} edges. best = ${best}.`, view(), { left, right, best });
      const res = 1 + Math.max(left, right);
      badges[node.id] = String(res);
      tones[node.id] = node.id === bestAt ? 'found' : 'done';
      r.step('ret', `Return the height of ${node.val}: 1 + max(${left}, ${right}) = ${res}.`, view(), { height: res });
      return res;
    };
    height(root);
    r.step('done', `The diameter is ${best}.`, view(), { result: best });
    return { frames: r.frames, result: best };
  },
  reference({ level }) {
    const root = treeOf(level);
    let best = 0;
    const h = (n: BTNode | null): number => {
      if (!n) return 0;
      const a = h(n.left);
      const b = h(n.right);
      best = Math.max(best, a + b);
      return 1 + Math.max(a, b);
    };
    h(root);
    return best;
  },
});

export default problem({
  summary: 'The diameter of a binary tree is the length (counted in edges) of the longest path between any two nodes. The path may or may not pass through the root. Find it.',
  example: ['tree 1 with children 2 and 3, and 2 has children 4 and 5', '3', 'The path 4 → 2 → 1 → 3 (or 5 → 2 → 1 → 3) has 3 edges.'],
  pattern: ['dfs', ['dfs', 'bfs', 'dp-1d', 'two-pointers'], 'The longest path that bends at a node is its left height plus its right height. Compute heights bottom-up and record the best sum along the way.', {
    bfs: 'A BFS does not give per-node heights directly.',
    'dp-1d': 'Each node combines its children’s results, which is tree recursion rather than a DP table.',
    'two-pointers': 'There are no sorted ends to compare.',
  }],
  hints: [
    'Consider the longest path whose highest node is a particular node. Which two things determine its length?',
    'It goes down the deepest left path and down the deepest right path: height(left) + height(right).',
    'Compute heights with one DFS; at each node update a global best with left + right before returning 1 + max(left, right).',
  ],
  insight: 'Return the height up the recursion, but while doing so record left + right as a candidate diameter at every node.',
  brute: 'For every node compute left and right heights separately: O(n²) in the worst case.',
  optimal: 'One DFS that returns heights and tracks the best bend: O(n) time, O(h) space.',
  walk: ['Keep a variable best = 0.', 'height(node) returns 0 for None.', 'Otherwise compute left = height(left child) and right = height(right child), then update best = max(best, left + right).', 'Return 1 + max(left, right) so the parent can use this height. After the DFS, best is the diameter.'],
  edge: ['Empty tree or single node: 0.', 'A chain: n − 1.', 'The longest path avoiding the root.', 'Balanced trees.'],
  works: ['Every path has a unique highest node. At that node its length is exactly left height + right height at best, and we examine every node as a possible highest node.', 'Returning 1 + max(left, right) gives each parent the correct height.'],
  time: ['O(n)', 'Each node is visited once.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def diameter_of_binary_tree(root):\n    # length, in edges, of the longest path between any two nodes\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
