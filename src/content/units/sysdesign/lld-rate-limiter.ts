import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';
import { ops } from '@/content/lib/sysdesign-hld-1';

const code = `
class SlidingWindowLimiter:
    def __init__(self, limit, window):
        self.limit, self.window = limit, window       #@init
        self.log = {}

    def allow(self, user, now):
        q = self.log.setdefault(user, deque())
        while q and q[0] <= now - self.window:        #@drop
            q.popleft()
        if len(q) < self.limit:                       #@check
            q.append(now)                             #@record
            return True                               #@allow
        return False                                  #@deny

class FixedWindowLimiter:
    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.counts = {}

    def allow(self, user, now):
        slot, n = self.counts.get(user, (None, 0))
        if slot != now // self.window:                #@slot
            slot, n = now // self.window, 0           #@reset
        ok = n < self.limit                           #@fcheck
        self.counts[user] = (slot, n + 1 if ok else n)   #@count
        return ok                                     #@fret
`;

const MODES = ['sliding log', 'fixed window'];

interface In {
  mode: string;
  limit: number;
  window: number;
  requests: string[];
}
type Req = { user: string; t: number };

function parseReqs(list: string[]): Req[] {
  const out = list.map((raw) => {
    const [user, t] = raw.split(':').map((x) => x.trim());
    if (!user || t === undefined || t === '' || !Number.isInteger(Number(t)) || Number(t) < 0) throw new Error(`Cannot read "${raw}". Use user:second (whole seconds, e.g. a:3)`);
    return { user, t: Number(t) };
  });
  return out
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.t - b.q.t || a.i - b.i)
    .map((x) => x.q);
}

const clean = (i: In) => ({ limit: Math.max(1, Math.min(8, Math.round(i.limit) || 1)), window: Math.max(1, Math.min(30, Math.round(i.window) || 1)), sliding: i.mode !== MODES[1] });

