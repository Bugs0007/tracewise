"""Trees: one spec per problem. Trees are level-order lists (None = missing child). The brute forces work on
nested tuples (value, left, right), a different representation from the TreeNode objects the solutions use."""
from collections import deque

TOPIC = "trees"


# ── tuple trees ──
def parse(level):
    if not level or level[0] is None:
        return None
    root = [level[0], None, None]
    q, i = deque([root]), 1
    while q and i < len(level):
        n = q.popleft()
        for side in (1, 2):
            if i < len(level):
                v = level[i]
                i += 1
                if v is not None:
                    n[side] = [v, None, None]
                    q.append(n[side])
    return freeze(root)


def freeze(t):
    return None if t is None else (t[0], freeze(t[1]), freeze(t[2]))


def to_level(t):
    out, q = [], deque([t])
    while q:
        n = q.popleft()
        if n is None:
            out.append(None)
        else:
            out.append(n[0])
            q.append(n[1])
            q.append(n[2])
    while out and out[-1] is None:
        out.pop()
    return out


def nodes(t):
    return [] if t is None else [t] + nodes(t[1]) + nodes(t[2])


def inorder(t):
    return [] if t is None else inorder(t[1]) + [t[0]] + inorder(t[2])


def preorder(t):
    return [] if t is None else [t[0]] + preorder(t[1]) + preorder(t[2])


def rand_tree(r, n, lo=-5, hi=9):
    if n == 0:
        return None
    left = r.randint(0, n - 1)
    return (r.randint(lo, hi), rand_tree(r, left, lo, hi), rand_tree(r, n - 1 - left, lo, hi))


def rand_level(r, nmax=9, lo=-5, hi=9):
    return to_level(rand_tree(r, r.randint(0, nmax), lo, hi))


def bst_insert(t, v):
    if t is None:
        return (v, None, None)
    return (t[0], bst_insert(t[1], v), t[2]) if v < t[0] else (t[0], t[1], bst_insert(t[2], v))


def rand_bst(r, n, span=40):
    t = None
    for v in r.sample(range(-span, span), n):
        t = bst_insert(t, v)
    return t


def rand_bst_level(r, nmin=1, nmax=9):
    return to_level(rand_bst(r, r.randint(nmin, nmax)))


def rand_distinct_tree(r, n):
    vals = r.sample(range(-30, 60), n)

    def go(k):
        if k == 0:
            return None
        left = r.randint(0, k - 1)
        v = vals.pop()
        return (v, go(left), go(k - 1 - left))

    return go(n)


# ── Invert ──
def mirror(t):
    return None if t is None else (t[0], mirror(t[2]), mirror(t[1]))


invert_brute = lambda level: to_level(mirror(parse(level)))  # noqa: E731


# ── Maximum depth (BFS by levels) ──
def depth_brute(level):
    t, d = parse(level), 0
    row = [t] if t else []
    while row:
        d += 1
        row = [c for n in row for c in (n[1], n[2]) if c]
    return d


# ── Diameter: the longest path between any two nodes ──
def adjacency(t):
    ns, idx, adj = nodes(t), {}, {}
    for i, n in enumerate(ns):
        idx[id(n)] = i
        adj[i] = []
    for n in ns:
        for c in (n[1], n[2]):
            if c:
                adj[idx[id(n)]].append(idx[id(c)])
                adj[idx[id(c)]].append(idx[id(n)])
    return ns, adj


def diameter_brute(level):
    t = parse(level)
    if t is None:
        return 0
    ns, adj = adjacency(t)
    best = 0
    for s in adj:
        dist, q = {s: 0}, deque([s])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v not in dist:
                    dist[v] = dist[u] + 1
                    q.append(v)
        best = max(best, max(dist.values()))
    return best


# ── Balanced ──
def h(t):
    return 0 if t is None else 1 + max(h(t[1]), h(t[2]))


def balanced_brute(level):
    return all(abs(h(n[1]) - h(n[2])) <= 1 for n in nodes(parse(level)))


# ── Same tree / subtree ──
same_brute = lambda a, b: parse(a) == parse(b)  # noqa: E731


def subtrees(t):
    return [] if t is None else [t] + subtrees(t[1]) + subtrees(t[2])


def subtree_brute(a, b):
    return parse(b) in subtrees(parse(a))


