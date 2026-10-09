import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def simulate(events, duration, cold, limit, idle_ttl, provisioned=0):
    envs = [[0, True] for _ in range(provisioned)]               #@init
    out = []
    for t in events:                                             #@loop
        envs = [e for e in envs if e[1] or t - e[0] <= idle_ttl]     #@reclaim
        free = [e for e in envs if e[0] <= t]                    #@free
        if free:
            free[0][0] = t + duration                            #@warm
            out.append("warm")
        elif len(envs) < limit:
            envs.append([t + cold + duration, False])            #@cold
            out.append("cold")
        else:
            out.append("throttled")                              #@throttle
    return out
`;

interface In {
  events: number[];
  duration: number;
  cold: number;
  limit: number;
  idleTtl: number;
  provisioned: number;
  failure: string;
}

const FAILURES = ['none', 'slow dependency (runs 4x longer)'];

interface Env {
  slot: number;
  busy: number;
  pinned: boolean;
}

function clean(i: In) {
  const events = [...i.events].filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  const limit = Math.round(i.limit);
  if (!(limit >= 1 && limit <= 5)) throw new Error('Concurrency limit must be between 1 and 5 for this diagram');
  const provisioned = Math.round(i.provisioned);
  if (!(provisioned >= 0 && provisioned <= limit)) throw new Error('Provisioned environments must be between 0 and the limit');
  if (!(i.duration > 0) || !(i.cold >= 0) || !(i.idleTtl >= 0)) throw new Error('Duration must be > 0, cold start and idle TTL >= 0');
  const duration = i.failure === FAILURES[1] ? i.duration * 4 : i.duration;
  return { events, limit, provisioned, duration, cold: i.cold, idleTtl: i.idleTtl };
}

const viz: VizDef<In> = {
  id: 'aws-lambda',
  title: 'Lambda execution environments: cold, warm, throttled',
  code,
  language: 'python',
  inputs: [
    { key: 'events', label: 'Invocation times (seconds)', kind: 'numbers', default: [0, 1, 2, 3, 6, 7, 40], maxItems: 14 },
    { key: 'duration', label: 'Handler duration (s)', kind: 'number', default: 3 },
    { key: 'cold', label: 'Cold start penalty (s)', kind: 'number', default: 1 },
    { key: 'limit', label: 'Concurrency limit (1-5)', kind: 'number', default: 3 },
    { key: 'idleTtl', label: 'Idle seconds before an environment is reclaimed', kind: 'number', default: 15 },
    { key: 'provisioned', label: 'Provisioned (always warm) environments', kind: 'number', default: 0 },
    { key: 'failure', label: 'Failure injection', kind: 'select', default: FAILURES[0], options: FAILURES },
  ],
  presets: [
    { label: 'Burst, then quiet, then a late call', input: {} },
    { label: 'Throttled (limit 1)', input: { limit: 1, events: [0, 1, 2, 8, 9] } },
    { label: 'Provisioned concurrency', input: { provisioned: 2, events: [0, 0, 0, 1, 40] } },
    { label: 'Slow dependency piles up', input: { failure: FAILURES[1], events: [0, 2, 4, 6, 8, 10], limit: 4 } },
  ],
  run(input) {
    const { events, limit, provisioned, duration, cold, idleTtl } = clean(input);
    const r = new Recorder(code);
    const nodes: ArchNode[] = [
      { id: 'src', label: 'Events', x: 55, y: 105, shape: 'actor' },
      { id: 'svc', label: 'Lambda service', x: 235, y: 105 },
      ...Array.from({ length: limit }, (_, i) => ({ id: `env${i}`, label: `env ${i + 1}`, x: 450, y: limit === 1 ? 105 : 25 + (i * 160) / (limit - 1), w: 70 })),
    ];
    const edges: ArchEdge[] = [{ from: 'src', to: 'svc' }, ...Array.from({ length: limit }, (_, i) => ({ from: 'svc', to: `env${i}` }))];
    let envs: Env[] = [];
    const takeSlot = () => {
      for (let s = 0; s < limit; s++) if (!envs.some((e) => e.slot === s)) return s;
      return -1;
    };
    for (let i = 0; i < provisioned; i++) envs.push({ slot: i, busy: 0, pinned: true });
    const out: string[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const pts: [number, number][] = [];
    const view = (t: number, flow: string | null, svcTone: Tone, fresh = -1, src: Tone = 'default'): Panel[] => {
      const tones: Record<string, Tone> = { svc: svcTone, src };
      const badges: Record<string, string> = {};
      const subs: Record<string, string> = {};
      for (let s = 0; s < limit; s++) {
        const e = envs.find((x) => x.slot === s);
        const id = `env${s}`;
        if (!e) {
          tones[id] = 'muted';
          badges[id] = 'not running';
          continue;
        }
        const busy = e.busy > t;
        tones[id] = s === fresh ? 'new' : busy ? 'active' : 'done';
        badges[id] = busy ? `busy until t=${e.busy}` : 'idle, warm';
        if (e.pinned) subs[id] = 'provisioned';
      }
      return [arch('Invocation path', 600, 210, nodes, edges, { tones, badges, subs, flow }), { type: 'chart', title: 'Busy environments at each invocation', series: [{ label: 'busy', points: pts.length ? pts : [[0, 0]], tone: 'active' }], xLabel: 'seconds', yLabel: 'envs', kind: 'bar' }, logPanel('Outcomes', log)];
    };
    frame(r, 'init', `Limit ${limit} environments, ${provisioned} provisioned, handler takes ${duration}s, cold start ${cold}s`, view(0, null, 'default'), { limit, provisioned });
    for (const t of events) {
      r.op();
      frame(r, 'loop', `t=${t}: an event arrives`, view(t, 'src>svc', 'compare', -1, 'active'), { t });
      const before = envs.length;
      envs = envs.filter((e) => e.pinned || t - e.busy <= idleTtl);
      if (envs.length < before) frame(r, 'reclaim', `${before - envs.length} environment(s) idle longer than ${idleTtl}s were reclaimed`, view(t, null, 'compare'), { envs: envs.length });
      else frame(r, 'reclaim', `Nothing idle for more than ${idleTtl}s, ${envs.length} environment(s) kept`, view(t, null, 'compare'), { envs: envs.length });
      const free = envs.filter((e) => e.busy <= t);
      if (free.length) {
        const e = free[0];
        frame(r, 'free', `env ${e.slot + 1} is idle and warm`, view(t, null, 'compare'), { free: free.length });
        e.busy = t + duration;
        out.push('warm');
        log.push({ text: `t=${t} warm start on env ${e.slot + 1}`, tone: 'found' });
        pts.push([t, envs.filter((x) => x.busy > t).length]);
        frame(r, 'warm', `Warm start: env ${e.slot + 1} runs the handler until t=${e.busy}`, view(t, `svc>env${e.slot}`, 'found'), { outcome: 'warm' });
      } else if (envs.length < limit) {
        const slot = takeSlot();
        frame(r, 'free', `No idle environment, but ${envs.length} < ${limit}: room for another`, view(t, null, 'compare'), { free: 0 });
        const e: Env = { slot, busy: t + cold + duration, pinned: false };
        envs.push(e);
        out.push('cold');
        log.push({ text: `t=${t} cold start on env ${slot + 1} (+${cold}s)`, tone: 'swap' });
        pts.push([t, envs.filter((x) => x.busy > t).length]);
        frame(r, 'cold', `Cold start: env ${slot + 1} boots (+${cold}s), then runs until t=${e.busy}`, view(t, `svc>env${slot}`, 'found', slot), { outcome: 'cold' });
      } else {
        out.push('throttled');
        log.push({ text: `t=${t} throttled (429)`, tone: 'error' });
        pts.push([t, envs.filter((x) => x.busy > t).length]);
        frame(r, 'throttle', `All ${limit} environments are busy: throttled with 429`, view(t, null, 'error', -1, 'error'), { outcome: 'throttled' });
      }
    }
    if (!events.length) frame(r, 'init', 'No invocations were given', view(0, null, 'default'), {});
    const c = (k: string) => out.filter((x) => x === k).length;
    frame(r, 'loop', `${c('warm')} warm, ${c('cold')} cold, ${c('throttled')} throttled`, view(events[events.length - 1] ?? 0, null, 'default'), { warm: c('warm'), cold: c('cold'), throttled: c('throttled') });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { events, limit, provisioned, duration, cold, idleTtl } = clean(input);
    // Independent formulation: each environment is a record with its last finish time and creation order.
    const pool: { finish: number; keep: boolean; order: number }[] = Array.from({ length: provisioned }, (_, order) => ({ finish: 0, keep: true, order }));
    let next = provisioned;
    return events.map((t) => {
      for (let i = pool.length - 1; i >= 0; i--) if (!pool[i].keep && t - pool[i].finish > idleTtl) pool.splice(i, 1);
      const idle = pool.filter((e) => e.finish <= t).sort((a, b) => a.order - b.order)[0];
      if (idle) {
        idle.finish = t + duration;
        return 'warm';
      }
      if (pool.length >= limit) return 'throttled';
      pool.push({ finish: t + cold + duration, keep: false, order: next++ });
      return 'cold';
    });
  },
};

const unit: Unit = {
  id: 'aws-lambda',
  hook: 'Lambda is "just run my function", and the follow-up is always cold starts and concurrency. Knowing why a burst gets throttled while a steady trickle stays warm is the difference between using Lambda and guessing at it.',
  predict: {
    prompt: 'A function takes 2 seconds per call and receives 10 requests per second, evenly spread. Roughly how many execution environments run at once?',
    options: ['2', '10', '20', '1'],
    answer: 2,
    explain: 'Concurrency is arrival rate times duration (Little\'s law): 10 per second x 2 seconds = 20 environments in flight. One environment handles one request at a time.',
  },
  viz,
  deeper: {
    points: [
      'Each execution environment serves **one request at a time**. Concurrent requests need separate environments; a new one means a **cold start** (download code, start runtime, run init code).',
      'After a call the environment stays **warm** for a while and is reused. Idle ones are reclaimed, so quiet periods bring cold starts back.',
      '**Reserved concurrency** caps (and guarantees) a function\'s share of the account limit; **provisioned concurrency** keeps environments initialised so there is no cold start.',
      'Async invocations (events, S3, SNS) are retried on error and can go to a dead-letter queue; synchronous callers get the error or a 429 throttle and must retry themselves.',
      'Timeouts are per invocation (up to 15 minutes). Put slow, variable downstream calls behind their own timeouts or you pay for the wait and burn concurrency.',
    ],
    pitfalls: ['Opening a new database connection per invocation without a proxy or pooling', 'Doing heavy imports in the handler instead of at init time', 'Assuming warm environments keep local state (they may vanish any time)'],
  },
  practice: {
    language: 'python',
    fnName: 'peak_concurrency',
    statement: 'Each invocation starts at a time in `events` and runs for `duration` seconds (it occupies `[t, t + duration)`). Return the largest number of invocations running at the same moment. A call that starts exactly when another ends does not overlap it.',
    signature: 'def peak_concurrency(events, duration):',
    solution: `def peak_concurrency(events, duration):
    points = []
    for t in events:
        points.append((t, 1))
        points.append(@@(t + duration, -1)@@)
    @@points.sort()@@
    current = peak = 0
    for _, delta in points:
        current += delta
        peak = @@max(peak, current)@@
    return peak`,
    tests: [
      { args: [[0, 1, 2], 3], expected: 3, name: 'all overlap' },
      { args: [[0, 3, 6], 3], expected: 1, name: 'back to back does not overlap' },
      { args: [[0, 1, 5, 6], 2], expected: 2, name: 'two separate pairs' },
      { args: [[], 5], expected: 0, name: 'no events' },
      { args: [[5, 0, 1], 10], expected: 3, name: 'unsorted input' },
      { args: [[0, 0, 0, 0], 1], expected: 4, name: 'simultaneous burst' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'simulate',
    statement: 'After an hour of silence the first request is still reported as a warm start, hiding real cold-start latency. Fix `simulate`.',
    buggy: `def simulate(events, duration, cold, limit, idle_ttl):
    envs = []
    out = []
    for t in events:
        free = [e for e in envs if e[0] <= t]
        if free:
            free[0][0] = t + duration
            out.append("warm")
        elif len(envs) < limit:
            envs.append([t + cold + duration])
            out.append("cold")
        else:
            out.append("throttled")
    return out`,
    fixed: `def simulate(events, duration, cold, limit, idle_ttl):
    envs = []
    out = []
    for t in events:
        envs = [e for e in envs if t - e[0] <= idle_ttl]
        free = [e for e in envs if e[0] <= t]
        if free:
            free[0][0] = t + duration
            out.append("warm")
        elif len(envs) < limit:
            envs.append([t + cold + duration])
            out.append("cold")
        else:
            out.append("throttled")
    return out`,
    tests: [
      { args: [[0, 1, 2], 3, 1, 5, 10], expected: ['cold', 'cold', 'cold'], name: 'burst needs three environments' },
      { args: [[0, 5], 3, 1, 5, 10], expected: ['cold', 'warm'], name: 'reuse after finishing' },
      { args: [[0, 100], 3, 1, 5, 10], expected: ['cold', 'cold'], name: 'idle environment is reclaimed' },
      { args: [[0, 1], 3, 1, 1, 10], expected: ['cold', 'throttled'], name: 'limit reached' },
      { args: [[], 3, 1, 1, 10], expected: [], name: 'no events' },
    ],
    bugType: 'stale state never expires',
    hint: 'Where does an environment ever leave the list? What should happen once it has been idle for `idle_ttl`?',
    explanation: 'Environments are only added, never removed, so one that finished long ago is treated as warm forever. Before each event, drop environments whose last finish time is more than `idle_ttl` seconds old.',
  },
  boss: {
    title: 'Provisioned concurrency',
    statement: 'Extend the model: `simulate(events, duration, cold, limit, idle_ttl, provisioned)`. The first `provisioned` environments exist from the start (free at time 0), never get reclaimed and never cold start. Other rules: an event uses the first free environment (warm), else starts a new one if fewer than `limit` exist (cold: busy for `cold + duration`), else is "throttled". Unpinned environments idle for more than `idle_ttl` are removed before each event. Return the outcome list.',
    language: 'python',
    fnName: 'simulate',
    starter: `def simulate(events, duration, cold, limit, idle_ttl, provisioned):
    pass
