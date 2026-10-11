"""Advanced graphs: one spec per problem."""
from itertools import permutations

TOPIC = "advanced-graphs"
INF = float("inf")


# ── Network Delay Time (Bellman-Ford as the independent check) ──
def delay_brute(times, n, k):
    dist = [INF] * (n + 1)
    dist[k] = 0
    for _ in range(n):
        for u, v, w in times:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    best = max(dist[1:])
    return -1 if best == INF else best


def delay_gen(r):
    n = r.randint(1, 6)
    times = []
    for _ in range(r.randint(0, 10)):
        u, v = r.randint(1, n), r.randint(1, n)
        if u != v:
            times.append([u, v, r.randint(1, 9)])
    return [times, n, r.randint(1, n)]


# ── Reconstruct Itinerary (backtracking over tickets in lexical order) ──
def itin_brute(tickets):
    tickets = sorted(tickets)
    used = [False] * len(tickets)

    def go(city, path):
        if len(path) == len(tickets) + 1:
            return path
        for i, (a, b) in enumerate(tickets):
            if not used[i] and a == city:
                used[i] = True
                got = go(b, path + [b])
                used[i] = False
                if got:
                    return got
        return None

    return go("SFO", ["SFO"])


def itin_gen(r):
    cities = ["SFO", "AAA", "BBB", "CCC"]
    tickets, here = [], "SFO"
    for _ in range(r.randint(1, 7)):
        nxt = r.choice(cities)
        tickets.append([here, nxt])
        here = nxt
    r.shuffle(tickets)
    return [tickets]


# ── Min Cost to Connect All Points (Kruskal) ──
def mst_brute(points):
    n = len(points)
    edges = sorted((abs(points[i][0] - points[j][0]) + abs(points[i][1] - points[j][1]), i, j) for i in range(n) for j in range(i + 1, n))
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x

    total = 0
    for d, i, j in edges:
        a, b = find(i), find(j)
        if a != b:
            parent[a] = b
            total += d
    return total


def mst_gen(r):
    n = r.randint(1, 7)
    pts = set()
    while len(pts) < n:
        pts.add((r.randint(-6, 6), r.randint(-6, 6)))
    pts = [list(p) for p in pts]
    r.shuffle(pts)
    return [pts]


# ── Swim in Rising Water (binary search on time + flood fill) ──
def swim_brute(grid):
    n = len(grid)

    def ok(t):
        if grid[0][0] > t:
            return False
        seen, stack = {(0, 0)}, [(0, 0)]
        while stack:
            r, c = stack.pop()
            if (r, c) == (n - 1, n - 1):
                return True
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen and grid[nr][nc] <= t:
                    seen.add((nr, nc))
                    stack.append((nr, nc))
        return False

    t = 0
    while not ok(t):
        t += 1
    return t


def swim_gen(r):
    n = r.randint(1, 4)
    vals = list(range(n * n))
    r.shuffle(vals)
    return [[vals[i * n : (i + 1) * n] for i in range(n)]]


# ── Alien Dictionary ──
def letters_of(words):
    return sorted({c for w in words for c in w})


def respects(words, order):
    rank = {c: i for i, c in enumerate(order)}
    for a, b in zip(words, words[1:]):
        for x, y in zip(a, b):
            if x != y:
                if rank[x] > rank[y]:
                    return False
                break
        else:
            if len(a) > len(b):
                return False
    return True


def alien_brute(words):
    ls = letters_of(words)
    for p in permutations(ls):
        if respects(words, p):
            return "".join(p)
    return ""


def alien_check(args, got):
    (words,) = args
    want = alien_brute(words)
    if want == "":
        return got == ""
    return sorted(got) == letters_of(words) and respects(words, got)


def alien_gen(r):
    alphabet = r.sample("abcde", r.randint(2, 5))  # a hidden alphabet order
    rank = {c: i for i, c in enumerate(alphabet)}
    words = sorted(("".join(r.choice(alphabet) for _ in range(r.randint(1, 3))) for _ in range(r.randint(1, 6))), key=lambda w: [rank[c] for c in w])
    if r.random() < 0.25:
        r.shuffle(words)
    return [words]


# ── Cheapest Flights Within K Stops ──
def flights_brute(n, flights, src, dst, k):
    best = INF

    def go(city, cost, edges_left):
        nonlocal best
        if city == dst:
            best = min(best, cost)
        if edges_left == 0:
            return
        for u, v, w in flights:
            if u == city:
                go(v, cost + w, edges_left - 1)

    go(src, 0, k + 1)
    return -1 if best == INF else best


def flights_gen(r):
    n = r.randint(2, 5)
    flights = [[r.randrange(n), r.randrange(n), r.randint(1, 9)] for _ in range(r.randint(0, 8))]
    flights = [f for f in flights if f[0] != f[1]]
    src, dst = r.sample(range(n), 2)
    return [n, flights, src, dst, r.randint(0, 3)]