def subtree_gen(r):
    a = rand_level(r, 8, 0, 3)
    t = parse(a)
    if t and r.random() < 0.6:
        b = to_level(r.choice(subtrees(t)))
    else:
        b = to_level(rand_tree(r, r.randint(1, 3), 0, 3))
    return [a, b]


# ── LCA in a BST ──
def path_to(t, v):
    out = []
    while t:
        out.append(t[0])
        if v == t[0]:
            return out
        t = t[1] if v < t[0] else t[2]
    return out


def lca_brute(level, p, q):
    t = parse(level)
    a, b = path_to(t, p), path_to(t, q)
    last = None
    for x, y in zip(a, b):
        if x != y:
            break
        last = x
    return last


def lca_gen(r):
    level = rand_bst_level(r)
    vals = inorder(parse(level))
    return [level, r.choice(vals), r.choice(vals)]


# ── Level order / right side view ──
def by_depth(t, d=0, acc=None):
    acc = {} if acc is None else acc
    if t:
        acc.setdefault(d, []).append(t[0])
        by_depth(t[1], d + 1, acc)
        by_depth(t[2], d + 1, acc)
    return acc


def levels_brute(level):
    acc = by_depth(parse(level))
    return [acc[d] for d in sorted(acc)]


def right_brute(level):
    return [row[-1] for row in levels_brute(level)]


# ── Good nodes ──
def good_brute(level):
    def go(t, path):
        if t is None:
            return 0
        return (1 if all(t[0] >= v for v in path) else 0) + go(t[1], path + [t[0]]) + go(t[2], path + [t[0]])

    return go(parse(level), [])


# ── Validate BST ──
def valid_brute(level):
    v = inorder(parse(level))
    return all(a < b for a, b in zip(v, v[1:]))


def valid_gen(r):
    t = rand_bst(r, r.randint(0, 8))
    level = to_level(t)
    if level and r.random() < 0.6:
        level[r.randrange(len(level))] = r.choice([x for x in range(-45, 45)])
        level = [x for x in level]
    return [level]


# ── Kth smallest in a BST ──
def kth_brute(level, k):
    return sorted(inorder(parse(level)))[k - 1]


def kth_gen(r):
    level = rand_bst_level(r)
    return [level, r.randint(1, len(inorder(parse(level))))]


# ── Construct from preorder and inorder ──
def construct_brute(pre, ino):
    def go(pre, ino):
        if not pre:
            return None
        i = ino.index(pre[0])
        return (pre[0], go(pre[1 : i + 1], ino[:i]), go(pre[i + 1 :], ino[i + 1 :]))

    return to_level(go(pre, ino))


def construct_gen(r):
    t = rand_distinct_tree(r, r.randint(0, 8))
    return [preorder(t), inorder(t)]


def orders(level):
    t = parse(level)
    return [preorder(t), inorder(t)]


# ── Max path sum ──
def maxpath_brute(level):
    t = parse(level)
    ns, adj = adjacency(t)
    best = None
    for s in adj:
        stack = [(s, -1, ns[s][0])]
        while stack:
            u, parent, total = stack.pop()
            best = total if best is None else max(best, total)
            for v in adj[u]:
                if v != parent:
                    stack.append((v, u, total + ns[v][0]))
    return best


def maxpath_gen(r):
    t = rand_tree(r, r.randint(1, 8), -9, 9)
    return [to_level(t)]


# ── Codec: a serialize / deserialize round trip returns the same tree ──
codec_brute = lambda level: to_level(parse(level))  # noqa: E731


def codec_gen(r):
    return [rand_level(r, 9, -9, 9)]


