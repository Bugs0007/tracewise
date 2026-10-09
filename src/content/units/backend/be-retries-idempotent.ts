import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
def handle(msg, state, dedupe=True):
    if dedupe and msg["id"] in state["seen"]:                #@check
        return "ack"                                          #@skip
    state["balance"] += msg["amount"]                        #@apply
    state["seen"].add(msg["id"])                             #@mark
    return "ack"                                              #@ack

def retry_delay(attempt, base=1, cap=4):
    return min(cap, base * 2 ** (attempt - 1))               #@backoff
`;

const MODES = ['dedupe by id', 'no dedupe'];
const BASE = 1;
const CAP = 4;

interface In {
  deliveries: string[];
  mode: string;
  flaky: number;
}

interface Msg {
  id: string;
  amount: number;
}

function parse(raw: string[]): Msg[] {
  const out: Msg[] = [];
  for (const s of raw) {
    const [id, a] = s.split(':').map((x) => x.trim());
    const amount = Number(a);
    if (id && Number.isFinite(amount)) out.push({ id, amount });
  }
  return out.slice(0, 8);
}

const clampFlaky = (n: number) => Math.max(0, Math.min(5, Math.round(n) || 0));
const delayFor = (attempt: number) => Math.min(CAP, BASE * 2 ** (attempt - 1));

const viz: VizDef<In> = {
  id: 'be-retries-idempotent',
  title: 'At-least-once delivery and an idempotent consumer',
  code,
  language: 'python',
  inputs: [
    { key: 'deliveries', label: 'Deliveries (id:amount)', kind: 'strings', default: ['m1:50', 'm2:20', 'm1:50', 'm3:10', 'm2:20'], maxItems: 8, help: 'Repeated ids are duplicates from lost acks' },
    { key: 'mode', label: 'Consumer', kind: 'select', default: MODES[0], options: MODES },
    { key: 'flaky', label: 'Crashes before m2 succeeds', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Dedupe', input: { deliveries: ['m1:50', 'm2:20', 'm1:50', 'm3:10', 'm2:20'], mode: MODES[0], flaky: 2 } },
    { label: 'No dedupe', input: { deliveries: ['m1:50', 'm2:20', 'm1:50', 'm3:10', 'm2:20'], mode: MODES[1], flaky: 0 } },
    { label: 'Long outage', input: { deliveries: ['m1:5', 'm2:7'], mode: MODES[0], flaky: 5 } },
  ],
  run(input) {
    const r = new Recorder(code);
    const dedupe = input.mode !== MODES[1];
    const pending = parse(input.deliveries);
    let flakyLeft = clampFlaky(input.flaky);
    let crashes = 0;
    let balance = 0;
    let clock = 0;
    const seen: string[] = [];
    const applied: string[] = [];
    const delays: number[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const total = pending.length;
    let done = 0;
    const view = (cur?: Msg): Panel[] => [
      {
        type: 'list',
        title: 'Broker: still to deliver',
        orientation: 'horizontal',
        items: [...(cur ? [{ id: 'cur', label: `${cur.id}`, sub: `+${cur.amount}`, tone: 'active' as Tone }] : []), ...pending.map((m, i) => ({ id: `p${i}`, label: m.id, sub: `+${m.amount}`, tone: 'frontier' as Tone }))],
        startLabel: 'next',
        emptyText: 'queue empty',
      },
      kvPanel('Consumer state', { balance, seen: seen.length ? seen.join(', ') : '(none)', clock: `${clock}s` }),
      ...(delays.length
        ? [{ type: 'chart' as const, title: 'Retry delays (doubling, capped)', kind: 'bar' as const, xLabel: 'failure #', yLabel: 'wait (s)', series: [{ label: 'delay', points: delays.map((d, i) => [i + 1, d] as [number, number]), tone: 'swap' as Tone }] }]
        : []),
      logPanel('Consumer log', log),
    ];
    r.step('check', `${total} deliveries are coming. ${dedupe ? 'The consumer remembers ids it finished' : 'This consumer keeps no memory of ids'}`, view(), { balance });
    while (pending.length) {
      const msg = pending.shift()!;
      r.op();
      clock += 1;
      const known = seen.includes(msg.id);
      r.step('check', dedupe ? `Delivery ${msg.id} (+${msg.amount}): seen before? ${known ? 'yes' : 'no'}` : `Delivery ${msg.id} (+${msg.amount}): no dedupe configured`, view(msg), { id: msg.id, seen: known });
      if (dedupe && known) {
        log.push({ text: `${msg.id} duplicate: acked, ignored`, tone: 'muted' });
        r.step('skip', `${msg.id} was already processed: ack it and do nothing`, view(), { balance });
        done++;
        continue;
      }
      if (msg.id === 'm2' && flakyLeft > 0) {
        flakyLeft--;
        crashes++;
        const wait = delayFor(crashes);
        delays.push(wait);
        log.push({ text: `${msg.id} crashed (attempt ${crashes}); retry in ${wait}s`, tone: 'error' });
        r.step('apply', `${msg.id} crashes before any effect, so no ack and nothing is remembered`, view(msg), { balance });
        clock += wait;
        r.step('backoff', `Wait min(cap, base * 2^${crashes - 1}) = ${wait}s, then the broker redelivers ${msg.id}`, view(msg), { attempt: crashes, wait });
        pending.unshift(msg);
        continue;
      }
      balance += msg.amount;
      applied.push(msg.id);
      r.step('apply', `Apply +${msg.amount}: balance = ${balance}`, view(msg), { balance });
      if (!seen.includes(msg.id)) seen.push(msg.id);
      r.step('mark', `Only now remember ${msg.id}: the effect and the record agree`, view(msg), { balance });
      log.push({ text: `${msg.id} processed`, tone: 'found' });
      r.step('ack', `Ack ${msg.id} to the broker`, view(), { balance });
      done++;
    }
    r.step('ack', `All ${done} deliveries handled. Final balance ${balance}`, view(), { balance, applied: applied.length });
    return { frames: r.frames, result: { balance, applied, delays } };
  },
  reference(input) {
    const dedupe = input.mode !== MODES[1];
    const msgs = parse(input.deliveries);
    let flaky = clampFlaky(input.flaky);
    const delays: number[] = [];
    const applied: string[] = [];
    const known = new Set<string>();
    let balance = 0;
    for (const m of msgs) {
      if (dedupe && known.has(m.id)) continue;
      if (m.id === 'm2') {
        while (flaky > 0) {
          flaky--;
          delays.push(delayFor(delays.length + 1));
        }
      }
      balance += m.amount;
      applied.push(m.id);
      known.add(m.id);
    }
    return { balance, applied, delays };
  },
};

const CONSUMER_HARNESS = `
def run_consumer(cls, steps):
    c = cls()
    results = []
    for msg_id, amount, fail in steps:
        try:
            results.append(c.handle(msg_id, amount, fail))
        except RuntimeError:
            results.append("crashed")
    return {"results": results, "balance": c.balance}
