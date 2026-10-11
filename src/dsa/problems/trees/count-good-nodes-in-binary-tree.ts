import type { Tone } from '@/engine/types';
import { hashMapView } from '@/dsa/viz/prims';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './count-good-nodes-in-binary-tree.py?raw';
import harness from './count-good-nodes-in-binary-tree.harness.py?raw';
import cases from './count-good-nodes-in-binary-tree.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'count-good-nodes-in-binary-tree',
  title: 'Count Good Nodes in Binary Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [3, 1, 4, 3, null, 1, 5], maxItems: 15 }],
  presets: [
    { label: 'Mixed', input: { level: [3, 1, 4, 3, null, 1, 5] } },
    { label: 'Descending', input: { level: [9, 6, 7, 2, 4, 3, 1] } },
    { label: 'All good', input: { level: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Negatives', input: { level: [-2, -5, -1, -7] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    let count = 0;
    let curHigh = '−∞';
    let askedGood = false;
    let askedPass = false;
    const view = () => [treePanel(root, { title: 'a node is good if no ancestor on its path is larger', tones, badges }), hashMapView({ 'highest on this path': curHigh, 'good so far': count })];
    if (!root) {
      r.step('start', 'The tree is empty, so there are 0 good nodes.', view(), { result: 0 });
      return { frames: r.frames, result: 0 };
    }
    const dfs = (node: BTNode | null, highest: number): number => {
      if (!node) return 0;
      r.op();
      const v = Number(node.val);
      curHigh = highest === -Infinity ? '−∞' : String(highest);
      tones[node.id] = 'active';
      r.step('def', `dfs(${v}, highest = ${curHigh}): the biggest value on the path from the root to here (excluding this node) is ${curHigh}.`, view(), { node: v });
      const isGood = v >= highest;
      if (!askedGood) {
        askedGood = true;
        r.predict('good', `Node ${v}, highest so far ${curHigh}. Is ${v} a good node?`, ['Yes: nothing above it is bigger', 'No: an ancestor is bigger'], isGood ? 0 : 1, isGood ? `${v} ≥ ${curHigh}, so no ancestor is larger.` : `An ancestor (${curHigh}) is larger than ${v}.`);
      }
      if (isGood) {
        count++;
        tones[node.id] = 'found';
        badges[node.id] = '✓';
      } else {
        tones[node.id] = 'compare';
        badges[node.id] = '✗';
      }
      r.step('good', isGood ? `${v} ≥ ${curHigh}: it is good. Count = ${count}.` : `${v} < ${curHigh}: not good.`, view(), { count });
      const next = Math.max(highest, v);
      if (!askedPass && (node.left || node.right)) {
        askedPass = true;
        r.predictChoice('pass', `What highest value does ${v} pass down to its children?`, String(next), [String(v === next ? highest : v), String(v + 1), String(highest === -Infinity ? 0 : highest + 1)], v, 'The children need the maximum of what the path had and this node’s own value.');
      }
      r.step('update', `Pass highest = ${next} down to the children.`, view(), { highest: next });
      const total = (isGood ? 1 : 0) + dfs(node.left, next) + dfs(node.right, next);
      if (node.left || node.right) tones[node.id] = isGood ? 'done' : 'compare';
      return total;
    };
    const res = dfs(root, -Infinity);
    curHigh = '—';
    r.step('start', `All nodes visited. There are ${res} good nodes.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ level }) {
    const go = (n: BTNode | null, h: number): number => (n ? (Number(n.val) >= h ? 1 : 0) + go(n.left, Math.max(h, Number(n.val))) + go(n.right, Math.max(h, Number(n.val))) : 0);
    return go(treeOf(level), -Infinity);
  },
});

export default problem({
  summary: 'Call a node "good" if no node on the path from the root down to it has a larger value (the root is always good, and equal values are fine). Count the good nodes in a binary tree.',
  example: ['tree 4 with children 2 and 6; 2 has a child 1; 6 has a child 5', '2', '4 and 6 are good. 2 and 1 sit below the larger 4, and 5 sits below the larger 6.'],
  pattern: ['dfs', ['dfs', 'bfs', 'monotonic-stack', 'prefix-sum'], 'The goodness of a node depends on the path from the root to it, so carry the maximum seen on that path down the recursion as a parameter.', {
    bfs: 'BFS can also carry the path maximum in the queue, but DFS passes it down naturally.',
    'monotonic-stack': 'The path maximum looks like a monotonic idea, but it is just one value passed down.',
    'prefix-sum': 'A running maximum is a prefix idea, applied along a root-to-node path.',
  }],
  hints: [
    'What do you need to know about the path from the root to decide if a node is good?',
    'Only the largest value on the path so far. Can you pass that along as you go down?',
    'dfs(node, highest): count 1 if node.val >= highest, then recurse into both children with max(highest, node.val).',
  ],
  insight: 'Carry the maximum so far down the recursion: a node is good exactly when it is at least that large.',
  brute: 'For each node walk up to the root checking ancestors (needs parent pointers): O(n · h).',
  optimal: 'DFS with the path maximum as a parameter: O(n) time, O(h) space.',
  walk: ['Start dfs(root, −infinity).', 'For a node, it is good if its value ≥ highest.', 'Update highest = max(highest, node.val).', 'Return good + dfs(left, highest) + dfs(right, highest).'],
  edge: ['Single node: 1.', 'Strictly decreasing path: only the root is good.', 'Negative values (the initial highest must be below all of them).', 'Equal values count as good.'],
  works: ['The parameter always equals the maximum of the ancestors on the current path.', 'Each node is judged once against exactly its own ancestors.'],
  time: ['O(n)', 'Each node is visited once.'],
  space: ['O(h)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def good_nodes(root):\n    # count nodes whose value is >= every value on the path from the root to them\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
