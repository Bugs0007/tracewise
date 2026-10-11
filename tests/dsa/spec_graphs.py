"""Graphs: one spec per problem."""
from collections import deque
from itertools import permutations

TOPIC = "graphs"
INF = 2147483647
DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def inb(r, c, rows, cols):
    return 0 <= r < rows and 0 <= c < cols


def comps_of(grid):
    """Connected groups of cells with value 1, found with a union-find (a different method from the solution)."""
    rows, cols = len(grid), len(grid[0]) if grid else 0
    parent = {(r, c): (r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 1}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for (r, c) in list(parent):
        for dr, dc in ((1, 0), (0, 1)):
            if (r + dr, c + dc) in parent:
                parent[find((r, c))] = find((r + dr, c + dc))
    groups = {}
    for cell in parent:
        groups.setdefault(find(cell), []).append(cell)
    return list(groups.values())


def grid_gen(r, lo=1, hi=5):
    rows, cols = r.randint(lo, hi), r.randint(lo, hi)
    p = r.choice([0.3, 0.5, 0.7])
    return [[1 if r.random() < p else 0 for _ in range(cols)] for _ in range(rows)]


# ── Number of Islands / Max Area ──
def islands_brute(grid):
    return len(comps_of(grid)) if grid else 0


def islands_gen(r):
    return [grid_gen(r)]


def area_brute(grid):
    return max((len(g) for g in comps_of(grid)), default=0) if grid else 0


# ── Clone Graph ──
def clone_brute(adj):
    return [list(x) for x in adj]


def clone_gen(r):
    n = r.randint(1, 7)
    edges = {(min(i, j), max(i, j)) for i in range(2, n + 1) for j in [r.randint(1, i - 1)]}
    for _ in range(r.randint(0, 3)):
        a, b = r.randint(1, n), r.randint(1, n)
        if a != b:
            edges.add((min(a, b), max(a, b)))
    adj = [[] for _ in range(n)]
    for a, b in sorted(edges):
        adj[a - 1].append(b)
        adj[b - 1].append(a)
    return [[sorted(x) for x in adj]]


# ── Walls and Gates ──
def gates_brute(rooms):
    rows, cols = len(rooms), len(rooms[0])
    out = [row[:] for row in rooms]
    for r in range(rows):
        for c in range(cols):
            if rooms[r][c] != INF:
                continue
            seen, q, best = {(r, c)}, deque([(r, c, 0)]), INF
            while q:
                x, y, d = q.popleft()
                if rooms[x][y] == 0:
                    best = d
                    break
                for dr, dc in DIRS:
                    nx, ny = x + dr, y + dc
                    if inb(nx, ny, rows, cols) and (nx, ny) not in seen and rooms[nx][ny] != -1:
                        seen.add((nx, ny))
                        q.append((nx, ny, d + 1))
            out[r][c] = best
    return out


def gates_gen(r):
    rows, cols = r.randint(1, 5), r.randint(1, 5)
    return [[[r.choice([INF, INF, INF, -1, 0]) for _ in range(cols)] for _ in range(rows)]]


# ── Rotting Oranges ──
def rot_brute(grid):
    g = [row[:] for row in grid]
    rows, cols = len(g), len(g[0])
    minutes = 0
    while True:
        new = [row[:] for row in g]
        changed = False
        for r in range(rows):
            for c in range(cols):
                if g[r][c] == 1 and any(inb(r + dr, c + dc, rows, cols) and g[r + dr][c + dc] == 2 for dr, dc in DIRS):
                    new[r][c] = 2
                    changed = True
        if not changed:
            break
        g = new
        minutes += 1
    return -1 if any(1 in row for row in g) else minutes


def rot_gen(r):
    rows, cols = r.randint(1, 5), r.randint(1, 5)
    return [[[r.choice([0, 1, 1, 2]) for _ in range(cols)] for _ in range(rows)]]


# ── Pacific Atlantic ──
def pa_brute(heights):
    rows, cols = len(heights), len(heights[0])

    def reaches(r0, c0):
        seen, stack, p, a = {(r0, c0)}, [(r0, c0)], False, False
        while stack:
            r, c = stack.pop()
            if r == 0 or c == 0:
                p = True
            if r == rows - 1 or c == cols - 1:
                a = True
            for dr, dc in DIRS:
                nr, nc = r + dr, c + dc
                if inb(nr, nc, rows, cols) and (nr, nc) not in seen and heights[nr][nc] <= heights[r][c]:
                    seen.add((nr, nc))
                    stack.append((nr, nc))
        return p and a

    return [[r, c] for r in range(rows) for c in range(cols) if reaches(r, c)]


def pa_gen(r):
    rows, cols = r.randint(1, 5), r.randint(1, 5)
    return [[[r.randint(1, 6) for _ in range(cols)] for _ in range(rows)]]


# ── Surrounded Regions ──
def surr_brute(board):
    rows, cols = len(board), len(board[0])
    out = [row[:] for row in board]
    seen = set()
    for r in range(rows):
        for c in range(cols):
            if board[r][c] != "O" or (r, c) in seen:
                continue
            region, q, border = [(r, c)], deque([(r, c)]), False
            seen.add((r, c))
            while q:
                x, y = q.popleft()
                if x in (0, rows - 1) or y in (0, cols - 1):
                    border = True
                for dr, dc in DIRS:
                    nx, ny = x + dr, y + dc
                    if inb(nx, ny, rows, cols) and board[nx][ny] == "O" and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        region.append((nx, ny))
                        q.append((nx, ny))
            if not border:
                for x, y in region:
                    out[x][y] = "X"
    return out


def surr_gen(r):
    rows, cols = r.randint(1, 6), r.randint(1, 6)
    return [[[r.choice("XO") for _ in range(cols)] for _ in range(rows)]]


# ── Course Schedule / II ──
def sched_gen(r):
    n = r.randint(1, 6)
    pairs = set()
    for _ in range(r.randint(0, 8)):
        a, b = r.randrange(n), r.randrange(n)
        if a != b:
            pairs.add((a, b))
    return [n, [list(p) for p in sorted(pairs)]]


def valid_order(n, pre, order):
    if sorted(order) != list(range(n)):
        return False
    pos = {v: i for i, v in enumerate(order)}
    return all(pos[p] < pos[c] for c, p in pre)


def sched_brute(n, pre):
    return any(valid_order(n, pre, list(p)) for p in permutations(range(n)))


def order_brute(n, pre):
    for p in permutations(range(n)):
        if valid_order(n, pre, list(p)):
            return list(p)
    return []


def order_check(args, got):
    n, pre = args
    if sched_brute(n, pre):
        return valid_order(n, pre, got)
    return got == []


# ── Graph Valid Tree / Components / Redundant ──
def reach_count(n, edges):
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen, comps = set(), 0
    for s in range(n):
        if s in seen:
            continue
        comps += 1
        stack = [s]
        seen.add(s)
        while stack:
            x = stack.pop()
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
    return comps


def tree_brute(n, edges):
    return reach_count(n, edges) == 1 and len(edges) == n - 1


def comps_brute(n, edges):
    return reach_count(n, edges)


def graph_gen(r):
    n = r.randint(1, 7)
    edges = set()
    for _ in range(r.randint(0, n + 1)):
        a, b = r.randrange(n), r.randrange(n)
        if a != b:
            edges.add((min(a, b), max(a, b)))
    return [n, [list(e) for e in sorted(edges)]]


def tree_gen(r):
    n = r.randint(1, 7)
    edges = [[r.randrange(i), i] for i in range(1, n)]
    if r.random() < 0.4 and n > 2:
        edges.pop(r.randrange(len(edges)))
    if r.random() < 0.4 and n > 2:
        a, b = r.sample(range(n), 2)
        edges.append([a, b])
    r.shuffle(edges)
    return [n, edges]


def redundant_brute(edges):
    n = len(edges)
    for i in range(n - 1, -1, -1):
        rest = edges[:i] + edges[i + 1 :]
        adj = {v: [] for v in range(1, n + 1)}
        for a, b in rest:
            adj[a].append(b)
            adj[b].append(a)
        seen, stack = {1}, [1]
        while stack:
            x = stack.pop()
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        if len(seen) == n:
            return edges[i]
    return []


def redundant_gen(r):
    n = r.randint(3, 7)
    edges = [[r.randint(1, i - 1), i] for i in range(2, n + 1)]
    while True:
        a, b = r.sample(range(1, n + 1), 2)
        if [a, b] not in edges and [b, a] not in edges:
            edges.append([a, b])
            break
    r.shuffle(edges)
    return [edges]


# ── Word Ladder ──
def ladder_brute(begin, end, words):
    ws = set(words)
    if end not in ws:
        return 0
    q, seen = deque([(begin, 1)]), {begin}
    while q:
        w, d = q.popleft()
        if w == end:
            return d
        for other in list(ws):
            if other not in seen and sum(a != b for a, b in zip(w, other)) == 1:
                seen.add(other)
                q.append((other, d + 1))
    return 0


def ladder_gen(r):
    n = r.randint(2, 3)
    pool = {"".join(r.choice("abc") for _ in range(n)) for _ in range(r.randint(2, 9))}
    words = sorted(pool)
    begin = "".join(r.choice("abc") for _ in range(n))
    end = r.choice(words)
    if begin == end:
        end = words[0] if words[0] != begin else words[-1]
    return [begin, end, words]


G = [
    [1, 1, 0, 0, 0],
    [1, 1, 0, 0, 1],
    [0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0],
    [1, 0, 1, 0, 1],
]


def chain_pre(n):
    return [[i + 1, i] for i in range(n - 1)]


SPEC = {
    "number-of-islands": dict(
        fn="num_islands", brute=islands_brute, gen=islands_gen,
        cases=[
            ("four islands", [G]),
            ("one island", [[[1, 1], [1, 1]]]),
            ("no land", [[[0, 0, 0], [0, 0, 0]]]),
            ("diagonal land is not connected", [[[1, 0], [0, 1]]]),
            ("single cell land", [[[1]]]),
            ("single cell water", [[[0]]]),
            ("one row", [[[1, 0, 1, 1, 0, 1]]]),
            ("one column", [[[1], [1], [0], [1]]]),
            ("ring around water", [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]]),
        ],
    ),
    "max-area-of-island": dict(
        fn="max_area_of_island", brute=area_brute, gen=islands_gen,
        cases=[
            ("largest of several", [G]),
            ("whole grid", [[[1, 1], [1, 1]]]),
            ("no land", [[[0, 0]]]),
            ("diagonal land", [[[1, 0], [0, 1]]]),
            ("single cell", [[[1]]]),
            ("snake", [[[1, 1, 1], [0, 0, 1], [1, 1, 1]]]),
            ("two equal islands", [[[1, 0, 1], [1, 0, 1]]]),
            ("ring", [[[1, 1, 1], [1, 0, 1], [1, 1, 1]]]),
        ],
    ),
    "clone-graph": dict(
        fn="clone_graph", brute=clone_brute, gen=clone_gen,
        cases=[
            ("square", [[[2, 4], [1, 3], [2, 4], [1, 3]]]),
            ("single node", [[[]]]),
            ("two nodes", [[[2], [1]]]),
            ("triangle", [[[2, 3], [1, 3], [1, 2]]]),
            ("path", [[[2], [1, 3], [2, 4], [3]]]),
            ("star", [[[2, 3, 4, 5], [1], [1], [1], [1]]]),
            ("two cycles sharing a node", [[[2, 3, 4, 5], [1, 3], [1, 2], [1, 5], [1, 4]]]),
        ],
    ),
    "walls-and-gates": dict(
        fn="walls_and_gates", brute=gates_brute, gen=gates_gen,
        cases=[
            ("classic", [[[INF, 0, -1], [INF, INF, INF], [0, -1, INF], [INF, INF, -1]]]),
            ("single gate", [[[0, INF, INF]]]),
            ("no gate leaves rooms unreachable", [[[INF, INF], [INF, INF]]]),
            ("wall blocks a room", [[[0, -1, INF]]]),
            ("two gates meet", [[[0, INF, INF, INF, 0]]]),
            ("only walls", [[[-1, -1]]]),
            ("column", [[[0], [INF], [INF], [INF]]]),
        ],
    ),
    "rotting-oranges": dict(
        fn="oranges_rotting", brute=rot_brute, gen=rot_gen,
        cases=[
            ("spreads in four minutes", [[[2, 1, 0, 1], [1, 1, 1, 0], [0, 1, 1, 1]]]),
            ("cut off by an empty cell", [[[2, 1, 0], [0, 0, 1], [1, 1, 1]]]),
            ("nothing fresh", [[[0, 2]]]),
            ("nothing rotten", [[[1, 1]]]),
            ("empty grid of zeros", [[[0, 0]]]),
            ("two sources", [[[2, 1, 1, 1, 2]]]),
            ("single fresh next to rotten", [[[2], [1]]]),
            ("long line", [[[2, 1, 1, 1, 1, 1]]]),
        ],
    ),
    "pacific-atlantic-water-flow": dict(
        fn="pacific_atlantic", compare="unordered", brute=pa_brute, gen=pa_gen,
        cases=[
            ("classic", [[[3, 3, 2, 1], [3, 1, 4, 4], [2, 5, 5, 1], [1, 2, 3, 3]]]),
            ("single cell", [[[7]]]),
            ("flat", [[[1, 1], [1, 1]]]),
            ("one row", [[[3, 1, 2]]]),
            ("one column", [[[3], [1], [2]]]),
            ("slope", [[[1, 2, 3], [2, 3, 4], [3, 4, 5]]]),
            ("bowl", [[[5, 5, 5], [5, 1, 5], [5, 5, 5]]]),
        ],
    ),
    "surrounded-regions": dict(
        fn="solve", brute=surr_brute, gen=surr_gen,
        cases=[
            ("inner region flips", [[["X", "X", "X", "X"], ["X", "O", "O", "X"], ["X", "X", "O", "X"], ["X", "O", "X", "X"]]]),
            ("border O saves its region", [[["O", "O", "O"], ["O", "X", "O"], ["O", "O", "O"]]]),
            ("single O", [[["O"]]]),
            ("single X", [[["X"]]]),
            ("O touching the border through a corridor", [[["X", "O", "X"], ["X", "O", "X"], ["X", "X", "X"]]]),
            ("all O", [[["O", "O"], ["O", "O"]]]),
            ("two separate inner regions", [[["X", "X", "X", "X", "X"], ["X", "O", "X", "O", "X"], ["X", "X", "X", "X", "X"]]]),
        ],
    ),
    "course-schedule": dict(
        fn="can_finish", brute=sched_brute, gen=sched_gen,
        cases=[
            ("simple chain", [2, [[1, 0]]]),
            ("two-course cycle", [2, [[1, 0], [0, 1]]]),
            ("no prerequisites", [3, []]),
            ("diamond", [4, [[1, 0], [2, 0], [3, 1], [3, 2]]]),
            ("long cycle", [4, [[1, 0], [2, 1], [3, 2], [0, 3]]]),
            ("self loop", [1, [[0, 0]]]),
            ("cycle hidden behind a good course", [4, [[1, 0], [2, 3], [3, 2]]]),
            ("single course", [1, []]),
        ],
    ),
    "course-schedule-ii": dict(
        fn="find_order", brute=order_brute, gen=sched_gen, check=order_check,
        cases=[
            ("chain has one order", [4, chain_pre(4)]),
            ("two courses", [2, [[1, 0]]]),
            ("cycle gives nothing", [2, [[1, 0], [0, 1]]]),
            ("single course", [1, []]),
            ("reverse chain", [3, [[0, 1], [1, 2]]]),
            ("pairs listed out of order", [3, [[2, 1], [1, 0]]]),
            ("cycle behind a start", [3, [[1, 0], [2, 1], [1, 2]]]),
            ("self loop", [2, [[1, 1]]]),
        ],
    ),
    "graph-valid-tree": dict(
        fn="valid_tree", brute=tree_brute, gen=tree_gen,
        cases=[
            ("a tree", [5, [[0, 1], [0, 2], [0, 3], [1, 4]]]),
            ("has a cycle", [5, [[0, 1], [1, 2], [2, 3], [1, 3], [1, 4]]]),
            ("disconnected", [4, [[0, 1], [2, 3]]]),
            ("single node", [1, []]),
            ("two nodes joined", [2, [[0, 1]]]),
            ("two nodes apart", [2, []]),
            ("right count but a cycle", [4, [[0, 1], [1, 2], [2, 0]]]),
            ("path", [4, [[0, 1], [1, 2], [2, 3]]]),
        ],
    ),
    "number-of-connected-components-in-an-undirected-graph": dict(
        fn="count_components", brute=comps_brute, gen=graph_gen,
        cases=[
            ("two groups", [5, [[0, 1], [1, 2], [3, 4]]]),
            ("one group", [5, [[0, 1], [1, 2], [2, 3], [3, 4]]]),
            ("no edges", [4, []]),
            ("single node", [1, []]),
            ("cycle counts once", [3, [[0, 1], [1, 2], [2, 0]]]),
            ("isolated nodes plus a pair", [5, [[1, 2]]]),
            ("repeated edge", [3, [[0, 1], [0, 1]]]),
            ("star", [5, [[0, 1], [0, 2], [0, 3], [0, 4]]]),
        ],
    ),
    "redundant-connection": dict(
        fn="find_redundant_connection", brute=redundant_brute, gen=redundant_gen,
        cases=[
            ("triangle", [[[2, 1], [3, 2], [1, 3]]]),
            ("later edge closes the cycle", [[[1, 3], [3, 5], [2, 5], [4, 2], [1, 2]]]),
            ("cycle of three among five", [[[1, 2], [2, 3], [3, 1], [3, 4], [4, 5]]]),
            ("last edge is redundant", [[[1, 2], [1, 3], [3, 4], [2, 4]]]),
            ("star plus one", [[[1, 2], [1, 3], [1, 4], [2, 3]]]),
            ("long cycle", [[[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]]]),
            ("first edges form the cycle", [[[1, 2], [2, 3], [3, 1], [1, 4]]]),
        ],
    ),
    "word-ladder": dict(
        fn="ladder_length", brute=ladder_brute, gen=ladder_gen,
        cases=[
            ("five words long", ["cat", "dog", ["cot", "cog", "dog", "bog"]]),
            ("end word missing", ["cat", "dog", ["cot", "cog", "bog"]]),
            ("one step", ["aa", "ab", ["ab"]]),
            ("no route", ["aaa", "bbb", ["aab", "bbb"]]),
            ("two changes", ["cat", "dog", ["cot", "dot", "dog"]]),
            ("shortest of two routes", ["abc", "xyz", ["abz", "ayz", "xyz", "xbc", "xyc"]]),
            ("begin word not in the list", ["ham", "sky", ["hat", "sat", "sky", "ham", "sam", "say", "sly"]]),
            ("single letter words", ["a", "c", ["a", "b", "c"]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
