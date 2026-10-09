import type { Unit } from '@/content/types';
import { OPS_SAFE, solidViz, type SolidSpec } from '@/content/lib/sysdesign-lld';

const code = `
# ---- before: every new discount edits two classes
class PriceCalculator:
    def price(self, order):                            #@before
        if order.kind == "member":
            return order.total * 90 // 100
        elif order.kind == "staff":
            return order.total * 50 // 100
        return order.total

class ReceiptPrinter:
    def label(self, order):                            #@label
        if order.kind == "member":
            return "Member -10%"
        elif order.kind == "staff":
            return "Staff -50%"
        return ""

# ---- after: open for extension, closed for modification
class Discount:                                        #@abstraction
    def apply(self, total): return total
    def label(self): return ""

class MemberDiscount(Discount):                        #@member
    def apply(self, total): return total * 90 // 100
    def label(self): return "Member -10%"

class StaffDiscount(Discount):                         #@staff
    def apply(self, total): return total * 50 // 100
    def label(self): return "Staff -50%"

class PriceCalculator:                                 #@rewire
    def price(self, order):
        return order.discount.apply(order.total)

class BlackFridayDiscount(Discount):                   #@extend
    def apply(self, total): return total * 70 // 100
    def label(self): return "Black Friday -30%"

# replay: how many existing classes does each request edit?   #@sim
`;

const spec: SolidSpec = {
  id: 'solid-ocp',
  title: 'Open/closed: replace the if/elif chain',
  code,
  before: {
    classes: [
      { id: 'checkout', name: 'Checkout', methods: ['pay(order)'], x: 350, y: 40 },
      { id: 'price', name: 'PriceCalculator', methods: ['price(order)', 'if/elif kind'], x: 150, y: 150, owns: ['student', 'blackfriday', 'rounding'] },
      { id: 'receipt', name: 'ReceiptPrinter', methods: ['label(order)', 'if/elif kind'], x: 550, y: 150, owns: ['student', 'blackfriday'] },
    ],
    rels: [
      { from: 'checkout', to: 'price', kind: 'uses' },
      { from: 'checkout', to: 'receipt', kind: 'uses' },
    ],
  },
  steps: [
    {
      at: 'abstraction',
      caption: 'Introduce a Discount abstraction: the stable point everything depends on',
      add: [{ id: 'disc', name: 'Discount', kind: 'abstract', methods: ['apply(total)', 'label()'], x: 350, y: 150 }],
    },
    {
      at: 'member',
      caption: 'Move each if/elif branch into its own Discount subclass',
      add: [
        { id: 'member', name: 'MemberDiscount', methods: ['apply()', 'label()'], x: 150, y: 270 },
        { id: 'staff', name: 'StaffDiscount', methods: ['apply()', 'label()'], x: 350, y: 270 },
      ],
      addRels: [
        { from: 'member', to: 'disc', kind: 'inherits' },
        { from: 'staff', to: 'disc', kind: 'inherits' },
      ],
    },
    {
      at: 'rewire',
      caption: 'PriceCalculator and ReceiptPrinter just call the abstraction: no more type checks',
      update: [
        { id: 'price', methods: ['price(order)', 'discount.apply()'], owns: ['rounding'] },
        { id: 'receipt', methods: ['label(order)', 'discount.label()'], owns: [] },
      ],
      addRels: [
        { from: 'price', to: 'disc', kind: 'uses' },
        { from: 'receipt', to: 'disc', kind: 'uses' },
      ],
    },
    {
      at: 'extend',
      caption: 'A new discount is one new class: nothing existing is edited',
      add: [{ id: 'bf', name: 'BlackFridayDiscount', methods: ['apply()', 'label()'], x: 550, y: 270 }],
      addRels: [{ from: 'bf', to: 'disc', kind: 'inherits' }],
    },
  ],
  requests: {
    student: { label: 'add a student discount', adds: 'StudentDiscount' },
    blackfriday: { label: 'add a Black Friday sale', adds: 'BlackFridayDiscount' },
    rounding: { label: 'round prices to 5 cents' },
  },
  start: { at: 'before', caption: 'Every new discount type means editing two classes in two places', flag: ['price', 'receipt'] },
  finish: { at: 'extend', caption: 'Closed for modification, open for extension via new subclasses' },
  simAt: 'sim',
  defaultRequests: ['student', 'blackfriday', 'rounding'],
  presets: [
    { label: 'Two new discounts', requests: ['student', 'blackfriday'] },
    { label: 'Unrelated change', requests: ['rounding'] },
    { label: 'Mixed', requests: ['student', 'rounding', 'blackfriday', 'student'] },
  ],
};

