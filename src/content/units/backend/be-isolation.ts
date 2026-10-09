import { Recorder } from '@/engine/recorder';
import type { GridPanel, LogPanel, Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { step } from '@/content/lib/backend-db-auth';

const code = `
def snapshot_for(txn, level, now):
    if level == "READ UNCOMMITTED":
        return None                                  #@ru
    if level == "READ COMMITTED":
        return now                                   #@rc
    return txn["begin_ts"]                           #@rr

def visible(v, txn, snap):
    if v["writer"] == txn["id"]:
        return True                                  #@own
    if v["state"] == "aborted":
        return False                                 #@aborted
    if snap is None:
        return True                                  #@dirty
    return v["state"] == "committed" and v["commit_ts"] <= snap   #@committed

def read(txn, row, level, now):
    snap = snapshot_for(txn, level, now)             #@snap
    for v in reversed(VERSIONS[row]):
        if visible(v, txn, snap):
            return v["value"]                        #@read
    return None

def commit(txn, level):
    if level == "SERIALIZABLE" and txn["wrote"] and changed_since(txn):
        raise SerializationFailure("retry")          #@ssi
    mark_committed(txn)                              #@commit
`;

const LEVELS = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'] as const;
const SCENARIOS = ['dirty read', 'non-repeatable read', 'phantom read', 'write skew'] as const;

interface In {
  level: string;
  anomaly: string;
}

type Who = 'A' | 'B';
type Kind = 'begin' | 'read' | 'count' | 'write' | 'insert' | 'commit' | 'rollback';
interface Op {
  s: Who;
  kind: Kind;
  row?: string;
  val?: number;
}
interface Ver {
  row: string;
  value: number;
  writer: string;
  state: 'committed' | 'active' | 'aborted';
  ts: number | null;
}
interface Txn {
  id: Who;
  beginTs: number;
  reads: Set<string>;
  wrote: boolean;
  status: 'active' | 'committed' | 'aborted';
}

interface Scenario {
  init: { row: string; value: number }[];
  ops: Op[];
  /** predicate used by "count" ops */
  pred: (v: number) => boolean;
  predText: string;
}

function scenarioOf(name: string): Scenario {
  switch (name) {
    case 'dirty read':
      return {
        init: [{ row: 'acct', value: 100 }],
        pred: () => true,
        predText: '',
        ops: [
          { s: 'B', kind: 'begin' },
          { s: 'B', kind: 'write', row: 'acct', val: 0 },
          { s: 'A', kind: 'begin' },
          { s: 'A', kind: 'read', row: 'acct' },
          { s: 'B', kind: 'rollback' },
          { s: 'A', kind: 'read', row: 'acct' },
          { s: 'A', kind: 'commit' },
        ],
      };
    case 'non-repeatable read':
      return {
        init: [{ row: 'acct', value: 100 }],
        pred: () => true,
        predText: '',
        ops: [
          { s: 'A', kind: 'begin' },
          { s: 'A', kind: 'read', row: 'acct' },
          { s: 'B', kind: 'begin' },
          { s: 'B', kind: 'write', row: 'acct', val: 50 },
          { s: 'B', kind: 'commit' },
          { s: 'A', kind: 'read', row: 'acct' },
          { s: 'A', kind: 'commit' },
        ],
      };
    case 'phantom read':
      return {
        init: [{ row: 'acct', value: 100 }],
        pred: (v) => v >= 100,
        predText: 'balance >= 100',
        ops: [
          { s: 'A', kind: 'begin' },
          { s: 'A', kind: 'count' },
          { s: 'B', kind: 'begin' },
          { s: 'B', kind: 'insert', row: 'acct2', val: 200 },
          { s: 'B', kind: 'commit' },
          { s: 'A', kind: 'count' },
          { s: 'A', kind: 'commit' },
        ],
      };
    default:
      return {
        init: [
          { row: 'alice', value: 1 },
          { row: 'bob', value: 1 },
        ],
        pred: (v) => v >= 1,
        predText: 'on_call = 1',
        ops: [
          { s: 'A', kind: 'begin' },
          { s: 'B', kind: 'begin' },
          { s: 'A', kind: 'count' },
          { s: 'B', kind: 'count' },
          { s: 'A', kind: 'write', row: 'alice', val: 0 },
          { s: 'B', kind: 'write', row: 'bob', val: 0 },
          { s: 'A', kind: 'commit' },
          { s: 'B', kind: 'commit' },
        ],
      };
  }
}

const viz: VizDef<In> = {
  id: 'be-isolation',
  title: 'Two sessions, one table',
  code,
  language: 'python',
  inputs: [
    { key: 'level', label: 'Isolation level', kind: 'select', options: [...LEVELS], default: 'READ COMMITTED' },
    { key: 'anomaly', label: 'Schedule to run', kind: 'select', options: [...SCENARIOS], default: 'non-repeatable read' },
  ],
  presets: [
    { label: 'Dirty read at RU', input: { level: 'READ UNCOMMITTED', anomaly: 'dirty read' } },
    { label: 'Dirty read at RC', input: { level: 'READ COMMITTED', anomaly: 'dirty read' } },
    { label: 'Non-repeatable at RC', input: { level: 'READ COMMITTED', anomaly: 'non-repeatable read' } },
    { label: 'Non-repeatable at RR', input: { level: 'REPEATABLE READ', anomaly: 'non-repeatable read' } },
    { label: 'Phantom at RR', input: { level: 'REPEATABLE READ', anomaly: 'phantom read' } },
    { label: 'Write skew at RR', input: { level: 'REPEATABLE READ', anomaly: 'write skew' } },
    { label: 'Write skew at SERIALIZABLE', input: { level: 'SERIALIZABLE', anomaly: 'write skew' } },
  ],
  run({ level, anomaly }) {
    const r = new Recorder(code);
    const sc = scenarioOf(anomaly);
    const versions: Ver[] = sc.init.map((i) => ({ row: i.row, value: i.value, writer: 'init', state: 'committed', ts: 0 }));
    const txns: Record<Who, Txn> = {
      A: { id: 'A', beginTs: 0, reads: new Set(), wrote: false, status: 'active' },
      B: { id: 'B', beginTs: 0, reads: new Set(), wrote: false, status: 'active' },
    };
    const lanes: Record<Who, TimelineEvent[]> = { A: [], B: [] };
    const log: LogPanel = { type: 'log', title: 'What each session saw', lines: [] };
    const seen: { s: Who; row: string; value: number | null }[] = [];
    const counts: { s: Who; n: number }[] = [];
    let dirty = false;
    const tMax = sc.ops.length + 1;

    const snapFor = (tx: Txn, now: number): number | null => (level === 'READ UNCOMMITTED' ? null : level === 'READ COMMITTED' ? now : tx.beginTs);
    const isVisible = (v: Ver, tx: Txn, snap: number | null): boolean => {
      if (v.writer === tx.id) return v.state !== 'aborted';
      if (v.state === 'aborted') return false;
      if (snap === null) return true;
      return v.state === 'committed' && v.ts! <= snap;
    };
    const rowsNow = () => [...new Set(versions.map((v) => v.row))];
    const pick = (row: string, tx: Txn, snap: number | null): Ver | null => {
      for (let i = versions.length - 1; i >= 0; i--) if (versions[i].row === row && isVisible(versions[i], tx, snap)) return versions[i];
      return null;
    };

    const grid = (hot: Ver | null): GridPanel => {
      const tones: Record<string, Tone> = {};
      versions.forEach((v, i) => {
        const tone: Tone = v === hot ? 'compare' : v.state === 'committed' ? 'done' : v.state === 'active' ? 'swap' : 'muted';
        for (let c = 0; c < 5; c++) tones[`${i},${c}`] = tone;
      });
      return {
        type: 'grid',
        title: 'row versions (committed / uncommitted / aborted)',
        colLabels: ['row', 'value', 'writer', 'state', 'commit ts'],
        cells: versions.map((v) => [v.row, v.value, v.writer, v.state, v.ts ?? '-']),
        tones,
      };
    };
    const view = (t: number, hot: Ver | null = null, banner?: { text: string; tone: Tone }): Panel[] => {
      const out: Panel[] = [
        {
          type: 'timeline',
          title: 'Session A and Session B',
          lanes: [
            { label: 'Session A', events: lanes.A.map((e) => ({ ...e })) },
            { label: 'Session B', events: lanes.B.map((e) => ({ ...e })) },
          ],
          tMax,
          now: t,
          unit: 't',
        },
        grid(hot),
        { ...log, lines: log.lines.map((l) => ({ ...l })) },
      ];
      if (banner) out.push({ type: 'note', text: banner.text, tone: banner.tone });
      return out;
    };
    const mark = (s: Who, t: number, label: string, tone?: Tone) => lanes[s].push({ t, label, tone });
    const vars = (t: number) => ({ t, level });

    sc.ops.forEach((op, idx) => {
      const t = idx + 1;
      const tx = txns[op.s];
      if (op.kind === 'begin') {
        tx.beginTs = t;
        mark(op.s, t, 'BEGIN');
        step(r, 0, `${op.s} BEGIN at t=${t}`, view(t), vars(t));
      } else if (op.kind === 'read' || op.kind === 'count') {
        const snap = snapFor(tx, t);
        const snapText = snap === null ? 'no snapshot: newest version wins, even uncommitted' : level === 'READ COMMITTED' ? `snapshot = now (t=${t})` : `snapshot = begin_ts (t=${tx.beginTs})`;
        step(r, snap === null ? 'ru' : level === 'READ COMMITTED' ? 'rc' : 'rr', `${op.s} reads: ${snapText}`, view(t), vars(t));
        if (op.kind === 'read') {
          const v = pick(op.row!, tx, snap);
          tx.reads.add(op.row!);
          seen.push({ s: op.s, row: op.row!, value: v ? v.value : null });
          const isDirty = !!v && v.writer !== op.s && v.state !== 'committed';
          if (isDirty) dirty = true;
          mark(op.s, t, `SELECT→${v ? v.value : 'none'}`, isDirty ? 'error' : 'compare');
          log.lines.push({ text: `${op.s}: SELECT ${op.row} → ${v ? v.value : 'none'}${isDirty ? ` (uncommitted write of ${v!.writer}!)` : ''}`, tone: isDirty ? 'error' : undefined });
          const at = !v ? 'read' : v.writer === op.s ? 'own' : v.state !== 'committed' ? 'dirty' : 'committed';
          step(r, at, `${op.s} sees ${op.row} = ${v ? v.value : 'nothing'}${isDirty ? ' (dirty read)' : ''}`, view(t, v, isDirty ? { text: `Dirty read: ${op.s} used data that ${v!.writer} may still roll back.`, tone: 'error' } : undefined), vars(t));
        } else {
          let n = 0;
          let hot: Ver | null = null;
          for (const row of rowsNow()) {
            tx.reads.add(row);
            const v = pick(row, tx, snap);
            if (v && sc.pred(v.value)) {
              n++;
              hot = v;
            }
          }
          tx.reads.add('*');
          counts.push({ s: op.s, n });
          const prev = counts.filter((c) => c.s === op.s);
          const changed = prev.length > 1 && prev[prev.length - 2].n !== n;
          mark(op.s, t, `COUNT→${n}`, changed ? 'error' : 'compare');
          log.lines.push({ text: `${op.s}: COUNT(${sc.predText}) → ${n}`, tone: changed ? 'error' : undefined });
          step(r, 'read', `${op.s} counts rows where ${sc.predText}: ${n}${changed ? ' (a phantom appeared)' : ''}`, view(t, hot, changed ? { text: `Phantom read: the same query now returns ${n} rows instead of ${prev[prev.length - 2].n}.`, tone: 'error' } : undefined), vars(t));
        }
      } else if (op.kind === 'write' || op.kind === 'insert') {
        versions.push({ row: op.row!, value: op.val!, writer: op.s, state: 'active', ts: null });
        tx.wrote = true;
        mark(op.s, t, `${op.kind === 'write' ? 'UPDATE' : 'INSERT'} ${op.row}=${op.val}`, 'swap');
        step(r, 0, `${op.s} ${op.kind === 'write' ? 'updates' : 'inserts'} ${op.row} = ${op.val} (uncommitted)`, view(t, versions[versions.length - 1]), vars(t));
      } else if (op.kind === 'rollback') {
        versions.forEach((v) => {
          if (v.writer === op.s && v.state === 'active') v.state = 'aborted';
        });
        tx.status = 'aborted';
        mark(op.s, t, 'ROLLBACK', 'error');
        step(r, 0, `${op.s} ROLLBACK: its versions are marked aborted`, view(t), vars(t));
      } else {
        const conflict = level === 'SERIALIZABLE' && tx.wrote && versions.some((v) => v.state === 'committed' && v.writer !== tx.id && v.writer !== 'init' && v.ts! > tx.beginTs && (tx.reads.has(v.row) || tx.reads.has('*')));
        if (conflict) {
          versions.forEach((v) => {
            if (v.writer === op.s && v.state === 'active') v.state = 'aborted';
          });
          tx.status = 'aborted';
          mark(op.s, t, 'ABORT', 'error');
          step(r, 'ssi', `${op.s} COMMIT refused: data it read changed (serialization failure)`, view(t, null, { text: `${op.s} must retry. SERIALIZABLE aborted one session to keep the result serial.`, tone: 'found' }), vars(t));
        } else {
          versions.forEach((v) => {
            if (v.writer === op.s && v.state === 'active') {
              v.state = 'committed';
              v.ts = t;
            }
          });
          tx.status = 'committed';
          mark(op.s, t, 'COMMIT', 'done');
          step(r, 'commit', `${op.s} COMMIT at t=${t}: its versions become visible to new snapshots`, view(t), vars(t));
        }
      }
    });

    // verdict
    let anomalyFound = false;
    if (anomaly === 'dirty read') anomalyFound = dirty;
    else if (anomaly === 'non-repeatable read') {
      const a = seen.filter((x) => x.s === 'A');
      anomalyFound = a.length > 1 && a[0].value !== a[1].value;
    } else if (anomaly === 'phantom read') {
      const a = counts.filter((x) => x.s === 'A');
      anomalyFound = a.length > 1 && a[0].n !== a[1].n;
    } else {
      const latest = rowsNow().filter((row) => {
        const committed = versions.filter((v) => v.row === row && v.state === 'committed');
        return committed.length > 0 && sc.pred(committed[committed.length - 1].value);
      });
      anomalyFound = txns.A.status === 'committed' && txns.B.status === 'committed' && latest.length < 1;
    }
    const result = anomalyFound ? anomaly : 'none';
    const endT = tMax;
    step(r, 0, anomalyFound ? `Result at ${level}: ${anomaly} happened` : `Result at ${level}: no ${anomaly}`, view(endT, null, { text: anomalyFound ? `${level} allows a ${anomaly} in this schedule.` : `${level} prevents a ${anomaly} in this schedule.`, tone: anomalyFound ? 'error' : 'found' }), vars(endT));
    return { frames: r.frames, result };
  },
  reference({ level, anomaly }) {
    const possibleAt: Record<string, string[]> = {
      'dirty read': ['READ UNCOMMITTED'],
      'non-repeatable read': ['READ UNCOMMITTED', 'READ COMMITTED'],
      'phantom read': ['READ UNCOMMITTED', 'READ COMMITTED'],
      'write skew': ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ'],
    };
    return possibleAt[anomaly].includes(level) ? anomaly : 'none';
  },
};

const V_INIT = { value: 100, writer: 'init', state: 'committed', commit_ts: 0 };

const unit: Unit = {
  id: 'be-isolation',
  hook: 'Isolation levels are the classic database interview question, and most candidates can only recite the table. Being able to say what each level shows a concurrent reader, and why, is what gets you past it.',
  predict: {
    prompt: 'Session A runs SELECT balance twice inside one transaction (100 first). In between, Session B updates the balance to 50 and COMMITs. At READ COMMITTED, what does A\'s second SELECT return?',
    options: ['100, A\'s transaction keeps seeing its first answer', '50, each statement sees the latest committed data', 'It blocks until A commits', 'An error, because the row changed'],
    answer: 1,
    explain: 'READ COMMITTED takes a fresh snapshot per statement, so A sees B\'s committed 50. That difference between the two reads is a non-repeatable read. REPEATABLE READ would keep returning 100.',
  },
  viz,
  deeper: {
    points: [
      'READ UNCOMMITTED may see other sessions\' uncommitted versions (dirty reads). Few engines really offer it.',
      'READ COMMITTED sees only committed data, but re-takes the snapshot every statement, so repeated reads can differ.',
      'REPEATABLE READ pins one snapshot for the whole transaction. The SQL standard still allows phantoms there; snapshot engines such as PostgreSQL and InnoDB happen to prevent them for plain reads.',
      'Write skew (two transactions read the same data, then write different rows) survives snapshot isolation. Only SERIALIZABLE stops it, by aborting one session so you must retry.',
      'Higher isolation costs more: more blocking or more aborted transactions to retry. Pick the weakest level whose anomalies you can tolerate.',
    ],
    pitfalls: [
      'Assuming "REPEATABLE READ" means the same thing in every database',
      'Not retrying after a serialization failure under SERIALIZABLE',
      'Relying on a read-then-write check (if count > 1) without locking or a constraint',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'read_value',
    statement: 'Implement MVCC visibility. versions is a list (oldest to newest) of dicts with value, writer, state ("committed", "active" or "aborted") and commit_ts. Return the value that `reader` sees at the given level, or None.',
    signature: 'def read_value(versions, reader, level, begin_ts, now):',
    solution: `def read_value(versions, reader, level, begin_ts, now):
    if level == "READ COMMITTED":
        snap = @@now@@
    else:
        snap = @@begin_ts@@
    for v in @@reversed(versions)@@:
        if v["state"] == "aborted":
            continue
        if v["writer"] == reader:
            return v["value"]
        if level == @@"READ UNCOMMITTED"@@:
            return v["value"]
        if v["state"] == "committed" and v["commit_ts"] <= snap:
            return v["value"]
    return None`,
    tests: [
      { args: [[V_INIT, { value: 0, writer: 'B', state: 'active', commit_ts: null }], 'A', 'READ UNCOMMITTED', 1, 4], expected: 0, name: 'dirty read at RU' },
      { args: [[V_INIT, { value: 0, writer: 'B', state: 'active', commit_ts: null }], 'A', 'READ COMMITTED', 1, 4], expected: 100, name: 'RC ignores uncommitted' },
      { args: [[V_INIT, { value: 0, writer: 'B', state: 'active', commit_ts: null }], 'B', 'READ COMMITTED', 1, 4], expected: 0, name: 'own writes are visible' },
      { args: [[V_INIT, { value: 0, writer: 'B', state: 'aborted', commit_ts: null }], 'A', 'READ UNCOMMITTED', 1, 4], expected: 100, name: 'aborted version skipped' },
      { args: [[V_INIT, { value: 50, writer: 'B', state: 'committed', commit_ts: 5 }], 'A', 'READ COMMITTED', 3, 6], expected: 50, name: 'RC sees newer commit' },
      { args: [[V_INIT, { value: 50, writer: 'B', state: 'committed', commit_ts: 5 }], 'A', 'REPEATABLE READ', 3, 6], expected: 100, name: 'RR keeps old snapshot' },
      { args: [[V_INIT, { value: 50, writer: 'B', state: 'committed', commit_ts: 5 }], 'A', 'SERIALIZABLE', 3, 6], expected: 100, name: 'SERIALIZABLE snapshot' },
      { args: [[{ value: 7, writer: 'B', state: 'active', commit_ts: null }], 'A', 'READ COMMITTED', 1, 2], expected: null, name: 'nothing visible' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'read_value',
    statement: 'This read_value is meant to give REPEATABLE READ one snapshot for the whole transaction, but a concurrent commit shows up in the second read. Fix it.',
    buggy: `def read_value(versions, reader, level, begin_ts, now):
    snap = now
    for v in reversed(versions):
        if v["state"] == "aborted":
            continue
        if v["writer"] == reader:
            return v["value"]
        if level == "READ UNCOMMITTED":
            return v["value"]
        if v["state"] == "committed" and v["commit_ts"] <= snap:
            return v["value"]
    return None`,
    fixed: `def read_value(versions, reader, level, begin_ts, now):
    snap = now if level == "READ COMMITTED" else begin_ts
    for v in reversed(versions):
        if v["state"] == "aborted":
            continue
        if v["writer"] == reader:
            return v["value"]
        if level == "READ UNCOMMITTED":
            return v["value"]
        if v["state"] == "committed" and v["commit_ts"] <= snap:
            return v["value"]
    return None`,
    tests: [
      { args: [[V_INIT, { value: 50, writer: 'B', state: 'committed', commit_ts: 5 }], 'A', 'READ COMMITTED', 3, 6], expected: 50 },
      { args: [[V_INIT, { value: 50, writer: 'B', state: 'committed', commit_ts: 5 }], 'A', 'REPEATABLE READ', 3, 6], expected: 100, name: 'RR keeps old snapshot' },
      { args: [[V_INIT, { value: 50, writer: 'B', state: 'committed', commit_ts: 5 }], 'A', 'SERIALIZABLE', 3, 6], expected: 100 },
      { args: [[V_INIT, { value: 0, writer: 'B', state: 'active', commit_ts: null }], 'A', 'READ UNCOMMITTED', 1, 4], expected: 0 },
    ],
    bugType: 'wrong snapshot time',
    hint: 'Which timestamp should a REPEATABLE READ transaction compare commit_ts against: the time of this statement, or the time the transaction began?',
    explanation: 'The snapshot is chosen by isolation level. Only READ COMMITTED uses "now" (a new snapshot per statement). Higher levels must use begin_ts for every read, otherwise later commits leak in.',
  },
  boss: {
    title: 'Name that anomaly',
    statement: 'A schedule is a list of steps [session, op, row]: ops are begin, read, scan, write, insert, commit, rollback (row omitted for begin/commit/rollback/scan). Assume reads see the latest data, as at READ UNCOMMITTED. Return a sorted list of the anomalies it exhibits: "dirty_read" (read of a row with another session\'s uncommitted write), "non_repeatable_read" (a session reads a row twice and another session committed a write to it in between) and "phantom" (a session scans twice and another session committed an insert in between).',
    language: 'python',
    fnName: 'classify',
    starter: `def classify(schedule):
    # your code here
    pass
`,
    solution: `def classify(schedule):
    found = set()
    uncommitted = {}   # row -> session holding an uncommitted write
    pending = {}       # session -> [(op, row)] not yet committed
    version = {}       # row -> committed changes so far
    shape = 0          # committed inserts so far
    last_read = {}
    last_scan = {}
    for entry in schedule:
        who, op = entry[0], entry[1]
        row = entry[2] if len(entry) > 2 else None
        if op == "read":
            if row in uncommitted and uncommitted[row] != who:
                found.add("dirty_read")
            seen = version.get(row, 0)
            if last_read.get((who, row), seen) != seen:
                found.add("non_repeatable_read")
            last_read[(who, row)] = seen
        elif op == "scan":
            if last_scan.get(who, shape) != shape:
                found.add("phantom")
            last_scan[who] = shape
        elif op in ("write", "insert"):
            uncommitted[row] = who
            pending.setdefault(who, []).append((op, row))
        elif op == "commit":
            for kind, r in pending.pop(who, []):
                if uncommitted.get(r) == who:
                    del uncommitted[r]
                version[r] = version.get(r, 0) + 1
                if kind == "insert":
                    shape += 1
        elif op == "rollback":
            for kind, r in pending.pop(who, []):
                if uncommitted.get(r) == who:
                    del uncommitted[r]
    return sorted(found)`,
    tests: [
      { args: [[['B', 'begin'], ['B', 'write', 'x'], ['A', 'begin'], ['A', 'read', 'x'], ['B', 'rollback'], ['A', 'commit']]], expected: ['dirty_read'], name: 'dirty read' },
      { args: [[['A', 'begin'], ['A', 'read', 'x'], ['B', 'begin'], ['B', 'write', 'x'], ['B', 'commit'], ['A', 'read', 'x'], ['A', 'commit']]], expected: ['non_repeatable_read'], name: 'non-repeatable read' },
      { args: [[['A', 'begin'], ['A', 'scan'], ['B', 'begin'], ['B', 'insert', 'y'], ['B', 'commit'], ['A', 'scan'], ['A', 'commit']]], expected: ['phantom'], name: 'phantom' },
      { args: [[['A', 'begin'], ['A', 'read', 'x'], ['A', 'commit'], ['B', 'begin'], ['B', 'write', 'x'], ['B', 'commit']]], expected: [], name: 'serial schedule is clean' },
      { args: [[['B', 'write', 'x'], ['A', 'read', 'x'], ['B', 'commit'], ['A', 'read', 'x']]], expected: ['dirty_read', 'non_repeatable_read'], name: 'two anomalies' },
      { args: [[['A', 'begin'], ['A', 'write', 'x'], ['A', 'read', 'x'], ['A', 'commit']]], expected: [], name: 'own write is not dirty' },
    ],
    hints: ['Walk the schedule once, keeping a dict of rows with uncommitted writes and counters of committed changes.', 'For non-repeatable reads remember, per (session, row), the committed-change counter at the last read; a different value at the next read means someone committed in between.'],
    combines: ['be-transactions'],
  },
  quiz: [
    {
      prompt: 'Two on-call doctors each check "at least 2 on call?" and then each takes themself off call, in separate transactions. What can prevent both from leaving?',
      options: ['READ COMMITTED', 'REPEATABLE READ with snapshot isolation', 'SERIALIZABLE (or an explicit lock/constraint)', 'Nothing can'],
      answer: 2,
      explain: 'This is write skew: each transaction writes a different row, so snapshot isolation sees no conflict. SERIALIZABLE aborts one of them; so would locking the rows they read.',
    },
  ],
};

export default unit;
