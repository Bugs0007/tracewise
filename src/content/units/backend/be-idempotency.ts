import { Recorder } from '@/engine/recorder';
import type { ListPanel, SequenceMessage, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel } from '@/content/lib/backend-rest';

const code = `
def create_payment(store, key, amount):
    if key is not None and key in store["keys"]:             #@lookup
        return store["keys"][key]                            #@replay
    payment = {"id": len(store["payments"]) + 1, "amount": amount}   #@charge
    store["payments"].append(payment)                        #@save
    response = {"status": 201, "payment": payment}
    if key is not None:
        store["keys"][key] = response                        #@remember
    return response                                          #@done

def put_payment(store, payment_id, amount):
    store["by_id"][payment_id] = {"id": payment_id, "amount": amount}   #@put
    return {"status": 200, "payment": store["by_id"][payment_id]}
`;

const MODES = ['POST, no key', 'POST + Idempotency-Key', 'PUT /payments/7'];

interface In {
  mode: string;
  attempts: number;
}

function clampAttempts(n: number): number {
  return Math.max(1, Math.min(6, Math.round(n) || 1));
}

const viz: VizDef<In> = {
  id: 'be-idempotency',
  title: 'Replaying a request: POST vs PUT vs POST with a key',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'How the client sends it', kind: 'select', default: 'POST, no key', options: MODES },
    { key: 'attempts', label: 'Attempts (all but the last lose the response)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'POST, no key', input: { mode: 'POST, no key', attempts: 3 } },
    { label: 'POST + key', input: { mode: 'POST + Idempotency-Key', attempts: 3 } },
    { label: 'PUT', input: { mode: 'PUT /payments/7', attempts: 3 } },
  ],
  run({ mode, attempts: rawAttempts }) {
    const r = new Recorder(code);
    const attempts = clampAttempts(rawAttempts);
    const amount = 50;
    const payments: { id: number; amount: number }[] = [];
    const keys: Record<string, string> = {};
    const key = mode === 'POST + Idempotency-Key' ? 'key-7f3a' : null;
    const isPut = mode === 'PUT /payments/7';
    const messages: SequenceMessage[] = [];
    const db = (): ListPanel => ({
      type: 'list',
      title: 'payments table (money moved)',
      orientation: 'horizontal',
      items: payments.map((p) => ({ id: `p${p.id}`, label: `#${p.id}`, sub: `$${p.amount}`, tone: 'swap' as Tone })),
      emptyText: 'no payments',
    });
    const view = (active?: number) => [
      { type: 'sequence' as const, title: 'Client and server', actors: ['Client', 'Server'], messages: [...messages], active },
      db(),
      kvPanel('Idempotency key store', Object.keys(keys).length ? keys : { '(empty)': '' }),
    ];
    let created = 0;
    for (let a = 1; a <= attempts; a++) {
      const last = a === attempts;
      const label = isPut ? `PUT /payments/7 $${amount}` : key ? `POST $${amount} key=${key}` : `POST $${amount}`;
      messages.push({ from: 'Client', to: 'Server', label: `#${a} ${label}`, tone: 'active' });
      r.op();
      let respLabel: string;
      if (isPut) {
        const exists = payments.length > 0;
        if (!exists) payments.push({ id: 7, amount });
        else payments[0].amount = amount;
        r.step('put', exists ? 'Payment 7 already holds $50; writing $50 again changes nothing' : 'Payment 7 is created with $50', view(messages.length - 1), { attempt: a, payments: payments.length });
        respLabel = '200 payment 7';
      } else {
        r.step('lookup', key ? `Attempt ${a}: is ${key} already in the key store?` : `Attempt ${a}: no key sent, nothing to look up`, view(messages.length - 1), { attempt: a, key: key ?? 'none' });
        if (key && keys[key]) {
          r.step('replay', `Key seen: return the saved response, charge nothing`, view(messages.length - 1), { attempt: a, payments: payments.length });
          respLabel = keys[key];
        } else {
          const p = { id: payments.length + 1, amount };
          r.step('charge', `Build payment #${p.id} for $${amount}`, view(messages.length - 1), { attempt: a, payments: payments.length });
          payments.push(p);
          created++;
          r.step('save', `Money moves: payments table now has ${payments.length} row${payments.length > 1 ? 's' : ''}`, view(messages.length - 1), { attempt: a, payments: payments.length });
          respLabel = `201 payment #${p.id}`;
          if (key) {
            keys[key] = respLabel;
            r.step('remember', `Store ${key} -> "${respLabel}" for future retries`, view(messages.length - 1), { attempt: a, payments: payments.length });
          }
        }
      }
      messages.push({ from: 'Server', to: 'Client', label: last ? respLabel : `${respLabel} (lost!)`, tone: last ? 'found' : 'error', dashed: !last });
      r.step('done', last ? `Client finally sees the response. Payments charged: ${payments.length}` : `Response lost in transit; the client times out and retries`, view(messages.length - 1), { attempt: a, payments: payments.length });
    }
    void created;
    return { frames: r.frames, result: payments.length };
  },
  reference({ mode, attempts }) {
    const n = clampAttempts(attempts);
    return mode === 'POST, no key' ? n : 1;
  },
};

