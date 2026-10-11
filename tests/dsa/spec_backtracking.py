"""Backtracking: one spec per problem."""
from itertools import combinations, permutations, product

TOPIC = "backtracking"


# ── Subsets ──
def subsets_brute(nums):
    return [list(c) for k in range(len(nums) + 1) for c in combinations(nums, k)]


def subsets_gen(r):
    return [r.sample(range(-5, 9), r.randint(0, 6))]


# ── Combination Sum ──
def comb_brute(candidates, target):
    cs = sorted(candidates)
    out = []

    def go(i, rem, cur):
        if i == len(cs):
            if rem == 0:
                out.append(cur)
            return
        k = 0
        while k * cs[i] <= rem:
            go(i + 1, rem - k * cs[i], cur + [cs[i]] * k)
            k += 1

    go(0, target, [])
    return out


def comb_gen(r):
    cands = r.sample(range(1, 9), r.randint(1, 4))
    return [cands, r.randint(1, 12)]


# ── Combination Sum II ──
def comb2_brute(candidates, target):
    found = set()
    for k in range(len(candidates) + 1):
        for idx in combinations(range(len(candidates)), k):
            if sum(candidates[i] for i in idx) == target:
                found.add(tuple(sorted(candidates[i] for i in idx)))
    return [list(t) for t in found]


def comb2_gen(r):
    return [[r.randint(1, 6) for _ in range(r.randint(1, 7))], r.randint(1, 10)]


# ── Permutations ──
def perm_brute(nums):
    return [list(p) for p in permutations(nums)]


def perm_gen(r):
    return [r.sample(range(-4, 9), r.randint(1, 5))]


# ── Subsets II ──
def subsets2_brute(nums):
    found = set()
    for k in range(len(nums) + 1):
        for idx in combinations(range(len(nums)), k):
            found.add(tuple(sorted(nums[i] for i in idx)))
    return [list(t) for t in found]


def subsets2_gen(r):
    return [[r.randint(1, 4) for _ in range(r.randint(0, 6))]]


# ── Word Search ──
def ws_brute(board, word):
    rows, cols = len(board), len(board[0])

    def go(r, c, i, seen):
        if board[r][c] != word[i]:
            return False
        if i == len(word) - 1:
            return True
        seen.add((r, c))
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in seen and go(nr, nc, i + 1, seen):
                seen.discard((r, c))
                return True
        seen.discard((r, c))
        return False

    return any(go(r, c, 0, set()) for r in range(rows) for c in range(cols))


def ws_gen(r):
    rows, cols = r.randint(1, 4), r.randint(1, 4)
    board = [[r.choice("abc") for _ in range(cols)] for _ in range(rows)]
    return [board, "".join(r.choice("abc") for _ in range(r.randint(1, 6)))]


# ── Palindrome Partitioning ──
def pal_brute(s):
    out = []
    n = len(s)
    for mask in range(1 << max(n - 1, 0)):
        parts, start = [], 0
        for i in range(n - 1):
            if mask >> i & 1:
                parts.append(s[start : i + 1])
                start = i + 1
        parts.append(s[start:])
        if all(p == p[::-1] for p in parts):
            out.append(parts)
    return out if s else [[]]


def pal_gen(r):
    return ["".join(r.choice("ab") for _ in range(r.randint(1, 7)))]


# ── Letter Combinations ──
PH = {"2": "abc", "3": "def", "4": "ghi", "5": "jkl", "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz"}


def phone_brute(digits):
    if not digits:
        return []
    return ["".join(p) for p in product(*(PH[d] for d in digits))]


def phone_gen(r):
    return ["".join(r.choice("23456789") for _ in range(r.randint(0, 4)))]


# ── N-Queens ──
def queens_brute(n):
    out = []
    for cols in permutations(range(n)):
        if all(abs(cols[i] - cols[j]) != j - i for i in range(n) for j in range(i + 1, n)):
            out.append(["." * c + "Q" + "." * (n - c - 1) for c in cols])
    return out


