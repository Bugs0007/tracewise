import { Recorder } from '@/engine/recorder';
import type { BTNode } from '@/engine/layout';
import type { ListPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { edgeKey, fmtList, outputPanel, parseTree, ref, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
from collections import deque

def level_order(root):
    if not root:
        return []
    result = []
    queue = deque([root])                   #@init
    while queue:                            #@loop
        level = []
        for _ in range(len(queue)):         #@size
            node = queue.popleft()          #@pop
            level.append(node.val)          #@visit
            if node.left:
                queue.append(node.left)     #@pushL
            if node.right:
                queue.append(node.right)    #@pushR
        result.append(level)                #@level
    return result                           #@done
`;

interface In {
  tree: Level;
}

const viz: VizDef<In> = {
  id: 'tree-levelorder',
  title: 'Level-order traversal (queue)',
  code,
  language: 'python',
  inputs: [{ key: 'tree', label: 'Tree (level order, null = empty)', kind: 'numbers', default: [1, 2, 3, 4, 5, null, 6, 7], maxItems: 20, help: 'LeetCode style: [1, 2, 3, null, 4] means 3 is the right child of 1.' }],
  presets: [
    { label: 'Perfect tree', input: { tree: [1, 2, 3, 4, 5, 6, 7] } },
    { label: 'Right chain', input: { tree: [1, null, 2, null, 3] } },
    { label: 'Single node', input: { tree: [5] } },
  ],
  run({ tree }) {
    const root = parseTree(tree);
    const r = new Recorder(code);
    if (!root) {
      const p = [treePanel(root, () => undefined), outputPanel([], 'result')];
      r.step('init', 'Empty tree: return [] immediately', p, { result: '[]' });
      r.step('done', 'Level order: (empty)', p, { result: '[]' });
      r.step('done', 'Nothing to visit', p, { result: '[]' });
      return { frames: r.frames, result: [] };
    }
    const depth = new Map<string, number>([[root.id, 0]]);
    const queue: BTNode[] = [root];
    const result: number[][] = [];
    let level: number[] = [];
    let curDepth = 0;
    let node: BTNode | null = null;
    let size = 0;
    const walked: Record<string, Tone> = {};
    const doneDepth = new Set<number>();

    const panels = () => {
      const q: ListPanel = {
        type: 'list',
        title: 'Queue',
        orientation: 'horizontal',
        startLabel: 'front',
        endLabel: 'back',
        emptyText: 'empty',
        items: queue.map((n) => ({ id: n.id, label: String(n.val), tone: depth.get(n.id) === curDepth ? 'compare' : 'frontier', sub: `L${depth.get(n.id)}` })),
      };
      return [
        treePanel(
          root,
          (n) => {
            const d = depth.get(n.id);
            const tone: Tone = n === node ? 'active' : d !== undefined && doneDepth.has(d) ? 'done' : level.length && d === curDepth && !queue.includes(n) ? 'done' : queue.includes(n) ? (d === curDepth ? 'compare' : 'frontier') : 'default';
            return { tone, badge: d !== undefined && !queue.includes(n) && n !== node ? `L${d}` : undefined, tags: n === node ? ['node'] : undefined };
          },
          walked,
        ),
        q,
        outputPanel(level, 'level (being built)', level.length ? { [level.length - 1]: 'new' } : {}),
        outputPanel(result.map((l) => fmtList(l)), 'result (one entry per level)'),
      ];
    };
    const vars = () => ({ size, queue: fmtList(queue.map((n) => n.val)), level: fmtList(level) });

    r.step('init', `Queue starts with the root ${root.val}`, panels(), vars());
    while (queue.length) {
      curDepth = depth.get(queue[0].id)!;
      level = [];
      size = queue.length;
      r.step('size', `Level ${curDepth} has ${size} node${size === 1 ? '' : 's'} in the queue: take exactly ${size}`, panels(), vars());
      for (let i = 0; i < size; i++) {
        node = queue.shift()!;
        r.op();
        r.step('pop', `Dequeue ${node.val} from the front`, panels(), vars());
        level.push(node.val as number);
        r.step('visit', `Add ${node.val} to this level: ${fmtList(level)}`, panels(), vars());
        for (const [child, anchor] of [[node.left, 'pushL'], [node.right, 'pushR']] as const) {
          if (!child) continue;
          queue.push(child);
          depth.set(child.id, curDepth + 1);
          walked[edgeKey(node, child)] = 'frontier';
          r.step(anchor, `Enqueue child ${child.val} for level ${curDepth + 1}`, panels(), vars());
        }
      }
      node = null;
      result.push(level);
      doneDepth.add(curDepth);
      r.step('level', `Level ${curDepth} finished: result gets ${fmtList(level)}`, panels(), vars());
    }
    r.step('done', `Queue is empty: ${result.length} level${result.length === 1 ? '' : 's'}`, panels(), vars());
    return { frames: r.frames, result };
  },
  reference: ({ tree }) => ref.levels(tree),
};

const tests = [
  { args: [[3, 9, 20, null, null, 15, 7]], expected: [[3], [9, 20], [15, 7]] },
  { args: [[1, 2, 3, 4, 5, 6, 7]], expected: [[1], [2, 3], [4, 5, 6, 7]], name: 'perfect tree' },
  { args: [[1, null, 2, null, 3]], expected: [[1], [2], [3]], name: 'right-skewed' },
  { args: [[1, 2, null, 3]], expected: [[1], [2], [3]], name: 'left-skewed' },
  { args: [[1]], expected: [[1]], name: 'single node' },
  { args: [[]], expected: [], name: 'empty tree' },
];

const unit: Unit = {
  id: 'tree-levelorder',
  hook: 'Level-order is BFS on a tree and the base of a whole family of questions: right-side view, zigzag, minimum depth, level averages. The trick interviewers look for is grouping the output by level.',
  predict: {
    prompt: 'Children are appended to the same queue while a level is being processed. Why does the code read `len(queue)` once, before the inner loop?',
    options: ['To know how many nodes belong to the current level, because the queue soon also holds the next one', 'Because `deque` raises an error if its length changes during a loop', 'It makes the traversal faster', 'To stop the loop from visiting leaf nodes'],
    answer: 0,
    explain: 'When a level starts, the queue contains exactly that level. As we dequeue them we append their children, so the queue grows. Capturing the size first tells us where the level ends.',
  },
  viz,
  deeper: {
    points: [
      'A queue (FIFO) hands nodes back in the order they were discovered, which is level by level and left to right.',
      'Snapshot `len(queue)` at the start of every round: that many pops form one level.',
      'Without the size trick you still get the right visiting order, only a flat list. The size is what groups it.',
      'The same loop answers many questions: last node of each level (right side view), alternate direction (zigzag), first leaf reached (minimum depth).',
      'Use `collections.deque`: `list.pop(0)` shifts every element and is O(n) per pop.',
    ],
    complexity: { time: 'O(n)', space: 'O(w)  (w = widest level, up to n/2)' },
    pitfalls: ['Using `queue.pop()` (takes from the back: that is a stack, not a queue)', 'Calling `len(queue)` inside the loop condition so the level boundary keeps moving', 'Forgetting the empty tree: `deque([None])` crashes on `.val`'],
  },
  practice: {
    language: 'python',
    fnName: 'level_order',
    statement: 'Return the values of a binary tree grouped by level, top to bottom and left to right: a list of lists. An empty tree gives [].',
    signature: 'def level_order(root):',
    solution: `from collections import deque

def level_order(root):
    if not root:
        return []
    result = []
    queue = @@deque([root])@@
    while @@queue@@:
        level = []
        for _ in range(@@len(queue)@@):
            node = @@queue.popleft()@@
            level.append(node.val)
            if @@node.left@@:
                queue.append(node.left)
            if node.right:
                queue.append(@@node.right@@)
        result.append(@@level@@)
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
  },
  debug: {
    language: 'python',
    fnName: 'level_order',
    statement: 'The levels come back in the wrong order inside each row (for example [3, 2] instead of [2, 3]). Fix it.',
    buggy: `from collections import deque

def level_order(root):
    if not root:
        return []
    result = []
    queue = deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.pop()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)
    return result`,
    fixed: `from collections import deque

def level_order(root):
    if not root:
        return []
    result = []
    queue = deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)
    return result`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    bugType: 'stack used instead of queue',
    hint: 'Children are added at the back of the deque. From which end must you take the next node?',
    explanation: '`deque.pop()` removes from the right end, the same end we append to, so the deque behaves like a stack and each level is read backwards. A queue removes from the front: `popleft()`.',
  },
  boss: {
    title: 'What the right side sees',
    statement: 'Imagine standing to the right of a binary tree. Return the values you can see from top to bottom: for each level, the value of its rightmost node. An empty tree gives [].',
    language: 'python',
    fnName: 'right_side_view',
    harness: TREE_HARNESS,
    adapter: 'run_tree',
    starter: `def right_side_view(root):
    # your code here
    pass
`,
    solution: `from collections import deque

def right_side_view(root):
    if not root:
        return []
    view = []
    queue = deque([root])
    while queue:
        size = len(queue)
        for i in range(size):
            node = queue.popleft()
            if i == size - 1:
                view.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return view`,
    tests: [
      { args: [[1, 2, 3, null, 5, null, 4]], expected: [1, 3, 4] },
      { args: [[1, 2, 3, 4]], expected: [1, 3, 4], name: 'deepest level only has a left node' },
      { args: [[1, 2]], expected: [1, 2], name: 'left child is visible' },
      { args: [[1, null, 3]], expected: [1, 3] },
      { args: [[5]], expected: [5], name: 'single node' },
      { args: [[]], expected: [], name: 'empty tree' },
    ],
    hints: ['Process the tree level by level. Which node of each level do you want to keep?', 'Use the size trick: inside the inner loop, when the index is the last of the level (`i == size - 1`), append that node\'s value to the answer.'],
    combines: ['tree-levelorder', 'bfs', 'queue-basics'],
  },
};

export default unit;
