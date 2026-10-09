import { Recorder } from '@/engine/recorder';
import type { ChartPanel, Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { gedge, gnode, graph, kvPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
PROC = {"order": 10, "inventory": 15, "payment": 20, "fraud": 12}   # ms of own work
CALLS = {"order": ["inventory", "payment"], "payment": ["fraud"]}

def call(svc, start, hop, timeout):
    t, ok = start + hop, True                                       #@call
    if svc == FAILING and FAULT == "hangs":
        t, ok = INF, False                                          #@hang
    elif svc == FAILING:
        ok = False                                                  #@fail
    else:
        t += PROC[svc]                                              #@work
        for child in CALLS.get(svc, []):
            t, ok = call(child, t, hop, timeout if hop else INF)    #@child
            if not ok:
                break
    if t - start > timeout:
        return start + timeout, False                               #@timeout
    return t, ok                                                    #@return
`;

const PROC: Record<string, number> = { order: 10, inventory: 15, payment: 20, fraud: 12 };
const CALLS: Record<string, string[]> = { order: ['inventory', 'payment'], payment: ['fraud'] };
const NAMES = ['order', 'inventory', 'payment', 'fraud'];
const POS: Record<string, [number, number]> = { order: [200, 28], inventory: [90, 100], payment: [310, 100], fraud: [310, 170] };
const BASE = 57; // sum of PROC

interface In {
  style: string;
  failing: string;
  fault: string;
  timeout: number;
  hop: number;
}

function parse(input: In) {
  return {
    style: needOneOf('style', input.style, ['microservices', 'monolith'] as const),
    failing: needOneOf('failing', input.failing, ['none', ...NAMES] as const),
    fault: needOneOf('fault', input.fault, ['hangs', 'errors fast'] as const),
    timeout: needInt('timeout', input.timeout, 20, 2000),
    hop: needInt('hop', input.hop, 0, 50),
  };
}

/** Independent re-statement of the model as a pure recursive function (used as the unit's reference). */
function model(p: ReturnType<typeof parse>) {
  const micro = p.style === 'microservices';
  const hop = micro ? p.hop : 0;
  const gave = new Set<string>();
  const go = (svc: string, start: number, nested: boolean): [number, boolean] => {
    let t = start + (nested ? hop : 0);
    let ok = true;
    if (svc === p.failing) {
      ok = false;
      if (p.fault === 'hangs') t = Infinity;
    } else {
      t += PROC[svc];
      for (const c of CALLS[svc] ?? []) {
        [t, ok] = go(c, t, true);
        if (!ok) break;
      }
    }
    const limit = nested && !micro ? Infinity : p.timeout;
    if (t - start > limit) {
      gave.add(svc);
      return [start + limit, false];
    }
    return [t, ok];
  };
  const [latency, ok] = go('order', 0, false);
  const gaveUp = micro ? [...gave].sort() : gave.size ? ['monolith'] : [];
  return { latency, ok, gaveUp };
}

const viz: VizDef<In> = {
  id: 'hld-microservices',
  title: 'Monolith vs microservices: latency and failure cascade',
  code,
  language: 'python',
  inputs: [
    { key: 'style', label: 'Architecture', kind: 'select', options: ['microservices', 'monolith'], default: 'microservices' },
    { key: 'failing', label: 'Broken service', kind: 'select', options: ['none', ...NAMES], default: 'fraud' },
    { key: 'fault', label: 'How it fails', kind: 'select', options: ['hangs', 'errors fast'], default: 'hangs' },
    { key: 'timeout', label: 'Call timeout (ms)', kind: 'number', default: 300 },
    { key: 'hop', label: 'Network hop cost (ms)', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Fraud hangs (cascade)', input: { failing: 'fraud', fault: 'hangs', timeout: 300 } },
    { label: 'Healthy microservices', input: { failing: 'none' } },
    { label: 'Healthy monolith', input: { style: 'monolith', failing: 'none' } },
    { label: 'Fails fast (no cascade)', input: { failing: 'fraud', fault: 'errors fast' } },
    { label: 'Monolith, module hangs', input: { style: 'monolith', failing: 'fraud', fault: 'hangs' } },
  ],
  run(input) {
    const p = parse(input);
    const micro = p.style === 'microservices';
    const hop = micro ? p.hop : 0;
    const r = new Recorder(code);
    const tone: Record<string, Tone> = Object.fromEntries(NAMES.map((n) => [n, 'default' as Tone]));
    const badge: Record<string, string> = {};
    const lanes: Record<string, TimelineEvent[]> = Object.fromEntries(NAMES.map((n) => [n, []]));
    const gave: string[] = [];
    const tMax = Math.round(p.timeout * 1.2 + 40);
    let now = 0;
    const view = (): Panel[] => {
      const nodes = NAMES.map((n) => gnode(n, n, POS[n][0], POS[n][1], { tone: tone[n], badge: badge[n], w: 88, tags: n === p.failing ? ['broken'] : undefined }));
      const edges = NAMES.filter((n) => n !== 'order').map((n) => gedge(NAMES.find((q) => (CALLS[q] ?? []).includes(n))!, n, { label: micro ? `+${hop}ms` : undefined, tone: tone[n] === 'active' ? 'active' : 'default', flow: tone[n] === 'active' }));
      return [
        graph(nodes, edges, 420, 205, micro ? 'Microservices: every call crosses the network' : 'Monolith: modules call each other in-process'),
        { type: 'timeline', title: 'Time spent per service (ms)', lanes: NAMES.map((n) => ({ label: n, events: [...lanes[n]] })), tMax, now, unit: 'ms' },
      ];
    };

    const go = (svc: string, parent: string | null, start: number): [number, boolean] => {
      const t0 = start + (parent ? hop : 0);
      now = Math.min(t0, tMax);
      tone[svc] = 'active';
      r.op();
      r.step('call', `t=${Math.round(t0)}: ${parent ?? 'client'} calls ${svc}${parent && hop ? ` (+${hop} ms network)` : ''}`, view(), { t: t0, svc });
      let t = t0;
      let ok = true;
      if (svc === p.failing && p.fault === 'hangs') {
        t = Infinity;
        ok = false;
        r.step('hang', `${svc} accepts the call and never answers`, view(), { svc, state: 'hung' });
      } else if (svc === p.failing) {
        ok = false;
        tone[svc] = 'error';
        r.step('fail', `${svc} returns an error immediately`, view(), { svc, state: 'error' });
      } else {
        t += PROC[svc];
        for (const c of CALLS[svc] ?? []) {
          tone[svc] = 'frontier';
          badge[svc] = 'waiting';
          [t, ok] = go(c, svc, t);
          badge[svc] = '';
          if (!ok) break;
        }
      }
      const limit = parent && !micro ? Infinity : p.timeout;
      let end: number;
      let okOut: boolean;
      if (t - start > limit) {
        end = start + limit;
        okOut = false;
        gave.push(svc);
        tone[svc] = 'error';
        badge[svc] = 'timed out';
        now = Math.min(end, tMax);
        r.step('timeout', `t=${Math.round(end)}: caller gives up on ${svc} after ${limit} ms`, view(), { svc, end, gaveUp: gave.length });
      } else {
        end = t;
        okOut = ok;
        tone[svc] = ok ? 'found' : 'error';
        badge[svc] = `${Math.round(end - t0)} ms`;
        now = Math.min(end, tMax);
        r.step('return', `t=${Math.round(end)}: ${svc} ${ok ? 'answers' : 'fails'}${parent ? ` to ${parent}` : ' to the client'}`, view(), { svc, end, ok });
      }
      lanes[svc].push({ t: Math.min(t0, tMax), dur: Math.max(1, Math.min(end, tMax) - Math.min(t0, tMax)), label: okOut ? 'ok' : 'x', tone: okOut ? 'found' : 'error' });
      return [end, okOut];
    };

    r.step(undefined, `${p.style}: checkout = order → inventory, payment → fraud. Broken: ${p.failing}${p.failing !== 'none' ? ` (${p.fault})` : ''}`, view(), { style: p.style, timeout: p.timeout });
    const [latency, ok] = go('order', null, 0);
    const gaveUp = micro ? [...gave].sort() : gave.length ? ['monolith'] : [];
    const line = (h: number): [number, number][] => Array.from({ length: 6 }, (_, i) => [i, BASE + h * i] as [number, number]);
    const chart: ChartPanel = {
      type: 'chart',
      title: 'Healthy latency vs number of network hops in the chain',
      xLabel: 'hops',
      yLabel: 'ms',
      series: [
        { label: 'monolith (0 ms hop)', points: line(0), tone: 'done' },
        { label: `microservices (${p.hop} ms hop)`, points: line(p.hop), tone: 'swap' },
      ],
    };
    r.step(undefined, ok ? `Checkout succeeded in ${Math.round(latency)} ms` : `Checkout failed after ${Math.round(latency)} ms; callers that gave up: ${gaveUp.join(', ') || 'none'}`, [chart, kvPanel('Outcome', { latencyMs: Math.round(latency), ok, gaveUp: gaveUp.join(', ') || 'none' }, { ok: ok ? 'found' : 'error' })], { latency, ok });
    return { frames: r.frames, result: { latency, ok, gaveUp } };
  },
  reference(input) {
    return model(parse(input));
  },
};

const unit: Unit = {
  id: 'hld-microservices',
  hook: 'Microservices are not a free upgrade. Interviewers probe the costs: every call adds a network hop, and one slow dependency can drag down every service waiting on it.',
  predict: {
    prompt: 'In a chain of synchronous calls A → B → C, service C starts hanging. A and B are healthy and have no timeouts. What happens?',
    options: ['Only C is affected', 'B and A also stop responding as their threads pile up waiting for C', 'A automatically reroutes around C', 'The calls fail instantly'],
    answer: 1,
    explain: 'A synchronous call blocks its thread until the answer arrives. With no timeout, each caller holds a thread per stuck request, so B runs out of threads, then A does. A failure in one leaf cascades up the whole call chain.',
  },
  viz,
  deeper: {
    points: [
      'A monolith calls modules in-process: no serialization, no network, one transaction, one deploy. It is the right start for most products.',
      'Microservices split by business capability so teams deploy and scale independently, at the price of network hops (latency adds up along the chain), partial failures and distributed data consistency.',
      'Synchronous call chains multiply both latency and failure probability: five hops at 99.9% each give about 99.5% availability.',
      'Contain failures with timeouts (shorter as you go deeper), circuit breakers, bulkheads and fallbacks; prefer async messaging where an immediate answer is not needed.',
      'Split a monolith only along seams you understand; "distributed monolith" (tightly coupled services deployed together) gets the costs without the benefits.',
    ],
    complexity: { time: 'Latency = sum of own work plus one hop per call in the chain', space: 'One deployable per service' },
    pitfalls: ['Long synchronous chains with equal timeouts at every level', 'Retrying against a service that is already overloaded', 'Splitting services before the domain boundaries are clear'],
  },
  practice: {
    language: 'python',
    fnName: 'total_latency',
    statement:
      'A service is `{"proc": ms_of_own_work, "calls": [child services]}`. It calls its children one after another, and every call costs `hop` ms of network time. Return the total time for one request through the whole tree, including the service itself.',
    signature: 'def total_latency(node, hop):',
    solution: `def total_latency(node, hop):
    total = @@node["proc"]@@
    for child in @@node["calls"]@@:
        total += @@hop + total_latency(child, hop)@@
    return total`,
    tests: [
      { args: [{ proc: 10, calls: [] }, 5], expected: 10, name: 'leaf service' },
      { args: [{ proc: 10, calls: [{ proc: 15, calls: [] }] }, 5], expected: 30, name: 'one call' },
      { args: [{ proc: 10, calls: [{ proc: 15, calls: [] }, { proc: 20, calls: [{ proc: 12, calls: [] }] }] }, 5], expected: 72, name: 'checkout tree' },
      { args: [{ proc: 10, calls: [{ proc: 15, calls: [] }, { proc: 20, calls: [{ proc: 12, calls: [] }] }] }, 0], expected: 57, name: 'monolith: zero hop cost' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'total_latency',
    statement: 'The estimator says a checkout takes 35 ms but real traces show 72 ms. It underestimates whenever a service makes more than one call. Find the bug.',
    buggy: `def total_latency(node, hop):
    total = node["proc"]
    for child in node["calls"]:
        total = max(total, hop + total_latency(child, hop))
    return total`,
    fixed: `def total_latency(node, hop):
    total = node["proc"]
    for child in node["calls"]:
        total += hop + total_latency(child, hop)
    return total`,
    tests: [
      { args: [{ proc: 10, calls: [] }, 5], expected: 10, name: 'leaf' },
      { args: [{ proc: 10, calls: [{ proc: 15, calls: [] }] }, 5], expected: 30, name: 'one call' },
      { args: [{ proc: 10, calls: [{ proc: 15, calls: [] }, { proc: 20, calls: [{ proc: 12, calls: [] }] }] }, 5], expected: 72, name: 'two sequential calls' },
      { args: [{ proc: 1, calls: [{ proc: 1, calls: [] }, { proc: 1, calls: [] }, { proc: 1, calls: [] }] }, 2], expected: 10, name: 'three siblings' },
    ],
    bugType: 'sequential calls treated as parallel',
    hint: 'If the service waits for child 1 and then calls child 2, do their times overlap or add up?',
    explanation: 'Sequential calls take the SUM of their durations. `max` models parallel fan-out, where the slowest child sets the time. Using it for a sequential chain hides most of the latency.',
  },
  boss: {
    title: 'Which services get stuck?',
    statement:
      'A service is `{"name", "proc", "calls": [...]}`. A request starts at the root at t=0. Each call costs `hop` ms of network time (the root call costs nothing), then the service does `proc` ms of work and calls its children in order, stopping at the first failure. The service named `failing` accepts calls but never answers. Every caller (including the client of the root) gives up `timeout` ms after it started waiting and treats that as a failure. Return `[latency_seen_by_the_client, sorted_names_of_services_that_were_given_up_on]`.',
    language: 'python',
    fnName: 'cascade',
    starter: `def cascade(tree, failing, timeout, hop):
    # your code here
    pass
`,
    solution: `def cascade(tree, failing, timeout, hop):
    gave_up = []
    def call(node, start, h):
        t, ok = start + h, True
        if node["name"] == failing:
            t, ok = float("inf"), False
        else:
            t += node["proc"]
            for child in node["calls"]:
                t, ok = call(child, t, hop)
                if not ok:
                    break
        if t - start > timeout:
            gave_up.append(node["name"])
            return start + timeout, False
        return t, ok
    end, _ = call(tree, 0, 0)
    return [end, sorted(gave_up)]`,
    tests: [
      { args: [{ name: 'order', proc: 10, calls: [{ name: 'inventory', proc: 15, calls: [] }, { name: 'payment', proc: 20, calls: [{ name: 'fraud', proc: 12, calls: [] }] }] }, 'none', 300, 5], expected: [72, []], name: 'healthy' },
      { args: [{ name: 'order', proc: 10, calls: [{ name: 'inventory', proc: 15, calls: [] }, { name: 'payment', proc: 20, calls: [{ name: 'fraud', proc: 12, calls: [] }] }] }, 'fraud', 300, 5], expected: [300, ['fraud', 'order', 'payment']], name: 'leaf hangs, cascade to the top' },
      { args: [{ name: 'order', proc: 10, calls: [{ name: 'inventory', proc: 15, calls: [] }, { name: 'payment', proc: 20, calls: [{ name: 'fraud', proc: 12, calls: [] }] }] }, 'inventory', 100, 5], expected: [100, ['inventory', 'order']], name: 'first child hangs' },
      { args: [{ name: 'order', proc: 10, calls: [{ name: 'inventory', proc: 15, calls: [] }, { name: 'payment', proc: 20, calls: [{ name: 'fraud', proc: 12, calls: [] }] }] }, 'none', 25, 5], expected: [25, ['order', 'payment']], name: 'timeout too tight' },
      { args: [{ name: 'a', proc: 5, calls: [{ name: 'b', proc: 5, calls: [{ name: 'c', proc: 5, calls: [{ name: 'd', proc: 5, calls: [] }] }] }] }, 'none', 1000, 2], expected: [26, []], name: 'deep chain, healthy' },
      { args: [{ name: 'solo', proc: 7, calls: [] }, 'solo', 40, 5], expected: [40, ['solo']], name: 'single service hangs' },
    ],
    hints: ['Write a recursive helper `call(node, start, h)` that returns `(time the caller sees, ok)` and appends to a `gave_up` list when it times out.', 'Inside the helper: a failing node has t = infinity; otherwise add proc and visit children, replacing t with each child result and breaking on failure. Finally, if `t - start > timeout` return `(start + timeout, False)`.'],
    combines: ['hld-client-server', 'hld-load-balancing'],
  },
  quiz: [
    {
      prompt: 'Which change most directly stops one slow dependency from exhausting a service\'s threads?',
      options: ['A bigger server', 'A timeout on the call (and a bulkhead limiting concurrent calls to it)', 'Caching the response forever', 'Calling it twice'],
      answer: 1,
      explain: 'Timeouts free the thread when the dependency is slow; a bulkhead caps how many threads can ever be tied up by it.',
    },
  ],
};

export default unit;
