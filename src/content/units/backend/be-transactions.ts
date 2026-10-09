import { Recorder } from '@/engine/recorder';
import type { GridPanel, LogPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { step } from '@/content/lib/backend-db-auth';

const code = `
def transfer(src, dst, amount):                    #@def
    with transaction.atomic():                     #@begin
        a = Account.objects.get(owner=src)
        a.balance -= amount
        a.save()                                   #@debit
        risk_check(a)                              #@risk
        b = Account.objects.get(owner=dst)
        b.balance += amount
        b.save()                                   #@credit
        write_audit_row(src, dst, amount)          #@audit
    return "ok"                                    #@commit

try:
    transfer("alice", "bob", 30)
except Exception:
    print("transfer failed")                       #@failed
`;

interface In {
  alice: number;
  bob: number;
  amount: number;
  scenario: string;
}

const SCENARIOS = ['atomic: success', 'atomic: crash after debit', 'atomic: crash after credit', 'no atomic: crash after debit'];
type Bal = { alice: number; bob: number };

const amountOf = (n: number) => Math.max(0, Math.round(n));

const viz: VizDef<In> = {
  id: 'be-transactions',
  title: 'Atomic money transfer',
  code,
  language: 'python',
  inputs: [
    { key: 'alice', label: 'alice starts with', kind: 'number', default: 100 },
    { key: 'bob', label: 'bob starts with', kind: 'number', default: 50 },
    { key: 'amount', label: 'Transfer amount', kind: 'number', default: 30 },
    { key: 'scenario', label: 'Scenario', kind: 'select', options: SCENARIOS, default: 'atomic: crash after debit' },
  ],
  presets: SCENARIOS.map((s) => ({ label: s, input: { scenario: s } })),
  run({ alice, bob, amount, scenario }) {
    const r = new Recorder(code);
    const atomic = scenario.startsWith('atomic');
    const crash = scenario.includes('after debit') ? 'debit' : scenario.includes('after credit') ? 'credit' : null;
    const amt = amountOf(amount);
    const live: Bal = { alice, bob };
    const total = alice + bob;
    let snap: Bal | null = null;
    const log: LogPanel = { type: 'log', title: 'Database log', lines: [] };
    const say = (text: string, tone?: Tone) => log.lines.push({ text, tone });

    const table = (title: string, b: Bal, tones: Partial<Record<'alice' | 'bob', Tone>> = {}): GridPanel => ({
      type: 'grid',
      title,
      colLabels: ['id', 'owner', 'balance'],
      cells: [
        [1, 'alice', b.alice],
        [2, 'bob', b.bob],
      ],
      tones: { ...(tones.alice ? { '0,2': tones.alice } : {}), ...(tones.bob ? { '1,2': tones.bob } : {}) },
    });
    const view = (tones: Partial<Record<'alice' | 'bob', Tone>> = {}): Panel[] => {
      const sum = live.alice + live.bob;
      const out: Panel[] = [table('accounts (live)', live, tones)];
      if (snap) out.push(table('undo copy taken at BEGIN', snap, { alice: 'muted', bob: 'muted' }));
      out.push(log);
      out.push({ type: 'kv', title: 'invariant', entries: [{ k: 'alice + bob', v: sum, tone: sum === total ? 'done' : 'error' }, { k: 'should be', v: total }] });
      return out;
    };
    const vars = () => ({ alice: live.alice, bob: live.bob, total: live.alice + live.bob });

    step(r, 'def', `transfer ${amt} from alice (${alice}) to bob (${bob})`, view(), vars());

    if (atomic) {
      snap = { ...live };
      say('BEGIN');
      step(r, 'begin', 'BEGIN: the database keeps a way back to this exact state', view(), vars());
    } else {
      step(r, 'begin', 'No atomic block: autocommit, every UPDATE is final at once', view(), vars());
    }

    const fail = (why: string) => {
      step(r, crash === 'debit' ? 'risk' : 'audit', why, view({ [crash === 'debit' ? 'alice' : 'bob']: 'error' }), vars());
      if (atomic) {
        live.alice = snap!.alice;
        live.bob = snap!.bob;
        say('ROLLBACK', 'error');
        step(r, 'begin', 'Exception leaves the with-block: ROLLBACK restores both rows', view({ alice: 'done', bob: 'done' }), vars());
        snap = null;
        step(r, 'failed', `Caller sees the error; alice ${live.alice}, bob ${live.bob}: nothing changed`, view(), vars());
      } else {
        step(r, 'failed', `${amt} left alice and never reached bob: the money vanished`, view({ alice: 'error' }), vars());
      }
    };

    live.alice -= amt;
    say(`UPDATE accounts SET balance=${live.alice} WHERE owner='alice'`, 'swap');
    if (!atomic) say('COMMIT (autocommit)', 'done');
    step(r, 'debit', `alice debited: ${live.alice + amt} → ${live.alice}`, view({ alice: 'swap' }), vars());

    if (crash === 'debit') {
      fail('risk_check raises RiskError after the debit');
      return { frames: r.frames, result: { ...live } };
    }
    step(r, 'risk', 'risk_check passes, execution continues', view(), vars());

    live.bob += amt;
    say(`UPDATE accounts SET balance=${live.bob} WHERE owner='bob'`, 'swap');
    step(r, 'credit', `bob credited: ${live.bob - amt} → ${live.bob}`, view({ bob: 'swap' }), vars());

    if (crash === 'credit') {
      fail('write_audit_row raises after both UPDATEs');
      return { frames: r.frames, result: { ...live } };
    }
    step(r, 'audit', 'Audit row written, block ends without an exception', view(), vars());
    say('COMMIT', 'done');
    snap = null;
    step(r, 'commit', `COMMIT: both changes become permanent together (${live.alice} + ${live.bob})`, view({ alice: 'done', bob: 'done' }), vars());
    return { frames: r.frames, result: { ...live } };
  },
  reference({ alice, bob, amount, scenario }) {
    const amt = amountOf(amount);
    if (scenario === 'atomic: success') return { alice: alice - amt, bob: bob + amt };
    if (scenario === 'no atomic: crash after debit') return { alice: alice - amt, bob };
    return { alice, bob };
  },
};

const HARNESS = `
from minidjango import models, transaction, connection

class Account(models.Model):
    owner = models.CharField(max_length=20, unique=True)
    balance = models.IntegerField(default=0)

class InsufficientFunds(Exception):
    pass

def _state():
    return {a.owner: a.balance for a in Account.objects.order_by("id")}

def _commits():
    return len([q for q in connection.queries if q["sql"] == "COMMIT"])

def run_transfer(fn, balances, src, dst, amount):
    import minidjango
    minidjango.reset()
    for owner, bal in balances.items():
        Account.objects.create(owner=owner, balance=bal)
    connection.reset_queries()
    try:
        fn(src, dst, amount)
        outcome = "ok"
    except Exception as e:
        outcome = type(e).__name__
    return {"outcome": outcome, "balances": _state(), "commits": _commits()}

def run_batch(fn, balances, transfers):
    import minidjango
    minidjango.reset()
    for owner, bal in balances.items():
        Account.objects.create(owner=owner, balance=bal)
    connection.reset_queries()
    result = fn(transfers)
    return {"result": result, "balances": _state(), "commits": _commits()}
`;

const B = { alice: 100, bob: 50 };
const tests = [
  { args: [B, 'alice', 'bob', 30], expected: { outcome: 'ok', balances: { alice: 70, bob: 80 }, commits: 1 }, name: 'normal transfer' },
  { args: [B, 'alice', 'ghost', 30], expected: { outcome: 'DoesNotExist', balances: { alice: 100, bob: 50 }, commits: 0 }, name: 'missing destination rolls back the debit' },
  { args: [{ alice: 20, bob: 50 }, 'alice', 'bob', 30], expected: { outcome: 'InsufficientFunds', balances: { alice: 20, bob: 50 }, commits: 0 }, name: 'insufficient funds' },
  { args: [{ alice: 30, bob: 0 }, 'alice', 'bob', 30], expected: { outcome: 'ok', balances: { alice: 0, bob: 30 }, commits: 1 }, name: 'exact balance' },
  { args: [B, 'nobody', 'bob', 10], expected: { outcome: 'DoesNotExist', balances: { alice: 100, bob: 50 }, commits: 0 }, name: 'missing source' },
];

const unit: Unit = {
  id: 'be-transactions',
  hook: 'Every payments, booking or inventory interview ends up at "what if it crashes halfway?". Atomicity is the answer, and knowing exactly when a rollback does and does not happen is what separates real experience from buzzwords.',
  predict: {
    prompt: 'transfer() debits alice by 30, then risk_check() raises an exception before the credit to bob. The body is inside `with transaction.atomic():`. After the exception propagates out, what is alice\'s balance (she started at 100)?',
    options: ['70, the debit was already saved', '100, the whole block was rolled back', 'It depends on whether save() was called', '100 only after calling refresh_from_db() and a manual rollback'],
    answer: 1,
    explain: 'An exception leaving the atomic block triggers ROLLBACK, undoing every write made inside it, saved or not. The exception is then re-raised to the caller.',
  },
  viz,
  deeper: {
    points: [
      'Atomicity means all or nothing: either every write in the block is visible after COMMIT, or none are. Databases implement it with an undo/redo log, not by copying tables.',
      '`transaction.atomic()` issues BEGIN on entry, COMMIT on a clean exit and ROLLBACK when an exception escapes, then re-raises that exception.',
      'Nested atomic blocks become SAVEPOINTs: an inner failure can roll back just its own part while the outer transaction carries on.',
      'Only database state is rolled back. Emails sent, HTTP calls made and files written inside the block stay done, so schedule them with transaction.on_commit.',
      'Keep transactions short. Locks taken by the UPDATEs are held until COMMIT/ROLLBACK, so slow work inside a block blocks other writers.',
    ],
    pitfalls: [
      'Catching the exception inside the atomic block: the block exits normally and COMMITs the half-finished work',
      'Doing network calls or sending emails inside a transaction',
      'On PostgreSQL, catching an IntegrityError inside atomic without an inner atomic leaves the transaction unusable',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'transfer',
    statement: 'Account(owner, balance) and InsufficientFunds are already defined. Write transfer(src, dst, amount): move money atomically, raising InsufficientFunds if src cannot cover it. A missing account must also leave every balance untouched.',
    signature: 'def transfer(src, dst, amount):',
    solution: `def transfer(src, dst, amount):
    with @@transaction.atomic()@@:
        a = Account.objects.get(owner=src)
        if a.balance < amount:
            raise @@InsufficientFunds(src)@@
        a.balance -= amount
        a.save()
        b = @@Account.objects.get(owner=dst)@@
        b.balance @@+=@@ amount
        b.save()`,
    harness: HARNESS,
    adapter: 'run_transfer',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'transfer',
    statement: 'Transfers to a missing account are supposed to fail without losing money, but alice\'s balance drops anyway. Find the bug.',
    buggy: `def transfer(src, dst, amount):
    with transaction.atomic():
        try:
            a = Account.objects.get(owner=src)
            if a.balance < amount:
                raise InsufficientFunds(src)
            a.balance -= amount
            a.save()
            b = Account.objects.get(owner=dst)
            b.balance += amount
            b.save()
        except Account.DoesNotExist:
            return "no such account"`,
    fixed: `def transfer(src, dst, amount):
    with transaction.atomic():
        a = Account.objects.get(owner=src)
        if a.balance < amount:
            raise InsufficientFunds(src)
        a.balance -= amount
        a.save()
        b = Account.objects.get(owner=dst)
        b.balance += amount
        b.save()`,
    harness: HARNESS,
    adapter: 'run_transfer',
    tests,
    bugType: 'exception swallowed inside atomic',
    hint: 'What does transaction.atomic() see when the except block returns normally?',
    explanation: 'atomic() only rolls back when an exception escapes the block. Catching DoesNotExist inside it makes the block end normally, so the half-done debit is COMMITTED. Let the exception propagate (or catch it outside the with).',
  },
  boss: {
    title: 'Batch transfers with savepoints',
    statement: 'Write apply_batch(transfers) where each transfer is [src, dst, amount]. Run the whole batch in one outer transaction, but each transfer in its own nested atomic block: a transfer that hits a missing account or insufficient funds is skipped (fully undone) and its index recorded; the others stay. Return {"applied": n, "failed": [indexes]}. Account and InsufficientFunds exist.',
    language: 'python',
    fnName: 'apply_batch',
    starter: `def apply_batch(transfers):
    # your code here
    pass
`,
    solution: `def apply_batch(transfers):
    applied, failed = 0, []
    with transaction.atomic():
        for i, (src, dst, amount) in enumerate(transfers):
            try:
                with transaction.atomic():
                    a = Account.objects.get(owner=src)
                    if a.balance < amount:
                        raise InsufficientFunds(src)
                    a.balance -= amount
                    a.save()
                    b = Account.objects.get(owner=dst)
                    b.balance += amount
                    b.save()
                applied += 1
            except (Account.DoesNotExist, InsufficientFunds):
                failed.append(i)
    return {"applied": applied, "failed": failed}`,
    harness: HARNESS,
    adapter: 'run_batch',
    tests: [
      { args: [{ a: 100, b: 0, c: 0 }, [['a', 'b', 30], ['b', 'c', 10]]], expected: { result: { applied: 2, failed: [] }, balances: { a: 70, b: 20, c: 10 }, commits: 1 }, name: 'all succeed' },
      { args: [{ a: 100, b: 0, c: 0 }, [['a', 'b', 30], ['a', 'ghost', 50], ['b', 'c', 5]]], expected: { result: { applied: 2, failed: [1] }, balances: { a: 70, b: 25, c: 5 }, commits: 1 }, name: 'failed debit is undone by its savepoint' },
      { args: [{ a: 100, b: 0 }, [['a', 'b', 500], ['a', 'b', 10]]], expected: { result: { applied: 1, failed: [0] }, balances: { a: 90, b: 10 }, commits: 1 }, name: 'insufficient funds skipped' },
      { args: [{ a: 5 }, []], expected: { result: { applied: 0, failed: [] }, balances: { a: 5 }, commits: 1 }, name: 'empty batch' },
    ],
    hints: ['You need two levels of transaction.atomic(): one around the loop, one around each transfer.', 'Catch the exceptions OUTSIDE the inner `with`, so the inner block sees the exception and rolls back to its savepoint.'],
    combines: ['be-transactions'],
  },
  quiz: [
    {
      prompt: 'Where should you send the "payment received" email for an order saved inside transaction.atomic()?',
      options: ['Right after order.save(), inside the block', 'In transaction.on_commit(...), so it only fires after COMMIT', 'Before the block starts', 'It does not matter'],
      answer: 1,
      explain: 'A rollback cannot unsend an email. on_commit runs the callback only if the transaction really commits.',
    },
  ],
  simulationNote: 'Runs on minidjango, a small in-memory stand-in for Django\'s ORM. BEGIN/COMMIT/ROLLBACK and savepoints are simulated by snapshotting tables, which is not how a real database does it, but the visible behaviour matches.',
};

export default unit;
