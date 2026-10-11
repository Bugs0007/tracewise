"""Linked List: one spec per problem. Lists are passed as arrays; the harness builds and reads them."""
from collections import OrderedDict

TOPIC = "linked-list"


def vals(r, lo=0, hi=8, hi_val=9):
    return [r.randint(0, hi_val) for _ in range(r.randint(lo, hi))]


def sorted_vals(r, hi=6):
    return sorted(vals(r, 0, hi))


# ── reverse ──
def rev_brute(values):
    return values[::-1]


# ── merge two sorted ──
def merge_brute(a, b):
    return sorted(a + b)


# ── reorder ──
def reorder_brute(values):
    out, i, j = [], 0, len(values) - 1
    while i <= j:
        out.append(values[i])
        i += 1
        if i <= j:
            out.append(values[j])
            j -= 1
    return out


# ── remove nth from end ──
def rm_brute(values, n):
    out = list(values)
    del out[len(out) - n]
    return out


def rm_gen(r):
    v = vals(r, 1, 8)
    return [v, r.randint(1, len(v))]


# ── copy list with random pointer ──
def copy_brute(pairs):
    return [list(p) for p in pairs]


def copy_gen(r):
    n = r.randint(0, 6)
    return [[[r.randint(0, 9), r.choice([None] + list(range(n)))] for _ in range(n)]]


# ── add two numbers (digits stored least significant first) ──
def num(d):
    return sum(x * 10**i for i, x in enumerate(d))


def add_brute(a, b):
    n = num(a) + num(b)
    out = []
    while True:
        out.append(n % 10)
        n //= 10
        if n == 0:
            return out


def digits(r, lo=1, hi=6):
    d = [r.randint(0, 9) for _ in range(r.randint(lo, hi))]
    if len(d) > 1 and d[-1] == 0:
        d[-1] = r.randint(1, 9)
    return d


# ── cycle ──
def cyc_brute(values, pos):
    return pos >= 0


def cyc_gen(r):
    v = vals(r, 0, 7)
    return [v, r.randint(-1, len(v) - 1) if v else -1]


# ── find the duplicate ──
def dup_values(nums):
    return [x for x in set(nums) if nums.count(x) > 1]


def dup_brute(nums):
    d = dup_values(nums)
    assert len(d) == 1, "case needs exactly one repeated value"
    return d[0]


def dup_gen(r):
    n = r.randint(1, 8)
    return [[r.randint(1, n) for _ in range(n + 1)]]


def dup_check(args, got):
    return got in dup_values(args[0])


# ── LRU cache ──
class NaiveLRU:
    def __init__(self, cap):
        self.cap = cap
        self.d = OrderedDict()

    def get(self, k):
        if k not in self.d:
            return -1
        self.d.move_to_end(k)
        return self.d[k]

    def put(self, k, v):
        if k in self.d:
            self.d.move_to_end(k)
        self.d[k] = v
        if len(self.d) > self.cap:
            self.d.popitem(last=False)


def replay(cls):
    def run(ops, args):
        obj = cls(*args[0])
        out = [None]
        for op, a in zip(ops[1:], args[1:]):
            out.append(getattr(obj, op)(*a))
        return out

    return run


def lru_gen(r):
    ops, args = ["LRUCache"], [[r.randint(1, 3)]]
    for _ in range(r.randint(2, 14)):
        if r.random() < 0.55:
            ops.append("put")
            args.append([r.randint(1, 4), r.randint(10, 40)])
        else:
            ops.append("get")
            args.append([r.randint(1, 4)])
    return [ops, args]


def lru(cap, *calls):
    ops, args = ["LRUCache"], [[cap]]
    for c in calls:
        ops.append(c[0])
        args.append(list(c[1:]))
    return [ops, args]


# ── merge k sorted lists ──
def mk_brute(lists):
    return sorted(x for l in lists for x in l)


def mk_gen(r):
    return [[sorted_vals(r, 4) for _ in range(r.randint(0, 4))]]


# ── reverse nodes in k-group ──
def rk_brute(values, k):
    out = []
    for i in range(0, len(values), k):
        chunk = values[i : i + k]
        out += chunk[::-1] if len(chunk) == k else chunk
    return out


def rk_gen(r):
    v = vals(r, 0, 9)
    return [v, r.randint(1, 4)]


