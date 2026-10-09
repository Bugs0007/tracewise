import type { Unit } from '@/content/types';
import { OPS_SAFE, solidViz, type SolidSpec } from '@/content/lib/sysdesign-lld';

const code = `
# ---- before: Penguin breaks the promise Bird makes
class Bird:
    def fly(self): return "flap"                        #@before
    def eat(self): ...

class Penguin(Bird):
    def fly(self):                                      #@bad
        raise NotImplementedError("penguins cannot fly")

def migrate(birds):
    for b in birds:
        if isinstance(b, Penguin):                      # every client needs this guard
            continue
        b.fly()

# ---- after: only birds that can fly promise fly()
class Bird:                                             #@split
    def eat(self): ...

class FlyingBird(Bird):
    def fly(self): return "flap"

class Sparrow(FlyingBird): ...                          #@sparrow

class Penguin(Bird):                                    #@penguin
    def swim(self): return "paddle"

def migrate(flyers):                                    #@clients
    for b in flyers:
        b.fly()

# replay: which classes break when the hierarchy changes?   #@sim
`;

const spec: SolidSpec = {
  id: 'solid-lsp',
  title: 'Liskov substitution: stop the subclass lying',
  code,
  before: {
    classes: [
      { id: 'bird', name: 'Bird', methods: ['fly()', 'eat()'], x: 350, y: 130, owns: ['fly_contract'] },
      { id: 'sparrow', name: 'Sparrow', methods: ['sing()'], x: 130, y: 40 },
      { id: 'penguin', name: 'Penguin', methods: ['fly() raises'], x: 570, y: 40, owns: ['fly_contract'] },
      { id: 'zoo', name: 'Zoo', methods: ['migrate(birds)', 'isinstance guard'], x: 130, y: 290, owns: ['flightless'] },
      { id: 'show', name: 'Airshow', methods: ['perform(birds)', 'isinstance guard'], x: 570, y: 290, owns: ['flightless'] },
    ],
    rels: [
      { from: 'sparrow', to: 'bird', kind: 'inherits' },
      { from: 'penguin', to: 'bird', kind: 'inherits' },
      { from: 'zoo', to: 'bird', kind: 'uses' },
      { from: 'show', to: 'bird', kind: 'uses' },
    ],
  },
  steps: [
    {
      at: 'split',
      caption: 'Split the hierarchy: Bird promises only eat(); FlyingBird adds fly()',
      update: [{ id: 'bird', methods: ['eat()'], x: 350, y: 40, owns: [] }],
      add: [{ id: 'flying', name: 'FlyingBird', methods: ['fly()'], x: 150, y: 125, owns: ['fly_contract'] }],
      addRels: [{ from: 'flying', to: 'bird', kind: 'inherits' }],
    },
    {
      at: 'sparrow',
      caption: 'Sparrow extends FlyingBird; Penguin stays a plain Bird',
      update: [
        { id: 'sparrow', x: 60, y: 210 },
        { id: 'penguin', x: 550, y: 125 },
      ],
      removeRels: [['sparrow', 'bird']],
      addRels: [{ from: 'sparrow', to: 'flying', kind: 'inherits' }],
    },
    {
      at: 'penguin',
      caption: 'Penguin drops the fake fly() and offers an honest swim()',
      update: [{ id: 'penguin', methods: ['swim()'], owns: [] }],
    },
    {
      at: 'clients',
      caption: 'Clients ask for FlyingBird where they need flying: guards disappear',
      update: [
        { id: 'zoo', methods: ['migrate(birds)'], x: 270, y: 215, owns: [] },
        { id: 'show', methods: ['perform(birds)'], x: 430, y: 215, owns: [] },
      ],
      removeRels: [
        ['zoo', 'bird'],
        ['show', 'bird'],
      ],
      addRels: [
        { from: 'zoo', to: 'flying', kind: 'uses' },
        { from: 'show', to: 'flying', kind: 'uses' },
      ],
    },
  ],
  requests: {
    flightless: { label: 'add a flightless bird (ostrich)', adds: 'Ostrich' },
    flyer: { label: 'add another flying bird (eagle)', adds: 'Eagle' },
    contract: { label: 'fly() must now return an altitude' },
  },
  start: { at: 'bad', caption: 'Penguin accepts the Bird type but breaks fly(): callers need guards', flag: ['penguin', 'zoo', 'show'] },
  finish: { at: 'clients', caption: 'Every subtype can stand in for its parent type without surprises' },
  simAt: 'sim',
  defaultRequests: ['flightless', 'flyer', 'contract'],
  presets: [
    { label: 'Another flightless bird', requests: ['flightless'] },
    { label: 'Contract change', requests: ['contract'] },
    { label: 'Three flightless birds', requests: ['flightless', 'flightless', 'flightless'] },
  ],
};

