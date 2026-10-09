import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { solidViz, type SolidSpec } from '@/content/lib/sysdesign-lld';

const code = `
# ---- before: one class, four reasons to change
class Invoice:                                          #@before
    def __init__(self, items, tax_rate):
        self.items = items
        self.tax_rate = tax_rate

    def total(self):                                    #@total
        subtotal = sum(p * q for _, p, q in self.items)
        return subtotal + subtotal * self.tax_rate // 100

    def render(self):                                   #@render
        return "\\n".join(n + " x" + str(q) for n, _, q in self.items)

    def save(self, db):                                 #@save
        db.insert("invoices", self.items)

# ---- after: one reason to change per class
class TaxPolicy:                                        #@tax
    def __init__(self, rate):
        self.rate = rate
    def apply(self, subtotal):
        return subtotal + subtotal * self.rate // 100

class Invoice:                                          #@invoice
    def __init__(self, items, tax):
        self.items, self.tax = items, tax
    def total(self):
        return self.tax.apply(sum(p * q for _, p, q in self.items))

class InvoiceFormatter:                                 #@formatter
    def render(self, invoice): ...

class InvoiceRepository:                                #@repo
    def __init__(self, db): self.db = db
    def save(self, invoice): ...

# a change request now edits only the class that owns the concern   #@sim
`;

const spec: SolidSpec = {
  id: 'solid-srp',
  title: 'Single responsibility: split the god class',
  code,
  before: {
    classes: [
      { id: 'inv', name: 'Invoice', methods: ['total()', 'render()', 'save()'], x: 350, y: 80, owns: ['tax', 'layout', 'storage', 'fields'] },
      { id: 'db', name: 'Database', methods: ['insert()'], x: 590, y: 230 },
    ],
    rels: [{ from: 'inv', to: 'db', kind: 'uses' }],
  },
  steps: [
    {
      at: 'render',
      caption: 'Move render() out: layout changes no longer touch pricing code',
      add: [{ id: 'fmt', name: 'InvoiceFormatter', methods: ['render(inv)'], x: 110, y: 80, owns: ['layout'] }],
      update: [{ id: 'inv', methods: ['total()', 'save()'], owns: ['tax', 'storage', 'fields'] }],
      addRels: [{ from: 'fmt', to: 'inv', kind: 'uses' }],
    },
    {
      at: 'save',
      caption: 'Move save() into InvoiceRepository: only it knows about the database',
      add: [{ id: 'repo', name: 'InvoiceRepository', methods: ['save(inv)'], x: 590, y: 80, owns: ['storage'] }],
      update: [{ id: 'inv', methods: ['total()'], owns: ['tax', 'fields'] }],
      removeRels: [['inv', 'db']],
      addRels: [
        { from: 'repo', to: 'inv', kind: 'uses' },
        { from: 'repo', to: 'db', kind: 'uses' },
      ],
    },
    {
      at: 'tax',
      caption: 'Extract the tax rule into TaxPolicy: Invoice keeps only invoice data',
      add: [{ id: 'tax', name: 'TaxPolicy', methods: ['apply(subtotal)'], x: 350, y: 230, owns: ['tax'] }],
      update: [{ id: 'inv', owns: ['fields'] }],
      addRels: [{ from: 'inv', to: 'tax', kind: 'uses' }],
    },
  ],
  requests: {
    tax: { label: 'new VAT rule' },
    layout: { label: 'PDF invoice layout' },
    storage: { label: 'SQLite to Postgres' },
    fields: { label: 'add a currency field' },
  },
  start: { at: 'before', caption: 'One class with four reasons to change: tax, layout, storage, fields', flag: ['inv'] },
  finish: { at: 'invoice', caption: 'Each class now has exactly one reason to change' },
  simAt: 'sim',
  defaultRequests: ['tax', 'layout', 'storage'],
  presets: [
    { label: 'Three unrelated requests', requests: ['tax', 'layout', 'storage'] },
    { label: 'Domain change', requests: ['fields'] },
    { label: 'All four', requests: ['tax', 'layout', 'storage', 'fields'] },
  ],
};

const FMT_HARNESS = `
class Invoice:
    def __init__(self, items, tax_rate=0):
        self.items = [tuple(i) for i in items]
        self.tax_rate = tax_rate

    def subtotal(self):
        return sum(p * q for _, p, q in self.items)

    def total(self):
        s = self.subtotal()
        return s + s * self.tax_rate // 100

def run_fmt(cls, items, tax_rate=0):
    return cls().render(Invoice(items, tax_rate))
`;

const viz = solidViz(spec);