const viz: VizDef<In> = {
  id: 'lld-rate-limiter',
  title: 'Rate limiter: sliding log vs fixed window',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'Algorithm', kind: 'select', default: MODES[0], options: MODES },
    { key: 'limit', label: 'Limit (requests per window)', kind: 'number', default: 3 },
    { key: 'window', label: 'Window (seconds)', kind: 'number', default: 10 },
    { key: 'requests', label: 'Requests (user:second)', kind: 'strings', default: ['a:8', 'a:8', 'a:9', 'a:10', 'a:11', 'b:11', 'a:18'], maxItems: 12, help: 'a:8, a:9, b:9, ...' },
  ],
  presets: [
    { label: 'Sliding: boundary burst', input: { mode: MODES[0], limit: 3, window: 10, requests: ['a:8', 'a:8', 'a:9', 'a:10', 'a:11', 'b:11', 'a:18'] } },
    { label: 'Fixed: boundary burst', input: { mode: MODES[1], limit: 3, window: 10, requests: ['a:8', 'a:8', 'a:9', 'a:10', 'a:11', 'b:11', 'a:18'] } },
    { label: 'Two users', input: { mode: MODES[0], limit: 1, window: 5, requests: ['a:0', 'b:0', 'a:1', 'b:2', 'a:5', 'b:5'] } },
  ],
  run(input) {
    const { limit, window, sliding } = clean(input);
    const reqs = parseReqs(input.requests);
    const r = new Recorder(code);
    const users = [...new Set(reqs.map((q) => q.user))].slice(0, 4);
    const logs: Record<string, number[]> = {};
    const fixed: Record<string, { slot: number | null; n: number }> = {};
    const events: Record<string, { t: number; label: string; tone: Tone }[]> = Object.fromEntries(users.map((u) => [u, []]));
    const text: { text: string; tone?: Tone }[] = [];
    const results: boolean[] = [];
    const tMax = Math.max(window + 1, (reqs[reqs.length - 1]?.t ?? 0) + 2);
    if (reqs.some((q) => !users.includes(q.user))) throw new Error('Use at most 4 different users');
    const view = (user: string, now: number, win: { from: number; to: number } | null, detail: Panel): Panel[] => [
      {
        type: 'timeline',
        title: sliding ? `Sliding window (${limit} per ${window}s)` : `Fixed window (${limit} per ${window}s)`,
        tMax,
        now,
        unit: 's',
        lanes: [
          ...users.map((u) => ({ label: `user ${u}`, events: events[u].map((e) => ({ t: e.t, label: e.label, tone: e.tone })) })),
          { label: 'current window', events: win ? [{ t: win.from, dur: Math.max(0.5, win.to - win.from), label: `${win.from}..${win.to}`, tone: 'compare' as Tone }] : [] },
        ],
      },
      detail,
      logPanel(`Decisions for ${user}`, text),
    ];
    const logDetail = (user: string, tones: Record<number, Tone> = {}): Panel => ({
      type: 'array',
      title: `Timestamps kept for ${user}`,
      values: (logs[user] ?? []).length ? logs[user] : ['(none)'],
      tones: Object.fromEntries((logs[user] ?? []).map((_, i) => [i, tones[i] ?? 'default'])),
      hideIndex: true,
    });
    const fixedDetail = (user: string, tone: Tone = 'default'): Panel => kvPanel(`Counter for ${user}`, { slot: fixed[user]?.slot ?? '(none)', count: fixed[user]?.n ?? 0, limit }, { count: tone });
    r.step('init', `${sliding ? 'Sliding log' : 'Fixed window'}: at most ${limit} requests per ${window}s per user`, view(users[0] ?? '-', 0, null, sliding ? logDetail(users[0] ?? '-') : fixedDetail(users[0] ?? '-')), { limit, window });
    for (const { user, t } of reqs) {
      r.op();
      if (sliding) {
        const q = (logs[user] ??= []);
        const old = q.filter((x) => x <= t - window);
        const oldTones = Object.fromEntries(q.map((x, i) => [i, x <= t - window ? 'muted' : 'default'])) as Record<number, Tone>;
        r.step('drop', old.length ? `t=${t} ${user}: drop ${old.join(', ')} (older than ${t - window})` : `t=${t} ${user}: nothing older than ${t - window} to drop`, view(user, t, { from: Math.max(0, t - window), to: t }, logDetail(user, oldTones)), { now: t, kept: q.length - old.length });
        logs[user] = q.filter((x) => x > t - window);
        const n = logs[user].length;
        const ok = n < limit;
        r.step('check', `${n} request${n === 1 ? '' : 's'} in the window, limit ${limit}: ${ok ? 'room left' : 'full'}`, view(user, t, { from: Math.max(0, t - window), to: t }, logDetail(user)), { count: n, limit });
        if (ok) {
          logs[user].push(t);
          events[user].push({ t, label: 'ok', tone: 'found' });
          text.push({ text: `t=${t} ${user} allowed`, tone: 'found' });
          r.step('record', `Record t=${t} and allow`, view(user, t, { from: Math.max(0, t - window), to: t }, logDetail(user, { [logs[user].length - 1]: 'new' })), { count: logs[user].length });
        } else {
          events[user].push({ t, label: '429', tone: 'error' });
          text.push({ text: `t=${t} ${user} DENIED (429)`, tone: 'error' });
          r.step('deny', `Deny with 429. Denied requests are not recorded`, view(user, t, { from: Math.max(0, t - window), to: t }, logDetail(user)), { count: n });
        }
        results.push(ok);
        continue;
      }
      const cur = (fixed[user] ??= { slot: null, n: 0 });
      const slot = Math.floor(t / window);
      const bounds = { from: slot * window, to: (slot + 1) * window };
      if (cur.slot !== slot) {
        r.step('slot', `t=${t} ${user}: now in window #${slot} (${bounds.from}..${bounds.to}), the counter is stale`, view(user, t, bounds, fixedDetail(user, 'swap')), { slot });
        cur.slot = slot;
        cur.n = 0;
        r.step('reset', `New window: counter resets to 0`, view(user, t, bounds, fixedDetail(user, 'new')), { slot, count: 0 });
      } else {
        r.step('slot', `t=${t} ${user}: still in window #${slot}`, view(user, t, bounds, fixedDetail(user)), { slot });
      }
      const ok = cur.n < limit;
      if (ok) cur.n += 1;
      events[user].push({ t, label: ok ? 'ok' : '429', tone: ok ? 'found' : 'error' });
      text.push({ text: `t=${t} ${user} ${ok ? 'allowed' : 'DENIED (429)'}`, tone: ok ? 'found' : 'error' });
      results.push(ok);
      r.step('count', ok ? `${cur.n - 1} < ${limit}: allow, counter -> ${cur.n}` : `${cur.n} >= ${limit}: deny with 429`, view(user, t, bounds, fixedDetail(user, ok ? 'found' : 'error')), { count: cur.n, allowed: ok });
    }
    const allowed = results.filter(Boolean).length;
    r.step('init', `${allowed} of ${results.length} requests allowed`, view(users[0] ?? '-', tMax, null, sliding ? logDetail(users[0] ?? '-') : fixedDetail(users[0] ?? '-')), { allowed, denied: results.length - allowed });
    return { frames: r.frames, result: results };
  },
  reference(input) {
    const { limit, window, sliding } = clean(input);
    // Count previously ALLOWED requests directly from the history instead of maintaining a queue.
    const allowedAt: { user: string; t: number }[] = [];
    return parseReqs(input.requests).map(({ user, t }) => {
      const used = allowedAt.filter((a) => a.user === user && (sliding ? a.t > t - window : Math.floor(a.t / window) === Math.floor(t / window))).length;
      if (used >= limit) return false;
      allowedAt.push({ user, t });
      return true;
    });
  },
};

