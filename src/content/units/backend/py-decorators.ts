import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, logPanel, pyRepr } from '@/content/lib/backend-python';

const code = `
from functools import wraps

def repeat(times):                         #@factory
    def decorator(fn):                     #@decorator
        @wraps(fn)                         #@wraps
        def wrapper(*args):                #@wrapper
            result = None
            for _ in range(times):         #@loop
                result = fn(*args)         #@inner
            return result                  #@ret
        return wrapper                     #@retwrap
    return decorator                       #@retdeco

@repeat(times)                             #@apply
def greet(name):                           #@greet
    print('hi', name)
    return name.upper()

greet(who)                                 #@call
`;

interface In {
  times: number;
  who: string;
}

interface State {
  repeat: boolean;
  deco: boolean;
  orig: boolean;
  wrap: boolean;
  wraps: boolean;
  bound: 'orig' | 'wrap' | null;
  name: string;
}

function graph(s: State, times: number, hot: Record<string, Tone>): Panel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const t = (id: string): Tone => hot[id] ?? 'default';
  if (s.repeat) nodes.push({ id: 'repeat', label: 'repeat (factory)', x: 80, y: 32, shape: 'rect', w: 120, h: 30, tone: t('repeat') });
  if (s.deco) nodes.push({ id: 'deco', label: 'decorator', x: 240, y: 32, shape: 'rect', w: 100, h: 30, tone: t('deco') });
  if (s.deco || s.wrap) nodes.push({ id: 'times', label: `times = ${times}`, x: 400, y: 32, shape: 'pill', w: 90, h: 28, tone: t('times') });
  if (s.orig) nodes.push({ id: 'orig', label: 'greet (original)', x: 400, y: 150, shape: 'rect', w: 130, h: 30, tone: t('orig') });
  if (s.wrap) nodes.push({ id: 'wrap', label: s.wraps ? "wrapper __name__='greet'" : "wrapper __name__='wrapper'", x: 215, y: 150, shape: 'rect', w: 190, h: 30, tone: t('wrap') });
  if (s.bound) nodes.push({ id: 'name', label: 'greet', x: 50, y: 150, shape: 'pill', w: 66, h: 28, tone: t('name') });
  if (s.deco) edges.push({ from: 'deco', to: 'times', directed: true, label: 'closure', dashed: true });
  if (s.wrap) {
    edges.push({ from: 'wrap', to: 'times', directed: true, label: 'times', dashed: true, curve: 0.3 });
    edges.push({ from: 'wrap', to: 'orig', directed: true, label: 'fn', tone: t('wrap') });
    if (s.wraps) edges.push({ from: 'wrap', to: 'orig', directed: true, label: '__wrapped__', dashed: true, curve: -0.35 });
  }
  if (s.bound) edges.push({ from: 'name', to: s.bound, directed: true, tone: t('name'), flow: s.bound === 'wrap' && !!hot.name });
  return { type: 'graph', title: 'Function objects: who points at whom', nodes, edges, directed: true, width: 480, height: 195 };
}