const unit: Unit = {
  id: 'solid-srp',
  hook: 'Everyone can recite "a class should do one thing". Interviewers want the sharper version: **a class should have one reason to change**, shown on a refactor of a real god class.',
  predict: {
    prompt: 'An `Invoice` class calculates totals, renders its own HTML and writes itself to the database. Marketing asks for a new email layout. What is the real cost of the current design?',
    options: [
      'The class is too long to read, nothing else',
      'Editing layout code means editing a class that also holds pricing and storage code, so a layout tweak can break totals or saving',
      'Python cannot import classes with three methods',
      'There is no cost: one class is always simpler than three',
    ],
    answer: 1,
    explain: 'Unrelated concerns share one file, one set of tests and one deploy. Touching layout puts pricing and persistence at risk, and every change from three teams lands in the same class (merge conflicts).',
  },
  viz,
  deeper: {
    points: [
      'The definition that holds up: a module should have **one reason to change**, i.e. one actor or concern that can ask for a change.',
      'Count reasons, not methods: a class with ten methods that all serve tax rules is fine; a class with three methods serving tax, layout and storage is not.',
      'The usual split is domain object (data and invariants), formatter or presenter, repository or gateway, and a policy object for rules that change often.',
      'SRP does not reduce the number of edits per feature. It shrinks the **blast radius**: the replay above shows total edits can stay equal while the unrelated concerns at risk drop to zero.',
      'Over-splitting is a real failure too: do not make a class per method. Split along axes of change you can name.',
    ],
    pitfalls: ['Splitting by technical layer only (one "Utils" class) instead of by reason to change', 'Leaving the old class as a thin pass-through that still knows every collaborator', 'Splitting before any second reason to change exists (speculative design)'],
  },
  practice: {
    language: 'python',
    fnName: 'InvoiceFormatter',
    statement: 'The domain `Invoice` already exists (see harness: `.items` of (name, cents, qty), `.tax_rate`, `.subtotal()`, `.total()`). Write only the presentation class `InvoiceFormatter.render(invoice)`: one line per item, an optional tax line, then the total.',
    signature: 'class InvoiceFormatter:',
    harness: FMT_HARNESS,
    adapter: 'run_fmt',
    solution: `class InvoiceFormatter:
    def money(self, cents):
        return "$%d.%02d" % @@divmod(cents, 100)@@

    def render(self, invoice):
        lines = []
        for name, price, qty in invoice.items:
            lines.append("%s x%d @ %s = %s" % (name, qty, self.money(price), self.money(@@price * qty@@)))
        if invoice.tax_rate:
            tax = @@invoice.total() - invoice.subtotal()@@
            lines.append("TAX %d%%: %s" % (invoice.tax_rate, self.money(tax)))
        lines.append("TOTAL " + self.money(@@invoice.total()@@))
        return "\\n".join(lines)`,
    tests: [
      { args: [[['Pen', 150, 2]], 0], expected: 'Pen x2 @ $1.50 = $3.00\nTOTAL $3.00', name: 'one item, no tax' },
      { args: [[['Book', 2000, 1]], 10], expected: 'Book x1 @ $20.00 = $20.00\nTAX 10%: $2.00\nTOTAL $22.00', name: 'tax line' },
      { args: [[], 0], expected: 'TOTAL $0.00', name: 'empty invoice' },
      { args: [[['A', 5, 3], ['B', 1999, 1]], 0], expected: 'A x3 @ $0.05 = $0.15\nB x1 @ $19.99 = $19.99\nTOTAL $20.14', name: 'cents padding' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Receipt',
    statement: 'Printing the same receipt twice shows different prices, and `total()` is wrong after a print. Rendering must not change the data it renders.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class Receipt:
    def __init__(self, tax_rate):
        self.tax_rate = tax_rate
        self.items = []

    def add(self, name, cents):
        self.items.append([name, cents])

    def total(self):
        subtotal = sum(c for _, c in self.items)
        return subtotal + subtotal * self.tax_rate // 100

    def render(self):
        for item in self.items:
            item[1] = item[1] + item[1] * self.tax_rate // 100
        lines = ["%s %d" % (n, c) for n, c in self.items]
        lines.append("TOTAL %d" % sum(c for _, c in self.items))
        return "\\n".join(lines)`,
    fixed: `class Receipt:
    def __init__(self, tax_rate):
        self.tax_rate = tax_rate
        self.items = []

    def add(self, name, cents):
        self.items.append([name, cents])

    def total(self):
        subtotal = sum(c for _, c in self.items)
        return subtotal + subtotal * self.tax_rate // 100

    def render(self):
        shown = [(n, c + c * self.tax_rate // 100) for n, c in self.items]
        lines = ["%s %d" % (n, c) for n, c in shown]
        lines.append("TOTAL %d" % sum(c for _, c in shown))
        return "\\n".join(lines)`,
    tests: [
      { args: [['Receipt', 'add', 'add', 'render'], [[10], ['A', 1000], ['B', 500], []]], expected: [null, null, null, 'A 1100\nB 550\nTOTAL 1650'], name: 'first render' },
      { args: [['Receipt', 'add', 'render', 'render'], [[10], ['A', 1000], [], []]], expected: [null, null, 'A 1100\nTOTAL 1100', 'A 1100\nTOTAL 1100'], name: 'render twice is stable' },
      { args: [['Receipt', 'add', 'render', 'total'], [[20], ['A', 1000], [], []]], expected: [null, null, 'A 1200\nTOTAL 1200', 1200], name: 'total unaffected by render' },
    ],
    bugType: 'presentation mutates the domain',
    hint: 'Does render() only read self.items, or does it write to it?',
    explanation: 'render() added tax straight into the stored prices, so every print compounds the tax and total() applies it again. A presenter must compute what it shows into local variables and leave the model alone.',
  },
  boss: {
    title: 'Split the signup god class',
    statement:
      'Build `SignupService` as a thin orchestrator over three single-purpose collaborators you also write: `EmailValidator`, `UserRepository`, `Mailer`. `signup(email)` trims and lower-cases the address, returns `"invalid"` (exactly one `@`, non-empty local part, domain with an inner `.`, no spaces), `"duplicate"` if it is already stored, otherwise stores it, queues the mail `"welcome:<email>"` and returns `"ok"`. `outbox()` returns the queued mails in order, `users()` the stored emails sorted.',
    language: 'python',
    fnName: 'SignupService',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class SignupService:
    # your code here
    pass
`,
    solution: `class EmailValidator:
    def is_valid(self, email):
        if email.count("@") != 1 or " " in email:
            return False
        local, domain = email.split("@")
        return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")

class UserRepository:
    def __init__(self):
        self._emails = set()

    def has(self, email):
        return email in self._emails

    def add(self, email):
        self._emails.add(email)

    def all(self):
        return sorted(self._emails)

class Mailer:
    def __init__(self):
        self.sent = []

    def send_welcome(self, email):
        self.sent.append("welcome:" + email)

class SignupService:
    def __init__(self):
        self.validator = EmailValidator()
        self.repo = UserRepository()
        self.mailer = Mailer()

    def signup(self, email):
        email = email.strip().lower()
        if not self.validator.is_valid(email):
            return "invalid"
        if self.repo.has(email):
            return "duplicate"
        self.repo.add(email)
        self.mailer.send_welcome(email)
        return "ok"

    def outbox(self):
        return list(self.mailer.sent)

    def users(self):
        return self.repo.all()`,
    tests: [
      { args: [['SignupService', 'signup', 'signup', 'outbox', 'users'], [[], ['a@x.com'], ['A@X.com'], [], []]], expected: [null, 'ok', 'duplicate', ['welcome:a@x.com'], ['a@x.com']], name: 'duplicate is case-insensitive' },
      { args: [['SignupService', 'signup', 'signup', 'signup', 'signup', 'signup', 'signup', 'outbox', 'users'], [[], ['bad'], ['a@b'], ['@x.com'], ['a b@x.com'], ['a@@b.com'], ['a@b.'], [], []]], expected: [null, 'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid', [], []], name: 'invalid addresses send nothing' },
      { args: [['SignupService', 'signup', 'signup', 'outbox', 'users'], [[], ['z@x.io'], ['m@x.io'], [], []]], expected: [null, 'ok', 'ok', ['welcome:z@x.io', 'welcome:m@x.io'], ['m@x.io', 'z@x.io']], name: 'outbox in order, users sorted' },
      { args: [['SignupService', 'signup', 'users'], [[], ['  Bob@X.com '], []]], expected: [null, 'ok', ['bob@x.com']], name: 'trim and lower-case' },
    ],
    hints: ['Give each collaborator one job: the validator only answers is_valid, the repository only stores, the mailer only queues mail. The service just calls them in order.', 'Normalise once at the top of signup, then: invalid? duplicate? else add + send_welcome + "ok". Return copies from outbox() and users().'],
    combines: ['oop-principles'],
  },
  quiz: [
    {
      prompt: 'Which description of a class most clearly violates SRP?',
      options: ['A class with 12 methods that all compute shipping rates', 'A `UserService` that validates input, writes SQL and builds the welcome email', 'A class with a private helper method', 'A dataclass with 8 fields'],
      answer: 1,
      explain: 'Validation, persistence and email are three different reasons to change. Method or field count alone says nothing.',
    },
  ],
};

export default unit;
