import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, logPanel, needInt } from '@/content/lib/sysdesign-hld-2';
import { splitToken } from '@/content/lib/sysdesign-hld-3';

const code = `
USERS = {"alice", "bob"}
ROUTES = {"/orders": ["orders"], "/profile": ["users"], "/home": ["orders", "users"]}

def handle(token, path, limit, seen):
    if token not in USERS:
        return 401, []                                  #@auth
    seen[token] = seen.get(token, 0) + 1
    if seen[token] > limit:
        return 429, []                                  #@limit
    services = ROUTES.get(path)
    if services is None:
        return 404, []                                  #@route
    if len(services) > 1:
        return 200, services                            #@aggregate
    return 200, services                                #@forward
`;

const USERS = new Set(['alice', 'bob']);
const ROUTES: Record<string, string[]> = { '/orders': ['orders'], '/profile': ['users'], '/home': ['orders', 'users'] };

interface In {
  requests: string[];
  limit: number;
}

function parse(input: In) {
  const limit = needInt('limit', input.limit, 1, 6);
  if (!input.requests.length || input.requests.length > 9) throw new Error('Give 1 to 9 requests');
  return { limit, reqs: input.requests.map((t) => splitToken(t, 'request')) };
}

type Stage = 'auth' | 'limit' | 'route';

