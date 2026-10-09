import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';
import { ops } from '@/content/lib/sysdesign-hld-1';

const code = `
class VendingMachine:
    def __init__(self, stock):
        self.stock = {c: list(v) for c, v in stock.items()}   #@init
        self.balance = 0
        self.state = 'idle'

    def insert(self, coin):
        self.balance += coin                          #@insert
        self.state = 'has_money'
        return self.balance

    def select(self, code):
        if self.state != 'has_money':                 #@guard
            return ['insert_coin', 0]
        if code not in self.stock:                    #@known
            return ['invalid', 0]
        if self.stock[code][1] == 0:                  #@stock
            return ['sold_out', 0]
        price = self.stock[code][0]
        if self.balance < price:                      #@funds
            return ['need', price - self.balance]
        self.stock[code][1] -= 1                      #@dispense
        change = self.balance - price                 #@change
        self.balance, self.state = 0, 'idle'
        return ['ok', change]

    def refund(self):
        amount, self.balance = self.balance, 0        #@refund
        self.state = 'idle'
        return amount
`;

const STOCK: Record<string, [number, number]> = { A1: [150, 1], B2: [75, 2], C3: [100, 0] };
const COINS = [5, 10, 25, 100];

type Ev = { kind: 'coin'; v: number } | { kind: 'select'; code: string } | { kind: 'refund' };
interface In {
  events: string[];
}

function parseEvents(list: string[]): Ev[] {
  return list.map((raw) => {
    const [k, a] = raw.split(':').map((x) => x.trim());
    const kind = k.toLowerCase();
    if (kind === 'coin' && a !== undefined && COINS.includes(Number(a))) return { kind: 'coin', v: Number(a) };
    if (kind === 'select' && a) return { kind: 'select', code: a.toUpperCase() };
    if (kind === 'refund' && a === undefined) return { kind: 'refund' };
    throw new Error(`Cannot read "${raw}". Use coin:5|10|25|100, select:A1 (A1, B2, C3) or refund`);
  });
}

const money = (c: number) => `${(c / 100).toFixed(2)}`;

