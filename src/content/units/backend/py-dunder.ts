import { Recorder } from '@/engine/recorder';
import type { Panel, SequenceMessage, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/backend-python';

const code = `
class Vec:
    def __init__(self, *items):
        self.items = list(items)
    def __add__(self, other):                  #@add
        if not isinstance(other, Vec):
            return NotImplemented
        return Vec(*[p + q for p, q in zip(self, other)])
    def __len__(self):                         #@len
        return len(self.items)
    def __getitem__(self, i):                  #@getitem
        return self.items[i]
    def __eq__(self, other):                   #@eq
        return isinstance(other, Vec) and self.items == other.items
    def __repr__(self):                        #@repr
        return 'Vec(' + ', '.join(map(str, self.items)) + ')'
    def __iter__(self):                        #@iter
        return iter(self.items)

a, b = Vec(*A), Vec(*B)
value = EXPRESSION                             #@expr
`;

const EXPRS = ['a + b', 'len(a)', 'a[1]', 'a == b', 'a != b', 'repr(a)', 'list(a)', 'a < b', 'a + 1'];

interface In {
  A: number[];
  B: number[];
  expr: string;
}

const DEFINED = ['__add__', '__len__', '__getitem__', '__eq__', '__repr__', '__iter__'];
const vec = (xs: number[]) => `Vec(${xs.join(', ')})`;

interface Plan {
  actors: string[];
  steps: { anchor: string; caption: string; msg?: SequenceMessage; used?: string; missing?: string }[];
  result: string;
}

function plan(A: number[], B: number[], expr: string): Plan {
  const you = 'your code';
  const py = 'Python';
  const cls = 'Vec a';
  const base = [you, py, cls];
  switch (expr) {
    case 'a + b': {
      const n = Math.min(A.length, B.length);
      const sum = Array.from({ length: n }, (_, i) => A[i] + B[i]);
      return {
        actors: base,
        result: vec(sum),
        steps: [
          { anchor: 'expr', caption: 'a + b is syntax: Python rewrites it as a method call on the left operand', msg: { from: you, to: py, label: 'a + b' } },
          { anchor: 'add', caption: 'It calls type(a).__add__(a, b); zip(self, other) walks both with __iter__', msg: { from: py, to: cls, label: '__add__(a, b)', tone: 'active' }, used: '__add__' },
          { anchor: 'add', caption: `__add__ builds a NEW object ${vec(sum)}`, msg: { from: cls, to: py, label: vec(sum), dashed: true } },
          { anchor: 'expr', caption: `value = ${vec(sum)}`, msg: { from: py, to: you, label: vec(sum), dashed: true, tone: 'found' } },
        ],
      };
    }
    case 'len(a)':
      return {
        actors: base,
        result: String(A.length),
        steps: [
          { anchor: 'expr', caption: 'len(a) asks the object for its length', msg: { from: you, to: py, label: 'len(a)' } },
          { anchor: 'len', caption: 'Python calls type(a).__len__(a)', msg: { from: py, to: cls, label: '__len__(a)', tone: 'active' }, used: '__len__' },
          { anchor: 'len', caption: `__len__ returns len(self.items) = ${A.length}`, msg: { from: cls, to: py, label: String(A.length), dashed: true } },
          { anchor: 'expr', caption: `value = ${A.length}`, msg: { from: py, to: you, label: String(A.length), dashed: true, tone: 'found' } },
        ],
      };
    case 'a[1]': {
      const ok = A.length > 1;
      const res = ok ? String(A[1]) : 'IndexError: list index out of range';
      return {
        actors: base,
        result: res,
        steps: [
          { anchor: 'expr', caption: 'a[1] is subscription syntax', msg: { from: you, to: py, label: 'a[1]' } },
          { anchor: 'getitem', caption: 'Python calls type(a).__getitem__(a, 1)', msg: { from: py, to: cls, label: '__getitem__(a, 1)', tone: 'active' }, used: '__getitem__' },
          { anchor: 'getitem', caption: ok ? `__getitem__ returns self.items[1] = ${A[1]}` : 'self.items[1] fails: the list has no index 1', msg: { from: cls, to: py, label: res, dashed: true, tone: ok ? 'default' : 'error' } },
          { anchor: 'expr', caption: ok ? `value = ${A[1]}` : 'The IndexError reaches your code', msg: { from: py, to: you, label: res, dashed: true, tone: ok ? 'found' : 'error' } },
        ],
      };
    }
    case 'a == b': {
      const eq = A.length === B.length && A.every((v, i) => v === B[i]);
      const res = eq ? 'True' : 'False';
      return {
        actors: base,
        result: res,
        steps: [
          { anchor: 'expr', caption: 'a == b dispatches to the left operand', msg: { from: you, to: py, label: 'a == b' } },
          { anchor: 'eq', caption: 'Python calls type(a).__eq__(a, b)', msg: { from: py, to: cls, label: '__eq__(a, b)', tone: 'active' }, used: '__eq__' },
          { anchor: 'eq', caption: `__eq__ compares the item lists: ${res}`, msg: { from: cls, to: py, label: res, dashed: true } },
          { anchor: 'expr', caption: `value = ${res}`, msg: { from: py, to: you, label: res, dashed: true, tone: 'found' } },
        ],
      };
    }
    case 'a != b': {
      const eq = A.length === B.length && A.every((v, i) => v === B[i]);
      const res = eq ? 'False' : 'True';
      return {
        actors: base,
        result: res,
        steps: [
          { anchor: 'expr', caption: 'a != b: Vec defines no __ne__', msg: { from: you, to: py, label: 'a != b' } },
          { anchor: 'eq', caption: 'The default __ne__ calls __eq__(a, b) and negates the answer', msg: { from: py, to: cls, label: '__eq__(a, b)  (via object.__ne__)', tone: 'active' }, used: '__eq__' },
          { anchor: 'eq', caption: `__eq__ says ${eq ? 'True' : 'False'}`, msg: { from: cls, to: py, label: eq ? 'True' : 'False', dashed: true } },
          { anchor: 'expr', caption: `Negated: value = ${res}`, msg: { from: py, to: you, label: res, dashed: true, tone: 'found' } },
        ],
      };
    }
    case 'repr(a)':
      return {
        actors: base,
        result: vec(A),
        steps: [
          { anchor: 'expr', caption: 'repr(a) asks for the developer-facing text', msg: { from: you, to: py, label: 'repr(a)' } },
          { anchor: 'repr', caption: 'Python calls type(a).__repr__(a)', msg: { from: py, to: cls, label: '__repr__(a)', tone: 'active' }, used: '__repr__' },
          { anchor: 'repr', caption: `__repr__ joins the items: ${vec(A)}`, msg: { from: cls, to: py, label: vec(A), dashed: true } },
          { anchor: 'expr', caption: `value = ${vec(A)}`, msg: { from: py, to: you, label: vec(A), dashed: true, tone: 'found' } },
        ],
      };
    case 'list(a)': {
      const steps: Plan['steps'] = [
        { anchor: 'expr', caption: 'list(a) needs to loop over a, so it starts the iteration protocol', msg: { from: you, to: py, label: 'list(a)' } },
        { anchor: 'iter', caption: 'Python calls iter(a), which calls type(a).__iter__(a)', msg: { from: py, to: cls, label: '__iter__()', tone: 'active' }, used: '__iter__' },
        { anchor: 'iter', caption: '__iter__ returns an iterator over self.items', msg: { from: cls, to: 'iterator', label: 'iter(self.items)', dashed: true } },
      ];
      A.forEach((v, i) => {
        steps.push({ anchor: 'iter', caption: `Python calls next() on the iterator: item ${i} is ${v}`, msg: { from: py, to: 'iterator', label: `__next__() → ${v}` } });
      });
      steps.push({ anchor: 'iter', caption: 'The next call raises StopIteration: the loop is over', msg: { from: py, to: 'iterator', label: '__next__() → StopIteration', tone: 'done' } });
      steps.push({ anchor: 'expr', caption: `value = [${A.join(', ')}]`, msg: { from: py, to: you, label: `[${A.join(', ')}]`, dashed: true, tone: 'found' } });
      return { actors: [you, py, cls, 'iterator'], result: `[${A.join(', ')}]`, steps };
    }
    case 'a < b':
      return {
        actors: base,
        result: "TypeError: '<' not supported between instances of 'Vec' and 'Vec'",
        steps: [
          { anchor: 'expr', caption: 'a < b looks for __lt__ on type(a)', msg: { from: you, to: py, label: 'a < b' } },
          { anchor: 'expr', caption: 'Vec has no __lt__, so Python tries the reflected b.__gt__(a)', msg: { from: py, to: cls, label: '__lt__ ? missing', tone: 'error' }, missing: '__lt__' },
          { anchor: 'expr', caption: 'No __gt__ either: the comparison is unsupported', msg: { from: py, to: cls, label: '__gt__ ? missing', tone: 'error' }, missing: '__gt__' },
          { anchor: 'expr', caption: "TypeError: '<' not supported between instances of 'Vec' and 'Vec'", msg: { from: py, to: you, label: 'TypeError', tone: 'error' } },
        ],
      };
    default:
      return {
        actors: [you, py, cls, 'int 1'],
        result: "TypeError: unsupported operand type(s) for +: 'Vec' and 'int'",
        steps: [
          { anchor: 'expr', caption: 'a + 1 starts with the left operand again', msg: { from: you, to: py, label: 'a + 1' } },
          { anchor: 'add', caption: 'Python calls type(a).__add__(a, 1)', msg: { from: py, to: cls, label: '__add__(a, 1)', tone: 'active' }, used: '__add__' },
          { anchor: 'add', caption: '1 is not a Vec, so __add__ returns NotImplemented (not an error!)', msg: { from: cls, to: py, label: 'NotImplemented', dashed: true } },
          { anchor: 'expr', caption: 'Python now tries the reflected int.__radd__(1, a)', msg: { from: py, to: 'int 1', label: '__radd__(a)  ? NotImplemented', tone: 'error' }, missing: '__radd__' },
          { anchor: 'expr', caption: "Both sides declined: TypeError: unsupported operand type(s) for +", msg: { from: py, to: you, label: 'TypeError', tone: 'error' } },
        ],
      };
  }
}

const viz: VizDef<In> = {
  id: 'py-dunder',
  title: 'Which special method does this expression call?',
  code,
  language: 'python',
  inputs: [
    { key: 'A', label: 'Vec a items', kind: 'numbers', default: [1, 2], maxItems: 4 },
    { key: 'B', label: 'Vec b items', kind: 'numbers', default: [3, 4], maxItems: 4 },
    { key: 'expr', label: 'Expression', kind: 'select', default: 'a + b', options: EXPRS },
  ],
  presets: EXPRS.map((e) => ({ label: e, input: { expr: e } })),
  run({ A, B, expr }) {
    const p = plan(A, B, EXPRS.includes(expr) ? expr : 'a + b');
    const r = new Recorder(code);
    const msgs: SequenceMessage[] = [];
    const used = new Set<string>();
    const missing = new Set<string>();
    const panels = (): Panel[] => [
      { type: 'sequence', title: `value = ${expr}`, actors: p.actors, messages: msgs, active: msgs.length - 1 },
      {
        type: 'kv',
        title: 'Methods defined on Vec (and missing ones Python tried)',
        entries: [
          ...DEFINED.map((d) => ({ k: d, v: 'defined', tone: (used.has(d) ? 'active' : 'default') as Tone })),
          ...[...missing].map((m) => ({ k: m, v: 'not defined', tone: 'error' as Tone })),
        ],
      },
    ];
    r.step('expr', cap(`Evaluate ${expr} with a = ${vec(A)} and b = ${vec(B)}`), panels(), { a: vec(A), b: vec(B) });
    for (const s of p.steps) {
      if (s.msg) msgs.push(s.msg);
      if (s.used) used.add(s.used);
      if (s.missing) missing.add(s.missing);
      r.op();
      r.step(s.anchor, cap(s.caption), panels(), { a: vec(A), b: vec(B) });
    }
    return { frames: r.frames, result: p.result };
  },
  reference({ A, B, expr }) {
    const same = A.length === B.length && A.every((v, i) => v === B[i]);
    const table: Record<string, string> = {
      'a + b': vec(A.slice(0, Math.min(A.length, B.length)).map((v, i) => v + B[i])),
      'len(a)': String(A.length),
      'a[1]': A.length > 1 ? String(A[1]) : 'IndexError: list index out of range',
      'a == b': same ? 'True' : 'False',
      'a != b': same ? 'False' : 'True',
      'repr(a)': vec(A),
      'list(a)': `[${A.join(', ')}]`,
      'a < b': "TypeError: '<' not supported between instances of 'Vec' and 'Vec'",
      'a + 1': "TypeError: unsupported operand type(s) for +: 'Vec' and 'int'",
    };
    return table[EXPRS.includes(expr) ? expr : 'a + b'];
  },
};

const harness = `
def run_dunder(cls, a, b):
    x, y = cls(*a), cls(*b)
    return {
        'len': len(x),
        'list': list(x),
        'eq': x == y,
        'sum': list(x + y),
        'repr': repr(x),
        'eq_other': x == 3,
        'truthy': bool(x),
    }

def run_points(cls, coords):
    pts = [cls(x, y) for x, y in coords]
    unique = set(pts)
    first_in = (cls(*coords[0]) in unique) if coords else False
    return [len(unique), first_in]

def run_bag(cls, a, b):
    x, y = cls(a), cls(b)
    z = x + y
    return {
        'len': len(x),
        'count_first': x[a[0]] if a else 0,
        'has': (a[0] in x) if a else False,
        'missing': 'zz' in x,
        'iter': sorted(x),
        'sum_len': len(z),
        'sum_count': z[a[0]] if a else 0,
        'eq': x == cls(list(reversed(a))),
        'same_as_b': x == y,
    }
`;

const unit: Unit = {
  id: 'py-dunder',
  hook: 'Operators and built-ins in Python are all method calls in disguise. Knowing that `a + b`, `len(x)`, `x[i]`, `==` and `for` map to `__add__`, `__len__`, `__getitem__`, `__eq__` and `__iter__` is how you build objects that feel native.',
  predict: {
    prompt: 'What does this print?',
    code: `class A:
    def __eq__(self, other):
        return True

print(A() == A(), A() != A(), A() in [A()])`,
    codeLang: 'python',
    options: ['True True True', 'True False True', 'True False False', 'False False True'],
    answer: 1,
    explain:
      '`==` calls __eq__ → True. Python 3 derives `!=` from __eq__ by negating it → False. `in` on a list compares with == (identity first, then __eq__) → True.',
  },
  viz,
  deeper: {
    points: [
      'Python looks special methods up on the TYPE, not the instance: `a + b` is `type(a).__add__(a, b)`.',
      'Return `NotImplemented` (not raise) when you do not support the other operand. Python then tries the reflected method (`__radd__`) and only then raises TypeError.',
      'Iteration protocol: `for x in obj` calls `iter(obj)` (`__iter__`), then `__next__()` on the result until StopIteration. An object with only `__getitem__` is also iterable via the old sequence protocol.',
      '`__repr__` is for developers and debugging (`repr(x)`, REPL, containers); `__str__` is for users and falls back to `__repr__`.',
      'Defining `__eq__` without `__hash__` makes instances unhashable, so they cannot go in sets or be dict keys. Equal objects must have equal hashes.',
    ],
    pitfalls: [
      'Raising an exception instead of returning NotImplemented for unknown operand types',
      'Defining __eq__ but not __hash__ (or hashing mutable fields)',
      'Comparing with `is` where equality is meant, or the reverse',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'Vec',
    statement:
      'Write class `Vec(*items)` supporting `len(v)`, iteration, `==` with another Vec (and False for non-Vec values), `v + w` (element-wise sum) and `repr(v)` like "Vec(1, 2, 3)". An empty Vec must be falsy.',
    signature: 'class Vec:',
    harness,
    adapter: 'run_dunder',
    solution: `class Vec:
    def __init__(self, *items):
        self.items = list(items)

    def __len__(self):
        return @@len(self.items)@@

    def __iter__(self):
        return @@iter(self.items)@@

    def __eq__(self, other):
        if not isinstance(other, Vec):
            return @@NotImplemented@@
        return self.items == other.items

    def __add__(self, other):
        return Vec(*[p + q for p, q in @@zip(self, other)@@])

    def __repr__(self):
        return 'Vec(' + ', '.join(map(str, self.items)) + ')'`,
    tests: [
      { args: [[1, 2, 3], [4, 5, 6]], expected: { len: 3, list: [1, 2, 3], eq: false, sum: [5, 7, 9], repr: 'Vec(1, 2, 3)', eq_other: false, truthy: true } },
      { args: [[1, 2], [1, 2]], expected: { len: 2, list: [1, 2], eq: true, sum: [2, 4], repr: 'Vec(1, 2)', eq_other: false, truthy: true }, name: 'equal vectors' },
      { args: [[], []], expected: { len: 0, list: [], eq: true, sum: [], repr: 'Vec()', eq_other: false, truthy: false }, name: 'empty is falsy' },
      { args: [[5], [7]], expected: { len: 1, list: [5], eq: false, sum: [12], repr: 'Vec(5)', eq_other: false, truthy: true }, name: 'single item' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Point',
    statement: 'Equal points should collapse inside a `set`. `Point` defines `==`, but building a set of points crashes. Fix the class.',
    harness,
    adapter: 'run_points',
    buggy: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        return isinstance(other, Point) and (self.x, self.y) == (other.x, other.y)`,
    fixed: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        return isinstance(other, Point) and (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))`,
    bugType: '__eq__ without __hash__',
    hint: 'Read the exact TypeError message. What does Python do to __hash__ when a class defines __eq__ but not __hash__?',
    explanation:
      'Defining __eq__ in a class body sets __hash__ to None, so instances become unhashable. Add `__hash__` computed from the same fields that __eq__ compares.',
    tests: [
      { args: [[[1, 2], [1, 2], [3, 4]]], expected: [2, true] },
      { args: [[[0, 0]]], expected: [1, true], name: 'single point' },
      { args: [[]], expected: [0, false], name: 'no points' },
      { args: [[[1, 2], [2, 1], [1, 2], [2, 1]]], expected: [2, true], name: 'order matters' },
    ],
  },
  boss: {
    title: 'A multiset: Bag',
    statement:
      'Write class `Bag(items=())` holding a multiset. Support: `len(bag)` (total count), `bag[item]` (how many times item occurs, 0 if absent), `item in bag`, iteration (each item repeated by its count), `bag1 + bag2` (a new Bag with the counts added) and `==` (equal counts; False for non-Bags).',
    language: 'python',
    fnName: 'Bag',
    harness,
    adapter: 'run_bag',
    starter: `class Bag:
    # your code here
    pass
`,
    solution: `class Bag:
    def __init__(self, items=()):
        self.counts = {}
        for item in items:
            self.counts[item] = self.counts.get(item, 0) + 1

    def __len__(self):
        return sum(self.counts.values())

    def __getitem__(self, item):
        return self.counts.get(item, 0)

    def __contains__(self, item):
        return item in self.counts

    def __iter__(self):
        for item, n in self.counts.items():
            for _ in range(n):
                yield item

    def __add__(self, other):
        return Bag(list(self) + list(other))

    def __eq__(self, other):
        return isinstance(other, Bag) and self.counts == other.counts`,
    tests: [
      {
        args: [['x', 'y', 'x'], ['y', 'z']],
        expected: { len: 3, count_first: 2, has: true, missing: false, iter: ['x', 'x', 'y'], sum_len: 5, sum_count: 2, eq: true, same_as_b: false },
      },
      {
        args: [[], ['q']],
        expected: { len: 0, count_first: 0, has: false, missing: false, iter: [], sum_len: 1, sum_count: 0, eq: true, same_as_b: false },
        name: 'empty bag',
      },
      {
        args: [['p', 'p'], ['p', 'p']],
        expected: { len: 2, count_first: 2, has: true, missing: false, iter: ['p', 'p'], sum_len: 4, sum_count: 4, eq: true, same_as_b: true },
        name: 'equal bags',
      },
      {
        args: [['a', 'b'], ['b', 'a']],
        expected: { len: 2, count_first: 1, has: true, missing: false, iter: ['a', 'b'], sum_len: 4, sum_count: 2, eq: true, same_as_b: true },
        name: 'order does not matter',
      },
    ],
    hints: ['Keep a dict of item → count. `__len__` is the sum of the counts and `__getitem__` is `counts.get(item, 0)`.', '`__iter__` can be a generator that yields each item count times; `__add__` can build a new Bag from `list(self) + list(other)`.'],
    combines: ['py-dunder', 'py-generators', 'hash-set'],
  },
  quiz: [
    {
      prompt: 'Which method does `str(obj)` fall back to when `__str__` is missing?',
      options: ['__format__', '__repr__', '__name__', 'It raises an error'],
      answer: 1,
      explain: 'object.__str__ delegates to __repr__, which is why defining __repr__ is the first thing to do.',
    },
    {
      prompt: 'What should `__add__` return for an operand type it does not support?',
      options: ['None', 'raise TypeError', 'NotImplemented', 'False'],
      answer: 2,
      explain: 'Returning NotImplemented lets Python try the other operand\'s reflected method before raising TypeError itself.',
    },
  ],
};

export default unit;
