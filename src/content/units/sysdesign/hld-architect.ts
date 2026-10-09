import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { KINDS, SCENARIOS, simulate, type AEdge, type ANode, type Kind, type Scenario } from '@/features/architectModel';
import { fmtBig, gedge, gnode, graph, kvPanel, needOneOf, notePanel } from '@/content/lib/sysdesign-hld-2';
import { barChart, utilTone } from '@/content/lib/sysdesign-hld-3';

const code = `
def stage_load(rps, passes):
    return rps * passes                                        #@load

def utilisation(load, capacity):
    return load / capacity                                     #@util

def servers_needed(rps, per_server, headroom_pct):
    usable = per_server * (100 - headroom_pct)                 #@usable
    return -(-rps * 100 // usable)                             #@need

def survivor_util(total_rps, servers, per_server):
    return total_rps / (servers - 1) / per_server              #@survive

def passes(p99, budget, loads, caps):
    over = [k for k in loads if loads[k] > caps[k]]
    worst = max(loads, key=lambda k: loads[k] / caps[k])       #@bottleneck
    return not over and p99 <= budget                          #@budget
`;

interface Spec {
  scenario: string;
  cdn: boolean;
  lb: boolean;
  apps: number;
  cache: boolean;
  replicas: number;
}

const DESIGNS: Record<string, Spec> = {
  'Blog: one app server': { scenario: 'blog', cdn: false, lb: false, apps: 1, cache: false, replicas: 0 },
  'News: one app server': { scenario: 'news', cdn: false, lb: false, apps: 1, cache: false, replicas: 0 },
  'News: CDN, LB, 3 apps, cache': { scenario: 'news', cdn: true, lb: true, apps: 3, cache: true, replicas: 0 },
  'News: CDN, LB, 5 apps, cache': { scenario: 'news', cdn: true, lb: true, apps: 5, cache: true, replicas: 0 },
  'News: CDN, LB, 6 apps, cache': { scenario: 'news', cdn: true, lb: true, apps: 6, cache: true, replicas: 0 },
  'Feed: 20 apps, cache, no replicas': { scenario: 'feed', cdn: true, lb: true, apps: 20, cache: true, replicas: 0 },
  'Feed: 16 apps, cache, 3 replicas': { scenario: 'feed', cdn: true, lb: true, apps: 16, cache: true, replicas: 3 },
};

function build(spec: Spec): { nodes: ANode[]; edges: AEdge[]; scenario: Scenario } {
  const scenario = SCENARIOS.find((s) => s.id === spec.scenario)!;
  const nodes: ANode[] = [];
  const edges: AEdge[] = [];
  const add = (id: string, kind: Kind) => nodes.push({ id, kind, x: 0, y: 0 });
  add('client', 'client');
  add('db', 'db');
  let entry = 'client';
  if (spec.cdn) {
    add('cdn', 'cdn');
    edges.push({ from: 'client', to: 'cdn' });
    entry = 'cdn';
  }
  const apps = Array.from({ length: spec.apps }, (_, i) => 'app' + i);
  if (spec.lb) {
    add('lb', 'lb');
    edges.push({ from: entry, to: 'lb' });
    for (const a of apps) edges.push({ from: 'lb', to: a });
  } else edges.push({ from: entry, to: apps[0] });
  if (spec.cache) add('cache', 'cache');
  for (const a of apps) {
    add(a, 'app');
    edges.push({ from: a, to: 'db' });
    if (spec.cache) edges.push({ from: a, to: 'cache' });
  }
  for (let i = 0; i < spec.replicas; i++) {
    add('rep' + i, 'replica');
    edges.push({ from: 'db', to: 'rep' + i });
    for (const a of apps) edges.push({ from: a, to: 'rep' + i });
  }
  return { nodes, edges, scenario };
}

const ORDER: Kind[] = ['client', 'cdn', 'lb', 'app', 'cache', 'queue', 'worker', 'replica', 'db'];
const POS: Record<Kind, [number, number]> = {
  client: [40, 100],
  cdn: [120, 100],
  lb: [200, 100],
  app: [295, 100],
  cache: [400, 36],
  queue: [400, 100],
  worker: [490, 164],
  replica: [400, 164],
  db: [490, 100],
};

interface In {
  design: string;
}

