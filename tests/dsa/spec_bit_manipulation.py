"""Bit manipulation: one spec per problem."""
from collections import Counter

TOPIC = "bit-manipulation"


# ── Single Number ──
def single_brute(nums):
    return next(v for v, c in Counter(nums).items() if c == 1)


def single_gen(r):
    vals = r.sample(range(-20, 40), r.randint(1, 5))
    nums = [vals[0]] + [v for v in vals[1:] for _ in range(2)]
    r.shuffle(nums)
    return [nums]


# ── Number of 1 Bits ──
def pop_brute(n):
    return bin(n).count("1")


# ── Counting Bits ──
def bits_brute(n):
    return [bin(i).count("1") for i in range(n + 1)]


# ── Reverse Bits (32 bit) ──
def revbits_brute(n):
    return int(format(n, "032b")[::-1], 2)


# ── Missing Number ──
def missing_brute(nums):
    return next(v for v in range(len(nums) + 1) if v not in set(nums))


def missing_gen(r):
    n = r.randint(1, 9)
    vals = list(range(n + 1))
    vals.remove(r.choice(vals))
    r.shuffle(vals)
    return [vals]


# ── Sum of Two Integers ──
def sum_brute(a, b):
    return a + b


# ── Reverse Integer ──
def revint_brute(x):
    s = str(abs(x))[::-1]
    v = int(s) * (-1 if x < 0 else 1)
    return v if -(2**31) <= v <= 2**31 - 1 else 0


SPEC = {
    "single-number": dict(
        fn="single_number", brute=single_brute, gen=single_gen,
        cases=[
            ("one odd one out", [[4, 7, 4, 9, 7]]),
            ("single element", [[11]]),
            ("negative numbers", [[-3, 5, -3]]),
            ("zero is the loner", [[0, 6, 6]]),
            ("many pairs", [[1, 2, 3, 2, 1, 5, 3]]),
            ("large values", [[100000, 7, 100000]]),
            ("pairs far apart", [[8, 1, 2, 1, 2]]),
        ],
    ),
    "number-of-1-bits": dict(
        fn="hamming_weight", brute=pop_brute, gen=lambda r: [r.randint(0, 2**32 - 1)],
        cases=[("eleven", [11]), ("zero", [0]), ("power of two", [64]), ("all ones in a byte", [255]), ("alternating", [0b10101010]), ("max 32 bit", [2**32 - 1]), ("single high bit", [2**31]), ("one", [1])],
    ),
    "counting-bits": dict(
        fn="count_bits", brute=bits_brute, gen=lambda r: [r.randint(0, 40)],
        cases=[("up to five", [5]), ("zero", [0]), ("one", [1]), ("up to eight", [8]), ("up to sixteen", [16]), ("up to fifteen", [15]), ("up to thirty", [30])],
    ),
    "reverse-bits": dict(
        fn="reverse_bits", brute=revbits_brute, gen=lambda r: [r.randint(0, 2**32 - 1)],
        cases=[("small", [6]), ("zero", [0]), ("one", [1]), ("all ones", [2**32 - 1]), ("high bit", [2**31]), ("alternating", [0xAAAAAAAA]), ("byte", [255]), ("palindrome bits", [0x80000001])],
    ),
    "missing-number": dict(
        fn="missing_number", brute=missing_brute, gen=missing_gen,
        cases=[
            ("missing in the middle", [[3, 0, 1, 5, 4]]),
            ("missing zero", [[1, 2, 3]]),
            ("missing the last", [[0, 1, 2]]),
            ("single zero present", [[0]]),
            ("single one present", [[1]]),
            ("unsorted", [[4, 2, 0, 1]]),
            ("longer", [[5, 8, 2, 7, 0, 3, 1, 6]]),
        ],
    ),
    "sum-of-two-integers": dict(
        fn="get_sum", brute=sum_brute, gen=lambda r: [r.randint(-1000, 1000), r.randint(-1000, 1000)],
        cases=[("small", [5, 7]), ("with zero", [0, 9]), ("negative result", [-4, -9]), ("cancel out", [6, -6]), ("carry chain", [255, 1]), ("mixed signs", [-3, 10]), ("large", [123456, 654321]), ("both negative", [-100, -200])],
    ),
    "reverse-integer": dict(
        fn="reverse", brute=revint_brute, gen=lambda r: [r.randint(-10**6, 10**6)],
        cases=[("simple", [3457]), ("negative", [-908]), ("trailing zeros vanish", [1200]), ("zero", [0]), ("single digit", [7]), ("overflow gives zero", [1999999999]), ("negative overflow", [-1999999999]), ("palindrome", [1221])],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
