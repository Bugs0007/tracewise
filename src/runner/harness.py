# Test harness shared by the in-browser Pyodide worker and the offline content
# validator (CPython). Keep it dependency-free and Python 3.11+ compatible.
import copy
import io
import json
import sys
import traceback

USER_FILE = "<your code>"


def _jsonable(x, depth=0):
    if depth > 40:
        return "..."
    if x is None or isinstance(x, (bool, int, str)):
        return x
    if isinstance(x, float):
        if x != x:
            return "NaN"
        if x in (float("inf"), float("-inf")):
            return "Infinity" if x > 0 else "-Infinity"
        return x
    if isinstance(x, (list, tuple)):
        return [_jsonable(v, depth + 1) for v in x]
    if isinstance(x, (set, frozenset)):
        items = [_jsonable(v, depth + 1) for v in x]
        try:
            return sorted(items)
        except TypeError:
            return sorted(items, key=lambda v: json.dumps(v, sort_keys=True))
    if isinstance(x, dict):
        return {str(k): _jsonable(v, depth + 1) for k, v in x.items()}
    if type(x).__name__ in ("generator", "map", "filter", "zip", "range", "dict_keys", "dict_values", "dict_items", "deque"):
        return [_jsonable(v, depth + 1) for v in x]
    return repr(x)


def _exc_info(e):
    line = None
    for fr in traceback.extract_tb(e.__traceback__):
        if fr.filename == USER_FILE:
            line = fr.lineno
    return f"{type(e).__name__}: {e}", line


def _reset_modules(prefixes=("minidjango", "minillm")):
    for name in list(sys.modules):
        if name.split(".")[0] in prefixes:
            del sys.modules[name]


def _load(code, harness, ns):
    """Exec harness + learner code into ns. Returns (error, line) or (None, None)."""
    try:
        if harness:
            exec(compile(harness, "<harness>", "exec"), ns)
        exec(compile(code, USER_FILE, "exec"), ns)
    except SyntaxError as e:
        return f"SyntaxError: {e.msg}", e.lineno
    except Exception as e:  # noqa: BLE001 - surface any load-time error to the learner
        return _exc_info(e)
    return None, None


def run_tests(code, fn_name, tests_json, harness="", adapter=None):
    _reset_modules()
    out = io.StringIO()
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    result = {"results": [], "stdout": "", "error": None, "errorLine": None}
    ns = {"__name__": "__main__"}
    try:
        err, line = _load(code, harness, ns)
        if err:
            result["error"], result["errorLine"] = err, line
            return json.dumps(result)
        fn = ns.get(fn_name)
        if fn is None:
            result["error"] = f"NameError: define `{fn_name}` so the tests can call it"
            return json.dumps(result)
        ad = ns.get(adapter) if adapter else None
        for t in json.loads(tests_json):
            args = copy.deepcopy(t["args"])
            try:
                v = ad(fn, *args) if ad else fn(*args)
                result["results"].append({"ok": True, "value": _jsonable(v)})
            except RecursionError:
                result["results"].append({"ok": False, "error": "RecursionError: maximum recursion depth exceeded (missing base case?)", "line": None})
            except Exception as e:  # noqa: BLE001
                msg, ln = _exc_info(e)
                result["results"].append({"ok": False, "error": msg, "line": ln})
    finally:
        sys.stdout, sys.stderr = old
        result["stdout"] = out.getvalue()[-4000:]
    return json.dumps(result)


def run_plain(code):
    """Run a script and return its stdout / error (the editor's Run button)."""
    _reset_modules()
    out = io.StringIO()
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    result = {"stdout": "", "error": None, "errorLine": None}
    try:
        err, line = _load(code, "", {"__name__": "__main__"})
        result["error"], result["errorLine"] = err, line
    finally:
        sys.stdout, sys.stderr = old
        result["stdout"] = out.getvalue()[-8000:]
    return json.dumps(result)


class _TraceLimit(Exception):
    pass


def _short(v):
    j = _jsonable(v)
    s = json.dumps(j)
    if len(s) > 400:
        return repr(v)[:120] + "…"
    return j


def trace_call(code, fn_name, args_json, max_steps=600):
    """Line-by-line trace of the learner's function: locals + call stack per step."""
    _reset_modules()
    events = []
    out = io.StringIO()
    old = sys.stdout
    sys.stdout = out
    ns = {"__name__": "__main__"}
    result = {"events": events, "error": None, "errorLine": None, "returned": None, "truncated": False, "stdout": ""}

    def snapshot(frame, event, arg):
        if len(events) >= max_steps:
            raise _TraceLimit()
        locs = {}
        for k, v in frame.f_locals.items():
            if k.startswith("__") or callable(v) or type(v).__name__ == "module":
                continue
            locs[k] = _short(v)
        stack = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == USER_FILE:
                stack.append(f.f_code.co_name)
            f = f.f_back
        ev = {"event": event, "line": frame.f_lineno, "func": frame.f_code.co_name, "locals": locs, "stack": stack[::-1]}
        if event == "return":
            ev["ret"] = _short(arg)
        events.append(ev)

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != USER_FILE:
            return None
        if event in ("line", "return"):
            snapshot(frame, event, arg)
        elif event == "call":
            snapshot(frame, "call", arg)
        return tracer

    try:
        err, line = _load(code, "", ns)
        if err:
            result["error"], result["errorLine"] = err, line
            return json.dumps(result)
        fn = ns.get(fn_name)
        if fn is None:
            result["error"] = f"NameError: define `{fn_name}`"
            return json.dumps(result)
        args = json.loads(args_json)
        sys.settrace(tracer)
        try:
            result["returned"] = _short(fn(*args))
        except _TraceLimit:
            result["truncated"] = True
        except Exception as e:  # noqa: BLE001
            result["error"], result["errorLine"] = _exc_info(e)
        finally:
            sys.settrace(None)
    finally:
        sys.stdout = old
        result["stdout"] = out.getvalue()[-2000:]
    return json.dumps(result)


class _OutOfFuel(BaseException):  # BaseException so learner-level `except Exception` can't swallow it
    pass


def _with_fuel(limit, fn):
    """Run fn() but abort after `limit` traced line events (portable infinite-loop guard)."""
    count = [0]

    def tracer(frame, event, arg):
        if event == "line":
            count[0] += 1
            if count[0] > limit:
                raise _OutOfFuel()
        return tracer

    sys.settrace(tracer)
    try:
        return fn()
    finally:
        sys.settrace(None)


if __name__ == "__main__":
    # Batch mode for the offline validator: python harness.py jobs.json results.json
    sys.setrecursionlimit(5000)
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    results = []
    for job in jobs:
        try:
            raw = _with_fuel(2_000_000, lambda: run_tests(job["code"], job["fnName"], json.dumps(job["tests"]), job.get("harness") or "", job.get("adapter")))
            results.append(json.loads(raw))
        except _OutOfFuel:
            sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
            results.append({"results": [], "stdout": "", "error": "Timeout: code ran too long (infinite loop?)", "errorLine": None, "timeout": True})
    json.dump(results, open(sys.argv[2], "w", encoding="utf-8"))
