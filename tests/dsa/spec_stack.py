"""Stack: one spec per problem."""
from fractions import Fraction
from itertools import product

TOPIC = "stack"


# ── Valid Parentheses ──
def paren_brute(s):
    prev = None
    while prev != s:
        prev = s
        s = s.replace("()", "").replace("[]", "").replace("{}", "")
    return s == ""


def paren_gen(r):
    if r.random() < 0.5:  # a balanced string, sometimes corrupted
        out = ""
        for _ in range(r.randint(0, 4)):
            a, b = r.choice(["()", "[]", "{}"])
            out = a + out + b if r.random() < 0.5 else out + a + b
        if out and r.random() < 0.4:
            i = r.randrange(len(out))
            out = out[:i] + r.choice("()[]{}") + out[i + 1 :]
        return [out]
    return ["".join(r.choice("()[]{}") for _ in range(r.randint(0, 8)))]


# ── Min Stack (operations replayed on the class) ──
class NaiveMinStack:
    def __init__(self):
        self.items = []

    def push(self, v):
        self.items.append(v)

    def pop(self):
        self.items.pop()

    def top(self):
        return self.items[-1]

    def get_min(self):
        return min(self.items)


def replay(cls):
    def run(ops, args):
        obj = cls(*args[0])
        out = [None]
        for op, a in zip(ops[1:], args[1:]):
            out.append(getattr(obj, op)(*a))
        return out

    return run


def minstack_gen(r):
    ops, args, size = ["MinStack"], [[]], 0
    for _ in range(r.randint(1, 12)):
        choices = ["push"] + (["pop", "top", "get_min"] if size else [])
        op = r.choice(choices)
        ops.append(op)
        if op == "push":
            args.append([r.randint(-6, 9)])
            size += 1
        else:
            args.append([])
            if op == "pop":
                size -= 1
    return [ops, args]


def ms(*pairs):
    ops, args = ["MinStack"], [[]]
    for p in pairs:
        ops.append(p[0])
        args.append(list(p[1:]))
    return [ops, args]


# ── Evaluate Reverse Polish Notation ──
def rpn_brute(tokens):
    toks = list(tokens)

    def go():
        t = toks.pop()
        if t in ("+", "-", "*", "/"):
            b = go()
            a = go()
            return a + b if t == "+" else a - b if t == "-" else a * b if t == "*" else int(Fraction(a, b))
        return int(t)

    return go()


def rpn_gen(r):
    for _ in range(100):
        def tree(d):
            if d == 0 or r.random() < 0.3:
                return str(r.randint(-9, 9))
            return [r.choice("+-*/"), tree(d - 1), tree(d - 1)]

        def flat(t):
            return [t] if isinstance(t, str) else flat(t[1]) + flat(t[2]) + [t[0]]

        toks = flat(tree(3))
        try:
            rpn_brute(toks)
            return [toks]
        except ZeroDivisionError:
            continue
    return [["2", "3", "+"]]


# ── Generate Parentheses ──
def gen_brute(n):
    out = []
    for combo in product("()", repeat=2 * n):
        s = "".join(combo)
        bal = 0
        for c in s:
            bal += 1 if c == "(" else -1
            if bal < 0:
                break
        else:
            if bal == 0:
                out.append(s)
    return out


# ── Daily Temperatures ──
def temps_brute(t):
    res = []
    for i in range(len(t)):
        wait = 0
        for j in range(i + 1, len(t)):
            if t[j] > t[i]:
                wait = j - i
                break
        res.append(wait)
    return res


# ── Car Fleet ──
def fleet_brute(target, position, speed):
    cars = sorted(zip(position, speed), reverse=True)
    times = [Fraction(target - p, s) for p, s in cars]
    return sum(1 for i, t in enumerate(times) if all(t > times[j] for j in range(i)))


def fleet_gen(r):
    n = r.randint(0, 7)
    target = r.randint(10, 30)
    pos = r.sample(range(0, target), min(n, target))
    return [target, pos, [r.randint(1, 6) for _ in pos]]


# ── Largest Rectangle in Histogram ──
def rect_brute(h):
    best = 0
    for i in range(len(h)):
        for j in range(i, len(h)):
            best = max(best, min(h[i : j + 1]) * (j - i + 1))
    return best


