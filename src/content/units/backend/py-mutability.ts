import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, GraphPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, logPanel, pyRepr } from '@/content/lib/backend-python';

const code = `
import copy

a = list(items)                  #@make
b = a                            #@alias
b.append(x)                      #@mutate
box = [a, 'x']                   #@box
shallow = copy.copy(box)         #@shallow
deep = copy.deepcopy(box)        #@deep
a.append(y)                      #@late
print(shallow[0], deep[0])       #@show

def add(v, bucket=[]):           #@def
    bucket.append(v)             #@push
    return bucket                #@ret

add(p)                           #@call1
print(add(q))                    #@call2
`;

interface In {
  items: number[];
  x: number;
  y: number;
  p: number;
  q: number;
}

type Item = { ref: string } | { val: string };
interface Obj {
  id: string;
  kind: 'list' | 'func';
  fname?: string;
  items: Item[];
  defaults?: string;
}

/** A tiny names -> objects store: names are labels, objects live on the "heap" and may reference each other. */
class Store {
  objs = new Map<string, Obj>();
  names = new Map<string, string>();
  private n = 0;

  newList(items: Item[]): string {
    const id = `#${++this.n}`;
    this.objs.set(id, { id, kind: 'list', items });
    return id;
  }
  newFunc(fname: string, defaults: string): string {
    const id = `#${++this.n}`;
    this.objs.set(id, { id, kind: 'func', fname, items: [], defaults });
    return id;
  }
  bind(name: string, id: string) {
    this.names.set(name, id);
  }
  unbind(name: string) {
    this.names.delete(name);
  }
  get(name: string): Obj {
    return this.objs.get(this.names.get(name)!)!;
  }
  append(id: string, item: Item) {
    this.objs.get(id)!.items.push(item);
  }
  shallowCopy(id: string): string {
    return this.newList(this.objs.get(id)!.items.map((it) => ({ ...it })));
  }
  deepCopy(id: string, memo = new Map<string, string>()): string {
    if (memo.has(id)) return memo.get(id)!;
    const src = this.objs.get(id)!;
    const out = this.newList([]);
    memo.set(id, out);
    this.objs.get(out)!.items = src.items.map((it) => ('ref' in it ? { ref: this.deepCopy(it.ref, memo) } : { ...it }));
    return out;
  }
  repr(id: string): string {
    const o = this.objs.get(id)!;
    if (o.kind === 'func') return `<function ${o.fname}>`;
    return `[${o.items.map((it) => ('ref' in it ? this.repr(it.ref) : it.val)).join(', ')}]`;
  }
  label(o: Obj): string {
    if (o.kind === 'func') return `function ${o.fname}`;
    return `[${o.items.map((it) => ('ref' in it ? '•' : it.val)).join(', ')}]`;
  }
  /** Objects reachable from some name, with their depth from the names column. */
  reachable(): Map<string, number> {
    const lvl = new Map<string, number>();
    const visit = (id: string, d: number) => {
      if ((lvl.get(id) ?? 0) >= d) return;
      lvl.set(id, d);
      const o = this.objs.get(id)!;
      for (const it of o.items) if ('ref' in it) visit(it.ref, d + 1);
      if (o.defaults) visit(o.defaults, d + 1);
    };
    for (const id of this.names.values()) visit(id, 1);
    return lvl;
  }
}

function panel(s: Store, hot: Record<string, Tone>, nameTones: Record<string, Tone>): GraphPanel {
  const lvl = s.reachable();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const colX = [62, 232, 402];
  const rows = [0, 0, 0, 0];
  const nameList = [...s.names.keys()];
  nameList.forEach((nm, i) => {
    nodes.push({ id: `n:${nm}`, label: nm, x: colX[0], y: 38 + i * 56, shape: 'pill', w: 78, h: 30, tone: nameTones[nm] ?? 'default' });
    edges.push({ from: `n:${nm}`, to: `o:${s.names.get(nm)}`, directed: true, tone: nameTones[nm] ?? 'default' });
  });
  const ordered = [...lvl.entries()].sort((a, b) => a[1] - b[1] || Number(a[0].slice(1)) - Number(b[0].slice(1)));
  for (const [id, d] of ordered) {
    const o = s.objs.get(id)!;
    const label = s.label(o);
    const col = Math.min(d, 2);
    nodes.push({
      id: `o:${id}`,
      label,
      x: colX[col],
      y: 38 + rows[col]++ * 56,
      shape: 'rect',
      w: Math.max(64, 12 + label.length * 8),
      h: 32,
      badge: id,
      tone: hot[id] ?? 'default',
    });
    o.items.forEach((it, i) => {
      if ('ref' in it) edges.push({ from: `o:${id}`, to: `o:${it.ref}`, directed: true, label: `[${i}]`, curve: 0.2 });
    });
    if (o.defaults) edges.push({ from: `o:${id}`, to: `o:${o.defaults}`, directed: true, label: '__defaults__', dashed: true });
  }
  const height = Math.max(nameList.length, rows[1], rows[2], 2) * 56 + 20;
  return { type: 'graph', title: 'Names → objects (badge = identity)', nodes, edges, directed: true, width: 500, height };
}

