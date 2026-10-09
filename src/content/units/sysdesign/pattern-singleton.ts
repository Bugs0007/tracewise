import type { Unit } from '@/content/types';
import type { Tone } from '@/engine/types';
import type { Design } from '@/content/lib/sysdesign-lld';
import { scenarioViz, splitEvent, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class Config:
    _instance = None                                 #@slot
    def __new__(cls, env="prod"):
        if cls._instance is None:                    #@check
            inst = super().__new__(cls)              #@create
            inst.env = env
            inst.settings = {}
            cls._instance = inst                     #@store
        return cls._instance                         #@return

class OrderService:
    def __init__(self): self.cfg = Config("prod")    #@client_a

class AuditService:
    def __init__(self): self.cfg = Config("test")    #@client_b

# tests must clear the global between cases
Config._instance = None                              #@reset
`;

const ENVS = ['prod', 'test', 'dev'];

interface In {
  events: string[];
}

type Ev = { kind: 'new'; who: 'A' | 'B'; env: string } | { kind: 'reset' };

function parse(list: string[]): Ev[] {
  return list.map((raw) => {
    const [k, rest] = splitEvent(raw);
    if (k === 'reset' && rest === undefined) return { kind: 'reset' };
    if ((k === 'a' || k === 'b') && rest && ENVS.includes(rest.toLowerCase())) return { kind: 'new', who: k.toUpperCase() as 'A' | 'B', env: rest.toLowerCase() };
    throw new Error(`Cannot read "${raw}". Use A:prod, B:test (callers A or B; env prod, test or dev) or reset`);
  });
}

const base = (inst: { n: number; env: string } | null): Design => {
  const d: Design = {
    classes: [
      { id: 'a', name: 'OrderService', methods: ['Config("prod")'], x: 130, y: 45 },
      { id: 'b', name: 'AuditService', methods: ['Config("test")'], x: 570, y: 45 },
      { id: 'cfg', name: 'Config', attrs: ['_instance'], methods: ['__new__()'], x: 350, y: 145 },
    ],
    rels: [
      { from: 'a', to: 'cfg', kind: 'uses', label: 'Config()' },
      { from: 'b', to: 'cfg', kind: 'uses', label: 'Config()' },
    ],
  };
  if (inst) {
    d.classes.push({ id: 'inst', name: `config #${inst.n}`, attrs: [`env=${inst.env}`], methods: [], x: 350, y: 270 });
    d.rels.push({ from: 'cfg', to: 'inst', kind: 'assoc', label: '_instance' });
  }
  return d;
};

function simulate(input: In) {
  const events = parse(input.events);
  const beats: Beat[] = [];
  const out: string[] = [];
  let inst: { n: number; env: string } | null = null;
  let made = 0;
  beats.push({ at: 'slot', caption: 'Config._instance is None: no object exists yet', design: base(null), state: { _instance: 'None', objects_created: 0 } });
  for (const ev of events) {
    if (ev.kind === 'reset') {
      inst = null;
      out.push('reset');
      beats.push({ at: 'reset', caption: 'Config._instance = None: the next call builds a fresh object', design: base(null), tones: { cfg: 'swap' }, state: { _instance: 'None', objects_created: made }, log: { text: 'reset (tests only)', tone: 'muted' } });
      continue;
    }
    const caller = ev.who === 'A' ? 'a' : 'b';
    const tones: Record<string, Tone> = { [caller]: 'active', cfg: 'compare' };
    const edge = { [`${caller}>cfg`]: 'path' as Tone };
    beats.push({ at: ev.who === 'A' ? 'client_a' : 'client_b', caption: `${ev.who} calls Config("${ev.env}") and checks _instance`, design: base(inst), tones, edgeTones: edge, state: { _instance: inst ? `#${inst.n}` : 'None', objects_created: made } });
    beats.push({ at: 'check', caption: inst ? `_instance is #${inst.n}, not None: skip construction` : '_instance is None: this is the first call', design: base(inst), tones, edgeTones: edge, state: { _instance: inst ? `#${inst.n}` : 'None', objects_created: made } });
    if (!inst) {
      made += 1;
      inst = { n: made, env: ev.env };
      beats.push({ at: 'store', caption: `Build object #${made} with env=${ev.env} and store it in _instance`, design: base(inst), tones: { ...tones, inst: 'new' }, edgeTones: edge, state: { _instance: `#${made}`, objects_created: made }, log: { text: `${ev.who}: created #${made} (${ev.env})`, tone: 'new' } });
    }
    const ignored = inst.env !== ev.env;
    out.push(`#${inst.n} ${inst.env}`);
    beats.push({
      at: 'return',
      caption: ignored ? `${ev.who} asked for "${ev.env}" but gets #${inst.n} with env=${inst.env}` : `${ev.who} gets the shared object #${inst.n} (env=${inst.env})`,
      design: base(inst),
      tones: { ...tones, inst: ignored ? 'error' : 'found' },
      edgeTones: edge,
      state: { _instance: `#${inst.n}`, objects_created: made },
      log: { text: ignored ? `${ev.who}: wanted ${ev.env}, got ${inst.env} (argument ignored)` : `${ev.who}: #${inst.n} ${inst.env}`, tone: ignored ? 'error' : 'default' },
      vars: { returned: `#${inst.n}`, env: inst.env },
    });
  }
  return { beats, result: out };
}

