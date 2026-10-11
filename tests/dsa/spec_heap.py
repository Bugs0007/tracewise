"""Heap / priority queue: one spec per problem."""
import math

TOPIC = "heap"


def replay(cls):
    def run(ops, args):
        obj = cls(*args[0])
        out = [None]
        for op, a in zip(ops[1:], args[1:]):
            out.append(getattr(obj, op)(*a))
        return out

    return run


def script(name, ctor, *pairs):
    ops, args = [name], [list(ctor)]
    for p in pairs:
        ops.append(p[0])
        args.append(list(p[1:]))
    return [ops, args]


# ── Kth Largest in a Stream ──
class NaiveKth:
    def __init__(self, k, nums):
        self.k, self.items = k, list(nums)

    def add(self, v):
        self.items.append(v)
        return sorted(self.items)[-self.k]


def kth_stream_gen(r):
    k = r.randint(1, 4)
    nums = [r.randint(-5, 9) for _ in range(r.randint(0, 5))]
    adds = [r.randint(-5, 9) for _ in range(r.randint(1, 8))]
    # the problem guarantees at least k values exist whenever add is called
    while len(nums) + 1 < k:
        nums.append(r.randint(-5, 9))
    ops, args = ["KthLargest"], [[k, nums]]
    for v in adds:
        ops.append("add")
        args.append([v])
    return [ops, args]


# ── Last Stone Weight ──
def stones_brute(stones):
    s = sorted(stones)
    while len(s) > 1:
        a = s.pop()
        b = s.pop()
        if a != b:
            s.append(a - b)
            s.sort()
    return s[0] if s else 0


def stones_gen(r):
    return [[r.randint(1, 12) for _ in range(r.randint(0, 9))]]


# ── K Closest Points ──
def kclose_brute(points, k):
    return sorted(points, key=lambda p: p[0] ** 2 + p[1] ** 2)[:k]


def kclose_gen(r):
    pts = [[r.randint(-6, 6), r.randint(-6, 6)] for _ in range(r.randint(1, 9))]
    return [pts, r.randint(1, len(pts))]


def kclose_check(args, got):
    points, k = args
    d = lambda p: p[0] ** 2 + p[1] ** 2
    want = sorted(d(p) for p in points)[:k]
    if sorted(d(p) for p in got) != want:
        return False
    pool = [tuple(p) for p in points]
    for p in got:
        if tuple(p) not in pool:
            return False
        pool.remove(tuple(p))
    return True


# ── Kth Largest in an Array ──
def kth_arr_brute(nums, k):
    return sorted(nums, reverse=True)[k - 1]


def kth_arr_gen(r):
    nums = [r.randint(-8, 8) for _ in range(r.randint(1, 10))]
    return [nums, r.randint(1, len(nums))]


# ── Task Scheduler ──
def sched_brute(tasks, n):
    counts = {}
    for t in tasks:
        counts[t] = counts.get(t, 0) + 1
    most = max(counts.values()) if counts else 0
    ties = sum(1 for c in counts.values() if c == most)
    return max(len(tasks), (most - 1) * (n + 1) + ties) if tasks else 0


def sched_gen(r):
    return [[r.choice("ABCDE") for _ in range(r.randint(0, 12))], r.randint(0, 4)]


# ── Design Twitter ──
class NaiveTwitter:
    def __init__(self):
        self.posts, self.follows, self.t = [], {}, 0

    def post_tweet(self, u, tw):
        self.t += 1
        self.posts.append((self.t, u, tw))

    def get_news_feed(self, u):
        who = self.follows.get(u, set()) | {u}
        mine = [p for p in self.posts if p[1] in who]
        return [p[2] for p in sorted(mine, reverse=True)[:10]]

    def follow(self, a, b):
        self.follows.setdefault(a, set()).add(b)

    def unfollow(self, a, b):
        self.follows.get(a, set()).discard(b)


