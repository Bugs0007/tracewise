import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { arch, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';
import { step } from '@/content/lib/cloud-devops';

const code = `
CHAIN = [".", "com", "example.com"]            # root -> TLD -> authoritative
RECORDS = {"www.example.com": "93.184.0.1", "api.example.com": "93.184.0.2",
           "mail.example.com": "93.184.0.3"}

def resolve(name, now, cache, ttl, ns_ttl, down):
    hit = cache.get(name)
    if hit and hit[1] > now:
        return hit[0]                                       #@cache
    start = 0
    for i in range(1, len(CHAIN)):
        known = cache.get("NS " + CHAIN[i])
        if known and known > now:
            start = i                                       #@ns_cached
    for i in range(start, len(CHAIN)):
        if CHAIN[i] == "example.com":                       #@ask
            if down:
                return None                                 #@servfail
            ip = RECORDS.get(name)
            if ip is None:
                return "NXDOMAIN"                           #@nx
            cache[name] = (ip, now + ttl)                   #@answer
            return ip
        cache["NS " + CHAIN[i + 1]] = now + ns_ttl          #@referral
`;

interface In {
  queries: string[];
  ttl: number;
  nsTtl: number;
  fail: string;
}

const FAILS = ['all servers reachable', 'authoritative server unreachable'];
const ZONES = ['root', 'com', 'example.com'];
const RECORDS: Record<string, string> = { 'www.example.com': '93.184.0.1', 'api.example.com': '93.184.0.2', 'mail.example.com': '93.184.0.3' };

function parseQ(s: string): { t: number; name: string } {
  const m = s.trim().match(/^(\d+)\s+([a-z0-9-]+\.example\.com)$/i);
  if (!m) throw new Error(`Query "${s}" should look like: 30 www.example.com (time in seconds, a name under example.com)`);
  return { t: Number(m[1]), name: m[2].toLowerCase() };
}

function prep(i: In) {
  const qs = i.queries.map(parseQ);
  if (!qs.length) throw new Error('Add at least one query');
  for (let k = 1; k < qs.length; k++) if (qs[k].t < qs[k - 1].t) throw new Error('Query times must not go backwards');
  const ttl = Math.round(i.ttl);
  const nsTtl = Math.round(i.nsTtl);
  if (!(ttl >= 1 && nsTtl >= 1)) throw new Error('TTLs must be at least 1 second');
  return { qs, ttl, nsTtl, down: i.fail === FAILS[1] };
}

interface Res {
  answer: string | null;
  asked: string[];
}

const NODES: ArchNode[] = [
  { id: 'stub', label: 'Browser (stub)', x: 55, y: 85, shape: 'actor' },
  { id: 'rec', label: 'Recursive resolver', x: 225, y: 85, w: 130 },
  { id: 'root', label: 'Root server', x: 430, y: 25, w: 110, h: 30 },
  { id: 'com', label: '.com TLD server', x: 430, y: 85, w: 110, h: 30 },
  { id: 'auth', label: 'example.com NS', x: 430, y: 145, w: 110, h: 30 },
];
const EDGES: ArchEdge[] = [
  { from: 'stub', to: 'rec' },
  { from: 'rec', to: 'root' },
  { from: 'rec', to: 'com' },
  { from: 'rec', to: 'auth' },
];
const NODE_OF: Record<string, string> = { root: 'root', com: 'com', 'example.com': 'auth' };

interface Ev {
  lane: string;
  t: number;
  dur: number;
  label: string;
  tone: Tone;
}

const viz: VizDef<In> = {
  id: 'net-dns',
  title: 'DNS resolution and TTL caching',
  code,
  language: 'python',
  inputs: [
    { key: 'queries', label: 'Queries (time name)', kind: 'strings', default: ['0 www.example.com', '30 www.example.com', '70 www.example.com', '80 api.example.com', '400 www.example.com'], maxItems: 6, help: 'Times in seconds. Names must be under example.com (known: www, api, mail).' },
    { key: 'ttl', label: 'Answer TTL (seconds)', kind: 'number', default: 60 },
    { key: 'nsTtl', label: 'Delegation (NS) TTL (seconds)', kind: 'number', default: 300 },
    { key: 'fail', label: 'Failure injection', kind: 'select', default: FAILS[0], options: FAILS },
  ],
  presets: [
    { label: 'Cold start, warm cache, expiry', input: {} },
    { label: 'Short TTL: every query walks again', input: { ttl: 10, queries: ['0 www.example.com', '20 www.example.com', '40 www.example.com'] } },
    { label: 'Unknown name: NXDOMAIN', input: { queries: ['0 www.example.com', '5 shop.example.com', '10 www.example.com'] } },
    { label: 'Authoritative server down', input: { fail: FAILS[1], queries: ['0 www.example.com', '5 www.example.com'] } },
  ],
  run(input) {
    const { qs, ttl, nsTtl, down } = prep(input);
    const r = new Recorder(code);
    const answers = new Map<string, { ip: string; exp: number }>();
    const ns = new Map<string, number>();
    const events: Ev[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const out: Res[] = [];
    const tMax = qs[qs.length - 1].t + Math.max(ttl, 10) + 10;
    let now = 0;
    const view = (tones: Record<string, Tone>, flow: string | null): Panel[] => {
      const lanes = new Map<string, { label: string; events: { t: number; dur: number; label: string; tone: Tone }[] }>();
      for (const e of events) {
        if (!lanes.has(e.lane)) lanes.set(e.lane, { label: e.lane, events: [] });
        lanes.get(e.lane)!.events.push({ t: e.t, dur: Math.max(0, Math.min(e.dur, tMax - e.t)), label: e.label, tone: e.tone });
      }
      const order = ['queries', ...[...lanes.keys()].filter((k) => k !== 'queries')];
      return [
        arch('Who asks whom', 640, 175, NODES, EDGES, { tones, flow }),
        { type: 'timeline', title: 'Cache entries and queries (seconds)', lanes: order.filter((k) => lanes.has(k)).map((k) => lanes.get(k)!), tMax, now, unit: 's' },
        logPanel('Answers', log),
      ];
    };
    const emit = (at: string, caption: string, tones: Record<string, Tone>, flow: string | null, vars: Record<string, unknown> = {}) => step(r, at, caption, view(tones, flow), { now, ...vars });
    emit('cache', `Recursive resolver cache is empty. Answer TTL ${ttl}s, delegation TTL ${nsTtl}s`, {}, null);
    qs.forEach((q, qi) => {
      now = q.t;
      r.op();
      events.push({ lane: 'queries', t: q.t, dur: 0, label: `q${qi + 1}`, tone: 'active' });
      emit('cache', `t=${q.t}s: browser asks for ${q.name}`, { stub: 'active', rec: 'compare' }, 'stub>rec', { name: q.name });
      const hit = answers.get(q.name);
      const res: Res = { answer: null, asked: [] };
      if (hit && hit.exp > now) {
        res.answer = hit.ip;
        log.push({ text: `t=${q.t} ${q.name} -> ${hit.ip} (cache, ${hit.exp - now}s left)`, tone: 'found' });
        out.push(res);
        emit('cache', `Cache hit: ${q.name} = ${hit.ip}, ${hit.exp - now}s of TTL left. No server contacted`, { rec: 'found', stub: 'found' }, null, { ttl_left: hit.exp - now });
        return;
      }
      if (hit) emit('cache', `Cached ${q.name} expired at t=${hit.exp}: the TTL ran out, resolve again`, { rec: 'compare' }, null, { expired: hit.exp });
      let start = 0;
      for (let i = 1; i < ZONES.length; i++) {
        const known = ns.get(ZONES[i]);
        if (known !== undefined && known > now) start = i;
      }
      if (start > 0) emit('ns_cached', `Delegation for ${ZONES[start]} is cached: skip ${ZONES.slice(0, start).join(' and ')}`, { rec: 'compare' }, null, { start: ZONES[start] });
      for (let i = start; i < ZONES.length; i++) {
        const z = ZONES[i];
        const node = NODE_OF[z];
        res.asked.push(z);
        if (z === 'example.com') {
          emit('ask', `Ask the example.com name server for ${q.name}`, { rec: 'compare', [node]: 'active' }, `rec>${node}`);
          if (down) {
            res.answer = null;
            log.push({ text: `t=${q.t} ${q.name} -> SERVFAIL (server unreachable)`, tone: 'error' });
            emit('servfail', 'Authoritative server does not answer: SERVFAIL (nothing to cache)', { auth: 'error', rec: 'error', stub: 'error' }, null);
            break;
          }
          const ip = RECORDS[q.name];
          if (!ip) {
            res.answer = 'NXDOMAIN';
            log.push({ text: `t=${q.t} ${q.name} -> NXDOMAIN`, tone: 'error' });
            emit('nx', `${q.name} does not exist: NXDOMAIN`, { auth: 'swap', rec: 'error', stub: 'error' }, null);
            break;
          }
          answers.set(q.name, { ip, exp: now + ttl });
          events.push({ lane: `A ${q.name.split('.')[0]}`, t: now, dur: ttl, label: ip, tone: 'found' });
          res.answer = ip;
          log.push({ text: `t=${q.t} ${q.name} -> ${ip} (TTL ${ttl}s)`, tone: 'found' });
          emit('answer', `Authoritative answer ${ip}. Cache it for ${ttl}s (until t=${now + ttl})`, { auth: 'found', rec: 'new', stub: 'found' }, null, { cached_until: now + ttl });
        } else {
          const next = ZONES[i + 1];
          emit('ask', `Ask the ${z === 'root' ? 'root' : '.' + z} server: it does not know ${q.name}`, { rec: 'compare', [node]: 'active' }, `rec>${node}`);
          ns.set(next, now + nsTtl);
          events.push({ lane: `NS ${next}`, t: now, dur: nsTtl, label: 'NS', tone: 'compare' });
          emit('referral', `Referral: go ask the ${next} servers. Cache that delegation for ${nsTtl}s`, { rec: 'new', [node]: 'done' }, null, { next });
        }
      }
      out.push(res);
    });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { qs, ttl, nsTtl, down } = prep(input);
    // Independent formulation: one expiry table keyed by "kind:name", walking the labels of the name.
    const exp: Record<string, [number, string]> = {};
    return qs.map(({ t, name }): Res => {
      const a = exp['A:' + name];
      if (a && a[0] > t) return { answer: a[1], asked: [] };
      const labels = name.split('.');
      const sld = labels.slice(-2).join('.');
      const tld = labels[labels.length - 1];
      const asked: string[] = [];
      const hasSld = exp['NS:' + sld] && exp['NS:' + sld][0] > t;
      const hasTld = exp['NS:' + tld] && exp['NS:' + tld][0] > t;
      if (!hasSld && !hasTld) {
        asked.push('root');
        exp['NS:' + tld] = [t + nsTtl, ''];
      }
      if (!hasSld) {
        asked.push(tld);
        exp['NS:' + sld] = [t + nsTtl, ''];
      }
      asked.push(sld);
      if (down) return { answer: null, asked };
      const ip = RECORDS[name];
      if (!ip) return { answer: 'NXDOMAIN', asked };
      exp['A:' + name] = [t + ttl, ip];
      return { answer: ip, asked };
    });
  },
};

const unit: Unit = {
  id: 'net-dns',
  hook: 'DNS is the first thing that happens on every request and the cause of a surprising share of outages. Know who asks whom, what gets cached for how long, and why a change "has not propagated yet".',
  predict: {
    prompt: 'You change a record whose TTL is 3600 seconds. A resolver cached the old value 5 minutes ago. When will that resolver return the new value?',
    options: ['Immediately: resolvers check on every query', 'After about 55 more minutes, when its cached copy expires', 'After 24 hours', 'Only after you flush the root servers'],
    answer: 1,
    explain: 'A resolver may serve its cached answer for the whole TTL without asking anyone. Lower the TTL well before a planned change so old copies expire quickly.',
  },
  viz,
  deeper: {
    points: [
      'A **stub resolver** (your OS or browser) sends one question to a **recursive resolver** (ISP, 8.8.8.8, a VPC resolver). The recursive resolver does the work: root, then the TLD servers (.com), then the domain\'s **authoritative** servers.',
      'Root and TLD servers answer with **referrals** (NS records saying "ask these servers"), not with the final answer. Only the authoritative server returns the A record.',
      'Everything is cached for its **TTL**: the final answer, and the NS delegations. That is why the root is almost never asked and why a long TTL makes changes slow.',
      '**NXDOMAIN** means the name does not exist (can be cached negatively); **SERVFAIL** means the lookup failed. Records you should know: A, AAAA, CNAME, NS, MX, TXT, SOA.',
      'DNS usually uses UDP port 53 (TCP for large answers and zone transfers); DNSSEC signs answers and DoH/DoT encrypt the transport.',
    ],
    pitfalls: ['Lowering the TTL only at the moment of the change', 'Assuming "propagation" is a push: it is just caches expiring', 'Negative answers and SERVFAIL being cached longer than expected'],
  },
  practice: {
    language: 'python',
    fnName: 'TTLCache',
    statement: 'Implement `TTLCache`. `put(key, value, ttl, now)` stores a value that is valid for `ttl` seconds. `get(key, now)` returns the value while `now` is strictly before the expiry time, otherwise None (an expired entry is dropped).',
    signature: 'class TTLCache:',
    solution: `class TTLCache:
    def __init__(self):
        self.data = {}

    def put(self, key, value, ttl, now):
        self.data[key] = (value, @@now + ttl@@)

    def get(self, key, now):
        if key not in self.data:
            return None
        value, expires = self.data[key]
        if now @@<@@ expires:
            return value
        @@del self.data[key]@@
        return None`,
    harness: `
def run_cache(cls, ops, params):
    obj = cls()
    out = []
    for op, args in zip(ops, params):
        if op == "init":
            out.append(None)
        else:
            out.append(getattr(obj, op)(*args))
    return out
`,
    adapter: 'run_cache',
    tests: [
      { args: [['init', 'put', 'get', 'get', 'get'], [[], ['a', '1.1.1.1', 60, 0], ['a', 59], ['a', 60], ['a', 10]]], expected: [null, null, '1.1.1.1', null, null], name: 'valid until expiry, then dropped' },
      { args: [['init', 'get'], [[], ['x', 0]]], expected: [null, null], name: 'missing key' },
      { args: [['init', 'put', 'put', 'get'], [[], ['a', 'old', 10, 0], ['a', 'new', 100, 5], ['a', 50]]], expected: [null, null, null, 'new'], name: 'a new put replaces the TTL' },
      { args: [['init', 'put', 'get'], [[], ['a', 'v', 1, 100], ['a', 100]]], expected: [null, null, 'v'], name: 'just inserted' },
      { args: [['init', 'put', 'put', 'get', 'get'], [[], ['a', '1', 5, 0], ['b', '2', 50, 0], ['a', 10], ['b', 10]]], expected: [null, null, null, null, '2'], name: 'independent entries' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'DnsCache',
    statement: 'A record with TTL 300 (seconds) is still being served from the cache an hour later. Fix `DnsCache`; all times are in seconds.',
    harness: `
def run_cache(cls, ops, params):
    obj = cls()
    out = []
    for op, args in zip(ops, params):
        if op == "init":
            out.append(None)
        else:
            out.append(getattr(obj, op)(*args))
    return out
`,
    adapter: 'run_cache',
    buggy: `class DnsCache:
    def __init__(self):
        self.data = {}

    def put(self, name, ip, ttl, now):
        self.data[name] = (ip, now + ttl * 60)

    def get(self, name, now):
        entry = self.data.get(name)
        if entry and now < entry[1]:
            return entry[0]
        return None`,
    fixed: `class DnsCache:
    def __init__(self):
        self.data = {}

    def put(self, name, ip, ttl, now):
        self.data[name] = (ip, now + ttl)

    def get(self, name, now):
        entry = self.data.get(name)
        if entry and now < entry[1]:
            return entry[0]
        return None`,
    tests: [
      { args: [['init', 'put', 'get', 'get'], [[], ['a.com', '1.2.3.4', 300, 0], ['a.com', 299], ['a.com', 300]]], expected: [null, null, '1.2.3.4', null], name: 'expires after 300 seconds' },
      { args: [['init', 'put', 'get'], [[], ['a.com', '1.2.3.4', 60, 1000], ['a.com', 3600]]], expected: [null, null, null], name: 'an hour later it is gone' },
      { args: [['init', 'put', 'get'], [[], ['a.com', '9.9.9.9', 10, 5], ['a.com', 14]]], expected: [null, null, '9.9.9.9'], name: 'still fresh' },
    ],
    bugType: 'TTL unit mix-up',
    hint: 'What unit is the TTL in, and what unit does `now` use? Look at how the expiry time is computed.',
    explanation: 'The TTL is already in seconds, but it is multiplied by 60 as if it were minutes, so entries live 60 times too long. The expiry is simply `now + ttl`.',
  },
  boss: {
    title: 'Iterative resolver with TTL caches',
    statement: 'Write `resolve_all(records, queries, ttl, ns_ttl)`. `records` maps fully qualified names under a two-label domain (like "www.example.com") to IPs; `queries` is a list of `[t, name]` in time order. Resolution walks root, then the TLD (the last label), then the domain (the last two labels) whose server answers. Caches: answers (valid `ttl` seconds) and delegations "ask TLD" and "ask domain" (valid `ns_ttl`), all valid while `now < expiry`. A fresh answer returns `[ip, 0]`. Otherwise start at the deepest zone whose delegation is cached (domain, else TLD, else root) and count each server asked until the domain server answers. Each non-final server asked caches the delegation to the next zone. The domain server returns the ip (cached) or "NXDOMAIN" (not cached). Return `[answer, servers_asked]` for each query.',
    language: 'python',
    fnName: 'resolve_all',
    starter: `def resolve_all(records, queries, ttl, ns_ttl):
    pass
`,
    solution: `def resolve_all(records, queries, ttl, ns_ttl):
    answers = {}
    delegations = {}
    out = []
    for now, name in queries:
        hit = answers.get(name)
        if hit and now < hit[1]:
            out.append([hit[0], 0])
            continue
        labels = name.split(".")
        tld = labels[-1]
        domain = ".".join(labels[-2:])
        zones = [".", tld, domain]
        start = 0
        for i in (1, 2):
            exp = delegations.get(zones[i])
            if exp is not None and now < exp:
                start = i
        asked = 0
        for i in range(start, 3):
            asked += 1
            if i < 2:
                delegations[zones[i + 1]] = now + ns_ttl
        ip = records.get(name)
        if ip is None:
            out.append(["NXDOMAIN", asked])
        else:
            answers[name] = (ip, now + ttl)
            out.append([ip, asked])
    return out`,
    tests: [
      { args: [{ 'www.example.com': '1.1.1.1', 'api.example.com': '2.2.2.2' }, [[0, 'www.example.com'], [30, 'www.example.com'], [70, 'www.example.com'], [80, 'api.example.com'], [400, 'www.example.com']], 60, 300], expected: [['1.1.1.1', 3], ['1.1.1.1', 0], ['1.1.1.1', 1], ['2.2.2.2', 1], ['1.1.1.1', 3]], name: 'cold, hit, partial, partial, cold again' },
      { args: [{ 'www.example.com': '1.1.1.1' }, [[0, 'shop.example.com'], [1, 'shop.example.com']], 60, 300], expected: [['NXDOMAIN', 3], ['NXDOMAIN', 1]], name: 'NXDOMAIN is not cached but delegations are' },
      { args: [{ 'a.b.org': '9.9.9.9', 'c.d.org': '8.8.8.8' }, [[0, 'a.b.org'], [1, 'c.d.org'], [2, 'a.b.org']], 100, 100], expected: [['9.9.9.9', 3], ['8.8.8.8', 2], ['9.9.9.9', 0]], name: 'shared TLD delegation' },
      { args: [{ 'a.b.org': '9.9.9.9' }, [[0, 'a.b.org'], [10, 'a.b.org']], 10, 100], expected: [['9.9.9.9', 3], ['9.9.9.9', 1]], name: 'answer expires exactly at the TTL' },
      { args: [{ 'a.b.org': '9.9.9.9' }, [[0, 'a.b.org'], [100, 'a.b.org']], 10, 100], expected: [['9.9.9.9', 3], ['9.9.9.9', 3]], name: 'delegations expire exactly at ns_ttl' },
      { args: [{}, [], 60, 300], expected: [], name: 'no queries' },
    ],
    hints: ['Keep two dicts: `answers[name] = (ip, expiry)` and `delegations[zone] = expiry`. Treat an entry as valid only while `now < expiry`.', 'zones = [".", tld, domain]. Find the deepest index 1 or 2 with a valid delegation, then loop from there to 2 counting servers; for i < 2 cache the delegation to zones[i + 1].'],
    combines: ['aws-route53', 'net-tcp'],
  },
  quiz: [
    {
      prompt: 'Which server returns the final A record for www.example.com?',
      options: ['The root server', 'The .com TLD server', 'The authoritative name server for example.com', 'The recursive resolver always'],
      answer: 2,
      explain: 'Root and TLD servers only refer you onward. The authoritative server owns the zone and gives the real answer; recursive resolvers just cache it.',
    },
  ],
  simulationNote: 'A simplified model of DNS: one zone chain, fixed records, no UDP loss, negative caching or DNSSEC.',
};

export default unit;
