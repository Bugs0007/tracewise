import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, needInt } from '@/content/lib/sysdesign-hld-2';

const code = `
class CircuitBreaker:
    def __init__(self, threshold, cooldown):
        self.threshold, self.cooldown = threshold, cooldown
        self.failures, self.opened_at = 0, None

    def state(self, now):
        if self.opened_at is None:
            return "closed"                                   #@closed
        if now - self.opened_at >= self.cooldown:
            return "half-open"                                #@half
        return "open"                                         #@open

    def call(self, now, succeeds):
        st = self.state(now)
        if st == "open":
            return "rejected"                                 #@reject
        if succeeds:
            self.failures, self.opened_at = 0, None           #@reset
            return "ok"
        self.failures += 1                                    #@count
        if st == "half-open" or self.failures >= self.threshold:
            self.opened_at = now                              #@trip
        return "failed"
`;

type St = 'closed' | 'open' | 'half-open';
const STEP = 10;

interface In {
  threshold: number;
  cooldown: number;
  health: string[];
}

function parse(input: In) {
  const threshold = needInt('threshold', input.threshold, 1, 6);
  const cooldown = needInt('cooldown', input.cooldown, 10, 200);
  if (!input.health.length || input.health.length > 20) throw new Error('Give 1 to 20 call outcomes');
  const health = input.health.map((h) => {
    const s = h.trim().toLowerCase();
    if (s !== 'ok' && s !== 'fail') throw new Error(`Each outcome must be "ok" or "fail", got "${h}"`);
    return s === 'ok';
  });
  return { threshold, cooldown, health };
}

const stateTone: Record<St, Tone> = { closed: 'done', open: 'error', 'half-open': 'compare' };