`;

const ops = (...names: string[]) => names;

const consumerTests = [
  { args: [[['m1', 50, false], ['m1', 50, false], ['m2', 20, false]]], expected: { results: ['processed', 'duplicate', 'processed'], balance: 70 }, name: 'duplicate is ignored' },
  { args: [[['m1', 30, true], ['m1', 30, false], ['m1', 30, false]]], expected: { results: ['crashed', 'processed', 'duplicate'], balance: 30 }, name: 'crash, redeliver, duplicate' },
  { args: [[]], expected: { results: [], balance: 0 }, name: 'no messages' },
  { args: [[['a', 5, false], ['b', 5, false]]], expected: { results: ['processed', 'processed'], balance: 10 }, name: 'same amount, different ids' },
  { args: [[['z', 9, true]]], expected: { results: ['crashed'], balance: 0 }, name: 'a crash has no effect' },
];

const unit: Unit = {
  id: 'be-retries-idempotent',
  hook: 'Queues deliver at least once, so duplicates and retries are normal, not exceptional. A consumer that is not idempotent double-charges; a retry without backoff takes the whole system down.',
  predict: {
    prompt: 'A consumer adds $50 to a balance, but the ack is lost on the way back to the broker. The broker redelivers the message. With no deduplication, what is the balance impact?',
    options: ['+$50', '+$100', '+$0', 'It depends on the broker\'s delivery mode: exactly-once removes the problem'],
    answer: 1,
    explain: 'The first run succeeded; the redelivery runs the same handler again. True exactly-once delivery across a network is not achievable, so you make the handler idempotent (dedupe by message id) instead.',
  },
  viz,
  deeper: {
    points: [
      '**At-least-once** delivery: the broker redelivers until it sees an ack. Acks can be lost, consumers can crash mid-way, so duplicates will happen.',
      'An **idempotent consumer** records processed message ids and ignores repeats. Prefer a unique constraint on the id so the check is atomic.',
      'Record the id only **after** the effect succeeds (ideally in the same transaction). Recording first loses the message if you crash in between.',
      'Retry with **exponential backoff** (`base * 2^(n-1)`), a **cap** so waits stay bounded, and usually random **jitter** so retries from many clients do not arrive together.',
      'After a maximum number of attempts, send the message to a dead-letter queue instead of retrying forever.',
    ],
    pitfalls: ['Marking a message processed before the work succeeds', 'Retrying immediately in a tight loop (retry storm)', 'Backoff without a cap (waits of hours)', 'Deduplicating on payload instead of a stable message id'],
  },
  practice: {
    language: 'python',
    fnName: 'IdempotentConsumer',
    statement:
      'Implement `IdempotentConsumer` with a `balance` attribute (start 0). `handle(msg_id, amount, fail=False)`: if the id was already processed return "duplicate". If `fail` is True raise `RuntimeError("processing failed")` (the work crashed; nothing may be remembered). Otherwise add `amount` to the balance, remember the id and return "processed".',
    signature: 'class IdempotentConsumer:',
    solution: `class IdempotentConsumer:
    def __init__(self):
        self.seen = set()
        self.balance = 0

    def handle(self, msg_id, amount, fail=False):
        if @@msg_id in self.seen@@:
            return "duplicate"
        if fail:
            raise RuntimeError("processing failed")
        self.balance @@+=@@ amount
        @@self.seen.add(msg_id)@@
        return "processed"`,
    harness: CONSUMER_HARNESS,
    adapter: 'run_consumer',
    tests: consumerTests,
  },
  debug: {
    language: 'python',
    fnName: 'IdempotentConsumer',
    statement: 'After a downstream outage some payments were never applied, even though the broker redelivered them. The consumer logs "duplicate" for them. Find the ordering bug.',
    harness: CONSUMER_HARNESS,
    adapter: 'run_consumer',
    buggy: `class IdempotentConsumer:
    def __init__(self):
        self.seen = set()
        self.balance = 0

    def handle(self, msg_id, amount, fail=False):
        if msg_id in self.seen:
            return "duplicate"
        self.seen.add(msg_id)
        if fail:
            raise RuntimeError("processing failed")
        self.balance += amount
        return "processed"`,
    fixed: `class IdempotentConsumer:
    def __init__(self):
        self.seen = set()
        self.balance = 0

    def handle(self, msg_id, amount, fail=False):
        if msg_id in self.seen:
            return "duplicate"
        if fail:
            raise RuntimeError("processing failed")
        self.balance += amount
        self.seen.add(msg_id)
        return "processed"`,
    tests: consumerTests,
    bugType: 'marked processed before success',
    hint: 'Trace a message that crashes: what has been recorded when the redelivery arrives?',
    explanation: 'The id is remembered before the work runs. When the work crashes, the redelivered message is treated as a duplicate and silently dropped, so the effect never happens. Record the id only after the effect succeeds.',
  },
  boss: {
    title: 'Retrying consumer with capped backoff',
    statement:
      'Implement `RetryingConsumer(max_attempts, base, cap)` with `balance()` (starts 0) and `process(msg_id, amount, failures)`. `failures` says how many attempts fail before one would succeed. A seen id returns `{"status": "duplicate", "attempts": 0, "delays": []}`. Otherwise attempt up to `max_attempts` times; after failed attempt n (if more attempts remain) wait `min(cap, base * 2**(n-1))` and record it in `delays`. On success add the amount, remember the id and return `{"status": "processed", "attempts": n, "delays": [...]}`. If every attempt fails return `{"status": "dead", "attempts": max_attempts, "delays": [...]}` and remember nothing.',
    language: 'python',
    fnName: 'RetryingConsumer',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class RetryingConsumer:
    # your code here
    pass
`,
    solution: `class RetryingConsumer:
    def __init__(self, max_attempts, base, cap):
        self.max_attempts = max_attempts
        self.base = base
        self.cap = cap
        self.seen = set()
        self._balance = 0

    def process(self, msg_id, amount, failures):
        if msg_id in self.seen:
            return {"status": "duplicate", "attempts": 0, "delays": []}
        delays = []
        for attempt in range(1, self.max_attempts + 1):
            if attempt > failures:
                self._balance += amount
                self.seen.add(msg_id)
                return {"status": "processed", "attempts": attempt, "delays": delays}
            if attempt < self.max_attempts:
                delays.append(min(self.cap, self.base * 2 ** (attempt - 1)))
        return {"status": "dead", "attempts": self.max_attempts, "delays": delays}

    def balance(self):
        return self._balance`,
    tests: [
      {
        args: [ops('RetryingConsumer', 'process', 'process', 'process', 'process', 'process', 'balance'), [[5, 1, 4], ['m1', 50, 0], ['m1', 50, 0], ['m2', 10, 3], ['m3', 10, 9], ['m3', 10, 0], []]],
        expected: [
          null,
          { status: 'processed', attempts: 1, delays: [] },
          { status: 'duplicate', attempts: 0, delays: [] },
          { status: 'processed', attempts: 4, delays: [1, 2, 4] },
          { status: 'dead', attempts: 5, delays: [1, 2, 4, 4] },
          { status: 'processed', attempts: 1, delays: [] },
          70,
        ],
        name: 'dedupe, backoff, dead letter',
      },
      { args: [ops('RetryingConsumer', 'process', 'balance'), [[1, 1, 4], ['a', 5, 1], []]], expected: [null, { status: 'dead', attempts: 1, delays: [] }, 0], name: 'single attempt allowed' },
      { args: [ops('RetryingConsumer', 'process'), [[6, 2, 100], ['a', 1, 4]]], expected: [null, { status: 'processed', attempts: 5, delays: [2, 4, 8, 16] }], name: 'cap not reached' },
      { args: [ops('RetryingConsumer', 'process', 'balance'), [[3, 1, 10], ['x', 7, 2], []]], expected: [null, { status: 'processed', attempts: 3, delays: [1, 2] }, 7], name: 'succeeds on the last attempt' },
      { args: [ops('RetryingConsumer', 'process', 'process'), [[3, 1, 10], ['x', 7, 3], ['x', 7, 0]]], expected: [null, { status: 'dead', attempts: 3, delays: [1, 2] }, { status: 'processed', attempts: 1, delays: [] }], name: 'a dead message may be resubmitted' },
    ],
    hints: ['Loop `attempt` from 1 to `max_attempts`. The attempt succeeds when `attempt > failures`; otherwise it failed.', 'Only append a delay when another attempt will follow (`attempt < max_attempts`). Remember the id only on success.'],
    combines: ['be-idempotency', 'be-task-queues'],
  },
  quiz: [
    {
      prompt: 'What does adding random jitter to the backoff delay achieve?',
      options: ['Faster retries', 'Retries from many clients do not all hit the recovering service at the same instant', 'It removes the need for a cap', 'It makes retries idempotent'],
      answer: 1,
      explain: 'Without jitter, every client that failed together retries together (a thundering herd). Randomizing spreads the load while the service recovers.',
    },
  ],
};

export default unit;
