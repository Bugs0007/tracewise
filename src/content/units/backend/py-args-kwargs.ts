import { Recorder } from '@/engine/recorder';
import type { Frame, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, pyRepr, pyTuple } from '@/content/lib/backend-python';

const code = `
def f(a, b=10, *args, key, **kw):        #@def
    return a, b, args, key, kw           #@ret

pos = [...]      # the "pos" input
opts = {...}     # the "opts" input
f(*pos, **opts)                          #@call
`;

interface In {
  pos: unknown[];
  opts: Record<string, unknown>;
}

type Slot = 'a' | 'b' | '*args' | 'key' | '**kw';
interface Row {
  slot: Slot;
  kind: string;
  value: string;
  from: string;
  tone: Tone;
}

const KINDS: Record<Slot, string> = {
  a: 'positional or keyword',
  b: 'positional or keyword, default 10',
  '*args': 'extra positionals → tuple',
  key: 'keyword-only (required)',
  '**kw': 'extra keywords → dict',
};
const SLOTS: Slot[] = ['a', 'b', '*args', 'key', '**kw'];

interface Outcome {
  a?: unknown;
  b?: unknown;
  args?: unknown[];
  key?: unknown;
  kw?: Record<string, unknown>;
  error?: string;
}

const viz: VizDef<In> = {
  id: 'py-args-kwargs',
  title: 'How a call binds to f(a, b=10, *args, key, **kw)',
  code,
  language: 'python',
  inputs: [
    { key: 'pos', label: 'pos (unpacked with *)', kind: 'json', default: [1, 2, 3, 4], help: 'A JSON list, e.g. [1, 2, 3]' },
    { key: 'opts', label: 'opts (unpacked with **)', kind: 'json', default: { key: 'k', extra: true }, help: 'A JSON object, e.g. {"key": "k"}' },
  ],
  presets: [
    { label: 'Extras on both sides', input: { pos: [1, 2, 3, 4], opts: { key: 'k', extra: true } } },
    { label: 'Default for b', input: { pos: [1], opts: { key: 'z' } } },
    { label: 'Missing keyword-only', input: { pos: [1, 2], opts: {} } },
    { label: 'Duplicate value', input: { pos: [1], opts: { a: 5, key: 'k' } } },
    { label: 'All by keyword', input: { pos: [], opts: { a: 1, b: 2, key: 'k', z: 0 } } },
  ],
  run({ pos: rawPos, opts: rawOpts }) {
    const pos = Array.isArray(rawPos) ? rawPos : [];
    const opts = rawOpts && typeof rawOpts === 'object' && !Array.isArray(rawOpts) ? (rawOpts as Record<string, unknown>) : {};
    const r = new Recorder(code);
    const rows: Record<Slot, Row> = Object.fromEntries(SLOTS.map((s) => [s, { slot: s, kind: KINDS[s], value: s === '*args' ? '()' : s === '**kw' ? '{}' : '—', from: 'not bound yet', tone: 'default' as Tone }])) as Record<Slot, Row>;
    const keys = Object.keys(opts);
    const items: { label: string; tone: Tone }[] = [...pos.map((v) => ({ label: pyRepr(v), tone: 'frontier' as Tone })), ...keys.map((k) => ({ label: `${k}=${pyRepr(opts[k])}`, tone: 'frontier' as Tone }))];
    const bound: Record<string, unknown> = {};
    const extraPos: unknown[] = [];
    const extraKw: Record<string, unknown> = {};

    const panels = (): Panel[] => [
      { type: 'grid', title: 'Parameter slots', colLabels: ['parameter', 'kind', 'value', 'bound from'], cells: SLOTS.map((s) => [s, rows[s].kind, rows[s].value, rows[s].from]), tones: Object.fromEntries(SLOTS.flatMap((s, i) => [0, 1, 2, 3].map((c) => [`${i},${c}`, rows[s].tone]))) },
      { type: 'list', title: 'Call-site arguments after unpacking', orientation: 'horizontal', items: items.map((it, i) => ({ id: String(i), label: it.label, tone: it.tone, sub: i < pos.length ? 'positional' : 'keyword' })), emptyText: 'no arguments' },
    ];
    const set = (s: Slot, value: string, from: string, tone: Tone = 'found') => {
      rows[s] = { ...rows[s], value, from, tone };
    };
    const settle = () => SLOTS.forEach((s) => rows[s].tone === 'active' && (rows[s].tone = 'found'));
    const fail = (msg: string, slot: Slot): { frames: Frame[]; result: Outcome } => {
      rows[slot].tone = 'error';
      r.step('call', cap(msg), panels(), { error: msg });
      return { frames: r.frames, result: { error: msg } };
    };
    const vars = () => ({ pos: pyRepr(pos), opts: pyRepr(opts) });

    r.step('def', cap('The signature declares five slots; key sits after *args so it is keyword-only'), panels(), vars());
    r.step('call', cap(`f(*pos, **opts): * spreads ${pos.length} positional value(s), ** spreads ${keys.length} keyword(s)`), panels(), vars());

    // 1. positionals fill a, b, then spill into *args
    for (let i = 0; i < pos.length; i++) {
      settle();
      items[i].tone = 'active';
      r.op();
      if (i < 2) {
        const s: Slot = i === 0 ? 'a' : 'b';
        bound[s] = pos[i];
        set(s, pyRepr(pos[i]), `positional #${i}`, 'active');
        r.step('call', cap(`Positional #${i} (${pyRepr(pos[i])}) fills ${s}, the next unfilled named slot`), panels(), vars());
      } else {
        extraPos.push(pos[i]);
        set('*args', pyTuple(extraPos), `positional #${[...Array(i + 1).keys()].slice(2).join(', #')}`, 'active');
        r.step('call', cap(`Positional #${i} (${pyRepr(pos[i])}) has no named slot left → collected into *args`), panels(), vars());
      }
      items[i].tone = 'done';
    }
    settle();

    // 2. keywords go to a named slot, key, or **kw
    for (let n = 0; n < keys.length; n++) {
      const k = keys[n];
      const idx = pos.length + n;
      items[idx].tone = 'active';
      r.op();
      if (k === 'a' || k === 'b') {
        if (k in bound) return fail(`TypeError: f() got multiple values for argument '${k}'`, k);
        bound[k] = opts[k];
        set(k, pyRepr(opts[k]), `keyword ${k}=`, 'active');
        r.step('call', cap(`Keyword ${k}=${pyRepr(opts[k])} matches parameter ${k} by name`), panels(), vars());
      } else if (k === 'key') {
        bound.key = opts[k];
        set('key', pyRepr(opts[k]), 'keyword key=', 'active');
        r.step('call', cap(`Keyword key=${pyRepr(opts[k])} fills the keyword-only parameter`), panels(), vars());
      } else {
        extraKw[k] = opts[k];
        set('**kw', pyRepr(extraKw), `keywords ${Object.keys(extraKw).join(', ')}`, 'active');
        r.step('call', cap(`Keyword ${k}= matches no parameter name → collected into **kw`), panels(), vars());
      }
      items[idx].tone = 'done';
      settle();
    }

    // 3. defaults and missing arguments
    if (!('b' in bound)) {
      bound.b = 10;
      set('b', '10', 'default value', 'new');
      r.step('call', cap('b was not supplied, so its default 10 is used'), panels(), vars());
    }
    if (!('a' in bound)) return fail("TypeError: f() missing 1 required positional argument: 'a'", 'a');
    if (!('key' in bound)) return fail("TypeError: f() missing 1 required keyword-only argument: 'key'", 'key');
    r.step('ret', cap('Every required slot is bound, so the body runs with these locals'), panels(), vars());
    const result: Outcome = { a: bound.a, b: bound.b, args: extraPos, key: bound.key, kw: extraKw };
    return { frames: r.frames, result };
  },
  reference({ pos: rawPos, opts: rawOpts }) {
    const pos = Array.isArray(rawPos) ? rawPos : [];
    const opts = (rawOpts && typeof rawOpts === 'object' ? rawOpts : {}) as Record<string, unknown>;
    // independent formulation: resolve each slot directly from the two argument sources
    for (const k of Object.keys(opts)) {
      if (k === 'a' && pos.length >= 1) return { error: "TypeError: f() got multiple values for argument 'a'" };
      if (k === 'b' && pos.length >= 2) return { error: "TypeError: f() got multiple values for argument 'b'" };
    }
    const pick = (name: string, index: number, fallback?: unknown) => (pos.length > index ? pos[index] : name in opts ? opts[name] : fallback);
    const a = pick('a', 0);
    const b = pick('b', 1, 10);
    const hasA = pos.length > 0 || 'a' in opts;
    if (!hasA) return { error: "TypeError: f() missing 1 required positional argument: 'a'" };
    if (!('key' in opts)) return { error: "TypeError: f() missing 1 required keyword-only argument: 'key'" };
    const kw = Object.fromEntries(Object.entries(opts).filter(([k]) => !['a', 'b', 'key'].includes(k)));
    return { a, b, args: pos.slice(2), key: opts.key, kw };
  },
};