const viz: VizDef<In> = {
  id: 'lld-vending-machine',
  title: 'Vending machine: a small state machine',
  code,
  language: 'python',
  inputs: [{ key: 'events', label: 'Events', kind: 'strings', default: ['select:B2', 'coin:100', 'select:A1', 'coin:100', 'select:A1', 'coin:100', 'refund'], maxItems: 12, help: 'coin:100, select:A1, refund (items: A1 1.50, B2 0.75, C3 sold out)' }],
  presets: [
    { label: 'Change is returned', input: { events: ['select:B2', 'coin:100', 'select:A1', 'coin:100', 'select:A1', 'coin:100', 'refund'] } },
    { label: 'Sold out and refund', input: { events: ['coin:100', 'select:C3', 'select:Z9', 'refund', 'refund'] } },
    { label: 'Exact money', input: { events: ['coin:25', 'coin:25', 'coin:25', 'select:B2', 'select:B2'] } },
  ],
  run(input) {
    const events = parseEvents(input.events);
    const r = new Recorder(code);
    const stock: Record<string, [number, number]> = structuredClone(STOCK);
    let balance = 0;
    let state: 'idle' | 'has_money' = 'idle';
    const log: { text: string; tone?: Tone }[] = [];
    const results: (number | [string, number])[] = [];
    const view = (edge: string | null = null, tone: Tone = 'path'): Panel[] => [
      {
        type: 'graph',
        title: 'State machine',
        width: 360,
        height: 140,
        nodes: [
          { id: 'idle', label: 'IDLE', x: 70, y: 70, shape: 'pill', w: 80, h: 36, tone: state === 'idle' ? 'active' : 'muted' },
          { id: 'has_money', label: 'HAS_MONEY', x: 280, y: 70, shape: 'pill', w: 110, h: 36, tone: state === 'has_money' ? 'active' : 'muted' },
        ],
        edges: [
          { from: 'idle', to: 'has_money', label: 'coin', directed: true, curve: 0, tone: edge === 'in' ? tone : undefined },
          { from: 'has_money', to: 'idle', label: 'dispense / refund', directed: true, curve: 34, tone: edge === 'out' ? tone : undefined },
          { from: 'has_money', to: 'has_money', label: 'coin / rejected select', directed: true, tone: edge === 'stay' ? tone : undefined },
        ],
      },
      kvPanel('Machine', {
        balance: money(balance),
        'A1 $1.50': `${stock.A1[1]} left`,
        'B2 $0.75': `${stock.B2[1]} left`,
        'C3 $1.00': `${stock.C3[1]} left`,
      }),
      logPanel('Events', log),
    ];
    r.step('init', 'Machine is IDLE with no credit', view(), { state, balance });
    for (const ev of events) {
      r.op();
      if (ev.kind === 'coin') {
        const was = state;
        balance += ev.v;
        state = 'has_money';
        log.push({ text: `coin ${money(ev.v)} -> balance ${money(balance)}`, tone: 'compare' });
        r.step('insert', `Coin ${money(ev.v)} added: balance ${money(balance)}${was === 'idle' ? ', now HAS_MONEY' : ''}`, view(was === 'idle' ? 'in' : 'stay'), { state, balance });
        results.push(balance);
        continue;
      }
      if (ev.kind === 'refund') {
        const amount = balance;
        balance = 0;
        const was = state;
        state = 'idle';
        log.push({ text: `refund ${money(amount)}`, tone: amount ? 'found' : 'muted' });
        r.step('refund', amount ? `Refund ${money(amount)} and go back to IDLE` : 'Nothing to refund', view(was === 'has_money' ? 'out' : null), { state, refunded: amount });
        results.push(amount);
        continue;
      }
      if (state !== 'has_money') {
        log.push({ text: `select ${ev.code}: insert coins first`, tone: 'error' });
        r.step('guard', `select ${ev.code} while IDLE: ask for a coin first`, view(), { state });
        results.push(['insert_coin', 0]);
        continue;
      }
      const item = stock[ev.code];
      if (!item) {
        log.push({ text: `select ${ev.code}: invalid`, tone: 'error' });
        r.step('known', `No slot ${ev.code}: invalid, keep the credit`, view('stay', 'error'), { state, balance });
        results.push(['invalid', 0]);
        continue;
      }
      if (item[1] === 0) {
        log.push({ text: `select ${ev.code}: sold out`, tone: 'error' });
        r.step('stock', `${ev.code} is sold out: keep the credit ${money(balance)}`, view('stay', 'error'), { state, balance });
        results.push(['sold_out', 0]);
        continue;
      }
      if (balance < item[0]) {
        log.push({ text: `select ${ev.code}: need ${money(item[0] - balance)} more`, tone: 'error' });
        r.step('funds', `${money(balance)} < ${money(item[0])}: need ${money(item[0] - balance)} more`, view('stay', 'error'), { state, balance });
        results.push(['need', item[0] - balance]);
        continue;
      }
      item[1] -= 1;
      r.step('dispense', `${money(balance)} >= ${money(item[0])}: dispense ${ev.code}`, view('out', 'found'), { state, balance });
      const change = balance - item[0];
      balance = 0;
      state = 'idle';
      log.push({ text: `dispensed ${ev.code}, change ${money(change)}`, tone: 'found' });
      r.step('change', change ? `Return change ${money(change)} and go back to IDLE` : 'Exact money: no change, back to IDLE', view('out', 'found'), { state, change });
      results.push(['ok', change]);
    }
    r.step('init', `Finished in state ${state.toUpperCase()}, credit ${money(balance)}`, view(), { state, balance });
    return { frames: r.frames, result: results };
  },
  reference(input) {
    // Independent model: credit is a number, "idle" simply means credit === 0 and no coin since the last sale.
    const left: Record<string, number> = { A1: 1, B2: 2, C3: 0 };
    const price: Record<string, number> = { A1: 150, B2: 75, C3: 100 };
    let credit = 0;
    let active = false;
    return parseEvents(input.events).map((ev): number | [string, number] => {
      if (ev.kind === 'coin') {
        credit += ev.v;
        active = true;
        return credit;
      }
      if (ev.kind === 'refund') {
        const out = credit;
        credit = 0;
        active = false;
        return out;
      }
      if (!active) return ['insert_coin', 0];
      if (!(ev.code in price)) return ['invalid', 0];
      if (left[ev.code] <= 0) return ['sold_out', 0];
      if (credit < price[ev.code]) return ['need', price[ev.code] - credit];
      left[ev.code]--;
      const change = credit - price[ev.code];
      credit = 0;
      active = false;
      return ['ok', change];
    });
  },
};