SPEC = {
    "network-delay-time": dict(
        fn="network_delay_time", brute=delay_brute, gen=delay_gen,
        cases=[
            ("slowest node decides", [[[1, 2, 4], [1, 3, 1], [3, 2, 2], [2, 4, 3]], 4, 1]),
            ("unreachable node", [[[1, 2, 5]], 3, 1]),
            ("single node", [[], 1, 1]),
            ("two nodes", [[[1, 2, 7]], 2, 1]),
            ("wrong direction", [[[2, 1, 3]], 2, 1]),
            ("a shortcut beats a direct edge", [[[1, 2, 10], [1, 3, 2], [3, 2, 3]], 3, 1]),
            ("a cycle", [[[1, 2, 1], [2, 3, 1], [3, 1, 1]], 3, 2]),
            ("start in the middle", [[[2, 1, 2], [2, 3, 6], [3, 4, 1]], 4, 2]),
        ],
    ),
    "reconstruct-itinerary": dict(
        fn="find_itinerary", brute=itin_brute, gen=itin_gen,
        cases=[
            ("simple route", [[["SFO", "AAA"], ["AAA", "BBB"]]]),
            ("smaller name first", [[["SFO", "BBB"], ["SFO", "AAA"], ["AAA", "SFO"]]]),
            ("must come back through the hub", [[["SFO", "AAA"], ["AAA", "SFO"], ["SFO", "CCC"], ["CCC", "SFO"]]]),
            ("single ticket", [[["SFO", "ZZZ"]]]),
            ("dead end is visited last", [[["SFO", "AAA"], ["SFO", "BBB"], ["BBB", "SFO"]]]),
            ("loop of three", [[["SFO", "AAA"], ["AAA", "BBB"], ["BBB", "SFO"]]]),
            ("duplicate tickets", [[["SFO", "AAA"], ["AAA", "SFO"], ["SFO", "AAA"]]]),
            ("longer chain", [[["SFO", "CCC"], ["CCC", "BBB"], ["BBB", "AAA"], ["AAA", "CCC"], ["CCC", "SFO"]]]),
        ],
    ),
    "min-cost-to-connect-all-points": dict(
        fn="min_cost_connect_points", brute=mst_brute, gen=mst_gen,
        cases=[
            ("five points", [[[0, 0], [3, 2], [5, 1], [0, 4], [6, 5]]]),
            ("single point", [[[2, 3]]]),
            ("two points", [[[0, 0], [4, 3]]]),
            ("collinear", [[[0, 0], [2, 0], [5, 0], [9, 0]]]),
            ("square", [[[0, 0], [0, 2], [2, 0], [2, 2]]]),
            ("negative coordinates", [[[-3, -3], [0, 0], [3, 3]]]),
            ("cluster plus an outlier", [[[0, 0], [1, 0], [0, 1], [1, 1], [10, 10]]]),
            ("long thin chain", [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]]),
        ],
    ),
    "swim-in-rising-water": dict(
        fn="swim_in_water", brute=swim_brute, gen=swim_gen,
        cases=[
            ("go round the tall cell", [[[0, 4, 5], [1, 7, 6], [2, 3, 8]]]),
            ("single cell", [[[0]]]),
            ("start is the highest on the way", [[[3, 1], [0, 2]]]),
            ("two by two", [[[0, 1], [2, 3]]]),
            ("end is the highest", [[[0, 1, 2], [3, 4, 5], [6, 7, 8]]]),
            ("tall wall in the middle", [[[0, 2, 1], [8, 7, 3], [4, 5, 6]]]),
            ("snake is cheaper", [[[0, 1, 2, 3], [11, 10, 9, 4], [12, 13, 8, 5], [15, 14, 7, 6]]]),
            ("start higher than the rest", [[[8, 1], [2, 0]]]),
        ],
    ),
    "alien-dictionary": dict(
        fn="alien_order", brute=alien_brute, gen=alien_gen, check=alien_check,
        cases=[
            ("a chain of letters", [["ab", "ac", "bc"]]),
            ("contradiction", [["ab", "ba", "ab"]]),
            ("a longer word before its prefix", [["abc", "ab"]]),
            ("two letters", [["ba", "bb"]]),
            ("three words one order", [["ca", "cb", "ab"]]),
            ("empty list", [[]]),
            ("repeated words", [["mn", "mn", "no", "oo"]]),
            ("one letter", [["z", "z"]]),
        ],
    ),
    "cheapest-flights-within-k-stops": dict(
        fn="find_cheapest_price", brute=flights_brute, gen=flights_gen,
        cases=[
            ("a stop makes it cheaper", [4, [[0, 1, 80], [1, 2, 20], [0, 2, 150], [2, 3, 30]], 0, 3, 2]),
            ("too few stops allowed", [3, [[0, 1, 10], [1, 2, 10], [0, 2, 50]], 0, 2, 0]),
            ("exactly one stop", [3, [[0, 1, 10], [1, 2, 10], [0, 2, 50]], 0, 2, 1]),
            ("no route", [3, [[0, 1, 5]], 0, 2, 3]),
            ("zero stops direct", [2, [[0, 1, 9]], 0, 1, 0]),
            ("cheaper route needs more stops than allowed", [4, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [0, 3, 10]], 0, 3, 1]),
            ("cheaper route fits", [4, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [0, 3, 10]], 0, 3, 2]),
            ("cycle in the graph", [3, [[0, 1, 2], [1, 0, 2], [1, 2, 2]], 0, 2, 3]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
