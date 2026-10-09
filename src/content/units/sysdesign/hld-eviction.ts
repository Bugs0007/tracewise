import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, needInt, needOneOf, r2 } from '@/content/lib/sysdesign-hld-2';
import { barChart } from '@/content/lib/sysdesign-hld-3';

const code = `
def victim(policy, cache):
    # cache: key -> {"freq": uses, "last": time of last use, "ins": time inserted}
    if policy == "FIFO":
        return min(cache, key=lambda k: cache[k]["ins"])                    #@fifo
    if policy == "LRU":
        return min(cache, key=lambda k: cache[k]["last"])                   #@lru
    return min(cache, key=lambda k: (cache[k]["freq"], cache[k]["last"]))  #@lfu

def access(key, t):
    if key in cache:
        cache[key]["freq"] += 1                                             #@hit
        cache[key]["last"] = t
        return True
    if len(cache) >= capacity:
        del cache[victim(policy, cache)]                                    #@evict
    cache[key] = {"freq": 1, "last": t, "ins": t}                           #@insert
    return False
`;

const POLICIES = ['LRU', 'LFU', 'FIFO'] as const;
type Policy = (typeof POLICIES)[number];

interface Entry {
  freq: number;
  last: number;
  ins: number;
}

interface In {
  seq: string[];
  capacity: number;
  policy: string;
}

function victim(policy: Policy, cache: Map<string, Entry>): string {
  const keys = [...cache.keys()];
  const score = (k: string): number[] => {
    const e = cache.get(k)!;
    return policy === 'FIFO' ? [e.ins] : policy === 'LRU' ? [e.last] : [e.freq, e.last];
  };
  return keys.reduce((best, k) => {
    const a = score(k);
    const b = score(best);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? k : best;
    return best;
  });
}

function simulate(seq: string[], capacity: number, policy: Policy) {
  const cache = new Map<string, Entry>();
  let hits = 0;
  const evicted: string[] = [];
  seq.forEach((k, i) => {
    const t = i + 1;
    const e = cache.get(k);
    if (e) {
      hits++;
      e.freq++;
      e.last = t;
      return;
    }
    if (cache.size >= capacity) {
      const v = victim(policy, cache);
      evicted.push(v);
      cache.delete(v);
    }
    cache.set(k, { freq: 1, last: t, ins: t });
  });
  return { hits, evicted };
}

function parse(input: In) {
  const policy = needOneOf('policy', input.policy, POLICIES);
  const capacity = needInt('capacity', input.capacity, 1, 5);
  if (!input.seq.length || input.seq.length > 20) throw new Error('Give 1 to 20 accesses');
  const seq = input.seq.map((s) => s.trim());
  if (seq.some((s) => !s || s.length > 6)) throw new Error('Keys must be 1 to 6 characters');
  return { policy, capacity, seq };
}

