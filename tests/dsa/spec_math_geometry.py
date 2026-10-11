"""Math and geometry: one spec per problem."""

TOPIC = "math-geometry"


def replay(cls):
    def run(ops, args):
        obj = cls(*args[0])
        out = [None]
        for op, a in zip(ops[1:], args[1:]):
            out.append(getattr(obj, op)(*a))
        return out

    return run


def script(name, *pairs):
    ops, args = [name], [[]]
    for p in pairs:
        ops.append(p[0])
        args.append(list(p[1:]))
    return [ops, args]


def square(n, start=1):
    return [[start + r * n + c for c in range(n)] for r in range(n)]


# ── Rotate Image ──
def rotate_brute(m):
    return [list(row) for row in zip(*m[::-1])]


def rotate_gen(r):
    n = r.randint(1, 5)
    return [[[r.randint(0, 9) for _ in range(n)] for _ in range(n)]]


# ── Spiral Matrix (peel off the top row, turn the rest) ──
def spiral_brute(m):
    m = [list(row) for row in m]
    out = []
    while m:
        out += m.pop(0)
        m = [list(row) for row in zip(*m)][::-1]
    return out


def grid_gen(r):
    rows, cols = r.randint(1, 5), r.randint(1, 5)
    return [[[r.randint(0, 9) for _ in range(cols)] for _ in range(rows)]]


# ── Set Matrix Zeroes ──
def zeroes_brute(m):
    rows, cols = len(m), len(m[0])
    return [[0 if any(m[r][k] == 0 for k in range(cols)) or any(m[k][c] == 0 for k in range(rows)) else m[r][c] for c in range(cols)] for r in range(rows)]


def zeroes_gen(r):
    rows, cols = r.randint(1, 5), r.randint(1, 5)
    return [[[r.choice([0, 1, 2, 3, 4, 5, 6]) if r.random() < 0.8 else 0 for _ in range(cols)] for _ in range(rows)]]


# ── Happy Number ──
def happy_brute(n):
    for _ in range(200):
        if n == 1:
            return True
        n = sum(int(d) ** 2 for d in str(n))
    return False


# ── Plus One ──
def plus_brute(digits):
    return [int(ch) for ch in str(int("".join(map(str, digits))) + 1)]


def plus_gen(r):
    n = r.randint(1, 6)
    return [[r.choice([0, 9, 9, 1, 5, 8]) if i else r.choice([1, 9, 9, 5, 3]) for i in range(n)]]


# ── Pow(x, n) ──
def pow_brute(x, n):
    return float(x) ** n


def pow_gen(r):
    return [r.choice([-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 3]), r.randint(-7, 9)]


# ── Multiply Strings ──
def mult_brute(a, b):
    return str(int(a) * int(b))


def mult_gen(r):
    return ["".join(r.choice("0123456789") for _ in range(r.randint(1, 5))).lstrip("0") or "0", "".join(r.choice("0123456789") for _ in range(r.randint(1, 5))).lstrip("0") or "0"]


# ── Detect Squares ──
class NaiveSquares:
    def __init__(self):
        self.pts = []

    def add(self, p):
        self.pts.append(tuple(p))

    def count(self, p):
        x, y = p
        total = 0
        for a in self.pts:
            for b in self.pts:
                for c in self.pts:
                    # a is the diagonal point, b and c the two other corners
                    d = abs(a[0] - x)
                    if d == 0 or abs(a[1] - y) != d:
                        continue
                    if b == (x, a[1]) and c == (a[0], y):
                        total += 1
        return total


def squares_gen(r):
    ops, args = ["DetectSquares"], [[]]
    for _ in range(r.randint(3, 14)):
        op = r.choice(["add", "add", "count"])
        ops.append(op)
        args.append([[r.randint(0, 3), r.randint(0, 3)]])
    return [ops, args]


