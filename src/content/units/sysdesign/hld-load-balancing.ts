import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, needOneOf } from '@/content/lib/sysdesign-hld-2';
import { barChart, fnvHash, splitToken } from '@/content/lib/sysdesign-hld-3';

const code = `
def pick(algo, n, weights, active, state, client):
    if algo == "round-robin":
        i = state["next"] % n                                  #@rr
        state["next"] += 1
    elif algo == "weighted":
        pool = [s for s in range(n) for _ in range(weights[s])]   #@pool
        i = pool[state["next"] % len(pool)]
        state["next"] += 1
    elif algo == "least-connections":
        i = min(range(n), key=lambda s: (active[s], s))        #@least
    else:
        i = h(client) % n                                      #@hash
    active[i] += 1                                             #@assign
    return i
`;

interface In {
  algo: string;
  weights: number[];
  requests: string[];
}

const ALGOS = ['round-robin', 'weighted', 'least-connections', 'ip-hash'] as const;

function parse(input: In) {
  const algo = needOneOf('algo', input.algo, ALGOS);
  const weights = input.weights.map(Number);
  if (weights.length < 2 || weights.length > 5) throw new Error('Give 2 to 5 server weights');
  if (weights.some((w) => !Number.isInteger(w) || w < 1 || w > 5)) throw new Error('Each weight must be a whole number from 1 to 5');
  if (!input.requests.length) throw new Error('Give at least one request');
  if (input.requests.length > 16) throw new Error('At most 16 requests, to keep the picture readable');
  const reqs = input.requests.map((t) => {
    const [client, d] = splitToken(t, 'request');
    const dur = Number(d);
    if (!Number.isInteger(dur) || dur < 1 || dur > 9) throw new Error(`request "${t}": duration must be a whole number from 1 to 9`);
    return { client, dur };
  });
  return { algo, weights, reqs };
}

const viz: VizDef<In> = {
  id: 'hld-load-balancing',
  title: 'Load balancing algorithms',
  code,
  language: 'python',
  inputs: [
    { key: 'algo', label: 'Algorithm', kind: 'select', options: [...ALGOS], default: 'round-robin' },
    { key: 'weights', label: 'Server weights (one per server)', kind: 'numbers', default: [1, 1, 1], maxItems: 5, help: 'Only the weighted algorithm uses the values; the count sets the number of servers.' },
    { key: 'requests', label: 'Requests (client:duration in ticks)', kind: 'strings', default: ['u1:3', 'u2:1', 'u3:4', 'u1:2', 'u4:1', 'u2:3', 'u5:1', 'u1:2', 'u6:5', 'u3:1'], maxItems: 16, help: 'One request arrives per tick and stays busy for its duration.' },
  ],
  presets: [
    { label: 'Round-robin', input: { algo: 'round-robin' } },
    { label: 'Weighted 3:1:1', input: { algo: 'weighted', weights: [3, 1, 1] } },
    { label: 'Least connections, one slow request', input: { algo: 'least-connections', requests: ['u1:9', 'u2:1', 'u3:1', 'u4:1', 'u5:1', 'u6:1', 'u7:1', 'u8:1'] } },
    { label: 'IP hash (sticky clients)', input: { algo: 'ip-hash' } },
  ],
  run(input) {
    const { algo, weights, reqs } = parse(input);
    const n = weights.length;
    const r = new Recorder(code);
    const finish: number[][] = Array.from({ length: n }, () => []);
    const counts = new Array<number>(n).fill(0);
    const assignment: number[] = [];
    const pool = weights.flatMap((w, s) => new Array<number>(w).fill(s));
    let next = 0;
    let maxActive = 0;
    const H = Math.max(120, 40 + n * 44);
    const view = (chosen: number, t: number, client?: string): Panel[] => {
      const nodes = [gnode('C', client ? `Request from ${client}` : 'Clients', 52, H / 2, { shape: 'actor' }), gnode('LB', algo, 175, H / 2, { shape: 'pill', w: 110 })];
      const edges = [gedge('C', 'LB', { flow: chosen >= 0 })];
      for (let s = 0; s < n; s++) {
        const act = finish[s].filter((f) => f > t).length;
        const tone: Tone = s === chosen ? 'active' : act >= 3 ? 'compare' : 'default';
        nodes.push(gnode('S' + s, 'Server ' + s, 330, 30 + (n === 1 ? 0 : (s * (H - 60)) / (n - 1)), { tone, badge: `${act} busy · ${counts[s]} total`, shape: 'rect', w: 96 }));
        edges.push(gedge('LB', 'S' + s, { tone: s === chosen ? 'active' : 'default', flow: s === chosen }));
      }
      return [graph(nodes, edges, 420, H, 'Balancer and servers')];
    };

    r.step(undefined, `${n} servers, ${reqs.length} requests, algorithm: ${algo}`, view(-1, 0), { algo, servers: n });
    reqs.forEach((q, t) => {
      const active = finish.map((f) => f.filter((x) => x > t).length);
      let i: number;
      let why: string;
      let at: string;
      if (algo === 'round-robin') {
        i = next % n;
        next++;
        at = 'rr';
        why = `next=${next - 1} % ${n} = ${i}`;
      } else if (algo === 'weighted') {
        i = pool[next % pool.length];
        why = `slot ${next % pool.length} of pool [${pool.join(',')}] = ${i}`;
        next++;
        at = 'pool';
      } else if (algo === 'least-connections') {
        i = active.indexOf(Math.min(...active));
        why = `busy=[${active.join(',')}] → fewest is server ${i}`;
        at = 'least';
      } else {
        const hv = fnvHash(q.client, 4294967296);
        i = hv % n;
        why = `h(${q.client}) % ${n} = ${i}`;
        at = 'hash';
      }
      r.op();
      r.step(at, `Req ${t + 1} (${q.client}, ${q.dur}t): ${why}`, view(i, t, q.client), { tick: t, busy: active.join(','), pick: i });
      counts[i]++;
      finish[i].push(t + q.dur);
      assignment.push(i);
      maxActive = Math.max(maxActive, finish[i].filter((f) => f > t).length);
      r.step('assign', `Server ${i} now has ${finish[i].filter((f) => f > t).length} in flight`, view(i, t, q.client), { server: i, total: counts[i] });
    });
    const result = { counts, assignment, maxActive };
    const worst = Math.max(...counts);
    r.step(undefined, `Totals ${counts.join(' / ')}; busiest server held ${maxActive} at once`, [barChart('Requests per server', counts.map((_, s) => 'S' + s), counts, { xLabel: 'server', yLabel: 'requests', tone: worst > reqs.length / n + 2 ? 'error' : 'done' }), kvPanel('Outcome', { maxActive, counts: counts.join(',') })], { maxActive });
    return { frames: r.frames, result };
  },
  reference(input) {
    const { algo, weights, reqs } = parse(input);
    const n = weights.length;
    const ends: number[][] = Array.from({ length: n }, () => []);
    const assignment: number[] = [];
    let rr = 0;
    let maxActive = 0;
    reqs.forEach((q, t) => {
      const load = ends.map((e) => e.filter((x) => x > t).length);
      let i = 0;
      if (algo === 'round-robin') i = rr++ % n;
      else if (algo === 'weighted') {
        let k = rr++ % weights.reduce((a, b) => a + b, 0);
        while (k >= weights[i]) k -= weights[i++];
      } else if (algo === 'least-connections') {
        for (let s = 1; s < n; s++) if (load[s] < load[i]) i = s;
      } else i = fnvHash(q.client, 4294967296) % n;
      ends[i].push(t + q.dur);
      assignment.push(i);
      maxActive = Math.max(maxActive, ends[i].filter((x) => x > t).length);
    });
    return { counts: ends.map((_, s) => assignment.filter((a) => a === s).length), assignment, maxActive };
  },
};