const SHAPES_HARNESS = `
class Shape:
    def area(self):
        raise NotImplementedError

class Circle(Shape):
    def __init__(self, r):
        self.r = r
    def area(self):
        return 3 * self.r * self.r

class Rect(Shape):
    def __init__(self, w, h):
        self.w, self.h = w, h
    def area(self):
        return self.w * self.h

class Triangle(Shape):
    def __init__(self, b, h):
        self.b, self.h = b, h
    def area(self):
        return self.b * self.h // 2

def run_shapes(cls, specs, op):
    makers = {'circle': Circle, 'rect': Rect, 'triangle': Triangle}
    shapes = [makers[s[0]](*s[1:]) for s in specs]
    return getattr(cls(), op)(shapes)
`;

const viz = solidViz(spec);

const unit: Unit = {
  id: 'solid-ocp',
  hook: 'Open/closed is how you answer "how do I add a new payment method / discount / file format without touching working code?". The answer is polymorphism plus a stable abstraction.',
  predict: {
    prompt: 'Two classes each contain `if kind == "member" ... elif kind == "staff" ...`. A new "student" kind arrives. How many existing classes must be edited, and what happens if one edit is forgotten?',
    options: [
      'One class; nothing breaks if the other is forgotten',
      'Two classes; forgetting one gives wrong prices or labels at runtime with no error',
      'Zero: Python resolves new kinds automatically',
      'Two classes, but the compiler catches a missing branch',
    ],
    answer: 1,
    explain: 'Each type switch is a hidden copy of the same decision. A forgotten branch silently falls through to the default, so the receipt says one thing and the price another.',
  },
  viz,
  deeper: {
    points: [
      '"Open for extension, closed for modification": add behaviour by **adding code**, not by editing code that already works and is tested.',
      'The mechanism is an abstraction (interface, abstract class, protocol or a registry) that callers depend on while variants plug in behind it.',
      'A type switch is a smell only when it grows with every feature. A single stable `if` on a closed set (for example HTTP methods) is fine.',
      'Closed does not mean frozen forever: the replay shows an unrelated change (rounding) still edits `PriceCalculator`. Closure is relative to the kind of change you predicted.',
      'Python gives you several extension points: subclasses, duck typing, a dict registry, or passing a function.',
    ],
    pitfalls: ['Abstracting before a second variant exists', 'Leaving an `isinstance` check in a caller, which re-creates the type switch', 'Extension classes that need the caller to be edited anyway to construct them (move the choice to a factory or registry)'],
  },
  practice: {
    language: 'python',
    fnName: 'AreaCalculator',
    statement: 'The shapes (`Circle`, `Rect`, `Triangle`, all with `.area()`) come from the harness; `Triangle` is new and your code has never heard of it. Implement `AreaCalculator.total(shapes)` and `largest(shapes)` (index of the first biggest shape, -1 if none) using only `area()`, so new shapes work without edits.',
    signature: 'class AreaCalculator:',
    harness: SHAPES_HARNESS,
    adapter: 'run_shapes',
    solution: `class AreaCalculator:
    def total(self, shapes):
        return sum(@@s.area()@@ for s in shapes)

    def largest(self, shapes):
        if not shapes:
            return -1
        best = 0
        for i, s in enumerate(shapes):
            if @@s.area() > shapes[best].area()@@:
                best = @@i@@
        return best`,
    tests: [
      { args: [[['circle', 2], ['rect', 2, 3], ['triangle', 4, 3]], 'total'], expected: 24, name: 'total with a triangle' },
      { args: [[], 'total'], expected: 0, name: 'empty total' },
      { args: [[['rect', 1, 1], ['triangle', 10, 10], ['circle', 1]], 'largest'], expected: 1, name: 'largest is the triangle' },
      { args: [[], 'largest'], expected: -1, name: 'largest of nothing' },
      { args: [[['rect', 2, 3], ['triangle', 4, 3]], 'largest'], expected: 0, name: 'tie keeps the first' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'AreaCalculator',
    statement: 'The team added `Triangle`, but invoices that include one report a total that is too low, with no error. Fix the calculator so it handles any shape.',
    harness: SHAPES_HARNESS,
    adapter: 'run_shapes',
    buggy: `class AreaCalculator:
    def total(self, shapes):
        total = 0
        for s in shapes:
            if isinstance(s, Circle):
                total += 3 * s.r * s.r
            elif isinstance(s, Rect):
                total += s.w * s.h
        return total`,
    fixed: `class AreaCalculator:
    def total(self, shapes):
        total = 0
        for s in shapes:
            total += s.area()
        return total`,
    tests: [
      { args: [[['circle', 2], ['rect', 2, 3]], 'total'], expected: 18, name: 'old shapes' },
      { args: [[['triangle', 4, 3]], 'total'], expected: 6, name: 'triangle counts' },
      { args: [[['rect', 1, 1], ['triangle', 10, 10]], 'total'], expected: 51, name: 'mixed' },
    ],
    bugType: 'closed type switch',
    hint: 'What does the isinstance chain do for a shape it has never seen?',
    explanation: 'The chain silently skips unknown shapes. Ask each shape for its own area() and the calculator never needs to change when a new shape appears.',
  },
  boss: {
    title: 'Pluggable shipping carriers',
    statement:
      'Write `ShippingCalculator()` where new carriers are added by data, never by editing code. `register(carrier, base, per_kg)` stores or replaces a carrier. `cost(carrier, kg)` returns `base + per_kg * kg` and raises `KeyError` for an unknown carrier and `ValueError` if `kg <= 0`. `cheapest(kg)` returns the cheapest carrier name (ties broken alphabetically) or `None` if no carriers are registered.',
    language: 'python',
    fnName: 'ShippingCalculator',
    harness: OPS_SAFE,
    adapter: 'run_ops_safe',
    starter: `class ShippingCalculator:
    # your code here
    pass
`,
    solution: `class ShippingCalculator:
    def __init__(self):
        self.carriers = {}

    def register(self, carrier, base, per_kg):
        self.carriers[carrier] = (base, per_kg)

    def cost(self, carrier, kg):
        if kg <= 0:
            raise ValueError("weight must be positive")
        base, per_kg = self.carriers[carrier]
        return base + per_kg * kg

    def cheapest(self, kg):
        if not self.carriers:
            return None
        return min(sorted(self.carriers), key=lambda c: self.cost(c, kg))`,
    tests: [
      { args: [['ShippingCalculator', 'register', 'register', 'cost', 'cost', 'cheapest', 'cheapest'], [[], ['a', 500, 100], ['b', 300, 200], ['a', 3], ['b', 3], [3], [1]]], expected: [null, null, null, 800, 900, 'a', 'b'], name: 'cost and cheapest' },
      { args: [['ShippingCalculator', 'cost'], [[], ['zzz', 1]]], expected: [null, '!KeyError'], name: 'unknown carrier' },
      { args: [['ShippingCalculator', 'register', 'register', 'cheapest'], [[], ['x', 100, 100], ['w', 100, 100], [2]]], expected: [null, null, null, 'w'], name: 'tie is alphabetical' },
      { args: [['ShippingCalculator', 'register', 'cost'], [[], ['a', 500, 100], ['a', 0]]], expected: [null, null, '!ValueError'], name: 'weight must be positive' },
      { args: [['ShippingCalculator', 'cheapest'], [[], [5]]], expected: [null, null], name: 'no carriers' },
      { args: [['ShippingCalculator', 'register', 'register', 'cost'], [[], ['a', 500, 100], ['a', 100, 100], ['a', 1]]], expected: [null, null, null, 200], name: 're-register replaces' },
    ],
    hints: ['Keep a dict carrier -> (base, per_kg). Registering is just assigning a key, so adding a carrier edits no existing logic.', 'cheapest: pick min over the carriers with key=cost. Iterate sorted names so ties resolve alphabetically (min keeps the first minimum).'],
    combines: ['solid-srp'],
  },
  quiz: [
    {
      prompt: 'Which change best satisfies open/closed when a new export format (CSV, JSON, XML...) keeps being requested?',
      options: ['Add another elif to the exporter', 'Define an Exporter interface with one class per format, picked by a registry', 'Copy the exporter class for each format', 'Make the exporter a global function with many flags'],
      answer: 1,
      explain: 'A new format is a new class plus one registry entry. The code that already works is untouched.',
    },
  ],
};

export default unit;