SPEC = {
    "rotate-image": dict(
        fn="rotate", brute=rotate_brute, gen=rotate_gen,
        cases=[
            ("three by three", [square(3)]),
            ("single cell", [[[7]]]),
            ("two by two", [[[1, 2], [3, 4]]]),
            ("four by four", [square(4)]),
            ("five by five", [square(5)]),
            ("negative numbers", [[[-1, -2], [-3, -4]]]),
            ("repeated values", [[[1, 1, 2], [1, 1, 2], [3, 3, 3]]]),
        ],
    ),
    "spiral-matrix": dict(
        fn="spiral_order", brute=spiral_brute, gen=grid_gen,
        cases=[
            ("three by three", [square(3)]),
            ("wide", [[[1, 2, 3, 4], [5, 6, 7, 8]]]),
            ("tall", [[[1, 2], [3, 4], [5, 6], [7, 8]]]),
            ("single cell", [[[9]]]),
            ("one row", [[[1, 2, 3, 4, 5]]]),
            ("one column", [[[1], [2], [3]]]),
            ("four by four", [square(4)]),
            ("three by four", [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]]),
        ],
    ),
    "set-matrix-zeroes": dict(
        fn="set_zeroes", brute=zeroes_brute, gen=zeroes_gen,
        cases=[
            ("one zero in the middle", [[[1, 2, 3], [4, 0, 6], [7, 8, 9]]]),
            ("no zeros", [[[1, 2], [3, 4]]]),
            ("zero in a corner", [[[0, 1], [2, 3]]]),
            ("several zeros", [[[1, 0, 3], [4, 5, 6], [0, 8, 9]]]),
            ("single cell zero", [[[0]]]),
            ("single cell", [[[5]]]),
            ("zero in a row of a wide grid", [[[1, 2, 3, 4], [5, 0, 7, 8]]]),
            ("all zero", [[[0, 0], [0, 0]]]),
        ],
    ),
    "happy-number": dict(
        fn="is_happy", brute=happy_brute, gen=lambda r: [r.randint(1, 999)],
        cases=[("happy", [19]), ("unhappy", [2]), ("one", [1]), ("ten", [10]), ("seven", [7]), ("four loops", [4]), ("big", [999]), ("hundred", [100])],
    ),
    "plus-one": dict(
        fn="plus_one", brute=plus_brute, gen=plus_gen,
        cases=[
            ("no carry", [[1, 2, 3]]),
            ("carry through nines", [[2, 9, 9]]),
            ("all nines", [[9, 9, 9]]),
            ("single digit", [[4]]),
            ("single nine", [[9]]),
            ("zero", [[0]]),
            ("carry into the middle", [[1, 9, 9, 8]]),
        ],
    ),
    "powx-n": dict(
        fn="my_pow", compare="float", brute=pow_brute, gen=pow_gen,
        cases=[
            ("two to the ten", [2, 10]),
            ("negative exponent", [2, -3]),
            ("zero exponent", [5, 0]),
            ("negative base odd", [-2, 3]),
            ("negative base even", [-2, 4]),
            ("fraction", [0.5, 4]),
            ("one", [1, 1000]),
            ("minus one", [-1, 7]),
        ],
    ),
    "multiply-strings": dict(
        fn="multiply", brute=mult_brute, gen=mult_gen,
        cases=[
            ("two by two digits", ["12", "34"]),
            ("zero", ["0", "999"]),
            ("single digits", ["7", "8"]),
            ("carries", ["99", "99"]),
            ("different lengths", ["1234", "5"]),
            ("power of ten", ["100", "100"]),
            ("big", ["987654", "321"]),
        ],
    ),
    "detect-squares": dict(
        fn="DetectSquares", brute=replay(NaiveSquares), gen=squares_gen,
        cases=[
            ("one square", script("DetectSquares", ("add", [1, 5]), ("add", [6, 2]), ("add", [1, 2]), ("count", [6, 5]), ("count", [9, 0]))),
            ("duplicate points multiply", script("DetectSquares", ("add", [0, 0]), ("add", [0, 2]), ("add", [2, 0]), ("add", [2, 0]), ("count", [2, 2]))),
            ("no corners", script("DetectSquares", ("count", [1, 1]))),
            ("same point is not a square", script("DetectSquares", ("add", [1, 1]), ("count", [1, 1]))),
            ("unit square", script("DetectSquares", ("add", [0, 0]), ("add", [0, 1]), ("add", [1, 0]), ("count", [1, 1]))),
            ("a rectangle is not a square", script("DetectSquares", ("add", [0, 0]), ("add", [0, 2]), ("add", [3, 0]), ("count", [3, 2]))),
            ("two squares share a corner", script("DetectSquares", ("add", [0, 0]), ("add", [0, 1]), ("add", [1, 0]), ("add", [0, -1]), ("add", [1, -1]), ("count", [1, 1]), ("count", [1, -1]))),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
