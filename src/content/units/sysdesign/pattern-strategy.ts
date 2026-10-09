import type { Unit } from '@/content/types';
import type { Design } from '@/content/lib/sysdesign-lld';
import { OPS_SAFE } from '@/content/lib/sysdesign-lld';
import { scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class PricingStrategy:
    def total(self, price, qty): raise NotImplementedError

class RegularPricing(PricingStrategy):
    def total(self, price, qty): return price * qty                  #@regular

class MemberPricing(PricingStrategy):
    def total(self, price, qty): return price * qty * 90 // 100      #@member

class StaffPricing(PricingStrategy):
    def total(self, price, qty): return price * qty * 50 // 100      #@staff

class BulkPricing(PricingStrategy):
    def total(self, price, qty):                                     #@bulk
        pct = 80 if qty >= 10 else 100
        return price * qty * pct // 100

STRATEGIES = {"regular": RegularPricing, "member": MemberPricing,
              "staff": StaffPricing, "bulk": BulkPricing}            #@registry

class Cart:
    def __init__(self, strategy):                                    #@cart
        self.strategy = strategy
    def checkout(self, price, qty):
        return self.strategy.total(price, qty)                       #@delegate

def checkout(kind, qty, price):
    return Cart(STRATEGIES[kind]()).checkout(price, qty)             #@pick
`;

interface Rule {
  cls: string;
  pct: (qty: number) => number;
  expr: (qty: number) => string;
}

const RULES: Record<string, Rule> = {
  regular: { cls: 'RegularPricing', pct: () => 100, expr: () => 'price * qty' },
  member: { cls: 'MemberPricing', pct: () => 90, expr: () => 'price * qty * 90 // 100' },
  staff: { cls: 'StaffPricing', pct: () => 50, expr: () => 'price * qty * 50 // 100' },
  bulk: { cls: 'BulkPricing', pct: (q) => (q >= 10 ? 80 : 100), expr: (q) => `price * qty * ${q >= 10 ? 80 : 100} // 100` },
};

const design: Design = {
  classes: [
    { id: 'cart', name: 'Cart', attrs: ['strategy'], methods: ['checkout()'], x: 350, y: 40 },
    { id: 'strategy', name: 'PricingStrategy', kind: 'interface', methods: ['total(price, qty)'], x: 350, y: 150 },
    { id: 'regular', name: 'RegularPricing', methods: ['total()'], x: 100, y: 280 },
    { id: 'member', name: 'MemberPricing', methods: ['total()'], x: 260, y: 280 },
    { id: 'staff', name: 'StaffPricing', methods: ['total()'], x: 420, y: 280 },
    { id: 'bulk', name: 'BulkPricing', methods: ['total()'], x: 585, y: 280 },
  ],
  rels: [
    { from: 'cart', to: 'strategy', kind: 'aggregates', label: 'delegates to' },
    ...['regular', 'member', 'staff', 'bulk'].map((id) => ({ from: id, to: 'strategy', kind: 'inherits' as const })),
  ],
};

interface In {
  orders: string[];
}

interface Order {
  kind: string;
  qty: number;
  price: number;
}

function parse(list: string[]): Order[] {
  return list.map((raw) => {
    const [kind, qty, price] = raw.split(':').map((s) => s.trim());
    const q = Number(qty);
    const p = Number(price);
    if (!RULES[kind?.toLowerCase()] || !Number.isInteger(q) || q < 1 || !Number.isInteger(p) || p < 0) {
      throw new Error(`Cannot read "${raw}". Use kind:qty:unit_price_in_cents with kind one of ${Object.keys(RULES).join(', ')}, qty >= 1`);
    }
    return { kind: kind.toLowerCase(), qty: q, price: p };
  });
}

const money = (c: number): string => `$${(c / 100).toFixed(2)}`;

