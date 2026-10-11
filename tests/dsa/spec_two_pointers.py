"""Two Pointers: one spec per problem (brute force, random inputs, hand-picked cases)."""
from itertools import combinations

TOPIC = "two-pointers"


def _alnum(s):
    return [c.lower() for c in s if c.isalnum()]


def pal_brute(s):
    t = _alnum(s)
    return t == t[::-1]


def pal_gen(r):
    if r.random() < 0.5:
        half = "".join(r.choice("abAB1 ,:") for _ in range(r.randint(0, 5)))
        return [half + r.choice(["", "x", "!"]) + half[::-1].swapcase()]
    return ["".join(r.choice("abAB1 ,:") for _ in range(r.randint(0, 9)))]


def pairs(numbers, target):
    return [(i, j) for i, j in combinations(range(len(numbers)), 2) if numbers[i] + numbers[j] == target]


def ts_brute(numbers, target):
    p = pairs(numbers, target)
    assert len(p) == 1, f"case needs exactly one pair, has {len(p)}"
    return [p[0][0] + 1, p[0][1] + 1]


def ts_gen(r):
    n = r.randint(2, 9)
    xs = sorted(r.randint(-8, 12) for _ in range(n))
    i, j = sorted(r.sample(range(n), 2))
    return [xs, xs[i] + xs[j]]


def ts_check(args, got):
    numbers, target = args
    return len(got) == 2 and 1 <= got[0] < got[1] <= len(numbers) and numbers[got[0] - 1] + numbers[got[1] - 1] == target


def three_brute(nums):
    return [list(t) for t in {tuple(sorted(c)) for c in combinations(nums, 3) if sum(c) == 0}]


def three_gen(r):
    return [[r.randint(-4, 4) for _ in range(r.randint(0, 9))]]


def area_brute(h):
    return max([(j - i) * min(h[i], h[j]) for i, j in combinations(range(len(h)), 2)] or [0])


def area_gen(r):
    return [[r.randint(0, 9) for _ in range(r.randint(2, 9))]]


def trap_brute(h):
    return sum(max(0, min(max(h[: i + 1]), max(h[i:])) - h[i]) for i in range(len(h)))


def trap_gen(r):
    return [[r.randint(0, 6) for _ in range(r.randint(0, 10))]]


SPEC = {
    "valid-palindrome": dict(
        fn="is_palindrome", brute=pal_brute, gen=pal_gen,
        cases=[
            ("sentence with punctuation", ["Was it a car or a cat I saw?"]),
            ("clearly not", ["hello, world"]),
            ("only punctuation", [".,! ?"]),
            ("empty", [""]),
            ("digits and letters", ["a1b1a"]),
            ("mixed case", ["Noon"]),
            ("single character", ["x"]),
            ("almost a palindrome", ["abca"]),
            ("digit mismatch", ["1a2"]),
            ("long with spaces", ["no lemon, no melon " * 5 + "x" + "".join(reversed("no lemon, no melon " * 5))]),
        ],
    ),
    "two-sum-ii-input-array-is-sorted": dict(
        fn="two_sum_sorted", brute=ts_brute, gen=ts_gen, check=ts_check,
        cases=[
            ("pair at the front", [[3, 8, 12, 20], 11]),
            ("pair in the middle", [[1, 4, 6, 9, 13, 18], 15]),
            ("pair at the ends", [[2, 5, 7, 30], 32]),
            ("negatives", [[-9, -4, 0, 3, 11], -1]),
            ("two equal values", [[1, 6, 6, 10], 12]),
            ("two elements", [[4, 9], 13]),
            ("zero target", [[-7, -2, 2, 5], 0]),
            ("larger array", [[2 ** k for k in range(20)], 2 ** 3 + 2 ** 17]),
        ],
    ),
    "3sum": dict(
        fn="three_sum", compare="nested", brute=three_brute, gen=three_gen,
        cases=[
            ("two triples", [[-5, 1, 4, 2, -3, 1, 2]]),
            ("no triple", [[1, 2, 4, 7]]),
            ("all zeros", [[0, 0, 0, 0, 0]]),
            ("fewer than three numbers", [[0, 0]]),
            ("empty", [[]]),
            ("duplicates must not repeat triples", [[-2, -2, 0, 0, 2, 2, 2]]),
            ("one big negative", [[-9, 2, 3, 4, 5, 7]]),
            ("many triples", [[-4, -2, -2, -1, 0, 1, 2, 2, 3, 4]]),
        ],
    ),
    "container-with-most-water": dict(
        fn="max_area", brute=area_brute, gen=area_gen,
        cases=[
            ("a tall pair far apart", [[2, 9, 4, 3, 8, 3, 7]]),
            ("two bars", [[5, 5]]),
            ("zeros at the ends", [[0, 6, 2, 6, 0]]),
            ("increasing", [[1, 2, 3, 4, 5, 6]]),
            ("decreasing", [[6, 5, 4, 3, 2, 1]]),
            ("all zero", [[0, 0, 0]]),
            ("one tall wall in the middle", [[1, 1, 20, 1, 1]]),
            ("larger", [[(i * 7) % 11 for i in range(40)]]),
        ],
    ),
    "trapping-rain-water": dict(
        fn="trap", brute=trap_brute, gen=trap_gen,
        cases=[
            ("two basins", [[3, 0, 2, 0, 4, 1, 0, 2]]),
            ("single basin", [[4, 1, 1, 4]]),
            ("flat", [[2, 2, 2]]),
            ("empty", [[]]),
            ("one bar", [[7]]),
            ("ascending staircase", [[0, 1, 2, 3, 4]]),
            ("valley with plateau", [[5, 2, 2, 2, 5]]),
            ("zeros", [[0, 0, 0]]),
            ("larger", [[(i * 5) % 9 for i in range(40)]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
