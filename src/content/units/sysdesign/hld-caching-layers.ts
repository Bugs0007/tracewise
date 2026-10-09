import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, needOneOf } from '@/content/lib/sysdesign-hld-2';
import { barChart, splitToken } from '@/content/lib/sysdesign-hld-3';

const code = `
COST = {"browser": 1, "cdn": 30, "app": 45, "db": 90}      # ms to answer from here

def lookup(user, key, enabled, store):
    served = "db"
    for layer in enabled:                                  #@loop
        if layer == "cdn" and "." not in key:              #@static
            continue
        if key in store(layer, user):                      #@check
            served = layer
            break                                          #@hit
    for layer in enabled:
        if layer == served:
            break
        if layer != "cdn" or "." in key:
            store(layer, user).add(key)                    #@fill
    return served, COST[served]                            #@cost
`;

type Layer = 'browser' | 'cdn' | 'app' | 'db';
const ORDER: Layer[] = ['browser', 'cdn', 'app', 'db'];
const COST: Record<Layer, number> = { browser: 1, cdn: 30, app: 45, db: 90 };
const SETUPS: Record<string, Layer[]> = {
  'browser + CDN + app': ['browser', 'cdn', 'app'],
  'CDN + app': ['cdn', 'app'],
  'app cache only': ['app'],
  'no caching': [],
};

interface In {
  setup: string;
  requests: string[];
}

function parse(input: In) {
  const setup = needOneOf('setup', input.setup, Object.keys(SETUPS));
  if (!input.requests.length || input.requests.length > 14) throw new Error('Give 1 to 14 requests');
  return { enabled: SETUPS[setup], reqs: input.requests.map((t) => splitToken(t, 'request')) };
}