`,
    solution: `def simulate(events, duration, cold, limit, idle_ttl, provisioned):
    envs = [[0, True] for _ in range(provisioned)]
    out = []
    for t in events:
        envs = [e for e in envs if e[1] or t - e[0] <= idle_ttl]
        free = [e for e in envs if e[0] <= t]
        if free:
            free[0][0] = t + duration
            out.append("warm")
        elif len(envs) < limit:
            envs.append([t + cold + duration, False])
            out.append("cold")
        else:
            out.append("throttled")
    return out`,
    tests: [
      { args: [[0, 0, 0, 0], 2, 1, 3, 10, 2], expected: ['warm', 'warm', 'cold', 'throttled'], name: 'provisioned first, then cold, then throttle' },
      { args: [[0, 100], 1, 1, 3, 10, 1], expected: ['warm', 'warm'], name: 'provisioned survives idleness' },
      { args: [[0, 100], 1, 1, 3, 10, 0], expected: ['cold', 'cold'], name: 'without it the environment is reclaimed' },
      { args: [[0, 1, 2], 5, 1, 2, 10, 1], expected: ['warm', 'cold', 'throttled'], name: 'pinned busy, one extra, then limit' },
      { args: [[0, 0, 100], 1, 1, 3, 10, 1], expected: ['warm', 'cold', 'warm'], name: 'only the unpinned one expires' },
      { args: [[], 1, 1, 3, 10, 2], expected: [], name: 'no events' },
    ],
    hints: ['Represent an environment as `[busy_until, pinned]`. Pinned ones are created up front with `busy_until = 0`.', 'The reclaim filter must keep an environment if it is pinned OR was idle for at most `idle_ttl`; new cold environments are unpinned.'],
    combines: ['aws-ec2'],
  },
  quiz: [
    {
      prompt: 'Which setting removes cold starts for a latency-sensitive function?',
      options: ['Higher memory only', 'Provisioned concurrency', 'A longer timeout', 'Async invocation'],
      answer: 1,
      explain: 'Provisioned concurrency keeps a set number of environments initialised and ready. More memory gives more CPU and can shorten init, but cold starts still happen.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
