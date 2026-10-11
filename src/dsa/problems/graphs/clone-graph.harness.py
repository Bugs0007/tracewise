# Provided for you: the graph node class. The tests build the graph from an adjacency list (node i has the value i + 1)
# and read your clone back as an adjacency list. If your clone reuses any original node, the check fails.
class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


def adapter(fn, adj):
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, nbrs in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in nbrs]
    original = {id(n) for n in nodes}
    clone = fn(nodes[0]) if nodes else fn(None)
    if clone is None:
        return []
    out, seen, stack = {}, set(), [clone]
    while stack:
        cur = stack.pop()
        if id(cur) in seen:
            continue
        if id(cur) in original:
            return "the clone reuses an original node"
        seen.add(id(cur))
        out[cur.val] = [n.val for n in cur.neighbors]
        stack.extend(cur.neighbors)
    return [out[k] for k in sorted(out)]