const viz: VizDef<In> = {
  id: 'hld-architect',
  title: 'Running traffic through an architecture',
  code,
  language: 'python',
  inputs: [{ key: 'design', label: 'Design', kind: 'select', options: Object.keys(DESIGNS), default: 'News: CDN, LB, 3 apps, cache' }],
  presets: [
    { label: 'One server is not enough', input: { design: 'News: one app server' } },
    { label: 'Almost: no headroom', input: { design: 'News: CDN, LB, 5 apps, cache' } },
    { label: 'Passing design', input: { design: 'News: CDN, LB, 6 apps, cache' } },
    { label: 'Database melts', input: { design: 'Feed: 20 apps, cache, no replicas' } },
    { label: 'Replicas fix it', input: { design: 'Feed: 16 apps, cache, 3 replicas' } },
  ],
  run(input) {
    const spec = DESIGNS[needOneOf('design', input.design, Object.keys(DESIGNS))];
    const { nodes, edges, scenario } = build(spec);
    const sim = simulate(nodes, edges, scenario);
    const kinds = ORDER.filter((k) => nodes.some((n) => n.kind === k));
    const group = (k: Kind) => nodes.filter((n) => n.kind === k);
    const maxUtil = (k: Kind) => Math.max(...group(k).map((n) => sim.util[n.id]));
    const perNode = (k: Kind) => Math.max(...group(k).map((n) => sim.load[n.id]));
    const kindEdges = [...new Set(edges.map((e) => `${nodes.find((n) => n.id === e.from)!.kind}>${nodes.find((n) => n.id === e.to)!.kind}`))];
    const r = new Recorder(code);
    const seen = new Set<Kind>();
    const view = (now: Kind | null): Panel => {
      const gn: GraphNode[] = kinds.map((k) => {
        const count = group(k).length;
        const processed = seen.has(k);
        const tone: Tone = k === 'client' ? 'default' : processed ? (k === 'db' || k === 'replica' || k === 'cache' || k === 'app' || k === 'cdn' || k === 'lb' ? utilTone(maxUtil(k)) : 'done') : 'muted';
        return gnode(k, count > 1 ? `${KINDS[k].label} x${count}` : KINDS[k].label, POS[k][0], POS[k][1], {
          tone,
          shape: k === 'db' || k === 'replica' ? 'cylinder' : k === 'client' ? 'actor' : 'rect',
          w: 84,
          badge: processed && Number.isFinite(KINDS[k].capacity) ? `${Math.round(maxUtil(k) * 100)}%` : undefined,
          tags: now === k ? ['now'] : undefined,
        });
      });
      const ge: GraphEdge[] = kindEdges.map((ke) => {
        const [f, t] = ke.split('>') as [Kind, Kind];
        return gedge(f, t, { dashed: f === 'db' && t === 'replica', flow: now === t, tone: now === t ? 'active' : 'default' });
      });
      return graph(gn, ge, 540, 200, `${scenario.title}: ${fmtBig(scenario.reads)} reads/s + ${fmtBig(scenario.writes)} writes/s`);
    };

    r.step('load', `${scenario.title}: ${fmtBig(scenario.reads)} reads/s, ${fmtBig(scenario.writes)} writes/s, p99 budget ${scenario.p99Budget} ms`, [view(null), notePanel(scenario.brief)], { reads: scenario.reads, writes: scenario.writes });
    seen.add('client');
    for (const k of kinds) {
      if (k === 'client') continue;
      seen.add(k);
      const count = group(k).length;
      const u = Math.round(maxUtil(k) * 100);
      r.op();
      r.step('util', `${KINDS[k].label}${count > 1 ? ` x${count}` : ''}: ${fmtBig(Math.round(perNode(k)))} req/s${count > 1 ? ' each' : ''} of ${fmtBig(KINDS[k].capacity)} → ${u}%`, [view(k)], { kind: k, load: Math.round(perNode(k)), util: u });
      if (k === 'app') {
        const total = group('app').reduce((s, n) => s + sim.load[n.id], 0);
        const need = Math.ceil((total * 100) / (KINDS.app.capacity * 70));
        r.step('need', `${fmtBig(Math.round(total))} req/s with 30% headroom needs ${need} app server${need > 1 ? 's' : ''}; this design has ${count}`, [view(k)], { total: Math.round(total), need, have: count });
      }
    }
    if (scenario.redundancy) {
      const apps = group('app');
      const total = apps.reduce((s, n) => s + sim.load[n.id], 0);
      if (apps.length < 2) r.step('survive', 'Redundancy required, but one app server is a single point of failure', [view(null)], { servers: apps.length });
      else {
        const su = Math.round((total / (apps.length - 1) / KINDS.app.capacity) * 100);
        r.step('survive', `If one app server dies the rest run at ${su}%${su > 100 ? ': overload' : ''}`, [view(null)], { servers: apps.length, survivorUtil: su });
      }
    }
    if (sim.bottleneck) {
      const b = nodes.find((n) => n.id === sim.bottleneck)!;
      r.step('bottleneck', `Bottleneck: ${KINDS[b.kind].label} at ${Math.round(sim.util[b.id] * 100)}% of capacity`, [view(b.kind)], { bottleneck: KINDS[b.kind].label });
    }
    r.step('budget', sim.p99 > scenario.p99Budget ? `p99 is about ${sim.p99} ms: over the ${scenario.p99Budget} ms budget` : `p99 is about ${sim.p99} ms: within the ${scenario.p99Budget} ms budget`, [view(null)], { p99: sim.p99, budget: scenario.p99Budget });
    const summary: Record<string, string | number | boolean> = { passed: sim.passed, p99: sim.p99, problems: sim.problems.length };
    r.step(undefined, sim.passed ? 'Design passes: every component is within capacity and the budget is met' : sim.problems[0], [
      barChart('Utilisation by component (%)', kinds.filter((k) => Number.isFinite(KINDS[k].capacity)).map((k) => KINDS[k].label), kinds.filter((k) => Number.isFinite(KINDS[k].capacity)).map((k) => Math.round(maxUtil(k) * 100)), { yLabel: '% of capacity', tone: sim.passed ? 'done' : 'error' }),
      kvPanel('Verdict', summary, { passed: sim.passed ? 'found' : 'error' }),
    ], { passed: sim.passed });
    return { frames: r.frames, result: { passed: sim.passed, p99: sim.p99, bottleneck: sim.bottleneck ? KINDS[nodes.find((n) => n.id === sim.bottleneck)!.kind].label : null, problems: sim.problems.length, worst: Math.round(Math.max(...nodes.filter((n) => Number.isFinite(KINDS[n.kind].capacity)).map((n) => sim.util[n.id])) * 100) } };
  },
  reference(input) {
    const spec = DESIGNS[input.design];
    const { nodes, edges, scenario } = build(spec);
    const sim = simulate(nodes, edges, scenario);
    const finite = nodes.filter((n) => Number.isFinite(KINDS[n.kind].capacity));
    const hot = [...finite].sort((a, b) => sim.util[b.id] - sim.util[a.id])[0];
    return { passed: sim.problems.length === 0, p99: sim.p99, bottleneck: hot && sim.util[hot.id] > 1 ? KINDS[hot.kind].label : null, problems: sim.problems.length, worst: Math.round(sim.util[hot.id] * 100) };
  },
};

