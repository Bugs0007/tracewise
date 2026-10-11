# Provided for you: the list node class and helpers that build and read lists (the tests use them too).
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def build(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head


def to_list(head, limit=10000):
    out = []
    while head and len(out) < limit:
        out.append(head.val)
        head = head.next
    return out


def adapter(fn, values, pos):
    head = build(values)
    if pos >= 0:
        nodes = []
        node = head
        while node:
            nodes.append(node)
            node = node.next
        nodes[-1].next = nodes[pos]  # the tail points back to position pos
    return fn(head)
