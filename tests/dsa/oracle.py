"""Run the real Python solutions on their case inputs and print what they return, as JSON.

    python tests/dsa/oracle.py arrays-hashing

The TypeScript test (src/dsa/dsa.test.ts) compares each trace generator's result against this
output, so "the trace gives the same answer as the Python solution" is checked against actual
Python execution, not only against the expected values stored in the cases file.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dsa_lib import PROBLEMS, call, load_cases, load_solution  # noqa: E402


def main(topic):
    out = {}
    for cases_path in sorted((PROBLEMS / topic).glob("*.cases.json")):
        slug = cases_path.name[: -len(".cases.json")]
        meta = load_cases(topic, slug)
        _, fn, adapter = load_solution(topic, slug)
        results = []
        for c in meta["cases"]:
            try:
                results.append({"ok": True, "value": call(fn, adapter, c["args"])})
            except Exception as e:  # noqa: BLE001
                results.append({"ok": False, "error": f"{type(e).__name__}: {e}"})
        out[slug] = results
    print(json.dumps(out))


if __name__ == "__main__":
    main(sys.argv[1])