const viz: VizDef<In> = {
  id: 'hld-circuit-breaker',
  title: 'Circuit breaker: closed, open, half-open',
  code,
  language: 'python',
  inputs: [
    { key: 'threshold', label: 'Failures that trip the breaker', kind: 'number', default: 3 },
    { key: 'cooldown', label: 'Cooldown before a trial call (ms)', kind: 'number', default: 40 },
    { key: 'health', label: 'Dependency result for each call (ok / fail)', kind: 'strings', default: ['ok', 'ok', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'ok', 'ok'], maxItems: 20, help: 'Calls arrive every 10 ms. The result only matters when the call is actually attempted.' },
  ],
  presets: [
    { label: 'Trip, probe, recover', input: {} },
    { label: 'Short blip', input: { threshold: 3, cooldown: 30, health: ['ok', 'fail', 'ok', 'fail', 'ok', 'ok', 'fail', 'ok'] } },
    { label: 'Trips on first failure', input: { threshold: 1, cooldown: 20, health: ['ok', 'fail', 'ok', 'ok', 'ok', 'ok', 'ok'] } },
    { label: 'Still down at the probe', input: { threshold: 2, cooldown: 30, health: ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'ok', 'ok'] } },
  ],
  run(input) {
    const { threshold, cooldown, health } = parse(input);
    const r = new Recorder(code);
    let failures = 0;
    let openedAt: number | null = null;
    let trips = 0;
    const outcomes: string[] = [];
    const lanes: Record<string, TimelineEvent[]> = { Breaker: [], Calls: [] };
    const state = (now: number): St => (openedAt === null ? 'closed' : now - openedAt >= cooldown ? 'half-open' : 'open');
    const view = (now: number, st: St, edge: Tone = 'default', note = ''): Panel[] => [
      graph(
        [
          gnode('C', 'Caller', 50, 70, { shape: 'actor' }),
          gnode('B', `Breaker: ${st}`, 215, 70, { shape: 'pill', w: 140, tone: stateTone[st], badge: note || `failures ${failures}/${threshold}` }),
          gnode('S', 'Dependency', 380, 70, { shape: 'cylinder', tone: edge === 'error' ? 'error' : 'default' }),
        ],
        [gedge('C', 'B', { flow: true }), gedge('B', 'S', { tone: edge, dashed: edge === 'muted', flow: edge === 'active' || edge === 'found' })],
        440,
        130,
        'Calls pass through the breaker',
      ),
      { type: 'timeline', title: `Timeline (t = ${now} ms)`, lanes: Object.entries(lanes).map(([label, events]) => ({ label, events: [...events] })), tMax: health.length * STEP, now, unit: 'ms' },
    ];

    r.step('closed', `Breaker starts closed: trips after ${threshold} failure(s), probes after ${cooldown} ms`, view(0, 'closed'), { threshold, cooldown });
    health.forEach((succeeds, i) => {
      const now = i * STEP;
      const st = state(now);
      r.op();
      if (st === 'open') {
        outcomes.push('rejected');
        lanes.Calls.push({ t: now, dur: STEP * 0.8, label: 'reject', tone: 'muted' });
        lanes.Breaker.push({ t: now, dur: STEP, label: 'open', tone: 'error' });
        r.step('reject', `t=${now}: breaker is open, call rejected instantly (${cooldown - (now - (openedAt ?? 0))} ms to probe)`, view(now, 'open', 'muted'), { t: now, state: 'open', outcome: 'rejected' });
        return;
      }
      const label = st === 'half-open' ? 'half-open: trial call goes through' : 'closed: call goes through';
      if (succeeds) {
        failures = 0;
        openedAt = null;
        outcomes.push('ok');
        lanes.Calls.push({ t: now, dur: STEP * 0.8, label: 'ok', tone: 'found' });
        lanes.Breaker.push({ t: now, dur: STEP, label: st === 'half-open' ? 'half-open' : 'closed', tone: stateTone[st] });
        r.step('reset', `t=${now}: ${label}, succeeds${st === 'half-open' ? ' → breaker closes' : ''}`, view(now, 'closed', 'found'), { t: now, outcome: 'ok', failures });
        return;
      }
      failures++;
      const tripped = st === 'half-open' || failures >= threshold;
      outcomes.push('failed');
      lanes.Calls.push({ t: now, dur: STEP * 0.8, label: 'fail', tone: 'error' });
      lanes.Breaker.push({ t: now, dur: STEP, label: st, tone: stateTone[st] });
      if (tripped) {
        openedAt = now;
        trips++;
        r.step('trip', `t=${now}: ${label}, fails → breaker opens until t=${now + cooldown}`, view(now, 'open', 'error', `opened (${trips}x)`), { t: now, outcome: 'failed', trips });
      } else {
        r.step('count', `t=${now}: ${label}, fails (${failures} of ${threshold})`, view(now, 'closed', 'error'), { t: now, outcome: 'failed', failures });
      }
    });
    const final = state(health.length * STEP);
    r.step(undefined, `${outcomes.filter((o) => o === 'rejected').length} calls were rejected without touching the dependency; breaker tripped ${trips} time(s)`, [kvPanel('Outcome', { outcomes: outcomes.join(' '), trips, rejected: outcomes.filter((o) => o === 'rejected').length, finalState: final }, { trips: trips ? 'compare' : 'found' })], { trips });
    return { frames: r.frames, result: { outcomes, trips, finalState: final } };
  },
  reference(input) {
    const { threshold, cooldown, health } = parse(input);
    const out: string[] = [];
    let fails = 0;
    let since = -1;
    let trips = 0;
    health.forEach((good, i) => {
      const t = i * STEP;
      const open = since >= 0 && t - since < cooldown;
      const probe = since >= 0 && !open;
      if (open) return void out.push('rejected');
      if (good) {
        fails = 0;
        since = -1;
        return void out.push('ok');
      }
      fails++;
      if (probe || fails >= threshold) {
        since = t;
        trips++;
      }
      out.push('failed');
    });
    const end = health.length * STEP;
    return { outcomes: out, trips, finalState: since < 0 ? 'closed' : end - since >= cooldown ? 'half-open' : 'open' };
  },
};

const cbClass = `class CircuitBreaker:
    def __init__(self, threshold, cooldown):
        self.threshold = threshold
        self.cooldown = cooldown
        self.failures = 0
        self.opened_at = None

    def state(self, now):
        if self.opened_at is None:
            return "closed"
        if now - self.opened_at >= self.cooldown:
            return "half-open"
        return "open"

    def call(self, now, succeeds):
        st = self.state(now)
        if st == "open":
            return "rejected"
        if succeeds:
            self.failures = 0
            self.opened_at = None
            return "ok"
        self.failures += 1
        if st == "half-open" or self.failures >= self.threshold:
            self.opened_at = now
        return "failed"`;