def twitter_gen(r):
    ops, args, tid = ["Twitter"], [[]], 100
    for _ in range(r.randint(2, 18)):
        op = r.choice(["post_tweet", "post_tweet", "get_news_feed", "follow", "unfollow"])
        ops.append(op)
        if op == "post_tweet":
            tid += 1
            args.append([r.randint(1, 3), tid])
        elif op == "get_news_feed":
            args.append([r.randint(1, 3)])
        else:
            args.append([r.randint(1, 3), r.randint(1, 3)])
    return [ops, args]


# ── Find Median from Data Stream ──
class NaiveMedian:
    def __init__(self):
        self.v = []

    def add_num(self, x):
        self.v.append(x)

    def find_median(self):
        s = sorted(self.v)
        m = len(s) // 2
        return float(s[m]) if len(s) % 2 else (s[m - 1] + s[m]) / 2


def median_gen(r):
    ops, args, size = ["MedianFinder"], [[]], 0
    for _ in range(r.randint(1, 14)):
        if size and r.random() < 0.4:
            ops.append("find_median")
            args.append([])
        else:
            ops.append("add_num")
            args.append([r.randint(-9, 9)])
            size += 1
    return [ops, args]


SPEC = {
    "kth-largest-element-in-a-stream": dict(
        fn="KthLargest", brute=replay(NaiveKth), gen=kth_stream_gen,
        cases=[
            ("k-th as numbers arrive", script("KthLargest", [3, [4, 5, 8, 2]], ("add", 3), ("add", 5), ("add", 10), ("add", 9), ("add", 4))),
            ("starts empty", script("KthLargest", [1, []], ("add", -3), ("add", -2), ("add", -4), ("add", 0))),
            ("k equals current size", script("KthLargest", [2, [7]], ("add", 3), ("add", 11), ("add", 5))),
            ("duplicates", script("KthLargest", [2, [5, 5, 5]], ("add", 5), ("add", 6), ("add", 1))),
            ("smaller values never matter", script("KthLargest", [2, [10, 20]], ("add", 1), ("add", 2), ("add", 3))),
            ("every add becomes the answer", script("KthLargest", [1, [1]], ("add", 2), ("add", 3), ("add", 4))),
            ("longer", script("KthLargest", [4, [1, 9, 3, 7, 5]], *[("add", (i * 5) % 11) for i in range(10)])),
        ],
    ),
    "last-stone-weight": dict(
        fn="last_stone_weight", brute=stones_brute, gen=stones_gen,
        cases=[
            ("classic smash", [[2, 7, 4, 1, 8, 1]]),
            ("single stone", [[5]]),
            ("everything cancels", [[3, 3]]),
            ("no stones", [[]]),
            ("two different", [[9, 4]]),
            ("equal pairs vanish", [[4, 4, 6, 6]]),
            ("one big one small", [[1, 1, 1, 20]]),
            ("many equal", [[2] * 7]),
            ("stones left over", [[10, 4, 2, 10]]),
        ],
    ),
    "k-closest-points-to-origin": dict(
        fn="k_closest", compare="unordered", brute=kclose_brute, gen=kclose_gen, check=kclose_check,
        cases=[
            ("two closest", [[[1, 3], [-2, 2], [5, 1]], 2]),
            ("one point", [[[4, 4]], 1]),
            ("all points", [[[1, 1], [2, 2], [3, 3]], 3]),
            ("negative coordinates", [[[-5, -5], [0, 1], [-1, 0], [3, 3]], 2]),
            ("origin included", [[[0, 0], [9, 9], [1, 0]], 2]),
            ("same direction", [[[1, 1], [2, 2], [3, 3], [4, 4]], 1]),
            ("distinct distances", [[[6, 0], [0, 5], [4, 0], [0, 3], [2, 0]], 3]),
            ("far point last", [[[1, 2], [2, 1], [30, 30]], 2]),
        ],
    ),
    "kth-largest-element-in-an-array": dict(
        fn="find_kth_largest", brute=kth_arr_brute, gen=kth_arr_gen,
        cases=[
            ("third largest", [[3, 2, 1, 5, 6, 4], 3]),
            ("largest", [[7, 2, 9, 4], 1]),
            ("smallest", [[7, 2, 9, 4], 4]),
            ("duplicates count separately", [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4]),
            ("single element", [[8], 1]),
            ("negatives", [[-4, -1, -7, -3], 2]),
            ("all equal", [[5, 5, 5, 5], 3]),
            ("already sorted", [[1, 2, 3, 4, 5, 6], 2]),
        ],
    ),
    "task-scheduler": dict(
        fn="least_interval", brute=sched_brute, gen=sched_gen,
        cases=[
            ("cooldown forces idle time", [list("AAABBB"), 2]),
            ("no cooldown", [list("AAABBB"), 0]),
            ("many kinds fill the gaps", [list("AABCDE"), 2]),
            ("one task type", [list("AAAA"), 3]),
            ("single task", [list("A"), 5]),
            ("no tasks", [[], 2]),
            ("tie for most frequent", [list("AAABBBCC"), 3]),
            ("enough variety hides the cooldown", [list("AABBCC"), 1]),
            ("long cooldown", [list("AABB"), 6]),
        ],
    ),
    "design-twitter": dict(
        fn="Twitter", brute=replay(NaiveTwitter), gen=twitter_gen,
        cases=[
            ("feed merges followed users", script("Twitter", [], ("post_tweet", 1, 5), ("post_tweet", 2, 6), ("get_news_feed", 1), ("follow", 1, 2), ("get_news_feed", 1), ("post_tweet", 2, 7), ("get_news_feed", 1))),
            ("unfollow removes tweets", script("Twitter", [], ("post_tweet", 1, 1), ("post_tweet", 2, 2), ("follow", 1, 2), ("get_news_feed", 1), ("unfollow", 1, 2), ("get_news_feed", 1))),
            ("empty feed", script("Twitter", [], ("get_news_feed", 1), ("follow", 1, 2), ("get_news_feed", 1))),
            ("only the ten newest", script("Twitter", [], *[("post_tweet", 1, i) for i in range(1, 15)], ("get_news_feed", 1))),
            ("feed is per user", script("Twitter", [], ("post_tweet", 1, 10), ("post_tweet", 2, 20), ("get_news_feed", 2), ("get_news_feed", 3))),
            ("following yourself changes nothing", script("Twitter", [], ("post_tweet", 1, 4), ("follow", 1, 1), ("get_news_feed", 1))),
            ("unfollow someone you never followed", script("Twitter", [], ("post_tweet", 2, 9), ("unfollow", 1, 2), ("get_news_feed", 1), ("get_news_feed", 2))),
            ("interleaved posts", script("Twitter", [], ("follow", 1, 2), ("follow", 1, 3), *[("post_tweet", 1 + i % 3, 100 + i) for i in range(13)], ("get_news_feed", 1))),
        ],
    ),
    "find-median-from-data-stream": dict(
        fn="MedianFinder", compare="float", brute=replay(NaiveMedian), gen=median_gen,
        cases=[
            ("median shifts", script("MedianFinder", [], ("add_num", 1), ("add_num", 2), ("find_median",), ("add_num", 3), ("find_median",))),
            ("single value", script("MedianFinder", [], ("add_num", 7), ("find_median",))),
            ("descending input", script("MedianFinder", [], ("add_num", 9), ("add_num", 5), ("add_num", 1), ("find_median",), ("add_num", 0), ("find_median",))),
            ("duplicates", script("MedianFinder", [], ("add_num", 4), ("add_num", 4), ("add_num", 4), ("find_median",))),
            ("negatives", script("MedianFinder", [], ("add_num", -5), ("add_num", -1), ("find_median",), ("add_num", -3), ("find_median",))),
            ("two values average", script("MedianFinder", [], ("add_num", 10), ("add_num", 20), ("find_median",))),
            ("long stream", script("MedianFinder", [], *[("add_num", (i * 7) % 13 - 6) for i in range(15)], ("find_median",))),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
