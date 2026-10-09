import { Recorder } from '@/engine/recorder';
import type { ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, chartPanel, jaccard, kvPanel, short, step, words } from '@/content/lib/ai-finish-2';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
def make_key(model, prompt):
    return model + "|" + " ".join(re.findall(r"[a-z0-9]+", prompt.lower()))   #@key

def exact_get(cache, model, prompt, now, ttl):
    entry = cache.get(make_key(model, prompt))                    #@lookup
    if entry and now - entry["at"] < ttl:                         #@fresh
        return entry["value"]                                     #@hit
    return None                                                   #@miss

def semantic_get(entries, model, prompt, now, ttl, threshold):
    best, best_sim = None, 0.0
    for e in entries:
        if e["model"] != model or now - e["at"] >= ttl:           #@skip
            continue
        sim = jaccard(prompt, e["prompt"])                        #@sim
        if sim >= threshold and sim > best_sim:
            best, best_sim = e, sim                               #@best
    return best
`;

interface Entry {
  key: string;
  prompt: string;
  model: string;
  at: number;
  value: string;
}

const normalise = (p: string) => words(p).join(' ');
const keyOf = (model: string, prompt: string) => model + '|' + normalise(prompt);

const MODES = ['exact', 'semantic'];

interface In {
  queries: string[];
  mode: string;
  ttl: number;
  threshold: number;
  switch_at: number;
}

function clean(i: In) {
  const queries = (i.queries ?? []).map((q) => String(q).trim()).filter(Boolean);
  if (queries.length < 2) throw new Error('Enter at least two queries.');
  if (!MODES.includes(i.mode)) throw new Error('mode must be exact or semantic.');
  const ttl = Math.round(Number(i.ttl));
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 20) throw new Error('ttl must be between 1 and 20 requests.');
  const threshold = Number(i.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) throw new Error('threshold must be in (0, 1].');
  const sw = Math.round(Number(i.switch_at));
  return { queries, mode: i.mode, ttl, threshold, switchAt: Number.isFinite(sw) && sw > 0 ? sw : 0 };
}

type Kind = 'hit' | 'semantic hit' | 'expired' | 'miss';

interface Outcome {
  kind: Kind;
  entry?: Entry;
  sim?: number;
  expired?: Entry;
}

function simulate(queries: string[], mode: string, ttl: number, threshold: number, switchAt: number): { outcomes: Outcome[]; models: string[] } {
  const store = new Map<string, Entry>();
  const models = queries.map((_, i) => (switchAt && i + 1 >= switchAt ? 'model-b' : 'model-a'));
  const outcomes: Outcome[] = queries.map((q, i) => {
    const now = i + 1;
    const model = models[i];
    const k = keyOf(model, q);
    const e = store.get(k);
    if (e && now - e.at < ttl) return { kind: 'hit', entry: e };
    if (mode === 'semantic') {
      let best: Entry | undefined;
      let bs = 0;
      for (const c of store.values()) {
        if (c.model !== model || now - c.at >= ttl) continue;
        const s = jaccard(q, c.prompt);
        if (s >= threshold && s > bs) {
          best = c;
          bs = s;
        }
      }
      if (best) return { kind: 'semantic hit', entry: best, sim: Math.round(bs * 100) / 100 };
    }
    store.set(k, { key: k, prompt: q, model, at: now, value: `answer #${now}` });
    return e ? { kind: 'expired', expired: e } : { kind: 'miss' };
  });
  return { outcomes, models };
}