const unit: Unit = {
  id: 'lld-vending-machine',
  hook: 'The vending machine is the classic **state machine** exercise. Interviewers look for explicit states, guard checks before every action, and correct handling of change and refunds.',
  predict: {
    prompt: 'A customer inserts $1.00 and selects an item that costs $0.75. What must the machine do?',
    options: ['Dispense and keep the extra $0.25 as a tip', 'Dispense, return $0.25 change and go back to idle', 'Refuse: the amount is not exact', 'Dispense and leave $0.25 as credit for the next customer'],
    answer: 1,
    explain: 'A successful sale consumes the price, returns the rest as change, clears the balance and returns to the idle state. Leaving credit behind lets the next person steal it.',
  },
  viz,
  deeper: {
    points: [
      'Name the states (`IDLE`, `HAS_MONEY`, later `DISPENSING`, `OUT_OF_SERVICE`) and decide which events are legal in each. Illegal events return a message, they do not crash.',
      'Guard order matters: state check, then item exists, then in stock, then enough money. Only then change anything.',
      'Failed selections keep the credit so the customer can pick something else or ask for a refund.',
      'Change-making can fail when coin stock is limited, which is a coin-change problem (see the boss task).',
      'With many states the State pattern replaces `if state == ...` chains with one class per state.',
    ],
    complexity: { time: 'O(1) per event', space: 'O(items)' },
    pitfalls: ['Dispensing without returning change', 'Decrementing stock before verifying funds', 'Forgetting to reset the balance after a sale', 'Allowing a select before any coin was inserted'],
  },
  practice: {
    language: 'python',
    fnName: 'VendingMachine',
    statement: 'Implement `VendingMachine(stock)` where stock maps a code to `[price, quantity]`. `insert(coin)` adds credit and returns the balance. `select(code)` returns `["insert_coin", 0]` if no coin was inserted, `["invalid", 0]` for an unknown code, `["sold_out", 0]` if quantity is 0, `["need", shortfall]` if credit is too low (credit is kept), otherwise dispenses, clears the credit and returns `["ok", change]`. `refund()` returns the credit and clears it.',
    signature: 'class VendingMachine:',
    solution: `class VendingMachine:
    def __init__(self, stock):
        self.stock = {c: list(v) for c, v in stock.items()}
        self.balance = 0
        self.state = 'idle'

    def insert(self, coin):
        self.balance @@+=@@ coin
        self.state = 'has_money'
        return self.balance

    def select(self, code):
        if self.state != 'has_money':
            return ['insert_coin', 0]
        if code not in self.stock:
            return ['invalid', 0]
        if self.stock[code][1] == 0:
            return ['sold_out', 0]
        price = self.stock[code][0]
        if self.balance @@<@@ price:
            return ['need', price - self.balance]
        self.stock[code][1] -= 1
        change = @@self.balance - price@@
        self.balance, self.state = @@0@@, 'idle'
        return ['ok', change]

    def refund(self):
        amount, self.balance = self.balance, 0
        self.state = 'idle'
        return amount`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('VendingMachine', 'insert', 'select', 'insert', 'select', 'select'), [[{ A: [150, 1] }], [100], ['A'], [100], ['A'], ['A']]], expected: [null, 100, ['need', 50], 200, ['ok', 50], ['insert_coin', 0]], name: 'top up, buy, then idle' },
      { args: [ops('VendingMachine', 'insert', 'select', 'insert', 'select', 'refund'), [[{ A: [100, 1] }], [100], ['A'], [100], ['A'], []]], expected: [null, 100, ['ok', 0], 100, ['sold_out', 0], 100], name: 'sold out keeps the credit' },
      { args: [ops('VendingMachine', 'insert', 'insert', 'refund', 'refund'), [[{ A: [100, 1] }], [25], [10], [], []]], expected: [null, 25, 35, 35, 0], name: 'refund returns everything once' },
      { args: [ops('VendingMachine', 'insert', 'select'), [[{ A: [100, 1] }], [100], ['Z']]], expected: [null, 100, ['invalid', 0]], name: 'unknown code' },
      { args: [ops('VendingMachine', 'insert', 'select', 'select'), [[{ B: [75, 3] }], [100], ['B'], ['B']]], expected: [null, 100, ['ok', 25], ['insert_coin', 0]], name: 'change is returned and credit cleared' },
      { args: [ops('VendingMachine', 'insert', 'insert', 'select', 'insert', 'select'), [[{ B: [75, 3] }], [25], [25], ['B'], [25], ['B']]], expected: [null, 25, 50, ['need', 25], 75, ['ok', 0]], name: 'credit accumulates' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'VendingMachine',
    statement: 'Customers who pay with a bigger coin never get their change back, and the leftover credit is sold to the next person. Fix the sale.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class VendingMachine:
    def __init__(self, stock):
        self.stock = {c: list(v) for c, v in stock.items()}
        self.balance = 0
        self.state = 'idle'

    def insert(self, coin):
        self.balance += coin
        self.state = 'has_money'
        return self.balance

    def select(self, code):
        if self.state != 'has_money':
            return ['insert_coin', 0]
        if code not in self.stock:
            return ['invalid', 0]
        if self.stock[code][1] == 0:
            return ['sold_out', 0]
        price = self.stock[code][0]
        if self.balance < price:
            return ['need', price - self.balance]
        self.stock[code][1] -= 1
        self.balance -= price
        return ['ok', 0]

    def refund(self):
        amount, self.balance = self.balance, 0
        self.state = 'idle'
        return amount`,
    fixed: `class VendingMachine:
    def __init__(self, stock):
        self.stock = {c: list(v) for c, v in stock.items()}
        self.balance = 0
        self.state = 'idle'

    def insert(self, coin):
        self.balance += coin
        self.state = 'has_money'
        return self.balance

    def select(self, code):
        if self.state != 'has_money':
            return ['insert_coin', 0]
        if code not in self.stock:
            return ['invalid', 0]
        if self.stock[code][1] == 0:
            return ['sold_out', 0]
        price = self.stock[code][0]
        if self.balance < price:
            return ['need', price - self.balance]
        self.stock[code][1] -= 1
        change = self.balance - price
        self.balance, self.state = 0, 'idle'
        return ['ok', change]

    def refund(self):
        amount, self.balance = self.balance, 0
        self.state = 'idle'
        return amount`,
    tests: [
      { args: [ops('VendingMachine', 'insert', 'select'), [[{ B: [75, 3] }], [100], ['B']]], expected: [null, 100, ['ok', 25]], name: 'change is returned' },
      { args: [ops('VendingMachine', 'insert', 'select', 'select'), [[{ B: [75, 3] }], [100], ['B'], ['B']]], expected: [null, 100, ['ok', 25], ['insert_coin', 0]], name: 'credit is cleared after a sale' },
      { args: [ops('VendingMachine', 'insert', 'select', 'refund'), [[{ B: [75, 3] }], [75], ['B'], []]], expected: [null, 75, ['ok', 0], 0], name: 'exact money' },
    ],
    bugType: 'missing change / state reset',
    hint: 'After a successful sale, what are the machine\'s balance and state? What did the caller receive?',
    explanation: 'The sale subtracts the price but reports change 0 and leaves the remaining credit (and the HAS_MONEY state) in the machine. Compute `change = balance - price`, return it, then reset the balance to 0 and the state to idle.',
  },
  boss: {
    title: 'Making change from a limited coin box',
    statement:
      'Write `make_change(amount, stock)` where `stock` maps a coin value (as a string key such as "25") to how many of that coin the machine holds. Return the coins to hand back as a list sorted from largest to smallest, using the FEWEST coins possible, or `None` if the amount cannot be made. An amount of 0 returns `[]`. A greedy approach is not enough when a needed small coin is missing.',
    language: 'python',
    fnName: 'make_change',
    starter: `def make_change(amount, stock):
    pass
`,
    solution: `def make_change(amount, stock):
    coins = sorted((int(c) for c in stock), reverse=True)
    best = None

    def go(i, left, used):
        nonlocal best
        if best is not None and len(used) >= len(best) and left > 0:
            return
        if left == 0:
            if best is None or len(used) < len(best):
                best = list(used)
            return
        if i == len(coins):
            return
        c = coins[i]
        for k in range(min(stock[str(c)], left // c), -1, -1):
            go(i + 1, left - k * c, used + [c] * k)

    go(0, amount, [])
    return best`,
    tests: [
      { args: [30, { '25': 1, '10': 3, '5': 0 }], expected: [10, 10, 10], name: 'greedy fails, backtrack' },
      { args: [40, { '25': 2, '10': 5, '5': 5 }], expected: [25, 10, 5], name: 'fewest coins' },
      { args: [7, { '25': 2, '10': 2, '5': 1 }], expected: null, name: 'impossible amount' },
      { args: [0, { '25': 1 }], expected: [], name: 'zero needs no coins' },
      { args: [55, { '25': 1, '10': 2, '5': 2 }], expected: [25, 10, 10, 5, 5], name: 'uses the whole box' },
      { args: [30, { '25': 1, '10': 0, '5': 10 }], expected: [25, 5], name: 'ignores empty denominations' },
    ],
    hints: ['Try denominations from largest to smallest; for each, try using as many as possible, then fewer (down to zero) and recurse on the rest.', 'Keep the best (shortest) answer found so far; when `left == 0` compare lengths. Respect `stock[coin]` as the maximum count.'],
    combines: ['dp-coin-change'],
  },
};


export default unit;
