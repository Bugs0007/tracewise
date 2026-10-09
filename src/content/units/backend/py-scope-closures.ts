import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, pyRepr } from '@/content/lib/backend-python';

const code = `
def make_counter():                      #@def
    count = 0                            #@init
    def inc():                           #@inner
        nonlocal count                   #@nonlocal
        count += 1                       #@bump
        return count                     #@ret
    return inc                           #@return

c = make_counter()                       #@make
c()                                      #@call

fs = [lambda: i for i in range(n)]       #@loop
late = [f() for f in fs]                 #@late
ok = [lambda i=i: i for i in range(n)]   #@fixloop
now = [f() for f in ok]                  #@fixcall
`;

interface In {
  calls: number;
  n: number;
}

interface State {
  makeFn: boolean;
  frame: boolean;
  inc: boolean;
  c: boolean;
  cell: number | null;
  late: number;
  iVal: number | null;
  fixed: number[];
}

function graph(s: State, hot: Record<string, Tone>) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const tone = (id: string): Tone => hot[id] ?? 'default';
  if (s.makeFn) nodes.push({ id: 'mk', label: 'make_counter', x: 70, y: 34, shape: 'pill', w: 110, h: 28, tone: tone('mk') });
  if (s.frame) nodes.push({ id: 'frame', label: 'make_counter() frame', x: 250, y: 34, shape: 'rect', w: 150, h: 28, tone: tone('frame') });
  if (s.c) nodes.push({ id: 'c', label: 'c', x: 70, y: 96, shape: 'pill', w: 50, h: 28, tone: tone('c') });
  if (s.inc) nodes.push({ id: 'inc', label: 'function inc', x: 215, y: 96, shape: 'rect', w: 100, h: 28, tone: tone('inc') });
  if (s.cell !== null) nodes.push({ id: 'cell', label: `cell count = ${s.cell}`, x: 395, y: 96, shape: 'rect', w: 120, h: 28, tone: tone('cell') });
  if (s.c && s.inc) edges.push({ from: 'c', to: 'inc', directed: true });
  if (s.inc && s.cell !== null) edges.push({ from: 'inc', to: 'cell', directed: true, label: '__closure__', tone: tone('cell') });
  if (s.frame && s.cell !== null) edges.push({ from: 'frame', to: 'cell', directed: true, label: 'count', dashed: true });
  let y = 170;
  if (s.late > 0 && s.iVal !== null) {
    const mid = y + ((s.late - 1) * 44) / 2;
    nodes.push({ id: 'i', label: `cell i = ${s.iVal}`, x: 395, y: mid, shape: 'rect', w: 120, h: 28, tone: tone('i'), sub: 'one cell, shared' });
    for (let k = 0; k < s.late; k++) {
      nodes.push({ id: `l${k}`, label: `lambda #${k}`, x: 130, y: y + k * 44, shape: 'rect', w: 100, h: 28, tone: tone(`l${k}`) });
      edges.push({ from: `l${k}`, to: 'i', directed: true, label: 'free var i', dashed: true, tone: tone(`l${k}`) });
    }
    y += s.late * 44 + 22;
  }
  s.fixed.forEach((v, k) => {
    nodes.push({ id: `f${k}`, label: `lambda i=${v}`, x: 130, y, shape: 'rect', w: 110, h: 28, tone: tone(`f${k}`) });
    nodes.push({ id: `d${k}`, label: `i = ${v}`, x: 330, y, shape: 'rect', w: 70, h: 28, tone: tone(`f${k}`) });
    edges.push({ from: `f${k}`, to: `d${k}`, directed: true, label: 'default', tone: tone(`f${k}`) });
    y += 44;
  });
  return { type: 'graph' as const, title: 'Function objects and the cells they capture', nodes, edges, directed: true, width: 480, height: Math.max(150, y + 10) };
}

type Hit = 'L' | 'E' | 'G' | 'B' | null;

