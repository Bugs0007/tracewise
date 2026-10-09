import { Recorder } from '@/engine/recorder';
import type { ChartPanel, ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
from collections import deque

class LeakyBucket:
    def __init__(self, capacity, rate):
        self.queue = deque()                                 #@init
        self.capacity = capacity
        self.rate = rate

    def add(self, item):
        if len(self.queue) >= self.capacity:                 #@full
            return False                                     #@reject
        self.queue.append(item)                              #@enqueue
        return True

    def leak(self):
        out = []
        for _ in range(self.rate):
            if self.queue:
                out.append(self.queue.popleft())             #@drain
        return out                                           #@leaked
`;

interface In {
  arrivals: number[];
  capacity: number;
  rate: number;
}

function clean(i: In) {
  return {
    arrivals: i.arrivals.map((a) => Math.max(0, Math.min(8, Math.round(a)))).slice(0, 12),
    capacity: Math.max(1, Math.min(8, Math.round(i.capacity) || 1)),
    rate: Math.max(1, Math.min(3, Math.round(i.rate) || 1)),
  };
}

const viz: VizDef<In> = {
  id: 'be-leaky-bucket',
  title: 'Leaky bucket vs token bucket',
  code,
  language: 'python',
  inputs: [
    { key: 'arrivals', label: 'Requests arriving per tick', kind: 'numbers', default: [4, 0, 0, 3, 3, 0, 0, 0], maxItems: 12 },
    { key: 'capacity', label: 'Capacity', kind: 'number', default: 3 },
    { key: 'rate', label: 'Drain rate (per tick)', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'Bursts', input: { arrivals: [4, 0, 0, 3, 3, 0, 0, 0], capacity: 3, rate: 1 } },
    { label: 'Steady', input: { arrivals: [1, 1, 1, 1, 1], capacity: 2, rate: 1 } },
    { label: 'Overload', input: { arrivals: [3, 3, 3, 3], capacity: 4, rate: 2 } },
  ],
  run(input) {
    const { arrivals, capacity, rate } = clean(input);
    const r = new Recorder(code);
    const queue: number[] = [];
    let n = 0;
    let rejected = 0;
    let tokens = capacity;
    const leaky: [number, number][] = [];
    const token: [number, number][] = [];
    const outputs: number[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const q = (): ListPanel => ({
      type: 'list',
      title: `Queue (${queue.length}/${capacity}), drains ${rate} per tick`,
      orientation: 'horizontal',
      items: queue.map((id) => ({ id: `r${id}`, label: `#${id}`, tone: 'frontier' as Tone })),
      startLabel: 'out',
      endLabel: 'in',
      emptyText: 'empty',
    });
    const chart = (): ChartPanel => ({
      type: 'chart',
      title: 'Requests passed per tick',
      kind: 'bar',
      xLabel: 'tick',
      yLabel: 'forwarded',
      series: [
        { label: 'leaky (smooth)', points: leaky.length ? leaky : [[0, 0]], tone: 'done' },
        { label: 'token bucket (bursty)', points: token.length ? token : [[0, 0]], tone: 'swap' },
      ],
    });
    const view = (): Panel[] => [q(), chart(), logPanel('Events', log)];
    r.step('init', `Empty queue of ${capacity} slots; it leaks ${rate} request${rate > 1 ? 's' : ''} per tick`, view(), { capacity, rate });
    arrivals.forEach((a, i) => {
      const tick = i + 1;
      for (let k = 0; k < a; k++) {
        n++;
        r.op();
        r.step('full', `Tick ${tick}: request #${n} arrives, queue holds ${queue.length}/${capacity}`, view(), { tick, queue: queue.length });
        if (queue.length >= capacity) {
          rejected++;
          log.push({ text: `tick ${tick}: #${n} rejected (429)`, tone: 'error' });
          r.step('reject', `Queue full: #${n} is rejected`, view(), { rejected });
        } else {
          queue.push(n);
          r.step('enqueue', `#${n} joins the queue (${queue.length}/${capacity})`, view(), { queue: queue.length });
        }
      }
      const out: number[] = [];
      for (let k = 0; k < rate; k++) if (queue.length) out.push(queue.shift()!);
      outputs.push(out.length);
      leaky.push([tick, out.length]);
      tokens = Math.min(capacity, tokens + rate);
      const allowed = Math.min(a, tokens);
      tokens -= allowed;
      token.push([tick, allowed]);
      if (out.length) log.push({ text: `tick ${tick}: forwarded ${out.map((x) => '#' + x).join(', ')}`, tone: 'found' });
      r.step('drain', out.length ? `Tick ${tick}: leak ${out.map((x) => '#' + x).join(', ')} downstream` : `Tick ${tick}: nothing queued, nothing leaks`, view(), { tick, forwarded: out.length });
      r.step('leaked', `Output this tick: ${out.length}. A token bucket would have let ${allowed} through`, view(), { leaky: out.length, tokenBucket: allowed });
    });
    return { frames: r.frames, result: { outputs, rejected } };
  },
  reference(input) {
    const { arrivals, capacity, rate } = clean(input);
    let level = 0;
    let rejected = 0;
    const outputs = arrivals.map((a) => {
      const room = capacity - level;
      level += Math.min(a, room);
      rejected += Math.max(0, a - room);
      const out = Math.min(rate, level);
      level -= out;
      return out;
    });
    return { outputs, rejected };
  },
};

