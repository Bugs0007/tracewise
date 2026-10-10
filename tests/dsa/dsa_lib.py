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
