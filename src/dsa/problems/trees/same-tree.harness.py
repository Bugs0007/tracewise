# Provided for you: the tree node class and helpers that build a tree from a level-order list and read one back
# (None marks a missing child). The tests use them too.
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def make_tree(level):
    if not level or level[0] is None:
        return None
    root = TreeNode(level[0])
    queue = [root]
    i = 1
    while queue and i < len(level):
        node = queue.pop(0)
        if i < len(level) and level[i] is not None:
            node.left = TreeNode(level[i])
            queue.append(node.left)
        i += 1
        if i < len(level) and level[i] is not None:
            node.right = TreeNode(level[i])
            queue.append(node.right)
        i += 1
    return root


def tree_to_level(root):
    out, queue = [], [root]
    while queue:
        node = queue.pop(0)
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def adapter(fn, a, b):
    return fn(make_tree(a), make_tree(b))