const viz: VizDef<In> = {
  id: 'py-decorators',
  title: 'Decorator with arguments, step by step',
  code,
  language: 'python',
  inputs: [
    { key: 'times', label: 'times', kind: 'number', default: 2 },
    { key: 'who', label: 'name', kind: 'string', default: 'ann', maxItems: 10 },
  ],
  presets: [
    { label: 'Default', input: {} },
    { label: 'Three repeats', input: { times: 3, who: 'bo' } },
    { label: 'Zero repeats', input: { times: 0, who: 'cy' } },
  ],
  run(input) {
    const times = Math.max(0, Math.min(4, Math.round(input.times)));
    const who = input.who || 'ann';
    const r = new Recorder(code);
    const s: State = { repeat: false, deco: false, orig: false, wrap: false, wraps: false, bound: null, name: 'greet' };
    const out: string[] = [];
    const logs = (): Panel => logPanel(out, 'Printed output', out.length > 0);
    const vars = (extra: Record<string, unknown> = {}) => ({ times, ...extra });
    const g = (hot: Record<string, Tone> = {}): Panel[] => [graph(s, times, hot), logs()];

    s.repeat = true;
    r.step('factory', cap('def repeat creates a plain factory function; nothing is decorated yet'), g({ repeat: 'new' }), vars());
    r.step('apply', cap(`@repeat(${times}) is evaluated first: the factory is called with times=${times}`), g({ repeat: 'active' }), vars());
    s.deco = true;
    r.step('retdeco', cap('repeat returns decorator, a closure that remembers times'), g({ deco: 'new', times: 'compare' }), vars());
    s.orig = true;
    r.step('greet', cap('def greet builds the original function; the name greet is not bound yet'), g({ orig: 'new' }), vars());
    r.step('decorator', cap('Python calls decorator(original): fn is the original greet'), g({ deco: 'active', orig: 'compare' }), vars());
    s.wrap = true;
    r.step('wrapper', cap('wrapper is created; it closes over fn and times'), g({ wrap: 'new' }), vars());
    s.wraps = true;
    r.step('wraps', cap('@wraps(fn) copies __name__ and __doc__ and adds __wrapped__'), g({ wrap: 'swap', orig: 'compare' }), vars());
    r.step('retwrap', cap('decorator returns wrapper'), g({ wrap: 'active' }), vars());
    s.deco = false;
    s.bound = 'wrap';
    r.step('apply', cap('The name greet is bound to wrapper: the original is only reachable through it'), g({ name: 'new', wrap: 'found' }), vars());

    r.step('call', cap(`greet('${who}') looks up the name greet and therefore runs wrapper`), g({ name: 'active', wrap: 'active' }), vars());
    let result: string | null = null;
    for (let k = 1; k <= times; k++) {
      r.step('loop', cap(`wrapper loop pass ${k} of ${times}`), g({ wrap: 'active' }), vars({ pass: k }));
      out.push(`hi ${who}`);
      result = who.toUpperCase();
      r.step('inner', cap(`fn('${who}') runs the original: prints "hi ${who}"`), g({ orig: 'active', wrap: 'compare' }), vars({ pass: k, result }));
    }
    if (times === 0) r.step('loop', cap('times is 0, so the original never runs and result stays None'), g({ wrap: 'error' }), vars({ result: 'None' }));
    r.step('ret', cap(`wrapper returns ${pyRepr(result)} to the caller`), g({ wrap: 'found' }), vars({ result: pyRepr(result) }));
    return { frames: r.frames, result: { printed: out, returned: result } };
  },
  reference({ times, who }) {
    const t = Math.max(0, Math.min(4, Math.round(times)));
    const name = who || 'ann';
    return { printed: Array.from({ length: t }, () => `hi ${name}`), returned: t > 0 ? name.toUpperCase() : null };
  },
};

const harness = `
def run_retry(retry, times, failures):
    calls = []

    @retry(times)
    def flaky(x):
        calls.append(x)
        if len(calls) <= failures:
            raise ValueError('flaky')
        return x * 2

    try:
        result = flaky(21)
    except ValueError as e:
        result = 'gave up: ' + str(e)
    return [result, len(calls), flaky.__name__]

def run_count(deco, nums):
    @deco
    def square(x):
        return x * x

    return [[square(n) for n in nums], square.calls]

def run_memo(memoize, ns):
    executed = []

    @memoize
    def slow_square(x):
        executed.append(x)
        return x * x

    out = [slow_square(n) for n in ns]
    info = [slow_square.hits, slow_square.misses, len(executed)]
    slow_square.cache_clear()
    slow_square(ns[0])
    return [out, info, len(executed), slow_square.__name__]
`;