function lookup(name: string, hit: Hit, notes: Partial<Record<'L' | 'E' | 'G' | 'B', string>> = {}): ListPanel {
  const order: ['L' | 'E' | 'G' | 'B', string][] = [
    ['L', 'Local'],
    ['E', 'Enclosing'],
    ['G', 'Global'],
    ['B', 'Built-in'],
  ];
  let found = false;
  return {
    type: 'list',
    title: `LEGB lookup of "${name}"`,
    orientation: 'horizontal',
    startLabel: 'first',
    endLabel: 'last',
    items: order.map(([k, label]) => {
      let tone: Tone = 'default';
      if (!found && hit !== null) {
        if (k === hit) {
          tone = 'found';
          found = true;
        } else tone = 'muted';
      }
      return { id: k, label, tone, sub: notes[k] };
    }),
  };
}

const viz: VizDef<In> = {
  id: 'py-scope-closures',
  title: 'Scopes, closures and cells',
  code,
  language: 'python',
  inputs: [
    { key: 'calls', label: 'Calls to c()', kind: 'number', default: 3 },
    { key: 'n', label: 'Lambdas in the loop (n)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Default', input: {} },
    { label: 'Two lambdas', input: { calls: 2, n: 2 } },
    { label: 'One call, four lambdas', input: { calls: 1, n: 4 } },
  ],
  run(input) {
    const calls = Math.max(1, Math.min(5, Math.round(input.calls)));
    const n = Math.max(1, Math.min(5, Math.round(input.n)));
    const r = new Recorder(code);
    const s: State = { makeFn: false, frame: false, inc: false, c: false, cell: null, late: 0, iVal: null, fixed: [] };
    const vars = (extra: Record<string, unknown> = {}) => ({ ...(s.cell !== null ? { count: s.cell } : {}), ...(s.iVal !== null ? { i: s.iVal } : {}), ...extra });
    const view = (hot: Record<string, Tone> = {}, ...more: Panel[]): Panel[] => [graph(s, hot), ...more];
    const counter: number[] = [];
    const late: number[] = [];
    const now: number[] = [];

    s.makeFn = true;
    r.step('def', cap('def binds the name make_counter to a function object in the global scope'), view({ mk: 'new' }), vars());

    s.frame = true;
    r.step('make', cap('Calling make_counter() creates a new local scope (a frame)'), view({ frame: 'new' }), vars());
    s.cell = 0;
    r.step('init', cap('count = 0 is stored in a cell because an inner function will use it'), view({ cell: 'new', frame: 'active' }), vars());
    s.inc = true;
    r.step('inner', cap('def inc creates a function whose __closure__ points at that cell'), view({ inc: 'new', cell: 'compare' }), vars());
    r.step('return', cap('Returning inc ends the frame, but the cell stays alive via the closure'), view({ inc: 'active' }), vars());
    s.frame = false;
    s.c = true;
    r.step('make', cap('c = inc: the global name c now refers to the closure'), view({ c: 'new', cell: 'compare' }), vars());

    for (let k = 1; k <= calls; k++) {
      r.step('call', cap(`c() call ${k}: a fresh local scope for inc is created`), view({ inc: 'active' }, lookup('count', null)), vars());
      r.step('nonlocal', cap('nonlocal count: skip Local, bind to the enclosing cell'), view({ inc: 'active', cell: 'compare' }, lookup('count', 'E', { L: 'declared nonlocal', E: 'cell count' })), vars());
      s.cell = (s.cell ?? 0) + 1;
      counter.push(s.cell);
      r.step('bump', cap(`count += 1 writes through the cell: it is now ${s.cell}`), view({ cell: 'swap', inc: 'active' }, lookup('count', 'E', { E: 'cell count' })), vars());
      r.step('ret', cap(`return count gives ${s.cell}; the cell keeps its value for the next call`), view({ cell: 'found' }), vars({ returned: s.cell }));
    }

    for (let k = 0; k < n; k++) {
      s.late = k + 1;
      s.iVal = k;
      r.step('loop', cap(`Iteration i=${k}: new lambda #${k} captures the variable i, not the value`), view({ [`l${k}`]: 'new', i: 'swap' }), vars());
    }
    for (let k = 0; k < n; k++) {
      late.push(s.iVal!);
      r.step('late', cap(`lambda #${k}() looks up i at CALL time: Local miss, Enclosing hit = ${s.iVal}`), view({ [`l${k}`]: 'active', i: 'found' }, lookup('i', 'E', { L: 'no i', E: 'cell i' })), vars({ returned: s.iVal }));
    }
    const lateText = pyRepr(late);
    r.step('late', cap(`late = ${lateText}: every lambda sees the final i`), view({ i: 'error' }), vars());

    for (let k = 0; k < n; k++) {
      s.fixed.push(k);
      r.step('fixloop', cap(`lambda i=i: the default i=${k} is evaluated NOW and stored on the function`), view({ [`f${k}`]: 'new' }), vars());
    }
    for (let k = 0; k < n; k++) {
      now.push(s.fixed[k]);
      r.step('fixcall', cap(`Calling it: Local finds the parameter i = ${s.fixed[k]}, no enclosing lookup`), view({ [`f${k}`]: 'found' }, lookup('i', 'L', { L: `param i=${s.fixed[k]}` })), vars({ returned: s.fixed[k] }));
    }
    return { frames: r.frames, result: [counter, late, now] };
  },
  reference({ calls, n }) {
    const c = Math.max(1, Math.min(5, Math.round(calls)));
    const m = Math.max(1, Math.min(5, Math.round(n)));
    return [Array.from({ length: c }, (_, k) => k + 1), Array.from({ length: m }, () => m - 1), Array.from({ length: m }, (_, k) => k)];
  },
};

