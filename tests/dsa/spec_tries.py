"""Tries: one spec per problem."""
import copy
import re

TOPIC = "tries"


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


# ── Implement Trie ──
class NaiveTrie:
    def __init__(self):
        self.words = set()

    def insert(self, w):
        self.words.add(w)

    def search(self, w):
        return w in self.words

    def starts_with(self, p):
        return any(w.startswith(p) for w in self.words)


def trie_gen(r):
    ops, args = ["Trie"], [[]]
    pool = ["".join(r.choice("abc") for _ in range(r.randint(1, 4))) for _ in range(5)]
    for _ in range(r.randint(1, 12)):
        op = r.choice(["insert", "search", "starts_with"])
        ops.append(op)
        args.append([r.choice(pool)])
    return [ops, args]


# ── Design Add and Search Words ──
class NaiveDict:
    def __init__(self):
        self.words = []

    def add_word(self, w):
        self.words.append(w)

    def search(self, pattern):
        rx = re.compile("^" + pattern.replace(".", "[a-z]") + "$")
        return any(rx.match(w) for w in self.words)


def dict_gen(r):
    ops, args = ["WordDictionary"], [[]]
    pool = ["".join(r.choice("abc") for _ in range(r.randint(1, 4))) for _ in range(5)]
    for _ in range(r.randint(1, 12)):
        if r.random() < 0.45:
            ops.append("add_word")
            args.append([r.choice(pool)])
        else:
            ops.append("search")
            w = list(r.choice(pool))
            for i in range(len(w)):
                if r.random() < 0.3:
                    w[i] = "."
            if r.random() < 0.2:
                w.append(r.choice("abc."))
            args.append(["".join(w)])
    return [ops, args]


# ── Word Search II ──
def ws_brute(board, words):
    rows, cols = len(board), len(board[0])

    def exists(word):
        def go(r, c, i, seen):
            if board[r][c] != word[i]:
                return False
            if i == len(word) - 1:
                return True
            seen.add((r, c))
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in seen and go(nr, nc, i + 1, seen):
                    seen.discard((r, c))
                    return True
            seen.discard((r, c))
            return False

        return any(go(r, c, 0, set()) for r in range(rows) for c in range(cols))

    return sorted({w for w in words if exists(w)})


def ws_gen(r):
    rows, cols = r.randint(1, 4), r.randint(1, 4)
    board = [[r.choice("abc") for _ in range(cols)] for _ in range(rows)]
    words = set()
    for _ in range(r.randint(1, 6)):
        words.add("".join(r.choice("abc") for _ in range(r.randint(1, 5))))
    if r.random() < 0.6:  # plant a word that is really on the board
        rr, cc = r.randrange(rows), r.randrange(cols)
        w = board[rr][cc]
        seen = {(rr, cc)}
        for _ in range(r.randint(0, 3)):
            opts = [(rr + dr, cc + dc) for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= rr + dr < rows and 0 <= cc + dc < cols and (rr + dr, cc + dc) not in seen]
            if not opts:
                break
            rr, cc = r.choice(opts)
            seen.add((rr, cc))
            w += board[rr][cc]
        words.add(w)
    return [board, sorted(words)]


SPEC = {
    "implement-trie-prefix-tree": dict(
        fn="Trie", brute=replay(NaiveTrie), gen=trie_gen,
        cases=[
            ("prefix is not a word", script("Trie", ("insert", "apple"), ("search", "apple"), ("search", "app"), ("starts_with", "app"))),
            ("word and its prefix", script("Trie", ("insert", "app"), ("insert", "apple"), ("search", "app"), ("search", "apple"), ("search", "apples"))),
            ("never inserted", script("Trie", ("search", "a"), ("starts_with", "a"))),
            ("diverging words", script("Trie", ("insert", "car"), ("insert", "cat"), ("starts_with", "ca"), ("search", "ca"), ("search", "cat"), ("search", "cap"))),
            ("single letters", script("Trie", ("insert", "a"), ("search", "a"), ("starts_with", "a"), ("starts_with", "b"))),
            ("inserting twice", script("Trie", ("insert", "tea"), ("insert", "tea"), ("search", "tea"), ("starts_with", "te"))),
            ("longer than anything stored", script("Trie", ("insert", "go"), ("starts_with", "gone"), ("search", "gone"))),
        ],
    ),
    "design-add-and-search-words-data-structure": dict(
        fn="WordDictionary", brute=replay(NaiveDict), gen=dict_gen,
        cases=[
            ("single wildcard", script("WordDictionary", ("add_word", "bad"), ("add_word", "dad"), ("add_word", "mad"), ("search", "pad"), ("search", "bad"), ("search", ".ad"), ("search", "b.."))),
            ("wrong length", script("WordDictionary", ("add_word", "cat"), ("search", "ca"), ("search", "cats"), ("search", "..."))),
            ("only wildcards", script("WordDictionary", ("add_word", "a"), ("add_word", "bc"), ("search", "."), ("search", ".."), ("search", "..."))),
            ("empty dictionary", script("WordDictionary", ("search", "a"), ("search", "."))),
            ("wildcard in the middle needs backtracking", script("WordDictionary", ("add_word", "abcd"), ("add_word", "axcz"), ("search", "a.cz"), ("search", "a.cd"), ("search", "a.ce"))),
            ("prefix only", script("WordDictionary", ("add_word", "apple"), ("search", "app"), ("search", "app.."), ("search", "appl."))),
            ("duplicates", script("WordDictionary", ("add_word", "go"), ("add_word", "go"), ("search", "g."), ("search", ".o"))),
        ],
    ),
    "word-search-ii": dict(
        fn="find_words", compare="unordered", brute=ws_brute, gen=ws_gen,
        cases=[
            ("two of four", [[["o", "a", "a", "n"], ["e", "t", "a", "e"], ["i", "h", "k", "r"], ["i", "f", "l", "v"]], ["oath", "pea", "eat", "rain"]]),
            ("cannot reuse a cell", [[["a", "b"], ["c", "d"]], ["abcb", "abdc"]]),
            ("single cell", [[["a"]], ["a", "b"]]),
            ("one row", [[["c", "a", "t"]], ["cat", "tac", "act", "ca"]]),
            ("one column", [[["d"], ["o"], ["g"]], ["dog", "god", "do"]]),
            ("word is a prefix of another", [[["t", "e", "a"], ["x", "x", "m"]], ["tea", "team", "te"]]),
            ("nothing found", [[["a", "b"], ["c", "d"]], ["xyz", "ac", "bd", "abdca"]]),
            ("same letters, long snake", [[["a", "b", "c"], ["f", "e", "d"], ["g", "h", "i"]], ["abcdefghi", "abcdefghia", "adg", "cfi"]]),
            ("many words share a prefix", [[["a", "a"], ["a", "a"]], ["a", "aa", "aaa", "aaaa", "aaaaa"]]),
        ],
    ),
}

if __name__ == "__main__":
    from dsa_lib import write_cases

    write_cases(TOPIC, SPEC)