function reference(input: In): string[] {
  let current: [number, string] | null = null;
  let serial = 0;
  return parse(input.events).map((ev) => {
    if (ev.kind === 'reset') {
      current = null;
      return 'reset';
    }
    current ??= [++serial, ev.env];
    return `#${current[0]} ${current[1]}`;
  });
}

const viz = scenarioViz<In, string[]>({
  id: 'pattern-singleton',
  title: 'Singleton: one shared config object',
  code,
  design: base(null),
  diagramTitle: 'Participants',
  size: { width: 700, height: 320 },
  stateTitle: 'Class state',
  logTitle: 'What each caller received',
  inputs: [{ key: 'events', label: 'Events', kind: 'strings', default: ['A:prod', 'B:test', 'reset', 'B:test', 'A:prod'], maxItems: 8, help: 'A:prod or B:test = that service calls Config(env); reset = tests clear the global. Envs: prod, test, dev.' }],
  presets: [
    { label: 'Second argument is ignored', input: { events: ['A:prod', 'B:test'] } },
    { label: 'Reset between tests', input: { events: ['A:prod', 'reset', 'B:test', 'reset', 'A:dev'] } },
    { label: 'Same env', input: { events: ['A:prod', 'B:prod', 'A:prod'] } },
  ],
  simulate,
  reference,
});

