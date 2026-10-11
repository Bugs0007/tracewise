"""2-D dynamic programming: one spec per problem."""
import re
from itertools import product

TOPIC = "dp-2d"


# ── Unique Paths (walk every path) ──
def paths_brute(m, n):
    def go(r, c):
        if r == m - 1 and c == n - 1:
            return 1
        return (go(r + 1, c) if r + 1 < m else 0) + (go(r, c + 1) if c + 1 < n else 0)

    return go(0, 0)


# ── Longest Common Subsequence (try every subsequence of the first string) ──
def lcs_brute(a, b):
    best = 0
    for mask in range(1 << len(a)):
        sub = [a[i] for i in range(len(a)) if mask >> i & 1]
        it = iter(b)
        if all(ch in it for ch in sub):
            best = max(best, len(sub))
    return best


def lcs_gen(r):
    return ["".join(r.choice("abc") for _ in range(r.randint(0, 7))), "".join(r.choice("abc") for _ in range(r.randint(0, 7)))]


# ── Stock with cooldown (search over states) ──
def cool_brute(prices):
    n = len(prices)

    def go(day, holding, cooling):
        if day >= n:
            return 0
        if cooling:  # sold yesterday: today is a forced rest
            return go(day + 1, holding, False)
        best = go(day + 1, holding, False)  # do nothing
        if holding:
            best = max(best, prices[day] + go(day + 1, False, True))
        else:
            best = max(best, -prices[day] + go(day + 1, True, False))
        return best

    return go(0, False, False)


def cool_gen(r):
    return [[r.randint(1, 9) for _ in range(r.randint(0, 9))]]


# ── Coin Change II (count multisets by recursion) ──
def ways_brute(amount, coins):
    def go(i, left):
        if left == 0:
            return 1
        if i == len(coins) or left < 0:
            return 0
        return go(i, left - coins[i]) + go(i + 1, left)

    return go(0, amount)


def ways_gen(r):
    return [r.randint(0, 12), r.sample(range(1, 7), r.randint(1, 3))]


# ── Target Sum (every sign choice) ──
def target_brute(nums, target):
    return sum(1 for signs in product((1, -1), repeat=len(nums)) if sum(s * x for s, x in zip(signs, nums)) == target)


def target_gen(r):
    nums = [r.randint(0, 5) for _ in range(r.randint(1, 7))]
    return [nums, r.randint(-8, 8)]


# ── Interleaving String ──
def inter_brute(s1, s2, s3):
    def go(i, j):
        k = i + j
        if k == len(s3):
            return i == len(s1) and j == len(s2)
        return (i < len(s1) and s1[i] == s3[k] and go(i + 1, j)) or (j < len(s2) and s2[j] == s3[k] and go(i, j + 1))

    return len(s1) + len(s2) == len(s3) and go(0, 0)


def inter_gen(r):
    a = "".join(r.choice("ab") for _ in range(r.randint(0, 5)))
    b = "".join(r.choice("ab") for _ in range(r.randint(0, 5)))
    if r.random() < 0.6:
        merged, i, j = "", 0, 0
        while i < len(a) or j < len(b):
            if j >= len(b) or (i < len(a) and r.random() < 0.5):
                merged += a[i]
                i += 1
            else:
                merged += b[j]
                j += 1
        if r.random() < 0.3 and merged:
            k = r.randrange(len(merged))
            merged = merged[:k] + r.choice("ab") + merged[k + 1 :]
        return [a, b, merged]
    return [a, b, "".join(r.choice("ab") for _ in range(len(a) + len(b)))]


# ── Longest Increasing Path (plain DFS, no memory) ──
def lip_brute(m):
    rows, cols = len(m), len(m[0])

    def go(r, c):
        best = 1
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and m[nr][nc] > m[r][c]:
                best = max(best, 1 + go(nr, nc))
        return best

    return max(go(r, c) for r in range(rows) for c in range(cols))


def lip_gen(r):
    rows, cols = r.randint(1, 4), r.randint(1, 4)
    return [[[r.randint(0, 9) for _ in range(cols)] for _ in range(rows)]]