function simulate(input: In) {
  const orders = parse(input.orders);
  const beats: Beat[] = [];
  const totals: number[] = [];
  let revenue = 0;
  beats.push({ at: 'registry', caption: 'Cart is generic; the pricing rule is a pluggable object', state: { orders: 0, revenue: money(0) }, stateTitle: 'Totals' });
  orders.forEach((o, i) => {
    const rule = RULES[o.kind];
    beats.push({ at: 'pick', caption: `Order ${i + 1}: ${o.qty} x ${money(o.price)} for a ${o.kind} customer`, tones: { cart: 'active' }, msg: { from: 'Client', to: 'Cart', label: `checkout("${o.kind}", ${o.qty}, ${o.price})` }, state: { orders: i, revenue: money(revenue) }, stateTitle: 'Totals' });
    beats.push({ at: 'registry', caption: `Registry picks ${rule.cls} and hands it to the Cart`, tones: { cart: 'active', [o.kind]: 'new' }, edgeTones: { 'cart>strategy': 'path', [`${o.kind}>strategy`]: 'new' }, msg: { from: 'Cart', to: 'Strategy', label: `${rule.cls}()` }, state: { orders: i, revenue: money(revenue) }, stateTitle: 'Totals', log: { text: `${o.kind} -> ${rule.cls}`, tone: 'found' } });
    const total = Math.floor((o.price * o.qty * rule.pct(o.qty)) / 100);
    totals.push(total);
    revenue += total;
    beats.push({ at: o.kind, caption: `${rule.cls}: ${rule.expr(o.qty)} = ${money(total)}`, tones: { cart: 'compare', [o.kind]: 'found' }, edgeTones: { 'cart>strategy': 'path' }, msg: { from: 'Strategy', to: 'Cart', label: `total = ${money(total)}` }, state: { orders: i + 1, revenue: money(revenue) }, stateTitle: 'Totals', log: { text: `order ${i + 1}: ${money(total)}`, tone: 'default' }, vars: { total, pct: rule.pct(o.qty) } });
  });
  return { beats, result: totals };
}

function reference(input: In): number[] {
  const pct: Record<string, (q: number) => number> = { regular: () => 100, member: () => 90, staff: () => 50, bulk: (q) => (q >= 10 ? 80 : 100) };
  return parse(input.orders).map((o) => Math.floor((o.qty * o.price * pct[o.kind](o.qty)) / 100));
}

const viz = scenarioViz<In, number[]>({
  id: 'pattern-strategy',
  title: 'Strategy: swap the pricing rule',
  code,
  design,
  diagramTitle: 'Participants',
  size: { width: 700, height: 330 },
  actors: ['Client', 'Cart', 'Strategy'],
  logTitle: 'Totals',
  inputs: [{ key: 'orders', label: 'Orders (kind:qty:cents)', kind: 'strings', default: ['regular:2:1000', 'member:3:1000', 'bulk:12:500', 'bulk:3:500'], maxItems: 5, help: 'kind is regular, member, staff or bulk; unit price in cents.' }],
  presets: [
    { label: 'One of each', input: { orders: ['regular:1:2000', 'member:1:2000', 'staff:1:2000', 'bulk:1:2000'] } },
    { label: 'Bulk threshold', input: { orders: ['bulk:9:1000', 'bulk:10:1000'] } },
    { label: 'Staff discount', input: { orders: ['staff:4:999', 'regular:4:999'] } },
  ],
  simulate,
  reference,
});

