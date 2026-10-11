"""Greedy: one spec per problem."""
from collections import Counter
from itertools import product

TOPIC = "greedy"


# ── Maximum Subarray ──
def kadane_brute(nums):
    return max(sum(nums[i:j]) for i in range(len(nums)) for j in range(i + 1, len(nums) + 1))


def kadane_gen(r):
    return [[r.randint(-6, 6) for _ in range(r.randint(1, 9))]]


# ── Jump Game ──
def jump_brute(nums):
    seen = set()

    def go(i):
        if i >= len(nums) - 1:
            return True
        if i in seen:
            return False
        seen.add(i)
        return any(go(i + k) for k in range(1, nums[i] + 1))

    return go(0)


def jump_gen(r):
    return [[r.randint(0, 3) for _ in range(r.randint(1, 8))]]


# ── Jump Game II (breadth-first search over positions) ──
def jump2_brute(nums):
    n = len(nums)
    if n == 1:
        return 0
    dist, frontier = {0: 0}, [0]
    while frontier:
        nxt = []
        for i in frontier:
            for k in range(1, nums[i] + 1):
                j = min(i + k, n - 1)
                if j not in dist:
                    dist[j] = dist[i] + 1
                    nxt.append(j)
        frontier = nxt
    return dist[n - 1]


def jump2_gen(r):
    while True:
        nums = [r.randint(0, 4) for _ in range(r.randint(1, 9))]
        if jump_brute(nums):
            return [nums]


# ── Gas Station (try every start) ──
def gas_brute(gas, cost):
    n = len(gas)
    for s in range(n):
        tank = 0
        for k in range(n):
            i = (s + k) % n
            tank += gas[i] - cost[i]
            if tank < 0:
                break
        else:
            return s
    return -1


def gas_gen(r):
    n = r.randint(1, 7)
    return [[r.randint(0, 5) for _ in range(n)], [r.randint(0, 5) for _ in range(n)]]


# ── Hand of Straights (repeatedly take the smallest card) ──
def hand_brute(hand, size):
    cards = sorted(hand)
    while cards:
        first = cards[0]
        for k in range(size):
            if first + k in cards:
                cards.remove(first + k)
            else:
                return False
    return True


def hand_gen(r):
    size = r.randint(1, 4)
    if r.random() < 0.6:
        hand = []
        for _ in range(r.randint(1, 3)):
            s = r.randint(0, 5)
            hand += list(range(s, s + size))
        if r.random() < 0.3 and hand:
            hand[r.randrange(len(hand))] += r.choice([-1, 1])
        r.shuffle(hand)
        return [hand, size]
    return [[r.randint(0, 6) for _ in range(r.randint(1, 8))], size]


# ── Merge Triplets (try every subset) ──
def triplets_brute(triplets, target):
    for mask in range(1, 1 << len(triplets)):
        merged = [0, 0, 0]
        for i, t in enumerate(triplets):
            if mask >> i & 1:
                merged = [max(a, b) for a, b in zip(merged, t)]
        if merged == target:
            return True
    return False


def triplets_gen(r):
    return [[[r.randint(1, 5) for _ in range(3)] for _ in range(r.randint(1, 6))], [r.randint(1, 5) for _ in range(3)]]


# ── Partition Labels (cut wherever the two sides share no letter) ──
def labels_brute(s):
    cuts = [0] + [i for i in range(1, len(s)) if not set(s[:i]) & set(s[i:])] + [len(s)]
    return [b - a for a, b in zip(cuts, cuts[1:])]


def labels_gen(r):
    return ["".join(r.choice("abcdef") for _ in range(r.randint(1, 10)))]


# ── Valid Parenthesis String (try every wildcard choice) ──
def paren_brute(s):
    stars = [i for i, ch in enumerate(s) if ch == "*"]
    for choice in product("()_", repeat=len(stars)):
        t = list(s)
        for i, c in zip(stars, choice):
            t[i] = c
        bal, ok = 0, True
        for ch in t:
            if ch == "(":
                bal += 1
            elif ch == ")":
                bal -= 1
            if bal < 0:
                ok = False
                break
        if ok and bal == 0:
            return True
    return False


def paren_gen(r):
    return ["".join(r.choice("()*") for _ in range(r.randint(0, 9)))]