const viz: VizDef<In> = {
  id: 'ai-caching',
  title: 'Exact and semantic response caching',
  code,
  language: 'python',
  inputs: [
    {
      key: 'queries',
      label: 'Queries (one per tick)',
      kind: 'strings',
      default: ['What is the capital of France?', 'what is the capital of france', 'Capital city of France?', 'How tall is Mount Everest?', 'What is the capital of France?', 'Capital of France?'],
      maxItems: 10,
      help: 'Comma-separated; avoid commas inside a query.',
    },
    { key: 'mode', label: 'Cache type', kind: 'select', options: MODES, default: 'semantic' },
    { key: 'ttl', label: 'TTL (requests)', kind: 'number', default: 5 },
    { key: 'threshold', label: 'Similarity threshold', kind: 'number', default: 0.4 },
    { key: 'switch_at', label: 'Switch to model-b at request # (0 = never)', kind: 'number', default: 0 },
  ],
  presets: [
    { label: 'Exact cache', input: { mode: 'exact' } },
    { label: 'Semantic cache', input: { mode: 'semantic' } },
    { label: 'Short TTL', input: { mode: 'exact', ttl: 2 } },
    { label: 'Model changes mid-way', input: { mode: 'exact', switch_at: 5 } },
  ],
  run(input) {
    const { queries, mode, ttl, threshold, switchAt } = clean(input);
    const r = new Recorder(code);
    const { outcomes, models } = simulate(queries, mode, ttl, threshold, switchAt);
    const other = simulate(queries, mode === 'exact' ? 'semantic' : 'exact', ttl, threshold, switchAt).outcomes;
    const rateSeries = (out: Outcome[], n: number): [number, number][] => {
      let h = 0;
      return out.slice(0, n).map((o, i) => [i + 1, Math.round(((h += o.kind === 'hit' || o.kind === 'semantic hit' ? 1 : 0) / (i + 1)) * 100)] as [number, number]);
    };
    const live: Entry[] = [];
    let hits = 0;
    let sem = 0;
    const cacheList = (now: number, active?: string): ListPanel => ({
      type: 'list',
      title: 'Cache entries',
      orientation: 'vertical',
      items: live.map((e) => ({ id: e.key, label: `${e.model}: ${short(e.prompt, 30)}`, sub: `stored t=${e.at}, ${now - e.at >= ttl ? 'expired' : 'expires t=' + (e.at + ttl)}`, tone: (e.key === active ? 'active' : now - e.at >= ttl ? 'muted' : 'found') as Tone })),
      emptyText: 'empty',
    });
    const chart = (n: number): Panel =>
      chartPanel('Hit rate so far (%)', [{ label: mode, points: rateSeries(outcomes, n), tone: 'found' }, { label: mode === 'exact' ? 'semantic' : 'exact', points: rateSeries(other, n), tone: 'muted' }], 'request #', '% of requests served from cache', 'line');
    step(r, 'key', `Keys are model + normalised prompt; entries live ${ttl} requests (TTL). Mode: ${mode}`, [cacheList(0), kvPanel('Cache', { mode, ttl, threshold: mode === 'semantic' ? threshold : 'n/a' })], { ttl });
    queries.forEach((q, i) => {
      const now = i + 1;
      const model = models[i];
      const o = outcomes[i];
      r.op();
      step(r, 'lookup', `t=${now} [${model}] "${short(q, 38)}": key = "${short(keyOf(model, q), 40)}"`, [cacheList(now), chart(i)], { t: now });
      if (o.kind === 'hit') {
        hits++;
        step(r, 'hit', `Fresh entry for the same key (stored t=${o.entry!.at}): return it, no model call`, [cacheList(now, o.entry!.key), chart(i + 1)], { hits });
      } else if (o.kind === 'semantic hit') {
        hits++;
        sem++;
        step(r, 'best', `No exact key, but "${short(o.entry!.prompt, 26)}" is ${o.sim} similar (>= ${threshold}): reuse it`, [cacheList(now, o.entry!.key), chart(i + 1)], { hits, similarity: o.sim! });
      } else {
        const expired = o.kind === 'expired';
        step(r, expired ? 'fresh' : 'miss', expired ? `Entry from t=${o.expired!.at} is ${now - o.expired!.at} requests old >= TTL ${ttl}: expired, call the model` : 'Nothing usable cached: call the model and store the answer', [cacheList(now), chart(i + 1)], { hits });
        const k = keyOf(model, q);
        const idx = live.findIndex((e) => e.key === k);
        const entry: Entry = { key: k, prompt: q, model, at: now, value: `answer #${now}` };
        if (idx >= 0) live[idx] = entry;
        else live.push(entry);
      }
    });
    const result = { hits, misses: queries.length - hits, hit_rate: Math.round((hits / queries.length) * 100) / 100, semantic_hits: sem };
    step(r, 'hit', `${hits} of ${queries.length} requests served from cache (${Math.round(result.hit_rate * 100)}%)`, [cacheList(queries.length), chart(queries.length), kvPanel('Result', { hits, misses: result.misses, 'semantic hits': sem }, { hits: 'found' })], { hit_rate: result.hit_rate });
    return { frames: r.frames, result };
  },
  reference(input) {
    const { queries, mode, ttl, threshold, switchAt } = clean(input);
    const { outcomes } = simulate(queries, mode, ttl, threshold, switchAt);
    const hits = outcomes.filter((o) => o.kind === 'hit' || o.kind === 'semantic hit').length;
    return { hits, misses: queries.length - hits, hit_rate: Math.round((hits / queries.length) * 100) / 100, semantic_hits: outcomes.filter((o) => o.kind === 'semantic hit').length };
  },
};

