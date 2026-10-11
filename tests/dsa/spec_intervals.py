"""Intervals: one spec per problem."""
from itertools import combinations

TOPIC = "intervals"


def rand_intervals(r, n, hi=12, allow_point=False):
    out = []
    for _ in range(n):
        a = r.randint(0, hi)
        b = a + r.randint(0 if allow_point else 1, 5)
        out.append([a, b])
    return out


# ── Insert Interval (add the interval, then merge everything with a different routine) ──
def merge_all(intervals):
    items = sorted(intervals)
    changed = True
    while changed:
        changed = False
        for i in range(len(items) - 1):
            if items[i + 1][0] <= items[i][1]:
                items[i : i + 2] = [[items[i][0], max(items[i][1], items[i + 1][1])]]
                changed = True
                break
    return items


def insert_brute(intervals, new):
    return merge_all([list(x) for x in intervals] + [list(new)])


def insert_gen(r):
    edges = sorted(r.sample(range(0, 30), r.randint(0, 4) * 2))
    intervals = [[edges[i], edges[i + 1]] for i in range(0, len(edges), 2)]
    a = r.randint(0, 30)
    return [intervals, [a, a + r.randint(0, 6)]]


# ── Merge Intervals ──
def merge_brute(intervals):
    return merge_all([list(x) for x in intervals])


def merge_gen(r):
    return [rand_intervals(r, r.randint(1, 7), allow_point=True)]


# ── Non-overlapping Intervals (largest set to keep) ──
def keep_brute(intervals):
    best = 0
    n = len(intervals)
    for k in range(n + 1):
        for combo in combinations(range(n), k):
            chosen = sorted(intervals[i] for i in combo)
            if all(chosen[i][1] <= chosen[i + 1][0] for i in range(len(chosen) - 1)):
                best = max(best, k)
    return n - best


def keep_gen(r):
    return [rand_intervals(r, r.randint(0, 8))]


# ── Meeting Rooms ──
def attend_brute(intervals):
    return not any(a[0] < b[1] and b[0] < a[1] for i, a in enumerate(intervals) for b in intervals[i + 1 :])


# ── Meeting Rooms II (busiest moment) ──
def rooms_brute(intervals):
    if not intervals:
        return 0
    return max(sum(1 for s, e in intervals if s <= t < e) for t in range(min(s for s, _ in intervals), max(e for _, e in intervals) + 1))


# ── Minimum Interval to Include Each Query ──
def query_brute(intervals, queries):
    out = []
    for q in queries:
        sizes = [e - s + 1 for s, e in intervals if s <= q <= e]
        out.append(min(sizes) if sizes else -1)
    return out


def query_gen(r):
    return [rand_intervals(r, r.randint(0, 6), hi=10, allow_point=True), [r.randint(0, 14) for _ in range(r.randint(1, 6))]]


SPEC = {
    "insert-interval": dict(
        fn="insert", brute=insert_brute, gen=insert_gen,
        cases=[
            ("swallows two intervals", [[[1, 3], [6, 9], [11, 13]], [5, 12]]),
            ("fits in a gap", [[[1, 2], [8, 9]], [4, 5]]),
            ("empty list", [[], [3, 4]]),
            ("before everything", [[[5, 6], [8, 9]], [1, 2]]),
            ("after everything", [[[1, 2], [3, 4]], [7, 8]]),
            ("touching an end merges", [[[1, 3], [6, 8]], [3, 6]]),
            ("inside an interval", [[[2, 10]], [4, 5]]),
            ("covers everything", [[[2, 3], [5, 6]], [0, 9]]),
        ],
    ),
    "merge-intervals": dict(
        fn="merge", brute=merge_brute, gen=merge_gen,
        cases=[
            ("overlaps and a gap", [[[8, 11], [1, 4], [3, 6], [14, 16]]]),
            ("touching intervals merge", [[[1, 2], [2, 3], [3, 4]]]),
            ("single interval", [[[5, 9]]]),
            ("one inside another", [[[1, 10], [3, 4], [5, 6]]]),
            ("unsorted input", [[[9, 12], [1, 2], [5, 6], [2, 4]]]),
            ("all separate", [[[1, 2], [4, 5], [7, 8]]]),
            ("identical", [[[3, 5], [3, 5]]]),
            ("long chain", [[[1, 3], [2, 5], [4, 7], [6, 9], [8, 11]]]),
        ],
    ),
    "non-overlapping-intervals": dict(
        fn="erase_overlap_intervals", brute=keep_brute, gen=keep_gen,
        cases=[
            ("drop the long one", [[[1, 5], [2, 3], [3, 4]]]),
            ("already fine", [[[1, 2], [2, 3], [3, 4]]]),
            ("all the same", [[[1, 4], [1, 4], [1, 4]]]),
            ("empty", [[]]),
            ("one interval", [[[2, 7]]]),
            ("nested", [[[1, 10], [2, 3], [4, 5], [6, 7]]]),
            ("chain of overlaps", [[[1, 3], [2, 4], [3, 5], [4, 6]]]),
            ("end earlier is better", [[[1, 6], [2, 4], [5, 7]]]),
        ],
    ),
    "meeting-rooms": dict(
        fn="can_attend_meetings", brute=attend_brute, gen=lambda r: [rand_intervals(r, r.randint(0, 6))],
        cases=[
            ("overlap", [[[2, 40], [6, 12], [18, 24]]]),
            ("back to back is fine", [[[1, 3], [3, 5], [5, 7]]]),
            ("empty", [[]]),
            ("single", [[[4, 9]]]),
            ("unsorted and clear", [[[9, 10], [1, 2], [4, 5]]]),
            ("tiny overlap", [[[1, 4], [3, 6]]]),
            ("identical", [[[2, 5], [2, 5]]]),
        ],
    ),
    "meeting-rooms-ii": dict(
        fn="min_meeting_rooms", brute=rooms_brute, gen=lambda r: [rand_intervals(r, r.randint(0, 7))],
        cases=[
            ("two at once", [[[2, 40], [6, 12], [18, 24]]]),
            ("sequential", [[[1, 2], [2, 3], [3, 4]]]),
            ("all together", [[[1, 5], [2, 6], [3, 7], [4, 8]]]),
            ("empty", [[]]),
            ("single", [[[3, 9]]]),
            ("reuse a room", [[[1, 4], [2, 5], [4, 6]]]),
            ("late burst", [[[0, 2], [5, 9], [6, 8], [7, 10]]]),
            ("nested", [[[1, 10], [2, 9], [3, 8]]]),
        ],
    ),
    "minimum-interval-to-include-each-query": dict(
        fn="min_interval", brute=query_brute, gen=query_gen,
        cases=[
            ("smallest containing interval", [[[1, 6], [2, 4], [5, 9]], [3, 5, 12]]),
            ("no interval", [[[4, 5]], [1, 9]]),
            ("single point interval", [[[7, 7]], [7, 8]]),
            ("queries out of order", [[[1, 10], [3, 5]], [6, 4, 3]]),
            ("duplicate queries", [[[2, 8], [3, 4]], [3, 3, 9]]),
            ("empty intervals", [[], [1, 2]]),
            ("nested", [[[1, 20], [5, 15], [8, 10]], [9, 12, 2, 17]]),
            ("boundaries are included", [[[2, 4], [4, 9]], [2, 4, 9]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
