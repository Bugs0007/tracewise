import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { OPS_SAFE, solidViz, type SolidSpec } from '@/content/lib/sysdesign-lld';

const code = `
# ---- before: one fat interface
class Machine:
    def print(self, doc): raise NotImplementedError      #@before
    def scan(self): raise NotImplementedError
    def fax(self, doc): raise NotImplementedError

class BasicPrinter(Machine):
    def print(self, doc): return "printed " + doc
    def scan(self): raise NotImplementedError("no scanner")   #@stubs
    def fax(self, doc): raise NotImplementedError("no modem")

# ---- after: small role interfaces
class Printer:                                             #@roles
    def print(self, doc): raise NotImplementedError
class Scanner:
    def scan(self): raise NotImplementedError
class Faxer:
    def fax(self, doc): raise NotImplementedError

class BasicPrinter(Printer):                               #@pick
    def print(self, doc): return "printed " + doc

class AllInOne(Printer, Scanner, Faxer): ...

def run_job(printer):                                      #@clients
    return printer.print("report")

# replay: who must change when an interface changes?       #@sim
`;

const spec: SolidSpec = {
  id: 'solid-isp',
  title: 'Interface segregation: slim the fat interface',
  code,
  before: {
    classes: [
      { id: 'machine', name: 'Machine', kind: 'interface', methods: ['print()', 'scan()', 'fax()'], x: 350, y: 140, owns: ['print_api', 'scan_api', 'fax_api', 'staple_api'] },
      { id: 'basic', name: 'BasicPrinter', methods: ['print()', 'scan() raises', 'fax() raises'], x: 130, y: 250, owns: ['print_api', 'scan_api', 'fax_api', 'staple_api'] },
      { id: 'allin', name: 'AllInOne', methods: ['print()', 'scan()', 'fax()'], x: 570, y: 250, owns: ['print_api', 'scan_api', 'fax_api', 'staple_api'] },
      { id: 'job', name: 'PrintJob', methods: ['run(machine)'], x: 130, y: 40, owns: ['print_api'] },
      { id: 'mail', name: 'Mailroom', methods: ['send(machine)'], x: 570, y: 40, owns: ['fax_api'] },
    ],
    rels: [
      { from: 'basic', to: 'machine', kind: 'implements' },
      { from: 'allin', to: 'machine', kind: 'implements' },
      { from: 'job', to: 'machine', kind: 'uses' },
      { from: 'mail', to: 'machine', kind: 'uses' },
    ],
  },
  steps: [
    {
      at: 'roles',
      caption: 'Split Machine into three role interfaces: Printer, Scanner, Faxer',
      remove: ['machine'],
      add: [
        { id: 'printer', name: 'Printer', kind: 'interface', methods: ['print()'], x: 130, y: 140, owns: ['print_api'] },
        { id: 'scanner', name: 'Scanner', kind: 'interface', methods: ['scan()'], x: 350, y: 140, owns: ['scan_api'] },
        { id: 'faxer', name: 'Faxer', kind: 'interface', methods: ['fax()'], x: 570, y: 140, owns: ['fax_api'] },
      ],
    },
    {
      at: 'pick',
      caption: 'Each class implements only the roles it really supports: no stubs that raise',
      update: [
        { id: 'basic', methods: ['print()'], owns: ['print_api'] },
        { id: 'allin', x: 450 },
      ],
      addRels: [
        { from: 'basic', to: 'printer', kind: 'implements' },
        { from: 'allin', to: 'printer', kind: 'implements' },
        { from: 'allin', to: 'scanner', kind: 'implements' },
        { from: 'allin', to: 'faxer', kind: 'implements' },
      ],
    },
    {
      at: 'clients',
      caption: 'Clients depend only on the role they call: PrintJob needs a Printer, nothing else',
      update: [
        { id: 'job', methods: ['run(printer)'] },
        { id: 'mail', methods: ['send(faxer)'] },
      ],
      addRels: [
        { from: 'job', to: 'printer', kind: 'uses' },
        { from: 'mail', to: 'faxer', kind: 'uses' },
      ],
    },
  ],
  requests: {
    fax_api: { label: 'change the fax() signature' },
    scan_api: { label: 'change the scan() signature' },
    print_api: { label: 'print() gets a copies argument' },
    staple_api: { label: 'add stapling', adds: 'Stapler role' },
  },
  start: { at: 'stubs', caption: 'BasicPrinter must implement scan() and fax() it can never support', flag: ['machine', 'basic'] },
  finish: { at: 'clients', caption: 'Small interfaces: implementers and clients only know what they use' },
  simAt: 'sim',
  defaultRequests: ['fax_api', 'scan_api', 'staple_api'],
  presets: [
    { label: 'Fax API changes', requests: ['fax_api'] },
    { label: 'New feature', requests: ['staple_api'] },
    { label: 'Everything', requests: ['print_api', 'scan_api', 'fax_api', 'staple_api'] },
  ],
};