const ops = (...n: string[]) => n;

const cbTests = [
  { args: [ops('CircuitBreaker', 'call', 'call', 'call', 'state', 'call', 'state'), [[2, 10], [0, false], [1, false], [5, true], [5], [11, true], [12]]], expected: [null, 'failed', 'failed', 'rejected', 'open', 'ok', 'closed'], name: 'trips, rejects, then recovers' },
  { args: [ops('CircuitBreaker', 'call', 'state', 'call', 'call', 'state'), [[1, 10], [0, false], [10], [10, false], [15, true], [20]]], expected: [null, 'failed', 'half-open', 'failed', 'rejected', 'half-open'], name: 'failed trial reopens' },
  { args: [ops('CircuitBreaker', 'call', 'call', 'call', 'state'), [[2, 10], [0, false], [1, true], [2, false], [3]]], expected: [null, 'failed', 'ok', 'failed', 'closed'], name: 'success resets the count' },
  { args: [ops('CircuitBreaker', 'state'), [[3, 50], [0]]], expected: [null, 'closed'], name: 'starts closed' },
];

const unit: Unit = {
  id: 'hld-circuit-breaker',
  hook: 'When a dependency is down, hammering it makes things worse for everyone. A circuit breaker is the standard answer to "how do you stop a cascading failure?", and the half-open probe is the detail interviewers listen for.',
  predict: {
    prompt: 'A circuit breaker is open because a payment service failed. What should happen to the next request to the payment service?',
    options: ['It is sent normally and the breaker counts the result', 'It is rejected immediately without calling the service', 'It is queued until the service is healthy', 'It is retried three times'],
    answer: 1,
    explain: 'Open means "stop calling": callers fail fast (or use a fallback) so threads are not tied up and the struggling service gets breathing room. After the cooldown, a trial call tests whether it recovered.',
  },
  viz,
  deeper: {
    points: [
      'Closed: calls pass through and failures are counted. Too many failures (consecutive, or a rate over a window) open the breaker.',
      'Open: calls fail immediately with no network traffic. This protects the caller\'s threads and gives the dependency room to recover.',
      'Half-open: after a cooldown, let a limited number of trial calls through. Success closes the breaker; failure re-opens it and restarts the cooldown.',
      'Pair it with a fallback (cached value, default, degraded feature) so open means "degraded" rather than "broken".',
      'Inject the clock in tests; tuning thresholds is workload-specific, and breakers should be per dependency (or per endpoint), not global.',
    ],
    complexity: { time: 'O(1) per call', space: 'O(1) per breaker' },
    pitfalls: ['A breaker that never leaves the open state because it forgets the half-open probe', 'Counting non-consecutive failures forever so a slow trickle eventually trips it', 'One global breaker that blocks healthy dependencies'],
  },
  practice: {
    language: 'python',
    fnName: 'CircuitBreaker',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `CircuitBreaker(threshold, cooldown)` with an injected clock. `state(now)` is `"closed"` if never tripped, `"open"` for `cooldown` after tripping, then `"half-open"`. `call(now, succeeds)` returns `"rejected"` when open; otherwise it returns `"ok"` (success closes the breaker and clears failures) or `"failed"`. A failure trips the breaker when failures reach `threshold` or when it happens in the half-open state.',
    signature: 'class CircuitBreaker:',
    solution: `class CircuitBreaker:
    def __init__(self, threshold, cooldown):
        self.threshold = threshold
        self.cooldown = cooldown
        self.failures = 0
        self.opened_at = None

    def state(self, now):
        if self.opened_at is None:
            return "closed"
        if @@now - self.opened_at >= self.cooldown@@:
            return "half-open"
        return "open"

    def call(self, now, succeeds):
        st = self.state(now)
        if @@st == "open"@@:
            return "rejected"
        if succeeds:
            self.failures = 0
            @@self.opened_at = None@@
            return "ok"
        self.failures += 1
        if @@st == "half-open" or self.failures >= self.threshold@@:
            self.opened_at = now
        return "failed"`,
    tests: cbTests,
  },
  debug: {
    language: 'python',
    fnName: 'CircuitBreaker',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'After an outage ends, the service is healthy again but the breaker keeps rejecting every call forever. Find the bug.',
    buggy: cbClass.replace('if st == "open":', 'if self.opened_at is not None:'),
    fixed: cbClass,
    tests: cbTests,
    bugType: 'never leaves open',
    hint: 'Once the cooldown has passed, state() says "half-open". Does call() ever let a trial request through in that state?',
    explanation: 'The rejection check looks at whether the breaker was ever tripped instead of whether it is currently open. After the cooldown it must allow a probe call; otherwise nothing can succeed and reset it.',
  },
  boss: {
    title: 'Breaker replay',
    statement:
      'Replay `events`, a list of `[time, succeeds]`, through a circuit breaker without using a class. Rules: closed passes calls through; `threshold` consecutive-since-last-success failures trip it; open rejects for `cooldown` ms; then half-open allows a call - success closes it, failure re-opens it. Return `[outcomes, trips]` where `outcomes` has `"ok"`, `"failed"` or `"rejected"` per event and `trips` counts every time the breaker opened (including re-opens).',
    language: 'python',
    fnName: 'breaker_outcomes',
    starter: `def breaker_outcomes(events, threshold, cooldown):
    # your code here
    pass
`,
    solution: `def breaker_outcomes(events, threshold, cooldown):
    failures = 0
    opened_at = None
    trips = 0
    out = []
    for now, succeeds in events:
        if opened_at is None:
            state = "closed"
        elif now - opened_at >= cooldown:
            state = "half-open"
        else:
            state = "open"
        if state == "open":
            out.append("rejected")
        elif succeeds:
            failures = 0
            opened_at = None
            out.append("ok")
        else:
            failures += 1
            if state == "half-open" or failures >= threshold:
                opened_at = now
                trips += 1
            out.append("failed")
    return [out, trips]`,
    tests: [
      { args: [[[0, true], [10, true], [20, false], [30, false], [40, false], [50, false], [60, false], [70, false], [80, false], [90, false], [100, false], [110, false], [120, true], [130, true]], 3, 40], expected: [['ok', 'ok', 'failed', 'failed', 'failed', 'rejected', 'rejected', 'rejected', 'failed', 'rejected', 'rejected', 'rejected', 'ok', 'ok'], 2], name: 'trip, failed probe, recover' },
      { args: [[[0, false], [10, false], [20, false], [30, false], [40, false], [50, false], [60, false], [70, false], [80, false], [90, false]], 2, 25], expected: [['failed', 'failed', 'rejected', 'rejected', 'failed', 'rejected', 'rejected', 'failed', 'rejected', 'rejected'], 3], name: 'dependency never recovers' },
      { args: [[], 3, 10], expected: [[], 0], name: 'no events' },
      { args: [[[0, true], [10, false], [20, true], [30, false], [40, true], [50, false]], 2, 10], expected: [['ok', 'failed', 'ok', 'failed', 'ok', 'failed'], 0], name: 'successes reset the count' },
      { args: [[[0, false], [5, false], [6, true], [16, true], [17, true]], 1, 10], expected: [['failed', 'rejected', 'rejected', 'ok', 'ok'], 1], name: 'threshold of one' },
    ],
    hints: ['Keep `failures` and `opened_at`; derive the state from `now - opened_at` on every event instead of storing it.', 'On failure: increment failures; if the state was half-open or failures reached the threshold, set `opened_at = now` and count a trip. On success: reset both.'],
    combines: ['hld-microservices'],
  },
  quiz: [
    {
      prompt: 'Why does the half-open state allow only a few trial calls rather than reopening fully?',
      options: ['To save memory', 'A recovering dependency could be knocked over again by a flood of queued traffic', 'Because HTTP requires it', 'To count failures faster'],
      answer: 1,
      explain: 'Letting everything through at once is what a thundering herd does; a probe tells you whether recovery is real before full traffic returns.',
    },
  ],
};

export default unit;
