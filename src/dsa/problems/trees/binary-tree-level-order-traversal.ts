import type { Tone } from '@/engine/types';
import { chipsView, queueView } from '@/dsa/viz/prims';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './binary-tree-level-order-traversal.py?raw';
import harness from './binary-tree-level-order-traversal.harness.py?raw';
import cases from './binary-tree-level-order-traversal.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'binary-tree-level-order-traversal',
  title: 'Binary Tree Level Order Traversal',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [8, 3, 12, null, null, 10, 15, 1], maxItems: 15 }],
  presets: [
    { label: 'Uneven', input: { level: [8, 3, 12, null, null, 10, 15, 1] } },
    { label: 'Complete', input: { level: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Chain', input: { level: [1, 2, null, 3] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const res: number[][] = [];
    let cur: (number | string)[] = [];
    let queue: BTNode[] = [];
    let askedSize = false;
    let askedOrder = false;
    const view = () => [
      treePanel(root, { title: 'tree', tones }),
      queueView(queue.map((n) => n.val), { title: 'queue' }),
      chipsView(cur, { title: 'current level' }),
      chipsView(res.map((l) => `[${l.join(', ')}]`), { title: 'result so far' }),
    ];
    r.step('init', 'res will hold one list per level.', view(), {});
    if (!root) {
      r.step('guardRet', 'The tree is empty: return [].', view(), { result: [] });
      return { frames: r.frames, result: [] };
    }
    queue = [root];
    tones[root.id] = 'frontier';
    r.step('queue', `Put the root ${root.val} in the queue.`, view(), {});
    while (queue.length) {
      r.op();
      cur = [];
      const size = queue.length;
      if (!askedSize && res.length >= 1) {
        askedSize = true;
        r.predictChoice('size', 'A new level starts. How many nodes are in the queue, and so how many are popped for this level?', String(size), [String(size + 1), String(Math.max(1, size - 1)), '1'], size, 'The queue holds exactly the nodes of the next level; len(queue) fixes how many to pop.');
      }
      r.step('level', `A new level begins with ${size} node${size > 1 ? 's' : ''} in the queue. Pop exactly that many.`, view(), { size });
      const level: number[] = [];
      for (let i = 0; i < size; i++) {
        const node = queue.shift()!;
        tones[node.id] = 'active';
        level.push(Number(node.val));
        cur = [...level];
        r.step('visit', `Pop ${node.val} and add it to the current level.`, view(), { node: node.val });
        if (node.left && node.right && !askedOrder) {
          askedOrder = true;
          r.predict('order', `${node.val} has children ${node.left.val} and ${node.right.val}. Which one enters the queue first?`, [`${node.left.val} (left first)`, `${node.right.val} (right first)`], 0, 'Left is queued before right, so each level comes out left to right.');
        }
        if (node.left) {
          queue.push(node.left);
          tones[node.left.id] = 'frontier';
          r.step('pushLeft', `Queue the left child ${node.left.val}.`, view(), {});
        }
        if (node.right) {
          queue.push(node.right);
          tones[node.right.id] = 'frontier';
          r.step('pushRight', `Queue the right child ${node.right.val}.`, view(), {});
        }
        tones[node.id] = 'done';
      }
      res.push(level);
      cur = [];
      r.step('add', `Level finished: [${level.join(', ')}] goes into the result.`, view(), {});
    }
    r.step('done', `The queue is empty. Result: ${JSON.stringify(res)}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ level }) {
    const root = treeOf(level);
    const out: number[][] = [];
    let row: BTNode[] = root ? [root] : [];
    while (row.length) {
      out.push(row.map((n) => Number(n.val)));
      row = row.flatMap((n) => [n.left, n.right].filter((c): c is BTNode => !!c));
    }
    return out;
  },
});

export default problem({
  summary: 'Return the values of a binary tree grouped by depth: first the root alone, then everything one step down from left to right, then the next row, and so on.',
  example: ['tree 5 with children 2, 8; 2 has a child 1; 8 has a child 9', '[[5], [2, 8], [1, 9]]', 'Rows are read left to right, top to bottom.'],
  pattern: ['bfs', ['bfs', 'dfs', 'stack', 'two-pointers'], 'Visiting nodes level by level is exactly what a queue gives you. Process the nodes that are in the queue at the start of a level, and those are one level.', {
    dfs: 'A DFS can fill rows by passing the depth down, but the queue is the natural tool for level-by-level order.',
    stack: 'A stack gives depth-first order, the opposite of level order.',
    'two-pointers': 'No sorted ends are involved.',
  }],
  hints: [
    'You want to finish one entire row before starting the next. Which structure gives first-in, first-out order?',
    'How do you know where one level ends and the next begins?',
    'Use a queue. At the start of each round, len(queue) is the size of the current level; pop that many nodes and push their children.',
  ],
  insight: 'Freeze len(queue) at the start of the round: that many nodes make up the current level.',
  brute: 'Compute the depth of every node with DFS, then group by depth: O(n) too, more bookkeeping.',
  optimal: 'BFS with a queue: O(n) time, O(w) space (w = widest level).',
  walk: ['If root is None, return [].', 'Start with a queue holding the root.', 'While the queue is not empty: take size = len(queue), pop that many nodes into a list, queueing their children.', 'Append the list to the result.'],
  edge: ['Empty tree.', 'Single node.', 'A chain: one node per level.', 'Missing children in the middle of levels.'],
  works: ['The queue always holds exactly the next unvisited nodes in left-to-right order.', 'Freezing the size separates levels, because new children are added behind the nodes being popped.'],
  time: ['O(n)', 'Each node is queued and popped once.'],
  space: ['O(w)', 'The queue holds at most one level, which is up to about n/2 nodes.'],
  solution,
  cases,
  sig: 'def level_order(root):\n    # return a list of lists: the values of each level, left to right\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