const viz: VizDef<In> = {
  id: 'py-mutability',
  title: 'Names, objects and mutation',
  code,
  language: 'python',
  inputs: [
    { key: 'items', label: 'Initial list a', kind: 'numbers', default: [1, 2], maxItems: 5 },
    { key: 'x', label: 'x (appended via b)', kind: 'number', default: 3 },
    { key: 'y', label: 'y (appended via a, later)', kind: 'number', default: 4 },
    { key: 'p', label: 'p (first add call)', kind: 'number', default: 5 },
    { key: 'q', label: 'q (second add call)', kind: 'number', default: 6 },
  ],
  presets: [
    { label: 'Default', input: {} },
    { label: 'Empty list', input: { items: [], x: 7, y: 8, p: 1, q: 2 } },
    { label: 'Same values', input: { items: [9], x: 9, y: 9, p: 9, q: 9 } },
  ],
  run(input) {
    const { items, x, y, p, q } = input;
    const r = new Recorder(code);
    const s = new Store();
    const out: string[] = [];
    const num = (n: number): Item => ({ val: String(n) });
    const snap = (hot: Record<string, Tone> = {}, names: Record<string, Tone> = {}) => [panel(s, hot, names), logPanel(out)];
    const vars = (extra: Record<string, unknown> = {}) => {
      const v: Record<string, unknown> = {};
      for (const [k, id] of s.names) v[k] = s.objs.get(id)!.kind === 'func' ? `function ${id}` : `list ${id}`;
      return { ...v, ...extra };
    };

    const a = s.newList(items.map(num));
    s.bind('a', a);
    r.step('make', cap(`a = list(items) builds one list object ${a} and binds the name a to it`), snap({ [a]: 'new' }, { a: 'new' }), vars());

    s.bind('b', a);
    r.step('alias', cap('b = a copies no data: b is a second name for the same object'), snap({ [a]: 'compare' }, { b: 'new' }), vars({ 'a is b': true }));

    s.append(a, num(x));
    r.step('mutate', cap(`b.append(${x}) changes the shared object, so a shows ${s.repr(a)} too`), snap({ [a]: 'active' }), vars({ 'a is b': true }));

    const box = s.newList([{ ref: a }, { val: "'x'" }]);
    s.bind('box', box);
    r.step('box', cap('box is a new list whose first slot points at the list a'), snap({ [box]: 'new' }, { box: 'new' }), vars());

    const sh = s.shallowCopy(box);
    s.bind('shallow', sh);
    r.step('shallow', cap('copy.copy builds a new outer list but reuses the inner object'), snap({ [sh]: 'new', [a]: 'compare' }, { shallow: 'new' }), vars());

    const dp = s.deepCopy(box);
    s.bind('deep', dp);
    const deepInner = (s.objs.get(dp)!.items[0] as { ref: string }).ref;
    r.step('deep', cap('copy.deepcopy duplicates the inner list too: nothing is shared'), snap({ [dp]: 'new', [deepInner]: 'new' }, { deep: 'new' }), vars());

    s.append(a, num(y));
    r.step('late', cap(`a.append(${y}): shallow[0] sees it (same object), deep[0] does not`), snap({ [a]: 'active', [deepInner]: 'muted' }), vars());

    const shown = `${s.repr(a)} ${s.repr(deepInner)}`;
    out.push(shown);
    r.step('show', cap(`prints ${shown}`), snap({ [a]: 'compare', [deepInner]: 'compare' }), vars());

    const defList = s.newList([]);
    const fn = s.newFunc('add', defList);
    s.bind('add', fn);
    r.step('def', cap('def runs once: the default [] is created NOW and stored on the function'), snap({ [fn]: 'new', [defList]: 'new' }, { add: 'new' }), vars());

    const call = (v: number, label: 'call1' | 'call2', printIt: boolean) => {
      s.bind('bucket', defList);
      r.step(label, cap(`add(${v}): no bucket passed, so bucket is the stored default list`), snap({ [defList]: 'compare' }, { bucket: 'new' }), vars({ v }));
      s.append(defList, num(v));
      r.step('push', cap(`bucket.append(${v}) mutates the default object → ${s.repr(defList)}`), snap({ [defList]: 'error' }, { bucket: 'active' }), vars({ v }));
      r.step('ret', cap('return bucket hands back that same default list'), snap({ [defList]: 'error' }, { bucket: 'active' }), vars({ v }));
      s.unbind('bucket');
      if (printIt) {
        out.push(s.repr(defList));
        r.step(label, cap(`prints ${s.repr(defList)}: the previous call leaked into this one`), snap({ [defList]: 'error' }), vars());
      }
    };
    call(p, 'call1', false);
    call(q, 'call2', true);
    return { frames: r.frames, result: out };
  },
  reference({ items, x, y, p, q }) {
    const a = [...items];
    const b = a;
    b.push(x);
    const deepSnap = [...a];
    a.push(y);
    const bucket: number[] = [];
    bucket.push(p);
    bucket.push(q);
    return [`${pyRepr(a)} ${pyRepr(deepSnap)}`, pyRepr(bucket)];
  },
};

