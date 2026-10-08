import { Recorder } from '@/engine/recorder';
import { buildTree, treeToLevel, type BTNode } from '@/engine/layout';
import type { ListPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { TREE_HARNESS } from '@/content/lib/harness';
import { checkBst, edgeKey, levelOf, parseTree, treePanel, type Level } from '@/content/lib/trees-1';

const code = `
def delete_node(root, key):
    if root is None:
        return None                                     #@base
    if key < root.val:                                  #@lt
        root.left = delete_node(root.left, key)        #@goL
    elif key > root.val:                                #@gt
        root.right = delete_node(root.right, key)      #@goR
    else:
        if root.left is None:                           #@noL
            return root.right                           #@retR
        if root.right is None:                          #@noR
            return root.left                            #@retL
        succ = root.right                               #@succ
        while succ.left:                                #@succLoop
            succ = succ.left                            #@succStep
        root.val = succ.val                             #@copy
        root.right = delete_node(root.right, succ.val)  #@delSucc
    return root                                         #@ret
`;

interface In {
  tree: Level;
  key: number;
}

const viz: VizDef<In> = {
  id: 'bst-delete',
  title: 'BST delete',
  code,
  language: 'python',
  inputs: [
    { key: 'tree', label: 'BST (level order, null = empty)', kind: 'numbers', default: [8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13], maxItems: 20, help: 'Must be a valid BST with no duplicates.' },
    { key: 'key', label: 'Value to delete', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Leaf', input: { key: 13 } },
    { label: 'One child', input: { key: 14 } },
    { label: 'Root (two children)', input: { key: 8 } },
    { label: 'Not present', input: { key: 5 } },
  ],
  run({ tree, key }) {
    const root0 = parseTree(tree);
    checkBst(root0);
    const r = new Recorder(code);
    let root: BTNode | null = root0;
    const calls: { id: string; label: string }[] = [];
    const onCall = new Set<string>();
    const edgeTones: Record<string, Tone> = {};
    let active: BTNode | null = null;
    let doomed: BTNode | null = null;
    let succNode: BTNode | null = null;
    let fresh: BTNode | null = null;
    let kase = 'searching';
    let target = key;

    const panels = () => {
      const stack: ListPanel = {
        type: 'list',
        title: 'Call stack',
        orientation: 'vertical',
        endLabel: 'top',
        items: calls.map((c, i) => ({ id: c.id, label: c.label, tone: i === calls.length - 1 ? 'active' : 'frontier' })),
      };
      return [
        treePanel(
          root,
          (n) => {
            if (n === doomed) return { tone: 'error', tags: ['remove'] };
            if (n === succNode) return { tone: 'compare', tags: ['succ'] };
            if (n === fresh) return { tone: 'new' };
            if (n === active) return { tone: 'active', tags: ['root'] };
            return { tone: onCall.has(n.id) ? 'visited' : 'default' };
          },
          edgeTones,
        ),
        stack,
        { type: 'kv' as const, title: 'Delete', entries: [{ k: 'key', v: key, tone: 'new' as Tone }, { k: 'case', v: kase }] },
      ];
    };
    const vars = () => ({ key: target, root: active ? active.val : null });

    const del = (node: BTNode | null, k: number): BTNode | null => {
      target = k;
      calls.push({ id: `c${calls.length}`, label: `delete_node(${node ? node.val : 'None'}, ${k})` });
      if (node) onCall.add(node.id);
      active = node;
      const leave = (res: BTNode | null) => {
        calls.pop();
        active = null;
        return res;
      };
      if (!node) {
        kase = 'not found';
        r.step('base', `Reached None: ${k} is not in the tree`, panels(), vars());
        return leave(null);
      }
      const v = node.val as number;
      r.op();
      if (k < v) {
        r.step('lt', `${k} < ${v} → delete from the left subtree`, panels(), vars());
        if (node.left) edgeTones[edgeKey(node, node.left)] = 'path';
        const old = node.left;
        const res = del(node.left, k);
        node.left = res;
        active = node;
        fresh = res !== old ? res : null;
        if (res && res !== old) edgeTones[edgeKey(node, res)] = 'new';
        r.step('goL', res !== old ? `Relink: ${v}.left = ${res ? res.val : 'None'}` : `${v}.left is unchanged`, panels(), vars());
        fresh = null;
        return leave(node);
      }
      if (k > v) {
        r.step('gt', `${k} > ${v} → delete from the right subtree`, panels(), vars());
        if (node.right) edgeTones[edgeKey(node, node.right)] = 'path';
        const old = node.right;
        const res = del(node.right, k);
        node.right = res;
        active = node;
        fresh = res !== old ? res : null;
        if (res && res !== old) edgeTones[edgeKey(node, res)] = 'new';
        r.step('goR', res !== old ? `Relink: ${v}.right = ${res ? res.val : 'None'}` : `${v}.right is unchanged`, panels(), vars());
        fresh = null;
        return leave(node);
      }
      doomed = node;
      if (!node.left) {
        kase = node.right ? 'one child' : 'leaf';
        r.step('retR', node.right ? `Found ${v}: no left child → return its right child ${node.right.val}` : `Found ${v}: a leaf → return None, the parent drops it`, panels(), vars());
        doomed = null;
        return leave(node.right);
      }
      if (!node.right) {
        kase = 'one child';
        r.step('retL', `Found ${v}: no right child → return its left child ${node.left.val}`, panels(), vars());
        doomed = null;
        return leave(node.left);
      }
      kase = 'two children';
      let succ: BTNode = node.right;
      succNode = succ;
      r.step('succ', `${v} has two children: successor = smallest value on its right side`, panels(), vars());
      while (succ.left) {
        succ = succ.left;
        succNode = succ;
        r.op();
        r.step('succStep', `Keep going left: succ = ${succ.val}`, panels(), vars());
      }
      r.step('succLoop', `${succ.val} has no left child: it is the inorder successor`, panels(), vars());
      doomed = null;
      node.val = succ.val;
      fresh = node;
      r.op();
      r.step('copy', `Copy ${succ.val} into the node (it held ${v}); ${succ.val} now appears twice`, panels(), vars());
      fresh = null;
      doomed = succ;
      const old = node.right;
      r.step('delSucc', `Now delete the original ${succ.val} from the right subtree`, panels(), vars());
      doomed = null;
      succNode = null;
      const res = del(node.right, succ.val as number);
      node.right = res;
      active = node;
      fresh = res !== old ? res : null;
      r.step('delSucc', res !== old ? `Relink: ${node.val}.right = ${res ? res.val : 'None'}` : `${node.val}.right is unchanged`, panels(), vars());
      fresh = null;
      return leave(node);
    };

    root = del(root0, key);
    onCall.clear();
    for (const k of Object.keys(edgeTones)) delete edgeTones[k];
    kase = kase === 'not found' ? 'not found' : 'done';
    r.step('ret', kase === 'not found' ? `${key} was not in the tree: nothing changed` : `Return the root: ${key} is gone, BST order intact`, panels(), { key });
    return { frames: r.frames, result: levelOf(root) };
  },
  reference({ tree, key }) {
    let root = buildTree(tree);
    let parent: BTNode | null = null;
    let cur: BTNode | null = root;
    let isLeft = false;
    while (cur && cur.val !== key) {
      parent = cur;
      isLeft = key < (cur.val as number);
      cur = isLeft ? cur.left : cur.right;
    }
    if (!cur) return treeToLevel(root);
    const replace = (n: BTNode | null) => {
      if (!parent) root = n;
      else if (isLeft) parent.left = n;
      else parent.right = n;
    };
    if (!cur.left) replace(cur.right);
    else if (!cur.right) replace(cur.left);
    else {
      let sp: BTNode = cur;
      let s: BTNode = cur.right;
      while (s.left) {
        sp = s;
        s = s.left;
      }
      cur.val = s.val;
      if (sp === cur) sp.right = s.right;
      else sp.left = s.right;
    }
    return treeToLevel(root);
  },
};

const T = [5, 3, 6, 2, 4, null, 7];
const tests = [
  { args: [T, 3], expected: [5, 4, 6, 2, null, null, 7], name: 'two children (successor 4)' },
  { args: [T, 5], expected: [6, 3, 7, 2, 4], name: 'root with two children' },
  { args: [T, 7], expected: [5, 3, 6, 2, 4], name: 'leaf' },
  { args: [T, 6], expected: [5, 3, 7, 2, 4], name: 'one child (right)' },
  { args: [[5, 3, null, 2], 3], expected: [5, 2], name: 'one child (left)' },
  { args: [T, 10], expected: T, name: 'key not present' },
  { args: [[8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13], 3], expected: [8, 4, 10, 1, 6, null, 14, null, null, null, 7, 13], name: 'successor deeper in the right side' },
  { args: [[5], 5], expected: [], name: 'delete the only node' },
  { args: [[], 1], expected: [], name: 'empty tree' },
];

const unit: Unit = {
  id: 'bst-delete',
  hook: 'Delete is the hardest BST operation and a favourite interview question, because the node you remove can sit anywhere. Handling its three cases cleanly shows you understand how the ordering rule is kept after the structure changes.',
  predict: {
    prompt: 'You delete the root 5 of the BST [5, 3, 8, 2, 4, 6, 9] (3 and 8 are its children; 6 and 9 are 8\'s children). Which value takes the root\'s place?',
    options: ['3, the left child', '6, the smallest value in the right subtree', '8, the right child', '9, the largest value in the right subtree'],
    answer: 1,
    explain: 'The replacement must be larger than everything on the left and smaller than everything on the right. The next larger value after 5 is the inorder successor: the leftmost node of the right subtree, here 6.',
  },
  viz,
  deeper: {
    points: [
      'Search for the key first, exactly like BST search. Each recursive call returns the (possibly new) root of its subtree, and the parent relinks it.',
      '**Leaf:** return None, the parent forgets it. **One child:** return that child, it takes the node\'s place. **Two children:** cannot simply remove the node.',
      'Two children: copy the **inorder successor** (smallest value in the right subtree) into the node, then delete that successor from the right subtree. The successor has no left child, so that second delete is an easy case.',
      'The inorder predecessor (largest value on the left) works just as well. Either keeps the BST ordering intact.',
      'The "return the new subtree root" pattern is why every line is `root.left = delete_node(root.left, ...)`. Without the assignment the tree never changes.',
    ],
    complexity: { time: 'O(h)  (O(log n) balanced, O(n) skewed)', space: 'O(h) recursion' },
    pitfalls: ['Deleting the successor from the wrong side: it lives in the **right** subtree, so recurse on `root.right`', 'Calling `delete_node(root.left, key)` without assigning the result back', 'Forgetting that the root itself can be the node to delete (the function must return the new root)'],
  },
  practice: {
    language: 'python',
    fnName: 'delete_node',
    statement: 'Delete `key` from a binary search tree (values are distinct) and return the root of the resulting tree. For a node with two children, replace its value with its inorder successor, then delete that successor.',
    signature: 'def delete_node(root, key):',
    solution: `def delete_node(root, key):
    if root is None:
        return @@None@@
    if key < root.val:
        root.left = @@delete_node(root.left, key)@@
    elif key > root.val:
        root.right = delete_node(root.right, key)
    else:
        if root.left is None:
            return @@root.right@@
        if root.right is None:
            return @@root.left@@
        succ = root.right
        while @@succ.left@@:
            succ = succ.left
        root.val = @@succ.val@@
        root.right = @@delete_node(root.right, succ.val)@@
    return root`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
  },
  debug: {
    language: 'python',
    fnName: 'delete_node',
    statement: 'Deleting a node with two children leaves a duplicate value in the tree. Find the bug.',
    buggy: `def delete_node(root, key):
    if root is None:
        return None
    if key < root.val:
        root.left = delete_node(root.left, key)
    elif key > root.val:
        root.right = delete_node(root.right, key)
    else:
        if root.left is None:
            return root.right
        if root.right is None:
            return root.left
        succ = root.right
        while succ.left:
            succ = succ.left
        root.val = succ.val
        root.left = delete_node(root.left, succ.val)
    return root`,
    fixed: `def delete_node(root, key):
    if root is None:
        return None
    if key < root.val:
        root.left = delete_node(root.left, key)
    elif key > root.val:
        root.right = delete_node(root.right, key)
    else:
        if root.left is None:
            return root.right
        if root.right is None:
            return root.left
        succ = root.right
        while succ.left:
            succ = succ.left
        root.val = succ.val
        root.right = delete_node(root.right, succ.val)
    return root`,
    tests,
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
    bugType: 'successor removed from the wrong subtree',
    hint: 'After copying the successor\'s value into the node, in which subtree does the original successor node still live?',
    explanation: 'The inorder successor is the leftmost node of the **right** subtree. The buggy line searches the left subtree for that value, finds nothing, and leaves the original in place, so the value now appears twice. Recurse on `root.right`.',
  },
  boss: {
    title: 'Trim a BST to a range',
    statement: 'Given a BST and two bounds `low <= high`, remove every node whose value lies outside `[low, high]` while keeping the relative structure of the remaining nodes. Return the root of the trimmed tree (it may be a different node, or empty).',
    language: 'python',
    fnName: 'trim_bst',
    harness: TREE_HARNESS,
    adapter: 'run_tree_tree_args',
    starter: `def trim_bst(root, low, high):
    # your code here
    pass
`,
    solution: `def trim_bst(root, low, high):
    if root is None:
        return None
    if root.val < low:
        return trim_bst(root.right, low, high)
    if root.val > high:
        return trim_bst(root.left, low, high)
    root.left = trim_bst(root.left, low, high)
    root.right = trim_bst(root.right, low, high)
    return root`,
    tests: [
      { args: [[1, 0, 2], 1, 2], expected: [1, null, 2] },
      { args: [[3, 0, 4, null, 2, null, null, 1], 1, 3], expected: [3, 2, null, 1], name: 'root survives, subtrees reshaped' },
      { args: [[10, 5, 15, 3, 7, null, 18], 7, 15], expected: [10, 7, 15], name: 'both sides trimmed' },
      { args: [[5], 6, 8], expected: [], name: 'everything removed' },
      { args: [[5], 1, 9], expected: [5], name: 'nothing removed' },
      { args: [[2, 1, 3], 2, 2], expected: [2], name: 'range of one value' },
      { args: [[], 0, 1], expected: [], name: 'empty tree' },
    ],
    hints: ['If the current value is below `low`, the node and its entire left subtree are out. Which subtree could still contain valid values?', 'Recurse: `val < low` → return `trim(right)`; `val > high` → return `trim(left)`; otherwise keep the node and set `root.left` and `root.right` to the trimmed subtrees.'],
    combines: ['bst-delete', 'bst-search'],
  },
};

export default unit;
