import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { SIM_NOTE, arch, frame, kvPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def cache_key(url, include_query):
    path, _, query = url.partition("?")
    return url if include_query else path                 #@key

def fresh(cache, key, now, ttl):
    return key in cache and now - cache[key] < ttl         #@fresh

def serve(caches, edge, url, now, ttl, include_query, shield_on):
    key = cache_key(url, include_query)
    if fresh(caches[edge], key, now, ttl):
        return "HIT"                                       #@hit
    if shield_on and fresh(caches["shield"], key, now, ttl):
        caches[edge][key] = now                            #@shield
        return "SHIELD_HIT"
    caches[edge][key] = now                                #@origin
    if shield_on:
        caches["shield"][key] = now
    return "ORIGIN"

def invalidate(caches, pattern):
    removed = 0
    for cache in caches.values():
        for key in list(cache):
            if key == pattern or (pattern.endswith("*") and key.startswith(pattern[:-1])):
                del cache[key]                             #@invalidate
                removed += 1
    return removed
`;

interface In {
  requests: string[];
  ttl: number;
  query: string;
  shield: string;
}

const QUERY = ['ignore the query string', 'include the query string'];
const SHIELD = ['origin shield on', 'origin shield off'];

type Item = { t: number; kind: 'get'; edge: 'A' | 'B'; url: string; text: string } | { t: number; kind: 'inv'; pattern: string; text: string };

function parseItem(s: string): Item {
  const text = s.trim();
  let m = text.match(/^(\d+)\s+(A|B)\s+(\/\S*)$/);
  if (m) return { t: Number(m[1]), kind: 'get', edge: m[2] as 'A' | 'B', url: m[3], text };
  m = text.match(/^(\d+)\s+INVALIDATE\s+(\/\S*)$/);
  if (m) return { t: Number(m[1]), kind: 'inv', pattern: m[2], text };
  throw new Error(`"${s}" should look like: 0 A /logo.png  or  75 INVALIDATE /img/*  (edge A or B)`);
}

function prep(i: In) {
  const items = i.requests.map(parseItem);
  if (!items.length) throw new Error('Add at least one request');
  for (let k = 1; k < items.length; k++) if (items[k].t < items[k - 1].t) throw new Error('Times must not go backwards');
  const ttl = Math.round(i.ttl);
  if (!(ttl >= 1)) throw new Error('TTL must be at least 1 second');
  return { items, ttl, includeQuery: i.query === QUERY[1], shieldOn: i.shield === SHIELD[0] };
}

const keyOf = (url: string, includeQuery: boolean): string => (includeQuery ? url : url.split('?')[0]);

const NODES_BASE: ArchNode[] = [
  { id: 'vA', label: 'Viewer A', x: 45, y: 40, shape: 'actor' },
  { id: 'vB', label: 'Viewer B', x: 45, y: 140, shape: 'actor' },
  { id: 'A', label: 'Edge A', x: 195, y: 40 },
  { id: 'B', label: 'Edge B', x: 195, y: 140 },
  { id: 'shield', label: 'Origin shield', x: 385, y: 90 },
  { id: 'origin', label: 'Origin (S3)', x: 560, y: 90, shape: 'cylinder' },
];

const viz: VizDef<In> = {
  id: 'aws-cloudfront',
  title: 'CloudFront edge cache, TTL and invalidation',
  code,
  language: 'python',
  inputs: [
    { key: 'requests', label: 'Requests (time edge path) or (time INVALIDATE pattern)', kind: 'strings', default: ['0 A /logo.png', '10 B /logo.png', '20 A /logo.png', '70 A /logo.png', '75 INVALIDATE /logo.png', '80 A /logo.png'], maxItems: 8, help: 'Times in seconds. INVALIDATE accepts a path or a prefix ending in *.' },
    { key: 'ttl', label: 'TTL (seconds)', kind: 'number', default: 60 },
    { key: 'query', label: 'Cache key', kind: 'select', default: QUERY[0], options: QUERY },
    { key: 'shield', label: 'Origin shield', kind: 'select', default: SHIELD[0], options: SHIELD },
  ],
  presets: [
    { label: 'Hit, shield hit, expiry, invalidation', input: {} },
    { label: 'Without a shield both edges hit the origin', input: { shield: SHIELD[1], requests: ['0 A /app.js', '1 B /app.js', '2 A /app.js', '3 B /app.js'] } },
    { label: 'Query string ignored vs included', input: { requests: ['0 A /search?q=1', '1 A /search?q=2', '2 A /search?q=1'] } },
    { label: 'Prefix invalidation', input: { requests: ['0 A /img/a.png', '0 A /img/b.png', '0 A /css/site.css', '5 INVALIDATE /img/*', '6 A /img/a.png', '6 A /css/site.css'] } },
  ],
  run(input) {
    const { items, ttl, includeQuery, shieldOn } = prep(input);
    const edges: ArchEdge[] = [{ from: 'vA', to: 'A' }, { from: 'vB', to: 'B' }];
    if (shieldOn) edges.push({ from: 'A', to: 'shield' }, { from: 'B', to: 'shield' }, { from: 'shield', to: 'origin' });
    else edges.push({ from: 'A', to: 'origin', dashed: true }, { from: 'B', to: 'origin', dashed: true });
    const nodes = NODES_BASE.filter((n) => shieldOn || n.id !== 'shield');
    const caches: Record<string, Record<string, number>> = { A: {}, B: {}, shield: {} };
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const out: string[] = [];
    let originHits = 0;
    let now = 0;
    const view = (tones: Record<string, Tone>, flow: string | null): Panel[] => {
      const entries: Record<string, string> = {};
      const kt: Record<string, Tone> = {};
      for (const [loc, c] of Object.entries(caches)) {
        if (loc === 'shield' && !shieldOn) continue;
        for (const [k, at] of Object.entries(c)) {
          const label = `${loc === 'shield' ? 'shield' : 'edge ' + loc} ${k}`;
          entries[label] = now - at < ttl ? `fresh until t=${at + ttl}` : `stale since t=${at + ttl}`;
          kt[label] = now - at < ttl ? 'found' : 'muted';
        }
      }
      if (!Object.keys(entries).length) entries['(all caches empty)'] = '';
      return [arch('Edge, shield and origin', 640, 185, nodes, edges, { tones, flow, badges: { origin: `${originHits} origin fetches` } }), kvPanel('Cache contents', entries, kt), logPanel('Outcomes', log)];
    };
    frame(r, 'key', `TTL ${ttl}s, origin shield ${shieldOn ? 'on' : 'off'}, cache key ${includeQuery ? 'keeps' : 'drops'} the query string`, view({}, null), { ttl });
    for (const it of items) {
      now = it.t;
      r.op();
      if (it.kind === 'inv') {
        let removed = 0;
        for (const c of Object.values(caches))
          for (const k of Object.keys(c))
            if (k === it.pattern || (it.pattern.endsWith('*') && k.startsWith(it.pattern.slice(0, -1)))) {
              delete c[k];
              removed++;
            }
        out.push(`INVALIDATED:${removed}`);
        log.push({ text: `t=${it.t} invalidate ${it.pattern}: ${removed} entries removed`, tone: 'swap' });
        frame(r, 'invalidate', `t=${it.t}: invalidate ${it.pattern} removes ${removed} cached entries everywhere`, view({ A: 'swap', B: 'swap', ...(shieldOn ? { shield: 'swap' } : {}) }, null), { removed });
        continue;
      }
      const key = keyOf(it.url, includeQuery);
      const v = it.edge === 'A' ? 'vA' : 'vB';
      frame(r, 'key', `t=${it.t}: viewer ${it.edge} asks for ${it.url}, cache key ${key}`, view({ [v]: 'active', [it.edge]: 'compare' }, `${v}>${it.edge}`), { t: it.t, key });
      const fresh = (loc: string) => key in caches[loc] && it.t - caches[loc][key] < ttl;
      let res: string;
      if (fresh(it.edge)) {
        res = 'HIT';
        frame(r, 'hit', `HIT: edge ${it.edge} copy is ${it.t - caches[it.edge][key]}s old (< ${ttl}s), served from the edge`, view({ [it.edge]: 'found', [v]: 'found' }, null), { age: it.t - caches[it.edge][key] });
      } else if (shieldOn && fresh('shield')) {
        res = 'SHIELD_HIT';
        caches[it.edge][key] = it.t;
        frame(r, 'shield', `Edge miss, shield hit: edge ${it.edge} copies ${key} from the shield, origin untouched`, view({ [it.edge]: 'new', shield: 'found' }, `${it.edge}>shield`), { origin_fetches: originHits });
      } else {
        res = 'ORIGIN';
        const why = key in caches[it.edge] ? 'expired' : 'not cached';
        caches[it.edge][key] = it.t;
        if (shieldOn) caches.shield[key] = it.t;
        originHits++;
        frame(r, 'origin', `Edge ${it.edge} ${why}${shieldOn ? ', shield too' : ''}: fetch from origin (#${originHits}), cache until t=${it.t + ttl}`, view({ [it.edge]: 'new', origin: 'active', ...(shieldOn ? { shield: 'new' } : {}) }, shieldOn ? 'shield>origin' : `${it.edge}>origin`), { origin_fetches: originHits });
      }
      out.push(res);
      log.push({ text: `t=${it.t} ${it.edge} ${it.url}: ${res}`, tone: res === 'ORIGIN' ? 'error' : 'found' });
    }
    frame(r, 'hit', `${items.length} requests: ${out.filter((x) => x === 'HIT').length} edge hits, ${originHits} origin fetches`, view({ origin: originHits ? 'compare' : 'done' }, null), { origin_fetches: originHits });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { items, ttl, includeQuery, shieldOn } = prep(input);
    // Independent formulation: each location is a list of {key, at} records, newest wins.
    type Rec = { key: string; at: number };
    const stores: Record<string, Rec[]> = { A: [], B: [], shield: [] };
    const find = (loc: string, key: string) => stores[loc].find((x) => x.key === key);
    const put = (loc: string, key: string, at: number) => {
      const e = find(loc, key);
      if (e) e.at = at;
      else stores[loc].push({ key, at });
    };
    const isFresh = (loc: string, key: string, t: number) => {
      const e = find(loc, key);
      return !!e && t < e.at + ttl;
    };
    return items.map((it) => {
      if (it.kind === 'inv') {
        let n = 0;
        for (const loc of Object.keys(stores)) {
          const keep = stores[loc].filter((e) => !(it.pattern.endsWith('*') ? e.key.startsWith(it.pattern.slice(0, -1)) : e.key === it.pattern));
          n += stores[loc].length - keep.length;
          stores[loc] = keep;
        }
        return `INVALIDATED:${n}`;
      }
      const key = keyOf(it.url, includeQuery);
      if (isFresh(it.edge, key, it.t)) return 'HIT';
      if (shieldOn && isFresh('shield', key, it.t)) {
        put(it.edge, key, it.t);
        return 'SHIELD_HIT';
      }
      put(it.edge, key, it.t);
      if (shieldOn) put('shield', key, it.t);
      return 'ORIGIN';
    });
  },
};

const unit: Unit = {
  id: 'aws-cloudfront',
  hook: 'A CDN question is really a cache question: what is the cache key, how long is a copy fresh, and how do you evict it early? CloudFront adds origin shield, which collapses many edge misses into one origin request.',
  predict: {
    prompt: 'Your TTL is 1 day and you deploy a new `app.js` at the same URL. Users keep getting the old file. What is the most robust fix going forward?',
    options: ['Lower the TTL to 1 second for everything', 'Version the file name (app.3f9c.js) and let old files expire; invalidate only the HTML entry point', 'Restart the origin', 'Disable CloudFront for that path'],
    answer: 1,
    explain: 'Invalidations work but are a blunt, rate-limited tool. Content-hashed file names make every deploy a brand-new cache key, so long TTLs are safe and only the small HTML file that references them needs a short TTL or an invalidation.',
  },
  viz,
  deeper: {
    points: [
      'The **cache key** decides what counts as the same object: by default the path, with optional query strings, headers and cookies. Every extra component in the key lowers the hit ratio.',
      'A copy is **fresh** for its TTL (from `Cache-Control: max-age` / `s-maxage` or the distribution defaults). After that CloudFront revalidates or refetches from the origin.',
      '**Origin shield** is an extra regional cache in front of the origin: misses from many edge locations are coalesced, protecting a small origin and raising the hit ratio.',
      '**Invalidations** remove objects early by path or wildcard. They cost money beyond the free quota and take time to propagate, so prefer versioned names.',
      'Also: signed URLs/cookies for private content, origin access control for S3, and edge functions for redirects and header rewrites.',
    ],
    pitfalls: ['Putting cookies or the whole query string in the cache key and never getting hits', 'Mixing up seconds and milliseconds in a TTL', 'Using invalidation as the normal deploy mechanism'],
  },
  practice: {
    language: 'python',
    fnName: 'EdgeCache',
    statement: 'Implement `EdgeCache(ttl, include_query)`. `get(url, now)` returns "HIT" if the cache key has a copy fetched less than `ttl` seconds ago; otherwise it stores `now` as the fetch time and returns "MISS". The key is the whole URL if `include_query` else the part before "?". `invalidate(prefix)` removes every key starting with `prefix` and returns how many were removed.',
    signature: 'class EdgeCache:',
    solution: `class EdgeCache:
    def __init__(self, ttl, include_query):
        self.ttl = ttl
        self.include_query = include_query
        self.store = {}

    def key(self, url):
        return url if self.include_query else @@url.split("?")[0]@@

    def get(self, url, now):
        k = self.key(url)
        if k in self.store and now - self.store[k] @@<@@ self.ttl:
            return "HIT"
        self.store[k] = @@now@@
        return "MISS"

    def invalidate(self, prefix):
        doomed = [k for k in self.store if @@k.startswith(prefix)@@]
        for k in doomed:
            del self.store[k]
        return len(doomed)`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [['EdgeCache', 'get', 'get', 'get'], [[60, false], ['/a.png', 0], ['/a.png', 59], ['/a.png', 60]]], expected: [null, 'MISS', 'HIT', 'MISS'], name: 'expires exactly at the TTL' },
      { args: [['EdgeCache', 'get', 'get', 'get'], [[60, false], ['/s?q=1', 0], ['/s?q=2', 1], ['/s', 2]]], expected: [null, 'MISS', 'HIT', 'HIT'], name: 'query string ignored' },
      { args: [['EdgeCache', 'get', 'get'], [[60, true], ['/s?q=1', 0], ['/s?q=2', 1]]], expected: [null, 'MISS', 'MISS'], name: 'query string in the key' },
      { args: [['EdgeCache', 'get', 'get', 'invalidate', 'get', 'get'], [[100, false], ['/img/a', 0], ['/css/x', 0], ['/img/'], ['/img/a', 6], ['/css/x', 6]]], expected: [null, 'MISS', 'MISS', 1, 'MISS', 'HIT'], name: 'prefix invalidation' },
      { args: [['EdgeCache', 'invalidate'], [[10, false], ['/x']]], expected: [null, 0], name: 'nothing to invalidate' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'is_fresh',
    statement: 'Objects cached with `max-age=60` are refetched from the origin after only a few milliseconds. Fix `is_fresh`.',
    buggy: `def is_fresh(fetched_ms, now_ms, max_age_s):
    return now_ms - fetched_ms < max_age_s`,
    fixed: `def is_fresh(fetched_ms, now_ms, max_age_s):
    return now_ms - fetched_ms < max_age_s * 1000`,
    tests: [
      { args: [0, 30000, 60], expected: true, name: 'half way through the TTL' },
      { args: [0, 60000, 60], expected: false, name: 'exactly at expiry' },
      { args: [1000, 60999, 60], expected: true, name: 'last millisecond' },
      { args: [5000, 5000, 1], expected: true, name: 'just fetched' },
    ],
    bugType: 'TTL unit mix-up',
    hint: 'One side of the comparison is in milliseconds. What unit is `max_age_s`?',
    explanation: 'Timestamps are milliseconds but `max-age` is in seconds, so the TTL was effectively 60 ms. Convert before comparing: `max_age_s * 1000`.',
  },
  boss: {
    title: 'CDN simulator with a shield',
    statement: 'Write `cdn(requests, ttl, include_query, shield_on)`. Requests are `[t, edge, target]` in time order: for edge "A" or "B", `target` is a URL; for edge "INVALIDATE", `target` is a pattern (exact key, or a prefix ending in "*"). There are three caches: edge A, edge B and a shield (used only if `shield_on`). The key is the URL, or the URL without "?query" unless `include_query`. A copy is fresh while `now - fetched < ttl`. Edge fresh gives "HIT". Else if the shield is on and fresh, store at the edge and give "SHIELD_HIT". Else store at the edge (and the shield if on) and give "ORIGIN". An invalidation removes matching keys from every cache and returns "INVALIDATED:n" with n the total removed. Return the list of results.',
    language: 'python',
    fnName: 'cdn',
    starter: `def cdn(requests, ttl, include_query, shield_on):
    pass
`,
    solution: `def cdn(requests, ttl, include_query, shield_on):
    caches = {"A": {}, "B": {}, "shield": {}}

    def fresh(cache, key, now):
        return key in cache and now - cache[key] < ttl

    out = []
    for t, edge, target in requests:
        if edge == "INVALIDATE":
            removed = 0
            for cache in caches.values():
                for key in list(cache):
                    if key == target or (target.endswith("*") and key.startswith(target[:-1])):
                        del cache[key]
                        removed += 1
            out.append("INVALIDATED:" + str(removed))
            continue
        key = target if include_query else target.split("?")[0]
        if fresh(caches[edge], key, t):
            out.append("HIT")
        elif shield_on and fresh(caches["shield"], key, t):
            caches[edge][key] = t
            out.append("SHIELD_HIT")
        else:
            caches[edge][key] = t
            if shield_on:
                caches["shield"][key] = t
            out.append("ORIGIN")
    return out`,
    tests: [
      { args: [[[0, 'A', '/l.png'], [10, 'B', '/l.png'], [20, 'A', '/l.png'], [70, 'A', '/l.png'], [75, 'INVALIDATE', '/l.png'], [80, 'A', '/l.png']], 60, false, true], expected: ['ORIGIN', 'SHIELD_HIT', 'HIT', 'ORIGIN', 'INVALIDATED:3', 'ORIGIN'], name: 'full walk-through' },
      { args: [[[0, 'A', '/a'], [1, 'B', '/a'], [2, 'A', '/a']], 60, false, false], expected: ['ORIGIN', 'ORIGIN', 'HIT'], name: 'no shield: each edge fetches' },
      { args: [[[0, 'A', '/s?q=1'], [1, 'A', '/s?q=2']], 60, true, true], expected: ['ORIGIN', 'ORIGIN'], name: 'query in the key' },
      { args: [[[0, 'A', '/s?q=1'], [1, 'A', '/s?q=2']], 60, false, true], expected: ['ORIGIN', 'HIT'], name: 'query dropped' },
      { args: [[[0, 'A', '/img/a'], [0, 'A', '/img/b'], [0, 'A', '/c'], [3, 'INVALIDATE', '/img/*'], [4, 'A', '/img/a'], [4, 'A', '/c']], 60, false, false], expected: ['ORIGIN', 'ORIGIN', 'ORIGIN', 'INVALIDATED:2', 'ORIGIN', 'HIT'], name: 'wildcard invalidation' },
      { args: [[[0, 'A', '/a'], [60, 'A', '/a']], 60, false, true], expected: ['ORIGIN', 'ORIGIN'], name: 'TTL boundary is exclusive' },
    ],
    hints: ['Keep three dicts `key -> fetched time`. A small `fresh(cache, key, now)` helper makes the three-way decision readable.', 'Invalidation loops over every cache with `list(cache)` (copy while deleting) and counts removals; the shield is cleared even when it is switched off, which is harmless because it stays empty.'],
    combines: ['aws-s3', 'be-caching'],
  },
  quiz: [
    {
      prompt: 'What does origin shield improve most?',
      options: ['Viewer latency on a hit', 'Origin load when many edge locations miss at once', 'TLS strength', 'Cost of invalidations'],
      answer: 1,
      explain: 'Shield adds one regional cache that all edge misses go through, so the origin sees one request per object instead of one per edge location.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
