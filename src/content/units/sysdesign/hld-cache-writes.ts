import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, TimelineEvent, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
def write(v):
    if policy == "write-through":
        cache["x"] = v; db["x"] = v                 #@through
    elif policy == "write-back":
        cache["x"] = v; pending += 1                #@back
    else:
        db["x"] = v; cache.pop("x", None)           #@around

def read():
    if "x" not in cache and "x" in db:
        cache["x"] = db["x"]                        #@fill
    return cache.get("x")                           #@read

def flush():
    if pending:
        db["x"] = cache["x"]; pending = 0           #@flush

def crash():
    lost = pending                                  #@crash
    cache.clear(); pending = 0
`;

const POLICIES = ['write-through', 'write-back', 'write-around'] as const;

interface In {
  policy: string;
  ops: string[];
}

type Op = { kind: 'w'; v: number } | { kind: 'r' } | { kind: 'flush' } | { kind: 'crash' };

function parse(input: In) {
  const policy = needOneOf('policy', input.policy, POLICIES);
  if (!input.ops.length || input.ops.length > 14) throw new Error('Give 1 to 14 operations');
  const ops: Op[] = input.ops.map((t) => {
    const s = t.trim().toLowerCase();
    if (s === 'r') return { kind: 'r' };
    if (s === 'flush') return { kind: 'flush' };
    if (s === 'crash') return { kind: 'crash' };
    const m = /^w:(-?\d{1,4})$/.exec(s);
    if (!m) throw new Error(`Unknown operation "${t}". Use w:<number>, r, flush or crash`);
    return { kind: 'w', v: Number(m[1]) };
  });
  return { policy, ops };
}

const viz: VizDef<In> = {
  id: 'hld-cache-writes',
  title: 'Write-through, write-back and write-around',
  code,
  language: 'python',
  inputs: [
    { key: 'policy', label: 'Write policy', kind: 'select', options: [...POLICIES], default: 'write-back' },
    { key: 'ops', label: 'Operations on key x', kind: 'strings', default: ['w:1', 'r', 'w:2', 'w:3', 'r', 'flush', 'w:4', 'crash', 'r'], maxItems: 14, help: 'w:<n> writes a value, r reads, flush copies dirty data to the database, crash wipes the cache.' },
  ],
  presets: [
    { label: 'Write-back, crash loses data', input: { policy: 'write-back' } },
    { label: 'Write-through', input: { policy: 'write-through' } },
    { label: 'Write-around', input: { policy: 'write-around' } },
    { label: 'Write-back, flushed in time', input: { policy: 'write-back', ops: ['w:1', 'w:2', 'flush', 'crash', 'r'] } },
  ],
  run(input) {
    const { policy, ops } = parse(input);
    const r = new Recorder(code);
    let cache: number | null = null;
    let db: number | null = null;
    let pending = 0;
    let dbWrites = 0;
    let lostWrites = 0;
    let hits = 0;
    let misses = 0;
    const reads: (number | null)[] = [];
    const lanes: Record<string, TimelineEvent[]> = { Client: [], Cache: [], Database: [] };
    let now = 0;
    const show = (v: number | null) => (v === null ? 'empty' : `x=${v}`);
    const view = (clientTone: Tone = 'default'): Panel[] => {
      const dirty = pending > 0;
      const nodes = [
        gnode('A', 'App', 50, 70, { shape: 'actor', tone: clientTone }),
        gnode('C', 'Cache', 190, 70, { tone: cache === null ? 'muted' : dirty ? 'swap' : 'done', badge: show(cache) + (dirty ? ` (${pending} dirty)` : ''), w: 100 }),
        gnode('D', 'Database', 340, 70, { shape: 'cylinder', tone: dirty ? 'error' : 'done', badge: show(db) + (dirty ? ' (stale)' : ''), w: 100 }),
      ];
      return [
        graph(nodes, [gedge('A', 'C', { flow: clientTone === 'active' }), gedge('C', 'D', { dashed: policy === 'write-back', label: policy === 'write-back' ? 'async flush' : undefined }), gedge('A', 'D', { curve: 40, dashed: policy !== 'write-around' })], 400, 130, 'Write path'),
        { type: 'timeline', title: `Timeline (op ${now})`, lanes: Object.entries(lanes).map(([label, events]) => ({ label, events: [...events] })), tMax: ops.length + 1, now, unit: 'op' },
      ];
    };

    r.step(undefined, `Policy: ${policy}. Cache and database both start empty`, view(), { policy });
    ops.forEach((op, i) => {
      now = i + 1;
      if (op.kind === 'w') {
        lanes.Client.push({ t: now, label: `w ${op.v}`, tone: 'active' });
        if (policy === 'write-through') {
          cache = op.v;
          db = op.v;
          dbWrites++;
          lanes.Cache.push({ t: now, label: String(op.v), tone: 'done' });
          lanes.Database.push({ t: now, label: String(op.v), tone: 'done' });
          r.step('through', `Write ${op.v}: cache and database updated before the ack`, view('active'), { value: op.v, dbWrites });
        } else if (policy === 'write-back') {
          cache = op.v;
          pending++;
          lanes.Cache.push({ t: now, label: String(op.v), tone: 'swap' });
          r.step('back', `Write ${op.v}: only the cache; database is behind by ${pending} write${pending > 1 ? 's' : ''}`, view('active'), { value: op.v, pending });
        } else {
          db = op.v;
          cache = null;
          dbWrites++;
          lanes.Database.push({ t: now, label: String(op.v), tone: 'done' });
          lanes.Cache.push({ t: now, label: 'drop', tone: 'muted' });
          r.step('around', `Write ${op.v}: straight to the database, cached copy dropped`, view('active'), { value: op.v, dbWrites });
        }
        r.op();
      } else if (op.kind === 'r') {
        lanes.Client.push({ t: now, label: 'read', tone: 'compare' });
        let at: 'fill' | 'read' = 'read';
        if (cache === null && db !== null) {
          cache = db;
          at = 'fill';
          misses++;
        } else if (cache !== null) hits++;
        else misses++;
        reads.push(cache);
        lanes.Cache.push({ t: now, label: at === 'fill' ? 'fill' : cache === null ? 'miss' : 'hit', tone: at === 'fill' ? 'new' : cache === null ? 'error' : 'found' });
        r.step(at, at === 'fill' ? `Read misses the cache, loads x=${db} from the database` : cache === null ? 'Read finds nothing anywhere' : `Read hits the cache: x=${cache}${pending && cache !== db ? ' (database has an older value)' : ''}`, view('compare'), { returned: cache });
        r.op();
      } else if (op.kind === 'flush') {
        if (policy === 'write-back' && pending > 0) {
          db = cache;
          dbWrites++;
          lanes.Database.push({ t: now, label: String(db), tone: 'done' });
          r.step('flush', `Flush: ${pending} buffered write${pending > 1 ? 's' : ''} reach the database as one write`, view(), { dbWrites });
          pending = 0;
        } else r.step('flush', 'Flush: nothing buffered, so nothing to do', view(), { pending });
        lanes.Client.push({ t: now, label: 'flush', tone: 'visited' });
      } else {
        lanes.Client.push({ t: now, label: 'crash', tone: 'error' });
        lanes.Cache.push({ t: now, label: 'crash', tone: 'error' });
        const lost = pending;
        lostWrites += lost;
        cache = null;
        pending = 0;
        r.step('crash', lost ? `Cache crashes: ${lost} acknowledged write${lost > 1 ? 's are' : ' is'} gone for good` : 'Cache crashes: nothing was waiting to be flushed', view(), { lost });
      }
    });
    const result = { reads, db, dbWrites, lostWrites, hits, misses };
    r.step(undefined, lostWrites ? `Result: ${lostWrites} acked write(s) lost, ${dbWrites} database write(s)` : `Result: no data lost, ${dbWrites} database write(s)`, [kvPanel('Outcome', { dbWrites, lostWrites, hits, misses, finalDb: db }, { lostWrites: lostWrites ? 'error' : 'found' })], { dbWrites, lostWrites });
    return { frames: r.frames, result };
  },
  reference(input) {
    const { policy, ops } = parse(input);
    const state = { cache: undefined as number | undefined, db: undefined as number | undefined, pending: 0 };
    const out = { reads: [] as (number | null)[], db: null as number | null, dbWrites: 0, lostWrites: 0, hits: 0, misses: 0 };
    for (const op of ops) {
      if (op.kind === 'w') {
        if (policy === 'write-through') {
          state.cache = op.v;
          state.db = op.v;
          out.dbWrites++;
        } else if (policy === 'write-back') {
          state.cache = op.v;
          state.pending++;
        } else {
          state.db = op.v;
          state.cache = undefined;
          out.dbWrites++;
        }
      } else if (op.kind === 'r') {
        if (state.cache === undefined) {
          out.misses++;
          if (state.db !== undefined) state.cache = state.db;
        } else out.hits++;
        out.reads.push(state.cache ?? null);
      } else if (op.kind === 'flush') {
        if (policy === 'write-back' && state.pending) {
          state.db = state.cache;
          out.dbWrites++;
          state.pending = 0;
        }
      } else {
        out.lostWrites += state.pending;
        state.pending = 0;
        state.cache = undefined;
      }
    }
    out.db = state.db ?? null;
    return out;
  },
};

const wbClass = `class WriteBackCache:
    def __init__(self):
        self.cache = {}
        self.db = {}
        self.dirty = set()

    def write(self, key, value):
        self.cache[key] = value
        self.dirty.add(key)

    def read(self, key):
        if key in self.cache:
            return self.cache[key]
        value = self.db.get(key)
        if value is not None:
            self.cache[key] = value
        return value

    def flush(self):
        n = len(self.dirty)
        for key in self.dirty:
            self.db[key] = self.cache[key]
        self.dirty.clear()
        return n

    def crash(self):
        lost = len(self.dirty)
        self.cache.clear()
        self.dirty.clear()
        return lost`;

const ops = (...n: string[]) => n;

const wbTests = [
  { args: [ops('WriteBackCache', 'write', 'read', 'crash', 'read'), [[], ['a', 1], ['a'], [], ['a']]], expected: [null, null, 1, 1, null], name: 'unflushed write lost on crash' },
  { args: [ops('WriteBackCache', 'write', 'flush', 'write', 'crash', 'read'), [[], ['a', 1], [], ['a', 2], [], ['a']]], expected: [null, null, 1, null, 1, 1], name: 'rewrite of a cached key is still dirty' },
  { args: [ops('WriteBackCache', 'write', 'write', 'write', 'flush', 'crash', 'read'), [[], ['a', 1], ['b', 2], ['a', 3], [], [], ['a']]], expected: [null, null, null, null, 2, 0, 3], name: 'flush coalesces repeated writes' },
  { args: [ops('WriteBackCache', 'flush', 'crash', 'read'), [[], [], [], ['z']]], expected: [null, 0, 0, null], name: 'empty cache' },
];

const unit: Unit = {
  id: 'hld-cache-writes',
  hook: 'How writes flow through a cache decides your latency, your database load and what you lose in a crash. Knowing all three policies and their failure windows is a standard follow-up to "add a cache".',
  predict: {
    prompt: 'A write-back cache acknowledges writes immediately and flushes to the database every 5 seconds. The cache node crashes 3 seconds after the last flush. What happened to the writes from those 3 seconds?',
    options: ['They are safe because the database replicated them', 'They are lost: only the cache had them', 'They are replayed from the database log', 'They are saved because the client retries automatically'],
    answer: 1,
    explain: 'Write-back trades durability for speed: acknowledged writes live only in cache memory until the flush. Anything since the last flush disappears with the node. Use it only when losing a few seconds of writes is acceptable, or when the cache persists a log.',
  },
  viz,
  deeper: {
    points: [
      'Write-through writes the cache and the database before acking: reads are always fresh and nothing is lost, but every write pays database latency.',
      'Write-back (write-behind) acks after the cache write and flushes later in batches: very fast and coalesces repeated writes to the same key, but the database is stale and a crash loses the dirty entries.',
      'Write-around writes only to the database and lets reads populate the cache: it avoids filling the cache with data that is never read again, but the first read after a write is a miss.',
      'Staleness window: write-back keeps the database behind by up to one flush interval; write-around keeps a cached copy stale unless you invalidate it on write.',
      'Pick by workload: write-heavy and loss-tolerant (counters, metrics) -> write-back; must-not-lose (payments) -> write-through; write-once-read-rarely -> write-around.',
    ],
    complexity: { time: 'Write-through: one database round trip per write; write-back: one per flush batch', space: 'Dirty set grows with unflushed keys' },
    pitfalls: ['Forgetting to mark a write dirty when the key was already cached', 'Flushing in a way that can overwrite a newer database value', 'Serving reads from a stale cached copy after a write-around write'],
  },
  practice: {
    language: 'python',
    fnName: 'WriteBackCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `WriteBackCache()` with a cache dict, a database dict and a set of dirty keys. `write(k, v)` updates only the cache and marks the key dirty. `read(k)` returns the cached value or loads it from the database. `flush()` copies dirty entries to the database and returns how many keys it flushed. `crash()` wipes the cache and returns how many dirty keys were lost.',
    signature: 'class WriteBackCache:',
    solution: `class WriteBackCache:
    def __init__(self):
        self.cache = {}
        self.db = {}
        self.dirty = set()

    def write(self, key, value):
        self.cache[key] = value
        @@self.dirty.add(key)@@

    def read(self, key):
        if key in self.cache:
            return self.cache[key]
        value = self.db.get(key)
        if value is not None:
            self.cache[key] = value
        return value

    def flush(self):
        n = len(self.dirty)
        for key in self.dirty:
            @@self.db[key] = self.cache[key]@@
        @@self.dirty.clear()@@
        return n

    def crash(self):
        lost = @@len(self.dirty)@@
        self.cache.clear()
        self.dirty.clear()
        return lost`,
    tests: wbTests,
  },
  debug: {
    language: 'python',
    fnName: 'WriteBackCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'After a flush, new writes to the same keys sometimes vanish after a crash even though a flush ran earlier, and the dirty count looks too low. Find the bug.',
    buggy: wbClass.replace('        self.dirty.add(key)\n\n    def read', '        if key not in self.cache:\n            self.dirty.add(key)\n\n    def read'),
    fixed: wbClass,
    tests: wbTests,
    bugType: 'dirty flag skipped',
    hint: 'When a key is already in the cache and gets rewritten, does the database still need the new value?',
    explanation: 'Whether a key is cached has nothing to do with whether the database is up to date. Every write makes the entry dirty; skipping the mark for already-cached keys means flush never copies the update, and a crash loses it.',
  },
  boss: {
    title: 'Cache write-policy simulator',
    statement:
      'Simulate a cache in front of a database with the given `policy` (`"through"`, `"back"` or `"around"`). Operations are `["w", key, value]`, `["r", key]`, `["flush"]` and `["crash"]`. Through: write cache and database. Back: write the cache and mark the key dirty; `flush` copies dirty keys to the database; `crash` wipes the cache and the dirty set. Around: write the database and drop the key from the cache. A read that misses the cache loads from the database into the cache. Return `{"reads": [...], "db": {...}}` where `reads` has one value (or `None`) per read.',
    language: 'python',
    fnName: 'simulate',
    starter: `def simulate(policy, ops):
    # your code here
    pass