const calls = (cs: unknown[]) => cs;

const unit: Unit = {
  id: 'be-idempotency',
  hook: 'Networks drop responses, so clients retry, and a retried "charge the card" must not charge twice. Idempotency keys are the standard answer and a favourite system-design follow-up.',
  predict: {
    prompt: 'Because of timeouts, a client sends `PUT /payments/7 {"amount": 50}` three times, and also `POST /payments {"amount": 50}` three times with no key. How many payment records exist at the end?',
    options: ['2', '4', '6', '1'],
    answer: 1,
    explain: 'PUT names the resource, so three replays just overwrite payment 7 with the same value: 1 record. POST creates a new resource every time: 3 more. Total 4.',
  },
  viz,
  deeper: {
    points: [
      'An operation is **idempotent** when doing it N times leaves the same state as doing it once. GET, PUT, DELETE are by definition; POST is not.',
      'To make POST safe to retry the client sends a unique `Idempotency-Key`. The server stores `key -> response` and returns the stored response on a repeat.',
      'Check the key *before* doing the side effect, and store it in the same transaction as the effect (or with a unique constraint) so two concurrent retries cannot both pass.',
      'Reusing a key with a different payload is a client bug: reject it (409 or 422) instead of silently returning a response for a different request.',
      'Keys expire (for example after 24 hours); the store only needs to outlive the client retry window.',
    ],
    pitfalls: ['Charging first and checking the key afterwards', 'Storing the key but not the response (the retry gets a different answer)', 'Generating the key on the server (it must come from the client, per logical operation)'],
  },
  practice: {
    language: 'python',
    fnName: 'create_payment',
    statement:
      'Implement `create_payment(store, key, amount)`. `store` is `{"payments": [], "keys": {}}`. With a key already seen and the same amount, return the saved response without charging. A seen key with another amount returns `{"status": 422, "error": "key reused"}`. Otherwise append `{"id": n, "amount": amount}` (ids start at 1), return `{"status": 201, "payment": payment}`, and remember it if a key was given.',
    signature: 'def create_payment(store, key, amount):',
    solution: `def create_payment(store, key, amount):
    if key is not None and @@key in store["keys"]@@:
        saved_amount, saved = store["keys"][key]
        if saved_amount != amount:
            return {"status": 422, "error": "key reused"}
        return @@saved@@
    payment = {"id": @@len(store["payments"]) + 1@@, "amount": amount}
    @@store["payments"].append(payment)@@
    response = {"status": 201, "payment": payment}
    if key is not None:
        store["keys"][key] = @@(amount, response)@@
    return response`,
    harness: `
def run_payments(fn, calls):
    store = {"payments": [], "keys": {}}
    responses = [fn(store, key, amount) for key, amount in calls]
    return {"responses": responses, "payments": store["payments"]}
`,
    adapter: 'run_payments',
    tests: [
      {
        args: [calls([['k1', 50], ['k1', 50], ['k2', 70]])],
        expected: {
          responses: [
            { status: 201, payment: { id: 1, amount: 50 } },
            { status: 201, payment: { id: 1, amount: 50 } },
            { status: 201, payment: { id: 2, amount: 70 } },
          ],
          payments: [
            { id: 1, amount: 50 },
            { id: 2, amount: 70 },
          ],
        },
        name: 'retry with same key',
      },
      {
        args: [calls([[null, 10], [null, 10]])],
        expected: {
          responses: [
            { status: 201, payment: { id: 1, amount: 10 } },
            { status: 201, payment: { id: 2, amount: 10 } },
          ],
          payments: [
            { id: 1, amount: 10 },
            { id: 2, amount: 10 },
          ],
        },
        name: 'no key means no protection',
      },
      {
        args: [calls([['a', 5], ['a', 99]])],
        expected: { responses: [{ status: 201, payment: { id: 1, amount: 5 } }, { status: 422, error: 'key reused' }], payments: [{ id: 1, amount: 5 }] },
        name: 'same key, different amount',
      },
      { args: [calls([])], expected: { responses: [], payments: [] }, name: 'nothing sent' },
      {
        args: [calls([['x', 1], ['y', 1], ['x', 1], ['y', 1]])],
        expected: {
          responses: [
            { status: 201, payment: { id: 1, amount: 1 } },
            { status: 201, payment: { id: 2, amount: 1 } },
            { status: 201, payment: { id: 1, amount: 1 } },
            { status: 201, payment: { id: 2, amount: 1 } },
          ],
          payments: [
            { id: 1, amount: 1 },
            { id: 2, amount: 1 },
          ],
        },
        name: 'interleaved keys',
      },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'create_payment',
    statement: 'Customers report double charges even though the client sends an Idempotency-Key. The retry gets the old response back, but the payments table has two rows. Fix it.',
    harness: `
def run_payments(fn, calls):
    store = {"payments": [], "keys": {}}
    responses = [fn(store, key, amount) for key, amount in calls]
    return {"responses": responses, "payments": store["payments"]}
`,
    adapter: 'run_payments',
    buggy: `def create_payment(store, key, amount):
    payment = {"id": len(store["payments"]) + 1, "amount": amount}
    store["payments"].append(payment)
    response = {"status": 201, "payment": payment}
    if key is not None:
        if key in store["keys"]:
            saved_amount, saved = store["keys"][key]
            if saved_amount != amount:
                return {"status": 422, "error": "key reused"}
            return saved
        store["keys"][key] = (amount, response)
    return response`,
    fixed: `def create_payment(store, key, amount):
    if key is not None and key in store["keys"]:
        saved_amount, saved = store["keys"][key]
        if saved_amount != amount:
            return {"status": 422, "error": "key reused"}
        return saved
    payment = {"id": len(store["payments"]) + 1, "amount": amount}
    store["payments"].append(payment)
    response = {"status": 201, "payment": payment}
    if key is not None:
        store["keys"][key] = (amount, response)
    return response`,
    tests: [
      {
        args: [calls([['k1', 50], ['k1', 50]])],
        expected: {
          responses: [
            { status: 201, payment: { id: 1, amount: 50 } },
            { status: 201, payment: { id: 1, amount: 50 } },
          ],
          payments: [{ id: 1, amount: 50 }],
        },
        name: 'retry charges once',
      },
      {
        args: [calls([['a', 5], ['a', 99]])],
        expected: { responses: [{ status: 201, payment: { id: 1, amount: 5 } }, { status: 422, error: 'key reused' }], payments: [{ id: 1, amount: 5 }] },
        name: 'key reuse is rejected without charging',
      },
      {
        args: [calls([['k1', 5], ['k2', 6]])],
        expected: {
          responses: [
            { status: 201, payment: { id: 1, amount: 5 } },
            { status: 201, payment: { id: 2, amount: 6 } },
          ],
          payments: [
            { id: 1, amount: 5 },
            { id: 2, amount: 6 },
          ],
        },
        name: 'different keys are different payments',
      },
    ],
    bugType: 'side effect before the idempotency check',
    hint: 'Look at the order of operations. When does the payment row get written relative to the key lookup?',
    explanation: 'The handler charges first and only then notices the key was already used, so the old response is replayed but a second row already exists. The lookup must come before any side effect.',
  },
  boss: {
    title: 'Idempotent order endpoint',
    statement:
      'Implement `create_order(store, key, payload)` returning `[status, body]`. `store` is `{"orders": [], "keys": {}}`. Rules in order: no key -> `[400, {"error": "key required"}]`. Key seen with an identical payload -> `[200, saved_body]`; seen with a different payload -> `[409, {"error": "key reused"}]`. Otherwise validate: `payload["qty"]` must be an int >= 1, else `[422, {"error": "bad qty"}]` and the key is NOT saved. Valid new orders get id len(orders)+1, body `{"id": id, "qty": qty}`, status 201, and the key is saved.',
    language: 'python',
    fnName: 'create_order',
    harness: `
def run_orders(fn, calls):
    store = {"orders": [], "keys": {}}
    results = [fn(store, key, payload) for key, payload in calls]
    return {"results": results, "orders": len(store["orders"])}
`,
    adapter: 'run_orders',
    starter: `def create_order(store, key, payload):
    # your code here
    pass
`,
    solution: `def create_order(store, key, payload):
    if not key:
        return [400, {"error": "key required"}]
    if key in store["keys"]:
        saved_payload, saved_body = store["keys"][key]
        if saved_payload == payload:
            return [200, saved_body]
        return [409, {"error": "key reused"}]
    qty = payload.get("qty")
    if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1:
        return [422, {"error": "bad qty"}]
    body = {"id": len(store["orders"]) + 1, "qty": qty}
    store["orders"].append(body)
    store["keys"][key] = (payload, body)
    return [201, body]`,
    tests: [
      { args: [calls([['a', { qty: 2 }]])], expected: { results: [[201, { id: 1, qty: 2 }]], orders: 1 }, name: 'create' },
      { args: [calls([['a', { qty: 2 }], ['a', { qty: 2 }]])], expected: { results: [[201, { id: 1, qty: 2 }], [200, { id: 1, qty: 2 }]], orders: 1 }, name: 'replay' },
      { args: [calls([['a', { qty: 2 }], ['a', { qty: 3 }]])], expected: { results: [[201, { id: 1, qty: 2 }], [409, { error: 'key reused' }]], orders: 1 }, name: 'conflict' },
      { args: [calls([[null, { qty: 2 }]])], expected: { results: [[400, { error: 'key required' }]], orders: 0 }, name: 'missing key' },
      { args: [calls([['b', { qty: 0 }], ['b', { qty: 4 }]])], expected: { results: [[422, { error: 'bad qty' }], [201, { id: 1, qty: 4 }]], orders: 1 }, name: 'failed validation does not burn the key' },
      { args: [calls([['b', { qty: '3' }]])], expected: { results: [[422, { error: 'bad qty' }]], orders: 0 }, name: 'qty must be an int' },
    ],
    hints: ['Check the key first (400), then the saved keys (200/409), and only then validate the payload.', 'Save `(payload, body)` under the key so a replay can compare payloads and return the original body. Save it only after the order is created.'],
    combines: ['be-rest-methods'],
  },
  quiz: [
    {
      prompt: 'Why must the Idempotency-Key come from the client?',
      options: ['Servers cannot generate random strings', 'Only the client knows which attempts are retries of the same logical operation', 'It makes the request smaller', 'HTTP requires it'],
      answer: 1,
      explain: 'A server cannot tell a retry from a genuinely new request with the same body. The client generates one key per intent and reuses it for every retry.',
    },
  ],
};

export default unit;
