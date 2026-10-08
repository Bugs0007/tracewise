"""minillm — deterministic stand-ins for LLM building blocks, for exercises.

Nothing here calls a real model. Everything is reproducible so tests can check
exact outputs:

    tokenize(text)            -> list of token strings (word pieces + punctuation)
    count_tokens(text)        -> int
    embed(text, dim=16)       -> unit-length vector; texts sharing words/trigrams are close
    MockLLM(script)           -> .complete(prompt) / .chat(messages, tools=None) / .stream(prompt)
    tool_call(name, **args)   -> a tool-call message dict, for scripting
"""
import hashlib
import json
import math
import re

_WORD = re.compile(r"[A-Za-z]+|\d+|[^\sA-Za-z\d]")


def tokenize(text):
    """Split into word pieces: words up to 4 chars stay whole; longer words are chunked (like BPE)."""
    out = []
    for i, w in enumerate(_WORD.findall(text)):
        if w.isalpha() and len(w) > 4:
            pieces = [w[j : j + 4] for j in range(0, len(w), 4)]
            out.append(pieces[0])
            out.extend("##" + p for p in pieces[1:])
        else:
            out.append(w)
    return out


def count_tokens(text):
    return len(tokenize(text))


def _h(s, mod):
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % mod


def embed(text, dim=16):
    """Hashed bag of words + character trigrams, L2-normalised. Deterministic across runs."""
    v = [0.0] * dim
    words = [w.lower() for w in re.findall(r"[A-Za-z]+|\d+", text)]
    for w in words:
        v[_h("w:" + w, dim)] += 1.0
        padded = f"#{w}#"
        for k in range(len(padded) - 2):
            v[_h("t:" + padded[k : k + 3], dim)] += 0.5
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [round(x / n, 6) for x in v]


def tool_call(name, **arguments):
    return {"role": "assistant", "content": None, "tool_calls": [{"id": f"call_{name}", "name": name, "arguments": json.dumps(arguments, sort_keys=True)}]}


def reply(text):
    return {"role": "assistant", "content": text, "tool_calls": []}


class MockLLM:
    """A scripted chat model.

    `script` may be:
      - a list of replies (strings or message dicts) returned in order
      - a dict mapping a substring of the latest user/tool message to a reply
      - a function (messages, tools) -> reply
    Every call is recorded in `.calls`; token usage is tallied in `.usage`.
    """

    def __init__(self, script, name="mock-model"):
        self.script = script
        self.name = name
        self.calls = []
        self.usage = {"prompt_tokens": 0, "completion_tokens": 0}
        self._i = 0

    def _next(self, messages, tools):
        s = self.script
        if callable(s):
            r = s(messages, tools)
        elif isinstance(s, dict):
            last = messages[-1]["content"] if messages else ""
            last = last if isinstance(last, str) else json.dumps(last)
            r = next((v for k, v in s.items() if k in last), s.get("*", "I don't know."))
        else:
            if self._i >= len(s):
                raise RuntimeError("MockLLM script exhausted: the agent called the model more times than expected")
            r = s[self._i]
            self._i += 1
        return reply(r) if isinstance(r, str) else r

    def chat(self, messages, tools=None):
        msgs = [dict(m) for m in messages]
        self.calls.append({"messages": msgs, "tools": [t.get("name") for t in (tools or [])]})
        out = self._next(msgs, tools)
        self.usage["prompt_tokens"] += sum(count_tokens(str(m.get("content") or "")) for m in msgs)
        self.usage["completion_tokens"] += count_tokens(str(out.get("content") or ""))
        return out

    def complete(self, prompt):
        return self.chat([{"role": "user", "content": prompt}])["content"]

    def stream(self, prompt):
        """Yield the completion token by token (like server-sent events)."""
        text = self.complete(prompt) or ""
        for piece in re.findall(r"\S+\s*", text):
            yield piece