`,
    solution: `def simulate(policy, ops):
    cache, db, dirty = {}, {}, set()
    reads = []
    for op in ops:
        kind = op[0]
        if kind == "w":
            _, key, value = op
            if policy == "through":
                cache[key] = value
                db[key] = value
            elif policy == "back":
                cache[key] = value
                dirty.add(key)
            else:
                db[key] = value
                cache.pop(key, None)
        elif kind == "r":
            key = op[1]
            if key not in cache and key in db:
                cache[key] = db[key]
            reads.append(cache.get(key))
        elif kind == "flush":
            for key in dirty:
                db[key] = cache[key]
            dirty.clear()
        else:
            cache.clear()
            dirty.clear()
    return {"reads": reads, "db": db}`,
    tests: [
      { args: ['through', [['w', 'a', 1], ['r', 'a'], ['w', 'a', 2], ['crash'], ['r', 'a'], ['flush']]], expected: { reads: [1, 2], db: { a: 2 } }, name: 'write-through survives a crash' },
      { args: ['back', [['w', 'a', 1], ['r', 'a'], ['w', 'a', 2], ['crash'], ['r', 'a'], ['flush']]], expected: { reads: [1, null], db: {} }, name: 'write-back loses unflushed data' },
      { args: ['around', [['w', 'a', 1], ['r', 'a'], ['w', 'a', 2], ['crash'], ['r', 'a'], ['flush']]], expected: { reads: [1, 2], db: { a: 2 } }, name: 'write-around' },
      { args: ['back', [['w', 'a', 1], ['flush'], ['w', 'b', 5], ['r', 'b'], ['w', 'a', 9], ['crash'], ['r', 'a'], ['r', 'b']]], expected: { reads: [5, 1, null], db: { a: 1 } }, name: 'flush saves only the earlier write' },
      { args: ['around', [['w', 'a', 1], ['flush'], ['w', 'b', 5], ['r', 'b'], ['w', 'a', 9], ['crash'], ['r', 'a'], ['r', 'b']]], expected: { reads: [5, 9, 5], db: { a: 9, b: 5 } }, name: 'around keeps every write in the database' },
      { args: ['back', []], expected: { reads: [], db: {} }, name: 'no operations' },
    ],
    hints: ['Keep three structures: cache dict, db dict and a dirty set. Handle each policy inside the write branch.', 'On a read, copy db[key] into the cache first if the key is missing from the cache but present in the database, then append `cache.get(key)`.'],
    combines: ['hld-caching-layers'],
  },
  quiz: [
    {
      prompt: 'Which policy best fits a "last seen" timestamp updated on every click, where losing a few seconds is fine?',
      options: ['Write-through', 'Write-back', 'Write-around', 'No cache'],
      answer: 1,
      explain: 'Updates are frequent, only the latest value matters, and a small loss is acceptable, so buffering and flushing in batches saves most database writes.',
    },
  ],
};

export default unit;