const viz: VizDef<In> = {
  id: 'hld-caching-layers',
  title: 'Where a request is answered: browser, CDN, app cache, database',
  code,
  language: 'python',
  inputs: [
    { key: 'setup', label: 'Caches enabled', kind: 'select', options: Object.keys(SETUPS), default: 'browser + CDN + app' },
    { key: 'requests', label: 'Requests (user:key)', kind: 'strings', default: ['u1:logo.png', 'u1:logo.png', 'u2:logo.png', 'u1:feed', 'u2:feed', 'u1:feed', 'u3:logo.png', 'u2:feed'], maxItems: 14, help: 'Keys with a "." are static files a CDN may cache; other keys are dynamic.' },
  ],
  presets: [
    { label: 'All layers', input: { setup: 'browser + CDN + app' } },
    { label: 'No CDN', input: { setup: 'app cache only' } },
    { label: 'No caching at all', input: { setup: 'no caching' } },
    { label: 'Everyone wants one key', input: { setup: 'browser + CDN + app', requests: ['u1:app.js', 'u2:app.js', 'u3:app.js', 'u4:app.js', 'u1:app.js'] } },
  ],
  run(input) {
    const { enabled, reqs } = parse(input);
    const r = new Recorder(code);
    const browsers = new Map<string, Set<string>>();
    const shared: Record<'cdn' | 'app', Set<string>> = { cdn: new Set(), app: new Set() };
    const store = (l: Layer, user: string): Set<string> => {
      if (l === 'browser') {
        if (!browsers.has(user)) browsers.set(user, new Set());
        return browsers.get(user)!;
      }
      return shared[l as 'cdn' | 'app'];
    };
    const hits: Record<Layer, number> = { browser: 0, cdn: 0, app: 0, db: 0 };
    const served: string[] = [];
    let latency = 0;
    const LABEL: Record<Layer, string> = { browser: 'Browser', cdn: 'CDN', app: 'App cache', db: 'Database' };
    const view = (user: string, marks: Partial<Record<Layer, { tone: Tone; badge: string }>>): Panel => {
      const nodes = ORDER.map((l, i) =>
        gnode(l, l === 'browser' ? `Browser (${user || '-'})` : LABEL[l], 52 + i * 112, 60, {
          shape: l === 'db' ? 'cylinder' : 'rect',
          w: 92,
          tone: marks[l]?.tone ?? (l !== 'db' && !enabled.includes(l) ? 'muted' : 'default'),
          badge: marks[l]?.badge ?? (l === 'db' ? undefined : enabled.includes(l) ? `${store(l, user).size} stored` : 'off'),
        }),
      );
      const edges = ORDER.slice(0, -1).map((l, i) => gedge(l, ORDER[i + 1], { tone: marks[ORDER[i + 1]]?.tone === 'error' || marks[l]?.tone === 'error' ? 'error' : 'default', flow: !!marks[ORDER[i + 1]] }));
      return graph(nodes, edges, 470, 120, 'Lookup path');
    };

    r.step(undefined, `${reqs.length} requests; caches: ${enabled.length ? enabled.join(' + ') : 'none'}`, [view('', {})], { requests: reqs.length });
    reqs.forEach(([user, key], i) => {
      const staticKey = key.includes('.');
      const marks: Partial<Record<Layer, { tone: Tone; badge: string }>> = {};
      let at: Layer = 'db';
      for (const l of enabled) {
        if (l === 'cdn' && !staticKey) {
          marks[l] = { tone: 'muted', badge: 'not cacheable' };
          continue;
        }
        r.op();
        if (store(l, user).has(key)) {
          marks[l] = { tone: 'found', badge: 'hit' };
          at = l;
          break;
        }
        marks[l] = { tone: 'error', badge: 'miss' };
      }
      if (at === 'db') marks.db = { tone: 'active', badge: 'origin' };
      hits[at]++;
      latency += COST[at];
      served.push(at);
      const hasMiss = Object.values(marks).some((m) => m.tone === 'error');
      r.step(at === 'db' ? 'cost' : 'hit', `#${i + 1} ${user} asks for ${key}: ${at === 'db' ? 'every layer misses, the database answers' : `${LABEL[at]} answers`} (${COST[at]} ms)`, [view(user, marks)], { key, from: at, ms: COST[at] });
      if (hasMiss || at !== 'browser') {
        const fill: Partial<Record<Layer, { tone: Tone; badge: string }>> = {};
        for (const l of enabled) {
          if (l === at) break;
          if (l === 'cdn' && !staticKey) continue;
          store(l, user).add(key);
          fill[l] = { tone: 'new', badge: 'stored' };
        }
        if (Object.keys(fill).length) r.step('fill', `Layers above ${LABEL[at]} keep a copy of ${key}`, [view(user, fill)], { key, filled: Object.keys(fill).join(',') });
      }
    });
    const avg = Math.round((latency / reqs.length) * 10) / 10;
    r.step('cost', `${hits.db} database reads for ${reqs.length} requests, average ${avg} ms`, [barChart('Where requests were answered', ORDER.map((l) => LABEL[l]), ORDER.map((l) => hits[l]), { yLabel: 'requests', tone: 'done' }), kvPanel('Outcome', { dbReads: hits.db, latencyTotal: latency, avgMs: avg }, { dbReads: hits.db > reqs.length / 2 ? 'error' : 'found' })], { dbReads: hits.db, avg });
    return { frames: r.frames, result: { served, hits, latency } };
  },
  reference(input) {
    const { enabled, reqs } = parse(input);
    const on = new Set<string>(enabled);
    const mine = new Map<string, Set<string>>();
    const cdn = new Set<string>();
    const app = new Set<string>();
    const served: string[] = [];
    const hits = { browser: 0, cdn: 0, app: 0, db: 0 };
    let latency = 0;
    for (const [user, key] of reqs) {
      const b = mine.get(user) ?? new Set<string>();
      mine.set(user, b);
      const stat = key.includes('.');
      const lvl: Layer = on.has('browser') && b.has(key) ? 'browser' : on.has('cdn') && stat && cdn.has(key) ? 'cdn' : on.has('app') && app.has(key) ? 'app' : 'db';
      served.push(lvl);
      hits[lvl]++;
      latency += COST[lvl];
      const idx = ORDER.indexOf(lvl);
      if (on.has('browser') && idx > 0) b.add(key);
      if (on.has('cdn') && stat && idx > 1) cdn.add(key);
      if (on.has('app') && idx > 2) app.add(key);
    }
    return { served, hits, latency };
  },
};

