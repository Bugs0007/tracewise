import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, globMatch, globRegex, hash31, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def hash31(s):
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h

def handle(lb, rules, default, healthy, state, client, path):
    group = default                                          #@default
    if lb == "ALB":
        for prio, pattern, g in sorted(rules):               #@rules
            if fnmatchcase(path, pattern):
                group = g                                    #@match
                break
    pool = healthy[group]
    if not pool:
        return group, "503"                                  #@empty
    if lb == "NLB":
        return group, pool[hash31(client) % len(pool)]       #@flow
    state[group] = state.get(group, 0) + 1                   #@rr
    return group, pool[(state[group] - 1) % len(pool)]
`;

interface In {
  lb: string;
  rules: string[];
  fallback: string;
  targets: string[];
  failure: string;
  requests: string[];
}

const LBS = ['ALB', 'NLB'];
const FAILURES = ['targets as listed', 'first target of every group fails its health check'];

interface Rule {
  prio: number;
  pattern: string;
  group: string;
  text: string;
}
interface Target {
  group: string;
  id: string;
  up: boolean;
}

function parseRule(s: string): Rule {
  const m = s.trim().match(/^(\d+)\s+(\/\S*)\s*>\s*([\w-]+)$/);
  if (!m) throw new Error(`Rule "${s}" should look like: 10 /api/* > api (priority path-pattern > target group)`);
  return { prio: Number(m[1]), pattern: m[2], group: m[3], text: s.trim() };
}
function parseTarget(s: string): Target {
  const p = s.trim().split(/\s+/);
  if (p.length !== 3 || !['up', 'down'].includes(p[2])) throw new Error(`Target "${s}" should look like: api i-1 up  (group, instance, up/down)`);
  return { group: p[0], id: p[1], up: p[2] === 'up' };
}
function parseReq(s: string): { client: string; path: string } {
  const p = s.trim().split(/\s+/);
  if (p.length !== 2 || !p[1].startsWith('/')) throw new Error(`Request "${s}" should look like: 10.0.0.1 /api/users (client ip, path)`);
  return { client: p[0], path: p[1] };
}

function prep(i: In) {
  if (!LBS.includes(i.lb)) throw new Error('Pick ALB or NLB');
  const rules = i.rules.map(parseRule);
  const prios = rules.map((x) => x.prio);
  if (new Set(prios).size !== prios.length) throw new Error('Rule priorities must be unique');
  if (!/^[\w-]+$/.test(i.fallback)) throw new Error('Default target group should be a single word like web');
  const targets = i.targets.map(parseTarget);
  if (!targets.length) throw new Error('Add at least one target');
  if (i.failure === FAILURES[1]) {
    const seen = new Set<string>();
    for (const t of targets) {
      if (!seen.has(t.group)) t.up = false;
      seen.add(t.group);
    }
  }
  const reqs = i.requests.map(parseReq);
  if (!reqs.length) throw new Error('Add at least one request');
  return { rules, targets, reqs };
}

const viz: VizDef<In> = {
  id: 'aws-elb',
  title: 'ALB vs NLB: rules, target groups and health checks',
  code,
  language: 'python',
  inputs: [
    { key: 'lb', label: 'Load balancer type', kind: 'select', default: 'ALB', options: LBS },
    { key: 'rules', label: 'ALB listener rules (priority path > group)', kind: 'strings', default: ['10 /api/* > api', '20 /img/* > static'], maxItems: 3, help: 'Lowest priority number is checked first. NLB ignores paths (layer 4).' },
    { key: 'fallback', label: 'Default target group', kind: 'string', default: 'web', maxItems: 12 },
    { key: 'targets', label: 'Targets (group instance up|down)', kind: 'strings', default: ['api i-1 up', 'api i-2 down', 'static i-3 up', 'web i-4 up', 'web i-5 up'], maxItems: 6, help: '"down" means the instance fails its health check.' },
    { key: 'failure', label: 'Failure injection', kind: 'select', default: FAILURES[0], options: FAILURES },
    { key: 'requests', label: 'Requests (client ip, path)', kind: 'strings', default: ['10.0.0.1 /api/users', '10.0.0.2 /api/orders', '10.0.0.3 /img/logo.png', '10.0.0.1 /home', '10.0.0.2 /about'], maxItems: 5 },
  ],
  presets: [
    { label: 'ALB path routing with a sick target', input: {} },
    { label: 'NLB: no paths, flow hash per client', input: { lb: 'NLB', requests: ['10.0.0.1 /api/users', '10.0.0.1 /home', '10.0.0.2 /api/users', '10.0.0.2 /img/a.png'] } },
    { label: 'Whole group down gives 503', input: { failure: FAILURES[1], targets: ['api i-1 up', 'static i-3 up', 'web i-4 up'], requests: ['10.0.0.1 /api/users', '10.0.0.1 /home'] } },
    { label: 'Priority decides overlapping rules', input: { rules: ['20 /api/v2/* > v2', '10 /api/* > api'], targets: ['api i-1 up', 'v2 i-2 up', 'web i-3 up'], requests: ['10.0.0.1 /api/v2/users', '10.0.0.1 /api/users'] } },
  ],
  run(input) {
    const { rules, targets, reqs } = prep(input);
    const sortedRules = [...rules].sort((a, b) => a.prio - b.prio);
    const groups = [...new Set([input.fallback, ...rules.map((x) => x.group), ...targets.map((x) => x.group)])];
    const rowsPer = Math.max(targets.length, groups.length);
    const height = Math.max(150, rowsPer * 40 + 30);
    const nodes: ArchNode[] = [
      { id: 'client', label: 'Client', x: 45, y: height / 2, shape: 'actor' },
      { id: 'lb', label: input.lb, sub: input.lb === 'ALB' ? 'layer 7' : 'layer 4', x: 170, y: height / 2 },
    ];
    const edges: ArchEdge[] = [{ from: 'client', to: 'lb' }];
    groups.forEach((g, gi) => {
      nodes.push({ id: `g${gi}`, label: `tg:${g}`, x: 335, y: 30 + gi * 60, shape: 'pill', w: 100, h: 30 });
      edges.push({ from: 'lb', to: `g${gi}`, dashed: true });
    });
    targets.forEach((t, ti) => {
      nodes.push({ id: `t${ti}`, label: t.id, x: 520, y: 24 + ti * 40, w: 90, h: 30 });
      edges.push({ from: `g${groups.indexOf(t.group)}`, to: `t${ti}` });
    });
    const H = Math.max(height, groups.length * 60 + 20);
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const out: [string, string][] = [];
    const healthy: Record<string, string[]> = Object.fromEntries(groups.map((g) => [g, [] as string[]]));
    const state: Record<string, number> = {};
    const tstate: Tone[] = targets.map(() => 'default');
    const served = targets.map(() => 0);
    const view = (tones: Record<string, Tone>, flow: string | null, ruleTones: Record<number, Tone> = {}): Panel[] => [
      arch(`${input.lb} and its target groups`, 640, H, nodes, edges, { tones: { ...Object.fromEntries(targets.map((_, i) => [`t${i}`, tstate[i]])), ...tones }, flow, badges: Object.fromEntries(targets.map((_t, i) => [`t${i}`, `${served[i]} served`])) }),
      listPanel(input.lb === 'ALB' ? 'Listener rules (lowest number first)' : 'NLB: no content rules, one default group', input.lb === 'ALB' ? sortedRules.map((x) => x.text).concat([`default > ${input.fallback}`]) : [`default > ${input.fallback}`], ruleTones),
      logPanel('Requests', log),
    ];
    frame(r, 'default', `${input.lb} with ${groups.length} target groups and ${targets.length} targets: run health checks`, view({}, null), { targets: targets.length });
    targets.forEach((t, ti) => {
      if (t.up) {
        tstate[ti] = 'found';
        healthy[t.group].push(t.id);
      } else {
        tstate[ti] = 'compare';
        frame(r, 'empty', `Health check on ${t.id}: fails (1 of 2)`, view({ lb: 'compare' }, null), { target: t.id });
        tstate[ti] = 'error';
        frame(r, 'empty', `${t.id} fails again: marked unhealthy, removed from rotation`, view({ lb: 'compare' }, null), { target: t.id, healthy: false });
      }
    });
    frame(r, 'default', `Healthy: ${groups.map((g) => `${g} ${healthy[g].length}`).join(', ')}`, view({}, null), { healthy: targets.filter((t) => t.up).length });
    reqs.forEach((q) => {
      r.op();
      frame(r, 'default', `${q.client} requests ${q.path}`, view({ client: 'active', lb: 'compare' }, 'client>lb'), { client: q.client, path: q.path });
      let group = input.fallback;
      const ruleTones: Record<number, Tone> = {};
      if (input.lb === 'ALB') {
        let matched = false;
        for (let k = 0; k < sortedRules.length; k++) {
          const rule = sortedRules[k];
          if (globMatch(rule.pattern, q.path)) {
            ruleTones[k] = 'found';
            group = rule.group;
            matched = true;
            frame(r, 'match', `Rule ${rule.prio} (${rule.pattern}) matches: forward to tg:${group}`, view({ lb: 'found' }, null, { ...ruleTones }), { rule: rule.prio });
            break;
          }
          ruleTones[k] = 'muted';
          frame(r, 'rules', `Rule ${rule.prio}: ${rule.pattern} does not match ${q.path}`, view({ lb: 'compare' }, null, { ...ruleTones }), { rule: rule.prio });
        }
        if (!matched) {
          ruleTones[sortedRules.length] = 'found';
          frame(r, 'default', `No rule matches: default action forwards to tg:${group}`, view({ lb: 'compare' }, null, { ...ruleTones }), { group });
        }
      } else {
        frame(r, 'default', `NLB works at layer 4 and cannot read ${q.path}: default group tg:${group}`, view({ lb: 'compare' }, null, { 0: 'found' }), { group });
      }
      const gi = groups.indexOf(group);
      const pool = healthy[group] ?? [];
      if (!pool.length) {
        out.push([group, '503']);
        log.push({ text: `${q.client} ${q.path} -> tg:${group}: 503, no healthy target`, tone: 'error' });
        frame(r, 'empty', `tg:${group} has no healthy targets: 503 Service Unavailable`, view({ [`g${gi}`]: 'error' }, null, ruleTones), { status: 503 });
        return;
      }
      let chosen: string;
      if (input.lb === 'NLB') {
        chosen = pool[hash31(q.client) % pool.length];
        log.push({ text: `${q.client} ${q.path} -> ${chosen} (flow hash)`, tone: 'found' });
      } else {
        state[group] = (state[group] ?? 0) + 1;
        chosen = pool[(state[group] - 1) % pool.length];
        log.push({ text: `${q.client} ${q.path} -> ${chosen} (round robin)`, tone: 'found' });
      }
      const ti = targets.findIndex((t) => t.id === chosen);
      served[ti]++;
      out.push([group, chosen]);
      const how = input.lb === 'NLB' ? `hash(${q.client}) % ${pool.length} picks ${chosen}` : `round robin over ${pool.length} healthy target(s): ${chosen}`;
      frame(r, input.lb === 'NLB' ? 'flow' : 'rr', `tg:${group}: ${how}`, view({ [`g${gi}`]: 'found', [`t${ti}`]: 'active' }, `g${gi}>t${ti}`, ruleTones), { target: chosen });
    });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { rules, targets, reqs } = prep(input);
    const byPrio = [...rules].sort((a, b) => a.prio - b.prio);
    const counters = new Map<string, number>();
    return reqs.map((q): [string, string] => {
      const hit = input.lb === 'ALB' ? byPrio.find((x) => globRegex(x.pattern, q.path)) : undefined;
      const group = hit ? hit.group : input.fallback;
      const pool = targets.filter((t) => t.group === group && t.up).map((t) => t.id);
      if (!pool.length) return [group, '503'];
      if (input.lb === 'NLB') return [group, pool[hash31(q.client) % pool.length]];
      const n = counters.get(group) ?? 0;
      counters.set(group, n + 1);
      return [group, pool[n % pool.length]];
    });
  },
};

const unit: Unit = {
  id: 'aws-elb',
  hook: 'Load balancers appear in almost every system design. The sharp question is ALB versus NLB: content-aware routing at layer 7, or raw, fast, connection-level forwarding at layer 4, and how health checks keep traffic away from sick instances.',
  predict: {
    prompt: 'A listener has rule priority 10 "/api/*" -> v1 and priority 20 "/api/v2/*" -> v2. A request for /api/v2/users arrives. Where does it go?',
    options: ['v2: the more specific pattern wins', 'v1: rules are evaluated by priority and the first match wins', 'Both groups', 'The default action'],
    answer: 1,
    explain: 'ALB rules are evaluated in priority order (lowest number first) and the first match is used. Specificity is not considered, so put the narrower rule at a lower number.',
  },
  viz,
  deeper: {
    points: [
      '**ALB** (layer 7) understands HTTP: rules by host, path, header or query string, redirects, fixed responses, authentication, WebSockets and gRPC. **NLB** (layer 4) forwards TCP/UDP/TLS connections with very low latency, static IPs and the client\'s source IP.',
      'A **listener** (port + protocol) has ordered **rules** that forward to a **target group**: instances, IPs or Lambda functions. The default action handles everything else.',
      '**Health checks** probe each target on a path or port; after N consecutive failures a target leaves rotation and returns after enough successes. If every target is unhealthy, ALB returns 503 (or fails open when configured).',
      'ALB spreads requests (round robin or least outstanding requests); NLB spreads **flows**: a connection sticks to one target via a flow hash.',
      'Connection draining (deregistration delay) lets in-flight requests finish when a target is removed, which is what makes rolling deploys and auto scaling safe.',
    ],
    pitfalls: ['Health check path that needs authentication, so healthy targets are marked down', 'Overlapping rules in the wrong priority order', 'Using NLB and expecting path-based routing'],
  },
  practice: {
    language: 'python',
    fnName: 'route',
    statement: 'Implement an ALB listener. `rules` is a list of `[priority, path_pattern, group]` where patterns use `*` wildcards (use `fnmatch.fnmatchcase`). Check rules from the lowest priority number up and return the group of the first match; if none match return `default`.',
    signature: 'def route(rules, default, path):',
    solution: `from fnmatch import fnmatchcase

def route(rules, default, path):
    for prio, pattern, group in @@sorted(rules)@@:
        if @@fnmatchcase(path, pattern)@@:
            return group
    return @@default@@`,
    tests: [
      { args: [[[10, '/api/*', 'api'], [20, '/img/*', 'static']], 'web', '/api/users'], expected: 'api', name: 'path prefix' },
      { args: [[[10, '/api/*', 'api'], [20, '/img/*', 'static']], 'web', '/home'], expected: 'web', name: 'default action' },
      { args: [[[20, '/api/v2/*', 'v2'], [10, '/api/*', 'v1']], 'web', '/api/v2/x'], expected: 'v1', name: 'lowest priority number wins, not the narrower rule' },
      { args: [[[10, '/api/v2/*', 'v2'], [20, '/api/*', 'v1']], 'web', '/api/v2/x'], expected: 'v2', name: 'narrow rule first' },
      { args: [[[5, '*.png', 'img']], 'web', '/a/b/logo.png'], expected: 'img', name: 'suffix wildcard' },
      { args: [[], 'web', '/x'], expected: 'web', name: 'no rules' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'route',
    statement: 'Rules were added in the console as priority 20 first and priority 10 second, and the wrong group answers. Fix `route` so the lowest priority number is evaluated first.',
    buggy: `from fnmatch import fnmatchcase

def route(rules, default, path):
    for prio, pattern, group in rules:
        if fnmatchcase(path, pattern):
            return group
    return default`,
    fixed: `from fnmatch import fnmatchcase

def route(rules, default, path):
    for prio, pattern, group in sorted(rules):
        if fnmatchcase(path, pattern):
            return group
    return default`,
    tests: [
      { args: [[[20, '/api/v2/*', 'v2'], [10, '/api/*', 'v1']], 'web', '/api/v2/x'], expected: 'v1', name: 'priority 10 first' },
      { args: [[[10, '/api/*', 'api']], 'web', '/home'], expected: 'web', name: 'falls through to default' },
      { args: [[[30, '/a*', 'c'], [10, '/ab*', 'a'], [20, '/abc*', 'b']], 'w', '/abcd'], expected: 'a', name: 'three overlapping rules' },
    ],
    bugType: 'priority ignored',
    hint: 'In what order does the loop visit the rules, and in what order should it?',
    explanation: 'The loop uses the order the rules were stored. ALB evaluates by priority number, so sort first (tuples sort by their first element, the priority).',
  },
  boss: {
    title: 'Load balancer simulator',
    statement: 'Write `balance(lb, rules, default, targets, requests)`. `targets` is a list of `[group, id, healthy]`, `requests` a list of `[client_ip, path]`. For "ALB" pick the group with the ALB rule logic (`rules` are `[priority, pattern, group]`, lowest priority first, `fnmatchcase`, else `default`); for "NLB" the group is always `default`. The pool is the healthy ids of that group in listed order; an empty pool gives `[group, "503"]`. ALB picks round robin per group (a counter per group, advanced only when a target is chosen, starting at the first); NLB picks `pool[h % len(pool)]` where `h` is the 32-bit hash `h = (h * 31 + ord(c)) & 0xFFFFFFFF` over the client ip characters, starting from 0. Return `[group, id]` for each request.',
    language: 'python',
    fnName: 'balance',
    starter: `def balance(lb, rules, default, targets, requests):
    pass
`,
    solution: `from fnmatch import fnmatchcase

def balance(lb, rules, default, targets, requests):
    def hash31(s):
        h = 0
        for c in s:
            h = (h * 31 + ord(c)) & 0xFFFFFFFF
        return h

    counters = {}
    out = []
    for client, path in requests:
        group = default
        if lb == "ALB":
            for prio, pattern, g in sorted(rules):
                if fnmatchcase(path, pattern):
                    group = g
                    break
        pool = [tid for g, tid, ok in targets if g == group and ok]
        if not pool:
            out.append([group, "503"])
        elif lb == "NLB":
            out.append([group, pool[hash31(client) % len(pool)]])
        else:
            n = counters.get(group, 0)
            counters[group] = n + 1
            out.append([group, pool[n % len(pool)]])
    return out`,
    tests: [
      { args: ['ALB', [[10, '/api/*', 'api']], 'web', [['api', 'i-1', true], ['api', 'i-2', true], ['web', 'i-3', true]], [['1.1.1.1', '/api/a'], ['1.1.1.1', '/api/b'], ['1.1.1.1', '/api/c'], ['1.1.1.1', '/home']]], expected: [['api', 'i-1'], ['api', 'i-2'], ['api', 'i-1'], ['web', 'i-3']], name: 'round robin per group' },
      { args: ['ALB', [[10, '/api/*', 'api']], 'web', [['api', 'i-1', false], ['api', 'i-2', true], ['web', 'i-3', true]], [['1.1.1.1', '/api/a'], ['1.1.1.1', '/api/b']]], expected: [['api', 'i-2'], ['api', 'i-2']], name: 'unhealthy target skipped' },
      { args: ['ALB', [[10, '/api/*', 'api']], 'web', [['api', 'i-1', false], ['web', 'i-3', true]], [['1.1.1.1', '/api/a']]], expected: [['api', '503']], name: 'empty pool gives 503' },
      { args: ['ALB', [[20, '/api/v2/*', 'v2'], [10, '/api/*', 'v1']], 'web', [['v1', 'a', true], ['v2', 'b', true], ['web', 'c', true]], [['1.1.1.1', '/api/v2/x']]], expected: [['v1', 'a']], name: 'priority order' },
      { args: ['NLB', [[10, '/api/*', 'api']], 'web', [['api', 'i-1', true], ['web', 'i-3', true], ['web', 'i-4', true]], [['a', '/api/x'], ['a', '/home'], ['b', '/home']]], expected: [['web', 'i-4'], ['web', 'i-4'], ['web', 'i-3']], name: 'NLB ignores paths and sticks per client' },
      { args: ['NLB', [], 'web', [['web', 'x', false]], [['a', '/']]], expected: [['web', '503']], name: 'NLB with no healthy target' },
      { args: ['ALB', [], 'web', [['web', 'i-1', true], ['web', 'i-2', true]], [['a', '/1'], ['a', '/2'], ['a', '/3']]], expected: [['web', 'i-1'], ['web', 'i-2'], ['web', 'i-1']], name: 'default group round robin' },
    ],
    hints: ['Build `pool = [tid for g, tid, ok in targets if g == group and ok]` for each request. Only ALB looks at the rules; sort them so the lowest priority is checked first.', 'Round robin needs a per-group counter that increments only when you actually choose a target; NLB uses the hash of the client ip instead and ignores the counters.'],
    combines: ['aws-ec2', 'aws-autoscaling'],
  },
  quiz: [
    {
      prompt: 'You need to route /payments to one service and /search to another behind a single DNS name. Which load balancer?',
      options: ['NLB, with two listeners', 'ALB with path-based rules', 'Classic DNS round robin', 'Either; both read HTTP paths'],
      answer: 1,
      explain: 'Path-based routing needs layer 7 awareness. NLB forwards connections without looking inside them.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