const unit: Unit = {
  id: 'pattern-strategy',
  hook: 'Strategy is the clean answer to "this function is a giant if/elif over a type". Name the family of interchangeable algorithms, inject one, and new variants never touch the caller.',
  predict: {
    prompt: 'Pricing is an `if kind == ...` chain inside `Cart.total()`. Marketing adds a "student" price. A branch for "student" is forgotten. What happens to a student order?',
    options: ['A KeyError is raised immediately', 'It silently falls into the else branch and is priced at full price', 'Python picks the closest matching branch', 'The Cart refuses to run at startup'],
    answer: 1,
    explain: 'A chain with a default `else` swallows unknown kinds. A strategy registry makes the unknown kind a visible `KeyError` at the lookup, and each rule is one small class.',
  },
  viz,
  deeper: {
    points: [
      'Intent: define a **family of algorithms**, encapsulate each one, and make them interchangeable. The context (`Cart`) holds a strategy and delegates to it.',
      'Choosing the strategy is a separate decision from using it: a registry, a factory or configuration picks, the context just calls.',
      'In Python a strategy is often just a **function** passed in (`Cart(rule=bulk_rule)`). Use classes when the strategy has state or several methods.',
      'It is the open/closed principle in practice: adding "student" is one new class and one registry entry.',
      'Strategy differs from State: a strategy is chosen by the client and rarely changes itself; a state object changes the context\'s behaviour as events happen.',
    ],
    pitfalls: ['An if/else chain with a silent default for unknown kinds', 'Strategies that reach back into the context and read its internals', 'Creating a class for each trivial one-line rule when a lambda would do'],
  },
  practice: {
    language: 'python',
    fnName: 'Cart',
    statement:
      'Implement `Cart(kind)` using a registry of pricing functions `rule(price, qty)` (integer cents): regular `price*qty`, member 90 percent, staff 50 percent, bulk 80 percent when `qty >= 10` else 100 percent (use `price * qty * pct // 100`). An unknown kind raises `KeyError`. `add(price, qty)` records a line and `total()` sums each line using the chosen rule.',
    signature: 'class Cart:',
    harness: OPS_SAFE,
    adapter: 'run_ops_safe',
    solution: `RULES = {
    'regular': lambda price, qty: price * qty,
    'member': lambda price, qty: @@price * qty * 90 // 100@@,
    'staff': lambda price, qty: price * qty * 50 // 100,
    'bulk': lambda price, qty: price * qty * (80 if qty >= 10 else 100) // 100,
}

class Cart:
    def __init__(self, kind):
        self._rule = @@RULES[kind]@@
        self._lines = []

    def add(self, price, qty):
        self._lines.append((price, qty))

    def total(self):
        return sum(@@self._rule(p, q)@@ for p, q in self._lines)`,
    tests: [
      { args: [['Cart', 'add', 'add', 'total'], [['regular'], [1000, 2], [250, 1], []]], expected: [null, null, null, 2250], name: 'regular' },
      { args: [['Cart', 'add', 'total'], [['member'], [1000, 3], []]], expected: [null, null, 2700], name: 'member 10% off' },
      { args: [['Cart', 'add', 'add', 'total'], [['bulk'], [500, 12], [500, 3], []]], expected: [null, null, null, 6300], name: 'bulk applies per line' },
      { args: [['Cart', 'add', 'total'], [['staff'], [999, 4], []]], expected: [null, null, 1998], name: 'staff half price' },
      { args: [['Cart', 'total'], [['regular'], []]], expected: [null, 0], name: 'empty cart' },
      { args: [['Cart'], [['student']]], expected: ['!KeyError'], name: 'unknown kind' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Cart',
    statement: 'Bulk customers complain they never get their 20 percent discount on big orders. The cart picks its rule with an if/elif chain; find what it forgets.',
    harness: OPS_SAFE,
    adapter: 'run_ops_safe',
    buggy: `class Cart:
    def __init__(self, kind):
        self.kind = kind
        self.lines = []

    def add(self, price, qty):
        self.lines.append((price, qty))

    def total(self):
        t = 0
        for p, q in self.lines:
            if self.kind == 'member':
                t += p * q * 90 // 100
            elif self.kind == 'staff':
                t += p * q * 50 // 100
            else:
                t += p * q
        return t`,
    fixed: `class Cart:
    def __init__(self, kind):
        self.kind = kind
        self.lines = []

    def add(self, price, qty):
        self.lines.append((price, qty))

    def total(self):
        t = 0
        for p, q in self.lines:
            if self.kind == 'member':
                t += p * q * 90 // 100
            elif self.kind == 'staff':
                t += p * q * 50 // 100
            elif self.kind == 'bulk':
                t += p * q * (80 if q >= 10 else 100) // 100
            else:
                t += p * q
        return t`,
    tests: [
      { args: [['Cart', 'add', 'total'], [['bulk'], [500, 12], []]], expected: [null, null, 4800], name: 'bulk discount applies at 10' },
      { args: [['Cart', 'add', 'total'], [['bulk'], [500, 9], []]], expected: [null, null, 4500], name: 'no discount below 10' },
      { args: [['Cart', 'add', 'total'], [['member'], [1000, 2], []]], expected: [null, null, 1800], name: 'member unchanged' },
    ],
    bugType: 'missing branch',
    hint: 'Which customer kinds have an explicit branch? What does every other kind fall into?',
    explanation: 'There is no `bulk` branch, so bulk orders hit the `else` and pay full price without any error. Moving each rule into a registry of strategies makes a missing kind a loud `KeyError` instead.',
  },
  boss: {
    title: 'Best coupon',
    statement:
      'Write `best_coupon(total, codes)` returning `[code, final_total]` for the coupon that gives the largest discount (ties: the earlier code). Coupon strategies are chosen from the code text: `"PCT:n"` discounts `total * n // 100` (n from 1 to 100), `"FLAT:n"` discounts n, `"CAP:n:m"` discounts `min(total * n // 100, m)`. The discount never exceeds `total`. Malformed or unknown codes are ignored; with no valid code return `[None, total]`.',
    language: 'python',
    fnName: 'best_coupon',
    starter: `def best_coupon(total, codes):
    pass
`,
    solution: `class Percent:
    def __init__(self, n):
        self.n = n
    def discount(self, total):
        return total * self.n // 100

class Flat:
    def __init__(self, n):
        self.n = n
    def discount(self, total):
        return self.n

class Capped:
    def __init__(self, n, cap):
        self.n = n
        self.cap = cap
    def discount(self, total):
        return min(total * self.n // 100, self.cap)

def parse_coupon(code):
    parts = code.split(':')
    try:
        nums = [int(p) for p in parts[1:]]
    except ValueError:
        return None
    if parts[0] == 'PCT' and len(nums) == 1 and 1 <= nums[0] <= 100:
        return Percent(nums[0])
    if parts[0] == 'FLAT' and len(nums) == 1 and nums[0] >= 0:
        return Flat(nums[0])
    if parts[0] == 'CAP' and len(nums) == 2 and 1 <= nums[0] <= 100 and nums[1] >= 0:
        return Capped(nums[0], nums[1])
    return None

def best_coupon(total, codes):
    best_code, best_off = None, 0
    for code in codes:
        strategy = parse_coupon(code)
        if strategy is None:
            continue
        off = min(strategy.discount(total), total)
        if best_code is None or off > best_off:
            best_code, best_off = code, off
    return [best_code, total - best_off]`,
    tests: [
      { args: [1000, ['PCT:10', 'FLAT:150']], expected: ['FLAT:150', 850], name: 'flat beats percent' },
      { args: [1000, ['PCT:10', 'CAP:50:200']], expected: ['CAP:50:200', 800], name: 'cap applies' },
      { args: [1000, ['FLAT:5000']], expected: ['FLAT:5000', 0], name: 'never below zero' },
      { args: [1000, ['BOGUS', 'PCT:abc', 'PCT:0', 'CAP:10']], expected: [null, 1000], name: 'all malformed' },
      { args: [1000, ['PCT:10', 'FLAT:100']], expected: ['PCT:10', 900], name: 'tie keeps the earlier code' },
      { args: [500, []], expected: [null, 500], name: 'no codes' },
      { args: [1000, ['CAP:20:100', 'PCT:15']], expected: ['PCT:15', 850], name: 'percent beats a loose cap' },
    ],
    hints: ['Turn each code into a small strategy object with a `discount(total)` method (or None when malformed), then compare the discounts.', 'Clamp each discount with `min(d, total)`. To keep ties on the earlier code, replace the best only when the new discount is strictly larger.'],
    combines: ['solid-ocp'],
  },
  quiz: [
    {
      prompt: 'When is a plain function a good enough strategy in Python?',
      options: ['Never: strategies must be classes', 'When the algorithm needs no state or extra methods', 'Only inside lambdas', 'Only for sorting'],
      answer: 1,
      explain: 'Functions are first-class objects, so `sorted(key=...)` is already the strategy pattern. Use a class when the algorithm carries configuration or several operations.',
    },
  ],
};

export default unit;
