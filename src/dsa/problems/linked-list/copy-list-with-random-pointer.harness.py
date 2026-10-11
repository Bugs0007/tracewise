# Provided for you: the node class and helpers (pairs are [value, index of the random target or None]).
class Node:
    def __init__(self, x, next=None, random=None):
        self.val = int(x)
        self.next = next
        self.random = random


def build(pairs):
    nodes = [Node(v) for v, _ in pairs]
    for i, (_, r) in enumerate(pairs):
        if i + 1 < len(nodes):
            nodes[i].next = nodes[i + 1]
        if r is not None:
            nodes[i].random = nodes[r]
    return nodes[0] if nodes else None


def to_pairs(head):
    order = []
    node = head
    while node:
        order.append(node)
        node = node.next
    index = {id(n): i for i, n in enumerate(order)}
    return [[n.val, index[id(n.random)] if n.random is not None else None] for n in order]


def adapter(fn, pairs):
    original = build(pairs)
    copy = fn(original)
    old, new = set(), set()
    for head, seen in ((original, old), (copy, new)):
        node = head
        while node:
            seen.add(id(node))
            node = node.next
    assert not (old & new), "the copy must not reuse any original node"
    return to_pairs(copy)