const ops = (...names: string[]) => names;

const unit: Unit = {
  id: 'be-leaky-bucket',
  hook: 'Leaky bucket and token bucket are both "rate limiters", but one smooths traffic and the other allows bursts. Being able to say when you would choose each is the real interview question.',
  predict: {
    prompt: 'Five requests arrive in the same instant. A token bucket (capacity 5) and a leaky bucket (capacity 5, drains 1 per second) both accept them. What does the downstream service see?',
    options: ['Both forward all five at once', 'Token bucket: five at once. Leaky bucket: one per second', 'Token bucket: one per second. Leaky bucket: five at once', 'Both reject four of them'],
    answer: 1,
    explain: 'Tokens can be spent immediately, so a full token bucket passes the burst through. The leaky bucket parks requests in a queue and releases them at the fixed drain rate: a smooth output.',
  },
  viz,
  deeper: {
    points: [
      'Leaky bucket = a FIFO queue with a fixed capacity, drained at a constant rate. Arrivals that find it full are dropped (or answered 429).',
      'Output is perfectly smooth, which protects fragile downstream systems (a payment gateway, a legacy database).',
      'Token bucket allows bursts up to capacity, then limits the average rate. It is better when users should feel fast most of the time.',
      '"Leaky bucket as a meter" drops the queue: keep only a counter that drains over time and reject when adding one more would overflow. It is the same maths as a token bucket in reverse.',
      'Queuing adds latency; if a request should fail fast rather than wait, use a token bucket or the meter variant.',
    ],
    complexity: { time: 'O(1) per request', space: 'O(capacity)' },
    pitfalls: ['Accepting capacity + 1 items because of `>` vs `>=`', 'Forgetting that queued requests wait (latency) while token-bucket requests do not', 'Draining with a real timer thread instead of an explicit, testable `leak()` step'],
  },
  practice: {
    language: 'python',
    fnName: 'LeakyBucket',
    statement: 'Implement `LeakyBucket(capacity, rate)`. `add(item)` queues the item and returns True, or returns False if the queue already holds `capacity` items. `leak()` removes up to `rate` items from the front (oldest first) and returns them as a list.',
    signature: 'class LeakyBucket:',
    solution: `from collections import deque

class LeakyBucket:
    def __init__(self, capacity, rate):
        self.queue = @@deque()@@
        self.capacity = capacity
        self.rate = rate

    def add(self, item):
        if @@len(self.queue) >= self.capacity@@:
            return False
        @@self.queue.append(item)@@
        return True

    def leak(self):
        out = []
        for _ in @@range(self.rate)@@:
            if self.queue:
                out.append(@@self.queue.popleft()@@)
        return out`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('LeakyBucket', 'add', 'add', 'add', 'leak', 'add', 'leak', 'leak', 'leak'), [[2, 1], ['a'], ['b'], ['c'], [], ['c'], [], [], []]], expected: [null, true, true, false, ['a'], true, ['b'], ['c'], []], name: 'overflow, drain, reuse space' },
      { args: [ops('LeakyBucket', 'add', 'add', 'add', 'leak', 'leak'), [[5, 2], [1], [2], [3], [], []]], expected: [null, true, true, true, [1, 2], [3]], name: 'rate 2 leaks two per tick' },
      { args: [ops('LeakyBucket', 'leak', 'add', 'leak'), [[1, 1], [], ['x'], []]], expected: [null, [], true, ['x']], name: 'leaking an empty bucket' },
      { args: [ops('LeakyBucket', 'add', 'add', 'add', 'add'), [[1, 1], ['a'], ['b'], ['c'], ['d']]], expected: [null, true, false, false, false], name: 'capacity 1' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'LeakyBucket',
    statement: 'With capacity 2, this limiter queues three requests before it starts rejecting. Find the off-by-one.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `from collections import deque

class LeakyBucket:
    def __init__(self, capacity, rate):
        self.queue = deque()
        self.capacity = capacity
        self.rate = rate

    def add(self, item):
        if len(self.queue) > self.capacity:
            return False
        self.queue.append(item)
        return True

    def leak(self):
        out = []
        for _ in range(self.rate):
            if self.queue:
                out.append(self.queue.popleft())
        return out`,
    fixed: `from collections import deque

class LeakyBucket:
    def __init__(self, capacity, rate):
        self.queue = deque()
        self.capacity = capacity
        self.rate = rate

    def add(self, item):
        if len(self.queue) >= self.capacity:
            return False
        self.queue.append(item)
        return True

    def leak(self):
        out = []
        for _ in range(self.rate):
            if self.queue:
                out.append(self.queue.popleft())
        return out`,
    tests: [
      { args: [ops('LeakyBucket', 'add', 'add', 'add'), [[2, 1], ['a'], ['b'], ['c']]], expected: [null, true, true, false], name: 'third item is rejected' },
      { args: [ops('LeakyBucket', 'add', 'add', 'leak', 'add'), [[1, 1], ['a'], ['b'], [], ['b']]], expected: [null, true, false, ['a'], true], name: 'space frees after a leak' },
      { args: [ops('LeakyBucket', 'add', 'leak'), [[3, 2], ['a'], []]], expected: [null, true, ['a']], name: 'leak returns what it has' },
    ],
    bugType: 'off-by-one (> vs >=)',
    hint: 'Count how many items are queued at the moment the check runs, and what "full" means.',
    explanation: 'The queue is full when `len == capacity`. With `>` the check only fires at `capacity + 1` items, so one extra request is accepted. Use `>=`.',
  },
  boss: {
    title: 'Leaky bucket as a meter',
    statement:
      'Implement `LeakyMeter(capacity, rate)` with no queue, only a "water level". `allow(now)`: first drain the level by `(now - last) * rate` (never below 0), then if `level + 1 > capacity` return False (level unchanged); otherwise add 1 to the level and return True. `level(now)` returns the drained level at `now`, rounded to 2 decimals, without changing any state. Start with level 0 and last = 0.',
    language: 'python',
    fnName: 'LeakyMeter',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class LeakyMeter:
    # your code here
    pass
`,
    solution: `class LeakyMeter:
    def __init__(self, capacity, rate):
        self.capacity = capacity
        self.rate = rate
        self.water = 0
        self.last = 0

    def _drained(self, now):
        return max(0, self.water - (now - self.last) * self.rate)

    def allow(self, now):
        self.water = self._drained(now)
        self.last = now
        if self.water + 1 > self.capacity:
            return False
        self.water += 1
        return True

    def level(self, now):
        return round(self._drained(now), 2)`,
    tests: [
      { args: [ops('LeakyMeter', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow'), [[2, 1], [0], [0], [0], [1], [1], [3]]], expected: [null, true, true, false, true, false, true], name: 'fills, drains, refills' },
      { args: [ops('LeakyMeter', 'allow', 'allow', 'level', 'level'), [[4, 0.5], [0], [0], [1], [4]]], expected: [null, true, true, 1.5, 0], name: 'level without side effects' },
      { args: [ops('LeakyMeter', 'allow', 'allow', 'allow', 'allow'), [[1, 1], [0], [0], [0.5], [1]]], expected: [null, true, false, false, true], name: 'fractional time' },
      { args: [ops('LeakyMeter', 'allow', 'level', 'level'), [[3, 1], [0], [0], [0]]], expected: [null, true, 1, 1], name: 'level is read-only' },
      { args: [ops('LeakyMeter', 'allow', 'allow', 'allow', 'allow'), [[2, 1], [100], [100], [100], [200]]], expected: [null, true, true, false, true], name: 'level never goes negative' },
    ],
    hints: ['State is just `water` and `last`. Write a helper that returns the drained level at a given `now` without mutating anything.', '`allow` must store the drained value and the new timestamp even when it rejects; `level` must not store anything.'],
    combines: ['be-token-bucket'],
  },
  quiz: [
    {
      prompt: 'Your downstream service melts if it ever receives more than 10 requests per second, even briefly. Which limiter fits best?',
      options: ['Token bucket with a large capacity', 'Leaky bucket draining at 10/s', 'No limiter, just retries', 'Fixed counter reset each minute'],
      answer: 1,
      explain: 'Only the leaky bucket guarantees a constant, smooth output rate. Token buckets deliberately allow bursts up to their capacity.',
    },
  ],
};

export default unit;
