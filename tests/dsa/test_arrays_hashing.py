"""Arrays & Hashing: every solution against its shared cases, plus brute-force comparisons on random inputs."""
import itertools
import random
from collections import Counter

import pytest

from dsa_lib import MIN_CASES, call, case_params, load_cases, load_solution, matches

TOPIC = "arrays-hashing"
SLUGS = [
    "contains-duplicate",
    "valid-anagram",
    "two-sum",
    "group-anagrams",
    "top-k-frequent-elements",
    "encode-and-decode-strings",
    "product-of-array-except-self",
    "valid-sudoku",
    "longest-consecutive-sequence",
]


@pytest.mark.parametrize("slug", SLUGS)
def test_has_enough_cases(slug):
    cases = load_cases(TOPIC, slug)["cases"]
    assert len(cases) >= MIN_CASES, f"{slug} needs at least {MIN_CASES} cases"


@pytest.mark.parametrize("slug,case", case_params(TOPIC, SLUGS))
def test_shared_cases(slug, case):
    meta = load_cases(TOPIC, slug)
    _, fn, adapter = load_solution(TOPIC, slug)
    got = call(fn, adapter, case["args"])
    assert matches(got, case["expected"], meta.get("compare", "exact")), f"got {got!r}, expected {case['expected']!r}"


def solve(slug):
    _, fn, adapter = load_solution(TOPIC, slug)
    return lambda *a: call(fn, adapter, list(a))


R = random.Random(2024)


def rand_list(n, lo=-6, hi=6):
    return [R.randint(lo, hi) for _ in range(n)]


def test_contains_duplicate_matches_brute_force():
    f = solve("contains-duplicate")
    for _ in range(300):
        xs = rand_list(R.randint(0, 9), 0, 12)
        assert f(xs) == any(a == b for a, b in itertools.combinations(xs, 2))


def test_valid_anagram_matches_sorted_compare():
    f = solve("valid-anagram")
    for _ in range(300):
        s = "".join(R.choice("abc") for _ in range(R.randint(0, 6)))
        t = "".join(R.choice("abc") for _ in range(R.randint(0, 6)))
        assert f(s, t) == (sorted(s) == sorted(t))


def test_two_sum_finds_a_valid_pair():
    f = solve("two-sum")
    for _ in range(300):
        xs = rand_list(R.randint(2, 9), -8, 8)
        i, j = sorted(R.sample(range(len(xs)), 2))
        target = xs[i] + xs[j]
        got = f(xs, target)
        assert len(got) == 2 and got[0] != got[1] and xs[got[0]] + xs[got[1]] == target


def test_group_anagrams_partitions_by_sorted_letters():
    f = solve("group-anagrams")
    for _ in range(200):
        words = ["".join(R.choice("abc") for _ in range(R.randint(0, 4))) for _ in range(R.randint(0, 8))]
        got = f(words)
        assert sorted(w for g in got for w in g) == sorted(words)
        for g in got:
            assert len({"".join(sorted(w)) for w in g}) == 1
        assert len(got) == len({"".join(sorted(w)) for w in words})


def test_top_k_frequent_returns_k_most_common():
    f = solve("top-k-frequent-elements")
    for _ in range(300):
        xs = rand_list(R.randint(1, 14), 0, 5)
        counts = Counter(xs)
        k = R.randint(1, len(counts))
        got = f(xs, k)
        assert len(got) == k and len(set(got)) == k
        # every returned element is at least as frequent as every element left out
        floor = min(counts[g] for g in got)
        assert all(counts[x] <= floor for x in counts if x not in got)


def test_encode_decode_round_trip():
    f = solve("encode-and-decode-strings")
    alphabet = "ab#1 5,\n"
    for _ in range(300):
        strs = ["".join(R.choice(alphabet) for _ in range(R.randint(0, 6))) for _ in range(R.randint(0, 6))]
        assert f(strs) == strs


def test_product_except_self_matches_brute_force():
    f = solve("product-of-array-except-self")
    for _ in range(300):
        xs = rand_list(R.randint(1, 7), -3, 3)
        expect = []
        for i in range(len(xs)):
            p = 1
            for j, v in enumerate(xs):
                if j != i:
                    p *= v
            expect.append(p)
        assert f(xs) == expect


def _brute_valid(board):
    units = [[board[r][c] for c in range(9)] for r in range(9)]
    units += [[board[r][c] for r in range(9)] for c in range(9)]
    units += [[board[br + i][bc + j] for i in range(3) for j in range(3)] for br in (0, 3, 6) for bc in (0, 3, 6)]
    return all(len([v for v in u if v != "."]) == len({v for v in u if v != "."}) for u in units)


def test_valid_sudoku_matches_brute_force():
    f = solve("valid-sudoku")
    for _ in range(200):
        board = [["." for _ in range(9)] for _ in range(9)]
        for _ in range(R.randint(0, 25)):
            board[R.randrange(9)][R.randrange(9)] = str(R.randint(1, 9))
        assert f(board) == _brute_valid(board)


def test_longest_consecutive_matches_sorted_scan():
    f = solve("longest-consecutive-sequence")
    for _ in range(300):
        xs = rand_list(R.randint(0, 12), -5, 8)
        vals = sorted(set(xs))
        best = run = 0
        for i, v in enumerate(vals):
            run = run + 1 if i and vals[i - 1] == v - 1 else 1
            best = max(best, run)
        assert f(xs) == best