SPEC = {
    "maximum-subarray": dict(
        fn="max_sub_array", brute=kadane_brute, gen=kadane_gen,
        cases=[
            ("a dip is worth crossing", [[2, -1, 3, -4, 5, 1]]),
            ("single number", [[-4]]),
            ("all negative", [[-5, -2, -8]]),
            ("all positive", [[1, 2, 3]]),
            ("restart after a deep dip", [[3, -10, 4, 1]]),
            ("zeros", [[0, 0, -1, 0]]),
            ("alternating", [[5, -4, 5, -4, 5]]),
        ],
    ),
    "jump-game": dict(
        fn="can_jump", brute=jump_brute, gen=jump_gen,
        cases=[
            ("enough reach", [[3, 0, 2, 0, 1]]),
            ("stuck on a zero", [[1, 1, 0, 0, 4]]),
            ("single cell", [[0]]),
            ("first jump is zero", [[0, 5]]),
            ("big first jump", [[9, 0, 0, 0, 0]]),
            ("exact landing", [[2, 0, 1]]),
            ("zero at the end is fine", [[2, 2, 0]]),
            ("hole in the middle", [[2, 1, 0, 0, 3]]),
        ],
    ),
    "jump-game-ii": dict(
        fn="jump", brute=jump2_brute, gen=jump2_gen,
        cases=[
            ("two jumps", [[2, 3, 1, 1, 2]]),
            ("single cell", [[0]]),
            ("one jump", [[5, 0, 0]]),
            ("each step is one", [[1, 1, 1, 1]]),
            ("long first jump", [[4, 1, 1, 1, 1, 1]]),
            ("choose the better landing", [[2, 4, 1, 1, 1, 1]]),
            ("two cells", [[1, 0]]),
        ],
    ),
    "gas-station": dict(
        fn="can_complete_circuit", brute=gas_brute, gen=gas_gen,
        cases=[
            ("start at the rich station", [[2, 3, 5, 1], [3, 4, 2, 2]]),
            ("not enough fuel overall", [[1, 1, 1], [2, 2, 2]]),
            ("single station enough", [[5], [4]]),
            ("single station short", [[3], [4]]),
            ("start at the end", [[1, 1, 6], [3, 3, 1]]),
            ("exactly enough", [[3, 1, 1], [1, 2, 2]]),
            ("start at zero", [[4, 1, 1], [1, 2, 2]]),
        ],
    ),
    "hand-of-straights": dict(
        fn="is_n_straight_hand", brute=hand_brute, gen=hand_gen,
        cases=[
            ("two runs of three", [[5, 6, 7, 6, 7, 8], 3]),
            ("a gap", [[1, 2, 4], 3]),
            ("size not divisible", [[1, 2, 3, 4], 3]),
            ("groups of one", [[7, 3, 9], 1]),
            ("duplicates need two runs", [[1, 1, 2, 2, 3, 3], 3]),
            ("overlapping runs", [[1, 2, 3, 3, 4, 5], 3]),
            ("runs of two", [[9, 8, 10, 7], 2]),
            ("too many of the smallest", [[1, 1, 1, 2, 3], 3]),
        ],
    ),
    "merge-triplets-to-form-target-triplet": dict(
        fn="merge_triplets", brute=triplets_brute, gen=triplets_gen,
        cases=[
            ("each part from a different triplet", [[[2, 1, 1], [1, 3, 1], [1, 1, 4]], [2, 3, 4]]),
            ("a too-large triplet is unusable", [[[2, 1, 1], [1, 3, 1], [1, 1, 4], [9, 9, 9]], [2, 3, 4]]),
            ("missing a position", [[[1, 1, 1], [2, 2, 1]], [2, 2, 3]]),
            ("single exact triplet", [[[3, 3, 3]], [3, 3, 3]]),
            ("single wrong triplet", [[[3, 3, 2]], [3, 3, 3]]),
            ("one triplet covers all", [[[1, 2, 3], [5, 5, 5]], [1, 2, 3]]),
            ("blocked by one large entry", [[[5, 1, 1], [1, 5, 1], [1, 1, 5], [1, 1, 9]], [5, 5, 5]]),
        ],
    ),
    "partition-labels": dict(
        fn="partition_labels", brute=labels_brute, gen=labels_gen,
        cases=[
            ("three parts", ["abacdxcdyz"]),
            ("single letter", ["a"]),
            ("one big part", ["abcab"]),
            ("all different", ["abcd"]),
            ("repeated letter spans everything", ["axxxa"]),
            ("blocks", ["aabbcc"]),
            ("nested", ["abccbaxy"]),
        ],
    ),
    "valid-parenthesis-string": dict(
        fn="check_valid_string", brute=paren_brute, gen=paren_gen,
        cases=[
            ("star as a closer", ["(*)"]),
            ("star as a closer at the end", ["(*"]),
            ("star as an opener", ["*)"]),
            ("unbalanced", ["((("]),
            ("closer first", [")("]),
            ("star cannot fix a leading closer", [")*"]),
            ("empty", [""]),
            ("many stars", ["**(*)*"]),
            ("too many openers", ["(**(("]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