const ops = (...n: string[]) => n;

const lcTests = [
  { args: [ops('LeastConnections', 'acquire', 'acquire', 'acquire', 'release', 'acquire'), [[3], [], [], [], [0], []]], expected: [null, 0, 1, 2, null, 0], name: 'fills all, then reuses a freed server' },
  { args: [ops('LeastConnections', 'acquire', 'acquire', 'release', 'acquire', 'acquire'), [[2], [], [], [1], [], []]], expected: [null, 0, 1, null, 1, 0], name: 'ties go to the lowest index' },
  { args: [ops('LeastConnections', 'acquire', 'acquire', 'acquire'), [[1], [], [], []]], expected: [null, 0, 0, 0], name: 'single server' },
  { args: [ops('LeastConnections', 'acquire', 'acquire', 'acquire', 'release', 'release', 'acquire', 'acquire'), [[2], [], [], [], [0], [0], [], []]], expected: [null, 0, 1, 0, null, null, 0, 0], name: 'heavily loaded server is skipped' },
];

const rrClass = `class RoundRobin:
    def __init__(self, servers):
        self.servers = servers
        self.i = 0

    def next(self):
        s = self.servers[self.i % len(self.servers)]
        self.i += 1
        return s`;

const unit: Unit = {
  id: 'hld-load-balancing',
  hook: 'Every horizontally scaled design has a load balancer in it. Interviewers ask which algorithm you pick and why: round-robin is only fair when requests cost the same.',
  predict: {
    prompt: 'Three servers, round-robin. Every third request is a slow 5-second export; the rest take 50 ms. Which server ends up buried?',
    options: ['None, round-robin spreads evenly', 'Whichever server receives the 3rd, 6th, 9th... request, because every slow one lands on it', 'The first server, it is always picked first', 'The last server, because it is picked last'],
    answer: 1,
    explain: 'Round-robin counts requests, not work. With a period of 3 and 3 servers, every slow request hits the same server while the other two idle. Least-connections would notice that server is busy and steer around it.',
  },
  viz,
  deeper: {
    points: [
      'Round-robin hands out servers in turn: no state beyond a counter, perfect when requests are similar and servers identical.',
      'Weighted round-robin gives bigger machines proportionally more turns (a 3:1 weight means three of every four requests).',
      'Least-connections sends each request to the server with the fewest in-flight requests, which adapts to uneven request cost and slow servers.',
      'IP-hash (or any key hash) maps a client to the same server every time. It gives stickiness for in-memory sessions or warm caches but unbalances load and reshuffles when the server count changes.',
      'Health checks matter more than the algorithm: a balancer must stop sending traffic to a dead server within seconds.',
    ],
    complexity: { time: 'O(1) per pick (O(n) for least-connections without a heap)', space: 'O(n) counters' },
    pitfalls: ['Round-robin index that never wraps around the server list', 'Hash-based stickiness with a server count that changes (use consistent hashing)', 'Forgetting to decrement the connection count when a request finishes'],
  },
  practice: {
    language: 'python',
    fnName: 'LeastConnections',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `LeastConnections(n)`. `acquire()` picks the server with the fewest active requests (lowest index on ties), counts the request against it and returns the index. `release(i)` records that one request on server `i` finished.',
    signature: 'class LeastConnections:',
    solution: `class LeastConnections:
    def __init__(self, n):
        self.active = @@[0] * n@@

    def acquire(self):
        best = 0
        for i in @@range(1, len(self.active))@@:
            if @@self.active[i] < self.active[best]@@:
                best = i
        @@self.active[best] += 1@@
        return best

    def release(self, i):
        @@self.active[i] -= 1@@`,
    tests: lcTests,
  },
  debug: {
    language: 'python',
    fnName: 'RoundRobin',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'The balancer works for the first few requests, then crashes with an IndexError. Find the bug.',
    buggy: rrClass.replace('self.servers[self.i % len(self.servers)]', 'self.servers[self.i]'),
    fixed: rrClass,
    tests: [
      { args: [ops('RoundRobin', 'next', 'next', 'next'), [[['a', 'b', 'c']], [], [], []]], expected: [null, 'a', 'b', 'c'], name: 'one lap' },
      { args: [ops('RoundRobin', 'next', 'next', 'next', 'next', 'next'), [[['a', 'b', 'c']], [], [], [], [], []]], expected: [null, 'a', 'b', 'c', 'a', 'b'], name: 'wraps around' },
      { args: [ops('RoundRobin', 'next', 'next', 'next'), [[['only']], [], [], []]], expected: [null, 'only', 'only', 'only'], name: 'single server' },
    ],
    bugType: 'index never wraps',
    hint: 'What is self.i after the fourth call with three servers, and what does it index?',
    explanation: 'The counter keeps growing, but the list has a fixed length. Taking the index modulo the number of servers makes the sequence cycle forever.',
  },
  boss: {
    title: 'Least-connections simulator',
    statement:
      'Request `t` arrives at tick `t` and occupies a server for `durations[t]` ticks (it is finished at tick `t + durations[t]`; a finished request no longer counts at that tick). Send each request to the server with the fewest in-flight requests, lowest index on ties. Return the list of chosen server indices for `n` servers.',
    language: 'python',
    fnName: 'assign_least',
    starter: `def assign_least(durations, n):
    # your code here
    pass
`,
    solution: `def assign_least(durations, n):
    busy = [[] for _ in range(n)]
    out = []
    for t, d in enumerate(durations):
        for q in busy:
            q[:] = [f for f in q if f > t]
        best = min(range(n), key=lambda s: (len(busy[s]), s))
        busy[best].append(t + d)
        out.append(best)
    return out`,
    tests: [
      { args: [[3, 1, 4, 1, 5], 2], expected: [0, 1, 1, 0, 0], name: 'two servers' },
      { args: [[5, 5, 5, 5, 5, 5], 3], expected: [0, 1, 2, 0, 1, 0], name: 'all busy' },
      { args: [[1, 1, 1, 1], 3], expected: [0, 0, 0, 0], name: 'instant requests stay on server 0' },
      { args: [[9, 1, 1, 1, 1, 1, 9], 2], expected: [0, 1, 1, 1, 1, 1, 1], name: 'one slow request is avoided' },
      { args: [[2], 1], expected: [0], name: 'single request' },
    ],
    hints: ['Keep, per server, the finish times of requests still in flight. Drop the finished ones at the start of each tick.', 'A request finishes when `finish <= t`, so keep only `f > t`. Then pick the server minimising `(len(busy[s]), s)`.'],
    combines: ['hld-client-server'],
  },
  quiz: [
    {
      prompt: 'Which algorithm keeps a user on the same server without storing any session table in the balancer?',
      options: ['Round-robin', 'Least-connections', 'Hash of the client IP or session id', 'Weighted round-robin'],
      answer: 2,
      explain: 'A deterministic hash of a stable key maps the same client to the same server each time. The cost is uneven load and a reshuffle whenever the server count changes.',
    },
  ],
};

export default unit;
