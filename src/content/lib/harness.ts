// Hidden Python helpers prepended to tasks (TaskBase.harness) so tests can pass
// plain JSON while learners work with real node objects.

/** Linked lists. Adapters: run_list (returns list as array), run_list_value (returns fn's raw value). */
export const LIST_HARNESS = `
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _build(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    return head

def _to_list(node, limit=10000):
    out = []
    while node is not None and len(out) < limit:
        out.append(node.val)
        node = node.next
    return out

def run_list(fn, vals):
    return _to_list(fn(_build(vals)))

def run_list_value(fn, vals):
    return fn(_build(vals))

def run_two_lists(fn, a, b):
    return _to_list(fn(_build(a), _build(b)))
`;

/**
 * Binary trees from LeetCode-style level-order arrays (None for gaps).
 * Adapters: run_tree (fn(root) -> value), run_tree_tree (fn(root) -> tree, returned as level order),
 * run_tree_args (fn(root, *rest) -> value), run_tree_tree_args (fn(root, *rest) -> tree as level order).
 */
export const TREE_HARNESS = `
from collections import deque as _deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _build_tree(level):
    if not level or level[0] is None:
        return None
    root = TreeNode(level[0])
    q = _deque([root])
    i = 1
    while q and i < len(level):
        node = q.popleft()
        if i < len(level) and level[i] is not None:
            node.left = TreeNode(level[i])
            q.append(node.left)
        i += 1
        if i < len(level) and level[i] is not None:
            node.right = TreeNode(level[i])
            q.append(node.right)
        i += 1
    return root

def _tree_to_level(root):
    out = []
    q = _deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        q.append(node.left)
        q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def run_tree(fn, level):
    return fn(_build_tree(level))

def run_tree_args(fn, level, *rest):
    return fn(_build_tree(level), *rest)

def run_tree_tree(fn, level):
    return _tree_to_level(fn(_build_tree(level)))

def run_tree_tree_args(fn, level, *rest):
    return _tree_to_level(fn(_build_tree(level), *rest))
`;

/**
 * Replays a list of operations against a class (design questions: LRU cache, MinStack, Trie...).
 * Test args: [ops, params] e.g. [["MinStack","push","getMin"], [[], [3], []]] -> returns list of results (None for constructors/void).
 * Adapter: run_ops. fnName must be the class name.
 */
export const OPS_HARNESS = `
def run_ops(cls, ops, params):
    out = []
    obj = None
    for op, args in zip(ops, params):
        if obj is None:
            obj = cls(*args)
            out.append(None)
        else:
            out.append(getattr(obj, op)(*args))
    return out
`;
