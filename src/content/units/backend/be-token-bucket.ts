import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, ChartPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { logPanel, r2 } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
class TokenBucket:
    def __init__(self, capacity, rate, now=0):
        self.capacity = capacity                             #@init
        self.rate = rate
        self.tokens = capacity
        self.last = now

    def allow(self, now, cost=1):
        elapsed = now - self.last                            #@elapsed
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)   #@refill
        self.last = now                                      #@stamp
        if self.tokens >= cost:                              #@check
            self.tokens -= cost                              #@take
            return True                                      #@allow
        return False                                         #@deny
`;

interface In {
  capacity: number;
  rate: number;
  times: number[];
}

function clean(i: In) {
  const capacity = Math.max(1, Math.min(10, Math.round(i.capacity) || 1));
  const rate = i.rate > 0 ? i.rate : 1;
  const times = [...i.times].filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  return { capacity, rate, times };
}

const viz: VizDef<In> = {
  id: 'be-token-bucket',
  title: 'Token bucket rate limiter',
  code,
  language: 'python',
  inputs: [
    { key: 'capacity', label: 'Capacity (max burst)', kind: 'number', default: 5 },
    { key: 'rate', label: 'Refill (tokens / second)', kind: 'number', default: 1 },
    { key: 'times', label: 'Request times (seconds)', kind: 'numbers', default: [0, 0, 0, 0, 0, 0, 1, 1, 2, 5, 5, 5, 5], maxItems: 16 },
  ],
  presets: [
    { label: 'Burst then trickle', input: { capacity: 5, rate: 1, times: [0, 0, 0, 0, 0, 0, 1, 1, 2, 5, 5, 5, 5] } },
    { label: 'Slow refill', input: { capacity: 2, rate: 0.5, times: [0, 0, 0, 1, 2, 2, 4] } },
    { label: 'Steady traffic', input: { capacity: 3, rate: 1, times: [0, 1, 2, 3, 4, 5] } },
  ],
  run(input) {
    const { capacity, rate, times } = clean(input);
    const r = new Recorder(code);
    let tokens = capacity;
    let last = 0;
    const pts: [number, number][] = [[0, capacity]];
    const log: { text: string; tone?: Tone }[] = [];
    const results: boolean[] = [];
    const tMax = Math.max(1, times[times.length - 1] ?? 1);
    const bucket = (full: Tone = 'found'): ArrayPanel => ({
      type: 'array',
      title: `Bucket: ${r2(tokens)} / ${capacity} tokens`,
      values: Array.from({ length: capacity }, (_, i) => (i < Math.floor(tokens + 1e-9) ? '●' : '○')),
      tones: Object.fromEntries(Array.from({ length: capacity }, (_, i) => [i, i < Math.floor(tokens + 1e-9) ? full : ('muted' as Tone)])),
      hideIndex: true,
    });
    const chart = (now: number): ChartPanel => ({ type: 'chart', title: 'Tokens over time', series: [{ label: 'tokens', points: [...pts, ...(pts[pts.length - 1][0] < tMax ? [] : [])], tone: 'compare' }], xLabel: 'seconds', yLabel: 'tokens', marker: now, kind: 'line' });
    const view = (now: number, full: Tone = 'found'): Panel[] => [bucket(full), chart(now), logPanel('Decisions', log)];
    r.step('init', `Bucket starts full: ${capacity} tokens, refilling ${rate}/s`, view(0), { tokens, capacity, rate });
    for (const now of times) {
      r.op();
      const elapsed = now - last;
      r.step('elapsed', `t=${now}: ${r2(elapsed)}s since the last request`, view(now), { now, elapsed: r2(elapsed) });
      const before = tokens;
      tokens = Math.min(capacity, tokens + elapsed * rate);
      pts.push([now, tokens]);
      const capped = before + elapsed * rate > capacity + 1e-9;
      r.step('refill', capped ? `Refill would reach ${r2(before + elapsed * rate)}; capped at ${capacity}` : `Refill +${r2(elapsed * rate)} tokens → ${r2(tokens)}`, view(now), { now, tokens: r2(tokens) });
      last = now;
      r.step('stamp', `Remember last = ${now}`, view(now), { last });
      const ok = tokens >= 1;
      r.step('check', ok ? `${r2(tokens)} ≥ 1 token: this request can pass` : `${r2(tokens)} < 1 token: the bucket is empty`, view(now, ok ? 'found' : 'error'), { now, tokens: r2(tokens) });
      if (ok) {
        tokens -= 1;
        pts.push([now, tokens]);
        log.push({ text: `t=${now} allowed`, tone: 'found' });
        r.step('take', 'Spend one token', view(now), { tokens: r2(tokens) });
        r.step('allow', `Allowed. ${r2(tokens)} tokens left`, view(now), { allowed: true });
      } else {
        log.push({ text: `t=${now} denied (429)`, tone: 'error' });
        r.step('deny', 'Denied with 429: the client must wait for a refill', view(now, 'error'), { allowed: false });
      }
      results.push(ok);
    }
    if (!times.length) r.step('init', 'No requests were given', view(0), {});
    r.step('init', `${results.filter(Boolean).length} of ${results.length} requests allowed`, view(tMax), { allowed: results.filter(Boolean).length, denied: results.filter((x) => !x).length });
    return { frames: r.frames, result: results };
  },
  reference(input) {
    const { capacity, rate, times } = clean(input);
    // Independent formulation: track the moment the bucket would be empty ("debt time") instead of a token count.
    let tokens = capacity;
    let prev = 0;
    return times.map((t) => {
      tokens = Math.min(capacity, tokens + (t - prev) * rate);
      prev = t;
      if (tokens + 1e-12 < 1) return false;
      tokens -= 1;
      return true;
    });
  },
};

const ops = (...names: string[]) => names;

const unit: Unit = {
  id: 'be-token-bucket',
  hook: 'Token bucket is the default answer to "design a rate limiter": it allows bursts but caps the long-run rate. Interviewers want to hear about refill maths and the clock, not just "count requests".',
  predict: {
    prompt: 'A bucket holds at most 5 tokens and refills 1 token/second. The client is idle for a full minute, then sends 8 requests in the same instant. How many are allowed?',
    options: ['1', '5', '8', '60'],
    answer: 1,
    explain: 'Idle time cannot save up more than the capacity: tokens are capped at 5. Five requests drain the bucket and the other three are denied.',
  },
  viz,
  deeper: {
    points: [
      'Two knobs: **capacity** (largest burst) and **refill rate** (sustained requests per second).',
      'Do not run a timer that adds tokens. Refill lazily: on each request add `elapsed * rate`, capped at capacity. State is just `(tokens, last)`.',
      'Inject the clock (`allow(now)`) instead of calling `time.time()` inside, so the limiter is deterministic to test.',
      'Denied requests still advance `last`; otherwise the same time would be refilled twice.',
      'For many clients keep one small bucket per key (user, IP, API key) in a dict or Redis, with an expiry for idle keys.',
    ],
    complexity: { time: 'O(1) per request', space: 'O(1) per client' },
    pitfalls: ['Forgetting to cap tokens at capacity', 'Using `>` instead of `>=` so exactly one token is never enough', 'Mixing time units (milliseconds vs seconds)', 'Reading the clock twice in one request'],
  },
  practice: {
    language: 'python',
    fnName: 'TokenBucket',
    statement: 'Implement `TokenBucket(capacity, rate, now=0)`. It starts full. `allow(now, cost=1)` refills `rate` tokens per second since the last call (never above capacity), then spends `cost` tokens and returns True if it has at least `cost`, otherwise returns False and spends nothing.',
    signature: 'class TokenBucket:',
    solution: `class TokenBucket:
    def __init__(self, capacity, rate, now=0):
        self.capacity = capacity
        self.rate = rate
        self.tokens = @@capacity@@
        self.last = now

    def allow(self, now, cost=1):
        elapsed = @@now - self.last@@
        self.tokens = @@min(self.capacity, self.tokens + elapsed * self.rate)@@
        self.last = now
        if self.tokens @@>=@@ cost:
            self.tokens @@-=@@ cost
            return True
        return False`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow'), [[3, 1, 0], [0], [0], [0], [0], [1], [1]]], expected: [null, true, true, true, false, true, false], name: 'burst, deny, refill' },
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow'), [[2, 1, 0], [0], [0], [0], [100], [100], [100]]], expected: [null, true, true, false, true, true, false], name: 'idle time is capped' },
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow'), [[1, 0.5, 0], [0], [1], [2]]], expected: [null, true, false, true], name: 'exactly one token is enough' },
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow'), [[5, 1, 0], [0, 3], [0, 3], [2, 3]]], expected: [null, true, false, true], name: 'cost greater than one' },
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow', 'allow'), [[2, 1, 10], [10], [10], [10], [11]]], expected: [null, true, true, false, true], name: 'custom start time' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'TokenBucket',
    statement: 'After a quiet night, a client sends 20 requests at once and almost all of them pass, far above the configured burst of 3. Fix the limiter.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class TokenBucket:
    def __init__(self, capacity, rate, now=0):
        self.capacity = capacity
        self.rate = rate
        self.tokens = capacity
        self.last = now

    def allow(self, now, cost=1):
        elapsed = now - self.last
        self.tokens = self.tokens + elapsed * self.rate
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False`,
    fixed: `class TokenBucket:
    def __init__(self, capacity, rate, now=0):
        self.capacity = capacity
        self.rate = rate
        self.tokens = capacity
        self.last = now

    def allow(self, now, cost=1):
        elapsed = now - self.last
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False`,
    tests: [
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow'), [[3, 1, 0], [0], [0], [0]]], expected: [null, true, true, true], name: 'initial burst' },
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow', 'allow', 'allow'), [[2, 1, 0], [0], [0], [1000], [1000], [1000]]], expected: [null, true, true, true, true, false], name: 'long idle is capped at capacity' },
      { args: [ops('TokenBucket', 'allow', 'allow', 'allow'), [[1, 1, 0], [0], [0], [1]]], expected: [null, true, false, true], name: 'refill after waiting' },
    ],
    bugType: 'unbounded refill',
    hint: 'How many tokens can the bucket hold after an hour with no traffic?',
    explanation: 'Refill adds `elapsed * rate` with no ceiling, so idle time banks unlimited tokens and the next burst is huge. Cap with `min(capacity, ...)`.',
  },
  boss: {
    title: 'Per-client limiter with Retry-After',
    statement:
      'Implement `RateLimiter(capacity, rate)` keeping one token bucket per client. A client\'s bucket is created full the first time `check(client, now)` sees it. `check` refills (capped), then if at least 1 token is available spends it and returns `[True, 0]`; otherwise returns `[False, retry_after]` where `retry_after` is the whole number of seconds (rounded up) until one token is available. Buckets are independent per client.',
    language: 'python',
    fnName: 'RateLimiter',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class RateLimiter:
    # your code here
    pass
`,
    solution: `import math

class RateLimiter:
    def __init__(self, capacity, rate):
        self.capacity = capacity
        self.rate = rate
        self.buckets = {}

    def check(self, client, now):
        tokens, last = self.buckets.get(client, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - last) * self.rate)
        if tokens >= 1:
            self.buckets[client] = (tokens - 1, now)
            return [True, 0]
        self.buckets[client] = (tokens, now)
        return [False, math.ceil((1 - tokens) / self.rate)]`,
    tests: [
      { args: [ops('RateLimiter', 'check', 'check', 'check', 'check', 'check', 'check'), [[2, 1], ['a', 0], ['a', 0], ['a', 0], ['b', 0], ['a', 1], ['a', 1]]], expected: [null, [true, 0], [true, 0], [false, 1], [true, 0], [true, 0], [false, 1]], name: 'clients are independent' },
      { args: [ops('RateLimiter', 'check', 'check', 'check', 'check'), [[1, 0.5], ['x', 0], ['x', 0], ['x', 1], ['x', 2]]], expected: [null, [true, 0], [false, 2], [false, 1], [true, 0]], name: 'slow refill gives Retry-After' },
      { args: [ops('RateLimiter', 'check', 'check', 'check', 'check', 'check'), [[4, 2], ['k', 0], ['k', 0], ['k', 0], ['k', 0], ['k', 0]]], expected: [null, [true, 0], [true, 0], [true, 0], [true, 0], [false, 1]], name: 'burst of capacity' },
      { args: [ops('RateLimiter', 'check', 'check'), [[3, 1], ['n', 100], ['n', 100]]], expected: [null, [true, 0], [true, 0]], name: 'first sight starts full at any time' },
      { args: [ops('RateLimiter', 'check', 'check', 'check'), [[1, 1], ['z', 0], ['z', 0], ['z', 50]]], expected: [null, [true, 0], [false, 1], [true, 0]], name: 'long gap refills to capacity only' },
    ],
    hints: ['Keep a dict client -> (tokens, last). Use `.get(client, (capacity, now))` so a new client starts full.', 'Retry-After is `ceil((1 - tokens) / rate)`. Store the refreshed tokens and timestamp even when denying.'],
    combines: ['be-rest-methods'],
  },
  quiz: [
    {
      prompt: 'Why pass `now` into `allow()` instead of calling `time.time()` inside?',
      options: ['It is faster', 'Tests become deterministic and the same code works with any clock', 'time.time() is not available in production', 'It prevents bursts'],
      answer: 1,
      explain: 'An injected clock lets a test say "at t=0, t=1, t=100" without sleeping, and lets you replay recorded traffic.',
    },
  ],
};

export default unit;