const CACHE_OK = `import re

class ExactCache:
    def __init__(self, ttl):
        self.ttl = ttl
        self.data = {}

    def _key(self, model, prompt):
        return model + "|" + " ".join(re.findall(r"[a-z0-9]+", prompt.lower()))

    def put(self, model, prompt, value, now):
        self.data[self._key(model, prompt)] = (value, now)

    def get(self, model, prompt, now):
        hit = self.data.get(self._key(model, prompt))
        if hit and now - hit[1] < self.ttl:
            return hit[0]
        return None`;

const ENTRIES = [
  { vec: [1, 0], value: 'A' },
  { vec: [0, 1], value: 'B' },
  { vec: [0.9, 0.1], value: 'C' },
];

const unit: Unit = {
  id: 'ai-caching',
  hook: 'Caching is the cheapest speed-up in an LLM app, and the easiest to get subtly wrong. Interviewers ask what goes into the cache key, how long entries live, and when a semantic cache returns the wrong answer.',
  predict: {
    prompt: 'Your response cache key is just the normalised prompt text. You switch from model-a to model-b. What happens to cached answers?',
    options: ['They are correctly ignored', 'Requests are served model-a answers although model-b was requested', 'The cache is cleared automatically', 'Only the first request is affected'],
    answer: 1,
    explain: 'A key that omits the model (and parameters such as temperature or system prompt) treats different configurations as identical. Everything that changes the output belongs in the key.',
  },
  viz,
  deeper: {
    points: [
      'Exact cache: hash of everything that determines the answer (model, normalised prompt, system prompt, parameters). Fast and safe, low hit rate on free text.',
      'Semantic cache: compare embeddings (or word overlap) against stored prompts and reuse the nearest answer above a threshold. Higher hit rate, but near-duplicates can have different correct answers.',
      'TTL bounds staleness; choose it from how quickly the underlying facts change, and invalidate explicitly when data does.',
      'Never cache personalised or sensitive responses under a shared key; include the user or tenant in the key.',
      'Track hit rate and the cost saved; a cache with a 5% hit rate may not be worth its complexity.',
    ],
    pitfalls: ['Key without the model name', 'Threshold so low that different questions collide', 'No TTL, so stale answers live forever'],
  },
  practice: {
    language: 'python',
    fnName: 'lookup',
    statement: 'lookup(entries, query, threshold) is a semantic cache read. entries is a list of {"vec": [floats], "value": text}; query is a vector. Return the value of the entry with the highest cosine similarity that is >= threshold (the earlier entry wins ties), or None if there is none. A zero vector has similarity 0.',
    signature: 'def lookup(entries, query, threshold):',
    solution: `import math

def cosine(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return @@sum(x * y for x, y in zip(a, b))@@ / (na * nb)

def lookup(entries, query, threshold):
    best, best_sim = None, -1.0
    for e in entries:
        sim = cosine(e["vec"], query)
        if @@sim >= threshold and sim > best_sim@@:
            best, best_sim = @@e["value"]@@, sim
    return best`,
    tests: [
      { args: [ENTRIES, [1, 0.1], 0.99], expected: 'C', name: 'closest entry above threshold' },
      { args: [ENTRIES, [1, 0.1], 0.99999], expected: null, name: 'nothing close enough' },
      { args: [ENTRIES, [0, 1], 0.5], expected: 'B', name: 'exact direction' },
      { args: [[{ vec: [1, 1], value: 'first' }, { vec: [2, 2], value: 'second' }], [1, 1], 0.9], expected: 'first', name: 'ties keep the earlier entry' },
      { args: [ENTRIES, [0, 0], 0.1], expected: null, name: 'zero query vector' },
      { args: [[], [1, 0], 0.1], expected: null, name: 'empty cache' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'ExactCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'ExactCache(ttl) stores answers by model and normalised prompt: put(model, prompt, value, now), get(model, prompt, now) returns the value or None (an entry expires when now - stored >= ttl). After switching models the cache still returns the old model\'s answer.',
    buggy: CACHE_OK.replace('return model + "|" + " ".join', 'return " ".join'),
    fixed: CACHE_OK,
    tests: [
      { args: [['ExactCache', 'put', 'get'], [[10], ['m1', 'Hello World', 'hi', 0], ['m1', 'hello  world!', 1]]], expected: [null, null, 'hi'], name: 'same model, normalised prompt' },
      { args: [['ExactCache', 'put', 'get'], [[10], ['m1', 'Hello', 'hi', 0], ['m2', 'Hello', 1]]], expected: [null, null, null], name: 'other model must miss' },
      { args: [['ExactCache', 'put', 'get', 'get'], [[5], ['m1', 'q', 'a', 0], ['m1', 'q', 4], ['m1', 'q', 5]]], expected: [null, null, 'a', null], name: 'ttl boundary' },
      { args: [['ExactCache', 'put', 'put', 'get', 'get'], [[9], ['m1', 'q', 'old', 0], ['m2', 'q', 'new', 1], ['m1', 'q', 2], ['m2', 'q', 2]]], expected: [null, null, null, 'old', 'new'], name: 'one entry per model' },
    ],
    bugType: 'cache key ignores the model name',
    hint: 'Print the key for the same prompt under model m1 and m2. Are they different?',
    explanation: 'The key was only the normalised prompt, so m2 read (and overwrote) m1\'s entries. Include every input that changes the output, starting with the model name.',
  },
  boss: {
    title: 'TTL + LRU cache with stats',
    statement: 'Implement class TTLCache(capacity, ttl) with put(key, value, now), get(key, now) and stats(). get returns the value if the key exists and now - stored_at < ttl (a hit; the key becomes most recently used), otherwise None (a miss; an expired entry is deleted). put stores or overwrites the value with stored_at = now and makes the key most recently used; if the size then exceeds capacity, remove the least recently used key. stats() returns [hits, misses] counted over get calls.',
    language: 'python',
    fnName: 'TTLCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class TTLCache:
    def __init__(self, capacity, ttl):
        pass
`,
    solution: `from collections import OrderedDict

class TTLCache:
    def __init__(self, capacity, ttl):
        self.capacity = capacity
        self.ttl = ttl
        self.data = OrderedDict()
        self.hits = 0
        self.misses = 0

    def put(self, key, value, now):
        self.data[key] = (value, now)
        self.data.move_to_end(key)
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)

    def get(self, key, now):
        item = self.data.get(key)
        if item is not None and now - item[1] < self.ttl:
            self.data.move_to_end(key)
            self.hits += 1
            return item[0]
        if item is not None:
            del self.data[key]
        self.misses += 1
        return None

    def stats(self):
        return [self.hits, self.misses]`,
    tests: [
      { args: [['TTLCache', 'put', 'put', 'get', 'put', 'get', 'get', 'stats'], [[2, 10], ['a', 1, 0], ['b', 2, 0], ['a', 1], ['c', 3, 2], ['b', 3], ['c', 3], []]], expected: [null, null, null, 1, null, null, 3, [2, 1]], name: 'LRU evicts the least recently used' },
      { args: [['TTLCache', 'put', 'get', 'get', 'get', 'stats'], [[3, 5], ['a', 1, 0], ['a', 4], ['a', 5], ['a', 5], []]], expected: [null, null, 1, null, null, [1, 2]], name: 'entries expire after ttl' },
      { args: [['TTLCache', 'put', 'put', 'get', 'stats'], [[2, 5], ['a', 1, 0], ['a', 2, 4], ['a', 8], []]], expected: [null, null, null, 2, [1, 0]], name: 'overwrite refreshes the ttl' },
      { args: [['TTLCache', 'put', 'put', 'put', 'put', 'get', 'get'], [[2, 99], ['a', 1, 0], ['b', 2, 0], ['a', 5, 1], ['c', 3, 1], ['b', 2], ['a', 2]]], expected: [null, null, null, null, null, null, 5], name: 'overwrite makes the key most recent' },
      { args: [['TTLCache', 'get', 'stats'], [[1, 1], ['x', 0], []]], expected: [null, null, [0, 1]], name: 'miss on an empty cache' },
    ],
    hints: ['collections.OrderedDict gives you move_to_end(key) and popitem(last=False) for LRU order.', 'In get(), a key that exists but is expired must be deleted and counted as a miss.'],
    combines: ['ai-cost-latency'],
  },
  quiz: [
    {
      prompt: 'What is the main risk of a semantic cache compared with an exact cache?',
      options: ['It is slower than calling the model', 'Two similar-looking prompts with different correct answers can share a cached answer', 'It cannot expire entries', 'It needs the model name'],
      answer: 1,
      explain: '"Cancel my order" and "Do not cancel my order" are very similar text. A loose threshold returns the wrong cached answer, so tune the threshold and keep sensitive actions out of the cache.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
