import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
TTL = 10
cache = {}

def get_user(uid, now):
    entry = cache.get(uid)                                   #@lookup
    if entry and entry[1] > now:                             #@fresh
        return entry[0]                                      #@hit
    user = db_read(uid)                                      #@miss
    cache[uid] = (user, now + TTL)                           #@fill
    return user                                              #@return

def update_user(uid, name, now):
    db_write(uid, name)                                      #@write
    cache.pop(uid, None)                                     #@invalidate
`;

const MODES = ['invalidate on write', 'forget to invalidate'];

interface In {
  ttl: number;
  mode: string;
  ops: string[];
}

interface Op {
  kind: 'get' | 'update';
  t: number;
}

function parseOps(raw: string[]): Op[] {
  const out: Op[] = [];
  for (const s of raw) {
    const [k, t] = s.split(':').map((x) => x.trim().toLowerCase());
    const time = Number(t);
    if ((k === 'get' || k === 'update') && Number.isFinite(time) && time >= 0) out.push({ kind: k, t: time });
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 10);
}

const clampTtl = (n: number) => Math.max(1, Math.min(30, Math.round(n) || 10));

const viz: VizDef<In> = {
  id: 'be-caching',
  title: 'Cache-aside with TTL and invalidation',
  code,
  language: 'python',
  inputs: [
    { key: 'ttl', label: 'TTL (seconds)', kind: 'number', default: 10 },
    { key: 'mode', label: 'Write path', kind: 'select', default: MODES[0], options: MODES },
    { key: 'ops', label: 'Operations (op:time)', kind: 'strings', default: ['get:0', 'get:2', 'update:3', 'get:4', 'get:12'], maxItems: 10, help: 'get:0, update:3, ...' },
  ],
  presets: [
    { label: 'Invalidate', input: { ttl: 10, mode: MODES[0], ops: ['get:0', 'get:2', 'update:3', 'get:4', 'get:12'] } },
    { label: 'Forgot to invalidate', input: { ttl: 10, mode: MODES[1], ops: ['get:0', 'get:2', 'update:3', 'get:4', 'get:12'] } },
    { label: 'Short TTL', input: { ttl: 3, mode: MODES[0], ops: ['get:0', 'get:1', 'get:3', 'get:4', 'get:5'] } },
  ],
  run(input) {
    const r = new Recorder(code);
    const ttl = clampTtl(input.ttl);
    const invalidate = input.mode !== MODES[1];
    const ops = parseOps(input.ops);
    let dbName = 'ann';
    let versions = 1;
    let entry: { value: string; expires: number } | null = null;
    const segs: { t: number; dur: number; tone: Tone }[] = [];
    const reads: { t: number; label: string; tone: Tone }[] = [];
    const writes: { t: number; label: string; tone: Tone }[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const results: string[] = [];
    const tMax = Math.max(ttl + 1, (ops[ops.length - 1]?.t ?? 0) + 1);
    const view = (now: number, dbTone: Tone = 'default', cacheTone: Tone = 'default'): Panel[] => [
      kvPanel('Database', { 'user:1': dbName }, { 'user:1': dbTone }),
      kvPanel('Cache', entry ? { 'user:1': `${entry.value} (until t=${entry.expires})` } : { 'user:1': '(empty)' }, { 'user:1': cacheTone }),
      {
        type: 'timeline',
        title: 'Timeline',
        tMax,
        now,
        unit: 's',
        lanes: [
          { label: 'cache entry', events: segs.map((s) => ({ t: s.t, dur: s.dur, label: 'cached', tone: s.tone })) },
          { label: 'reads', events: reads.map((e) => ({ t: e.t, label: e.label, tone: e.tone })) },
          { label: 'writes', events: writes.map((e) => ({ t: e.t, label: e.label, tone: e.tone })) },
        ],
      },
      logPanel('Requests', log),
    ];
    r.step('lookup', `Cache starts empty; the database holds "${dbName}"`, view(0), { ttl });
    for (const op of ops) {
      r.op();
      const now = op.t;
      if (op.kind === 'get') {
        r.step('lookup', `t=${now}: GET user 1. Look in the cache first`, view(now), { now });
        const fresh = entry !== null && entry.expires > now;
        r.step('fresh', entry ? (fresh ? `Entry expires at ${entry.expires} > ${now}: still fresh` : `Entry expired at ${entry.expires} ≤ ${now}: treat as a miss`) : 'Nothing cached: miss', view(now, 'default', fresh ? 'found' : 'muted'), { now });
        if (fresh && entry) {
          const stale = entry.value !== dbName;
          reads.push({ t: now, label: stale ? 'STALE' : 'hit', tone: stale ? 'error' : 'found' });
          log.push({ text: `t=${now} hit -> ${entry.value}${stale ? '  (database says ' + dbName + ')' : ''}`, tone: stale ? 'error' : 'found' });
          results.push(entry.value);
          r.step('hit', stale ? `Hit returns "${entry.value}" but the database says "${dbName}": a stale read` : `Hit: return "${entry.value}" without touching the database`, view(now, stale ? 'swap' : 'default', stale ? 'error' : 'found'), { now, result: entry.value });
        } else {
          r.step('miss', `Miss: read "${dbName}" from the database`, view(now, 'active'), { now });
          entry = { value: dbName, expires: now + ttl };
          segs.push({ t: now, dur: ttl, tone: 'compare' });
          reads.push({ t: now, label: 'miss', tone: 'compare' });
          log.push({ text: `t=${now} miss -> ${dbName}`, tone: 'compare' });
          results.push(dbName);
          r.step('fill', `Store it in the cache until t=${entry.expires}`, view(now, 'default', 'new'), { now, expires: entry.expires });
          r.step('return', `Return "${dbName}"`, view(now), { now, result: dbName });
        }
      } else {
        versions++;
        dbName = `ann${versions}`;
        writes.push({ t: now, label: 'write', tone: 'swap' });
        log.push({ text: `t=${now} update -> ${dbName}`, tone: 'swap' });
        r.step('write', `t=${now}: PUT user 1. Database now holds "${dbName}"`, view(now, 'swap'), { now });
        if (invalidate) {
          entry = null;
          if (segs.length) segs[segs.length - 1].dur = Math.max(0.2, Math.min(segs[segs.length - 1].dur, now - segs[segs.length - 1].t));
          r.step('invalidate', 'Delete the cache key so the next read refills it', view(now, 'default', 'done'), { now });
        } else {
          r.step('invalidate', 'The invalidate line is missing: the old value stays cached', view(now, 'swap', 'error'), { now });
        }
      }
    }
    return { frames: r.frames, result: results };
  },
  reference(input) {
    const ttl = clampTtl(input.ttl);
    const invalidate = input.mode !== MODES[1];
    // Independent: remember when each cache fill happened and which version it captured.
    let version = 1;
    let fill: { at: number; version: number } | null = null;
    const out: string[] = [];
    for (const op of parseOps(input.ops)) {
      if (op.kind === 'update') {
        version++;
        if (invalidate) fill = null;
      } else {
        if (!fill || op.t >= fill.at + ttl) fill = { at: op.t, version };
        out.push(fill.version === 1 ? 'ann' : `ann${fill.version}`);
      }
    }
    return out;
  },
};

const ops = (...names: string[]) => names;

const unit: Unit = {
  id: 'be-caching',
  hook: 'A cache is the cheapest way to make an endpoint fast and the easiest way to make it wrong. Interviewers probe the write path: "how does a stale value get out of there?"',
  predict: {
    prompt: 'An update handler can (A) write the database, then delete the cache key, or (B) delete the cache key, then write the database. Which order is safer under concurrent reads?',
    options: ['A: write the DB, then delete the key', 'B: delete the key, then write the DB', 'They are equivalent', 'Neither: always update the cache first'],
    answer: 0,
    explain: 'With B, a reader can arrive between the two steps, miss, read the OLD row from the database and put it back in the cache, where it stays until the TTL. With A the worst case is a brief stale read before the delete lands.',
  },
  viz,
  deeper: {
    points: [
      '**Cache-aside**: the application reads the cache; on a miss it loads from the database and fills the cache. The cache never talks to the database itself.',
      'A **TTL** bounds how stale a value can get, even if you forget to invalidate. It is the safety net, not the plan.',
      'On writes, update the source of truth first, then **invalidate** (delete) the key. Deleting is simpler and safer than trying to write the new value into the cache.',
      'Hit rate is the metric to watch: `hits / (hits + misses)`. A cache with a low hit rate only adds latency.',
      'Cache misses for unknown keys too (negative caching, short TTL) or a flood of requests for a missing id will hammer the database.',
    ],
    complexity: { time: 'O(1) per lookup', space: 'O(cached keys)' },
    pitfalls: ['Updating the database but not the cache', 'Invalidating before writing', 'A TTL so long that stale data is user-visible', 'Caching per-user data under a shared key'],
  },
  practice: {
    language: 'python',
    fnName: 'UserStore',
    statement:
      'Implement `UserStore(ttl)` with a cache-aside read path. It owns `self.db = {1: "ann", 2: "bob"}`. `get_user(uid, now)` returns a cached name while its expiry is greater than `now`; otherwise it reads `self.db.get(uid)` (counting the read), caches it until `now + ttl` and returns it. Unknown users return None and are not cached. `update_user(uid, name, now)` writes the db and invalidates that key. `db_reads()` returns how many db reads happened.',
    signature: 'class UserStore:',
    solution: `class UserStore:
    def __init__(self, ttl):
        self.ttl = ttl
        self.db = {1: "ann", 2: "bob"}
        self.cache = {}
        self.reads = 0

    def get_user(self, uid, now):
        entry = self.cache.get(uid)
        if entry is not None and @@entry[1] > now@@:
            return entry[0]
        @@self.reads += 1@@
        name = self.db.get(uid)
        if name is not None:
            self.cache[uid] = (name, @@now + self.ttl@@)
        return name

    def update_user(self, uid, name, now):
        self.db[uid] = name
        @@self.cache.pop(uid, None)@@

    def db_reads(self):
        return self.reads`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('UserStore', 'get_user', 'get_user', 'get_user', 'db_reads'), [[10], [1, 0], [1, 5], [1, 10], []]], expected: [null, 'ann', 'ann', 'ann', 2], name: 'TTL expiry at the boundary' },
      { args: [ops('UserStore', 'get_user', 'get_user', 'update_user', 'get_user', 'db_reads'), [[10], [1, 0], [1, 1], [1, 'ann2', 2], [1, 3], []]], expected: [null, 'ann', 'ann', null, 'ann2', 2], name: 'update invalidates' },
      { args: [ops('UserStore', 'get_user', 'get_user', 'update_user', 'get_user', 'db_reads'), [[10], [1, 0], [2, 0], [2, 'bobby', 1], [1, 2], []]], expected: [null, 'ann', 'bob', null, 'ann', 2], name: 'other keys stay cached' },
      { args: [ops('UserStore', 'get_user', 'get_user', 'db_reads'), [[10], [9, 0], [9, 1], []]], expected: [null, null, null, 2], name: 'unknown users are not cached' },
      { args: [ops('UserStore', 'get_user', 'get_user', 'get_user', 'db_reads'), [[3], [2, 0], [2, 2], [2, 3], []]], expected: [null, 'bob', 'bob', 'bob', 2], name: 'short TTL' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'UserStore',
    statement: 'Users rename themselves, reload the page, and still see the old name for up to the TTL. Find why.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class UserStore:
    def __init__(self, ttl):
        self.ttl = ttl
        self.db = {1: "ann", 2: "bob"}
        self.cache = {}
        self.reads = 0

    def get_user(self, uid, now):
        entry = self.cache.get(uid)
        if entry is not None and entry[1] > now:
            return entry[0]
        self.reads += 1
        name = self.db.get(uid)
        if name is not None:
            self.cache[uid] = (name, now + self.ttl)
        return name

    def update_user(self, uid, name, now):
        self.db[uid] = name

    def db_reads(self):
        return self.reads`,
    fixed: `class UserStore:
    def __init__(self, ttl):
        self.ttl = ttl
        self.db = {1: "ann", 2: "bob"}
        self.cache = {}
        self.reads = 0

    def get_user(self, uid, now):
        entry = self.cache.get(uid)
        if entry is not None and entry[1] > now:
            return entry[0]
        self.reads += 1
        name = self.db.get(uid)
        if name is not None:
            self.cache[uid] = (name, now + self.ttl)
        return name

    def update_user(self, uid, name, now):
        self.db[uid] = name
        self.cache.pop(uid, None)

    def db_reads(self):
        return self.reads`,
    tests: [
      { args: [ops('UserStore', 'get_user', 'update_user', 'get_user'), [[10], [1, 0], [1, 'ann2', 1], [1, 2]]], expected: [null, 'ann', null, 'ann2'], name: 'read after update' },
      { args: [ops('UserStore', 'get_user', 'get_user', 'db_reads'), [[10], [1, 0], [1, 5], []]], expected: [null, 'ann', 'ann', 1], name: 'second read is a hit' },
      { args: [ops('UserStore', 'get_user', 'update_user', 'get_user', 'get_user', 'db_reads'), [[10], [2, 0], [2, 'bobby', 1], [2, 2], [2, 3], []]], expected: [null, 'bob', null, 'bobby', 'bobby', 2], name: 'refilled after invalidation' },
    ],
    bugType: 'cache not invalidated on write',
    hint: 'What happens to the cached entry when the row it was copied from changes?',
    explanation: 'update_user changes the database only, so the cache keeps serving the old copy until the TTL runs out. After writing the source of truth, delete the cached key.',
  },
  boss: {
    title: 'Lookup cache with negative caching and stats',
    statement:
      'Implement `CachedLookup(db, ttl, neg_ttl)` (db is a dict; copy it). `get(key, now)` returns the cached value while its expiry is greater than `now` (a hit, even for a cached "missing" result, which is None). Otherwise it is a miss: read `db.get(key)`, cache the result until `now + ttl` if found or `now + neg_ttl` if missing (negative caching), and return it. `set(key, value, now)` writes the db and invalidates that key. `stats()` returns `{"hits", "misses", "hit_rate"}` with hit_rate rounded to 2 decimals (0.0 when there were no gets).',
    language: 'python',
    fnName: 'CachedLookup',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class CachedLookup:
    # your code here
    pass
`,
    solution: `class CachedLookup:
    def __init__(self, db, ttl, neg_ttl):
        self.db = dict(db)
        self.ttl = ttl
        self.neg_ttl = neg_ttl
        self.cache = {}
        self.hits = 0
        self.misses = 0

    def get(self, key, now):
        entry = self.cache.get(key)
        if entry is not None and entry[1] > now:
            self.hits += 1
            return entry[0]
        self.misses += 1
        value = self.db.get(key)
        lifetime = self.ttl if value is not None else self.neg_ttl
        self.cache[key] = (value, now + lifetime)
        return value

    def set(self, key, value, now):
        self.db[key] = value
        self.cache.pop(key, None)

    def stats(self):
        total = self.hits + self.misses
        rate = round(self.hits / total, 2) if total else 0.0
        return {"hits": self.hits, "misses": self.misses, "hit_rate": rate}`,
    tests: [
      { args: [ops('CachedLookup', 'get', 'get', 'get', 'get', 'get', 'stats'), [[{ a: 'x' }, 10, 2], ['a', 0], ['a', 5], ['b', 0], ['b', 1], ['b', 2], []]], expected: [null, 'x', 'x', null, null, null, { hits: 2, misses: 3, hit_rate: 0.4 }], name: 'negative entries expire sooner' },
      { args: [ops('CachedLookup', 'get', 'set', 'get', 'get', 'stats'), [[{}, 5, 5], ['k', 0], ['k', 'v', 1], ['k', 1], ['k', 2], []]], expected: [null, null, null, 'v', 'v', { hits: 1, misses: 2, hit_rate: 0.33 }], name: 'a write clears a cached miss' },
      { args: [ops('CachedLookup', 'get', 'get', 'get', 'stats'), [[{ a: '1' }, 3, 1], ['a', 0], ['a', 3], ['a', 4], []]], expected: [null, '1', '1', '1', { hits: 1, misses: 2, hit_rate: 0.33 }], name: 'positive TTL' },
      { args: [ops('CachedLookup', 'set', 'get', 'stats'), [[{ a: '1' }, 5, 5], ['a', '2', 0], ['a', 0], []]], expected: [null, null, '2', { hits: 0, misses: 1, hit_rate: 0 }], name: 'set updates the db' },
      { args: [ops('CachedLookup', 'stats'), [[{}, 1, 1], []]], expected: [null, { hits: 0, misses: 0, hit_rate: 0 }], name: 'no traffic yet' },
    ],
    hints: ['Store `(value, expires_at)` tuples, including `(None, ...)` for missing keys. A cached None is still a hit.', 'Choose the lifetime after the db read: `ttl` if the value is not None, else `neg_ttl`. `set` must pop the key so a cached miss is dropped too.'],
    combines: ['be-pagination'],
  },
  quiz: [
    {
      prompt: 'Why use a TTL if you already invalidate on every write?',
      options: ['It makes reads faster', 'It bounds staleness when an invalidation is missed or lost', 'The database requires it', 'It prevents misses'],
      answer: 1,
      explain: 'Invalidation can fail (another code path writes the row, a delete is lost). A TTL guarantees the wrong value cannot live forever.',
    },
  ],
};

export default unit;
