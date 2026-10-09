import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
LATENCY = {"us": {"us": 10, "eu": 90, "ap": 180},
           "eu": {"us": 90, "eu": 10, "ap": 120},
           "ap": {"us": 180, "eu": 120, "ap": 10}}

def resolve(policy, records, client, ticket):
    live = [r for r in records if r["up"]]                  #@health
    if policy == "simple":
        return [r["ip"] for r in records]                   #@simple
    if not live:
        return None                                         #@none
    if policy == "failover":
        return live[0]["ip"]                                #@failover
    if policy == "latency":
        best = min(live, key=lambda r: LATENCY[client][r["region"]])   #@latency
        return best["ip"]
    total = sum(r["weight"] for r in live)
    if total == 0:
        return None                                         #@zero
    ticket %= total                                         #@ticket
    for r in live:
        if ticket < r["weight"]:
            return r["ip"]                                  #@weighted
        ticket -= r["weight"]
`;

interface In {
  policy: string;
  endpoints: string[];
  client: string;
  failure: string;
  queries: number;
}

const POLICIES = ['simple', 'weighted', 'latency', 'failover'];
const REGIONS = ['us', 'eu', 'ap'];
const FAILURES = ['all endpoints healthy', 'first endpoint fails its health check'];
const LAT: Record<string, Record<string, number>> = {
  us: { us: 10, eu: 90, ap: 180 },
  eu: { us: 90, eu: 10, ap: 120 },
  ap: { us: 180, eu: 120, ap: 10 },
};

interface Ep {
  ip: string;
  region: string;
  weight: number;
  up: boolean;
}

function parseEp(s: string): Ep {
  const p = s.trim().split(/\s+/);
  if (p.length !== 4 || !REGIONS.includes(p[1]) || !/^\d+$/.test(p[2]) || !['up', 'down'].includes(p[3])) throw new Error(`Endpoint "${s}" should look like: 10.1.1.1 us 70 up  (ip, region us/eu/ap, weight, up/down)`);
  return { ip: p[0], region: p[1], weight: Number(p[2]), up: p[3] === 'up' };
}

/** Fixed pseudo-random sequence so the weighted draws are reproducible. */
const ticketFor = (i: number): number => (i * 37 + 11) % 1000;

type Ans = string | string[] | null;

function prep(i: In) {
  if (!POLICIES.includes(i.policy)) throw new Error('Pick a routing policy');
  const eps = i.endpoints.map(parseEp);
  if (!eps.length) throw new Error('Add at least one endpoint');
  if (i.failure === FAILURES[1]) eps[0].up = false;
  const n = Math.round(i.queries);
  if (!(n >= 1 && n <= 10)) throw new Error('Use 1 to 10 queries');
  return { eps, n };
}

const viz: VizDef<In> = {
  id: 'aws-route53',
  title: 'Route 53 routing policies',
  code,
  language: 'python',
  inputs: [
    { key: 'policy', label: 'Routing policy', kind: 'select', default: 'weighted', options: POLICIES },
    { key: 'endpoints', label: 'Endpoints (ip region weight up|down)', kind: 'strings', default: ['10.1.1.1 us 70 up', '10.2.2.2 eu 30 up', '10.3.3.3 ap 0 up'], maxItems: 4, help: 'For failover the first endpoint is the primary and later ones are secondaries.' },
    { key: 'client', label: 'Client region', kind: 'select', default: 'eu', options: REGIONS },
    { key: 'failure', label: 'Health checks', kind: 'select', default: FAILURES[0], options: FAILURES },
    { key: 'queries', label: 'DNS queries to send (1-10)', kind: 'number', default: 6 },
  ],
  presets: [
    { label: 'Weighted 70/30', input: {} },
    { label: 'Latency from Europe', input: { policy: 'latency', queries: 3 } },
    { label: 'Failover: primary fails', input: { policy: 'failover', failure: FAILURES[1], queries: 3 } },
    { label: 'Weighted with an unhealthy endpoint', input: { failure: FAILURES[1] } },
    { label: 'Simple returns every value', input: { policy: 'simple', queries: 2 } },
    { label: 'Everything down', input: { policy: 'failover', endpoints: ['10.1.1.1 us 1 down', '10.2.2.2 eu 1 down'], queries: 2 } },
  ],
  run(input) {
    const { eps, n } = prep(input);
    const height = Math.max(140, eps.length * 52 + 20);
    const nodes: ArchNode[] = [
      { id: 'client', label: `Client (${input.client})`, x: 55, y: height / 2, shape: 'actor' },
      { id: 'dns', label: 'Route 53', sub: input.policy, x: 235, y: height / 2 },
    ];
    const edges: ArchEdge[] = [{ from: 'client', to: 'dns' }];
    eps.forEach((e, i) => {
      nodes.push({ id: `e${i}`, label: e.ip, sub: `${e.region}, weight ${e.weight}`, x: 460, y: 30 + i * 52, w: 130 });
      edges.push({ from: 'dns', to: `e${i}`, dashed: true });
    });
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const hits = eps.map(() => 0);
    const out: Ans[] = [];
    const view = (tones: Record<string, Tone>, flow: string | null, rows: Record<number, Tone> = {}): Panel[] => [
      arch('Resolution', 640, height, nodes, edges, { tones, flow, badges: Object.fromEntries(eps.map((e, i) => [`e${i}`, `${e.up ? 'healthy' : 'UNHEALTHY'}, ${hits[i]} answers`])) }),
      listPanel('Records for www.example.com (A)', eps.map((e) => `${e.ip}  ${e.region}  w=${e.weight}  ${e.up ? 'up' : 'down'}`), { ...Object.fromEntries(eps.map((e, i) => [i, (e.up ? 'default' : 'error') as Tone])), ...rows }),
      { type: 'chart', title: 'Answers per endpoint', kind: 'bar', series: [{ label: 'answers', points: hits.map((h, i) => [i + 1, h] as [number, number]), tone: 'active' }], xLabel: 'endpoint #', yLabel: 'answers' },
      logPanel('Answers', log),
    ];
    const live = eps.map((e, i) => ({ e, i })).filter((x) => x.e.up);
    frame(r, 'health', `Policy ${input.policy}: ${live.length} of ${eps.length} endpoints pass their health check`, view({}, null), { live: live.length });
    for (let q = 0; q < n; q++) {
      r.op();
      const ticket = ticketFor(q);
      frame(r, 'health', `Query ${q + 1} from the ${input.client} client reaches Route 53`, view({ client: 'active', dns: 'compare' }, 'client>dns'), { query: q + 1 });
      const answer = (ans: Ans, idx: number[], at: string, why: string) => {
        idx.forEach((k) => hits[k]++);
        out.push(ans);
        log.push({ text: `#${q + 1}: ${Array.isArray(ans) ? ans.join(' ') : ans ?? 'no answer'}`, tone: ans === null ? 'error' : 'found' });
        frame(r, at, why, view({ dns: ans === null ? 'error' : 'found', ...Object.fromEntries(idx.map((k) => [`e${k}`, 'found' as Tone])) }, idx.length === 1 ? `dns>e${idx[0]}` : null, Object.fromEntries(idx.map((k) => [k, 'found' as Tone]))), { query: q + 1 });
      };
      if (input.policy === 'simple') {
        answer(eps.map((e) => e.ip), eps.map((_, k) => k), 'simple', 'Simple routing returns every value; the client picks one, health is not checked');
        continue;
      }
      if (!live.length) {
        answer(null, [], 'none', 'Every endpoint is unhealthy: no answer to give');
        continue;
      }
      if (input.policy === 'failover') {
        const k = live[0].i;
        answer(eps[k].ip, [k], 'failover', k === 0 ? 'Primary is healthy: answer with the primary' : `Primary is unhealthy: fail over to ${eps[k].ip}`);
      } else if (input.policy === 'latency') {
        let best = live[0];
        for (const x of live) if (LAT[input.client][x.e.region] < LAT[input.client][best.e.region]) best = x;
        answer(best.e.ip, [best.i], 'latency', `${best.e.region} is closest to ${input.client} (${LAT[input.client][best.e.region]} ms): answer ${best.e.ip}`);
      } else {
        const total = live.reduce((s, x) => s + x.e.weight, 0);
        if (total === 0) {
          answer(null, [], 'zero', 'All healthy endpoints have weight 0: no answer');
          continue;
        }
        let t = ticket % total;
        const draw = t;
        let pick = live[0];
        for (const x of live) {
          if (t < x.e.weight) {
            pick = x;
            break;
          }
          t -= x.e.weight;
        }
        answer(pick.e.ip, [pick.i], 'weighted', `Draw ${draw} of ${total} lands in ${pick.e.ip} (weight ${pick.e.weight})`);
      }
    }
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { eps, n } = prep(input);
    return Array.from({ length: n }, (_, q): Ans => {
      if (input.policy === 'simple') return eps.map((e) => e.ip);
      const live = eps.filter((e) => e.up);
      if (!live.length) return null;
      if (input.policy === 'failover') return live[0].ip;
      if (input.policy === 'latency') return [...live].sort((a, b) => LAT[input.client][a.region] - LAT[input.client][b.region])[0].ip;
      // weighted: expand into a ticket list and index into it
      const expanded = live.flatMap((e) => Array<string>(e.weight).fill(e.ip));
      return expanded.length ? expanded[ticketFor(q) % expanded.length] : null;
    });
  },
};

