import type { Unit } from '@/content/types';
import type { Cls, Design } from '@/content/lib/sysdesign-lld';
import { scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
LINES = []

class Notifier:
    def send(self, msg): raise NotImplementedError

class EmailNotifier(Notifier):
    def send(self, msg): return "email:" + msg                           #@base

class Decorator(Notifier):
    def __init__(self, inner): self._inner = inner                       #@wrap
    def send(self, msg): return self._inner.send(msg)                    #@delegate

class Prefix(Decorator):
    def send(self, msg): return self._inner.send("[ALERT] " + msg)       #@prefix

class Upper(Decorator):
    def send(self, msg): return self._inner.send(msg.upper())            #@upper

class Sign(Decorator):
    def send(self, msg): return self._inner.send(msg + " -ops")          #@sign

class Log(Decorator):
    def send(self, msg):
        LINES.append("log: " + msg)                                      #@log
        return self._inner.send(msg)

notifier = Log(Upper(Prefix(EmailNotifier())))    # wrapped inner to outer   #@client
notifier.send("disk full")                                               #@call
`;

const LAYERS = ['prefix', 'upper', 'sign', 'log'] as const;
type Layer = (typeof LAYERS)[number];

const NAME: Record<Layer, string> = { prefix: 'Prefix', upper: 'Upper', sign: 'Sign', log: 'Log' };
const DESC: Record<Layer, string> = { prefix: 'adds "[ALERT] " in front', upper: 'upper-cases the text', sign: 'appends " -ops"', log: 'records what it sees' };

interface In {
  wrap: string[];
  message: string;
}

interface Out {
  delivered: string;
  log: string[];
}

function parseLayers(list: string[]): Layer[] {
  return list.map((raw) => {
    const v = raw.trim().toLowerCase() as Layer;
    if (!LAYERS.includes(v)) throw new Error(`Unknown decorator "${raw}". Choose from: ${LAYERS.join(', ')}`);
    return v;
  });
}

const apply = (layer: Layer, msg: string): string => (layer === 'prefix' ? '[ALERT] ' + msg : layer === 'upper' ? msg.toUpperCase() : layer === 'sign' ? msg + ' -ops' : msg);

function chainDesign(outer: Layer[]): Design {
  const n = outer.length + 2;
  const xs = (i: number) => (n === 2 ? 70 + i * 560 : Math.round(70 + (i * 560) / (n - 1)));
  const classes: Cls[] = [
    { id: 'notifier', name: 'Notifier', kind: 'interface', methods: ['send(msg)'], x: 350, y: 45 },
    { id: 'client', name: 'Client', methods: [], x: xs(0), y: 210 },
  ];
  const rels: Design['rels'] = [];
  outer.forEach((l, i) => {
    classes.push({ id: `l${i}`, name: NAME[l], attrs: ['_inner'], methods: ['send()'], x: xs(i + 1), y: 210 });
    rels.push({ from: `l${i}`, to: 'notifier', kind: 'implements', label: '' });
  });
  classes.push({ id: 'base', name: 'EmailNotifier', methods: ['send()'], x: xs(n - 1), y: 210 });
  rels.push({ from: 'base', to: 'notifier', kind: 'implements', label: '' });
  const ids = ['client', ...outer.map((_, i) => `l${i}`), 'base'];
  for (let i = 0; i < ids.length - 1; i++) rels.push({ from: ids[i], to: ids[i + 1], kind: i === 0 ? 'uses' : 'aggregates', label: i === 0 ? 'send(msg)' : 'inner.send()' });
  return { classes, rels };
}

function simulate(input: In) {
  const inner = parseLayers(input.wrap);
  const outer = [...inner].reverse();
  const design = chainDesign(outer);
  const beats: Beat[] = [];
  const lines: string[] = [];
  const edge = (a: string, b: string) => ({ [`${a}>${b}`]: 'path' as const });
  const ids = ['client', ...outer.map((_, i) => `l${i}`), 'base'];
  beats.push({ at: 'client', caption: `Wrapped inner to outer: ${inner.length ? inner.map((l) => NAME[l]).join(' in ') + ' around ' : ''}EmailNotifier`, design, tones: Object.fromEntries(ids.map((id) => [id, 'default' as const])), state: { message: input.message, wrappers: inner.length } });
  beats.push({ at: 'call', caption: `Client calls send("${input.message}") on the outermost object`, design, tones: { client: 'active' }, edgeTones: edge('client', ids[1]), msg: { from: 'Client', to: outer.length ? NAME[outer[0]] : 'Email', label: `send("${input.message}")` }, state: { message: input.message, wrappers: inner.length } });
  let msg = input.message;
  outer.forEach((layer, i) => {
    const before = msg;
    msg = apply(layer, msg);
    if (layer === 'log') lines.push(`log: ${before}`);
    const next = i + 1 < outer.length ? NAME[outer[i + 1]] : 'Email';
    beats.push({
      at: layer,
      caption: layer === 'log' ? `Log records "${before}" and passes it on unchanged` : `${NAME[layer]} ${DESC[layer]}: "${msg}", then delegates`,
      design,
      tones: { [`l${i}`]: 'active' },
      edgeTones: edge(`l${i}`, ids[i + 2]),
      msg: { from: NAME[layer], to: next, label: `send("${msg}")` },
      state: { message: msg, wrappers: inner.length },
      log: layer === 'log' ? { text: `log: ${before}`, tone: 'found' } : { text: `${NAME[layer]}: "${before}" -> "${msg}"` },
      vars: { msg },
    });
  });
  const delivered = 'email:' + msg;
  beats.push({ at: 'base', caption: `EmailNotifier is the real work: returns "${delivered}"`, design, tones: { base: 'found' }, msg: { from: 'Email', to: 'Client', label: delivered, dashed: true }, state: { message: msg, wrappers: inner.length }, log: { text: `delivered ${delivered}`, tone: 'found' } });
  beats.push({ at: 'delegate', caption: 'Each wrapper returns the inner result, so the value travels back out unchanged', design, tones: Object.fromEntries(ids.map((id) => [id, 'done' as const])), state: { returned: delivered, log_lines: lines.length }, stateTitle: 'Result' });
  return { beats, result: { delivered, log: lines } satisfies Out };
}

function reference(input: In): Out {
  const outer = parseLayers(input.wrap).reverse();
  const log: string[] = [];
  const text = outer.reduce((m, l) => {
    if (l === 'log') log.push('log: ' + m);
    return apply(l, m);
  }, input.message);
  return { delivered: 'email:' + text, log };
}

const viz = scenarioViz<In, Out>({
  id: 'pattern-decorator',
  title: 'Decorator: wrap a notifier to add behaviour',
  code,
  design: chainDesign(['log', 'upper', 'prefix']),
  diagramTitle: 'Wrapping chain (outer to inner)',
  size: { width: 700, height: 290 },
  actors: ['Client', 'Log', 'Upper', 'Prefix', 'Sign', 'Email'],
  stateTitle: 'Message in flight',
  logTitle: 'Trace',
  inputs: [
    { key: 'wrap', label: 'Wrap order (inner to outer)', kind: 'strings', default: ['prefix', 'upper', 'log'], maxItems: 3, help: 'Any of prefix, upper, sign, log. The last one is outermost and runs first.' },
    { key: 'message', label: 'Message', kind: 'string', default: 'disk full' },
  ],
  presets: [
    { label: 'Order matters (1)', input: { wrap: ['sign', 'upper'], message: 'disk full' } },
    { label: 'Order matters (2)', input: { wrap: ['upper', 'sign'], message: 'disk full' } },
    { label: 'No decorators', input: { wrap: [], message: 'ping' } },
  ],
  simulate,
  reference,
});

const NOTIFY_HARNESS = `
class EmailNotifier:
    def __init__(self):
        self.sent = []
    def send(self, msg):
        self.sent.append(msg)
        return 'email:' + msg

def run_decorated(cls, prefixes, msgs):
    base = EmailNotifier()
    n = base
    for p in prefixes:
        n = cls(n, p)
    return [[n.send(m) for m in msgs], base.sent]
`;

const unit: Unit = {
  id: 'pattern-decorator',
  hook: 'Decorator shows up in middleware, logging, caching and retries: "add behaviour around an object without subclassing". The trap interviewers set is the wrapper that forgets to delegate or to return the result.',
  predict: {
    prompt: 'A `Sign` wrapper is placed *outside* an `Upper` wrapper around an email notifier, then `send("hi")` is called. What does the email contain?',
    options: ['`email:HI -ops`', '`email:HI -OPS`', '`email:hi -ops`', '`email:-ops HI`'],
    answer: 1,
    explain: 'The outermost wrapper runs first: Sign makes "hi -ops", then Upper (inside it) makes "HI -OPS", then the email notifier sends it. Wrapping order changes the result.',
  },
  viz,
  deeper: {
    points: [
      'Intent: **attach responsibilities dynamically** by wrapping an object in another that has the *same interface*. Callers cannot tell a wrapped object from a plain one.',
      'A decorator holds the inner object (**composition**) and implements the same methods. Each method does extra work, then **delegates and returns** the inner result.',
      'Combinations are built at runtime by stacking: three small decorators give eight behaviours without eight subclasses.',
      'Python also has `@decorator` syntax for functions. It is the same idea applied to callables: `wrapper(*args)` calls the original and returns its result.',
      'Order matters. Put logging outside retry to log once, inside retry to log every attempt; the diagram above shows how text is changed from the outside in.',
    ],
    pitfalls: ['Forgetting to call the inner object (the behaviour silently disappears)', 'Calling the inner object but not returning its result (callers get None)', 'Decorators that expose extra methods callers start depending on, breaking substitutability'],
  },
  practice: {
    language: 'python',
    fnName: 'Prefixed',
    statement:
      'The harness provides `EmailNotifier` with `send(msg)` that returns `"email:" + msg`. Write the decorator `Prefixed(inner, prefix)` with the same `send(msg)` interface: it sends `prefix + msg` through `inner` and returns what `inner` returns. Wrappers can be stacked.',
    signature: 'class Prefixed:',
    harness: NOTIFY_HARNESS,
    adapter: 'run_decorated',
    solution: `class Prefixed:
    def __init__(self, inner, prefix):
        self._inner = @@inner@@
        self._prefix = prefix

    def send(self, msg):
        return @@self._inner.send(self._prefix + msg)@@`,
    tests: [
      { args: [[], ['a']], expected: [['email:a'], ['a']], name: 'no wrapper' },
      { args: [['[1] '], ['hi', 'yo']], expected: [['email:[1] hi', 'email:[1] yo'], ['[1] hi', '[1] yo']], name: 'one wrapper' },
      { args: [['A', 'B'], ['x']], expected: [['email:ABx'], ['ABx']], name: 'stacked: the inner wrapper prefixes last' },
      { args: [['>'], []], expected: [[], []], name: 'nothing sent' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Prefixed',
    statement: 'After wrapping the notifier, `send()` returns `None` to the caller even though the email goes out. The wrapper breaks the contract of the interface it decorates.',
    harness: NOTIFY_HARNESS,
    adapter: 'run_decorated',
    buggy: `class Prefixed:
    def __init__(self, inner, prefix):
        self._inner = inner
        self._prefix = prefix

    def send(self, msg):
        self._inner.send(self._prefix + msg)`,
    fixed: `class Prefixed:
    def __init__(self, inner, prefix):
        self._inner = inner
        self._prefix = prefix

    def send(self, msg):
        return self._inner.send(self._prefix + msg)`,
    tests: [
      { args: [['[1] '], ['hi']], expected: [['email:[1] hi'], ['[1] hi']], name: 'result is returned' },
      { args: [['A', 'B'], ['x', 'y']], expected: [['email:ABx', 'email:ABy'], ['ABx', 'ABy']], name: 'stacked wrappers pass results through' },
      { args: [[], ['z']], expected: [['email:z'], ['z']], name: 'plain notifier' },
    ],
    bugType: 'not returning the delegate result',
    hint: 'The inner call happens (the log shows it). What does the wrapper hand back to its caller?',
    explanation: 'The wrapper calls `inner.send` but drops the value, so `send` returns None. A decorator must preserve the interface, including return values.',
  },
  boss: {
    title: 'Stackable beverage',
    statement:
      'Write `build_beverage(items)` for a list like `["espresso", "milk", "double"]`. The first item is a base (`espresso` costs 200, `tea` 150). Each later item wraps everything built so far as a decorator: `milk` adds 50, `syrup` adds 30, `double` doubles the cost of what it wraps. The description of a wrapper is `"<item>(<inner>)"` for `double`, otherwise `"<inner>, <item>"`. Return `[description, cost]`. Raise `ValueError` for an empty list, a first item that is not a base, an unknown item, or a base used after the first item.',
    language: 'python',
    fnName: 'build_beverage',
    harness: `
def run_safe_fn(fn, *args):
    try:
        return fn(*args)
    except Exception as e:
        return '!' + type(e).__name__
`,
    adapter: 'run_safe_fn',
    starter: `def build_beverage(items):
    pass
`,
    solution: `class Espresso:
    def cost(self): return 200
    def describe(self): return 'espresso'

class Tea:
    def cost(self): return 150
    def describe(self): return 'tea'

class Milk:
    def __init__(self, inner): self.inner = inner
    def cost(self): return self.inner.cost() + 50
    def describe(self): return self.inner.describe() + ', milk'

class Syrup:
    def __init__(self, inner): self.inner = inner
    def cost(self): return self.inner.cost() + 30
    def describe(self): return self.inner.describe() + ', syrup'

class Double:
    def __init__(self, inner): self.inner = inner
    def cost(self): return self.inner.cost() * 2
    def describe(self): return 'double(' + self.inner.describe() + ')'

BASES = {'espresso': Espresso, 'tea': Tea}
WRAPPERS = {'milk': Milk, 'syrup': Syrup, 'double': Double}

def build_beverage(items):
    if not items or items[0] not in BASES:
        raise ValueError('first item must be a base')
    drink = BASES[items[0]]()
    for item in items[1:]:
        if item not in WRAPPERS:
            raise ValueError('unknown add-on: ' + item)
        drink = WRAPPERS[item](drink)
    return [drink.describe(), drink.cost()]`,
    tests: [
      { args: [['espresso']], expected: ['espresso', 200], name: 'just a base' },
      { args: [['tea', 'milk', 'syrup']], expected: ['tea, milk, syrup', 230], name: 'two add-ons' },
      { args: [['espresso', 'double', 'milk']], expected: ['double(espresso), milk', 450], name: 'double before milk' },
      { args: [['espresso', 'milk', 'double']], expected: ['double(espresso, milk)', 500], name: 'double after milk' },
      { args: [[]], expected: '!ValueError', name: 'empty' },
      { args: [['milk']], expected: '!ValueError', name: 'first item must be a base' },
      { args: [['tea', 'whip']], expected: '!ValueError', name: 'unknown add-on' },
      { args: [['tea', 'espresso']], expected: '!ValueError', name: 'base after the first item' },
    ],
    hints: ['Give every drink the same two methods, `cost()` and `describe()`. A wrapper stores `inner` and calls `inner.cost()` / `inner.describe()` before adding its own part.', 'Look up the first item in a dict of bases, then loop over the rest wrapping `drink = WRAPPERS[item](drink)`. Anything not in WRAPPERS (including a base) is an unknown add-on.'],
    combines: ['solid-ocp', 'oop-principles'],
  },
  quiz: [
    {
      prompt: 'What distinguishes a decorator from a plain subclass?',
      options: ['A decorator wraps an existing object at runtime and shares its interface', 'A decorator cannot call the original', 'A decorator must be a function', 'A decorator changes the original class in place'],
      answer: 0,
      explain: 'Subclassing fixes behaviour at class definition time. A decorator is composed at runtime, so you choose and order wrappers per object.',
    },
  ],
};

export default unit;