const viz: VizDef<In> = {
  id: 'hld-api-gateway',
  title: 'A request through an API gateway',
  code,
  language: 'python',
  inputs: [
    { key: 'requests', label: 'Requests (token:path)', kind: 'strings', default: ['alice:/orders', 'bob:/profile', 'evil:/orders', 'alice:/home', 'bob:/missing', 'alice:/orders', 'alice:/profile'], maxItems: 9, help: 'Valid tokens: alice, bob. Paths: /orders, /profile, /home (fans out to both).' },
    { key: 'limit', label: 'Rate limit per token', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Mixed traffic', input: {} },
    { label: 'Strict limit (1)', input: { limit: 1, requests: ['alice:/orders', 'alice:/profile', 'bob:/orders', 'bob:/home'] } },
    { label: 'Aggregation', input: { requests: ['alice:/home', 'bob:/home', 'alice:/home'], limit: 5 } },
    { label: 'Bad tokens', input: { requests: ['x:/orders', 'alice:/orders', 'y:/home'], limit: 3 } },
  ],
  run(input) {
    const { limit, reqs } = parse(input);
    const r = new Recorder(code);
    const seen: Record<string, number> = {};
    const statuses: number[] = [];
    const logLines: { text: string; tone?: Tone }[] = [];
    let backendCalls = 0;
    const view = (who: string, marks: Record<Stage, Tone>, svcs: string[], note: string): Panel[] => {
      const nodes = [
        gnode('C', who || 'Client', 40, 100, { shape: 'actor' }),
        gnode('A', 'Auth', 130, 100, { shape: 'pill', w: 64, tone: marks.auth }),
        gnode('L', 'Rate limit', 225, 100, { shape: 'pill', w: 84, tone: marks.limit, badge: note }),
        gnode('R', 'Router', 320, 100, { shape: 'pill', w: 70, tone: marks.route }),
        gnode('orders', 'Orders svc', 425, 55, { w: 84, tone: svcs.includes('orders') ? 'active' : 'muted' }),
        gnode('users', 'Users svc', 425, 145, { w: 84, tone: svcs.includes('users') ? 'active' : 'muted' }),
      ];
      const edges = [
        gedge('C', 'A', { flow: marks.auth === 'active' }),
        gedge('A', 'L', { tone: marks.limit === 'muted' ? 'muted' : 'default', flow: marks.limit === 'active' }),
        gedge('L', 'R', { tone: marks.route === 'muted' ? 'muted' : 'default', flow: marks.route === 'active' }),
        gedge('R', 'orders', { tone: svcs.includes('orders') ? 'active' : 'muted', flow: svcs.includes('orders') }),
        gedge('R', 'users', { tone: svcs.includes('users') ? 'active' : 'muted', flow: svcs.includes('users') }),
      ];
      return [graph(nodes, edges, 480, 200, 'Gateway plugins'), logPanel('Responses', logLines)];
    };
    const M = (a: Tone, l: Tone, rt: Tone): Record<Stage, Tone> => ({ auth: a, limit: l, route: rt });

    r.step(undefined, `${reqs.length} requests, limit ${limit} per token. Every request passes the same plugin chain`, view('', M('default', 'default', 'default'), [], ''), { limit });
    reqs.forEach(([token, path], i) => {
      const tag = `#${i + 1} ${token} ${path}`;
      r.op();
      if (!USERS.has(token)) {
        statuses.push(401);
        logLines.push({ text: `${tag} → 401`, tone: 'error' });
        r.step('auth', `${tag}: unknown token, rejected with 401 before anything else runs`, view(token, M('error', 'muted', 'muted'), [], ''), { token, status: 401 });
        return;
      }
      r.step('auth', `${tag}: token valid, request continues`, view(token, M('found', 'default', 'default'), [], ''), { token });
      seen[token] = (seen[token] ?? 0) + 1;
      if (seen[token] > limit) {
        statuses.push(429);
        logLines.push({ text: `${tag} → 429`, tone: 'error' });
        r.step('limit', `${tag}: ${token} used ${seen[token]} of ${limit} allowed → 429, no backend call`, view(token, M('found', 'error', 'muted'), [], `${seen[token]}/${limit}`), { token, count: seen[token], status: 429 });
        return;
      }
      r.step('limit', `${tag}: ${token} is at ${seen[token]} of ${limit}, allowed`, view(token, M('found', 'found', 'default'), [], `${seen[token]}/${limit}`), { token, count: seen[token] });
      const svcs = ROUTES[path];
      if (!svcs) {
        statuses.push(404);
        logLines.push({ text: `${tag} → 404`, tone: 'error' });
        r.step('route', `${tag}: no route for ${path} → 404 from the gateway itself`, view(token, M('found', 'found', 'error'), [], `${seen[token]}/${limit}`), { path, status: 404 });
        return;
      }
      statuses.push(200);
      backendCalls += svcs.length;
      logLines.push({ text: `${tag} → 200 (${svcs.length} call${svcs.length > 1 ? 's' : ''})`, tone: 'found' });
      r.step(svcs.length > 1 ? 'aggregate' : 'forward', svcs.length > 1 ? `${tag}: gateway calls ${svcs.join(' + ')} and merges them into one response` : `${tag}: forwarded to ${svcs[0]} service → 200`, view(token, M('found', 'found', 'found'), svcs, `${seen[token]}/${limit}`), { path, status: 200, backendCalls });
    });
    const rejected = statuses.filter((s) => s !== 200).length;
    r.step(undefined, `${rejected} of ${reqs.length} requests stopped at the gateway; backends saw ${backendCalls} calls`, [kvPanel('Outcome', { statuses: statuses.join(' '), backendCalls, rejected }, { rejected: rejected ? 'compare' : 'found' }), logPanel('Responses', logLines, 9)], { backendCalls });
    return { frames: r.frames, result: { statuses, backendCalls } };
  },
  reference(input) {
    const { limit, reqs } = parse(input);
    const used = new Map<string, number>();
    const statuses: number[] = [];
    let calls = 0;
    for (const [token, path] of reqs) {
      if (!USERS.has(token)) statuses.push(401);
      else {
        const n = (used.get(token) ?? 0) + 1;
        used.set(token, n);
        if (n > limit) statuses.push(429);
        else if (!(path in ROUTES)) statuses.push(404);
        else {
          statuses.push(200);
          calls += ROUTES[path].length;
        }
      }
    }
    return { statuses, backendCalls: calls };
  },
};

const gwClass = `class Gateway:
    def __init__(self, tokens, routes, limit):
        self.tokens = set(tokens)
        self.routes = routes
        self.limit = limit
        self.seen = {}

    def handle(self, token, path):
        if token not in self.tokens:
            return 401
        self.seen[token] = self.seen.get(token, 0) + 1
        if self.seen[token] > self.limit:
            return 429
        if path not in self.routes:
            return 404
        return 200`;

const ops = (...n: string[]) => n;
const R = { '/a': 'x', '/b': 'y' };

const gwTests = [
  { args: [ops('Gateway', 'handle', 'handle', 'handle'), [[['u'], R, 2], ['u', '/a'], ['u', '/b'], ['u', '/a']]], expected: [null, 200, 200, 429], name: 'limit of 2' },
  { args: [ops('Gateway', 'handle', 'handle'), [[['u'], R, 5], ['zzz', '/a'], ['u', '/a']]], expected: [null, 401, 200], name: 'unknown token' },
  { args: [ops('Gateway', 'handle', 'handle'), [[['u'], R, 5], ['u', '/nope'], ['u', '/a']]], expected: [null, 404, 200], name: 'unknown path' },
  { args: [ops('Gateway', 'handle', 'handle', 'handle'), [[['u', 'v'], R, 1], ['u', '/a'], ['v', '/a'], ['u', '/a']]], expected: [null, 200, 200, 429], name: 'limits are per token' },
];

const unit: Unit = {
  id: 'hld-api-gateway',
  hook: 'Every microservice design has a front door. Interviewers want you to say which cross-cutting jobs live in the gateway (auth, rate limits, routing, aggregation) so services do not each reimplement them.',
  predict: {
    prompt: 'A client sends a request with an invalid token to a gateway that checks rate limits before authentication. What is the problem?',
    options: ['None, order does not matter', 'Anyone can burn through the rate-limit counters or fill its storage without a valid identity, and per-user limits cannot be applied', 'The request will succeed anyway', 'It makes authentication slower'],
    answer: 1,
    explain: 'You cannot enforce a per-user limit before knowing who the user is. Cheap checks that reject early (TLS, auth) normally run first, then user-based rate limiting, then routing. An IP-based limit can run before auth to blunt floods.',
  },
  viz,
  deeper: {
    points: [
      'An API gateway is the single entry point for clients: it terminates TLS, authenticates the caller and passes identity downstream so each service does not.',
      'Routing maps public paths to internal services, hiding service topology and letting you move or split services without changing clients.',
      'Rate limiting at the edge protects every backend at once and returns 429 without touching them.',
      'Aggregation (a backend-for-frontend) fans one client request out to several services and merges the replies, saving mobile clients several round trips.',
      'Costs: an extra hop, one more component that must be highly available, and a temptation to put business logic in it.',
    ],
    complexity: { time: 'Each plugin adds a small constant latency per request', space: 'Rate-limit counters per client' },
    pitfalls: ['Running expensive plugins before cheap rejecting ones', 'Letting the gateway become a single point of failure with no redundancy', 'Putting business logic in the gateway so it becomes a hidden monolith'],
  },
  practice: {
    language: 'python',
    fnName: 'Gateway',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `Gateway(tokens, routes, limit)`. `handle(token, path)` returns 401 for an unknown token. Otherwise it counts the request against the token and returns 429 once the token has made more than `limit` requests, 404 if `path` is not in `routes`, else 200.',
    signature: 'class Gateway:',
    solution: `class Gateway:
    def __init__(self, tokens, routes, limit):
        self.tokens = set(tokens)
        self.routes = routes
        self.limit = limit
        self.seen = {}

    def handle(self, token, path):
        if @@token not in self.tokens@@:
            return 401
        self.seen[token] = @@self.seen.get(token, 0) + 1@@
        if @@self.seen[token] > self.limit@@:
            return 429
        if @@path not in self.routes@@:
            return 404
        return 200`,
    tests: gwTests,
  },
  debug: {
    language: 'python',
    fnName: 'Gateway',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'With a limit of 2 requests, clients are blocked after their first request instead of their second. Find the bug.',
    buggy: gwClass.replace('self.seen[token] > self.limit', 'self.seen[token] >= self.limit'),
    fixed: gwClass,
    tests: gwTests,
    bugType: 'off-by-one limit',
    hint: 'After the second request, seen is 2 and the limit is 2. Should that request be allowed?',
    explanation: 'A limit of N allows N requests; the (N+1)th is the first to be rejected. With `>=` the Nth request is already rejected, so every client gets one request less than promised.',
  },
  boss: {
    title: 'Gateway with a fixed-window limiter',
    statement:
      'Each request is `[t, token, path]` in time order. A token not in `tokens` gets 401 and is not counted. Otherwise count the request in the token\'s current window (`t // window`; counts start from zero in each new window). If that count exceeds `limit` return 429, else 404 when `path` is not in `routes`, else 200. Return the list of statuses.',
    language: 'python',
    fnName: 'gateway_status',
    starter: `def gateway_status(requests, tokens, routes, limit, window):
    # your code here
    pass
`,
    solution: `def gateway_status(requests, tokens, routes, limit, window):
    counts = {}
    out = []
    for t, token, path in requests:
        if token not in tokens:
            out.append(401)
            continue
        slot = (token, t // window)
        counts[slot] = counts.get(slot, 0) + 1
        if counts[slot] > limit:
            out.append(429)
        elif path not in routes:
            out.append(404)
        else:
            out.append(200)
    return out`,
    tests: [
      { args: [[[0, 'u', '/a'], [1, 'u', '/a'], [2, 'u', '/a'], [10, 'u', '/a'], [11, 'u', '/b']], ['u'], R, 2, 10], expected: [200, 200, 429, 200, 200], name: 'window resets' },
      { args: [[[0, 'u', '/a'], [0, 'v', '/a'], [1, 'v', '/zzz'], [2, 'v', '/a'], [3, 'z', '/a']], ['u', 'v'], R, 2, 5], expected: [200, 200, 404, 429, 401], name: 'per-token counting and 401' },
      { args: [[], ['u'], R, 1, 5], expected: [], name: 'no requests' },
      { args: [[[4, 'u', '/a'], [5, 'u', '/a'], [9, 'u', '/a'], [10, 'u', '/a']], ['u'], R, 1, 5], expected: [200, 200, 429, 200], name: 'window boundaries' },
      { args: [[[0, 'u', '/nope'], [1, 'u', '/nope']], ['u'], R, 1, 60], expected: [404, 429], name: '404 still counts toward the limit' },
    ],
    hints: ['Use a dict keyed by `(token, t // window)` so each window has its own counter.', 'Order of checks: unknown token (401, no count) → count the request → over limit (429) → unknown route (404) → 200.'],
    combines: ['lld-rate-limiter'],
  },
  quiz: [
    {
      prompt: 'Which of these should NOT be implemented in the API gateway?',
      options: ['TLS termination', 'Computing the total of a shopping cart', 'Authentication', 'Request routing'],
      answer: 1,
      explain: 'Cart totals are business logic that belongs in a service. The gateway holds cross-cutting infrastructure concerns only.',
    },
  ],
};

export default unit;