SPEC = {
    "reverse-linked-list": dict(
        fn="reverse_list", brute=rev_brute, gen=lambda r: [vals(r)],
        cases=[
            ("several nodes", [[4, 8, 15, 16, 23]]),
            ("two nodes", [[1, 2]]),
            ("single node", [[7]]),
            ("empty list", [[]]),
            ("repeated values", [[3, 3, 5, 3]]),
            ("long", [list(range(60))]),
        ],
    ),
    "merge-two-sorted-lists": dict(
        fn="merge_two_lists", brute=merge_brute, gen=lambda r: [sorted_vals(r), sorted_vals(r)],
        cases=[
            ("interleaving", [[1, 4, 9], [2, 3, 10]]),
            ("one empty", [[], [5, 6]]),
            ("both empty", [[], []]),
            ("all of one list first", [[1, 2, 3], [7, 8]]),
            ("duplicates across lists", [[2, 2, 5], [2, 5, 5]]),
            ("single and single", [[4], [3]]),
            ("long", [list(range(0, 100, 3)), list(range(1, 100, 4))]),
        ],
    ),
    "reorder-list": dict(
        fn="reorder_list", brute=reorder_brute, gen=lambda r: [vals(r)],
        cases=[
            ("even length", [[1, 2, 3, 4]]),
            ("odd length", [[1, 2, 3, 4, 5]]),
            ("single node", [[9]]),
            ("two nodes", [[3, 8]]),
            ("three nodes", [[1, 2, 3]]),
            ("empty", [[]]),
            ("long", [list(range(41))]),
        ],
    ),
    "remove-nth-node-from-end-of-list": dict(
        fn="remove_nth_from_end", brute=rm_brute, gen=rm_gen,
        cases=[
            ("middle node", [[10, 20, 30, 40, 50], 2]),
            ("remove the head", [[10, 20, 30], 3]),
            ("remove the tail", [[10, 20, 30], 1]),
            ("single node", [[5], 1]),
            ("two nodes, remove first", [[1, 2], 2]),
            ("two nodes, remove last", [[1, 2], 1]),
            ("long", [list(range(50)), 17]),
        ],
    ),
    "copy-list-with-random-pointer": dict(
        fn="copy_random_list", brute=copy_brute, gen=copy_gen,
        cases=[
            ("random pointers everywhere", [[[7, None], [13, 0], [11, 4], [10, 2], [1, 0]]]),
            ("no random pointers", [[[3, None], [4, None]]]),
            ("points at itself", [[[5, 0]]]),
            ("single node, no random", [[[9, None]]]),
            ("empty", [[]]),
            ("random points forward", [[[1, 2], [2, 2], [3, 0]]]),
            ("two nodes pointing at each other", [[[4, 1], [8, 0]]]),
        ],
    ),
    "add-two-numbers": dict(
        fn="add_two_numbers", brute=add_brute, gen=lambda r: [digits(r), digits(r)],
        cases=[
            ("with carries", [[2, 4, 3], [5, 6, 4]]),
            ("zeros", [[0], [0]]),
            ("different lengths", [[9, 9, 9, 9], [1]]),
            ("final carry adds a digit", [[9, 9], [1]]),
            ("one number is zero", [[0], [7, 3]]),
            ("no carry", [[1, 2], [3, 4]]),
            ("long", [[9] * 30, [1]]),
        ],
    ),
    "linked-list-cycle": dict(
        fn="has_cycle", brute=cyc_brute, gen=cyc_gen,
        cases=[
            ("tail loops to the middle", [[3, 2, 0, -4], 1]),
            ("tail loops to the head", [[1, 2], 0]),
            ("no cycle", [[1, 2, 3], -1]),
            ("single node, no cycle", [[1], -1]),
            ("single node loops to itself", [[1], 0]),
            ("empty", [[], -1]),
            ("long cycle", [list(range(50)), 7]),
            ("long, no cycle", [list(range(50)), -1]),
        ],
    ),
    "find-the-duplicate-number": dict(
        fn="find_duplicate", brute=dup_brute, gen=dup_gen, check=dup_check,
        cases=[
            ("repeated once", [[3, 1, 4, 2, 2]]),
            ("repeated several times", [[2, 2, 2, 2, 2]]),
            ("duplicate at the ends", [[1, 3, 4, 2, 1]]),
            ("smallest case", [[1, 1]]),
            ("larger", [[7, 2, 5, 3, 6, 1, 4, 5]]),
            ("three copies", [[4, 1, 3, 4, 2, 4]]),
            ("long", [list(range(1, 100)) + [57]]),
        ],
    ),
    "lru-cache": dict(
        fn="LRUCache", brute=replay(NaiveLRU), gen=lru_gen,
        cases=[
            ("evicts the least recently used", lru(2, ("put", 1, 10), ("put", 2, 20), ("get", 1), ("put", 3, 30), ("get", 2), ("get", 3), ("get", 1))),
            ("update refreshes recency", lru(2, ("put", 1, 1), ("put", 2, 2), ("put", 1, 5), ("put", 3, 3), ("get", 2), ("get", 1))),
            ("capacity one", lru(1, ("put", 1, 1), ("put", 2, 2), ("get", 1), ("get", 2))),
            ("miss on empty", lru(3, ("get", 9))),
            ("get refreshes recency", lru(2, ("put", 1, 1), ("put", 2, 2), ("get", 1), ("put", 3, 3), ("get", 2), ("get", 1), ("get", 3))),
            ("overwrite same key", lru(2, ("put", 1, 1), ("put", 1, 2), ("get", 1))),
            ("busy", lru(3, *[("put", i % 5, i) for i in range(12)], ("get", 4), ("get", 0), ("get", 1), ("get", 2), ("get", 3))),
        ],
    ),
    "merge-k-sorted-lists": dict(
        fn="merge_k_lists", brute=mk_brute, gen=mk_gen,
        cases=[
            ("three lists", [[[1, 4, 7], [2, 5, 8], [0, 9]]]),
            ("no lists", [[]]),
            ("all empty", [[[], [], []]]),
            ("one list", [[[3, 6, 9]]]),
            ("some empty", [[[], [2, 4], [], [1, 3]]]),
            ("duplicates", [[[1, 1, 2], [1, 2, 2], [2]]]),
            ("many short lists", [[[i] for i in range(20, 0, -1)]]),
            ("long", [[list(range(i, 100, 7)) for i in range(7)]]),
        ],
    ),
    "reverse-nodes-in-k-group": dict(
        fn="reverse_k_group", brute=rk_brute, gen=rk_gen,
        cases=[
            ("k = 2, odd length", [[1, 2, 3, 4, 5], 2]),
            ("k = 3, leftover stays", [[1, 2, 3, 4, 5], 3]),
            ("k = 1 changes nothing", [[1, 2, 3], 1]),
            ("k equals the length", [[1, 2, 3, 4], 4]),
            ("k larger than the length", [[1, 2], 3]),
            ("empty", [[], 2]),
            ("single node", [[5], 1]),
            ("long", [list(range(40)), 6]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
