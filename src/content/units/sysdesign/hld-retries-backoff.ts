import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
def delay(strategy, attempt, client, base, cap):
    if strategy == "fixed":
        return base                                                  #@fixed
    d = min(cap, base * 2 ** attempt)                                #@exp
    if strategy == "exponential + jitter":
        j = ((client * 7919 + attempt * 104729) % 1000) / 1000     #@jitter
        return 1 + int(j * d)
    return d

def tick(t, due):
    melt = len(due) > 2 * capacity                                   #@melt
    served = 0
    for c in due:
        if t >= recover_at and not melt and served < capacity:      #@serve
            served += 1
            continue
        attempts[c] += 1                                             #@fail
        if attempts[c] >= 8:
            continue                                                 #@giveup
        retry_at[c] = t + delay(strategy, attempts[c] - 1, c, base, cap)   #@retry
`;

const STRATEGIES = ['fixed', 'exponential', 'exponential + jitter'] as const;
type Strategy = (typeof STRATEGIES)[number];
const MAX_ATTEMPTS = 8;
const MAXT = 60;

interface In {
  strategy: string;
  clients: number;
  capacity: number;
  recoverAt: number;
  base: number;
  cap: number;
}

function delayOf(s: Strategy, attempt: number, client: number, base: number, cap: number): number {
  if (s === 'fixed') return base;
  const d = Math.min(cap, base * 2 ** attempt);
  if (s === 'exponential') return d;
  const j = ((client * 7919 + attempt * 104729) % 1000) / 1000;
  return 1 + Math.floor(j * d);
}

function parse(input: In) {
  const strategy = needOneOf('strategy', input.strategy, STRATEGIES);
  const clients = needInt('clients', input.clients, 2, 30);
  const capacity = needInt('capacity', input.capacity, 1, 30);
  const recoverAt = needInt('recoverAt', input.recoverAt, 0, 20);
  const base = needInt('base', input.base, 1, 8);
  const cap = needInt('cap', input.cap, base, 64);
  return { strategy, clients, capacity, recoverAt, base, cap };
}

const viz: VizDef<In> = {
  id: 'hld-retries-backoff',
  title: 'Retry storms, exponential backoff and jitter',
  code,
  language: 'python',
  inputs: [
    { key: 'strategy', label: 'Retry strategy', kind: 'select', options: [...STRATEGIES], default: 'exponential' },
    { key: 'clients', label: 'Clients that all failed at t=0', kind: 'number', default: 20 },
    { key: 'capacity', label: 'Server capacity (requests per tick)', kind: 'number', default: 6, help: 'If more than twice this arrive in one tick, the server collapses and serves nothing that tick.' },
    { key: 'recoverAt', label: 'Server comes back at tick', kind: 'number', default: 3 },
    { key: 'base', label: 'Base delay (ticks)', kind: 'number', default: 2 },
    { key: 'cap', label: 'Maximum delay (ticks)', kind: 'number', default: 8 },
  ],
  presets: [
    { label: 'Fixed delay', input: { strategy: 'fixed' } },
    { label: 'Exponential, no jitter', input: { strategy: 'exponential' } },
    { label: 'Exponential + jitter', input: { strategy: 'exponential + jitter' } },
    { label: 'Fewer clients', input: { strategy: 'exponential', clients: 10, capacity: 6 } },
  ],
  run(input) {
    const p = parse(input);
    const { strategy, clients, capacity, recoverAt, base, cap } = p;
    const r = new Recorder(code);
    const nextAt = new Array<number>(clients).fill(0);
    const attempts = new Array<number>(clients).fill(0);
    const state = new Array<'waiting' | 'ok' | 'gaveup'>(clients).fill('waiting');
    const loads: number[] = [];
    let served = 0;
    let gaveUp = 0;
    let lastFrame = -1;
    let finishedAt = -1;
    const view = (due: Set<number>): Panel[] => {
      const tones: Record<number, Tone> = {};
      state.forEach((s, c) => {
        tones[c] = s === 'ok' ? 'found' : s === 'gaveup' ? 'error' : due.has(c) ? 'active' : 'frontier';
      });
      return [
        { type: 'array', title: 'Attempts made by each client', values: [...attempts], tones, hideIndex: true },
        {
          type: 'chart',
          title: 'Requests arriving per tick',
          xLabel: 'tick',
          yLabel: 'requests',
          series: [
            { label: 'load', points: loads.map((v, i) => [i, v] as [number, number]), tone: 'swap' },
            { label: 'collapse level', points: loads.map((_, i) => [i, 2 * capacity] as [number, number]), tone: 'error' },
          ],
        },
      ];
    };

    r.step(undefined, `${clients} clients failed at t=0 and will retry (${strategy}). Server returns at t=${recoverAt}`, view(new Set()), { strategy, recoverAt });
    for (let t = 0; t < MAXT; t++) {
      const due = [...Array(clients).keys()].filter((c) => state[c] === 'waiting' && nextAt[c] === t);
      loads.push(due.length);
      if (!due.length) {
        if (state.every((s) => s !== 'waiting')) break;
        continue;
      }
      const idle = t - lastFrame > 1 && lastFrame >= 0 ? ` (idle t=${lastFrame + 1}-${t - 1})` : '';
      lastFrame = t;
      const set = new Set(due);
      const melt = due.length > 2 * capacity;
      r.op(due.length);
      r.step('melt', `t=${t}${idle}: ${due.length} requests arrive${melt ? `, over ${2 * capacity}: the server collapses` : ''}`, view(set), { t, load: due.length, collapses: melt });
      let ok = 0;
      let failed = 0;
      let soonest = Infinity;
      let latest = 0;
      for (const c of due) {
        if (t >= recoverAt && !melt && ok < capacity) {
          ok++;
          state[c] = 'ok';
          served++;
          finishedAt = t;
          continue;
        }
        attempts[c]++;
        failed++;
        if (attempts[c] >= MAX_ATTEMPTS) {
          state[c] = 'gaveup';
          gaveUp++;
          continue;
        }
        nextAt[c] = t + delayOf(strategy, attempts[c] - 1, c, base, cap);
        soonest = Math.min(soonest, nextAt[c]);
        latest = Math.max(latest, nextAt[c]);
      }
      const gave = due.filter((c) => state[c] === 'gaveup').length;
      const where = melt ? 'fail' : t < recoverAt ? 'fail' : 'serve';
      r.step(where, ok ? `Served ${ok}; ${failed} retry${soonest < Infinity ? ` between t=${soonest} and t=${latest}` : ''}` : melt ? `Nothing served; ${failed} retry${gave ? `, ${gave} give up` : soonest < Infinity ? ` between t=${soonest} and t=${latest}` : ''}` : `Server still down: ${failed} fail${gave ? `, ${gave} give up` : soonest < Infinity ? `, retries between t=${soonest} and t=${latest}` : ''}`, view(new Set()), { t, served: ok, failed, gaveUp });
    }
    while (loads.length > 1 && loads[loads.length - 1] === 0) loads.pop();
    const retryPeak = Math.max(0, ...loads.slice(1));
    const total = loads.reduce((a, b) => a + b, 0);
    const result = { loads, retryPeak, total, served, gaveUp, finishedAt };
    r.step(undefined, gaveUp ? `${gaveUp} of ${clients} clients gave up; the retries kept the server down` : `All ${served} clients got through by t=${finishedAt}`, [kvPanel('Outcome', { requestsSent: total, retryPeak, served, gaveUp, finishedAt }, { gaveUp: gaveUp ? 'error' : 'found' })], { total, gaveUp });
    return { frames: r.frames, result };
  },
  reference(input) {
    const { strategy, clients, capacity, recoverAt, base, cap } = parse(input);
    const schedule = new Map<number, number[]>([[0, [...Array(clients).keys()]]]);
    const tries = new Array<number>(clients).fill(0);
    const loads: number[] = [];
    let served = 0;
    let gaveUp = 0;
    let finishedAt = -1;
    let pending = clients;
    for (let t = 0; t < MAXT && pending > 0; t++) {
      const due = schedule.get(t) ?? [];
      loads.push(due.length);
      const canServe = t >= recoverAt && due.length <= 2 * capacity ? capacity : 0;
      due.forEach((c, i) => {
        if (i < canServe) {
          served++;
          pending--;
          finishedAt = t;
          return;
        }
        tries[c]++;
        if (tries[c] >= MAX_ATTEMPTS) {
          gaveUp++;
          pending--;
          return;
        }
        const at = t + delayOf(strategy, tries[c] - 1, c, base, cap);
        schedule.set(at, [...(schedule.get(at) ?? []), c]);
      });
    }
    while (loads.length > 1 && loads[loads.length - 1] === 0) loads.pop();
    return { loads, retryPeak: Math.max(0, ...loads.slice(1)), total: loads.reduce((a, b) => a + b, 0), served, gaveUp, finishedAt };
  },
};

const retryCode = `def call_with_retry(outcomes, max_attempts, base, cap):
    sleeps = []
    for attempt in range(max_attempts):
        if outcomes[attempt]:
            return {"ok": True, "attempts": attempt + 1, "sleeps": sleeps}
        if attempt < max_attempts - 1:
            sleeps.append(min(cap, base * 2 ** attempt))
    return {"ok": False, "attempts": max_attempts, "sleeps": sleeps}`;

const unit: Unit = {
  id: 'hld-retries-backoff',
  hook: 'Retries are how small failures become outages. Interviewers expect exponential backoff with a cap and jitter, plus the reason: synchronized retries are a self-inflicted DDoS.',
  predict: {
    prompt: '1,000 clients all lose their connection at the same moment and each retries after exactly 1 s, 2 s, 4 s, 8 s (exponential, no jitter). What does the server see?',
    options: ['Load spread smoothly over time', 'Spikes of ~1,000 requests at t=1, 3, 7, 15 seconds', 'Load that doubles each second forever', 'Nothing, backoff avoids all spikes'],
    answer: 1,
    explain: 'Every client uses the same schedule, so they stay in lock-step: the whole herd returns together at each retry time. Backoff reduces how OFTEN they hit the server, not whether they hit it simultaneously. Random jitter spreads the herd out.',
  },
  viz,
  deeper: {
    points: [
      'Retries fix transient faults (a dropped packet, a failover) but multiply load on a struggling dependency: with 3 retries per call a service can see 4x its normal traffic exactly when it is weakest.',
      'Exponential backoff doubles the wait after each failure (base, 2*base, 4*base, ...) so clients back off quickly from a dependency that stays down.',
      'Always cap the delay (for example 30 s) and the number of attempts; unbounded backoff means a client can sleep for hours.',
      'Add jitter (a random fraction of the delay) so clients do not retry in lock-step; "full jitter" picks a random delay between 0 and the backoff value.',
      'Retry only idempotent operations, and combine retries with timeouts and circuit breakers; retry at one layer, not at every layer of a call chain.',
    ],
    complexity: { time: 'Delay for attempt n is min(cap, base * 2^n)', space: 'O(1) per client' },
    pitfalls: ['Exponential backoff with no cap (delays grow without bound)', 'No jitter, so every client retries at the same instants', 'Retrying non-idempotent calls (double charges) or at every layer of a deep call chain'],
  },
  practice: {
    language: 'python',
    fnName: 'backoff_schedule',
    statement: 'Return the list of sleep times before each of `retries` retries: attempt `i` waits `base * 2**i` seconds, but never more than `cap`.',
    signature: 'def backoff_schedule(retries, base, cap):',
    solution: `def backoff_schedule(retries, base, cap):
    delays = []
    for i in @@range(retries)@@:
        delays.append(@@min(cap, base * 2 ** i)@@)
    return @@delays@@`,
    tests: [
      { args: [5, 1, 100], expected: [1, 2, 4, 8, 16], name: 'doubles each time' },
      { args: [6, 1, 10], expected: [1, 2, 4, 8, 10, 10], name: 'capped' },
      { args: [3, 5, 5], expected: [5, 5, 5], name: 'cap equals base' },
      { args: [0, 1, 10], expected: [], name: 'no retries' },
      { args: [4, 3, 1000], expected: [3, 6, 12, 24], name: 'base other than 1' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'call_with_retry',
    statement: 'A failed call sleeps once more AFTER its final attempt, so clients wait needlessly before reporting the failure. Find the bug.',
    buggy: retryCode.replace('        if attempt < max_attempts - 1:\n            sleeps.append', '        if True:\n            sleeps.append'),
    fixed: retryCode,
    tests: [
      { args: [[false, false, true], 5, 1, 30], expected: { ok: true, attempts: 3, sleeps: [1, 2] }, name: 'succeeds on the third try' },
      { args: [[true], 3, 1, 30], expected: { ok: true, attempts: 1, sleeps: [] }, name: 'first try works' },
      { args: [[false, false, false], 3, 2, 30], expected: { ok: false, attempts: 3, sleeps: [2, 4] }, name: 'no sleep after the last failure' },
      { args: [[false, false, false, false, false], 5, 10, 25], expected: { ok: false, attempts: 5, sleeps: [10, 20, 25, 25] }, name: 'capped delays' },
    ],
    bugType: 'sleep after final attempt',
    hint: 'How many sleeps should happen if all 3 attempts fail: 3 or 2?',
    explanation: 'You sleep to wait BEFORE the next attempt. After the last attempt there is no next attempt, so sleeping only delays the error. Sleep only when `attempt < max_attempts - 1`.',
  },
  boss: {
    title: 'Retry storm simulator',
    statement:
      '`clients` clients all fail at tick 0. On each tick t = 0..59, the clients whose retry time is `t` send a request. The server is down before `recover_at`. At or after it, the server serves at most `capacity` of that tick\'s requests (lowest client ids first) unless more than `2 * capacity` arrive, in which case it collapses and serves none. Failed clients count an attempt; at 8 attempts they give up, otherwise they retry after `delay`: `"fixed"` -> `base`; `"exponential"` -> `min(cap, base * 2**a)`; `"jitter"` -> `1 + int(j * d)` where `d` is the exponential value, `a = attempts - 1` and `j = ((client * 7919 + a * 104729) % 1000) / 1000`. Return `[peak, gave_up, finished_at]`: the largest number of requests in any tick after tick 0, how many clients gave up, and the last tick a request was served (-1 if none).',
    language: 'python',
    fnName: 'retry_storm',
    starter: `def retry_storm(clients, recover_at, capacity, base, cap, strategy):
    # your code here
    pass
