import { Recorder } from '@/engine/recorder';
import type { ChartPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { fmtBig, gedge, gnode, graph, kvPanel, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
SIZES = [(1, 100), (2, 250), (4, 600), (8, 1500), (16, 4000)]   # (x1000 rps, $ per month)

def vertical(rps):
    for mult, cost in SIZES:
        if mult * 1000 >= rps:                         #@vfit
            return mult, cost
    return None                                        #@ceiling

def horizontal(rps, stateful):
    pct = 125 if stateful else 100                     #@factor
    servers = (rps * pct + 99999) // 100000            #@hneed
    lb = 50 if servers > 1 else 0
    return servers, servers * 100 + lb                 #@hcost
`;

const SIZES: [number, number][] = [
  [1, 100],
  [2, 250],
  [4, 600],
  [8, 1500],
  [16, 4000],
];

interface In {
  demands: number[];
  app: string;
}

interface Row {
  rps: number;
  vertical: [number, number] | null;
  servers: number;
  hCost: number;
}

const vFit = (rps: number): [number, number] | null => SIZES.find(([m]) => m * 1000 >= rps) ?? null;
const hPlan = (rps: number, stateful: boolean) => {
  const servers = Math.floor((rps * (stateful ? 125 : 100) + 99999) / 100000);
  return { servers, cost: servers * 100 + (servers > 1 ? 50 : 0) };
};

function parse(input: In) {
  const app = needOneOf('app', input.app, ['stateless', 'in-memory sessions'] as const);
  if (!input.demands.length || input.demands.length > 6) throw new Error('Give 1 to 6 demand levels');
  const demands = input.demands.map(Number);
  if (demands.some((d) => !Number.isInteger(d) || d < 1 || d > 200000)) throw new Error('Each demand must be a whole number of requests/s between 1 and 200000');
  return { demands, stateful: app === 'in-memory sessions' };
}

const viz: VizDef<In> = {
  id: 'hld-scaling',
  title: 'Vertical vs horizontal scaling',
  code,
  language: 'python',
  inputs: [
    { key: 'demands', label: 'Traffic levels (requests/s)', kind: 'numbers', default: [800, 2000, 5000, 9000, 20000], maxItems: 6 },
    { key: 'app', label: 'App tier', kind: 'select', options: ['stateless', 'in-memory sessions'], default: 'stateless', help: 'Sessions held in server memory force sticky routing, which spreads load unevenly.' },
  ],
  presets: [
    { label: 'Stateless fleet', input: { app: 'stateless' } },
    { label: 'Sticky sessions (+25% servers)', input: { app: 'in-memory sessions' } },
    { label: 'Small site', input: { demands: [200, 600, 900, 1500], app: 'stateless' } },
    { label: 'Beyond the biggest box', input: { demands: [10000, 16000, 16001, 40000], app: 'stateless' } },
  ],
  run(input) {
    const { demands, stateful } = parse(input);
    const r = new Recorder(code);
    const rows: Row[] = [];
    const vPts: [number, number][] = [];
    const hPts: [number, number][] = [];
    const chart = (): ChartPanel => ({
      type: 'chart',
      title: 'Monthly cost by traffic',
      xLabel: 'requests/s',
      yLabel: '$',
      series: [
        { label: 'vertical (one big box)', points: [...vPts], tone: 'swap' },
        { label: 'horizontal (many small)', points: [...hPts], tone: 'done' },
      ],
    });
    const diagram = (vTone: Tone, hTone: Tone, mult: number | null, servers: number, vCost: number | null, hCost: number): Panel => {
      const shown = Math.min(servers, 6);
      const nodes = [
        gnode('V', mult ? `${mult}x server` : 'no box big enough', 70, 90, { tone: vTone, shape: 'rect', w: 110, h: 60, badge: vCost ? `$${vCost}` : 'ceiling hit' }),
        gnode('LB', 'LB', 210, 90, { tone: hTone, shape: 'pill', w: 50, badge: servers > 1 ? '$50' : undefined }),
      ];
      const edges = [];
      for (let i = 0; i < shown; i++) {
        nodes.push(gnode('H' + i, i === 5 && servers > 6 ? `+${servers - 5}` : `S${i + 1}`, 320, 22 + (shown === 1 ? 68 : (i * 136) / (shown - 1)), { tone: hTone, w: 56, h: 26 }));
        edges.push(gedge('LB', 'H' + i, { tone: hTone }));
      }
      return graph(nodes, edges, 380, 180, `Vertical: $${vCost ?? '-'} · Horizontal: ${servers} server(s), $${hCost}`);
    };

    r.step(undefined, `${demands.length} traffic levels; app tier is ${stateful ? 'stateful (sticky sessions)' : 'stateless'}`, [chart(), diagram('default', 'default', null, 0, null, 0)], { levels: demands.length, stateful });
    for (const rps of demands) {
      const v = vFit(rps);
      const h = hPlan(rps, stateful);
      r.op();
      if (v) vPts.push([rps, v[1]]);
      r.step(v ? 'vfit' : 'ceiling', v ? `${fmtBig(rps)} rps: smallest single box that fits is ${v[0]}x for $${v[1]}` : `${fmtBig(rps)} rps: bigger than the largest machine, vertical scaling is stuck`, [diagram(v ? 'active' : 'error', 'default', v ? v[0] : null, h.servers, v ? v[1] : null, h.cost), chart()], { rps, vertical: v ? v[0] : 'none' });
      hPts.push([rps, h.cost]);
      r.step('hneed', `${fmtBig(rps)} rps: ${h.servers} small server${h.servers > 1 ? 's' : ''}${stateful ? ' (with 25% sticky-routing slack)' : ''} = $${h.cost}`, [diagram(v ? 'visited' : 'error', 'active', v ? v[0] : null, h.servers, v ? v[1] : null, h.cost), chart()], { rps, servers: h.servers, cost: h.cost });
      rows.push({ rps, vertical: v, servers: h.servers, hCost: h.cost });
    }
    const stuck = rows.find((x) => !x.vertical);
    r.step('hcost', stuck ? `Vertical ran out at ${fmtBig(stuck.rps)} rps; horizontal kept going` : 'Both worked; horizontal cost grows linearly, vertical in jumps', [chart(), kvPanel('Outcome', { levels: rows.length, verticalCeilingAt: stuck ? stuck.rps : 'never' }, { verticalCeilingAt: stuck ? 'error' : 'found' })], { levels: rows.length });
    return { frames: r.frames, result: rows };
  },
  reference(input) {
    const { demands, stateful } = parse(input);
    return demands.map((rps) => {
      const fit = SIZES.filter(([m]) => m * 1000 >= rps)[0];
      const servers = Math.ceil((rps * (stateful ? 1.25 : 1)) / 1000 - 1e-9);
      return { rps, vertical: fit ? [fit[0], fit[1]] : null, servers, hCost: servers * 100 + (servers > 1 ? 50 : 0) };
    });
  },
};

const unit: Unit = {
  id: 'hld-scaling',
  hook: 'Every design interview reaches "what if traffic grows 100x?". The strong answer separates scaling up (a bigger box, with a ceiling) from scaling out (more boxes, which needs a stateless tier).',
  predict: {
    prompt: 'A web tier runs on one big server and holds user sessions in memory. You put three copies behind a round-robin balancer. What goes wrong first?',
    options: ['Nothing, more servers is always better', 'Users randomly lose their login as requests hit a server that has no copy of their session', 'The database stops working', 'Latency doubles for all users'],
    answer: 1,
    explain: 'Session state lives in one server\'s memory. A request landing on another server finds nothing. Fix it by moving sessions to a shared store (or signed cookies) so any server can handle any request, i.e. make the tier stateless.',
  },
  viz,
  deeper: {
    points: [
      'Vertical scaling (bigger CPU, RAM, disk) is simple and needs no code change, but it has a hard ceiling, costs more than linearly near the top, and leaves one machine as a single point of failure.',
      'Horizontal scaling adds identical servers behind a load balancer: cost grows roughly linearly, there is no ceiling, and one dead server is just a capacity dip.',
      'Horizontal scaling only works cleanly when servers are stateless: keep sessions, uploads and caches in shared services (Redis, object storage, the database).',
      'Stateful tiers (databases) scale out harder: read replicas for reads, sharding for writes. Often you scale the database up first and the app tier out.',
      'Plan with headroom: size for peak plus the loss of one server, not for the average.',
    ],
    complexity: { time: 'Capacity grows linearly with server count', space: 'N copies of the app image' },
    pitfalls: ['Local-disk uploads or in-memory sessions on a tier you scale out', 'Scaling the app tier while the single database stays the bottleneck', 'Sizing for the average and ignoring the loss of one server'],
  },
  practice: {
    language: 'python',
    fnName: 'vertical_size',
    statement: '`sizes` is a list of `[capacity, cost]` machine options sorted by capacity. Return the cheapest option that can handle `rps` as `[capacity, cost]`, or `None` if even the biggest cannot.',
    signature: 'def vertical_size(rps, sizes):',
    solution: `def vertical_size(rps, sizes):
    for capacity, cost in sizes:
        if @@capacity >= rps@@:
            return @@[capacity, cost]@@
    return @@None@@`,
    tests: [
      { args: [800, [[1000, 100], [2000, 250], [4000, 600]]], expected: [1000, 100], name: 'smallest fits' },
      { args: [1000, [[1000, 100], [2000, 250], [4000, 600]]], expected: [1000, 100], name: 'exactly at capacity' },
      { args: [1001, [[1000, 100], [2000, 250], [4000, 600]]], expected: [2000, 250], name: 'just over' },
      { args: [4000, [[1000, 100], [2000, 250], [4000, 600]]], expected: [4000, 600], name: 'biggest box' },
      { args: [4001, [[1000, 100], [2000, 250], [4000, 600]]], expected: null, name: 'ceiling hit' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'servers_for',
    statement: 'Capacity planning returns one server too few for most traffic levels, and the fleet falls over at peak. Find the bug.',
    buggy: `def servers_for(rps, per_server, spare):
    return rps // per_server + spare`,
    fixed: `def servers_for(rps, per_server, spare):
    return (rps + per_server - 1) // per_server + spare`,
    tests: [
      { args: [2500, 1000, 1], expected: 4, name: '2.5 servers of load plus a spare' },
      { args: [3000, 1000, 0], expected: 3, name: 'exact multiple' },
      { args: [2500, 1000, 0], expected: 3, name: 'partial server still needs a whole one' },
      { args: [1, 1000, 1], expected: 2, name: 'tiny load keeps a spare' },
    ],
    bugType: 'rounding down',
    hint: 'What does 2500 // 1000 give, and can you run 2.5 servers\' worth of load on 2 servers?',
    explanation: 'Floor division drops the partial server. Servers come in whole units, so the count must round up: `(rps + per_server - 1) // per_server` or `math.ceil`.',
  },
  boss: {
    title: 'Scale up or scale out?',
    statement:
      '`sizes` lists single-machine options `[capacity, cost]` sorted by capacity. For each demand return `"vertical"` if the cheapest single machine that fits costs no more than running `ceil(demand / per_server)` small servers at `server_cost` each, otherwise `"horizontal"`. If no single machine fits, the answer is `"horizontal"`.',
    language: 'python',
    fnName: 'cheaper_strategy',
    starter: `def cheaper_strategy(demands, sizes, per_server, server_cost):
    # your code here
    pass
`,
    solution: `def cheaper_strategy(demands, sizes, per_server, server_cost):
    out = []
    for d in demands:
        vcost = None
        for capacity, cost in sizes:
            if capacity >= d:
                vcost = cost
                break
        hcost = -(-d // per_server) * server_cost
        out.append("vertical" if vcost is not None and vcost <= hcost else "horizontal")
    return out`,
    tests: [
      { args: [[500, 1000, 2000, 3000, 8000, 9000], [[1000, 100], [2000, 250], [4000, 600], [8000, 1500]], 1000, 100], expected: ['vertical', 'vertical', 'horizontal', 'horizontal', 'horizontal', 'horizontal'], name: 'mixed demands' },
      { args: [[1500], [[2000, 150]], 1000, 100], expected: ['vertical'], name: 'big box is cheaper' },
      { args: [[1500], [[2000, 200]], 1000, 100], expected: ['vertical'], name: 'tie prefers vertical' },
      { args: [[], [[1000, 100]], 1000, 100], expected: [], name: 'no demands' },
      { args: [[4000, 4001], [[1000, 100], [2000, 250], [4000, 600], [8000, 1500]], 1000, 150], expected: ['vertical', 'horizontal'], name: 'tie then the next size up' },
    ],
    hints: ['For each demand, find the first size whose capacity covers it (or note that none does), and compute the horizontal cost with a ceiling division.', 'Ceiling division without math: `-(-d // per_server)`. Choose vertical only when a fit exists and `vcost <= hcost`.'],
    combines: ['hld-load-balancing', 'hld-estimation'],
  },
  quiz: [
    {
      prompt: 'Which change makes an app tier safe to scale out behind a load balancer?',
      options: ['Bigger CPUs on each server', 'Keep session data in a shared store instead of server memory', 'Switch to a faster language', 'Add sticky sessions and keep sessions in memory'],
      answer: 1,
      explain: 'Statelessness means any server can serve any request. Sticky sessions work but make load uneven and lose sessions when a server dies.',
    },
  ],
};

export default unit;