const unit: Unit = {
  id: 'py-decorators',
  hook: 'Decorators are functions that return functions, and interviewers use them to test closures, `*args/**kwargs` and call order in one question. Be ready to write a retry, timing or caching decorator on a whiteboard.',
  predict: {
    prompt: 'What is the order of the printed lines?',
    code: `def shout(fn):
    print('decorating', fn.__name__)
    def wrapper():
        print('calling')
        return fn().upper()
    return wrapper

@shout
def hi():
    return 'hi'

print('defined')
hi()`,
    codeLang: 'python',
    options: ['defined, decorating hi, calling', 'decorating hi, defined, calling', 'decorating hi, calling, defined', 'defined, calling, decorating hi'],
    answer: 1,
    explain:
      '`@shout` is shorthand for `hi = shout(hi)`, executed when the def statement runs. So "decorating hi" prints at definition time, before "defined". "calling" prints only when hi() runs wrapper.',
  },
  viz,
  deeper: {
    points: [
      '`@d` above `def f` means `f = d(f)`. After that the name `f` refers to whatever d returned, usually a wrapper.',
      'A wrapper should accept `*args, **kwargs`, call the original, and RETURN its result. Forgetting `return` makes every decorated function return None.',
      '`functools.wraps(fn)` copies `__name__`, `__doc__` and sets `__wrapped__` on the wrapper, which keeps debugging, help() and introspection honest.',
      'A decorator with arguments is a three-level structure: factory(args) returns decorator(fn) returns wrapper(*a, **k). `@repeat(3)` calls the factory first.',
      'Stacked decorators apply bottom-up at definition time and run top-down at call time: the outermost wrapper is called first.',
    ],
    pitfalls: [
      'Writing `@repeat` when the decorator needs arguments (it receives fn as `times`)',
      'Swallowing the return value or the exception inside the wrapper',
      'Sharing mutable state (a cache dict) across functions by defining it outside the decorator',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'retry',
    statement: 'Write the decorator factory `retry(times)`: the decorated function is attempted up to `times` times in total. Return the first successful result; if every attempt raises, raise the last exception. Keep the original `__name__`.',
    signature: 'def retry(times):',
    harness,
    adapter: 'run_retry',
    solution: `from functools import wraps

def retry(times):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last = None
            for _ in range(times):
                try:
                    return @@fn(*args, **kwargs)@@
                except Exception as exc:
                    last = exc
            raise @@last@@
        return @@wrapper@@
    return @@decorator@@`,
    tests: [
      { args: [3, 2], expected: [42, 3, 'flaky'], name: 'succeeds on the last attempt' },
      { args: [3, 0], expected: [42, 1, 'flaky'], name: 'no failures, one call' },
      { args: [2, 5], expected: ['gave up: flaky', 2, 'flaky'], name: 'gives up after 2 attempts' },
      { args: [1, 1], expected: ['gave up: flaky', 1, 'flaky'], name: 'single attempt' },
      { args: [4, 3], expected: [42, 4, 'flaky'], name: 'fourth try works' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'count_calls',
    statement: '`count_calls` should count calls on `wrapper.calls` and otherwise behave like the original. The counts are right but every decorated call returns None. Fix it.',
    harness,
    adapter: 'run_count',
    buggy: `def count_calls(fn):
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        fn(*args, **kwargs)
    wrapper.calls = 0
    return wrapper`,
    fixed: `def count_calls(fn):
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return fn(*args, **kwargs)
    wrapper.calls = 0
    return wrapper`,
    bugType: 'wrapper drops the return value',
    hint: 'What does a Python function return when it has no return statement?',
    explanation: 'The wrapper called the original but threw its result away, so wrapper() implicitly returned None. Return what the original returns.',
    tests: [
      { args: [[1, 2, 3]], expected: [[1, 4, 9], 3] },
      { args: [[]], expected: [[], 0], name: 'never called' },
      { args: [[5]], expected: [[25], 1] },
      { args: [[2, 2]], expected: [[4, 4], 2], name: 'same argument twice' },
    ],
  },
  boss: {
    title: 'Memoize with statistics',
    statement:
      'Write the decorator `memoize` for functions with positional arguments. Cache results by argument tuple. The wrapper must expose `hits`, `misses` (ints) and `cache_clear()` which empties the cache (counters may stay). Keep the original `__name__`.',
    language: 'python',
    fnName: 'memoize',
    harness,
    adapter: 'run_memo',
    starter: `def memoize(fn):
    # your code here
    pass
`,
    solution: `from functools import wraps

def memoize(fn):
    cache = {}

    @wraps(fn)
    def wrapper(*args):
        if args in cache:
            wrapper.hits += 1
        else:
            wrapper.misses += 1
            cache[args] = fn(*args)
        return cache[args]

    wrapper.hits = 0
    wrapper.misses = 0
    wrapper.cache_clear = cache.clear
    return wrapper`,
    tests: [
      { args: [[2, 3, 2, 2]], expected: [[4, 9, 4, 4], [2, 2, 2], 3, 'slow_square'] },
      { args: [[5]], expected: [[25], [0, 1, 1], 2, 'slow_square'], name: 'single call' },
      { args: [[1, 1, 1, 1]], expected: [[1, 1, 1, 1], [3, 1, 1], 2, 'slow_square'], name: 'all hits after the first' },
      { args: [[3, 4, 3, 4]], expected: [[9, 16, 9, 16], [2, 2, 2], 3, 'slow_square'], name: 'two keys' },
    ],
    hints: ['Create the cache dict inside memoize (one per decorated function) and use the args tuple as the key.', 'Store counters as attributes on the wrapper function itself, and expose `cache.clear` as `wrapper.cache_clear`. Do not forget @wraps(fn).'],
    combines: ['py-decorators', 'py-scope-closures', 'memoization'],
  },
  quiz: [
    {
      prompt: '`@repeat(3)` above `def f` is equivalent to which statement?',
      options: ['f = repeat(f, 3)', 'f = repeat(3)(f)', 'f = repeat(3)', 'repeat(3); f()'],
      answer: 1,
      explain: 'The factory is called with 3 and returns a decorator, which is then applied to f.',
    },
    {
      prompt: 'What does functools.wraps fix?',
      options: ['Speed of the wrapper', 'Missing metadata such as __name__ and __doc__ on the wrapper', 'Recursion limits', 'Argument unpacking'],
      answer: 1,
      explain: 'Without it, every decorated function reports itself as "wrapper".',
    },
  ],
};

export default unit;