const unit: Unit = {
  id: 'lld-rate-limiter',
  hook: 'Rate limiting is a favourite follow-up in both LLD and HLD rounds. Showing the sliding log, then explaining why a fixed window lets double bursts through, is the answer that stands out.',
  predict: {
    prompt: 'Limit: 3 requests per 10 seconds, fixed windows aligned to 0, 10, 20... A client sends 3 requests at t=8, 9, 9 and 3 more at t=10, 10, 11. How many does the fixed window allow?',
    options: ['3', '4', '5', '6'],
    answer: 3,
    explain: 'Seconds 8-9 fall in window [0,10) and 10-11 in [10,20): each window sees only 3 requests, so all 6 pass within 3 seconds. A sliding window would allow only 3.',
  },
  viz,
  deeper: {
    points: [
      '**Sliding log** keeps one timestamp per allowed request, dropping those older than `now - window`. It is exact but costs O(limit) memory per user.',
      '**Fixed window** keeps just a counter and a window id: tiny and fast, but a client can send up to `2 x limit` around a boundary.',
      'Inject `now` into `allow()`; never read the clock inside. That makes the limiter trivial to test and replay.',
      'Denied requests must not be recorded, otherwise a client that keeps retrying locks itself out forever.',
      'Per-user state lives in a dict (or Redis with TTL keys); evict idle users so memory does not grow without bound.',
    ],
    complexity: { time: 'O(1) amortised per request', space: 'O(limit) per active user (sliding log)' },
    pitfalls: ['Never dropping old timestamps', 'Using `<` instead of `<=` at the window edge so the oldest entry lingers one extra tick', 'Recording denied requests', 'Sharing one deque between users'],
  },
  practice: {
    language: 'python',
    fnName: 'SlidingWindowLimiter',
    statement: 'Implement `SlidingWindowLimiter(limit, window)` with `allow(user, now)`. A request is allowed if fewer than `limit` allowed requests by the same user happened in the last `window` seconds (timestamps `<= now - window` have expired). Only allowed requests are recorded.',
    signature: 'class SlidingWindowLimiter:',
    solution: `from collections import deque

class SlidingWindowLimiter:
    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.log = {}

    def allow(self, user, now):
        q = self.log.setdefault(user, deque())
        while q and q[0] @@<=@@ now - self.window:
            q.@@popleft()@@
        if len(q) @@<@@ self.limit:
            q.@@append(now)@@
            return True
        return False`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow'), [[2, 10], ['a', 0], ['a', 1], ['a', 2], ['a', 10], ['a', 11], ['a', 12]]], expected: [null, true, true, false, true, true, false], name: 'window slides forward' },
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow', 'allow'), [[1, 5], ['a', 0], ['b', 0], ['a', 1], ['b', 5]]], expected: [null, true, true, false, true], name: 'users are independent' },
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow', 'allow'), [[1, 10], ['a', 0], ['a', 5], ['a', 9], ['a', 10]]], expected: [null, true, false, false, true], name: 'denied requests are not recorded' },
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow'), [[3, 10], ['a', 8], ['a', 8], ['a', 9], ['a', 10], ['a', 11], ['a', 18]]], expected: [null, true, true, true, false, false, true], name: 'no boundary burst' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'SlidingWindowLimiter',
    statement: 'After the limit is reached once, a user is blocked for ever, even hours later. Find the bug in the limiter.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `from collections import deque

class SlidingWindowLimiter:
    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.log = {}

    def allow(self, user, now):
        q = self.log.setdefault(user, deque())
        if len(q) < self.limit:
            q.append(now)
            return True
        return False`,
    fixed: `from collections import deque

class SlidingWindowLimiter:
    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.log = {}

    def allow(self, user, now):
        q = self.log.setdefault(user, deque())
        while q and q[0] <= now - self.window:
            q.popleft()
        if len(q) < self.limit:
            q.append(now)
            return True
        return False`,
    tests: [
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow'), [[2, 10], ['a', 0], ['a', 1], ['a', 2]]], expected: [null, true, true, false], name: 'limit is enforced' },
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow'), [[1, 10], ['a', 0], ['a', 5], ['a', 10]]], expected: [null, true, false, true], name: 'old entries expire' },
      { args: [ops('SlidingWindowLimiter', 'allow', 'allow', 'allow', 'allow'), [[2, 5], ['a', 0], ['a', 1], ['a', 100], ['a', 101]]], expected: [null, true, true, true, true], name: 'long pause resets everything' },
    ],
    bugType: 'stale state never cleaned',
    hint: 'What ever removes a timestamp from the deque?',
    explanation: 'Nothing removes expired timestamps, so the deque only grows until `len(q) == limit` and then stays full. Pop entries with `q[0] <= now - window` before counting.',
  },
  boss: {
    title: 'Per-user plus global limits',
    statement:
      'Implement `TieredLimiter(user_limit, global_limit, window)` with `allow(user, now)`. A request needs room in BOTH the user\'s sliding window and the global sliding window (timestamps `<= now - window` expired). Return "ok" and record the request in both logs; return "user" if the user limit is reached (checked first), or "global" if only the global limit is reached. Denied requests are never recorded.',
    language: 'python',
    fnName: 'TieredLimiter',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class TieredLimiter:
    # your code here
    pass
`,
    solution: `from collections import deque

class TieredLimiter:
    def __init__(self, user_limit, global_limit, window):
        self.user_limit = user_limit
        self.global_limit = global_limit
        self.window = window
        self.users = {}
        self.everyone = deque()

    def _trim(self, q, now):
        while q and q[0] <= now - self.window:
            q.popleft()

    def allow(self, user, now):
        q = self.users.setdefault(user, deque())
        self._trim(q, now)
        self._trim(self.everyone, now)
        if len(q) >= self.user_limit:
            return 'user'
        if len(self.everyone) >= self.global_limit:
            return 'global'
        q.append(now)
        self.everyone.append(now)
        return 'ok'`,
    tests: [
      { args: [ops('TieredLimiter', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow'), [[2, 3, 10], ['a', 0], ['a', 1], ['a', 2], ['b', 3], ['c', 4], ['b', 10]]], expected: [null, 'ok', 'ok', 'user', 'ok', 'global', 'ok'], name: 'both limits and expiry' },
      { args: [ops('TieredLimiter', 'allow', 'allow', 'allow'), [[1, 5, 10], ['a', 0], ['a', 3], ['a', 10]]], expected: [null, 'ok', 'user', 'ok'], name: 'user window slides' },
      { args: [ops('TieredLimiter', 'allow', 'allow', 'allow', 'allow'), [[5, 2, 5], ['a', 0], ['b', 1], ['c', 2], ['c', 5]]], expected: [null, 'ok', 'ok', 'global', 'ok'], name: 'global window slides' },
      { args: [ops('TieredLimiter', 'allow', 'allow'), [[1, 1, 10], ['a', 0], ['a', 1]]], expected: [null, 'ok', 'user'], name: 'user reason wins when both are full' },
      { args: [ops('TieredLimiter', 'allow', 'allow', 'allow', 'allow'), [[1, 2, 10], ['a', 0], ['a', 1], ['b', 2], ['c', 3]]], expected: [null, 'ok', 'user', 'ok', 'global'], name: 'denied requests use no global capacity' },
    ],
    hints: ['Keep one deque per user and one shared deque for everybody; trim both at the start of every call.', 'Check the user limit first, then the global one, and append to both deques only when both pass.'],
    combines: ['be-token-bucket', 'be-leaky-bucket'],
  },
};

export default unit;
