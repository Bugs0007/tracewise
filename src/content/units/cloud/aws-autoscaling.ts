import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, kvPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def step(n, load, t, state, cap, target, lo, hi, cooldown, scale_in_step):
    want = -(-load * 100 // (cap * target))                 #@want
    want = max(lo, min(hi, want))                           #@clamp
    if want > n:
        state["last"] = t
        return want                                         #@out
    if want < n and t - state["last"] >= cooldown:
        state["last"] = t
        return max(want, n - scale_in_step)                 #@in
    return n                                                #@hold
`;

interface In {
  load: number[];
  capacity: number;
  target: number;
  bounds: number[];
  cooldown: number;
  inStep: number;
}

function prep(i: In) {
  if (!i.load.length) throw new Error('Add at least one load value');
  if (i.load.some((x) => x < 0)) throw new Error('Load cannot be negative');
  const cap = Math.round(i.capacity);
  const target = Math.round(i.target);
  const cooldown = Math.round(i.cooldown);
  const step = Math.round(i.inStep);
  if (i.bounds.length !== 2) throw new Error('Bounds are two numbers: min and max instances');
  const [lo, hi] = i.bounds.map(Math.round);
  if (!(cap >= 1)) throw new Error('Capacity per instance must be at least 1');
  if (!(target >= 1 && target <= 100)) throw new Error('Target utilisation must be between 1 and 100');
  if (!(lo >= 0 && hi >= lo && hi <= 8 && hi >= 1)) throw new Error('Use 0 <= min <= max, with max between 1 and 8');
  if (!(cooldown >= 0) || !(step >= 1)) throw new Error('Cooldown must be 0 or more and scale-in step at least 1');
  return { load: i.load.map(Math.round), cap, target, lo, hi, cooldown, step };
}


const viz: VizDef<In> = {
  id: 'aws-autoscaling',
  title: 'Auto Scaling: target tracking and cooldown',
  code,
  language: 'python',
  inputs: [
    { key: 'load', label: 'Load per tick (requests/s)', kind: 'numbers', default: [100, 100, 300, 500, 500, 200, 100, 100, 300, 100], maxItems: 14 },
    { key: 'capacity', label: 'Capacity of one instance at 100% (req/s)', kind: 'number', default: 100 },
    { key: 'target', label: 'Target utilisation (%)', kind: 'number', default: 50 },
    { key: 'bounds', label: 'Group size [min, max] (max up to 8)', kind: 'numbers', default: [1, 6], maxItems: 2 },
    { key: 'cooldown', label: 'Scale-in cooldown (ticks)', kind: 'number', default: 3 },
    { key: 'inStep', label: 'Max instances removed per scale-in', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Spike, then cooldown holds capacity', input: {} },
    { label: 'No cooldown: flapping', input: { cooldown: 0, load: [100, 500, 100, 500, 100, 500, 100, 500], inStep: 8 } },
    { label: 'Load beyond max size', input: { load: [100, 400, 900, 900, 900, 200], bounds: [2, 4] } },
    { label: 'Empty group can scale to zero', input: { load: [200, 0, 0, 0, 0, 0], bounds: [0, 4], cooldown: 1 } },
  ],
  run(input) {
    const { load, cap, target, lo, hi, cooldown, step } = prep(input);
    const r = new Recorder(code);
    const state = { last: -1_000_000 };
    let n = lo;
    const counts: number[] = [];
    const series = { load: [] as [number, number][], capacity: [] as [number, number][], inst: [] as [number, number][] };
    const scene = (inst: number, tones: Record<string, Tone>, flow: string | null, fresh: Set<number>): Panel => {
      const nodes: ArchNode[] = [
        { id: 'lb', label: 'Load balancer', x: 60, y: 75 },
        { id: 'asg', label: 'Auto Scaling group', x: 215, y: 75, w: 130 },
      ];
      const edges: ArchEdge[] = [{ from: 'lb', to: 'asg' }];
      for (let k = 0; k < hi; k++) {
        const on = k < inst;
        nodes.push({ id: `i${k}`, label: on ? `i-${k + 1}` : 'off', x: 350 + (k % 4) * 70, y: 40 + Math.floor(k / 4) * 70, w: 56, h: 30 });
        if (on) edges.push({ from: 'asg', to: `i${k}` });
      }
      const itones: Record<string, Tone> = Object.fromEntries(Array.from({ length: hi }, (_, k) => [`i${k}`, (k < inst ? (fresh.has(k) ? 'new' : 'found') : 'muted') as Tone]));
      return arch('Group', 640, hi > 4 ? 155 : 110, nodes, edges, { tones: { ...itones, ...tones }, flow, badges: { asg: `${inst} of ${lo}-${hi}` } });
    };
    const charts = (): Panel[] => [
      { type: 'chart', title: 'Load vs capacity at the target (req/s)', kind: 'line', series: [{ label: 'load', points: series.load.slice(), tone: 'error' }, { label: 'capacity at target', points: series.capacity.slice(), tone: 'found' }], xLabel: 'tick', yLabel: 'req/s' },
      { type: 'chart', title: 'Instances', kind: 'bar', series: [{ label: 'instances', points: series.inst.slice(), tone: 'active' }], xLabel: 'tick', yLabel: 'instances' },
    ];
    frame(r, 'want', `Target ${target}% of ${cap} req/s per instance, group ${lo}-${hi}, scale-in cooldown ${cooldown}`, [scene(n, {}, null, new Set()), kvPanel('Settings', { 'target utilisation': `${target}%`, 'one instance at target': `${(cap * target) / 100} req/s`, min: lo, max: hi, cooldown, 'scale-in step': step })], { instances: n });
    load.forEach((L, t) => {
      r.op();
      const raw = Math.floor((L * 100 + cap * target - 1) / (cap * target));
      const want = Math.max(lo, Math.min(hi, raw));
      const util = n ? Math.round((L * 100) / (n * cap)) : L > 0 ? Infinity : 0;
      const utilTxt = n ? `${util}%` : 'no instances';
      series.load.push([t, L]);
      const before = n;
      frame(r, raw === want ? 'want' : 'clamp', raw === want ? `t=${t} load ${L}: ${n} instance(s) run at ${utilTxt}; target tracking wants ${want}` : `t=${t} load ${L} needs ${raw} instances, clamped to ${want} by min/max`, [scene(n, { lb: 'active', asg: util > 100 ? 'error' : 'compare' }, 'lb>asg', new Set()), ...charts(), kvPanel('Decision', { load: L, utilisation: utilTxt, wanted: raw, clamped: want, 'since last action': t - state.last > 1e5 ? 'never' : t - state.last })], { t, load: L, instances: n, want });
      const fresh = new Set<number>();
      let at = 'hold';
      let msg = `t=${t}: keep ${n} instance(s)`;
      if (want > n) {
        for (let k = n; k < want; k++) fresh.add(k);
        n = want;
        state.last = t;
        at = 'out';
        msg = `t=${t}: scale out ${before} -> ${n}. Adding capacity is never delayed by cooldown`;
      } else if (want < n && t - state.last >= cooldown) {
        n = Math.max(want, n - step);
        state.last = t;
        at = 'in';
        msg = `t=${t}: scale in ${before} -> ${n}${n > want ? ` (at most ${step} per step, wants ${want})` : ''}`;
      } else if (want < n) msg = `t=${t}: wants ${want} but cooldown holds ${n} (${cooldown - (t - state.last)} tick(s) left)`;
      counts.push(n);
      series.capacity.push([t, (n * cap * target) / 100]);
      series.inst.push([t, n]);
      frame(r, at, msg, [scene(n, { asg: at === 'out' ? 'new' : at === 'in' ? 'swap' : 'default' }, null, fresh), ...charts(), kvPanel('After the step', { instances: n, overloaded: L > n * cap ? 'yes (load > 100% of capacity)' : 'no' }, { overloaded: L > n * cap ? 'error' : 'found' })], { t, instances: n });
    });
    return { frames: r.frames, result: counts };
  },
  reference(input) {
    const { load, cap, target, lo, hi, cooldown, step } = prep(input);
    // Independent formulation: search for the smallest instance count whose target capacity covers the load.
    const needed = (L: number): number => {
      let k = 0;
      while (k * cap * target < L * 100) k++;
      return Math.max(lo, Math.min(hi, k));
    };
    let n = lo;
    let last = -Infinity;
    return load.map((L, t) => {
      const w = needed(L);
      if (w > n) {
        n = w;
        last = t;
      } else if (w < n && t - last >= cooldown) {
        n = Math.max(w, n - step);
        last = t;
      }
      return n;
    });
  },
};


const unit: Unit = {
  id: 'aws-autoscaling',
  hook: 'Auto scaling is "how does your system survive a traffic spike without paying for idle servers?". The follow-up is always about flapping: how target tracking, min/max bounds and cooldowns keep the group stable.',
  predict: {
    prompt: 'Load drops sharply right after a scale-out. With a scale-in cooldown of 5 minutes, what happens to the new instances?',
    options: ['They are terminated immediately to save money', 'They stay until the cooldown has passed, then the group scales in', 'The cooldown only applies to scale-out', 'They are stopped but billed'],
    answer: 1,
    explain: 'The cooldown suppresses scale-in after a recent scaling action so a short dip does not remove capacity you will need again in a minute. Scale-out stays eager because under-provisioning hurts users.',
  },
  viz,
  deeper: {
    points: [
      '**Target tracking** keeps a metric (average CPU, requests per target) near a target: desired = ceil(current load / load one instance handles at the target). It scales out quickly and in conservatively.',
      '**Min / max / desired**: the group never goes outside [min, max]. A min above 1 across zones gives resilience; a max protects your budget (and your downstream database).',
      '**Cooldown** and instance **warm-up** stop a new instance\'s startup lag or a short dip from triggering another change. Without them the group flaps.',
      'Other policies: **step scaling** (bigger jumps for bigger breaches), **scheduled scaling** for known peaks and **predictive scaling**. A queue depth per worker is the usual metric for async consumers.',
      'Health checks replace failed instances automatically, and the load balancer only sends traffic to instances that have registered and passed their checks.',
    ],
    pitfalls: ['Scaling on CPU for an I/O-bound service', 'Maximum set so low that the group saturates and users see errors', 'A scale-in policy with no cooldown, causing thrashing'],
  },
  practice: {
    language: 'python',
    fnName: 'desired_capacity',
    statement: 'Return how many instances target tracking wants: the smallest whole number of instances whose combined capacity at the target utilisation covers `load`. One instance handles `cap` requests/s at 100%, and the target is `target` percent. Clamp the result to `[lo, hi]`. Use integer arithmetic.',
    signature: 'def desired_capacity(load, cap, target, lo, hi):',
    solution: `def desired_capacity(load, cap, target, lo, hi):
    want = @@-(-load * 100 // (cap * target))@@
    return max(lo, @@min(hi, want)@@)`,
    tests: [
      { args: [300, 100, 50, 1, 10], expected: 6, name: '300 req/s at 50% of 100' },
      { args: [301, 100, 50, 1, 10], expected: 7, name: 'rounds up' },
      { args: [0, 100, 50, 1, 10], expected: 1, name: 'never below min' },
      { args: [10000, 100, 50, 1, 10], expected: 10, name: 'never above max' },
      { args: [0, 100, 50, 0, 10], expected: 0, name: 'may scale to zero' },
      { args: [100, 100, 100, 1, 4], expected: 1, name: 'target 100%' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'autoscale',
    statement: 'The group flaps: it removes instances in the very next tick after a scale-out and then adds them again. The configured scale-in cooldown is being ignored. Fix `autoscale`.',
    buggy: `def autoscale(loads, cap, target, lo, hi, cooldown):
    n = lo
    last = -10**9
    out = []
    for t, load in enumerate(loads):
        want = max(lo, min(hi, -(-load * 100 // (cap * target))))
        if want > n:
            n = want
            last = t
        elif want < n:
            n = want
            last = t
        out.append(n)
    return out`,
    fixed: `def autoscale(loads, cap, target, lo, hi, cooldown):
    n = lo
    last = -10**9
    out = []
    for t, load in enumerate(loads):
        want = max(lo, min(hi, -(-load * 100 // (cap * target))))
        if want > n:
            n = want
            last = t
        elif want < n and t - last >= cooldown:
            n = want
            last = t
        out.append(n)
    return out`,
    tests: [
      { args: [[500, 100, 100, 100, 100], 100, 50, 1, 10, 3], expected: [10, 10, 10, 2, 2], name: 'cooldown holds capacity for 3 ticks' },
      { args: [[100, 300, 100, 300], 100, 50, 1, 10, 2], expected: [2, 6, 6, 6], name: 'dip shorter than the cooldown' },
      { args: [[500, 100], 100, 50, 1, 10, 0], expected: [10, 2], name: 'zero cooldown allows immediate scale-in' },
      { args: [[0, 0], 100, 50, 0, 3, 5], expected: [0, 0], name: 'already at the floor' },
    ],
    bugType: 'cooldown ignored',
    hint: 'What stops a scale-in right after a scaling action? Look at the `elif` branch.',
    explanation: 'The scale-in branch fires whenever fewer instances are wanted. It must also require that enough ticks have passed since the last scaling action: `t - last >= cooldown`.',
  },
  boss: {
    title: 'Auto scaling group simulator',
    statement: 'Write `autoscale(loads, cap, target, lo, hi, cooldown, step)`. The group starts at `lo` instances and `last = -10**9`. For each tick `t` with `load`: `want = clamp(ceil(load * 100 / (cap * target)), lo, hi)` using integer arithmetic. If `want > n`: scale out to `want` immediately and set `last = t`. Else if `want < n` and `t - last >= cooldown`: scale in by at most `step` instances (never below `want`) and set `last = t`. Otherwise keep `n`. Return the instance count after each tick.',
    language: 'python',
    fnName: 'autoscale',
    starter: `def autoscale(loads, cap, target, lo, hi, cooldown, step):
    pass
`,
    solution: `def autoscale(loads, cap, target, lo, hi, cooldown, step):
    n = lo
    last = -10**9
    out = []
    for t, load in enumerate(loads):
        want = -(-load * 100 // (cap * target))
        want = max(lo, min(hi, want))
        if want > n:
            n = want
            last = t
        elif want < n and t - last >= cooldown:
            n = max(want, n - step)
            last = t
        out.append(n)
    return out`,
    tests: [
      { args: [[100, 100, 300, 500, 500, 200, 100, 100, 300, 100], 100, 50, 1, 6, 3, 2], expected: [2, 2, 6, 6, 6, 4, 4, 4, 6, 6], name: 'default scenario' },
      { args: [[100, 500, 100, 500, 100, 500, 100, 500], 100, 50, 1, 6, 0, 8], expected: [2, 6, 2, 6, 2, 6, 2, 6], name: 'no cooldown flaps' },
      { args: [[900, 900, 200], 100, 50, 2, 4, 1, 1], expected: [4, 4, 4], name: 'capped by max, step 1 and cooldown' },
      { args: [[200, 0, 0, 0, 0], 100, 50, 0, 4, 1, 2], expected: [4, 2, 0, 0, 0], name: 'scale to zero in steps' },
      { args: [[], 100, 50, 1, 4, 1, 1], expected: [], name: 'no load samples' },
      { args: [[10, 10, 10], 100, 100, 1, 3, 0, 1], expected: [1, 1, 1], name: 'target 100% and tiny load' },
    ],
    hints: ['Compute `want` with integer ceiling division `-(-a // b)` and clamp it. Scale-out is never blocked by the cooldown.', 'Scale in only when `want < n and t - last >= cooldown`, and move down by `max(want, n - step)` so one step never overshoots. Update `last` on every real change.'],
    combines: ['aws-ec2', 'aws-elb'],
  },
  quiz: [
    {
      prompt: 'Why is scale-in usually more cautious than scale-out?',
      options: ['Terminating instances is expensive', 'Removing capacity too early causes errors if load returns; extra capacity only costs a little', 'AWS does not allow fast scale-in', 'Instances take a minute to stop'],
      answer: 1,
      explain: 'The costs are asymmetric: a few minutes of unused instances cost cents, while missing capacity during a spike loses requests.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