const ROLES_HARNESS = `
class Printer:
    def print_doc(self, doc):
        raise NotImplementedError

class Scanner:
    def scan_doc(self, name):
        raise NotImplementedError
`;

const DEVICE_HARNESS = `
class Printer:
    def print_doc(self, doc):
        return "print:" + doc

class Faxer:
    def fax(self, doc):
        return "fax:" + doc

class BasicPrinter(Printer):
    pass

class AllInOne(Printer, Faxer):
    pass

DEVICES = {"basic": BasicPrinter, "all": AllInOne}
`;

const viz = solidViz(spec);

const unit: Unit = {
  id: 'solid-isp',
  hook: 'ISP shows up as "why does my class have methods that throw NotImplementedError?". Know the smell and the fix: **many small role interfaces** instead of one fat one.',
  predict: {
    prompt: 'A `Machine` interface declares print(), scan() and fax(). `BasicPrinter` implements it and raises `NotImplementedError` in scan() and fax(). A new method `staple()` is added to `Machine`. What happens?',
    options: ['Only AllInOne must change', 'Every implementer must change, including BasicPrinter, which will never staple', 'No class changes because Python interfaces are optional', 'Only the callers must change'],
    answer: 1,
    explain: 'A fat interface couples everything that implements it. Each new method forces an edit (usually another raising stub) in classes that have nothing to do with the feature.',
  },
  viz,
  deeper: {
    points: [
      '**Clients should not depend on methods they do not use.** Design interfaces from the caller\'s point of view: "what does this code need?".',
      'Smells: `NotImplementedError` stubs, empty method bodies, `isinstance` checks before a call, and interfaces whose name ends in Manager or Service with 15 methods.',
      'The fix is role interfaces (Printer, Scanner, Faxer). A class implementing several roles is fine; a client taking one role stays small and easy to fake in tests.',
      'In Python you often get this for free with duck typing or `typing.Protocol`: describe only the one or two methods the function calls.',
      'The replay shows the saving is not always large (print() is still shared by its implementers and clients); the big wins are new features and stub removal.',
    ],
    pitfalls: ['Splitting into one-method interfaces for everything (interface explosion)', 'Keeping the fat interface "for convenience" next to the new roles', 'Having callers type-check for a role (`isinstance(x, Faxer)`) instead of asking for the role in their signature'],
  },
  practice: {
    language: 'python',
    fnName: 'AllInOne',
    statement: 'The harness gives small role interfaces `Printer` (`print_doc`) and `Scanner` (`scan_doc`). Implement `AllInOne(Printer, Scanner)`: `print_doc(doc)` returns `"printed:" + doc`, `scan_doc(name)` returns `"scanned:" + name`, and `stats()` returns `{"printed": n, "scanned": m}` counting successful calls.',
    signature: 'class AllInOne(Printer, Scanner):',
    harness: ROLES_HARNESS + OPS_HARNESS,
    adapter: 'run_ops',
    solution: `class AllInOne(Printer, Scanner):
    def __init__(self):
        self.printed = 0
        self.scanned = 0

    def print_doc(self, doc):
        @@self.printed += 1@@
        return "printed:" + doc

    def scan_doc(self, name):
        self.scanned @@+= 1@@
        return @@"scanned:" + name@@

    def stats(self):
        return {"printed": self.printed, "scanned": self.scanned}`,
    tests: [
      { args: [['AllInOne', 'print_doc', 'scan_doc', 'stats'], [[], ['a.pdf'], ['b'], []]], expected: [null, 'printed:a.pdf', 'scanned:b', { printed: 1, scanned: 1 }], name: 'one of each' },
      { args: [['AllInOne', 'stats'], [[], []]], expected: [null, { printed: 0, scanned: 0 }], name: 'fresh counters' },
      { args: [['AllInOne', 'print_doc', 'print_doc', 'print_doc', 'stats'], [[], ['x'], ['y'], ['z'], []]], expected: [null, 'printed:x', 'printed:y', 'printed:z', { printed: 3, scanned: 0 }], name: 'only printing' },
      { args: [['AllInOne', 'scan_doc', 'scan_doc', 'stats'], [[], ['p1'], ['p2'], []]], expected: [null, 'scanned:p1', 'scanned:p2', { printed: 0, scanned: 2 }], name: 'only scanning' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Office',
    statement: 'Adding a basic printer to the office makes `fax_all` crash for everyone. The office should fax only through devices that can fax.',
    harness: DEVICE_HARNESS + OPS_SAFE,
    adapter: 'run_ops_safe',
    buggy: `class Office:
    def __init__(self):
        self.devices = []

    def add(self, kind):
        self.devices.append(DEVICES[kind]())

    def count(self):
        return len(self.devices)

    def fax_all(self, msg):
        return [d.fax(msg) for d in self.devices]`,
    fixed: `class Office:
    def __init__(self):
        self.devices = []

    def add(self, kind):
        self.devices.append(DEVICES[kind]())

    def count(self):
        return len(self.devices)

    def fax_all(self, msg):
        return [d.fax(msg) for d in self.devices if isinstance(d, Faxer)]`,
    tests: [
      { args: [['Office', 'add', 'add', 'fax_all'], [[], ['basic'], ['all'], ['hi']]], expected: [null, null, null, ['fax:hi']], name: 'mixed devices' },
      { args: [['Office', 'add', 'fax_all'], [[], ['basic'], ['hi']]], expected: [null, null, []], name: 'printer only: nothing to fax' },
      { args: [['Office', 'add', 'add', 'fax_all', 'count'], [[], ['all'], ['all'], ['x'], []]], expected: [null, null, null, ['fax:x', 'fax:x'], 2], name: 'two fax machines' },
    ],
    bugType: 'client depends on a role the device lacks',
    hint: 'Which devices in the list actually have a fax() method?',
    explanation: 'The loop assumes every device is a fax machine. Filter by the Faxer role (or better, keep a separate list of Faxer devices) so printers are never asked to fax.',
  },
  boss: {
    title: 'Humans work and eat, robots only work',
    statement:
      'Design role interfaces `Workable` and `Eatable`, then `Human` (both roles) and `Robot` (work only, it must not have an `eat` method). Build `Shift()` with `add(kind, name)` (`"human"` or `"robot"`, anything else raises `ValueError`), `work_all()` returning `"<name> works"` for everyone in the order added, `lunch_all()` returning `"<name> eats"` only for those who can eat, and `can_eat(name)` (False for unknown names).',
    language: 'python',
    fnName: 'Shift',
    harness: OPS_SAFE,
    adapter: 'run_ops_safe',
    starter: `class Shift:
    # your code here
    pass
`,
    solution: `class Workable:
    def work(self):
        raise NotImplementedError

class Eatable:
    def eat(self):
        raise NotImplementedError

class Human(Workable, Eatable):
    def __init__(self, name):
        self.name = name
    def work(self):
        return self.name + " works"
    def eat(self):
        return self.name + " eats"

class Robot(Workable):
    def __init__(self, name):
        self.name = name
    def work(self):
        return self.name + " works"

class Shift:
    KINDS = {"human": Human, "robot": Robot}

    def __init__(self):
        self.staff = []

    def add(self, kind, name):
        if kind not in self.KINDS:
            raise ValueError(kind)
        self.staff.append(self.KINDS[kind](name))

    def work_all(self):
        return [w.work() for w in self.staff]

    def lunch_all(self):
        return [w.eat() for w in self.staff if isinstance(w, Eatable)]

    def can_eat(self, name):
        return any(w.name == name and isinstance(w, Eatable) for w in self.staff)`,
    tests: [
      { args: [['Shift', 'add', 'add', 'work_all', 'lunch_all'], [[], ['human', 'Ann'], ['robot', 'R2'], [], []]], expected: [null, null, null, ['Ann works', 'R2 works'], ['Ann eats']], name: 'work for all, lunch for humans' },
      { args: [['Shift', 'add', 'add', 'can_eat', 'can_eat', 'can_eat'], [[], ['human', 'Ann'], ['robot', 'R2'], ['Ann'], ['R2'], ['ghost']]], expected: [null, null, null, true, false, false], name: 'can_eat' },
      { args: [['Shift', 'add'], [[], ['alien', 'Zed']]], expected: [null, '!ValueError'], name: 'unknown kind' },
      { args: [['Shift', 'add', 'lunch_all', 'work_all'], [[], ['robot', 'R2'], [], []]], expected: [null, null, [], ['R2 works']], name: 'only robots' },
    ],
    hints: ['Make Workable and Eatable separate base classes; Robot extends only Workable so it has no eat() at all.', 'In lunch_all and can_eat check `isinstance(worker, Eatable)` instead of catching exceptions from a fake eat().'],
    combines: ['solid-lsp'],
  },
  quiz: [
    {
      prompt: 'A function only calls `logger.write(text)`. Which parameter design follows ISP best?',
      options: ['Accept the full `LoggingFramework` object', 'Accept anything with a write(text) method (a one-method role or Protocol)', 'Accept a dict of config', 'Make the function a method of every logger'],
      answer: 1,
      explain: 'Depend on exactly what you call. A one-method role is trivial to satisfy and trivial to fake in tests.',
    },
  ],
};

export default unit;