const unit: Unit = {
  id: 'hld-architect',
  hook: 'The last step of every system-design round is "where does it break at 10x?". This unit makes that a calculation: push requests per second through the boxes and see which one runs out first.',
  interactive: 'architect',
  predict: {
    prompt: 'A site serves 8,000 reads/s. Half are static files a CDN can absorb, and the rest are dynamic. One app server handles about 1,000 req/s. Roughly how many app servers do you need to keep them under 70% busy?',
    options: ['2', '6', '12', '24'],
    answer: 1,
    explain: 'The CDN absorbs 4,000 static reads, leaving about 4,000 dynamic requests per second. At 70% of 1,000 req/s each server should carry about 700, so 4,000 / 700 is about 5.7, i.e. 6 servers. Without the CDN you would size for 8,000 and need 12.',
  },
  viz,
  deeper: {
    points: [
      'Capacity planning is arithmetic: requests per second in, a pass-through fraction per layer (a CDN or cache absorbs some), and a capacity per component. Utilisation = load / capacity.',
      'The bottleneck is the component with the highest utilisation, not the slowest one. Fixing a non-bottleneck changes nothing.',
      'Never run near 100%: queueing makes latency explode as utilisation climbs (above ~70% p99 grows fast). Size for peak plus headroom.',
      'Plan for failure: with N servers, losing one pushes the rest to N/(N-1) of their previous load. Check that survivors stay under capacity.',
      'Caches and read replicas change the load on the database more than adding app servers does: a 90% cache hit rate cuts database reads tenfold.',
    ],
    complexity: { time: 'Utilisation per component = arrival rate / capacity', space: 'Headroom: usable = capacity * (1 - headroom)' },
    pitfalls: ['Mixing units: per-day numbers divided by 3600 or per-second numbers multiplied by 86400', 'Scaling the stateless tier while a single database is the real bottleneck', 'Sizing to exactly 100% (or to the average rather than the peak)'],
  },
  practice: {
    language: 'python',
    fnName: 'servers_needed',
    statement: 'Return how many servers handling `per_server` requests/s each are needed for `rps` requests/s while keeping `headroom_pct` percent spare capacity on each. Always round up and use integer arithmetic.',
    signature: 'def servers_needed(rps, per_server, headroom_pct):',
    solution: `def servers_needed(rps, per_server, headroom_pct):
    usable = per_server * @@(100 - headroom_pct)@@
    return @@-(-rps * 100 // usable)@@`,
    tests: [
      { args: [2800, 1000, 30], expected: 4, name: 'exactly four at 70%' },
      { args: [1000, 1000, 0], expected: 1, name: 'one full server' },
      { args: [1001, 1000, 0], expected: 2, name: 'one request over' },
      { args: [500, 1000, 50], expected: 1, name: 'headroom exactly fits' },
      { args: [500, 1000, 60], expected: 2, name: 'headroom forces a second server' },
      { args: [0, 1000, 20], expected: 0, name: 'no traffic' },
      { args: [12500, 500, 20], expected: 32, name: 'bigger fleet' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'peak_rps',
    compare: 'float',
    statement: 'A capacity estimate says a service with 86,400,000 requests per day needs to handle about 48,000 requests per second at a 2x peak, which is wildly high. Find the bug.',
    buggy: `def peak_rps(requests_per_day, peak_factor):
    return requests_per_day / 3600 * peak_factor`,
    fixed: `def peak_rps(requests_per_day, peak_factor):
    return requests_per_day / 86400 * peak_factor`,
    tests: [
      { args: [86400000, 2], expected: 2000, name: '1,000 rps average, 2x peak' },
      { args: [86400, 1], expected: 1, name: 'one request per second' },
      { args: [8640000, 3], expected: 300, name: '3x peak' },
      { args: [0, 5], expected: 0, name: 'no traffic' },
    ],
    bugType: 'per-day vs per-second',
    hint: 'How many seconds are there in a day?',
    explanation: 'A day has 86,400 seconds; 3,600 is the number of seconds in an HOUR. Dividing by the wrong constant inflates the rate 24 times and leads to a vastly over-provisioned design.',
  },
  boss: {
    title: 'Find the bottleneck',
    statement:
      '`stages` is a list of `[name, capacity, passes]` in traffic order, where `passes` is the fraction of a stage\'s incoming traffic that continues to the next stage (a CDN or cache absorbs the rest). Traffic into the first stage is `rps`. A stage\'s utilisation is its incoming load divided by its capacity. Return the name of the stage with the highest utilisation (the earliest one on ties).',
    language: 'python',
    fnName: 'bottleneck',
    starter: `def bottleneck(rps, stages):
    # your code here
    pass
`,
    solution: `def bottleneck(rps, stages):
    load = rps
    best = None
    best_util = -1
    for name, capacity, passes in stages:
        util = load / capacity
        if util > best_util:
            best, best_util = name, util
        load = load * passes
    return best`,
    tests: [
      { args: [3000, [['cdn', 100000, 0.5], ['app', 1000, 1.0], ['cache', 50000, 0.2], ['db', 1500, 1.0]]], expected: 'app', name: 'app server overloaded' },
      { args: [900, [['lb', 50000, 1.0], ['app', 3000, 1.0], ['db', 1500, 1.0]]], expected: 'db', name: 'database is the weak link' },
      { args: [2000, [['app', 4000, 1.0], ['cache', 50000, 0.1], ['db', 1500, 1.0]]], expected: 'app', name: 'a cache takes the load off the db' },
      { args: [2000, [['app', 4000, 1.0], ['cache', 50000, 1.0], ['db', 1500, 1.0]]], expected: 'db', name: 'same without cache savings' },
      { args: [100, [['a', 200, 1.0], ['b', 100, 0.5], ['c', 25, 1.0]]], expected: 'c', name: 'absorbing traffic upstream still leaves a small last stage hot' },
      { args: [50, [['a', 100, 1.0], ['b', 100, 1.0]]], expected: 'a', name: 'tie goes to the earliest stage' },
      { args: [1000, [['solo', 10, 1.0]]], expected: 'solo', name: 'single stage' },
    ],
    hints: ['Walk the stages in order, carrying the current `load`. Utilisation is `load / capacity` for each stage.', 'After computing a stage\'s utilisation, multiply `load` by its `passes` for the next stage. Replace the best only when the utilisation is strictly greater.'],
    combines: ['hld-scaling', 'hld-caching-layers', 'hld-estimation'],
  },
  quiz: [
    {
      prompt: 'Your app tier runs at 85% utilisation at peak and p99 latency is climbing. What is the most useful next step?',
      options: ['Nothing, 85% is efficient', 'Add servers or capacity so peak utilisation stays under about 70%', 'Make the database bigger', 'Increase request timeouts'],
      answer: 1,
      explain: 'Queueing delay grows sharply as utilisation approaches 100%. Headroom keeps tail latency stable and lets you absorb the loss of a server.',
    },
  ],
};

export default unit;