const harness = `
def run_counter(fn, start, step, calls):
    a = fn(start, step)
    b = fn(start, step)
    out = []
    for _ in range(calls):
        out.append([a(), b()])
    return out

def run_multipliers(fn, n, x):
    return [f(x) for f in fn(n)]

def run_account(fn, start, ops):
    deposit, withdraw, balance = fn(start)
    out = []
    for op, amt in ops:
        if op == 'deposit':
            out.append(deposit(amt))
        elif op == 'withdraw':
            try:
                out.append(withdraw(amt))
            except ValueError as e:
                out.append('error: ' + str(e))
        else:
            out.append(balance())
    return out
`;

const unit: Unit = {
  id: 'py-scope-closures',
  hook: 'Closures and scope rules are a favourite because the surprising answers (`UnboundLocalError`, `[2, 2, 2]`) all follow from three facts: names resolve by LEGB, binding makes a name local, and closures capture variables, not values.',
  predict: {
    prompt: 'What happens when this runs?',
    code: `x = 10

def f():
    print(x)
    x = 20

f()`,
    codeLang: 'python',
    options: ['Prints 10', 'Prints 20', 'UnboundLocalError', 'NameError'],
    answer: 2,
    explain:
      'Python decides at compile time that x is local to f because f assigns to it. The `print(x)` therefore reads a local that is not bound yet and raises UnboundLocalError (a subclass of NameError). It never falls back to the global 10.',
  },
  viz,
  deeper: {
    points: [
      'Lookup order is LEGB: Local, Enclosing function scopes, Global (module), Built-ins. The first scope that has the name wins.',
      'Any assignment in a function makes that name local for the whole function body, unless you declare it `global` or `nonlocal`.',
      'A closure is a function plus the cells of the enclosing variables it uses (see `fn.__closure__`). The cell outlives the enclosing call.',
      '`nonlocal` lets an inner function rebind an enclosing variable. Without it, `count += 1` would create a new local and fail with UnboundLocalError.',
      'Closures capture variables, so lambdas created in a loop all see the loop variable\'s final value. Bind the current value with a default argument (`lambda i=i: i`) or `functools.partial`.',
    ],
    pitfalls: [
      'Reading a global in a function and assigning to it later in the same function',
      'Expecting a loop variable to be frozen inside a lambda or inner def',
      'Using `global` when a small closure or an object attribute would be clearer',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'make_counter',
    statement: 'Write `make_counter(start=0, step=1)` returning a function. Each call adds `step` to the running value and returns it, so the first call returns `start + step`. Two counters must not share state.',
    signature: 'def make_counter(start=0, step=1):',
    harness,
    adapter: 'run_counter',
    solution: `def make_counter(start=0, step=1):
    count = @@start@@
    def counter():
        @@nonlocal count@@
        count @@+= step@@
        return count
    return @@counter@@`,
    tests: [
      { args: [0, 1, 3], expected: [[1, 1], [2, 2], [3, 3]], name: 'two independent counters' },
      { args: [10, 5, 2], expected: [[15, 15], [20, 20]], name: 'start and step' },
      { args: [0, 2, 1], expected: [[2, 2]], name: 'one call' },
      { args: [-3, 1, 4], expected: [[-2, -2], [-1, -1], [0, 0], [1, 1]], name: 'negative start' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'make_multipliers',
    statement: '`make_multipliers(n)` should return n functions where the k-th multiplies its argument by k. Calling them gives the same answer every time. Fix it.',
    harness,
    adapter: 'run_multipliers',
    buggy: `def make_multipliers(n):
    return [lambda x: x * i for i in range(n)]`,
    fixed: `def make_multipliers(n):
    return [lambda x, i=i: x * i for i in range(n)]`,
    bugType: 'late-binding closure',
    hint: 'When does the lambda look up i: when it is created or when it is called? What is i by then?',
    explanation:
      'All the lambdas share one cell for i, and by the time they run the loop has finished with i = n - 1. A default argument `i=i` is evaluated when the lambda is created, which freezes the current value.',
    tests: [
      { args: [3, 10], expected: [0, 10, 20] },
      { args: [4, 2], expected: [0, 2, 4, 6] },
      { args: [1, 7], expected: [0], name: 'single function' },
      { args: [3, 0], expected: [0, 0, 0], name: 'x = 0' },
    ],
  },
  boss: {
    title: 'Bank account without a class',
    statement:
      'Write `make_account(start)` returning three closures `(deposit, withdraw, balance)` that share ONE private balance. `deposit(n)` and `withdraw(n)` return the new balance; `balance()` returns it. `withdraw` raises `ValueError("insufficient funds")` and changes nothing when n exceeds the balance.',
    language: 'python',
    fnName: 'make_account',
    harness,
    adapter: 'run_account',
    starter: `def make_account(start):
    # your code here
    pass
`,
    solution: `def make_account(start):
    total = start

    def deposit(amount):
        nonlocal total
        total += amount
        return total

    def withdraw(amount):
        nonlocal total
        if amount > total:
            raise ValueError('insufficient funds')
        total -= amount
        return total

    def balance():
        return total

    return deposit, withdraw, balance`,
    tests: [
      { args: [100, [['deposit', 50], ['withdraw', 30], ['balance', 0]]], expected: [150, 120, 120] },
      { args: [10, [['withdraw', 25], ['balance', 0]]], expected: ['error: insufficient funds', 10], name: 'failed withdraw changes nothing' },
      { args: [0, [['deposit', 5], ['deposit', 5], ['withdraw', 10], ['balance', 0]]], expected: [5, 10, 0, 0], name: 'drain to zero' },
      { args: [20, [['withdraw', 20], ['withdraw', 1]]], expected: [0, 'error: insufficient funds'] },
    ],
    hints: ['Keep the balance in one local variable of make_account and let the three inner functions use it.', 'deposit and withdraw rebind it, so each needs `nonlocal total`. balance only reads it, so it does not.'],
    combines: ['py-scope-closures', 'py-mutability'],
  },
  quiz: [
    {
      prompt: 'Which keyword lets an inner function rebind a variable of the enclosing function?',
      options: ['global', 'nonlocal', 'static', 'local'],
      answer: 1,
      explain: '`nonlocal` binds the name to the nearest enclosing function scope. `global` would target the module scope instead.',
    },
    {
      prompt: '`fs = [lambda: i for i in range(3)]` then `[f() for f in fs]` gives what?',
      options: ['[0, 1, 2]', '[2, 2, 2]', '[3, 3, 3]', 'NameError'],
      answer: 1,
      explain: 'The lambdas share the variable i, which ends the loop at 2.',
    },
  ],
};

export default unit;