const cacheClass = `class LayeredCache:
    def __init__(self, n):
        self.layers = [set() for _ in range(n)]

    def get(self, key):
        served = len(self.layers)
        for i, layer in enumerate(self.layers):
            if key in layer:
                served = i
                break
        for i in range(served):
            self.layers[i].add(key)
        return served`;

const ops = (...n: string[]) => n;

const layerTests = [
  { args: [ops('LayeredCache', 'get', 'get'), [[3], ['a'], ['a']]], expected: [null, 3, 0], name: 'miss everywhere, then hit the top' },
  { args: [ops('LayeredCache', 'get', 'get', 'get'), [[3], ['a'], ['b'], ['a']]], expected: [null, 3, 3, 0], name: 'keys are independent' },
  { args: [ops('LayeredCache', 'get', 'get'), [[1], ['x'], ['x']]], expected: [null, 1, 0], name: 'one layer' },
  { args: [ops('LayeredCache', 'get', 'get', 'get', 'get'), [[2], ['a'], ['b'], ['a'], ['b']]], expected: [null, 2, 2, 0, 0], name: 'both keys warm' },
];

const unit: Unit = {
  id: 'hld-caching-layers',
  hook: 'Caching is not one box: browser, CDN, app cache and database buffer pool each catch a different slice of traffic. Interviewers want you to say which layer serves which data and what each costs in staleness.',
  predict: {
    prompt: 'A product page is requested by 10,000 different users, each opening it once. Which cache layer is the only one that can absorb most of those requests?',
    options: ['Each user\'s browser cache', 'A shared cache in front of the origin (CDN or app cache)', 'The database query log', 'None, 10,000 distinct users means 10,000 misses'],
    answer: 1,
    explain: 'A browser cache is per user, and each user asks only once, so it never hits. A shared layer (CDN for static content, an application cache like Redis for dynamic data) is populated by the first request and then serves the other 9,999.',
  },
  viz,
  deeper: {
    points: [
      'The browser cache is private and free but cannot be invalidated by you once served: control it with Cache-Control max-age and versioned filenames.',
      'A CDN caches static (and sometimes public dynamic) content close to users. It takes the biggest share of read traffic off your origin.',
      'An application cache (Redis, Memcached) holds computed or database results shared across all app servers, typically with a TTL or explicit invalidation.',
      'The database has its own caches (buffer pool, query cache), but a hit there still costs a network round trip and a connection.',
      'Every layer trades freshness for speed: the closer to the user, the harder it is to invalidate.',
    ],
    complexity: { time: 'Hit latency grows with distance: ~1 ms browser, tens of ms CDN/app, more at the origin', space: 'Each layer stores its own hot subset' },
    pitfalls: ['Caching personalised responses in a shared cache (data leak)', 'Long browser TTLs on files that change in place instead of using versioned names', 'Forgetting that a cache fill also needs invalidation'],
  },
  practice: {
    language: 'python',
    fnName: 'LayeredCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `LayeredCache(n)` with `n` cache layers (index 0 is closest to the user). `get(key)` returns the index of the first layer holding `key`, or `n` if none does (the origin answered). After a lookup every layer above the one that answered keeps a copy.',
    signature: 'class LayeredCache:',
    solution: `class LayeredCache:
    def __init__(self, n):
        self.layers = [@@set()@@ for _ in range(n)]

    def get(self, key):
        served = @@len(self.layers)@@
        for i, layer in enumerate(self.layers):
            if @@key in layer@@:
                served = i
                break
        for i in @@range(served)@@:
            self.layers[i].add(key)
        return served`,
    tests: layerTests,
  },
  debug: {
    language: 'python',
    fnName: 'LayeredCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'After the first request, repeating the same lookup is never answered by the closest layer, so the closest cache looks useless. Find the bug.',
    buggy: cacheClass.replace('for i in range(served):', 'for i in range(1, served):'),
    fixed: cacheClass,
    tests: layerTests,
    bugType: 'off-by-one fill',
    hint: 'Which layer indexes does the fill loop visit? Is layer 0 among them?',
    explanation: 'The fill must populate every layer above the one that answered, starting at index 0. Starting the range at 1 skips the closest layer, so it never learns the key.',
  },
  boss: {
    title: 'Latency report',
    statement:
      '`requests` is a list of `[user, key]`. There are three caches in front of the origin: a per-user browser cache (level 0), a shared CDN (level 1, only for keys containing a "."), and a shared app cache (level 2); level 3 is the origin. Each request is answered at the first level that holds the key, then every level above keeps a copy (the CDN only for static keys). `costs` has the four latencies. Return `{"hits": [b, c, a, o], "latency": total}`.',
    language: 'python',
    fnName: 'cache_report',
    starter: `def cache_report(requests, costs):
    # your code here
    pass
`,
    solution: `def cache_report(requests, costs):
    browsers = {}
    cdn = set()
    app = set()
    hits = [0, 0, 0, 0]
    latency = 0
    for user, key in requests:
        mine = browsers.setdefault(user, set())
        static = "." in key
        if key in mine:
            level = 0
        elif static and key in cdn:
            level = 1
        elif key in app:
            level = 2
        else:
            level = 3
        hits[level] += 1
        latency += costs[level]
        mine.add(key)
        if static and level >= 2:
            cdn.add(key)
        if level >= 3:
            app.add(key)
    return {"hits": hits, "latency": latency}`,
    tests: [
      { args: [[['u1', 'logo.png'], ['u1', 'logo.png'], ['u2', 'logo.png'], ['u2', 'feed'], ['u1', 'feed'], ['u3', 'feed']], [1, 30, 45, 90]], expected: { hits: [1, 1, 2, 2], latency: 301 }, name: 'mixed static and dynamic' },
      { args: [[], [1, 30, 45, 90]], expected: { hits: [0, 0, 0, 0], latency: 0 }, name: 'no requests' },
      { args: [[['u', 'k'], ['u', 'k'], ['u', 'k']], [1, 30, 45, 90]], expected: { hits: [2, 0, 0, 1], latency: 92 }, name: 'one user repeats' },
      { args: [[['u1', 'a.js'], ['u2', 'b'], ['u1', 'b'], ['u2', 'a.js']], [0, 10, 20, 100]], expected: { hits: [0, 1, 1, 2], latency: 230 }, name: 'custom costs' },
      { args: [[['u1', 'x.css'], ['u2', 'x.css'], ['u3', 'x.css']], [1, 30, 45, 90]], expected: { hits: [0, 2, 0, 1], latency: 150 }, name: 'CDN serves other users' },
    ],
    hints: ['Keep one set per user for the browser plus one shared set each for the CDN and the app cache. Work out the serving level first, then update the caches.', 'Fill rules: the browser always stores the key; the CDN stores it when the key is static and the level was 2 or 3; the app cache stores it only after an origin read.'],
    combines: ['hld-client-server'],
  },
  quiz: [
    {
      prompt: 'Which header strategy lets you cache a JavaScript bundle in browsers for a year and still ship updates immediately?',
      options: ['No-store on every response', 'Put a content hash in the filename and use a long max-age', 'A very short max-age of one second', 'Purge each user\'s browser cache from the server'],
      answer: 1,
      explain: 'A new build gets a new filename, so a year-long TTL is safe: the old URL is simply never requested again.',
    },
  ],
};

export default unit;