SPEC = {
    "valid-parentheses": dict(
        fn="is_valid", brute=paren_brute, gen=paren_gen,
        cases=[
            ("nested pairs", ["{[()()]}"]),
            ("wrong closer", ["([)]"]),
            ("unclosed opener", ["(("]),
            ("closer first", [")("]),
            ("empty", [""]),
            ("side by side", ["()[]{}"]),
            ("single opener", ["["]),
            ("single closer", ["}"]),
            ("deep", ["(" * 30 + ")" * 30]),
            ("deep but one off", ["(" * 30 + ")" * 29 + "]"]),
        ],
    ),
    "min-stack": dict(
        fn="MinStack", brute=replay(NaiveMinStack), gen=minstack_gen,
        cases=[
            ("min follows pops", ms(("push", 5), ("push", 2), ("push", 8), ("get_min",), ("pop",), ("get_min",), ("pop",), ("get_min",), ("top",))),
            ("single element", ms(("push", 4), ("top",), ("get_min",))),
            ("duplicate minimums", ms(("push", 3), ("push", 3), ("get_min",), ("pop",), ("get_min",))),
            ("negatives", ms(("push", -2), ("push", 0), ("push", -5), ("get_min",), ("pop",), ("get_min",))),
            ("min changes back up", ms(("push", 9), ("push", 1), ("pop",), ("get_min",), ("top",))),
            ("push after pops", ms(("push", 2), ("pop",), ("push", 7), ("get_min",), ("top",))),
            ("long run", ms(*[("push", (i * 7) % 11 - 5) for i in range(25)], ("get_min",), *[("pop",)] * 12, ("get_min",), ("top",))),
        ],
    ),
    "evaluate-reverse-polish-notation": dict(
        fn="eval_rpn", brute=rpn_brute, gen=rpn_gen,
        cases=[
            ("add then multiply", [["3", "4", "+", "2", "*"]]),
            ("single number", [["42"]]),
            ("subtraction order", [["10", "4", "-"]]),
            ("division truncates toward zero", [["7", "2", "/"]]),
            ("negative division truncates toward zero", [["-7", "2", "/"]]),
            ("negative operands", [["-3", "-4", "*", "5", "+"]]),
            ("deeper tree", [["2", "1", "+", "3", "*", "9", "6", "/", "-"]]),
            ("division by a larger number", [["1", "5", "/"]]),
            ("longer chain", [["5", "1", "2", "+", "4", "*", "+", "3", "-"]]),
        ],
    ),
    "generate-parentheses": dict(
        fn="generate_parenthesis", compare="unordered", brute=gen_brute, gen=lambda r: [r.randint(0, 5)],
        cases=[
            ("n = 1", [1]),
            ("n = 2", [2]),
            ("n = 3", [3]),
            ("n = 4", [4]),
            ("n = 5", [5]),
            ("n = 6", [6]),
        ],
    ),
    "daily-temperatures": dict(
        fn="daily_temperatures", brute=temps_brute, gen=lambda r: [[r.randint(10, 40) for _ in range(r.randint(0, 9))]],
        cases=[
            ("warmer days ahead", [[30, 60, 90, 50, 40, 70]]),
            ("never warmer", [[50, 40, 30, 20]]),
            ("single day", [[25]]),
            ("empty", [[]]),
            ("all equal", [[20, 20, 20]]),
            ("rising", [[10, 20, 30, 40]]),
            ("valley", [[45, 30, 25, 28, 50]]),
            ("long", [[(i * 17) % 31 + 10 for i in range(60)]]),
        ],
    ),
    "car-fleet": dict(
        fn="car_fleet", brute=fleet_brute, gen=fleet_gen,
        cases=[
            ("cars merge into fleets", [20, [4, 2, 12, 8, 14], [3, 5, 1, 4, 2]]),
            ("single car", [10, [3], [2]]),
            ("no cars", [10, [], []]),
            ("faster car behind catches up", [12, [0, 6], [4, 1]]),
            ("identical arrival times join", [12, [2, 4, 6], [1, 2, 3]]),
            ("all separate", [30, [10, 20, 28], [1, 2, 3]]),
            ("everyone slows to the front car", [100, [10, 20, 30, 40], [9, 8, 7, 1]]),
            ("many cars", [60, list(range(0, 50, 5)), [(i * 3) % 7 + 1 for i in range(10)]]),
        ],
    ),
    "largest-rectangle-in-histogram": dict(
        fn="largest_rectangle_area", brute=rect_brute, gen=lambda r: [[r.randint(0, 7) for _ in range(r.randint(0, 9))]],
        cases=[
            ("a tall pair", [[3, 1, 5, 6, 2, 3]]),
            ("single bar", [[7]]),
            ("empty", [[]]),
            ("all equal", [[4, 4, 4, 4]]),
            ("increasing", [[1, 2, 3, 4, 5]]),
            ("decreasing", [[5, 4, 3, 2, 1]]),
            ("zero splits the bars", [[2, 0, 2, 5, 5]]),
            ("valley", [[6, 1, 6]]),
            ("long", [[(i * 7) % 13 + 1 for i in range(40)]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
