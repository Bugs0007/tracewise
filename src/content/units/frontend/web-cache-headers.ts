import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function cacheAction(entry, now) {
  if (!entry) return 'fetch';                                          //@miss
  const ageSec = (now - entry.storedAt) / 1000;                        //@age
  if (!entry.noCache && ageSec < entry.maxAge) return 'use-cache';     //@fresh
  return entry.etag || entry.lastModified ? 'revalidate' : 'fetch';    //@stale
}

// origin, on a conditional request
if (req.headers['if-none-match'] === current.etag) return { status: 304 };  //@match
return { status: 200, body: current.body };                                //@full

// after a 200 the browser decides whether to keep a copy
if (!cc.noStore && !(sharedCache && cc.private)) cache.set(url, entry);    //@store
`;

interface In {
  cacheControl: string;
  cache: string;
  validator: string;
  changeAt: number;
  times: number[];
}

interface Entry {
  storedAt: number;
  maxAge: number;
  noCache: boolean;
  etag: string | null;
  lastModified: string | null;
  version: number;
}

const CC = ['max-age=60', 'max-age=0', 'no-cache', 'no-store', 'public, max-age=60', 'private, max-age=60'];
const CACHES = ['browser (private cache)', 'shared cache (CDN)'];
const VALIDATORS = ['etag', 'last-modified', 'none'];

function parseCC(v: string) {
  const parts = v.split(',').map((p) => p.trim().toLowerCase());
  const ma = parts.map((p) => p.match(/^max-age=(\d+)$/)).find(Boolean);
  return { noStore: parts.includes('no-store'), noCache: parts.includes('no-cache'), isPrivate: parts.includes('private'), maxAge: ma ? Number(ma[1]) : 0 };
}

function cacheAction(entry: Entry | null, now: number): 'fetch' | 'use-cache' | 'revalidate' {
  if (!entry) return 'fetch';
  const ageSec = (now - entry.storedAt) / 1000;
  if (!entry.noCache && ageSec < entry.maxAge) return 'use-cache';
  return entry.etag || entry.lastModified ? 'revalidate' : 'fetch';
}

type Outcome = { t: number; outcome: '200 network' | '200 cache' | '304'; version: number };

const viz: VizDef<In> = {
  id: 'web-cache-headers',
  title: 'HTTP caching: freshness, validators, 304',
  code,
  language: 'javascript',
  inputs: [
    { key: 'cacheControl', label: 'Cache-Control on the response', kind: 'select', default: 'max-age=60', options: CC },
    { key: 'cache', label: 'Cache in use', kind: 'select', default: CACHES[0], options: CACHES },
    { key: 'validator', label: 'Validator sent by the server', kind: 'select', default: 'etag', options: VALIDATORS },
    { key: 'changeAt', label: 'Resource changes on the server at t (s)', kind: 'number', default: 90 },
    { key: 'times', label: 'Page requests at t (seconds)', kind: 'numbers', default: [0, 20, 70, 100, 130], maxItems: 8 },
  ],
  presets: [
    { label: 'max-age + ETag', input: { cacheControl: 'max-age=60', cache: CACHES[0], validator: 'etag', changeAt: 90, times: [0, 20, 70, 100, 130] } },
    { label: 'no-cache', input: { cacheControl: 'no-cache', cache: CACHES[0], validator: 'etag', changeAt: 50, times: [0, 10, 60, 70] } },
    { label: 'no-store', input: { cacheControl: 'no-store', cache: CACHES[0], validator: 'etag', changeAt: 50, times: [0, 10, 60] } },
    { label: 'Stale without a validator', input: { cacheControl: 'max-age=60', cache: CACHES[0], validator: 'none', changeAt: 20, times: [0, 10, 40, 80] } },
    { label: 'Last-Modified', input: { cacheControl: 'max-age=0', cache: CACHES[0], validator: 'last-modified', changeAt: 25, times: [0, 10, 30, 40] } },
    { label: 'private on a CDN', input: { cacheControl: 'private, max-age=60', cache: CACHES[1], validator: 'etag', changeAt: 500, times: [0, 10, 20] } },
  ],
  run(input) {
    const r = new Recorder(code);
    if (!CC.includes(input.cacheControl) || !CACHES.includes(input.cache) || !VALIDATORS.includes(input.validator)) throw new Error('Pick values from the lists');
    const times = [...input.times].sort((a, b) => a - b);
    if (!times.length || times.some((t) => t < 0)) throw new Error('Give at least one request time (seconds, >= 0)');
    const cc = parseCC(input.cacheControl);
    const shared = input.cache === CACHES[1];
    const storable = !cc.noStore && !(shared && cc.isPrivate);
    const serverVersion = (t: number) => (t >= input.changeAt ? 2 : 1);
    const etagOf = (v: number) => (input.validator === 'etag' ? `"v${v}"` : null);
    const lmOf = (v: number) => (input.validator === 'last-modified' ? `rev-${v}` : null);
    const tMax = Math.max(...times, input.changeAt) + 15;
    const lanes = [
      { label: 'Browser / cache', events: [] as { t: number; dur: number; label: string; tone: Tone }[] },
      { label: 'Network', events: [] as { t: number; dur: number; label: string; tone: Tone }[] },
      { label: 'Server', events: [{ t: Math.min(input.changeAt, tMax - 1), dur: 1, label: 'content v2', tone: 'swap' as Tone }] },
    ];
    let entry: Entry | null = null;
    const out: Outcome[] = [];
    const entryKv = () => ({ type: 'kv' as const, title: 'Cache entry', entries: entry ? [{ k: 'stored at (s)', v: entry.storedAt / 1000 }, { k: 'max-age (s)', v: entry.maxAge }, { k: 'no-cache', v: entry.noCache }, { k: 'validator', v: entry.etag ?? entry.lastModified ?? 'none' }, { k: 'content version', v: entry.version }] : [{ k: 'entry', v: 'empty', tone: 'muted' as Tone }] });
    const tl = (now: number) => ({ type: 'timeline' as const, title: `Cache-Control: ${input.cacheControl} (${shared ? 'CDN' : 'browser'})`, lanes, tMax, now, unit: 's' });

    for (const t of times) {
      const now = t * 1000;
      const action = cacheAction(entry, now);
      r.op();
      if (!entry) r.step('miss', `t=${t}s: nothing cached for this URL`, [tl(t), entryKv()], { t });
      else r.step('age', `t=${t}s: entry is ${(now - entry.storedAt) / 1000}s old, max-age ${entry.maxAge}s${entry.noCache ? ', no-cache forces a check' : ''}`, [tl(t), entryKv()], { t, age: (now - entry.storedAt) / 1000 });
      if (action === 'use-cache') {
        const e = entry!;
        lanes[0].events.push({ t, dur: 1, label: 'hit', tone: 'found' });
        out.push({ t, outcome: '200 cache', version: e.version });
        const staleNote = serverVersion(t) !== e.version ? ' (the server changed, but the copy is still fresh)' : '';
        r.step('fresh', `Fresh: served from cache, no network request${staleNote}`, [tl(t), entryKv()], { t, source: 'cache' });
        continue;
      }
      let sentConditional = false;
      if (action === 'revalidate') {
        const e = entry!;
        sentConditional = true;
        lanes[0].events.push({ t, dur: 1, label: 'stale', tone: 'compare' });
        r.step('stale', `Stale but has a validator: ask the server with ${e.etag ? 'If-None-Match ' + e.etag : 'If-Modified-Since ' + e.lastModified}`, [tl(t), entryKv()], { t });
        const v = serverVersion(t);
        const same = e.etag ? e.etag === etagOf(v) : e.lastModified === lmOf(v);
        if (same) {
          lanes[1].events.push({ t, dur: 2, label: '304', tone: 'visited' });
          const refreshed: Entry = { ...e, storedAt: now };
          entry = refreshed;
          out.push({ t, outcome: '304', version: e.version });
          r.step('match', `Validator matches: 304 Not Modified, no body. Freshness restarts at t=${t}s`, [tl(t), entryKv()], { t, status: 304 });
          continue;
        }
      } else if (entry) {
        lanes[0].events.push({ t, dur: 1, label: 'stale', tone: 'compare' });
        r.step('stale', 'Stale and nothing to validate with: full request', [tl(t), entryKv()], { t });
      }
      // full 200
      const v = serverVersion(t);
      lanes[1].events.push({ t, dur: 2, label: sentConditional ? '200 new' : '200', tone: 'active' });
      out.push({ t, outcome: '200 network', version: v });
      r.step('full', sentConditional ? `Validator differs (content v${v}): 200 with a new body` : `Full download of content v${v}: 200 with body`, [tl(t), entryKv()], { t, status: 200, version: v });
      if (storable) {
        entry = { storedAt: now, maxAge: cc.maxAge, noCache: cc.noCache, etag: etagOf(v), lastModified: lmOf(v), version: v };
        r.step('store', `Stored for reuse: max-age ${cc.maxAge}s${cc.noCache ? ', but no-cache means revalidate every time' : ''}`, [tl(t), entryKv()], { t, stored: true });
      } else {
        entry = null;
        r.step('store', cc.noStore ? 'no-store: this response is never written to a cache' : 'private: a shared cache (CDN) must not store it', [tl(t), entryKv()], { t, stored: false });
      }
    }
    return { frames: r.frames, result: out };
  },
  reference(i) {
    const cc = parseCC(i.cacheControl);
    const shared = i.cache === CACHES[1];
    const keep = !cc.noStore && !(shared && cc.isPrivate);
    const hasValidator = i.validator !== 'none';
    let have: { at: number; ver: number } | null = null;
    const res: Outcome[] = [];
    for (const t of [...i.times].sort((a, b) => a - b)) {
      const ver = t >= i.changeAt ? 2 : 1;
      if (have) {
        const fresh = !cc.noCache && t - have.at < cc.maxAge;
        if (fresh) {
          res.push({ t, outcome: '200 cache', version: have.ver });
          continue;
        }
        if (hasValidator && have.ver === ver) {
          have = { at: t, ver: have.ver };
          res.push({ t, outcome: '304', version: have.ver });
          continue;
        }
      }
      res.push({ t, outcome: '200 network', version: ver });
      have = keep ? { at: t, ver } : null;
    }
    return res;
  },
};

const E = (o: Record<string, unknown> = {}) => ({ storedAt: 1_000_000, maxAge: 60, noCache: false, etag: '"a"', lastModified: null, ...o });
const T0 = 1_000_000;

const actionTests = [
  { args: [null, T0], expected: 'fetch', name: 'nothing cached' },
  { args: [E(), T0 + 30_000], expected: 'use-cache', name: 'fresh' },
  { args: [E(), T0 + 90_000], expected: 'revalidate', name: 'stale with ETag' },
  { args: [E({ etag: null }), T0 + 90_000], expected: 'fetch', name: 'stale, no validator' },
  { args: [E({ etag: null, lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT' }), T0 + 90_000], expected: 'revalidate', name: 'stale with Last-Modified' },
  { args: [E({ noCache: true }), T0 + 1_000], expected: 'revalidate', name: 'no-cache is never fresh' },
  { args: [E(), T0 + 60_000], expected: 'revalidate', name: 'age == max-age is stale' },
  { args: [E({ maxAge: 0 }), T0], expected: 'revalidate', name: 'max-age=0' },
];

const unit: Unit = {
  id: 'web-cache-headers',
  hook: 'Caching is the cheapest performance win and the easiest way to ship stale bugs. Interviewers ask what `no-cache` really means and how a 304 saves bytes, not time.',
  predict: {
    prompt: 'A response carries `Cache-Control: no-cache` and an `ETag`. What does the browser do the next time the page asks for it?',
    options: ['Never stores it', 'Serves it from cache without contacting the server', 'Stores it, but asks the server to validate it first (possibly getting a 304)', 'Treats it as max-age=3600'],
    answer: 2,
    explain: '`no-cache` means "you may store this, but revalidate before every reuse". `no-store` is the directive that forbids storing. A matching ETag gives a body-less 304.',
  },
  viz,
  simulationNote: 'A single-URL cache with seconds-based max-age, ETag / Last-Modified validators and one content change. No heuristic freshness (Last-Modified alone), Vary, Age header or stale-while-revalidate.',
  deeper: {
    points: [
      '`max-age=N` lets a cache reuse the response for N seconds without asking the server. `no-cache` allows storing but demands validation first; `no-store` forbids storing at all.',
      '`private` means only the user browser may keep it; `public` allows shared caches (CDN, proxy) as well. Responses to requests with credentials should usually be `private`.',
      'Validators make stale entries cheap: the browser sends `If-None-Match` (ETag) or `If-Modified-Since` (Last-Modified); a match returns `304` with no body and renews freshness.',
      'If both validators are sent, `If-None-Match` wins. ETags may be weak (`W/"x"`), which is fine for caching but not for range requests.',
      'Fingerprint static assets (`app.3f9c.js`) and give them `max-age=31536000, immutable`; keep HTML short-lived or `no-cache` so deploys take effect.',
    ],
    pitfalls: ['Using `no-cache` when you meant `no-store` for sensitive data', 'Mixing seconds (header) with milliseconds (Date.now) when computing age', 'Caching HTML with a long max-age and then being unable to ship a fix'],
  },
  practice: {
    language: 'javascript',
    fnName: 'cacheAction',
    statement: 'entry is null or {storedAt (ms), maxAge (seconds), noCache, etag, lastModified}; now is epoch ms. Return "fetch" (go to the network), "use-cache" (still fresh) or "revalidate" (stale but has a validator). A no-cache entry is never fresh; a stale entry without ETag or Last-Modified needs a full fetch.',
    signature: 'function cacheAction(entry, now) {',
    solution: `function cacheAction(entry, now) {
  if (!entry) return 'fetch';
  const ageSec = @@(now - entry.storedAt) / 1000@@;
  if (@@!entry.noCache && ageSec < entry.maxAge@@) return 'use-cache';
  return @@entry.etag || entry.lastModified@@ ? 'revalidate' : 'fetch';
}`,
    tests: actionTests,
  },
  debug: {
    language: 'javascript',
    fnName: 'cacheAction',
    statement: 'Every cached asset is treated as stale right away, so the app re-validates on every request. Find the bug.',
    buggy: `function cacheAction(entry, now) {
  if (!entry) return 'fetch';
  const age = now - entry.storedAt;
  if (!entry.noCache && age < entry.maxAge) return 'use-cache';
  return entry.etag || entry.lastModified ? 'revalidate' : 'fetch';
}`,
    fixed: `function cacheAction(entry, now) {
  if (!entry) return 'fetch';
  const age = (now - entry.storedAt) / 1000;
  if (!entry.noCache && age < entry.maxAge) return 'use-cache';
  return entry.etag || entry.lastModified ? 'revalidate' : 'fetch';
}`,
    tests: actionTests,
    bugType: 'unit mismatch (ms vs s)',
    hint: 'Compare the unit of `now - storedAt` with the unit of `maxAge`.',
    explanation: '`Date.now()` is in milliseconds but `max-age` is in seconds. Comparing a 30,000 ms age with a 60 s lifetime says the entry is 500 times too old. Convert the age to seconds (divide by 1000) before comparing.',
  },
  boss: {
    title: 'Answer conditional requests',
    language: 'javascript',
    fnName: 'conditionalResponse',
    statement:
      'Implement the origin side. reqHeaders has lowercase names; current is {etag, lastModified (HTTP date string), body}. If `if-none-match` is present it alone decides: it is a comma-separated list of ETags (or *); compare WEAKLY, ignoring a leading W/ on either side. Otherwise, if `if-modified-since` is present, return 304 when current.lastModified is not later than it. Return {status: 304, body: ""} when nothing changed, else {status: 200, body: current.body}.',
    starter: `function conditionalResponse(reqHeaders, current) {
  // your code here
}
`,
    solution: `function conditionalResponse(reqHeaders, current) {
  const strip = (tag) => tag.trim().replace(/^W\\//, '');
  const inm = reqHeaders['if-none-match'];
  let notModified = false;
  if (inm !== undefined) {
    const tags = inm.split(',').map(strip);
    notModified = tags.includes('*') || tags.includes(strip(current.etag));
  } else if (reqHeaders['if-modified-since'] !== undefined) {
    notModified = Date.parse(current.lastModified) <= Date.parse(reqHeaders['if-modified-since']);
  }
  return notModified ? { status: 304, body: '' } : { status: 200, body: current.body };
}`,
    tests: [
      { args: [{}, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 200, body: 'page' }, name: 'unconditional' },
      { args: [{ 'if-none-match': '"v2"' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 304, body: '' }, name: 'ETag matches' },
      { args: [{ 'if-none-match': '"v1"' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 200, body: 'page' }, name: 'ETag differs' },
      { args: [{ 'if-none-match': 'W/"v2"' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 304, body: '' }, name: 'weak comparison' },
      { args: [{ 'if-none-match': '"a", "v2"' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 304, body: '' }, name: 'list of ETags' },
      { args: [{ 'if-none-match': '*' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 304, body: '' }, name: 'wildcard' },
      { args: [{ 'if-modified-since': 'Wed, 01 Jan 2025 00:00:00 GMT' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 304, body: '' }, name: 'not modified since' },
      { args: [{ 'if-modified-since': 'Tue, 31 Dec 2024 00:00:00 GMT' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 200, body: 'page' }, name: 'modified since' },
      { args: [{ 'if-none-match': '"v1"', 'if-modified-since': 'Thu, 02 Jan 2025 00:00:00 GMT' }, { etag: '"v2"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'page' }], expected: { status: 200, body: 'page' }, name: 'If-None-Match takes precedence' },
    ],
    hints: ['Decide first whether the request is conditional at all; If-None-Match, when present, completely replaces If-Modified-Since.', 'Normalise each tag by trimming and removing a leading W/ before comparing; parse the HTTP dates with Date.parse.'],
    combines: ['web-http'],
  },
  quiz: [
    {
      prompt: 'Which header set is best for a fingerprinted asset like `app.3f9c.js`?',
      options: ['`Cache-Control: no-store`', '`Cache-Control: no-cache`', '`Cache-Control: public, max-age=31536000, immutable`', '`Cache-Control: max-age=0`'],
      answer: 2,
      explain: 'The filename changes whenever the content does, so the asset can be cached for a year. HTML that points to it stays short-lived.',
    },
  ],
};

export default unit;