`,
    solution: `def retry_storm(clients, recover_at, capacity, base, cap, strategy):
    next_at = [0] * clients
    attempts = [0] * clients
    done = [False] * clients
    peak = 0
    gave_up = 0
    finished = -1
    for t in range(60):
        due = [c for c in range(clients) if not done[c] and next_at[c] == t]
        if t > 0:
            peak = max(peak, len(due))
        melt = len(due) > 2 * capacity
        served = 0
        for c in due:
            if t >= recover_at and not melt and served < capacity:
                served += 1
                done[c] = True
                finished = t
                continue
            attempts[c] += 1
            if attempts[c] >= 8:
                done[c] = True
                gave_up += 1
                continue
            a = attempts[c] - 1
            d = base if strategy == "fixed" else min(cap, base * 2 ** a)
            if strategy == "jitter":
                d = 1 + int(((c * 7919 + a * 104729) % 1000) / 1000 * d)
            next_at[c] = t + d
    return [peak, gave_up, finished]`,
    tests: [
      { args: [20, 3, 6, 2, 8, 'fixed'], expected: [20, 20, -1], name: 'fixed delay never escapes the storm' },
      { args: [20, 3, 6, 2, 8, 'exponential'], expected: [20, 20, -1], name: 'synchronized exponential retries' },
      { args: [20, 3, 6, 2, 8, 'jitter'], expected: [16, 0, 11], name: 'jitter spreads the herd' },
      { args: [5, 0, 5, 1, 8, 'fixed'], expected: [0, 0, 0], name: 'server already up' },
      { args: [10, 4, 10, 1, 4, 'exponential'], expected: [10, 0, 7], name: 'enough capacity' },
      { args: [1, 5, 1, 3, 12, 'jitter'], expected: [1, 0, 6], name: 'single client' },
    ],
    hints: ['Keep per-client arrays: next retry tick, attempts made and a done flag. Each tick, collect the clients that are due and not done.', 'Decide the collapse once per tick (`len(due) > 2 * capacity`). Served clients are marked done; the rest add an attempt and either give up at 8 or get `next_at = t + d`.'],
    combines: ['hld-circuit-breaker'],
  },
  quiz: [
    {
      prompt: 'Why is full jitter (random delay between 0 and the backoff value) better than adding the same fixed offset to every client?',
      options: ['It makes the delay longer', 'Different clients pick different random delays, so their retries are spread out instead of staying in lock-step', 'It removes the need for a cap', 'It makes retries idempotent'],
      answer: 1,
      explain: 'A fixed offset shifts the whole herd together. Randomness desynchronizes clients, which is what flattens the spike.',
    },
  ],
};

export default unit;