const unit: Unit = {
  id: 'aws-route53',
  hook: 'Route 53 questions test whether you know DNS record types and, more interestingly, the routing policies: weighted for canaries, latency for global apps, failover with health checks for resilience.',
  predict: {
    prompt: 'You need `example.com` itself (the zone apex) to point at a CloudFront distribution, which only has a DNS name. What do you create?',
    options: ['A CNAME record at the apex', 'An alias A record at the apex', 'An MX record', 'A TXT record'],
    answer: 1,
    explain: 'A CNAME cannot coexist with the other records every apex has (SOA, NS), so DNS forbids it there. Route 53 alias records behave like an A record to an AWS resource, work at the apex, and cost no query charges.',
  },
  viz,
  deeper: {
    points: [
      'Record types: **A/AAAA** map names to IPv4/IPv6, **CNAME** aliases a name to another name (not at the apex), **MX** routes mail, **TXT** carries verification data, **NS/SOA** describe the zone. A Route 53 **alias** is an A/AAAA that points to an AWS resource.',
      '**Simple** routing returns all values. **Weighted** splits traffic by weight (canary: 95/5; weight 0 stops traffic). **Latency** picks the region with the lowest measured latency for the client.',
      '**Failover** serves the primary while its **health check** passes, then the secondary. Health checks make weighted and latency records skip unhealthy endpoints too.',
      'Responses are cached by resolvers for the record **TTL**: lower it before a migration, because a failover only takes effect as caches expire.',
      '**Geolocation** routes by the client\'s country, and **private hosted zones** serve names inside VPCs only.',
    ],
    pitfalls: ['A long TTL that makes failover slow', 'Weighted records without health checks keep sending traffic to a dead endpoint', 'Expecting exact percentages from a handful of queries: weights are probabilistic'],
  },
  practice: {
    language: 'python',
    fnName: 'pick_weighted',
    statement: 'Given `records` as `[ip, weight]` pairs and a `ticket` in `[0, total_weight)`, return the ip whose weight range contains the ticket (ranges are laid out in list order). Records with weight 0 are never picked.',
    signature: 'def pick_weighted(records, ticket):',
    solution: `def pick_weighted(records, ticket):
    for ip, weight in records:
        if ticket @@<@@ weight:
            return ip
        ticket @@-=@@ weight
    return @@None@@`,
    tests: [
      { args: [[['a', 70], ['b', 30]], 0], expected: 'a', name: 'first ticket' },
      { args: [[['a', 70], ['b', 30]], 69], expected: 'a', name: 'last ticket of a' },
      { args: [[['a', 70], ['b', 30]], 70], expected: 'b', name: 'first ticket of b' },
      { args: [[['a', 0], ['b', 5]], 0], expected: 'b', name: 'weight 0 is skipped' },
      { args: [[['a', 1], ['b', 1], ['c', 1]], 2], expected: 'c', name: 'three equal weights' },
      { args: [[], 0], expected: null, name: 'no records' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'resolve_failover',
    statement: 'When the primary is down and the secondary is also down, clients are still sent to the dead secondary instead of getting no answer. Fix `resolve_failover` (`records` is `[ip, healthy]` in priority order).',
    buggy: `def resolve_failover(records):
    if records[0][1]:
        return records[0][0]
    return records[1][0]`,
    fixed: `def resolve_failover(records):
    for ip, healthy in records:
        if healthy:
            return ip
    return None`,
    tests: [
      { args: [[['p', true], ['s', true]]], expected: 'p', name: 'primary healthy' },
      { args: [[['p', false], ['s', true]]], expected: 's', name: 'fails over' },
      { args: [[['p', false], ['s', false]]], expected: null, name: 'both down' },
      { args: [[['p', false], ['s', false], ['t', true]]], expected: 't', name: 'third tier' },
    ],
    bugType: 'health ignored on the secondary',
    hint: 'The code assumes the secondary is fine. Check every record in priority order instead of hard-coding index 1.',
    explanation: 'Failover walks the priority list and returns the first record that passes its health check. Returning `records[1]` unconditionally ignores its health and cannot handle more than two records.',
  },
  boss: {
    title: 'Route 53 resolver',
    statement: 'Write `resolve(policy, records, latency, client, ticket)`. `records` are `[ip, region, weight, up]`; `latency[client][region]` gives milliseconds. For "simple" return the list of all ips (health ignored). Otherwise consider only records that are up (none: return None). "failover": the first live record\'s ip. "latency": the live record with the smallest latency from `client` (ties keep the earlier one). "weighted": total = sum of live weights (0: None); `ticket %= total`; walk the live records in order subtracting weights until the ticket falls inside one.',
    language: 'python',
    fnName: 'resolve',
    starter: `def resolve(policy, records, latency, client, ticket):
    pass
`,
    solution: `def resolve(policy, records, latency, client, ticket):
    if policy == "simple":
        return [r[0] for r in records]
    live = [r for r in records if r[3]]
    if not live:
        return None
    if policy == "failover":
        return live[0][0]
    if policy == "latency":
        best = live[0]
        for r in live:
            if latency[client][r[1]] < latency[client][best[1]]:
                best = r
        return best[0]
    total = sum(r[2] for r in live)
    if total == 0:
        return None
    ticket %= total
    for ip, region, weight, up in live:
        if ticket < weight:
            return ip
        ticket -= weight`,
    tests: [
      { args: ['simple', [['a', 'us', 1, false], ['b', 'eu', 1, true]], { eu: { us: 90, eu: 10 } }, 'eu', 0], expected: ['a', 'b'], name: 'simple ignores health' },
      { args: ['failover', [['a', 'us', 1, false], ['b', 'eu', 1, true]], { eu: { us: 90, eu: 10 } }, 'eu', 0], expected: 'b', name: 'failover skips the dead primary' },
      { args: ['failover', [['a', 'us', 1, false], ['b', 'eu', 1, false]], { eu: { us: 90, eu: 10 } }, 'eu', 0], expected: null, name: 'nothing healthy' },
      { args: ['latency', [['a', 'us', 1, true], ['b', 'eu', 1, true]], { eu: { us: 90, eu: 10 } }, 'eu', 0], expected: 'b', name: 'closest region wins' },
      { args: ['latency', [['a', 'us', 1, true], ['b', 'eu', 1, false]], { eu: { us: 90, eu: 10 } }, 'eu', 0], expected: 'a', name: 'closest region is unhealthy' },
      { args: ['latency', [['a', 'us', 1, true], ['b', 'us', 1, true]], { us: { us: 5 } }, 'us', 0], expected: 'a', name: 'latency tie keeps the first' },
      { args: ['weighted', [['a', 'us', 70, true], ['b', 'eu', 30, true]], {}, 'us', 71], expected: 'b', name: 'weighted draw' },
      { args: ['weighted', [['a', 'us', 70, true], ['b', 'eu', 30, true]], {}, 'us', 100], expected: 'a', name: 'ticket wraps around the total' },
      { args: ['weighted', [['a', 'us', 70, false], ['b', 'eu', 30, true]], {}, 'us', 5], expected: 'b', name: 'unhealthy weight is excluded' },
      { args: ['weighted', [['a', 'us', 0, true]], {}, 'us', 5], expected: null, name: 'zero total weight' },
    ],
    hints: ['Handle "simple" before filtering by health, then build `live = [r for r in records if r[3]]` and return None if it is empty.', 'For weighted: `ticket %= total`, then loop over live records, return when `ticket < weight`, otherwise subtract the weight and continue.'],
    combines: ['net-dns', 'aws-elb'],
  },
  quiz: [
    {
      prompt: 'You want to send 5% of traffic to a new version first. Which policy fits?',
      options: ['Failover', 'Weighted (95 / 5)', 'Simple with two values', 'Geolocation'],
      answer: 1,
      explain: 'Weighted records split queries in proportion to their weights. Add a health check so a bad canary is removed automatically.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