const viz: VizDef<In> = {
  id: 'hld-eviction',
  title: 'LRU vs LFU vs FIFO eviction',
  code,
  language: 'python',
  inputs: [
    { key: 'seq', label: 'Access sequence', kind: 'strings', default: 'BAEABBCBADEDAC'.split(''), maxItems: 20 },
    { key: 'capacity', label: 'Cache capacity', kind: 'number', default: 3 },
    { key: 'policy', label: 'Policy', kind: 'select', options: [...POLICIES], default: 'LRU' },
  ],
  presets: [
    { label: 'LRU wins', input: { policy: 'LRU' } },
    { label: 'LFU wins (hot keys)', input: { seq: 'EBAEAEAECEBABB'.split(''), policy: 'LFU' } },
    { label: 'FIFO wins (odd loop)', input: { seq: 'DECCCBCDABEADA'.split(''), policy: 'FIFO' } },
    { label: 'Capacity 1', input: { capacity: 1, policy: 'LRU', seq: 'AABBAAB'.split('') } },
  ],
  run(input) {
    const { policy, capacity, seq } = parse(input);
    const r = new Recorder(code);
    const cache = new Map<string, Entry>();
    let hits = 0;
    const evicted: string[] = [];
    const rate: [number, number][] = [];
    const items = (marks: Record<string, ListItem['tone']> = {}): ListItem[] => {
      const keys = [...cache.keys()].sort((a, b) => {
        const x = cache.get(a)!;
        const y = cache.get(b)!;
        return policy === 'FIFO' ? x.ins - y.ins : policy === 'LRU' ? x.last - y.last : x.freq - y.freq || x.last - y.last;
      });
      return keys.map((k) => ({ label: k, sub: `f${cache.get(k)!.freq}`, tone: marks[k] ?? 'default' }));
    };
    const view = (marks?: Record<string, ListItem['tone']>): Panel[] => [
      { type: 'list', title: `Cache (${policy}, capacity ${capacity})`, items: items(marks), orientation: 'horizontal', startLabel: 'next out', emptyText: 'empty' },
      { type: 'chart', title: 'Hit rate so far (%)', series: [{ label: 'hit rate', points: [...rate], tone: 'found' }], xLabel: 'access', yLabel: '%' },
    ];

    r.step(undefined, `${seq.length} accesses, capacity ${capacity}, policy ${policy}`, view(), { policy, capacity });
    seq.forEach((k, i) => {
      const t = i + 1;
      const e = cache.get(k);
      if (e) {
        hits++;
        e.freq++;
        e.last = t;
        r.op();
        rate.push([t, Math.round((hits / t) * 100)]);
        r.step('hit', `Access ${k}: hit (used ${e.freq} times now)`, view({ [k]: 'found' }), { key: k, hits, t });
        return;
      }
      r.op();
      if (cache.size >= capacity) {
        const v = victim(policy, cache);
        const why = policy === 'FIFO' ? 'oldest insertion' : policy === 'LRU' ? 'least recently used' : `lowest frequency (${cache.get(v)!.freq})`;
        r.step(policy === 'FIFO' ? 'fifo' : policy === 'LRU' ? 'lru' : 'lfu', `Access ${k}: miss, cache full → evict ${v} (${why})`, view({ [v]: 'error' }), { key: k, victim: v, t });
        evicted.push(v);
        cache.delete(v);
      }
      cache.set(k, { freq: 1, last: t, ins: t });
      rate.push([t, Math.round((hits / t) * 100)]);
      r.step('insert', `Access ${k}: miss → loaded into the cache`, view({ [k]: 'new' }), { key: k, hits, t });
    });
    const cmp = Object.fromEntries(POLICIES.map((p) => [p, simulate(seq, capacity, p).hits])) as Record<Policy, number>;
    const best = Math.max(...Object.values(cmp));
    r.step(undefined, `${policy}: ${hits}/${seq.length} hits. All policies: ${POLICIES.map((p) => `${p} ${cmp[p]}`).join(', ')}`, [barChart('Hits by policy', [...POLICIES], POLICIES.map((p) => cmp[p]), { yLabel: 'hits', tone: 'done' }), kvPanel('Outcome', { hits, misses: seq.length - hits, hitRate: r2(hits / seq.length), bestPolicyHits: best })], { hits });
    return { frames: r.frames, result: { hits, misses: seq.length - hits, hitRate: r2(hits / seq.length), evicted, compare: cmp } };
  },
  reference(input) {
    const { policy, capacity, seq } = parse(input);
    const run = (p: Policy) => {
      let list: { k: string; f: number; last: number; ins: number }[] = [];
      let hits = 0;
      const out: string[] = [];
      seq.forEach((k, i) => {
        const hit = list.find((x) => x.k === k);
        if (hit) {
          hits++;
          hit.f++;
          hit.last = i;
          return;
        }
        if (list.length >= capacity) {
          const sorted = [...list].sort((a, b) => (p === 'FIFO' ? a.ins - b.ins : p === 'LRU' ? a.last - b.last : a.f - b.f || a.last - b.last));
          out.push(sorted[0].k);
          list = list.filter((x) => x !== sorted[0]);
        }
        list.push({ k, f: 1, last: i, ins: i });
      });
      return { hits, out };
    };
    const mine = run(policy);
    return { hits: mine.hits, misses: seq.length - mine.hits, hitRate: r2(mine.hits / seq.length), evicted: mine.out, compare: { LRU: run('LRU').hits, LFU: run('LFU').hits, FIFO: run('FIFO').hits } };
  },
};

const lruCode = `from collections import OrderedDict

def lru_hits(seq, capacity):
    cache = OrderedDict()
    hits = 0
    for key in seq:
        if key in cache:
            hits += 1
            cache.move_to_end(key)
        else:
            if len(cache) >= capacity:
                cache.popitem(last=False)
            cache[key] = True
    return hits`;