# ── Distinct Subsequences (enumerate position choices) ──
def distinct_brute(s, t):
    def go(i, j):
        if j == len(t):
            return 1
        if i == len(s):
            return 0
        return go(i + 1, j) + (go(i + 1, j + 1) if s[i] == t[j] else 0)

    return go(0, 0)


def distinct_gen(r):
    return ["".join(r.choice("ab") for _ in range(r.randint(0, 8))), "".join(r.choice("ab") for _ in range(r.randint(0, 4)))]


# ── Edit Distance (memoised recursion, a different direction) ──
def edit_brute(a, b):
    from functools import lru_cache

    @lru_cache(None)
    def go(i, j):
        if i == len(a):
            return len(b) - j
        if j == len(b):
            return len(a) - i
        if a[i] == b[j]:
            return go(i + 1, j + 1)
        return 1 + min(go(i + 1, j), go(i, j + 1), go(i + 1, j + 1))

    return go(0, 0)


def edit_gen(r):
    return ["".join(r.choice("abc") for _ in range(r.randint(0, 6))), "".join(r.choice("abc") for _ in range(r.randint(0, 6)))]


# ── Burst Balloons (try every first burst) ──
def burst_brute(nums):
    from functools import lru_cache

    @lru_cache(None)
    def go(state):
        if not state:
            return 0
        best = 0
        for i in range(len(state)):
            left = state[i - 1] if i else 1
            right = state[i + 1] if i + 1 < len(state) else 1
            best = max(best, left * state[i] * right + go(state[:i] + state[i + 1 :]))
        return best

    return go(tuple(nums))


def burst_gen(r):
    return [[r.randint(0, 6) for _ in range(r.randint(1, 6))]]


# ── Regular Expression Matching (Python's own regex engine) ──
def regex_brute(s, p):
    return re.fullmatch(p, s) is not None


def regex_gen(r):
    p = ""
    for _ in range(r.randint(0, 4)):
        p += r.choice("ab.") + (r.choice(["", "", "*"]))
    return ["".join(r.choice("ab") for _ in range(r.randint(0, 5))), p]