const DISCOUNT_HARNESS = `
class Discount:
    # Contract: apply(amount) accepts ANY int amount >= 0, never raises,
    # and returns an int between 0 and amount (inclusive).
    def apply(self, amount):
        return amount
`;

const viz = solidViz(spec);

const unit: Unit = {
  id: 'solid-lsp',
  hook: 'LSP is the SOLID rule people explain with rectangles and then cannot apply. Show you can spot a subclass that **narrows what it accepts** or **breaks what it promises**.',
  predict: {
    prompt: 'A function takes a `Bird` and calls `bird.fly()`. `Penguin(Bird).fly()` raises `NotImplementedError`. Which statement is accurate?',
    options: [
      'Fine: Penguin is a Bird in biology, so the hierarchy is correct',
      'Penguin violates LSP: code written against Bird now fails, so callers need isinstance guards',
      'Penguin is fine because Python does not check overrides',
      'Only an abstract method may raise, so Penguin is correct if Bird.fly is abstract',
    ],
    answer: 1,
    explain: 'LSP is about behaviour, not taxonomy. If code that works for Bird breaks for Penguin, Penguin is not a valid substitute and the hierarchy promises too much.',
  },
  viz,
  deeper: {
    points: [
      'A subtype must be usable anywhere its parent is expected **without the caller noticing**.',
      'Contract rules: a subclass may **weaken preconditions** (accept more) and **strengthen postconditions** (promise more), never the reverse. It must not raise new kinds of exceptions the parent never raised.',
      'Smells: `isinstance` checks in callers, overrides that raise `NotImplementedError`, overrides that return `None` where the parent returned a value, and empty overrides that silently do nothing.',
      'The fix is usually to change the hierarchy (split the type, prefer composition), not to patch the callers.',
      'Rectangle/Square fails for the same reason: a mutable Square cannot honour "set width and height independently". Immutable values or separate types avoid it.',
    ],
    pitfalls: ['Reading "is-a" as real-world taxonomy instead of behavioural contracts', 'Fixing a violation with a type check in each caller', 'Overriding a method just to disable it'],
  },
  practice: {
    language: 'python',
    fnName: 'Coupon',
    statement: 'The base `Discount` promises: `apply(amount)` accepts any amount >= 0, never raises, and returns a value between 0 and amount. Implement `Coupon(value, min_spend=0)` as a valid substitute: below `min_spend` it returns the amount unchanged, otherwise it subtracts `value` (never below 0; a negative value counts as 0).',
    signature: 'class Coupon(Discount):',
    harness: DISCOUNT_HARNESS + OPS_SAFE,
    adapter: 'run_ops_safe',
    solution: `class Coupon(Discount):
    def __init__(self, value, min_spend=0):
        self.value = @@max(0, value)@@
        self.min_spend = min_spend

    def apply(self, amount):
        if @@amount < self.min_spend@@:
            return @@amount@@
        return @@max(0, amount - self.value)@@`,
    tests: [
      { args: [['Coupon', 'apply', 'apply', 'apply'], [[500], [1000], [300], [0]]], expected: [null, 500, 0, 0], name: 'never below zero' },
      { args: [['Coupon', 'apply', 'apply'], [[-50], [100], [0]]], expected: [null, 100, 0], name: 'negative value is no discount' },
      { args: [['Coupon', 'apply', 'apply', 'apply'], [[500, 2000], [1000], [2000], [1999]]], expected: [null, 1000, 1500, 1999], name: 'below min spend: unchanged, no error' },
      { args: [['Coupon', 'apply', 'apply'], [[100], [100], [101]]], expected: [null, 0, 1], name: 'exact and just over' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'BigSpenderDiscount',
    statement: 'Checkout crashes for small baskets after `BigSpenderDiscount` was added to the list of discounts. The base class says `apply` must accept any amount. Fix the subclass.',
    harness: DISCOUNT_HARNESS + OPS_SAFE,
    adapter: 'run_ops_safe',
    buggy: `class BigSpenderDiscount(Discount):
    def __init__(self, percent):
        self.percent = percent

    def apply(self, amount):
        if amount < 10000:
            raise ValueError("only for orders over 100.00")
        return amount - amount * self.percent // 100`,
    fixed: `class BigSpenderDiscount(Discount):
    def __init__(self, percent):
        self.percent = percent

    def apply(self, amount):
        if amount < 10000:
            return amount
        return amount - amount * self.percent // 100`,
    tests: [
      { args: [['BigSpenderDiscount', 'apply'], [[10], [20000]]], expected: [null, 18000], name: 'big basket' },
      { args: [['BigSpenderDiscount', 'apply', 'apply'], [[10], [5000], [0]]], expected: [null, 5000, 0], name: 'small basket is accepted' },
      { args: [['BigSpenderDiscount', 'apply'], [[100], [10000]]], expected: [null, 0], name: 'threshold' },
    ],
    bugType: 'strengthened precondition',
    hint: 'What may a subclass do when the input is outside the range it is interested in?',
    explanation: 'The override rejects inputs the parent accepts, so any caller holding a Discount can crash. A valid subtype handles every input the parent does; for small baskets that means returning the amount unchanged.',
  },
  boss: {
    title: 'LSP contract checker',
    statement:
      'Write `lsp_violations(parent, child)`. Each argument is a dict `{"accepts": [lo, hi], "returns": [lo, hi], "raises": [names]}`. Return a sorted list of problems: `"precondition strengthened"` if the child accepts a narrower range than the parent, `"postcondition weakened"` if the child may return values outside the parent\'s range, and `"new exception: X"` for every exception the child raises that the parent does not.',
    language: 'python',
    fnName: 'lsp_violations',
    starter: `def lsp_violations(parent, child):
    # your code here
    pass
`,
    solution: `def lsp_violations(parent, child):
    problems = []
    p_lo, p_hi = parent["accepts"]
    c_lo, c_hi = child["accepts"]
    if c_lo > p_lo or c_hi < p_hi:
        problems.append("precondition strengthened")
    pr_lo, pr_hi = parent["returns"]
    cr_lo, cr_hi = child["returns"]
    if cr_lo < pr_lo or cr_hi > pr_hi:
        problems.append("postcondition weakened")
    for name in child["raises"]:
        if name not in parent["raises"]:
            problems.append("new exception: " + name)
    return sorted(problems)`,
    tests: [
      { args: [{ accepts: [0, 100], returns: [0, 10], raises: [] }, { accepts: [0, 100], returns: [0, 10], raises: [] }], expected: [], name: 'identical contracts' },
      { args: [{ accepts: [0, 100], returns: [0, 10], raises: [] }, { accepts: [10, 100], returns: [0, 10], raises: [] }], expected: ['precondition strengthened'], name: 'narrower accepts' },
      { args: [{ accepts: [0, 100], returns: [0, 10], raises: [] }, { accepts: [0, 100], returns: [-5, 10], raises: [] }], expected: ['postcondition weakened'], name: 'wider returns' },
      { args: [{ accepts: [0, 1], returns: [0, 1], raises: ['ValueError'] }, { accepts: [0, 1], returns: [0, 1], raises: ['ValueError', 'KeyError'] }], expected: ['new exception: KeyError'], name: 'new exception' },
      { args: [{ accepts: [0, 10], returns: [0, 10], raises: [] }, { accepts: [1, 9], returns: [0, 11], raises: ['TimeoutError'] }], expected: ['new exception: TimeoutError', 'postcondition weakened', 'precondition strengthened'], name: 'all three, sorted' },
      { args: [{ accepts: [0, 10], returns: [0, 10], raises: ['A'] }, { accepts: [-5, 20], returns: [2, 8], raises: [] }], expected: [], name: 'a better subtype is fine' },
    ],
    hints: ['Compare intervals: the child must accept at least everything the parent accepts (c_lo <= p_lo and c_hi >= p_hi), and return nothing outside the parent range.', 'A violation is the negation: c_lo > p_lo or c_hi < p_hi for accepts; cr_lo < pr_lo or cr_hi > pr_hi for returns. Finish with `sorted(problems)`.'],
    combines: ['solid-ocp'],
  },
  quiz: [
    {
      prompt: 'Which subclass change is allowed by LSP?',
      options: ['Raising a new exception type the parent never raised', 'Requiring a non-empty argument when the parent accepted empty ones', 'Accepting more inputs than the parent and returning a narrower range of values', 'Returning None where the parent returned a number'],
      answer: 2,
      explain: 'Weaker preconditions and stronger postconditions are safe: every caller written for the parent still works.',
    },
  ],
};

export default unit;
