import type { Tone } from '@/engine/types';
import { chipsView, hashMapView, stackView } from '@/dsa/viz/prims';
import { levelProblem, preorder, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './kth-smallest-element-in-a-bst.py?raw';
import harness from './kth-smallest-element-in-a-bst.harness.py?raw';
import cases from './kth-smallest-element-in-a-bst.cases.json';

const viz = vizOf<{ level: Level; k: number }>({
  id: 'kth-smallest-element-in-a-bst',
  title: 'Kth Smallest Element in a BST',
  solution,
  inputs: [
    { key: 'level', label: 'binary search tree (level order)', kind: 'numbers', default: [5, 3, 8, 2, 4, 7, 9], maxItems: 15 },
    { key: 'k', label: 'k (1 = smallest)', kind: 'number', default: 4 },
  ],
  presets: [
    { label: 'k = 4', input: { level: [5, 3, 8, 2, 4, 7, 9], k: 4 } },
    { label: 'Smallest', input: { level: [5, 3, 8, 2, 4, 7, 9], k: 1 } },
    { label: 'Largest', input: { level: [5, 3, 8, 2, 4, 7, 9], k: 7 } },
    { label: 'Lopsided', input: { level: [10, 4, null, 2, 6, 1], k: 3 } },
  ],
  validate: ({ level, k }) => levelProblem(level) ?? (Number.isInteger(k) && k >= 1 && k <= preorder(treeOf(level)).length ? null : 'k must be between 1 and the number of nodes'),
  run({ level, k }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tones: Record<string, Tone> = {};
    const stack: BTNode[] = [];
    const seen: (number | string)[] = [];
    let left = k;
    let askedFirst = false;
    let askedRight = false;
    const view = () => [
      treePanel(root, { title: 'tree (inorder visits values in increasing order)', tones }),
      stackView(stack.map((n) => n.val), { title: 'stack of ancestors still to visit' }),
      chipsView(seen, { title: 'visited in order' }),
      hashMapView({ 'k remaining': left }),
    ];
    r.step('init', `We need the ${k}${k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th'} smallest value. An inorder walk visits values smallest first, so just count visits.`, view(), {});
    let node: BTNode | null = root;
    while (stack.length || node) {
      r.op();
      let pushed = 0;
      while (node) {
        stack.push(node);
        tones[node.id] = 'frontier';
        node = node.left;
        pushed++;
      }
      if (pushed) r.step('push', `Go left as far as possible, stacking each node on the way (${stack.slice(-pushed).map((n) => n.val).join(', ')}).`, view(), { pushed });
      const top = stack[stack.length - 1];
      if (!askedFirst) {
        askedFirst = true;
        r.predict('first', 'There is nothing further left. Which node does the stack hand us next?', [`${top.val}, the top of the stack (the leftmost node so far)`, `${stack[0].val}, the bottom of the stack`], 0, 'The top of the stack is the deepest left node: the smallest value not yet visited.');
      }
      node = stack.pop()!;
      tones[node.id] = 'active';
      left--;
      seen.push(node.val);
      r.step('pop', `Pop ${node.val} and visit it. Visits are in sorted order, so k drops to ${left}.`, view(), { node: node.val, k: left });
      if (left === 0) {
        tones[node.id] = 'found';
        r.step('found', `k reached 0: ${node.val} is the answer.`, view(), { result: Number(node.val) });
        return { frames: r.frames, result: Number(node.val) };
      }
      tones[node.id] = 'done';
      if (node.right && !askedRight) {
        askedRight = true;
        r.predict('right', `${node.val} is visited and has a right child ${node.right.val}. What comes next in sorted order?`, ['The right subtree, starting from its leftmost node', 'The parent on the stack', 'The root'], 0, 'Everything in the right subtree is larger than this node but smaller than the ancestors still on the stack.');
      }
      node = node.right;
      r.step('right', node ? `Move to the right child ${node.val} and repeat.` : 'No right child: pop the next ancestor from the stack.', view(), {});
    }
    r.step('none', 'k is larger than the number of nodes.', view(), { result: null });
    return { frames: r.frames, result: null };
  },
  reference({ level, k }) {
    const out: number[] = [];
    const go = (n: BTNode | null) => {
      if (!n) return;
      go(n.left);
      out.push(Number(n.val));
      go(n.right);
    };
    go(treeOf(level));
    return out[k - 1] ?? null;
  },
});

export default problem({
  summary: 'Given a binary search tree and a number k, return the k-th smallest value in it, counting from 1.',
  example: ['BST: 5 with children 3 and 8; 3 has children 2 and 4; k = 3', '4', 'In sorted order the values are 2, 3, 4, 5, 8: the third is 4.'],
  pattern: ['bst', ['bst', 'dfs', 'heap', 'binary-search'], 'An inorder traversal of a BST visits values in increasing order. Walk inorder and stop at the k-th node you visit.', {
    dfs: 'The traversal is a depth-first inorder walk; what makes it work is the BST property.',
    heap: 'A heap would sort all n values; the ordering is already in the tree.',
    'binary-search': 'You can do a size-based descent, but it needs subtree counts you do not have.',
  }],
  hints: [
    'What order do the values come out in if you visit left subtree, node, right subtree?',
    'You do not need to collect all values: you can stop early.',
    'Do an inorder traversal with an explicit stack, decrement k at every visit, and return the value when k hits 0.',
  ],
  insight: 'Inorder on a BST is sorted order, so the k-th visited node is the k-th smallest.',
  brute: 'Collect all values, sort, index: O(n log n).',
  optimal: 'Iterative inorder with early exit: O(h + k) time, O(h) space.',
  walk: ['Use a stack and a cursor node = root.', 'Push the cursor and go left until there is nothing left.', 'Pop a node, decrement k; if k is 0, return its value.', 'Move to the popped node’s right child and repeat.'],
  edge: ['k = 1 (the leftmost node).', 'k = n (the rightmost).', 'A tree that is a single chain.', 'k larger than n (returns None in this solution).'],
  works: ['The stack always holds the ancestors whose left subtree has been fully handled but who are not yet visited.', 'Popping yields nodes in sorted order, one per iteration.'],
  time: ['O(h + k)', 'Reach the leftmost node, then k visits.'],
  space: ['O(h)', 'The stack holds one root-to-node path.'],
  solution,
  cases,
  sig: 'def kth_smallest(root, k):\n    # return the k-th smallest value (1-indexed) in the BST\n    pass\n',
  harness,
  viz,
  fromArgs: ([level, k]) => ({ level, k }),
});