const unit: Unit = {
  id: 'hld-eviction',
  hook: 'A cache is only as good as what it throws away. Interviewers expect you to name LRU, explain why LFU or FIFO might beat it for some workloads, and know the cost of tracking recency.',
  predict: {
    prompt: 'A cache of size 3 sees the keys A B C D A B C D... in a loop. Which policy gets the best hit rate?',
    options: ['LRU, it always keeps the most recent keys', 'LFU, every key is used equally', 'None of them hits even once on this pattern', 'FIFO is always the worst'],
    answer: 2,
    explain: 'Four keys cycle through three slots. With LRU and FIFO, each new key evicts the one that will be needed next, so every access misses. A loop larger than the cache defeats recency-based policies, which is why scans can wreck an LRU cache.',
  },
  viz,
  deeper: {
    points: [
      'FIFO evicts the entry that arrived first, ignoring whether it is still being used. It is trivial to implement and sometimes surprisingly competitive, but it will throw out a hot key just because it is old.',
      'LRU evicts the entry unused for the longest time. It exploits temporal locality (recent things get used again) and is the default choice; a hash map plus a doubly linked list gives O(1) operations.',
      'LFU evicts the entry used least often, which protects consistently popular keys from one-off scans, but needs counters and can keep stale-but-once-popular keys forever (usually fixed with aging).',
      'A sequential scan or a loop slightly bigger than the cache is the worst case for LRU: scan-resistant variants (2Q, LRU-K, TinyLFU) exist for this reason.',
      'Besides capacity-based eviction, entries also expire by TTL; real caches combine both.',
    ],
    complexity: { time: 'O(1) per access for LRU (hash map + linked list); LFU needs O(1) frequency buckets', space: 'O(capacity)' },
    pitfalls: ['Forgetting to refresh recency on a hit (LRU degrades to FIFO)', 'LFU tie-breaking left undefined', 'Judging a policy on a tiny trace instead of real traffic'],
  },
  practice: {
    language: 'python',
    fnName: 'hit_count',
    statement:
      'Return how many accesses in `seq` are cache hits for a cache of `capacity` entries. With `policy="fifo"` evict the entry that entered first; with `policy="lru"` evict the least recently used one (a hit makes an entry the most recent).',
    signature: 'def hit_count(seq, capacity, policy):',
    solution: `def hit_count(seq, capacity, policy):
    cache = []
    hits = 0
    for key in seq:
        if key in cache:
            hits += 1
            if @@policy == "lru"@@:
                cache.remove(key)
                cache.append(key)
        else:
            if @@len(cache) >= capacity@@:
                @@cache.pop(0)@@
            cache.append(key)
    return hits`,
    tests: [
      { args: [['B', 'A', 'E', 'A', 'B', 'B', 'C', 'B', 'A', 'D', 'E', 'D', 'A', 'C'], 3, 'lru'], expected: 7, name: 'lru trace' },
      { args: [['B', 'A', 'E', 'A', 'B', 'B', 'C', 'B', 'A', 'D', 'E', 'D', 'A', 'C'], 3, 'fifo'], expected: 5, name: 'fifo trace' },
      { args: [['D', 'E', 'C', 'C', 'C', 'B', 'C', 'D', 'A', 'B', 'E', 'A', 'D', 'A'], 3, 'lru'], expected: 5, name: 'lru loses here' },
      { args: [['D', 'E', 'C', 'C', 'C', 'B', 'C', 'D', 'A', 'B', 'E', 'A', 'D', 'A'], 3, 'fifo'], expected: 7, name: 'fifo wins here' },
      { args: [['A', 'A', 'A', 'A'], 1, 'lru'], expected: 3, name: 'capacity one, repeated key' },
      { args: [[], 3, 'fifo'], expected: 0, name: 'empty sequence' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'lru_hits',
    statement: 'This LRU cache reports too many hits on some workloads and too few on others: it behaves unlike a real LRU. Find the bug.',
    buggy: lruCode.replace('cache.move_to_end(key)', 'cache.move_to_end(key, last=False)'),
    fixed: lruCode,
    tests: [
      { args: [['A', 'B', 'A', 'C', 'B'], 2], expected: 1, name: 'recent key must survive' },
      { args: [['B', 'A', 'E', 'A', 'B', 'B', 'C', 'B', 'A', 'D', 'E', 'D', 'A', 'C'], 3], expected: 7, name: 'longer trace' },
      { args: [['E', 'B', 'A', 'E', 'A', 'E', 'A', 'E', 'C', 'E', 'B', 'A', 'B', 'B'], 3], expected: 8, name: 'hot keys' },
      { args: [['D', 'E', 'C', 'C', 'C', 'B', 'C', 'D', 'A', 'B', 'E', 'A', 'D', 'A'], 3], expected: 5, name: 'mixed' },
      { args: [['A', 'B', 'C', 'D'], 2], expected: 0, name: 'all misses' },
    ],
    bugType: 'wrong end refreshed',
    hint: 'Which end of an OrderedDict does popitem(last=False) remove from, and where does move_to_end(key, last=False) put the key?',
    explanation: 'On a hit the key should become the most recently used, i.e. move to the END. With last=False it moves to the front, which is exactly where the next eviction happens, so the entry you just used is the first to go.',
  },
  boss: {
    title: 'Pick the best policy',
    statement:
      'Simulate FIFO, LRU and LFU caches of size `capacity` on `seq`. LFU evicts the entry with the lowest use count (a new entry has count 1, each hit adds 1), breaking ties by evicting the least recently used. Return the policy name with the most hits as `"FIFO"`, `"LRU"` or `"LFU"`; on ties prefer FIFO, then LRU.',
    language: 'python',
    fnName: 'best_policy',
    starter: `def best_policy(seq, capacity):
    # your code here
    pass
`,
    solution: `def best_policy(seq, capacity):
    def run(policy):
        cache = {}
        hits = 0
        for t, key in enumerate(seq):
            if key in cache:
                hits += 1
                cache[key]["freq"] += 1
                cache[key]["last"] = t
                continue
            if len(cache) >= capacity:
                if policy == "FIFO":
                    v = min(cache, key=lambda k: cache[k]["ins"])
                elif policy == "LRU":
                    v = min(cache, key=lambda k: cache[k]["last"])
                else:
                    v = min(cache, key=lambda k: (cache[k]["freq"], cache[k]["last"]))
                del cache[v]
            cache[key] = {"freq": 1, "last": t, "ins": t}
        return hits
    best = None
    best_hits = -1
    for p in ["FIFO", "LRU", "LFU"]:
        h = run(p)
        if h > best_hits:
            best, best_hits = p, h
    return best`,
    tests: [
      { args: [['B', 'A', 'E', 'A', 'B', 'B', 'C', 'B', 'A', 'D', 'E', 'D', 'A', 'C'], 3], expected: 'LRU', name: 'recency wins' },
      { args: [['E', 'B', 'A', 'E', 'A', 'E', 'A', 'E', 'C', 'E', 'B', 'A', 'B', 'B'], 3], expected: 'LFU', name: 'frequency wins' },
      { args: [['D', 'E', 'C', 'C', 'C', 'B', 'C', 'D', 'A', 'B', 'E', 'A', 'D', 'A'], 3], expected: 'FIFO', name: 'fifo wins' },
      { args: [['A', 'B', 'C', 'D'], 2], expected: 'FIFO', name: 'all tie, prefer FIFO' },
      { args: [['A', 'B', 'A', 'C', 'A', 'D', 'A', 'E', 'A', 'B'], 3], expected: 'LRU', name: 'tie between LRU and LFU' },
    ],
    hints: ['Write one helper that runs a single policy and returns its hit count, then compare the three.', 'Track per entry: use count, last-used time and insertion time. The victim is the min by insertion time (FIFO), last time (LRU) or (count, last time) (LFU). Only replace the best when the new count is strictly greater.'],
    combines: ['lld-lru-cache'],
  },
  quiz: [
    {
      prompt: 'A nightly job scans every row of a huge table once through your cache. What is the most likely effect under plain LRU?',
      options: ['The hot working set is evicted by rows that will never be read again', 'Nothing, LRU ignores scans', 'The cache doubles in size', 'Hit rate improves because all rows are cached'],
      answer: 0,
      explain: 'Each scanned row looks "recently used", so it displaces genuinely hot entries. Scan-resistant policies or bypassing the cache for scans avoid this.',
    },
  ],
};

export default unit;