const unit: Unit = {
  id: 'pattern-singleton',
  hook: 'Singleton is the most asked and most criticised pattern. Interviewers want the one-instance mechanics and the honest downsides: hidden global state and tests that leak into each other.',
  predict: {
    prompt: 'The first call is `Config("prod")`. Later another module calls `Config("test")`. With the singleton above, what does the second caller get?',
    options: ['A new object with env="test"', 'The same object, still env="prod"; the argument is silently ignored', 'A TypeError because the class is already built', 'The same object, but env is overwritten to "test"'],
    answer: 1,
    explain: '`__new__` returns the stored instance without looking at its arguments. Surprising configuration like this is one reason singletons make code hard to test.',
  },
  viz,
  deeper: {
    points: [
      'Intent: guarantee **one instance** and a single access point. In Python the simplest forms are a module-level object (modules are imported once) or `__new__` returning a cached instance.',
      'Downsides: it is a **global in disguise**. Callers have a hidden dependency, tests share state (you must reset it), and the first caller silently decides the configuration.',
      'Prefer creating one object at startup and **injecting** it (see dependency inversion). The "single instance" then becomes a deployment fact, not a language trick.',
      '`__init__` runs on every `Config()` call even when `__new__` returns the cached object. Put one-time setup in `__new__`, or guard it, or you will wipe state.',
      'Thread safety: two threads can both see `None` and both create. In a threaded server protect creation with a lock, or build the instance eagerly at import.',
    ],
    pitfalls: ['Forgetting to return the stored instance, so every call builds a new object', 'Initialising state in `__init__`, which resets it on every call', 'Leaving state behind between tests (always reset or inject a fresh one)'],
  },
  practice: {
    language: 'python',
    fnName: 'Config',
    statement:
      'Make `Config` a singleton: `Config(env="prod")` always returns the same object. The first call sets `env` and an empty `settings` dict; later calls ignore their argument and must not reset anything. Setting `Config._instance = None` starts over.',
    signature: 'class Config:',
    harness: `
def run_singleton(cls, steps):
    cls._instance = None
    seen = []
    out = []
    for name, *args in steps:
        if name == 'new':
            obj = cls(*args)
            if not any(obj is s for s in seen):
                seen.append(obj)
            out.append([[i for i, s in enumerate(seen) if s is obj][0] + 1, obj.env])
        elif name == 'set':
            cls().settings[args[0]] = args[1]
            out.append(None)
        elif name == 'get':
            out.append(cls().settings.get(args[0]))
        elif name == 'reset':
            cls._instance = None
            out.append(None)
    return out
`,
    adapter: 'run_singleton',
    solution: `class Config:
    _instance = None

    def __new__(cls, env='prod'):
        if @@cls._instance is None@@:
            inst = super().__new__(cls)
            inst.env = env
            inst.settings = {}
            @@cls._instance = inst@@
        return @@cls._instance@@`,
    tests: [
      { args: [[['new', 'prod'], ['new', 'test']]], expected: [[1, 'prod'], [1, 'prod']], name: 'same object, argument ignored' },
      { args: [[['new'], ['set', 'debug', true], ['get', 'debug'], ['new', 'dev']]], expected: [[1, 'prod'], null, true, [1, 'prod']], name: 'state is shared' },
      { args: [[['new', 'prod'], ['reset'], ['new', 'test'], ['new', 'prod']]], expected: [[1, 'prod'], null, [2, 'test'], [2, 'test']], name: 'reset builds a new one' },
      { args: [[['new', 'dev'], ['set', 'a', 1], ['new', 'dev'], ['get', 'a']]], expected: [[1, 'dev'], null, [1, 'dev'], 1], name: 'second call does not wipe settings' },
      { args: [[['get', 'missing']]], expected: [null], name: 'unset key' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Config',
    statement: 'Two parts of the app report different `Config` objects, so a setting changed in one place never shows up in the other. Find why the singleton hands out new objects.',
    harness: `
def run_singleton(cls, steps):
    cls._instance = None
    seen = []
    out = []
    for name, *args in steps:
        if name == 'new':
            obj = cls(*args)
            if not any(obj is s for s in seen):
                seen.append(obj)
            out.append([[i for i, s in enumerate(seen) if s is obj][0] + 1, getattr(obj, 'env', None)])
        elif name == 'set':
            cls().settings[args[0]] = args[1]
            out.append(None)
        elif name == 'get':
            out.append(cls().settings.get(args[0]))
        elif name == 'reset':
            cls._instance = None
            out.append(None)
    return out
`,
    adapter: 'run_singleton',
    buggy: `class Config:
    _instance = None

    def __new__(cls, env='prod'):
        inst = super().__new__(cls)
        if cls._instance is None:
            inst.env = env
            inst.settings = {}
            cls._instance = inst
        return inst`,
    fixed: `class Config:
    _instance = None

    def __new__(cls, env='prod'):
        inst = super().__new__(cls)
        if cls._instance is None:
            inst.env = env
            inst.settings = {}
            cls._instance = inst
        return cls._instance`,
    tests: [
      { args: [[['new', 'prod'], ['new', 'test']]], expected: [[1, 'prod'], [1, 'prod']], name: 'one object' },
      { args: [[['new'], ['set', 'k', 5], ['get', 'k']]], expected: [[1, 'prod'], null, 5], name: 'settings shared' },
      { args: [[['new', 'dev'], ['reset'], ['new', 'prod']]], expected: [[1, 'dev'], null, [2, 'prod']], name: 'reset' },
    ],
    bugType: 'returns a new instance',
    hint: 'The cached object is stored correctly. What does the method hand back to the caller?',
    explanation: 'It builds a fresh `inst` on every call and returns that local variable. Only the first call stores it. The method must return `cls._instance`, the cached object, on every call.',
  },
  boss: {
    title: 'Named logger registry',
    statement:
      'Write `Logger` where `Logger.get(name)` (a classmethod) returns the one `Logger` per name (a per-name singleton). `log(msg)` appends `"[<name>] <msg>"` to this logger\'s `lines` and to the `lines` of every ancestor logger, where the ancestors of `"app.db.pool"` are `"app.db"` and `"app"` (created on demand). It returns the number of lines in its own `lines`. `Logger.reset()` forgets all loggers.',
    language: 'python',
    fnName: 'Logger',
    harness: `
def run_logger(cls, steps):
    cls.reset()
    seen = []
    out = []
    for name, *args in steps:
        if name == 'get':
            obj = cls.get(args[0])
            if not any(obj is s for s in seen):
                seen.append(obj)
            out.append([i for i, s in enumerate(seen) if s is obj][0] + 1)
        elif name == 'log':
            out.append(cls.get(args[0]).log(args[1]))
        elif name == 'lines':
            out.append(list(cls.get(args[0]).lines))
        elif name == 'reset':
            cls.reset()
            out.append(None)
    return out
`,
    adapter: 'run_logger',
    starter: `class Logger:
    pass
`,
    solution: `class Logger:
    _registry = {}

    def __init__(self, name):
        self.name = name
        self.lines = []

    @classmethod
    def get(cls, name):
        if name not in cls._registry:
            cls._registry[name] = cls(name)
        return cls._registry[name]

    @classmethod
    def reset(cls):
        cls._registry = {}

    def log(self, msg):
        text = '[' + self.name + '] ' + msg
        self.lines.append(text)
        parts = self.name.split('.')
        for i in range(len(parts) - 1, 0, -1):
            Logger.get('.'.join(parts[:i])).lines.append(text)
        return len(self.lines)`,
    tests: [
      { args: [[['get', 'app'], ['get', 'app'], ['get', 'db']]], expected: [1, 1, 2], name: 'one object per name' },
      { args: [[['log', 'app.db', 'hi'], ['lines', 'app'], ['lines', 'app.db'], ['lines', 'other']]], expected: [1, ['[app.db] hi'], ['[app.db] hi'], []], name: 'child lines reach the parent' },
      { args: [[['log', 'a.b.c', 'x'], ['log', 'a', 'y'], ['lines', 'a.b'], ['lines', 'a']]], expected: [1, 2, ['[a.b.c] x'], ['[a.b.c] x', '[a] y']], name: 'every ancestor is updated' },
      { args: [[['get', 'x'], ['reset'], ['get', 'x'], ['get', 'y']]], expected: [1, null, 2, 3], name: 'reset forgets loggers' },
      { args: [[['log', 'app', 'one'], ['log', 'app', 'two']]], expected: [1, 2], name: 'log returns own line count' },
      { args: [[['log', 'app.db', 'q'], ['reset'], ['lines', 'app']]], expected: [1, null, []], name: 'reset clears history' },
    ],
    hints: ['A class-level dict maps name to instance; `get` creates on first use. Remember `reset` must replace or clear that dict.', 'For ancestors, split the name on "." and loop over the shorter prefixes ("a.b.c" gives "a.b" then "a"), fetching each with `get` so missing ones are created.'],
    combines: ['hash-set'],
  },
  quiz: [
    {
      prompt: 'Which is the least harmful way to get "one shared instance" in a Python service?',
      options: ['A class with a private constructor trick', 'Create it once at startup and pass it to the objects that need it', 'A global variable reassigned from many modules', 'A metaclass with a thread lock around every method'],
      answer: 1,
      explain: 'Injecting a single object keeps the dependency visible and replaceable in tests, with none of the global-state traps.',
    },
  ],
};

export default unit;