SPEC = {
    "unique-paths": dict(
        fn="unique_paths", brute=paths_brute, gen=lambda r: [r.randint(1, 7), r.randint(1, 7)],
        cases=[("small grid", [2, 3]), ("single cell", [1, 1]), ("one row", [1, 6]), ("one column", [5, 1]), ("square", [4, 4]), ("wide", [3, 7]), ("tall", [7, 3])],
    ),
    "longest-common-subsequence": dict(
        fn="longest_common_subsequence", brute=lcs_brute, gen=lcs_gen,
        cases=[
            ("interleaved letters", ["axbycz", "abc"]),
            ("nothing shared", ["abc", "xyz"]),
            ("identical", ["hello", "hello"]),
            ("one empty", ["abc", ""]),
            ("both empty", ["", ""]),
            ("order matters", ["abc", "cba"]),
            ("repeated letters", ["aabba", "ababa"]),
            ("one is inside the other", ["pqr", "xpyqzr"]),
        ],
    ),
    "best-time-to-buy-and-sell-stock-with-cooldown": dict(
        fn="max_profit", brute=cool_brute, gen=cool_gen,
        cases=[
            ("cooldown blocks the quick re-buy", [[2, 6, 1, 5, 3, 8]]),
            ("one day", [[5]]),
            ("falling prices", [[9, 7, 4, 1]]),
            ("rising prices", [[1, 2, 3, 4, 5]]),
            ("empty", [[]]),
            ("flat", [[3, 3, 3]]),
            ("two peaks", [[1, 5, 1, 5, 1, 5]]),
            ("sell then wait", [[3, 8, 2, 9]]),
        ],
    ),
    "coin-change-ii": dict(
        fn="change", brute=ways_brute, gen=ways_gen,
        cases=[
            ("combinations not orders", [6, [1, 2, 3]]),
            ("zero amount", [0, [2]]),
            ("no way", [3, [2]]),
            ("single coin fits", [10, [5]]),
            ("many ways", [10, [1, 2, 5]]),
            ("coin larger than amount", [4, [7]]),
            ("two coins", [9, [3, 4]]),
        ],
    ),
    "target-sum": dict(
        fn="find_target_sum_ways", brute=target_brute, gen=target_gen,
        cases=[
            ("several sign choices", [[2, 1, 3, 2], 2]),
            ("single number", [[4], 4]),
            ("unreachable target", [[1, 1], 5]),
            ("zeros double the ways", [[0, 0, 3], 3]),
            ("negative target", [[2, 2], -4]),
            ("all ones", [[1, 1, 1, 1], 0]),
            ("balanced", [[3, 3], 0]),
        ],
    ),
    "interleaving-string": dict(
        fn="is_interleave", brute=inter_brute, gen=inter_gen,
        cases=[
            ("interleaved", ["abc", "xy", "axbyc"]),
            ("wrong order", ["abc", "xy", "yaxbc"]),
            ("both empty", ["", "", ""]),
            ("length mismatch", ["a", "b", "abc"]),
            ("one string empty", ["abc", "", "abc"]),
            ("ambiguous start", ["aab", "aac", "aaaabc"]),
            ("letters reused", ["ab", "ab", "abab"]),
            ("swapped letters", ["ab", "cd", "acbd"]),
        ],
    ),
    "longest-increasing-path-in-a-matrix": dict(
        fn="longest_increasing_path", brute=lip_brute, gen=lip_gen,
        cases=[
            ("spiral", [[[1, 2, 9], [6, 5, 8], [7, 4, 3]]]),
            ("single cell", [[[5]]]),
            ("all equal", [[[2, 2], [2, 2]]]),
            ("one row", [[[1, 3, 2, 4]]]),
            ("one column", [[[1], [2], [3]]]),
            ("snake", [[[1, 2, 3], [6, 5, 4], [7, 8, 9]]]),
            ("two peaks", [[[3, 4, 5], [3, 2, 6], [2, 2, 1]]]),
        ],
    ),
    "distinct-subsequences": dict(
        fn="num_distinct", brute=distinct_brute, gen=distinct_gen,
        cases=[
            ("choose which b", ["abbc", "abc"]),
            ("repeated target", ["aaaa", "aa"]),
            ("target longer", ["ab", "abc"]),
            ("empty target", ["abc", ""]),
            ("equal strings", ["xyz", "xyz"]),
            ("no match", ["abc", "d"]),
            ("interleaved matches", ["axbxcx", "abc"]),
        ],
    ),
    "edit-distance": dict(
        fn="min_distance", brute=edit_brute, gen=edit_gen,
        cases=[
            ("two replacements", ["rapid", "tepid"]),
            ("equal", ["same", "same"]),
            ("one empty", ["abc", ""]),
            ("both empty", ["", ""]),
            ("one replace", ["cat", "cut"]),
            ("insert at the end", ["go", "gone"]),
            ("completely different", ["abc", "xyz"]),
            ("delete in the middle", ["abxc", "abc"]),
        ],
    ),
    "burst-balloons": dict(
        fn="max_coins", brute=burst_brute, gen=burst_gen,
        cases=[
            ("order matters", [[2, 4, 3]]),
            ("single balloon", [[5]]),
            ("two balloons", [[3, 4]]),
            ("zeros", [[0, 5, 0]]),
            ("equal values", [[2, 2, 2]]),
            ("four balloons", [[1, 6, 2, 5]]),
            ("increasing", [[1, 2, 3, 4]]),
        ],
    ),
    "regular-expression-matching": dict(
        fn="is_match", brute=regex_brute, gen=regex_gen,
        cases=[
            ("star repeats", ["aaab", "a*b"]),
            ("star can be zero", ["b", "a*b"]),
            ("dot star matches anything", ["abcd", ".*"]),
            ("must match all", ["abc", "ab"]),
            ("empty text", ["", "a*"]),
            ("empty pattern", ["a", ""]),
            ("dot matches one", ["ab", "a."]),
            ("star then letter", ["aab", "c*a*b"]),
            ("too short", ["a", "ab*c"]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
