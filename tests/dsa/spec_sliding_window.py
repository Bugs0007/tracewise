"""Sliding Window: one spec per problem."""
from collections import Counter

TOPIC = "sliding-window"


def sa(r, alpha, lo, hi):
    return "".join(r.choice(alpha) for _ in range(r.randint(lo, hi)))


def profit_brute(p):
    return max([p[j] - p[i] for i in range(len(p)) for j in range(i + 1, len(p))] + [0])


def uniq_brute(s):
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            if len(set(s[i : j + 1])) == j - i + 1:
                best = max(best, j - i + 1)
    return best


def repl_brute(s, k):
    best = 0
    for i in range(len(s)):
        for j in range(i, len(s)):
            sub = s[i : j + 1]
            if len(sub) - max(Counter(sub).values()) <= k:
                best = max(best, len(sub))
    return best


def perm_brute(s1, s2):
    n = len(s1)
    return any(sorted(s2[i : i + n]) == sorted(s1) for i in range(len(s2) - n + 1))


def minwin_brute(s, t):
    best = None
    need = Counter(t)
    for i in range(len(s)):
        for j in range(i + len(t), len(s) + 1):
            if not (Counter(s[i:j]) & need) == need:
                continue
            if best is None or j - i < len(best):
                best = s[i:j]
            break
    return best or ""


def slide_brute(nums, k):
    return [max(nums[i : i + k]) for i in range(len(nums) - k + 1)]


def slide_gen(r):
    nums = [r.randint(-5, 9) for _ in range(r.randint(1, 10))]
    return [nums, r.randint(1, len(nums))]


SPEC = {
    "best-time-to-buy-and-sell-stock": dict(
        fn="max_profit", brute=profit_brute, gen=lambda r: [[r.randint(0, 9) for _ in range(r.randint(0, 8))]],
        cases=[
            ("buy low, sell later", [[5, 11, 3, 8, 1, 9]]),
            ("only falling prices", [[9, 7, 4, 2]]),
            ("empty", [[]]),
            ("single day", [[6]]),
            ("flat prices", [[4, 4, 4, 4]]),
            ("low price comes last", [[3, 8, 12, 1]]),
            ("rising all the way", [[1, 2, 3, 4, 5]]),
            ("long", [[(i * 37) % 23 + 5 for i in range(60)]]),
        ],
    ),
    "longest-substring-without-repeating-characters": dict(
        fn="length_of_longest_substring", brute=uniq_brute, gen=lambda r: [sa(r, "abc d", 0, 10)],
        cases=[
            ("window slides past a repeat", ["xyzxyabcd"]),
            ("all the same", ["aaaa"]),
            ("empty", [""]),
            ("one space", [" "]),
            ("repeat inside the window", ["tmmzuxt"]),
            ("all distinct", ["abcdefg"]),
            ("repeat at the very end", ["abcda"]),
            ("two letters alternating", ["ababababab"]),
            ("long", ["abcdefghij" * 5]),
        ],
    ),
    "longest-repeating-character-replacement": dict(
        fn="character_replacement", brute=repl_brute, gen=lambda r: [sa(r, "ABC", 0, 9), r.randint(0, 4)],
        cases=[
            ("one swap fixes it", ["QQQRQQQ", 1]),
            ("no replacements allowed", ["AABBBCC", 0]),
            ("replace everything", ["XYZ", 5]),
            ("empty", ["", 3]),
            ("single letter", ["A", 0]),
            ("two letters, two swaps", ["XYXYXZ", 2]),
            ("already uniform", ["KKKK", 2]),
            ("long", ["ABCABCABCABCABCABC", 3]),
        ],
    ),
    "permutation-in-string": dict(
        fn="check_inclusion", brute=perm_brute, gen=lambda r: [sa(r, "abc", 1, 4), sa(r, "abc", 0, 9)],
        cases=[
            ("hidden at the end", ["abc", "xxbcax"]),
            ("not present", ["abc", "aabbcc"]),
            ("same string", ["rain", "rain"]),
            ("pattern longer than text", ["abcd", "abc"]),
            ("single letter", ["z", "abzc"]),
            ("repeated letters matter", ["aab", "abababab"]),
            ("repeated letters absent", ["aab", "abcabcabc"]),
            ("empty text", ["a", ""]),
            ("long", ["abcde", "z" * 30 + "edcba" + "y" * 10]),
        ],
    ),
    "minimum-window-substring": dict(
        fn="min_window", brute=minwin_brute, gen=lambda r: [sa(r, "abc", 0, 10), sa(r, "abc", 1, 4)],
        cases=[
            ("window in the middle", ["xaybzcxabc", "abc"]),
            ("impossible", ["abc", "abd"]),
            ("whole string", ["abc", "abc"]),
            ("repeated needs", ["aabbbc", "abb"]),
            ("single letter", ["xyzx", "z"]),
            ("pattern longer than text", ["ab", "abc"]),
            ("empty text", ["", "a"]),
            ("leftmost wins ties", ["abxcab", "abc"]),
            ("long", ["x" * 20 + "abbc" + "y" * 20 + "cab", "abc"]),
        ],
    ),
    "sliding-window-maximum": dict(
        fn="max_sliding_window", brute=slide_brute, gen=slide_gen,
        cases=[
            ("window of three", [[2, 7, 1, 5, 3, 6, 4, 8], 3]),
            ("window of one", [[4, 2, 9], 1]),
            ("window is the whole array", [[3, 1, 4, 1, 5], 5]),
            ("decreasing", [[9, 8, 7, 6, 5], 2]),
            ("increasing", [[1, 2, 3, 4, 5], 2]),
            ("negatives", [[-4, -1, -7, -3, -9], 2]),
            ("equal values", [[5, 5, 5, 5], 3]),
            ("long", [[(i * 13) % 17 for i in range(50)], 7]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
