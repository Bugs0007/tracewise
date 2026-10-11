"""Binary Search: one spec per problem."""
TOPIC = "binary-search"


def sorted_distinct(r, lo=0, hi=9, lo_len=0, hi_len=10, span=40):
    n = r.randint(lo_len, hi_len)
    return sorted(r.sample(range(-span, span), n)) if n else []


# ── Binary Search ──
def bs_brute(nums, target):
    return nums.index(target) if target in nums else -1


def bs_gen(r):
    nums = sorted_distinct(r)
    target = r.choice(nums) if nums and r.random() < 0.6 else r.randint(-45, 45)
    return [nums, target]


# ── Search a 2D Matrix ──
def m2_brute(matrix, target):
    return any(target in row for row in matrix)


def m2_gen(r):
    rows, cols = r.randint(1, 4), r.randint(1, 4)
    flat = sorted(r.sample(range(0, 80), rows * cols))
    m = [flat[i * cols : (i + 1) * cols] for i in range(rows)]
    return [m, r.choice(flat) if r.random() < 0.5 else r.randint(-2, 82)]


# ── Koko Eating Bananas ──
def koko_brute(piles, h):
    k = 1
    while sum(-(-p // k) for p in piles) > h:
        k += 1
    return k


def koko_gen(r):
    piles = [r.randint(1, 15) for _ in range(r.randint(1, 5))]
    return [piles, r.randint(len(piles), sum(piles))]


# ── Rotated arrays ──
def rotate(r, nums):
    k = r.randint(0, max(0, len(nums) - 1))
    return nums[k:] + nums[:k]


def fm_brute(nums):
    return min(nums)


def fm_gen(r):
    return [rotate(r, sorted_distinct(r, lo_len=1, hi_len=9))]


def sr_gen(r):
    nums = rotate(r, sorted_distinct(r, lo_len=0, hi_len=9))
    target = r.choice(nums) if nums and r.random() < 0.6 else r.randint(-45, 45)
    return [nums, target]


# ── Time Based Key-Value Store ──
class NaiveTimeMap:
    def __init__(self):
        self.data = {}

    def set(self, key, value, ts):
        self.data.setdefault(key, []).append((ts, value))

    def get(self, key, ts):
        best = ""
        for t, v in self.data.get(key, []):
            if t <= ts:
                best = v
        return best


def replay(cls):
    def run(ops, args):
        obj = cls(*args[0])
        out = [None]
        for op, a in zip(ops[1:], args[1:]):
            out.append(getattr(obj, op)(*a))
        return out

    return run


def tm_gen(r):
    ops, args, clock = ["TimeMap"], [[]], 0
    for _ in range(r.randint(1, 14)):
        if r.random() < 0.55:
            clock += r.randint(1, 3)
            ops.append("set")
            args.append([r.choice("ab"), r.choice(["x", "y", "z", "w"]) + str(clock), clock])
        else:
            ops.append("get")
            args.append([r.choice("abc"), r.randint(0, clock + 2)])
    return [ops, args]


def tm(*calls):
    ops, args = ["TimeMap"], [[]]
    for c in calls:
        ops.append(c[0])
        args.append(list(c[1:]))
    return [ops, args]


# ── Median of Two Sorted Arrays ──
def med_brute(a, b):
    m = sorted(a + b)
    n = len(m)
    return float(m[n // 2]) if n % 2 else (m[n // 2 - 1] + m[n // 2]) / 2


def med_gen(r):
    while True:
        a = sorted_distinct(r, hi_len=6, span=30)
        b = sorted(r.randint(-30, 30) for _ in range(r.randint(0, 6)))
        if a or b:
            return [a, b]


SPEC = {
    "binary-search": dict(
        fn="search", brute=bs_brute, gen=bs_gen,
        cases=[
            ("found in the middle", [[-8, -3, 2, 7, 12, 19], 7]),
            ("missing between values", [[-8, -3, 2, 7, 12, 19], 5]),
            ("first element", [[4, 9, 15], 4]),
            ("last element", [[4, 9, 15], 15]),
            ("empty", [[], 3]),
            ("single element hit", [[6], 6]),
            ("single element miss", [[6], 7]),
            ("smaller than everything", [[10, 20, 30], -5]),
            ("larger than everything", [[10, 20, 30], 99]),
            ("long", [list(range(0, 400, 3)), 297]),
        ],
    ),
    "search-a-2d-matrix": dict(
        fn="search_matrix", brute=m2_brute, gen=m2_gen,
        cases=[
            ("found in a middle row", [[[2, 5, 8], [12, 15, 19], [24, 27, 33], [41, 46, 52]], 27]),
            ("missing", [[[2, 5, 8], [12, 15, 19], [24, 27, 33], [41, 46, 52]], 20]),
            ("first cell", [[[3, 6], [9, 12]], 3]),
            ("last cell", [[[3, 6], [9, 12]], 12]),
            ("single cell hit", [[[7]], 7]),
            ("single cell miss", [[[7]], 8]),
            ("one row", [[[1, 4, 9, 16, 25]], 16]),
            ("one column", [[[1], [4], [9], [16]], 9]),
            ("empty matrix", [[], 5]),
            ("larger", [[[i * 10 + j * 2 for j in range(5)] for i in range(8)], 62]),
        ],
    ),
    "koko-eating-bananas": dict(
        fn="min_eating_speed", brute=koko_brute, gen=koko_gen,
        cases=[
            ("moderate speed", [[4, 9, 7, 12], 8]),
            ("one hour per pile", [[3, 6, 9], 3]),
            ("lots of time", [[10, 20, 30], 60]),
            ("single pile", [[17], 5]),
            ("single pile, one hour", [[17], 1]),
            ("tight", [[30, 11, 23, 4, 20], 6]),
            ("equal piles", [[8, 8, 8, 8], 8]),
            ("big piles", [[1000, 2000, 3000], 10]),
        ],
    ),
    "find-minimum-in-rotated-sorted-array": dict(
        fn="find_min", brute=fm_brute, gen=fm_gen,
        cases=[
            ("rotated in the middle", [[15, 18, 22, 3, 6, 9, 12]]),
            ("rotated once", [[9, 1, 3, 5, 7]]),
            ("not rotated", [[2, 4, 6, 8]]),
            ("single element", [[5]]),
            ("two elements rotated", [[8, 3]]),
            ("two elements sorted", [[3, 8]]),
            ("minimum at the end", [[4, 6, 8, 10, 2]]),
            ("negatives", [[-2, 3, 9, -9, -6]]),
            ("long", [list(range(200, 400)) + list(range(0, 200))]),
        ],
    ),
    "search-in-rotated-sorted-array": dict(
        fn="search_rotated", brute=bs_brute, gen=sr_gen,
        cases=[
            ("target in the right block", [[15, 18, 22, 3, 6, 9, 12], 6]),
            ("target in the left block", [[15, 18, 22, 3, 6, 9, 12], 18]),
            ("missing", [[15, 18, 22, 3, 6, 9, 12], 10]),
            ("not rotated", [[2, 4, 6, 8, 10], 8]),
            ("single element hit", [[5], 5]),
            ("single element miss", [[5], 2]),
            ("two elements rotated", [[8, 3], 3]),
            ("empty", [[], 1]),
            ("pivot value itself", [[7, 9, 1, 3, 5], 1]),
            ("long", [list(range(100, 300)) + list(range(0, 100)), 42]),
        ],
    ),
    "time-based-key-value-store": dict(
        fn="TimeMap", brute=replay(NaiveTimeMap), gen=tm_gen,
        cases=[
            ("latest value at or before", tm(("set", "a", "x1", 1), ("set", "a", "x4", 4), ("get", "a", 1), ("get", "a", 3), ("get", "a", 4), ("get", "a", 9))),
            ("before the first set", tm(("set", "a", "x5", 5), ("get", "a", 2))),
            ("unknown key", tm(("set", "a", "v", 1), ("get", "b", 3))),
            ("two keys", tm(("set", "a", "p", 1), ("set", "b", "q", 2), ("set", "a", "r", 3), ("get", "a", 2), ("get", "b", 5), ("get", "a", 3))),
            ("only gets", tm(("get", "a", 1))),
            ("many timestamps", tm(*[("set", "k", f"v{t}", t * 2) for t in range(1, 30)], ("get", "k", 31), ("get", "k", 32), ("get", "k", 1), ("get", "k", 100))),
        ],
    ),
    "median-of-two-sorted-arrays": dict(
        fn="find_median", compare="float", brute=med_brute, gen=med_gen,
        cases=[
            ("interleaved, even total", [[1, 5, 9], [2, 6, 10]]),
            ("odd total", [[1, 4], [2, 3, 8]]),
            ("one empty", [[], [4, 6, 8]]),
            ("other empty", [[2, 3], []]),
            ("all of a below b", [[1, 2, 3], [10, 11, 12]]),
            ("all of a above b", [[10, 11], [1, 2, 3]]),
            ("single and single", [[3], [8]]),
            ("with duplicates", [[2, 2, 2], [2, 2]]),
            ("negatives", [[-9, -4, 0], [-6, 5]]),
            ("large", [list(range(0, 300, 3)), list(range(1, 200, 2))]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