const harness = `
def run_call(fn, args, kwargs):
    return fn(*args, **kwargs)

def _target(a, b=2, *rest, flag=False):
    return [a, b, list(rest), flag]

def run_forward(fn, args, kwargs):
    return fn(_target, *args, **kwargs)

def _greet(greeting, name, punct='!'):
    return greeting + ', ' + name + punct

def run_partial(fn, pre_args, pre_kwargs, calls):
    p = fn(_greet, *pre_args, **pre_kwargs)
    return [p(*a, **k) for a, k in calls]
`;

const unit: Unit = {
  id: 'py-args-kwargs',
  hook: '`*args` and `**kwargs` power decorators, wrappers and flexible APIs. Interviewers check that you know the binding order, what keyword-only means and how `*` and `**` differ in a def versus at a call site.',
  predict: {
    prompt: 'What does this print?',
    code: `def f(a, b=2, *args, c, **kw):
    return a, b, args, c, kw

print(f(1, 3, 4, c=5, d=6))`,
    codeLang: 'python',
    options: ['(1, 3, (4,), 5, {\'d\': 6})', '(1, 2, (3, 4), 5, {\'d\': 6})', '(1, 3, 4, 5, {\'d\': 6})', 'TypeError: f() got multiple values for argument \'b\''],
    answer: 0,
    explain:
      'Positionals fill a=1, b=3 first; the leftover 4 goes into the args tuple. c can only be given by keyword (it follows *args), and the unknown keyword d lands in kw.',
  },
  viz,
  deeper: {
    points: [
      'Binding order: positional values fill named parameters left to right; extra positionals go into `*args` (a tuple); keywords match by name; unmatched keywords go into `**kw` (a dict); defaults fill the rest.',
      'Parameters after `*args` (or a bare `*`) are keyword-only: they must be passed by name.',
      'In a def, `*` and `**` collect. At a call site, `*seq` and `**mapping` spread values into separate arguments. The two are inverses.',
      'A parameter given both positionally and by keyword raises "got multiple values for argument".',
      'Wrappers forward everything with `def wrapper(*args, **kwargs): return fn(*args, **kwargs)`.',
    ],
    pitfalls: [
      'Forgetting the stars when forwarding: `fn(args, kwargs)` passes a tuple and a dict',
      'Mutable defaults (see the mutability unit) combined with **kwargs mutation',
      'Assuming `**kwargs` order or names exist; use `.get` or explicit keyword-only parameters',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'build_url',
    statement: 'Write `build_url(base, *parts, **params)`. Join `base` and the path `parts` with single slashes (no doubled or trailing slashes). If there are params, append "?" and the `key=value` pairs sorted by key and joined by "&".',
    signature: 'def build_url(base, *parts, **params):',
    harness,
    adapter: 'run_call',
    solution: `def build_url(base, @@*parts@@, @@**params@@):
    path = '/'.join([base.rstrip('/')] + [p.strip('/') for p in parts])
    if not @@params@@:
        return path
    query = '&'.join(f'{k}={v}' for k, v in @@sorted(params.items())@@)
    return path + '?' + query`,
    tests: [
      { args: [['http://x.io/', 'a', '/b/'], { y: 2, x: 1 }], expected: 'http://x.io/a/b?x=1&y=2' },
      { args: [['http://x.io'], {}], expected: 'http://x.io', name: 'base only' },
      { args: [['http://x.io/', 'v1'], {}], expected: 'http://x.io/v1', name: 'no params' },
      { args: [['http://x.io', 'a'], { q: 'hello' }], expected: 'http://x.io/a?q=hello', name: 'one param' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'forward',
    statement: '`forward(fn, *args, **kwargs)` should call `fn` with the same arguments, adding `flag=True` unless the caller provided `flag`. Its results are wrong for every call. Fix it.',
    harness,
    adapter: 'run_forward',
    buggy: `def forward(fn, *args, **kwargs):
    kwargs.setdefault('flag', True)
    return fn(args, kwargs)`,
    fixed: `def forward(fn, *args, **kwargs):
    kwargs.setdefault('flag', True)
    return fn(*args, **kwargs)`,
    bugType: 'missing unpacking at the call site',
    hint: 'Look at what fn receives as its first and second arguments in the buggy call.',
    explanation:
      '`fn(args, kwargs)` passes the tuple and the dict as two ordinary arguments. To spread them back out you need `*args` and `**kwargs` at the call site.',
    tests: [
      { args: [[1], {}], expected: [1, 2, [], true] },
      { args: [[1, 5, 6, 7], {}], expected: [1, 5, [6, 7], true], name: 'extra positionals' },
      { args: [[1], { flag: false }], expected: [1, 2, [], false], name: 'caller flag wins' },
      { args: [[], { a: 9, b: 8 }], expected: [9, 8, [], true], name: 'keywords only' },
    ],
  },
  boss: {
    title: 'Write functools.partial',
    statement:
      'Write `my_partial(fn, *pre_args, **pre_kwargs)` returning a function. Calling it with more arguments calls `fn(*pre_args, *args, **merged)`, where `merged` is the stored keywords updated by the call\'s keywords (the call wins).',
    language: 'python',
    fnName: 'my_partial',
    harness,
    adapter: 'run_partial',
    starter: `def my_partial(fn, *pre_args, **pre_kwargs):
    # your code here
    pass
`,
    solution: `def my_partial(fn, *pre_args, **pre_kwargs):
    def call(*args, **kwargs):
        return fn(*pre_args, *args, **{**pre_kwargs, **kwargs})
    return call`,
    tests: [
      { args: [['Hi'], {}, [[['Ann'], {}], [['Bob'], { punct: '?' }]]], expected: ['Hi, Ann!', 'Hi, Bob?'] },
      { args: [['Yo'], { punct: '~' }, [[['Zed'], {}]]], expected: ['Yo, Zed~'], name: 'stored keyword' },
      { args: [['Hey', 'Kim'], {}, [[[], {}], [[], { punct: '.' }]]], expected: ['Hey, Kim!', 'Hey, Kim.'], name: 'all positionals stored' },
      { args: [['Hi'], { punct: '.' }, [[['A'], {}], [['B'], { punct: '?' }]]], expected: ['Hi, A.', 'Hi, B?'], name: 'call keyword overrides stored one' },
    ],
    hints: ['Return an inner function that accepts `*args, **kwargs` of its own.', 'Merge keywords with `{**pre_kwargs, **kwargs}` (later wins) and spread both positional groups: `fn(*pre_args, *args, ...)`.'],
    combines: ['py-args-kwargs', 'py-scope-closures'],
  },
  quiz: [
    {
      prompt: 'Which call is valid for `def f(a, *, b): ...`?',
      options: ['f(1, 2)', 'f(1, b=2)', 'f(b=2)', 'f(1, 2, b=3)'],
      answer: 1,
      explain: 'Everything after the bare * is keyword-only, and a is still required.',
    },
    {
      prompt: 'What type is `args` inside `def f(*args)` when called as f(1, 2)?',
      options: ['list', 'tuple', 'set', 'dict'],
      answer: 1,
      explain: '*args always collects extra positionals into a tuple; **kwargs collects keywords into a dict.',
    },
  ],
};

export default unit;
