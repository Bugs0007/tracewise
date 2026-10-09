import type { Unit } from '@/content/types';
import type { Design } from '@/content/lib/sysdesign-lld';
import { RUN_SAFE_FN, scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class LegacyGateway:                                   # vendor code: cannot be edited
    def charge_cents(self, card, cents):               #@legacy
        ...                                            # "OK|TX9001" or "ERR|51"

class PaymentProcessor:                                # the interface our app expects
    def pay(self, dollars, card): raise NotImplementedError

class LegacyAdapter(PaymentProcessor):                 #@adapter
    REASONS = {"51": "insufficient_funds", "05": "card_declined"}
    def __init__(self, legacy):
        self._legacy = legacy
    def pay(self, dollars, card):                      #@pay
        cents = round(dollars * 100)                   #@convert
        raw = self._legacy.charge_cents(card, cents)   #@delegate
        status, code = raw.split("|")                  #@raw
        if status == "OK":
            return {"ok": True, "id": code}            #@ok
        return {"ok": False, "reason": self.REASONS.get(code, "unknown")}   #@fail
`;

const REASONS: Record<string, string> = { '51': 'insufficient_funds', '05': 'card_declined' };

const design: Design = {
  classes: [
    { id: 'checkout', name: 'Checkout', methods: ['pay(19.99, card)'], x: 100, y: 190 },
    { id: 'iface', name: 'PaymentProcessor', kind: 'interface', methods: ['pay(dollars, card)'], x: 350, y: 50 },
    { id: 'adapter', name: 'LegacyAdapter', attrs: ['_legacy'], methods: ['pay()'], x: 350, y: 190 },
    { id: 'legacy', name: 'LegacyGateway', methods: ['charge_cents(card, cents)'], x: 590, y: 190 },
  ],
  rels: [
    { from: 'checkout', to: 'iface', kind: 'uses', label: 'pay()' },
    { from: 'adapter', to: 'iface', kind: 'implements' },
    { from: 'adapter', to: 'legacy', kind: 'aggregates', label: 'wraps' },
  ],
};

interface In {
  payments: string[];
}

interface Pay {
  dollars: number;
  card: string;
  cents: number;
}

function parse(list: string[]): Pay[] {
  return list.map((raw) => {
    const [amount, card] = raw.split(':').map((s) => s.trim());
    const dollars = Number(amount);
    if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount) || dollars <= 0 || !card || !/^\d{4,}$/.test(card)) {
      throw new Error(`Cannot read "${raw}". Use amount:card such as 19.99:4242 (positive amount with at most 2 decimals, card of 4 or more digits)`);
    }
    return { dollars, card, cents: Math.round(dollars * 100) };
  });
}

type Outcome = { ok: true; id: string } | { ok: false; reason: string };

function legacyCharge(card: string, cents: number, success: number): string {
  if (card.endsWith('0000')) return 'ERR|05';
  if (cents > 100000) return 'ERR|51';
  return `OK|TX${9001 + success}`;
}

function simulate(input: In) {
  const pays = parse(input.payments);
  const beats: Beat[] = [];
  const results: Outcome[] = [];
  let successes = 0;
  beats.push({ at: 'adapter', caption: 'The app speaks dollars and objects; the vendor speaks cents and strings', state: { adapted_calls: 0, successes: 0 }, stateTitle: 'Adapter' });
  pays.forEach((p, i) => {
    beats.push({ at: 'pay', caption: `Checkout calls pay(${p.dollars}, "${p.card}") on the PaymentProcessor interface`, tones: { checkout: 'active', adapter: 'compare' }, edgeTones: { 'checkout>iface': 'path' }, msg: { from: 'Checkout', to: 'Adapter', label: `pay(${p.dollars}, "${p.card}")` }, state: { adapted_calls: i, successes }, stateTitle: 'Adapter' });
    beats.push({ at: 'convert', caption: `Convert: round(${p.dollars} * 100) = ${p.cents} cents`, tones: { adapter: 'active' }, state: { adapted_calls: i, successes }, stateTitle: 'Adapter', log: { text: `${p.dollars} dollars -> ${p.cents} cents` }, vars: { cents: p.cents } });
    const raw = legacyCharge(p.card, p.cents, successes);
    beats.push({ at: 'delegate', caption: `Call charge_cents("${p.card}", ${p.cents}): note the swapped argument order`, tones: { adapter: 'active', legacy: 'compare' }, edgeTones: { 'adapter>legacy': 'path' }, msg: { from: 'Adapter', to: 'Legacy', label: `charge_cents("${p.card}", ${p.cents})` }, state: { adapted_calls: i, successes }, stateTitle: 'Adapter' });
    const [status, codeText] = raw.split('|');
    beats.push({ at: 'raw', caption: `Legacy answers with the string "${raw}"`, tones: { legacy: status === 'OK' ? 'found' : 'error' }, msg: { from: 'Legacy', to: 'Adapter', label: raw, tone: status === 'OK' ? 'found' : 'error', dashed: true }, state: { adapted_calls: i, successes }, stateTitle: 'Adapter', log: { text: `legacy: ${raw}`, tone: status === 'OK' ? 'found' : 'error' } });
    let out: Outcome;
    if (status === 'OK') {
      successes += 1;
      out = { ok: true, id: codeText };
      beats.push({ at: 'ok', caption: `Translate to {"ok": True, "id": "${codeText}"}`, tones: { adapter: 'active', checkout: 'found' }, msg: { from: 'Adapter', to: 'Checkout', label: `{ok: True, id: ${codeText}}`, tone: 'found', dashed: true }, state: { adapted_calls: i + 1, successes }, stateTitle: 'Adapter' });
    } else {
      const reason = REASONS[codeText] ?? 'unknown';
      out = { ok: false, reason };
      beats.push({ at: 'fail', caption: `Translate error ${codeText} to {"ok": False, "reason": "${reason}"}`, tones: { adapter: 'active', checkout: 'error' }, msg: { from: 'Adapter', to: 'Checkout', label: `{ok: False, ${reason}}`, tone: 'error', dashed: true }, state: { adapted_calls: i + 1, successes }, stateTitle: 'Adapter' });
    }
    results.push(out);
  });
  return { beats, result: results };
}

function reference(input: In): Outcome[] {
  let n = 0;
  return parse(input.payments).map((p) => {
    if (p.card.slice(-4) === '0000') return { ok: false, reason: REASONS['05'] };
    if (p.cents > 100000) return { ok: false, reason: REASONS['51'] };
    n += 1;
    return { ok: true, id: 'TX' + (9000 + n) };
  });
}

const viz = scenarioViz<In, Outcome[]>({
  id: 'pattern-adapter',
  title: 'Adapter: make a legacy payment API fit',
  code,
  design,
  diagramTitle: 'Participants',
  size: { width: 700, height: 290 },
  actors: ['Checkout', 'Adapter', 'Legacy'],
  logTitle: 'Translation',
  inputs: [{ key: 'payments', label: 'Payments (dollars:card)', kind: 'strings', default: ['19.99:4242', '1500.00:4242', '5.00:1110000'], maxItems: 4, help: 'Legacy declines cards ending 0000 (05) and amounts over $1000.00 (51).' }],
  presets: [
    { label: 'Float rounding', input: { payments: ['0.29:4242', '19.99:4242'] } },
    { label: 'Declines', input: { payments: ['2000.00:4242', '10.00:5550000'] } },
    { label: 'Two successes', input: { payments: ['5.00:4242', '6.00:4242'] } },
  ],
  simulate,
  reference,
});

const LEGACY_HARNESS =
  `
class LegacyGateway:
    def __init__(self):
        self.calls = []
        self.ok = 0
    def charge_cents(self, card, cents):
        self.calls.append([card, cents])
        if card.endswith('0000'):
            return 'ERR|05'
        if cents > 100000:
            return 'ERR|51'
        self.ok += 1
        return 'OK|TX' + str(9000 + self.ok)

def run_payments(cls, payments):
    legacy = LegacyGateway()
    adapter = cls(legacy)
    out = [adapter.pay(d, c) for d, c in payments]
    return [out, legacy.calls]
` + RUN_SAFE_FN;

const unit: Unit = {
  id: 'pattern-adapter',
  hook: 'Adapters are how you integrate a third-party or legacy API without letting its quirks spread. Interviewers like the unit-conversion and error-translation details that live at the boundary.',
  predict: {
    prompt: 'The app calls `pay(19.99, card)` and the adapter computes cents with `int(19.99 * 100)`. What reaches the legacy gateway?',
    options: ['1999 cents', '1998 cents, because 19.99 * 100 is 1998.9999999999998 in floating point', '19.99 cents', 'A TypeError'],
    answer: 1,
    explain: '`int()` truncates the floating-point result. Use `round(dollars * 100)` (or work in `Decimal` / integer cents from the start) when converting money at an adapter boundary.',
  },
  viz,
  deeper: {
    points: [
      'Intent: **convert the interface of an existing class into the one clients expect**. The adapter implements the target interface and holds the adaptee (composition).',
      'Put every translation in the adapter: argument order, units, names, data formats, and error codes to domain exceptions or result objects. The rest of the app never learns the legacy shape.',
      'Object adapter (wrap an instance, shown here) is preferred in Python over class adapter (multiple inheritance from the adaptee).',
      'Adapter changes an interface to be compatible; **decorator** keeps the interface and adds behaviour; **facade** simplifies a whole subsystem behind a new interface.',
      'Adapters make fakes easy: a `FakeProcessor` implementing the same target interface lets you test checkout without the vendor.',
    ],
    pitfalls: ['Truncating instead of rounding when converting money', 'Leaking vendor error codes into business code', 'An adapter that also adds business rules, so it is no longer a thin translation layer'],
  },
  practice: {
    language: 'python',
    fnName: 'PaymentAdapter',
    statement:
      'The harness provides `LegacyGateway.charge_cents(card, cents)` which returns `"OK|TX9001"` or `"ERR|51"` (insufficient funds) / `"ERR|05"` (card declined). Write `PaymentAdapter(legacy)` with `pay(dollars, card)` that converts to integer cents (rounded), calls the gateway, and returns `{"ok": True, "id": <tx id>}` or `{"ok": False, "reason": <name>}` with reasons `insufficient_funds`, `card_declined` and `unknown` for other codes.',
    signature: 'class PaymentAdapter:',
    harness: LEGACY_HARNESS,
    adapter: 'run_payments',
    solution: `class PaymentAdapter:
    REASONS = {'51': 'insufficient_funds', '05': 'card_declined'}

    def __init__(self, legacy):
        self._legacy = legacy

    def pay(self, dollars, card):
        cents = @@round(dollars * 100)@@
        raw = self._legacy.charge_cents(@@card, cents@@)
        status, code = raw.split('|')
        if status == 'OK':
            return {'ok': True, 'id': code}
        return {'ok': False, 'reason': @@self.REASONS.get(code, 'unknown')@@}`,
    tests: [
      { args: [[[19.99, '4242'], [5, '4242']]], expected: [[{ ok: true, id: 'TX9001' }, { ok: true, id: 'TX9002' }], [['4242', 1999], ['4242', 500]]], name: 'success and conversion' },
      { args: [[[2000, '4242']]], expected: [[{ ok: false, reason: 'insufficient_funds' }], [['4242', 200000]]], name: 'insufficient funds' },
      { args: [[[10, '5550000']]], expected: [[{ ok: false, reason: 'card_declined' }], [['5550000', 1000]]], name: 'card declined' },
      { args: [[[0.29, '1234']]], expected: [[{ ok: true, id: 'TX9001' }], [['1234', 29]]], name: 'floating point rounding' },
      { args: [[]], expected: [[], []], name: 'no payments' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'PaymentAdapter',
    statement: 'Customers are occasionally charged one cent too little (for example $19.99 arrives at the gateway as 1998 cents). Fix the conversion in the adapter.',
    harness: LEGACY_HARNESS,
    adapter: 'run_payments',
    buggy: `class PaymentAdapter:
    REASONS = {'51': 'insufficient_funds', '05': 'card_declined'}

    def __init__(self, legacy):
        self._legacy = legacy

    def pay(self, dollars, card):
        cents = int(dollars * 100)
        raw = self._legacy.charge_cents(card, cents)
        status, code = raw.split('|')
        if status == 'OK':
            return {'ok': True, 'id': code}
        return {'ok': False, 'reason': self.REASONS.get(code, 'unknown')}`,
    fixed: `class PaymentAdapter:
    REASONS = {'51': 'insufficient_funds', '05': 'card_declined'}

    def __init__(self, legacy):
        self._legacy = legacy

    def pay(self, dollars, card):
        cents = round(dollars * 100)
        raw = self._legacy.charge_cents(card, cents)
        status, code = raw.split('|')
        if status == 'OK':
            return {'ok': True, 'id': code}
        return {'ok': False, 'reason': self.REASONS.get(code, 'unknown')}`,
    tests: [
      { args: [[[19.99, '4242']]], expected: [[{ ok: true, id: 'TX9001' }], [['4242', 1999]]], name: '19.99 is 1999 cents' },
      { args: [[[0.29, '4242'], [1.1, '4242']]], expected: [[{ ok: true, id: 'TX9001' }, { ok: true, id: 'TX9002' }], [['4242', 29], ['4242', 110]]], name: 'other awkward floats' },
      { args: [[[10, '5550000']]], expected: [[{ ok: false, reason: 'card_declined' }], [['5550000', 1000]]], name: 'errors still translated' },
    ],
    bugType: 'float truncation',
    hint: 'Print `19.99 * 100` in Python. Which function turns that into an integer?',
    explanation: '`19.99 * 100` is `1998.9999999999998`, and `int()` truncates toward zero. `round()` gives the intended 1999. Money at a boundary should be rounded (or kept in integer cents).',
  },
  boss: {
    title: 'One storage interface, two vendors',
    statement:
      'Two storage backends have incompatible APIs. `LegacyKV` has `store(key, value)`, `fetch(key)` (returns `""` for a missing key) and `list_keys()` (returns one string like `"a;b"`, `""` when empty). `ObjectStore` has `put_object(key, body)`, `get_object(key)` (raises `KeyError` when missing) and `list_objects()` (returns `{"Contents": [{"Key": k}, ...]}`, without the `Contents` entry when empty). Write `make_storage(backend)` returning an adapter with `put(key, value)` (returns None), `get(key)` (the value, or `None` if missing) and `keys()` (sorted list), choosing the adapter by the backend class.',
    language: 'python',
    fnName: 'make_storage',
    harness: `
class LegacyKV:
    def __init__(self):
        self._d = {}
    def store(self, key, value):
        self._d[key] = value
    def fetch(self, key):
        return self._d.get(key, '')
    def list_keys(self):
        return ';'.join(self._d)

class ObjectStore:
    def __init__(self):
        self._d = {}
    def put_object(self, key, body):
        self._d[key] = body
    def get_object(self, key):
        return {'Body': self._d[key]}
    def list_objects(self):
        if not self._d:
            return {}
        return {'Contents': [{'Key': k} for k in self._d]}

def run_storage(fn, kind, steps):
    backend = LegacyKV() if kind == 'kv' else ObjectStore()
    st = fn(backend)
    out = []
    for name, *args in steps:
        out.append(getattr(st, name)(*args))
    return out
`,
    adapter: 'run_storage',
    starter: `def make_storage(backend):
    pass
`,
    solution: `class KVAdapter:
    def __init__(self, kv):
        self._kv = kv

    def put(self, key, value):
        self._kv.store(key, value)

    def get(self, key):
        value = self._kv.fetch(key)
        return value if value != '' else None

    def keys(self):
        raw = self._kv.list_keys()
        return sorted(raw.split(';')) if raw else []

class ObjectAdapter:
    def __init__(self, store):
        self._store = store

    def put(self, key, value):
        self._store.put_object(key, value)

    def get(self, key):
        try:
            return self._store.get_object(key)['Body']
        except KeyError:
            return None

    def keys(self):
        listing = self._store.list_objects()
        return sorted(item['Key'] for item in listing.get('Contents', []))

def make_storage(backend):
    if isinstance(backend, LegacyKV):
        return KVAdapter(backend)
    return ObjectAdapter(backend)`,
    tests: [
      { args: ['kv', [['put', 'b', 'two'], ['put', 'a', 'one'], ['get', 'a'], ['get', 'zz'], ['keys']]], expected: [null, null, 'one', null, ['a', 'b']], name: 'legacy key-value store' },
      { args: ['obj', [['put', 'b', 'two'], ['put', 'a', 'one'], ['get', 'a'], ['get', 'zz'], ['keys']]], expected: [null, null, 'one', null, ['a', 'b']], name: 'object store behaves identically' },
      { args: ['kv', [['keys'], ['get', 'x']]], expected: [[], null], name: 'empty legacy store' },
      { args: ['obj', [['keys'], ['get', 'x']]], expected: [[], null], name: 'empty object store' },
      { args: ['obj', [['put', 'k', 'v1'], ['put', 'k', 'v2'], ['get', 'k'], ['keys']]], expected: [null, null, 'v2', ['k']], name: 'overwrite' },
    ],
    hints: ['Write one small adapter class per backend, each with put/get/keys. The legacy one must translate "" to None and "a;b" to a list; the object store one must catch KeyError and handle the missing Contents entry.', 'make_storage just picks the adapter with isinstance(backend, LegacyKV). Return sorted(...) in both keys() methods.'],
    combines: ['pattern-factory'],
  },
  quiz: [
    {
      prompt: 'How does an adapter differ from a decorator?',
      options: ['An adapter changes the interface to match what the client expects; a decorator keeps the same interface and adds behaviour', 'They are the same pattern with different names', 'A decorator changes the interface; an adapter does not', 'An adapter can only wrap functions'],
      answer: 0,
      explain: 'Adapters bridge incompatible interfaces. Decorators are interface-preserving wrappers.',
    },
  ],
};

export default unit;
