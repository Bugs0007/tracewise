import type { Tone } from '@/engine/types';
import { chipsView, queueView } from '@/dsa/viz/prims';
import { levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './binary-tree-right-side-view.py?raw';
import harness from './binary-tree-right-side-view.harness.py?raw';
import cases from './binary-tree-right-side-view.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'binary-tree-right-side-view',
  title: 'Binary Tree Right Side View',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [1, 2, 3, null, 5, null, 4, 6], maxItems: 15 }],
  presets: [
    { label: 'Left branch peeks out', input: { level: [1, 2, 3, null, 5, null, 4, 6] } },
    { label: 'Complete', input: { level: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Left chain', input: { level: [1, 2, null, 3, null, 4] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const res: number[] = [];
    let queue: BTNode[] = [];
    let askedLast = false;
    const view = () => [
      treePanel(root, { title: 'tree (the rightmost node of each row is what you would see)', tones }),
      queueView(queue.map((n) => n.val), { title: 'queue' }),
      chipsView(res, { title: 'visible from the right' }),
    ];
    r.step('init', 'res collects one value per level.', view(), {});
    if (!root) {
      r.step('guardRet', 'The tree is empty: return [].', view(), { result: [] });
      return { frames: r.frames, result: [] };
    }
    const depthOf = (n: BTNode | null): number => (n ? 1 + Math.max(depthOf(n.left), depthOf(n.right)) : 0);
    const rows = depthOf(root);
    r.predictChoice('rows', 'The answer has one value per level. How many values will it contain for this tree?', String(rows), [String(rows + 1), String(Math.max(1, rows - 1)), String(rows + 2)], rows, 'Every level of the tree has a rightmost node, so the answer has as many values as the tree has levels.');
    queue = [root];
    tones[root.id] = 'frontier';
    r.step('queue',`Start with the root ${root.val} in the queue.`, view(), {});
    while (queue.length) {
      r.op();
      const size = queue.length;
      r.step('size', `A level with ${size} node${size > 1 ? 's' : ''}. Only the last one popped is visible from the right.`, view(), { size });
      for (let i = 0; i < size; i++) {
        const node = queue.shift()!;
        tones[node.id] = 'active';
        r.step('pop', `Pop ${node.val} (position ${i + 1} of ${size} in this level).`, view(), { node: node.val, i });
        if (i === size - 1) {
          if (!askedLast) {
            askedLast = true;
            r.predict('last', `${node.val} is the last of ${size} nodes in this level. Is it visible from the right side?`, ['Yes: it is the rightmost of its level', 'No: a deeper node hides it'], 0, 'The last node popped in a level is its rightmost one.');
          }
          res.push(Number(node.val));
          tones[node.id] = 'found';
          r.step('take', `Last in the level: ${node.val} is visible. Add it to the result.`, view(), { node: node.val });
        } else {
          tones[node.id] = 'done';
        }
        if (node.left) {
          queue.push(node.left);
          tones[node.left.id] = 'frontier';
        }
        if (node.right) {
          queue.push(node.right);
          tones[node.right.id] = 'frontier';
        }
        r.step('pushLeft', node.left || node.right ? `Queue the children of ${node.val}: ${[node.left, node.right].filter(Boolean).map((c) => c!.val).join(', ')}.` : `${node.val} has no children to queue.`, view(), {});
      }
    }
    r.step('done', `Done. The right-side view is ${JSON.stringify(res)}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ level }) {
    const root = treeOf(level);
    const out: number[] = [];
    let row: BTNode[] = root ? [root] : [];
    while (row.length) {
      out.push(Number(row[row.length - 1].val));
      row = row.flatMap((n) => [n.left, n.right].filter((c): c is BTNode => !!c));
    }
    return out;
  },
});

export default problem({
  summary: 'Imagine standing on the right side of a binary tree. List the values you can see, from top to bottom: for every depth, the rightmost node of that row.',
  example: ['tree 4 with children 2, 6; 2 has a child 3 (6 has none)', '[4, 6, 3]', 'On row 3 only the 3 exists, so it is visible even though it hangs on the left.'],
  pattern: ['bfs', ['bfs', 'dfs', 'stack', 'monotonic-stack'], 'Level order puts each row together, so "the last node of the row" is the one you see. A right-first DFS that records the first node per depth also works.', {
    dfs: 'DFS works too (visit right before left and keep the first node seen at each depth), but BFS makes the level boundary obvious.',
    stack: 'A plain stack does not group nodes by depth.',
    'monotonic-stack': 'No next-greater structure is involved.',
  }],
  hints: [
    'Which node do you see for a given row?',
    'If you process the tree row by row, which node of each row is the one you want?',
    'BFS with a queue; in each round, remember the last node popped (index size − 1).',
  ],
  insight: 'This is level order traversal where you keep only the last node of each level.',
  brute: 'Collect every level fully, then take the last value of each: same O(n).',
  optimal: 'BFS (or right-first DFS): O(n) time, O(w) space.',
  walk: ['If the tree is empty, return [].', 'Process level by level with a queue, using size = len(queue).', 'For the node at position size − 1 (the last of its level) append its value to the result.', 'Queue every node’s children as in level order.'],
  edge: ['Empty tree.', 'A left-only chain: every node is visible.', 'A deeper left branch that sticks out beyond the right one.', 'Single node.'],
  works: ['The queue keeps nodes in left-to-right order, so the last node popped in a round is the rightmost of that level.', 'Every level contributes exactly one value.'],
  time: ['O(n)', 'Each node is handled once.'],
  space: ['O(w)', 'The queue holds at most one row.'],
  solution,
  cases,
  sig: 'def right_side_view(root):\n    # the rightmost value of every level, top to bottom\n    pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