SPEC = {
    "invert-binary-tree": dict(
        fn="invert_tree", brute=invert_brute, gen=lambda r: [rand_level(r)],
        cases=[
            ("full tree", [[4, 2, 7, 1, 3, 6, 9]]),
            ("skewed left", [[5, 3, None, 2, None, 1]]),
            ("single node", [[8]]),
            ("empty", [[]]),
            ("only a right child", [[1, None, 2]]),
            ("uneven", [[10, 5, 15, None, 7, 12, None, None, None, 6]]),
        ],
    ),
    "maximum-depth-of-binary-tree": dict(
        fn="max_depth", brute=depth_brute, gen=lambda r: [rand_level(r)],
        cases=[
            ("three levels", [[3, 9, 20, None, None, 15, 7]]),
            ("single node", [[1]]),
            ("empty", [[]]),
            ("long left chain", [[1, 2, None, 3, None, 4, None, 5]]),
            ("long right chain", [[1, None, 2, None, 3]]),
            ("balanced", [[1, 2, 3, 4, 5, 6, 7]]),
        ],
    ),
    "diameter-of-binary-tree": dict(
        fn="diameter_of_binary_tree", brute=diameter_brute, gen=lambda r: [rand_level(r)],
        cases=[
            ("path through the root", [[1, 2, 3, 4, 5]]),
            ("single node", [[1]]),
            ("empty", [[]]),
            ("longest path avoids the root", [[1, 2, None, 3, 4, 5, None, None, None, 6]]),
            ("two nodes", [[1, 2]]),
            ("chain", [[1, None, 2, None, 3, None, 4]]),
            ("bushy", [[1, 2, 3, 4, 5, 6, 7, 8, 9]]),
        ],
    ),
    "balanced-binary-tree": dict(
        fn="is_balanced", brute=balanced_brute, gen=lambda r: [rand_level(r, 10)],
        cases=[
            ("balanced", [[3, 9, 20, None, None, 15, 7]]),
            ("unbalanced leaf chain", [[1, 2, 2, 3, 3, None, None, 4, 4]]),
            ("empty", [[]]),
            ("single node", [[1]]),
            ("two nodes", [[1, 2]]),
            ("three-node chain", [[1, 2, None, 3]]),
            ("balanced at root, not below", [[1, 2, 3, 4, None, None, 5, 6]]),
        ],
    ),
    "same-tree": dict(
        fn="is_same_tree", brute=same_brute, gen=lambda r: ([a := rand_level(r, 6, 0, 2), a if r.random() < 0.5 else rand_level(r, 6, 0, 2)]),
        cases=[
            ("identical", [[1, 2, 3], [1, 2, 3]]),
            ("different shape", [[1, 2], [1, None, 2]]),
            ("different value", [[1, 2, 1], [1, 1, 2]]),
            ("both empty", [[], []]),
            ("one empty", [[1], []]),
            ("single equal nodes", [[7], [7]]),
            ("deeper difference", [[1, 2, 3, 4], [1, 2, 3, 5]]),
        ],
    ),
    "subtree-of-another-tree": dict(
        fn="is_subtree", brute=subtree_brute, gen=subtree_gen,
        cases=[
            ("exact subtree", [[3, 4, 5, 1, 2], [4, 1, 2]]),
            ("extra node below breaks the match", [[3, 4, 5, 1, 2, None, None, 0], [4, 1, 2]]),
            ("whole tree", [[1, 2, 3], [1, 2, 3]]),
            ("single leaf", [[1, 2, 3], [3]]),
            ("not present", [[1, 2, 3], [2, 4]]),
            ("matching values but different shape", [[1, 1], [1]]),
            ("deeper match", [[5, 4, 6, 3, 2, None, None, 1], [3, 1]]),
        ],
    ),
    "lowest-common-ancestor-of-a-binary-search-tree": dict(
        fn="lowest_common_ancestor", brute=lca_brute, gen=lca_gen,
        cases=[
            ("on both sides of the root", [[6, 2, 8, 0, 4, 7, 9, None, None, 3, 5], 2, 8]),
            ("one is an ancestor of the other", [[6, 2, 8, 0, 4, 7, 9, None, None, 3, 5], 2, 4]),
            ("deep pair", [[6, 2, 8, 0, 4, 7, 9, None, None, 3, 5], 3, 5]),
            ("same node twice", [[6, 2, 8], 8, 8]),
            ("two nodes", [[5, 3], 3, 5]),
            ("root and leaf", [[10, 5, 15, 3, 7], 10, 7]),
            ("right side", [[10, 5, 15, None, None, 12, 20], 12, 20]),
        ],
    ),
    "binary-tree-level-order-traversal": dict(
        fn="level_order", brute=levels_brute, gen=lambda r: [rand_level(r)],
        cases=[
            ("three levels", [[3, 9, 20, None, None, 15, 7]]),
            ("single node", [[1]]),
            ("empty", [[]]),
            ("left chain", [[1, 2, None, 3]]),
            ("complete", [[1, 2, 3, 4, 5, 6, 7]]),
            ("sparse", [[1, None, 2, None, 3, 4]]),
        ],
    ),
    "binary-tree-right-side-view": dict(
        fn="right_side_view", brute=right_brute, gen=lambda r: [rand_level(r)],
        cases=[
            ("left branch is deeper", [[1, 2, 3, 4]]),
            ("typical", [[1, 2, 3, None, 5, None, 4]]),
            ("single node", [[1]]),
            ("empty", [[]]),
            ("only right children", [[1, None, 3]]),
            ("left chain is visible", [[1, 2, None, 3, None, 4]]),
            ("complete", [[1, 2, 3, 4, 5, 6, 7]]),
        ],
    ),
    "count-good-nodes-in-binary-tree": dict(
        fn="good_nodes", brute=good_brute, gen=lambda r: [rand_level(r, 9, -4, 6)],
        cases=[
            ("mixed", [[3, 1, 4, 3, None, 1, 5]]),
            ("only the root is good", [[5, 3, 2, 1]]),
            ("single node", [[7]]),
            ("all good", [[1, 2, 3, 4, 5]]),
            ("negative values", [[-1, -2, -3, -4]]),
            ("equal values count as good", [[2, 2, 2]]),
            ("deeper", [[3, 3, None, 4, 2]]),
        ],
    ),
    "validate-binary-search-tree": dict(
        fn="is_valid_bst", brute=valid_brute, gen=valid_gen,
        cases=[
            ("valid", [[8, 4, 12, 2, 6, 10, 14]]),
            ("right child smaller than root", [[5, 1, 4, None, None, 3, 6]]),
            ("deep violation", [[10, 5, 15, None, None, 6, 20]]),
            ("single node", [[1]]),
            ("empty", [[]]),
            ("equal values are invalid", [[2, 2, 2]]),
            ("valid skewed", [[3, 2, None, 1]]),
        ],
    ),
    "kth-smallest-element-in-a-bst": dict(
        fn="kth_smallest", brute=kth_brute, gen=kth_gen,
        cases=[
            ("first", [[5, 3, 8, 2, 4, 7, 9], 1]),
            ("middle", [[5, 3, 8, 2, 4, 7, 9], 4]),
            ("last", [[5, 3, 8, 2, 4, 7, 9], 7]),
            ("single node", [[6], 1]),
            ("skewed", [[4, 3, None, 2, None, 1], 3]),
            ("two nodes", [[2, 1], 2]),
        ],
    ),
    "construct-binary-tree-from-preorder-and-inorder-traversal": dict(
        fn="build_tree", brute=construct_brute, gen=construct_gen,
        cases=[
            ("full tree", orders([4, 2, 6, 1, 3, 5, 7])),
            ("single node", [[9], [9]]),
            ("empty", [[], []]),
            ("left chain", orders([3, 2, None, 1])),
            ("right chain", orders([1, None, 2, None, 3])),
            ("uneven", orders([10, 5, 15, None, 7, 12, None, None, None, 6])),
            ("two nodes", orders([1, 2])),
        ],
    ),
    "binary-tree-maximum-path-sum": dict(
        fn="max_path_sum", brute=maxpath_brute, gen=maxpath_gen,
        cases=[
            ("path through the root", [[1, 2, 3]]),
            ("negative root", [[-10, 9, 20, None, None, 15, 7]]),
            ("single negative node", [[-3]]),
            ("all negative", [[-2, -1, -5]]),
            ("path avoids the root", [[-5, 8, -4, 6, 7]]),
            ("chain", [[2, None, 3, None, -1, None, 4]]),
            ("larger", [[5, 4, 8, 11, None, 13, 4, 7, 2, None, None, None, 1]]),
        ],
    ),
    "serialize-and-deserialize-binary-tree": dict(
        fn="Codec", brute=codec_brute, gen=codec_gen,
        cases=[
            ("typical", [[1, 2, 3, None, None, 4, 5]]),
            ("empty", [[]]),
            ("single node", [[7]]),
            ("negative values", [[-1, -2, -3, -4]]),
            ("left chain", [[1, 2, None, 3, None, 4]]),
            ("right chain", [[1, None, 2, None, 3]]),
            ("larger values", [[100, 250, -300, 1000]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