SPEC = {
    "subsets": dict(
        fn="subsets", compare="nested", brute=subsets_brute, gen=subsets_gen,
        cases=[
            ("three numbers", [[1, 2, 3]]),
            ("single number", [[7]]),
            ("empty", [[]]),
            ("two numbers", [[4, 9]]),
            ("negative numbers", [[-1, 0, 2]]),
            ("four numbers", [[1, 2, 3, 4]]),
            ("unsorted input", [[5, 1, 3]]),
        ],
    ),
    "combination-sum": dict(
        fn="combination_sum", compare="nested", brute=comb_brute, gen=comb_gen,
        cases=[
            ("reuse allowed", [[2, 3, 6, 7], 7]),
            ("several ways", [[2, 3, 5], 8]),
            ("no way", [[3, 5], 2]),
            ("single candidate fits", [[4], 8]),
            ("single candidate does not fit", [[4], 9]),
            ("candidate equals target", [[5, 9], 9]),
            ("unsorted candidates", [[7, 2, 3], 7]),
            ("one is a candidate", [[1, 2], 4]),
        ],
    ),
    "combination-sum-ii": dict(
        fn="combination_sum_2", compare="nested", brute=comb2_brute, gen=comb2_gen,
        cases=[
            ("duplicates must not repeat results", [[10, 1, 2, 7, 6, 1, 5], 8]),
            ("all equal", [[2, 2, 2, 2], 4]),
            ("no way", [[3, 4, 5], 2]),
            ("single number fits", [[6], 6]),
            ("single number does not fit", [[6], 7]),
            ("each number once", [[2, 5, 2, 1, 2], 5]),
            ("duplicates at the end", [[1, 2, 3, 3, 3], 6]),
            ("larger target than sum", [[1, 1, 1], 10]),
        ],
    ),
    "permutations": dict(
        fn="permute", compare="unordered", brute=perm_brute, gen=perm_gen,
        cases=[
            ("three numbers", [[1, 2, 3]]),
            ("single number", [[9]]),
            ("two numbers", [[0, 1]]),
            ("negatives", [[-1, 2, 5]]),
            ("four numbers", [[1, 2, 3, 4]]),
            ("unsorted", [[3, 1, 2]]),
        ],
    ),
    "subsets-ii": dict(
        fn="subsets_with_dup", compare="nested", brute=subsets2_brute, gen=subsets2_gen,
        cases=[
            ("one duplicate", [[1, 2, 2]]),
            ("all equal", [[3, 3, 3]]),
            ("no duplicates", [[1, 2, 3]]),
            ("empty", [[]]),
            ("single", [[5]]),
            ("unsorted with duplicates", [[4, 1, 4, 1]]),
            ("two pairs", [[1, 1, 2, 2]]),
        ],
    ),
    "word-search": dict(
        fn="exist", brute=ws_brute, gen=ws_gen,
        cases=[
            ("path exists", [[["a", "b", "c", "e"], ["s", "f", "c", "s"], ["a", "d", "e", "e"]], "abcced"]),
            ("whole word along the bottom", [[["a", "b", "c", "e"], ["s", "f", "c", "s"], ["a", "d", "e", "e"]], "see"]),
            ("cell reuse is not allowed", [[["a", "b", "c", "e"], ["s", "f", "c", "s"], ["a", "d", "e", "e"]], "abcb"]),
            ("single cell match", [[["z"]], "z"]),
            ("single cell mismatch", [[["z"]], "y"]),
            ("word longer than the board", [[["a", "a"]], "aaa"]),
            ("snake through the board", [[["a", "b"], ["d", "c"]], "abcd"]),
            ("first letter missing", [[["a", "b"], ["c", "d"]], "xa"]),
            ("repeated letter needs separate cells", [[["a", "b"], ["c", "a"]], "aa"]),
        ],
    ),
    "palindrome-partitioning": dict(
        fn="partition", compare="unordered", brute=pal_brute, gen=pal_gen,
        cases=[
            ("aab", ["aab"]),
            ("single letter", ["a"]),
            ("all same", ["aaa"]),
            ("no repeats", ["abc"]),
            ("whole string is a palindrome", ["racecar"]),
            ("two letters", ["ab"]),
            ("alternating", ["abab"]),
        ],
    ),
    "letter-combinations-of-a-phone-number": dict(
        fn="letter_combinations", compare="unordered", brute=phone_brute, gen=phone_gen,
        cases=[
            ("two digits", ["23"]),
            ("empty", [""]),
            ("single digit", ["2"]),
            ("digit with four letters", ["7"]),
            ("three digits", ["234"]),
            ("repeated digit", ["22"]),
            ("two four-letter digits", ["79"]),
        ],
    ),
    "n-queens": dict(
        fn="solve_n_queens", compare="unordered", brute=queens_brute, gen=lambda r: [r.randint(1, 6)],
        cases=[
            ("four queens", [4]),
            ("one queen", [1]),
            ("no solution for 2", [2]),
            ("no solution for 3", [3]),
            ("five queens", [5]),
            ("six queens", [6]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