const callsHarness = `
def run_calls(fn, calls):
    return [fn(*c) for c in calls]

def run_grid(fn, rows, cols):
    g = fn(rows, cols)
    g[0][0] = 1
    return g

def run_merge(fn, defaults, overrides):
    import copy
    d0, o0 = copy.deepcopy(defaults), copy.deepcopy(overrides)
    res = fn(defaults, overrides)
    snapshot = copy.deepcopy(res)

    def scribble(node):
        if isinstance(node, dict):
            node['_x'] = 1
            for v in list(node.values()):
                scribble(v)
        elif isinstance(node, list):
            node.append('!')
            for v in list(node):
                scribble(v)

    scribble(res)
    return {
        'result': snapshot,
        'defaults_untouched': defaults == d0,
        'overrides_untouched': overrides == o0,
    }
`;

const practiceTests = [
  { args: [[[1], [2]]], expected: [[1], [2]], name: 'two independent calls' },
  { args: [[[1], [2], [3]]], expected: [[1], [2], [3]], name: 'three calls' },
  { args: [[[1, [9]], [2]]], expected: [[9, 1], [2]], name: 'explicit bucket is used' },
  { args: [[['a'], ['b', ['x', 'y']], ['c']]], expected: [['a'], ['x', 'y', 'b'], ['c']], name: 'mixed' },
];

const gridTests = [
  { args: [2, 3], expected: [[1, 0, 0], [0, 0, 0]] },
  { args: [3, 2], expected: [[1, 0], [0, 0], [0, 0]] },
  { args: [1, 4], expected: [[1, 0, 0, 0]], name: 'single row' },
  { args: [2, 1], expected: [[1], [0]], name: 'single column' },
];

