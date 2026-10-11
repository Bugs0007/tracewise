"""1-D dynamic programming: one spec per problem."""
from itertools import combinations

TOPIC = "dp-1d"


# ── Climbing Stairs (count every sequence of 1s and 2s) ──
def climb_brute(n):
    def go(left):
        if left == 0:
            return 1
        return go(left - 1) + (go(left - 2) if left >= 2 else 0)

    return go(n)


# ── Min Cost Climbing Stairs ──
def mincost_brute(cost):
    n = len(cost)

    def go(pos):
        if pos >= n:
            return 0
        return cost[pos] + min(go(pos + 1), go(pos + 2))

    return min(go(0), go(1))


def mincost_gen(r):
    return [[r.randint(0, 9) for _ in range(r.randint(2, 9))]]


# ── House Robber ──
def rob_brute(nums):
    best = 0
    for mask in range(1 << len(nums)):
        if mask & (mask >> 1):
            continue
        best = max(best, sum(nums[i] for i in range(len(nums)) if mask >> i & 1))
    return best


def rob_gen(r):
    return [[r.randint(0, 9) for _ in range(r.randint(1, 10))]]


# ── House Robber II (circle) ──
def rob2_brute(nums):
    n = len(nums)
    best = 0
    for mask in range(1 << n):
        if n > 1 and (mask & (mask >> 1) or (mask & 1 and mask >> (n - 1) & 1)):
            continue
        best = max(best, sum(nums[i] for i in range(n) if mask >> i & 1))
    return best


# ── Longest Palindromic Substring ──
def lps_brute(s):
    best = ""
    for i in range(len(s)):
        for j in range(i + 1, len(s) + 1):
            t = s[i:j]
            if t == t[::-1] and len(t) > len(best):
                best = t
    return best


def pal_gen(r):
    return ["".join(r.choice("abc") for _ in range(r.randint(1, 10)))]


def count_pal_brute(s):
    return sum(1 for i in range(len(s)) for j in range(i + 1, len(s) + 1) if s[i:j] == s[i:j][::-1])


# ── Decode Ways ──
def decode_brute(s):
    def go(i):
        if i == len(s):
            return 1
        total = 0
        if s[i] != "0":
            total += go(i + 1)
            if i + 1 < len(s) and 10 <= int(s[i : i + 2]) <= 26:
                total += go(i + 2)
        return total

    return go(0)


def decode_gen(r):
    return ["".join(r.choice("0112345679") for _ in range(r.randint(1, 10)))]


# ── Coin Change ──
def coin_brute(coins, amount):
    # breadth-first search over amounts: the number of layers is the number of coins
    seen, layer, steps = {0}, [0], 0
    while layer:
        if amount in seen:
            return steps
        steps += 1
        layer = [a + c for a in layer for c in coins if a + c <= amount and a + c not in seen]
        layer = list(dict.fromkeys(layer))
        seen.update(layer)
    return -1


def coin_gen(r):
    return [r.sample(range(1, 9), r.randint(1, 3)), r.randint(0, 20)]


# ── Maximum Product Subarray ──
def prod_brute(nums):
    best = nums[0]
    for i in range(len(nums)):
        p = 1
        for j in range(i, len(nums)):
            p *= nums[j]
            best = max(best, p)
    return best


def prod_gen(r):
    return [[r.randint(-4, 4) for _ in range(r.randint(1, 8))]]


# ── Word Break ──
def wb_brute(s, words):
    ws = set(words)

    def go(i):
        if i == len(s):
            return True
        return any(s[i:j] in ws and go(j) for j in range(i + 1, len(s) + 1))

    return go(0)


def wb_gen(r):
    words = list({"".join(r.choice("ab") for _ in range(r.randint(1, 3))) for _ in range(r.randint(1, 4))})
    s = "".join(r.choice("ab") for _ in range(r.randint(1, 8)))
    if r.random() < 0.5:
        s = "".join(r.choice(words) for _ in range(r.randint(1, 4)))
    return [s, words]


# ── Longest Increasing Subsequence ──
def lis_brute(nums):
    best = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                best[i] = max(best[i], best[j] + 1)
    return max(best, default=0)


def lis_gen(r):
    return [[r.randint(-5, 9) for _ in range(r.randint(1, 10))]]


# ── Partition Equal Subset Sum ──
def part_brute(nums):
    total = sum(nums)
    if total % 2:
        return False
    for k in range(len(nums) + 1):
        for c in combinations(nums, k):
            if sum(c) * 2 == total:
                return True
    return False


def part_gen(r):
    return [[r.randint(1, 9) for _ in range(r.randint(1, 9))]]


