import type { Unit } from '@/content/types';
import type { Tone } from '@/engine/types';
import { OPS_SAFE, type Design } from '@/content/lib/sysdesign-lld';
import { scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class Employee:
    def __init__(self, name, base):
        self._name = name                           # private by convention
        self._base = base
    def bonus(self): return self._base // 10        #@employee_bonus
    def title(self): return "Employee"              #@employee_title
    def describe(self):                             #@employee_describe
        return self.title() + " " + str(self.bonus())

class Manager(Employee):
    def bonus(self): return super().bonus() + 500   #@manager_bonus
    def title(self): return "Manager"               #@manager_title

class Director(Manager):
    def bonus(self): return super().bonus() * 2    #@director_bonus

# obj.method(): walk type(obj).__mro__ until a class defines the name   #@lookup
`;

interface MethodDef {
  sup?: boolean;
  calls?: string[];
}

const CLASSES = ['Employee', 'Manager', 'Director'] as const;
const MRO: Record<string, string[]> = {
  Employee: ['Employee'],
  Manager: ['Manager', 'Employee'],
  Director: ['Director', 'Manager', 'Employee'],
};
const DEFS: Record<string, Record<string, MethodDef>> = {
  Employee: { bonus: {}, title: {}, describe: { calls: ['title', 'bonus'] } },
  Manager: { bonus: { sup: true }, title: {} },
  Director: { bonus: { sup: true } },
};

const design: Design = {
  classes: [
    { id: 'Employee', name: 'Employee', attrs: ['_name', '_base'], methods: ['bonus()', 'title()', 'describe()'], x: 350, y: 45 },
    { id: 'Manager', name: 'Manager', methods: ['bonus() + super', 'title()'], x: 350, y: 150 },
    { id: 'Director', name: 'Director', methods: ['bonus() + super'], x: 350, y: 255 },
  ],
  rels: [
    { from: 'Manager', to: 'Employee', kind: 'inherits' },
    { from: 'Director', to: 'Manager', kind: 'inherits' },
  ],
};

interface In {
  calls: string[];
}

function parseCall(raw: string): [string, string] {
  const [cls, method] = raw.trim().split('.');
  if (!cls || !method || !(CLASSES as readonly string[]).includes(cls)) throw new Error(`Cannot read "${raw}". Use ClassName.method with ClassName one of ${CLASSES.join(', ')}`);
  return [cls, method];
}

function simulate(input: In) {
  const beats: Beat[] = [];
  const results: string[] = [];
  beats.push({ at: 'lookup', caption: 'Three classes; _name and _base are reached only through methods', tones: { Employee: 'default' }, state: { 'MRO(Director)': 'Director > Manager > Employee', 'MRO(Manager)': 'Manager > Employee' } });
  for (const raw of input.calls) {
    const [recv, method] = parseCall(raw);
    const trace: string[] = [];
    let failed = false;
    const dispatch = (name: string, after: string | null): void => {
      const mro = MRO[recv];
      const start = after ? mro.indexOf(after) + 1 : 0;
      const seen: Record<string, Tone> = {};
      for (let i = start; i < mro.length; i++) {
        const cls = mro[i];
        const found = name in DEFS[cls];
        const label = after ? `super().${name}()` : `${recv}.${name}`;
        if (!found) {
          seen[cls] = 'muted';
          beats.push({ at: 'lookup', caption: `${label}: ${cls} has no ${name}, go up the MRO`, tones: { ...seen, [cls]: 'compare' }, log: { text: `${cls}: no ${name}`, tone: 'muted' }, vars: { receiver: recv, looking_in: cls } });
          continue;
        }
        trace.push(`${cls}.${name}`);
        beats.push({ at: `${cls.toLowerCase()}_${name}`, caption: `${label}: found in ${cls}, run it`, tones: { ...seen, [cls]: 'found' }, log: { text: `${cls}.${name} runs (self is a ${recv})`, tone: 'found' }, vars: { receiver: recv, looking_in: cls } });
        const def = DEFS[cls][name];
        if (def.sup) dispatch(name, cls);
        for (const c of def.calls ?? []) dispatch(c, null);
        return;
      }
      failed = true;
      trace.push('AttributeError');
      beats.push({ at: 'lookup', caption: `${recv}.${name}: MRO exhausted, AttributeError`, tones: { [recv]: 'error' }, log: { text: `${recv} has no attribute ${name}`, tone: 'error' }, vars: { receiver: recv } });
    };
    dispatch(method, null);
    results.push(failed ? 'AttributeError' : trace.join(' > '));
    beats.push({ at: 'lookup', caption: `${recv}.${method}: ${results[results.length - 1]}`.slice(0, 90), tones: { [recv]: failed ? 'error' : 'done' }, state: { call: `${recv}.${method}`, executed: results[results.length - 1] }, stateTitle: 'Last call' });
  }
  return { beats, result: results };
}

function reference(input: In): string[] {
  // independent formulation: resolve each name with a flat helper, expanding calls with an explicit stack
  const owner = (recv: string, name: string, skip: number): number => MRO[recv].findIndex((c, i) => i >= skip && name in DEFS[c]);
  return input.calls.map((raw) => {
    const [recv, method] = parseCall(raw);
    const out: string[] = [];
    const stack: { name: string; skip: number }[] = [{ name: method, skip: 0 }];
    while (stack.length) {
      const { name, skip } = stack.pop()!;
      const idx = owner(recv, name, skip);
      if (idx < 0) return 'AttributeError';
      const cls = MRO[recv][idx];
      out.push(`${cls}.${name}`);
      const def = DEFS[cls][name];
      const next: { name: string; skip: number }[] = [];
      if (def.sup) next.push({ name, skip: idx + 1 });
      for (const c of def.calls ?? []) next.push({ name: c, skip: 0 });
      stack.push(...next.reverse());
    }
    return out.join(' > ');
  });
}

const viz = scenarioViz<In, string[]>({
  id: 'oop-principles',
  title: 'Polymorphism: dispatch walks the MRO',
  code,
  design,
  diagramTitle: 'Class hierarchy (the object decides, not the variable)',
  stateTitle: 'Method resolution order',
  logTitle: 'Lookup trace',
  inputs: [{ key: 'calls', label: 'Calls (Class.method)', kind: 'strings', default: ['Director.bonus', 'Manager.describe'], maxItems: 3, help: 'Classes: Employee, Manager, Director. Methods: bonus, title, describe (or try a missing one such as fly).' }],
  presets: [
    { label: 'describe on a Director', input: { calls: ['Director.describe'] } },
    { label: 'Super chain', input: { calls: ['Director.bonus', 'Manager.bonus', 'Employee.bonus'] } },
    { label: 'Missing method', input: { calls: ['Manager.fly'] } },
  ],
  simulate,
  reference,
});

const unit: Unit = {
  id: 'oop-principles',
  hook: 'Interviewers open with "explain the four pillars" and then ask what really happens on `obj.method()`. Knowing dispatch walks the **runtime class chain** separates memorised answers from understanding.',
  predict: {
    prompt: '`describe()` is defined only in `Employee` and calls `self.bonus()`. You call it on a `Director`. Which `bonus()` runs first?',
    options: ['`Employee.bonus`, because `describe` is defined there', '`Director.bonus`, because lookup starts at the real class of `self`', '`Manager.bonus`, because it is the parent of Director', 'None: Python raises an ambiguity error'],
    answer: 1,
    explain: '`self` is still a `Director` inside `Employee.describe`. Every `self.x()` call restarts the lookup at the object\'s own class and walks its MRO, which is what makes overriding work.',
  },
  viz,
  deeper: {
    points: [
      '**Encapsulation** hides representation behind methods so invariants (balance never negative) live in one place. Python marks "private" by convention (`_x`); the discipline is the point, not the keyword.',
      '**Inheritance** reuses and specialises behaviour. `super().m()` continues the lookup *after* the current class in the MRO; it does not mean "my parent" when multiple inheritance is involved.',
      '**Polymorphism** is dynamic dispatch: the same call `obj.bonus()` runs different code depending on the runtime class of `obj`.',
      '**Composition over inheritance**: prefer "has-a" (pass a `PayPolicy` object in) over deep "is-a" trees. A new variation then adds an object instead of a class in every branch of the hierarchy.',
      'Python computes the MRO with C3 linearisation: children before parents, and the order of bases is respected. `Class.__mro__` shows it.',
    ],
    pitfalls: ['Overriding `__init__` without calling `super().__init__()`', 'Using inheritance just to reuse code when the types are not substitutable (see Liskov)', 'Exposing mutable internals (returning the internal list) and breaking encapsulation anyway'],
  },
  practice: {
    language: 'python',
    fnName: 'SavingsAccount',
    statement:
      'The harness provides `Account(opening)` with `deposit`, `withdraw` and `balance()` (it raises `ValueError` on bad amounts). Implement `SavingsAccount(opening, max_withdrawals)` as a subclass: `withdraw` raises `ValueError` once the limit is used up, otherwise delegates to the parent (a failed withdrawal must not use quota). `remaining()` returns withdrawals left. `add_interest(percent)` deposits `balance * percent // 100` when that is positive and returns it.',
    signature: 'class SavingsAccount(Account):',
    harness: `
class Account:
    def __init__(self, opening):
        if opening < 0:
            raise ValueError('opening balance cannot be negative')
        self._balance = opening
    def deposit(self, amount):
        if amount <= 0:
            raise ValueError('deposit must be positive')
        self._balance += amount
    def withdraw(self, amount):
        if amount <= 0 or amount > self._balance:
            raise ValueError('invalid withdrawal')
        self._balance -= amount
    def balance(self):
        return self._balance
` + OPS_SAFE,
    adapter: 'run_ops_safe',
    solution: `class SavingsAccount(Account):
    def __init__(self, opening, max_withdrawals):
        @@super().__init__(opening)@@
        self._left = max_withdrawals

    def withdraw(self, amount):
        if self._left == 0:
            raise ValueError('withdrawal limit reached')
        @@super().withdraw(amount)@@
        self._left -= 1

    def remaining(self):
        return self._left

    def add_interest(self, percent):
        interest = self._balance * percent // 100
        if interest > 0:
            @@self.deposit(interest)@@
        return interest`,
    tests: [
      { args: [['SavingsAccount', 'deposit', 'withdraw', 'balance', 'remaining'], [[100, 2], [50], [30], [], []]], expected: [null, null, null, 120, 1], name: 'normal use' },
      { args: [['SavingsAccount', 'withdraw', 'withdraw'], [[100, 1], [10], [10]]], expected: [null, null, '!ValueError'], name: 'limit reached' },
      { args: [['SavingsAccount', 'withdraw', 'withdraw', 'remaining'], [[50, 1], [80], [20], []]], expected: [null, '!ValueError', null, 0], name: 'failed withdrawal keeps quota' },
      { args: [['SavingsAccount', 'add_interest', 'balance'], [[200, 1], [5], []]], expected: [null, 10, 210], name: 'interest is deposited' },
      { args: [['SavingsAccount', 'add_interest', 'balance'], [[10, 1], [5], []]], expected: [null, 0, 10], name: 'no interest on tiny balances' },
      { args: [['SavingsAccount'], [[-5, 1]]], expected: ['!ValueError'], name: 'parent validates opening balance' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'SavingsAccount',
    statement: 'A new `SavingsAccount` crashes with `AttributeError` on its first `deposit` or `balance()`, and negative opening balances are accepted. Find the missing line.',
    harness: `
class Account:
    def __init__(self, opening):
        if opening < 0:
            raise ValueError('opening balance cannot be negative')
        self._balance = opening
    def deposit(self, amount):
        if amount <= 0:
            raise ValueError('deposit must be positive')
        self._balance += amount
    def withdraw(self, amount):
        if amount <= 0 or amount > self._balance:
            raise ValueError('invalid withdrawal')
        self._balance -= amount
    def balance(self):
        return self._balance
` + OPS_SAFE,
    adapter: 'run_ops_safe',
    buggy: `class SavingsAccount(Account):
    def __init__(self, opening, max_withdrawals):
        self._left = max_withdrawals

    def withdraw(self, amount):
        if self._left == 0:
            raise ValueError('withdrawal limit reached')
        super().withdraw(amount)
        self._left -= 1

    def remaining(self):
        return self._left`,
    fixed: `class SavingsAccount(Account):
    def __init__(self, opening, max_withdrawals):
        super().__init__(opening)
        self._left = max_withdrawals

    def withdraw(self, amount):
        if self._left == 0:
            raise ValueError('withdrawal limit reached')
        super().withdraw(amount)
        self._left -= 1

    def remaining(self):
        return self._left`,
    tests: [
      { args: [['SavingsAccount', 'deposit', 'balance'], [[100, 2], [20], []]], expected: [null, null, 120], name: 'parent state exists' },
      { args: [['SavingsAccount'], [[-5, 1]]], expected: ['!ValueError'], name: 'parent validation runs' },
      { args: [['SavingsAccount', 'withdraw', 'balance', 'remaining'], [[100, 2], [40], [], []]], expected: [null, null, 60, 1], name: 'withdraw and remaining' },
    ],
    bugType: 'missing super().__init__',
    hint: 'Who sets `self._balance`? Look at what the subclass constructor does before the first use.',
    explanation: 'Overriding `__init__` replaces the parent constructor completely. Without `super().__init__(opening)` the parent never runs, so `_balance` is never created and its validation is skipped.',
  },
  boss: {
    title: 'C3 method resolution order',
    statement:
      'Write `linearize(hierarchy, name)`. `hierarchy` maps every class name to the list of its direct bases in order (acyclic, all names present). Return the MRO of `name` as a list using C3 linearisation: `[name] + merge(MRO of each base..., list of bases)`, where merge repeatedly takes the first head that does not appear in the tail of any list. Return `None` if no consistent order exists.',
    language: 'python',
    fnName: 'linearize',
    starter: `def linearize(hierarchy, name):
    pass
`,
    solution: `def linearize(hierarchy, name):
    def merge(seqs):
        result = []
        seqs = [list(s) for s in seqs if s]
        while seqs:
            for seq in seqs:
                head = seq[0]
                if not any(head in s[1:] for s in seqs):
                    break
            else:
                return None
            result.append(head)
            for s in seqs:
                if s[0] == head:
                    del s[0]
            seqs = [s for s in seqs if s]
        return result

    def mro(cls):
        bases = hierarchy[cls]
        parents = [mro(b) for b in bases]
        if any(p is None for p in parents):
            return None
        merged = merge(parents + [list(bases)])
        return None if merged is None else [cls] + merged

    return mro(name)`,
    tests: [
      { args: [{ A: [] }, 'A'], expected: ['A'], name: 'single class' },
      { args: [{ A: [], B: ['A'], C: ['B'] }, 'C'], expected: ['C', 'B', 'A'], name: 'chain' },
      { args: [{ O: [], A: ['O'], B: ['O'], C: ['A', 'B'] }, 'C'], expected: ['C', 'A', 'B', 'O'], name: 'diamond' },
      { args: [{ A: [], B: [], C: ['B', 'A'] }, 'C'], expected: ['C', 'B', 'A'], name: 'base order respected' },
      { args: [{ X: [], Y: [], A: ['X', 'Y'], B: ['Y', 'X'], C: ['A', 'B'] }, 'C'], expected: null, name: 'inconsistent order' },
      { args: [{ O: [], A: ['O'], B: ['O'], C: ['O'], D: ['O'], E: ['O'], K1: ['A', 'B', 'C'], K2: ['D', 'B', 'E'], K3: ['D', 'A'], Z: ['K1', 'K2', 'K3'] }, 'Z'], expected: ['Z', 'K1', 'K2', 'K3', 'D', 'A', 'B', 'C', 'E', 'O'], name: 'the classic C3 example' },
    ],
    hints: ['Recursion: the MRO of a class is the class followed by a merge of the base MROs and the list of direct bases themselves.', 'merge: look at the head of each list; accept the first head that is not in the tail (items after index 0) of any list, remove it everywhere, repeat. If no head qualifies, the order is inconsistent: return None.'],
    combines: ['solid-lsp'],
  },
  quiz: [
    {
      prompt: 'A `Report` class needs PDF, HTML and CSV output, each with or without compression. Subclassing gives 6 classes. What does composition over inheritance suggest instead?',
      options: ['A bigger if/elif inside Report', 'Give Report a formatter object and a compressor object it delegates to', 'Make Report a singleton', 'Use multiple inheritance of every combination'],
      answer: 1,
      explain: 'Two small interchangeable parts (2 + 3 classes) replace a class per combination, and each can be swapped at runtime.',
    },
    {
      prompt: 'Why is `self._balance = x` outside the class usually a design smell even though Python allows it?',
      options: ['It is slower', 'It bypasses the checks the class uses to keep its invariants true', 'It raises a SyntaxError', 'It makes the attribute public in the MRO'],
      answer: 1,
      explain: 'Encapsulation means the class controls every way its state can change; direct writes skip validation such as "no negative balance".',
    },
  ],
};

export default unit;
