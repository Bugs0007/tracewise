import type { Unit } from '@/content/types';
import { solidViz, type SolidSpec } from '@/content/lib/sysdesign-lld';

const code = `
# ---- before: the high-level policy builds its own concrete helpers
class MySQLDatabase:
    def save(self, row): ...

class SmtpMailer:
    def send(self, text): ...

class OrderService:                                    #@before
    def __init__(self):
        self.db = MySQLDatabase()
        self.mailer = SmtpMailer()
    def place(self, customer, total):
        self.db.save({"customer": customer, "total": total})
        self.mailer.send("order for " + customer)

# ---- after: both sides depend on abstractions
class Repository:                                      #@abstraction
    def save(self, row): raise NotImplementedError

class Notifier:
    def send(self, text): raise NotImplementedError

class MySQLRepository(Repository):                     #@implement
    def save(self, row): ...

class SmtpNotifier(Notifier):
    def send(self, text): ...

class OrderService:                                    #@invert
    def __init__(self, repo, notifier):
        self.repo = repo
        self.notifier = notifier
    def place(self, customer, total):
        self.repo.save({"customer": customer, "total": total})
        self.notifier.send("order for " + customer)

service = OrderService(MySQLRepository(), SmtpNotifier())   #@root

# replay: what has to change when the world changes?   #@sim
`;

const spec: SolidSpec = {
  id: 'solid-dip',
  title: 'Dependency inversion: depend on abstractions',
  code,
  before: {
    classes: [
      { id: 'order', name: 'OrderService', methods: ['place()', 'new MySQLDatabase()', 'new SmtpMailer()'], x: 350, y: 50, owns: ['switch_db', 'add_sms', 'unit_test', 'tax_rule'] },
      { id: 'mysql', name: 'MySQLDatabase', methods: ['save(row)'], x: 150, y: 230, owns: ['switch_db'] },
      { id: 'smtp', name: 'SmtpMailer', methods: ['send(text)'], x: 550, y: 230, owns: ['smtp_lib'] },
    ],
    rels: [
      { from: 'order', to: 'mysql', kind: 'depends', label: 'creates + calls' },
      { from: 'order', to: 'smtp', kind: 'depends', label: 'creates + calls' },
    ],
  },
  steps: [
    {
      at: 'abstraction',
      caption: 'Define the abstractions the policy needs: Repository and Notifier',
      add: [
        { id: 'repo', name: 'Repository', kind: 'interface', methods: ['save(row)'], x: 150, y: 140 },
        { id: 'notifier', name: 'Notifier', kind: 'interface', methods: ['send(text)'], x: 550, y: 140 },
      ],
    },
    {
      at: 'implement',
      caption: 'Low-level classes now implement the abstractions (the arrows point upward)',
      update: [
        { id: 'mysql', name: 'MySQLRepository', y: 290 },
        { id: 'smtp', name: 'SmtpNotifier', y: 290 },
      ],
      removeRels: [
        ['order', 'mysql'],
        ['order', 'smtp'],
      ],
      addRels: [
        { from: 'mysql', to: 'repo', kind: 'implements' },
        { from: 'smtp', to: 'notifier', kind: 'implements' },
      ],
    },
    {
      at: 'invert',
      caption: 'OrderService receives its collaborators and only knows the abstractions',
      update: [{ id: 'order', methods: ['place()', 'repo.save()', 'notifier.send()'], owns: ['tax_rule'] }],
      addRels: [
        { from: 'order', to: 'repo', kind: 'uses', label: 'uses' },
        { from: 'order', to: 'notifier', kind: 'uses', label: 'uses' },
      ],
    },
    {
      at: 'root',
      caption: 'One composition root picks the concrete classes and injects them',
      add: [{ id: 'root', name: 'Main', methods: ['wire()'], x: 350, y: 190 }],
      addRels: [
        { from: 'root', to: 'order', kind: 'uses', label: 'injects' },
        { from: 'root', to: 'mysql', kind: 'depends', label: 'new' },
        { from: 'root', to: 'smtp', kind: 'depends', label: 'new' },
      ],
    },
  ],
  requests: {
    switch_db: { label: 'switch from MySQL to Postgres', adds: 'PostgresRepository' },
    add_sms: { label: 'also notify by SMS', adds: 'SmsNotifier' },
    unit_test: { label: 'unit-test OrderService with fakes', adds: 'FakeRepository' },
    smtp_lib: { label: 'upgrade the SMTP library' },
    tax_rule: { label: 'change the tax rule' },
  },
  start: { at: 'before', caption: 'OrderService (policy) is welded to MySQL and SMTP details', flag: ['order'] },
  finish: { at: 'root', caption: 'High-level policy and low-level details both depend on abstractions' },
  simAt: 'sim',
  defaultRequests: ['switch_db', 'add_sms', 'unit_test', 'tax_rule'],
  presets: [
    { label: 'Swap infrastructure', requests: ['switch_db', 'add_sms'] },
    { label: 'Testing', requests: ['unit_test'] },
    { label: 'Details vs policy', requests: ['smtp_lib', 'tax_rule', 'switch_db'] },
  ],
};