const unit: Unit = {
  id: 'py-mutability',
  hook: 'Half of the "weird Python behaviour" questions are really one idea: names point at objects, and `=` never copies. Know when two names share an object and you can explain aliasing bugs, shallow copies and the mutable default argument trap in one breath.',
  predict: {
    prompt: 'What does this print?',
    code: `a = [1, 2]
b = a
b += [3]
c = a
c = c + [4]
print(a, c)`,
    codeLang: 'python',
    options: ['[1, 2] [1, 2, 4]', '[1, 2, 3] [1, 2, 3, 4]', '[1, 2, 3] [1, 2, 4]', '[1, 2] [1, 2, 3, 4]'],
    answer: 1,
    explain:
      '`b += [3]` calls list.__iadd__, which extends the shared object in place, so a becomes [1, 2, 3]. `c + [4]` builds a brand-new list and rebinds c, so a is untouched by it. c = [1, 2, 3] + [4].',
  },
  viz,
  deeper: {
    points: [
      'A variable is a name bound to an object. Assignment (`b = a`) binds another name; it never copies the data. Use `is` to test identity and `==` to test equality.',
      'Mutable objects (list, dict, set, most classes) can change in place; immutable ones (int, str, tuple, frozenset) cannot, so rebinding is the only way to "change" them.',
      '`copy.copy`, `list(x)`, `x[:]` and `x.copy()` are shallow: a new outer container holding the same inner objects. `copy.deepcopy` recursively duplicates what it finds.',
      'Default argument values are evaluated once, when `def` runs, and stored on the function. A mutable default is therefore shared by every call that omits the argument.',
      'The standard fix is a `None` sentinel: `def f(x, bucket=None): if bucket is None: bucket = []`.',
    ],
    pitfalls: [
      '`[[0] * n] * m` repeats one inner list m times, so every row is the same object',
      'Mutating a list while you loop over it, or mutating a function argument the caller still uses',
      'Believing a tuple is deeply immutable: `t = ([],); t[0].append(1)` works',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'append_to',
    statement: 'Write `append_to(item, bucket=None)`: append `item` to `bucket` and return it. When no bucket is given, every call must start with a fresh empty list.',
    signature: 'def append_to(item, bucket=None):',
    harness: callsHarness,
    adapter: 'run_calls',
    solution: `def append_to(item, bucket=@@None@@):
    if @@bucket is None@@:
        bucket = @@[]@@
    bucket.@@append(item)@@
    return bucket`,
    tests: practiceTests,
  },
  debug: {
    language: 'python',
    fnName: 'make_grid',
    statement: 'After `make_grid(2, 3)` the test sets `grid[0][0] = 1` and expects ONLY the first row to change. Every row changes. Fix `make_grid`.',
    harness: callsHarness,
    adapter: 'run_grid',
    buggy: `def make_grid(rows, cols):
    return [[0] * cols] * rows`,
    fixed: `def make_grid(rows, cols):
    return [[0] * cols for _ in range(rows)]`,
    bugType: 'aliased rows',
    hint: 'How many list objects does `[row] * rows` create for the outer rows? Compare with a comprehension that evaluates `[0] * cols` each time.',
    explanation:
      '`[[0] * cols] * rows` evaluates the inner list once and repeats the reference, so all rows are the same object. A comprehension runs `[0] * cols` for every row and builds distinct lists.',
    tests: gridTests,
  },
  boss: {
    title: 'Merge config without side effects',
    statement:
      'Write `merge_config(defaults, overrides)` returning a NEW dict: start from defaults, then apply overrides. When both sides hold a dict for the same key, merge those recursively; otherwise the override wins. Neither input may be modified, and the result must not share any nested dict or list with either input.',
    language: 'python',
    fnName: 'merge_config',
    harness: callsHarness,
    adapter: 'run_merge',
    starter: `def merge_config(defaults, overrides):
    # your code here
    pass
`,
    solution: `import copy

def merge_config(defaults, overrides):
    out = {key: copy.deepcopy(value) for key, value in defaults.items()}
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merge_config(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out`,
    tests: [
      {
        args: [{ debug: false, db: { host: 'a', port: 1 } }, { db: { port: 2 } }],
        expected: { result: { debug: false, db: { host: 'a', port: 2 } }, defaults_untouched: true, overrides_untouched: true },
        name: 'nested merge',
      },
      {
        args: [{ tags: ['x'], n: 1 }, { n: 2 }],
        expected: { result: { tags: ['x'], n: 2 }, defaults_untouched: true, overrides_untouched: true },
        name: 'list not shared with defaults',
      },
      {
        args: [{ a: 1 }, { b: { c: [1, 2] } }],
        expected: { result: { a: 1, b: { c: [1, 2] } }, defaults_untouched: true, overrides_untouched: true },
        name: 'override value not shared',
      },
      {
        args: [{ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } }],
        expected: { result: { a: { b: { c: 1, d: 2 } } }, defaults_untouched: true, overrides_untouched: true },
        name: 'deeply nested',
      },
      { args: [{}, {}], expected: { result: {}, defaults_untouched: true, overrides_untouched: true }, name: 'both empty' },
    ],
    hints: [
      'Build `out` from a copy of defaults, then loop over overrides. Recurse only when BOTH values are dicts.',
      'Use `copy.deepcopy(value)` whenever you put a value from either input into the result; that removes all sharing.',
    ],
    combines: ['py-mutability', 'py-comprehensions'],
  },
  quiz: [
    {
      prompt: 'After `a = [1, 2]; b = a[:]`, what does `a is b` give?',
      options: ['True', 'False', 'It depends on the values', 'A TypeError'],
      answer: 1,
      explain: 'A slice builds a new list, so b is a different object with equal contents: `a == b` is True, `a is b` is False.',
    },
    {
      prompt: 'Which call finally gives you a list whose nested lists are independent of the original?',
      options: ['list(rows)', 'rows[:]', 'rows.copy()', 'copy.deepcopy(rows)'],
      answer: 3,
      explain: 'The first three are shallow copies; the inner lists remain shared. Only deepcopy duplicates them.',
    },
  ],
};

export default unit;
