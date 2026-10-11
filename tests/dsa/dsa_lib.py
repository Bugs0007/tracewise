"""Shared helpers for the NeetCode track tests.

A problem lives in src/dsa/problems/<topic>/ as three files:
    <slug>.py            the solution (with #@anchor markers; they are plain comments)
    <slug>.cases.json    {"fn": ..., "compare": ..., "cases": [{"name", "args", "expected"}]}
    <slug>.harness.py    optional: an `adapter(fn, *args)` for design / linked-list / tree problems

The browser runner, these tests and the TypeScript trace test all read the same files.
Results are normalised with the browser harness (src/runner/harness.py) and compared with the same
modes as src/runner/compare.ts, so "passes here" means "passes in the app".
"""
import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PROBLEMS = ROOT / "src" / "dsa" / "problems"
sys.path.insert(0, str(ROOT / "src" / "runner"))
import harness as _harness  # noqa: E402  (the same module the browser runs)

MIN_CASES = 5


def problem_dir(topic):
    return PROBLEMS / topic


def load_cases(topic, slug):
    return json.loads((problem_dir(topic) / f"{slug}.cases.json").read_text(encoding="utf8"))


def load_solution(topic, slug):
    """Exec the solution (and its harness, if any) the way the browser does; return (namespace, fn, adapter)."""
    meta = load_cases(topic, slug)
    ns = {"__name__": "__main__"}
    hp = problem_dir(topic) / f"{slug}.harness.py"
    if hp.exists():
        exec(compile(hp.read_text(encoding="utf8"), str(hp), "exec"), ns)
    sp = problem_dir(topic) / f"{slug}.py"
    exec(compile(sp.read_text(encoding="utf8"), str(sp), "exec"), ns)
    return ns, ns[meta["fn"]], ns.get("adapter")


def call(fn, adapter, args):
    args = copy.deepcopy(args)
    value = adapter(fn, *args) if adapter else fn(*args)
    return _harness._jsonable(value)


def _canon(v):
    return json.dumps(v, sort_keys=True)


def _sorted(arr):
    return sorted(arr, key=_canon)


def _approx(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return abs(a - b) <= 1e-6 * max(1, abs(a), abs(b))
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_approx(x, y) for x, y in zip(a, b))
    return a == b


def matches(got, expected, mode="exact"):
    if mode == "unordered" and isinstance(got, list) and isinstance(expected, list):
        return _sorted(got) == _sorted(expected)
    if mode == "nested" and isinstance(got, list) and isinstance(expected, list):

        def norm(a):
            return _sorted([_sorted(x) if isinstance(x, list) else x for x in a])

        return norm(got) == norm(expected)
    if mode == "float":
        return _approx(got, expected)
    return got == expected


def case_params(topic, slugs):
    """(slug, case) pairs for pytest.mark.parametrize, with readable ids."""
    out = []
    for slug in slugs:
        for i, c in enumerate(load_cases(topic, slug)["cases"]):
            out.append(pytest.param(slug, c, id=f"{slug}[{i}] {c['name']}"))
    return out


# ─── topic specs ────────────────────────────────────────────────────────────
# A topic's spec_<topic>.py describes every problem once:
#   SPEC[slug] = dict(
#       fn="function_or_class_name", compare="exact" | "unordered" | "nested" | "float",
#       brute=lambda *args: expected,        # slow but obviously correct; computes the expected values below
#       gen=lambda rng: [args...],           # random valid inputs for property tests
#       cases=[("name", [args...]), ...],    # hand-picked inputs, including edge cases (5+)
#       check=lambda args, got: bool,        # optional: for problems with several valid answers
#   )
# write_cases() turns it into the shared .cases.json files; generic_tests() builds the pytest checks.
import random as _random


def write_cases(topic, spec):
    for slug, s in spec.items():
        cases = [{"name": n, "args": a, "expected": _harness._jsonable(s["brute"](*copy.deepcopy(a)))} for n, a in s["cases"]]
        d = {"fn": s["fn"]}
        if s.get("compare", "exact") != "exact":
            d["compare"] = s["compare"]
        d["cases"] = cases
        (problem_dir(topic) / f"{slug}.cases.json").write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n", encoding="utf8")


def generic_tests(topic, spec, trials=150, seed=11):
    """pytest functions: enough cases, shared cases pass, and random inputs agree with the brute force."""
    slugs = list(spec)

    @pytest.mark.parametrize("slug", slugs)
    def test_has_enough_cases(slug):
        assert len(load_cases(topic, slug)["cases"]) >= MIN_CASES

    @pytest.mark.parametrize("slug,case", case_params(topic, slugs))
    def test_shared_cases(slug, case):
        meta = load_cases(topic, slug)
        _, fn, adapter = load_solution(topic, slug)
        got = call(fn, adapter, case["args"])
        assert matches(got, case["expected"], meta.get("compare", "exact")), f"got {got!r}, expected {case['expected']!r}"

    @pytest.mark.parametrize("slug", slugs)
    def test_matches_brute_force(slug):
        s = spec[slug]
        _, fn, adapter = load_solution(topic, slug)
        rng = _random.Random(seed)
        for _ in range(trials):
            args = s["gen"](rng)
            got = call(fn, adapter, args)
            if "check" in s:
                assert s["check"](copy.deepcopy(args), got), f"args {args!r} gave {got!r}"
            else:
                want = _harness._jsonable(s["brute"](*copy.deepcopy(args)))
                assert matches(got, want, s.get("compare", "exact")), f"args {args!r}: got {got!r}, want {want!r}"

    return {"test_has_enough_cases": test_has_enough_cases, "test_shared_cases": test_shared_cases, "test_matches_brute_force": test_matches_brute_force}