const SERVICE_HARNESS = `
class FakeRepo:
    def __init__(self):
        self.rows = []
    def save(self, row):
        self.rows.append(dict(row))
        return len(self.rows)
    def all(self):
        return list(self.rows)

class FakeNotifier:
    def __init__(self):
        self.sent = []
    def send(self, text):
        self.sent.append(text)

def run_service(cls, steps):
    repo, notifier = FakeRepo(), FakeNotifier()
    svc = cls(repo, notifier)
    out = []
    for name, *args in steps:
        out.append(getattr(svc, name)(*args))
    return [out, len(repo.rows), notifier.sent]
`;

const viz = solidViz(spec);

const unit: Unit = {
  id: 'solid-dip',
  hook: 'Dependency inversion is the reason you can unit-test a service without a database and swap Postgres for MySQL in one line. Interviewers also want you to separate it from dependency *injection*.',
  predict: {
    prompt: '`OrderService.__init__` runs `self.db = MySQLDatabase()`. Which statement is true?',
    options: [
      'It is fine: the class owns its dependencies, so tests can mock them',
      'The policy class depends on a concrete detail, so swapping or faking the database means editing OrderService',
      'It violates the single responsibility principle only',
      'It is dependency injection, because the dependency is supplied',
    ],
    answer: 1,
    explain: 'The constructor hard-wires the concrete class. Injecting an abstraction (or any object with `save`) moves the choice to the caller, so OrderService never changes when the storage does.',
  },
  viz,
  deeper: {
    points: [
      'High-level modules (business rules) should not depend on low-level modules (databases, mailers, HTTP clients). **Both** should depend on abstractions, and the abstraction is owned by the high-level side.',
      'The word "inversion" is about the direction of the source-code arrow: it now points from the detail up to the abstraction.',
      '**Dependency injection** is a technique (pass collaborators in) that makes inversion practical. A **composition root** (`main`) is the one place allowed to say `new MySQLRepository()`.',
      'Python needs no interface keyword: an ABC, a `Protocol`, or plain duck typing all give you the abstraction. A fake with the same method names is enough for tests.',
      'Do not invert everything. Stable standard-library types (`list`, `datetime`) are fine as direct dependencies; abstract the volatile edges: I/O, clocks, randomness, third-party services.',
    ],
    pitfalls: ['An "abstraction" that mirrors one concrete class method for method (no real second implementation)', 'Service locators or global lookups that hide the dependency instead of injecting it', 'Injecting the container itself, so every class can reach everything'],
  },
  practice: {
    language: 'python',
    fnName: 'OrderService',
    statement:
      'Implement `OrderService(repo, notifier)` that only talks to its injected collaborators. `place(customer, total)` returns 0 when `total <= 0` (nothing saved or sent); otherwise it saves `{"customer": customer, "total": total}` with `repo.save(row)` (which returns the order id), sends `"order <id> for <customer>"` through `notifier.send` and returns the id. `spent(customer)` sums the totals of that customer using `repo.all()`.',
    signature: 'class OrderService:',
    harness: SERVICE_HARNESS,
    adapter: 'run_service',
    solution: `class OrderService:
    def __init__(self, repo, notifier):
        self.repo = @@repo@@
        self.notifier = @@notifier@@

    def place(self, customer, total):
        if total <= 0:
            return 0
        order_id = @@self.repo.save({'customer': customer, 'total': total})@@
        self.notifier.send('order ' + str(order_id) + ' for ' + customer)
        return order_id

    def spent(self, customer):
        return sum(r['total'] for r in @@self.repo.all()@@ if r['customer'] == customer)`,
    tests: [
      { args: [[['place', 'ann', 30], ['place', 'bo', 5], ['spent', 'ann']]], expected: [[1, 2, 30], 2, ['order 1 for ann', 'order 2 for bo']], name: 'saves and notifies' },
      { args: [[['place', 'ann', 0], ['place', 'ann', -4]]], expected: [[0, 0], 0, []], name: 'rejects non-positive totals' },
      { args: [[['place', 'ann', 10], ['place', 'ann', 15], ['spent', 'ann'], ['spent', 'bo']]], expected: [[1, 2, 25, 0], 2, ['order 1 for ann', 'order 2 for ann']], name: 'spent sums per customer' },
      { args: [[]], expected: [[], 0, []], name: 'no calls' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'OrderService',
    statement: 'In the unit tests no confirmation messages are ever recorded by the fake notifier, yet in production emails go out. The service ignores something it is given. Fix it.',
    harness:
      SERVICE_HARNESS +
      `
class ConsoleNotifier:
    def send(self, text):
        pass
`,
    adapter: 'run_service',
    buggy: `class OrderService:
    def __init__(self, repo, notifier):
        self.repo = repo
        self.notifier = ConsoleNotifier()

    def place(self, customer, total):
        if total <= 0:
            return 0
        order_id = self.repo.save({'customer': customer, 'total': total})
        self.notifier.send('order ' + str(order_id) + ' for ' + customer)
        return order_id

    def spent(self, customer):
        return sum(r['total'] for r in self.repo.all() if r['customer'] == customer)`,
    fixed: `class OrderService:
    def __init__(self, repo, notifier):
        self.repo = repo
        self.notifier = notifier

    def place(self, customer, total):
        if total <= 0:
            return 0
        order_id = self.repo.save({'customer': customer, 'total': total})
        self.notifier.send('order ' + str(order_id) + ' for ' + customer)
        return order_id

    def spent(self, customer):
        return sum(r['total'] for r in self.repo.all() if r['customer'] == customer)`,
    tests: [
      { args: [[['place', 'ann', 30]]], expected: [[1], 1, ['order 1 for ann']], name: 'injected notifier is used' },
      { args: [[['place', 'ann', 30], ['place', 'bo', 5]]], expected: [[1, 2], 2, ['order 1 for ann', 'order 2 for bo']], name: 'two orders' },
      { args: [[['place', 'ann', 0]]], expected: [[0], 0, []], name: 'rejected order sends nothing' },
    ],
    bugType: 'ignores injected dependency',
    hint: 'Compare the two constructor parameters with what the constructor actually stores.',
    explanation: 'The constructor accepted a notifier but then hard-wired a `ConsoleNotifier`. The injection point is decorative, so tests cannot observe messages and production code cannot choose another channel.',
  },
  boss: {
    title: 'Failover payment router',
    statement:
      'Write `PaymentRouter(gateways)` where `gateways` is an ordered list of objects with `name` and `charge(amount)` (returns a receipt string, or raises `ConnectionError`). `charge(amount)` tries gateways in order and returns the first receipt. A gateway that failed twice in a row is skipped from then on (its counter resets after a success). If every usable gateway fails, or there are none, raise `RuntimeError`. The router must only use the gateway interface, never a concrete gateway class.',
    language: 'python',
    fnName: 'PaymentRouter',
    harness: `
class ScriptedGateway:
    def __init__(self, name, script):
        self.name = name
        self.script = list(script)
    def charge(self, amount):
        outcome = self.script.pop(0) if self.script else 'ok'
        if outcome == 'fail':
            raise ConnectionError(self.name + ' is down')
        return self.name + ':' + str(amount)

def run_failover(cls, scripts, amounts):
    router = cls([ScriptedGateway(n, s) for n, s in scripts])
    out = []
    for a in amounts:
        try:
            out.append(router.charge(a))
        except RuntimeError:
            out.append('!RuntimeError')
    return out
`,
    adapter: 'run_failover',
    starter: `class PaymentRouter:
    def __init__(self, gateways):
        pass

    def charge(self, amount):
        pass
`,
    solution: `class PaymentRouter:
    def __init__(self, gateways):
        self.gateways = list(gateways)
        self.failures = {g.name: 0 for g in self.gateways}

    def charge(self, amount):
        for g in self.gateways:
            if self.failures[g.name] >= 2:
                continue
            try:
                receipt = g.charge(amount)
            except ConnectionError:
                self.failures[g.name] += 1
                continue
            self.failures[g.name] = 0
            return receipt
        raise RuntimeError('all gateways failed')`,
    tests: [
      { args: [[['a', []], ['b', []]], [5]], expected: ['a:5'], name: 'first gateway wins' },
      { args: [[['a', ['fail', 'ok']], ['b', []]], [5, 6]], expected: ['b:5', 'a:6'], name: 'falls back, then recovers' },
      { args: [[['a', ['fail', 'fail', 'ok']], ['b', []]], [1, 2, 3]], expected: ['b:1', 'b:2', 'b:3'], name: 'skips a gateway after two failures' },
      { args: [[['a', ['fail']], ['b', ['fail']]], [9]], expected: ['!RuntimeError'], name: 'all fail' },
      { args: [[], [1]], expected: ['!RuntimeError'], name: 'no gateways' },
      { args: [[['a', ['fail', 'ok', 'fail', 'ok']], ['b', []]], [1, 2, 3, 4]], expected: ['b:1', 'a:2', 'b:3', 'a:4'], name: 'success resets the failure count' },
    ],
    hints: ['Keep a failure counter per gateway name. Skip a gateway whose counter has reached 2; reset the counter to 0 after it succeeds.', 'Loop over gateways in order: try charge, on ConnectionError increment and continue, on success reset and return. Raise RuntimeError after the loop.'],
    combines: ['solid-ocp', 'solid-lsp'],
  },
  quiz: [
    {
      prompt: 'Which sentence best describes the relationship between dependency inversion and dependency injection?',
      options: ['They are the same thing', 'Inversion is the design rule (depend on abstractions); injection is one way to supply the concrete object', 'Injection only works with interfaces in Java', 'Inversion means classes must create their own dependencies'],
      answer: 1,
      explain: 'DIP is about the direction of dependencies. Constructor injection is the most common technique to honour it.',
    },
    {
      prompt: 'In the new design, who may call `MySQLRepository()`?',
      options: ['OrderService', 'Any class that needs data', 'The composition root only', 'Nobody'],
      answer: 2,
      explain: 'Keeping construction in one root means the rest of the program never learns which implementation was chosen.',
    },
  ],
};

export default unit;