SPEC = {
    "climbing-stairs": dict(
        fn="climb_stairs", brute=climb_brute, gen=lambda r: [r.randint(1, 15)],
        cases=[("one step", [1]), ("two steps", [2]), ("three steps", [3]), ("six steps", [6]), ("ten steps", [10]), ("fifteen steps", [15]), ("four steps", [4])],
    ),
    "min-cost-climbing-stairs": dict(
        fn="min_cost_climbing_stairs", brute=mincost_brute, gen=mincost_gen,
        cases=[
            ("skip the expensive steps", [[4, 9, 2, 8, 1, 7]]),
            ("two steps", [[5, 3]]),
            ("start on the second step", [[10, 1, 10, 1, 10]]),
            ("all zero", [[0, 0, 0]]),
            ("zig zag", [[1, 100, 1, 1, 1, 100, 1, 1, 100, 1]]),
            ("three steps", [[3, 8, 2]]),
            ("equal costs", [[5, 5, 5, 5, 5]]),
        ],
    ),
    "house-robber": dict(
        fn="rob", brute=rob_brute, gen=rob_gen,
        cases=[
            ("skip a neighbour", [[3, 8, 5, 2, 9]]),
            ("single house", [[7]]),
            ("two houses", [[4, 11]]),
            ("all equal", [[5, 5, 5, 5]]),
            ("take the outer ones", [[10, 1, 1, 10]]),
            ("empty street", [[]]),
            ("take every other", [[2, 1, 2, 1, 2]]),
            ("zeros", [[0, 0, 0]]),
        ],
    ),
    "house-robber-ii": dict(
        fn="rob_circle", brute=rob2_brute, gen=lambda r: [[r.randint(0, 9) for _ in range(r.randint(1, 9))]],
        cases=[
            ("first and last are neighbours", [[4, 9, 3, 6]]),
            ("single house", [[8]]),
            ("two houses", [[3, 5]]),
            ("three houses", [[2, 7, 3]]),
            ("best skips the first", [[1, 6, 2, 9, 1]]),
            ("all equal", [[4, 4, 4, 4, 4]]),
            ("long street", [[5, 1, 1, 5, 1, 1, 5]]),
        ],
    ),
    "longest-palindromic-substring": dict(
        fn="longest_palindrome", brute=lps_brute, gen=pal_gen,
        cases=[
            ("odd length", [["xabacd"]]),
            ("even length", [["wxyyzq"]]),
            ("single letter", [["k"]]),
            ("all the same", [["aaaa"]]),
            ("no repeat", [["abcd"]]),
            ("whole string", [["racecar"]]),
            ("leftmost wins a tie", [["abcdd"]]),
            ("two candidates", [["abbaxyzzyx"]]),
        ],
    ),
    "palindromic-substrings": dict(
        fn="count_substrings", brute=count_pal_brute, gen=pal_gen,
        cases=[
            ("single letter", [["a"]]),
            ("no repeat", [["abc"]]),
            ("all the same", [["aaa"]]),
            ("mixed", [["abab"]]),
            ("two equal", [["xx"]]),
            ("longer", [["abacaba"]]),
            ("even only", [["abba"]]),
        ],
    ),
    "decode-ways": dict(
        fn="num_decodings", brute=decode_brute, gen=decode_gen,
        cases=[
            ("two readings", [["1215"]]),
            ("single digit", [["7"]]),
            ("starts with zero", [["012"]]),
            ("lone zero in the middle", [["1305"]]),
            ("ten and twenty", [["1020"]]),
            ("too large pair", [["2799"]]),
            ("all ones", [["11111"]]),
            ("zero after thirty", [["30"]]),
        ],
    ),
    "coin-change": dict(
        fn="coin_change", brute=coin_brute, gen=coin_gen,
        cases=[
            ("greedy fails", [[1, 6, 7], 12]),
            ("no way", [[5, 10], 3]),
            ("zero amount", [[2], 0]),
            ("single coin fits", [[4], 12]),
            ("single coin does not fit", [[4], 10]),
            ("several coins", [[2, 5, 10], 27]),
            ("one coin is enough", [[3, 8], 8]),
            ("big amount", [[1, 4, 9], 18]),
        ],
    ),
    "maximum-product-subarray": dict(
        fn="max_product", brute=prod_brute, gen=prod_gen,
        cases=[
            ("a negative flips twice", [[3, -2, 4, -1]]),
            ("single negative", [[-5]]),
            ("zero splits the array", [[2, 0, 5, 3]]),
            ("all negative", [[-1, -2, -3]]),
            ("all positive", [[1, 2, 3, 4]]),
            ("two negatives apart", [[-2, 3, -4, 1]]),
            ("zeros only", [[0, 0]]),
            ("ones and a negative", [[1, -1, 1, 1]]),
        ],
    ),
    "word-break": dict(
        fn="word_break", brute=wb_brute, gen=wb_gen,
        cases=[
            ("splits into two words", ["catsup", ["cat", "sup", "up"]]),
            ("reuse a word", ["abab", ["ab"]]),
            ("no split", ["abc", ["a", "bd"]]),
            ("one word", ["dog", ["dog"]]),
            ("greedy prefix is a trap", ["aaab", ["a", "aa", "aab"]]),
            ("overlapping options", ["pineapplepen", ["apple", "pen", "pine", "pineapple"]]),
            ("single letters", ["xyz", ["x", "y", "z"]]),
            ("missing letter", ["xyzw", ["x", "y", "z"]]),
        ],
    ),
    "longest-increasing-subsequence": dict(
        fn="length_of_lis", brute=lis_brute, gen=lis_gen,
        cases=[
            ("not contiguous", [[5, 1, 6, 2, 7, 3, 8]]),
            ("single", [[4]]),
            ("decreasing", [[9, 7, 5, 3]]),
            ("increasing", [[1, 2, 3, 4, 5]]),
            ("equal values do not count", [[2, 2, 2, 2]]),
            ("zigzag", [[3, 1, 4, 1, 5, 9, 2, 6]]),
            ("negatives", [[-3, -1, -2, 0, -4, 2]]),
            ("empty", [[]]),
        ],
    ),
    "partition-equal-subset-sum": dict(
        fn="can_partition", brute=part_brute, gen=part_gen,
        cases=[
            ("splits evenly", [[3, 5, 8, 2, 4, 2]]),
            ("odd total", [[1, 2, 4]]),
            ("single number", [[6]]),
            ("two equal", [[7, 7]]),
            ("even total but no split", [[1, 5, 5, 9]]),
            ("many ones", [[1, 1, 1, 1, 1, 1]]),
            ("one big number", [[10, 3, 3, 4]]),
            ("zero total gap", [[2, 2, 3, 3, 4, 4]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
