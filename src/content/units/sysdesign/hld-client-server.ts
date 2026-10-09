import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';
import { ops } from '@/content/lib/sysdesign-hld-1';

const code = `
def resolve(servers, i, ttl):
    # DNS answer rotates; the client reuses it for ttl requests
    return servers[(i // ttl) % len(servers)]            #@dns

def login(server, user, mode):
    if mode == 'stateful':
        server.sessions.add(user)                        #@remember
    return 200                                           #@login

def get_profile(server, user, token, mode):
    if mode == 'stateless':
        return 200 if verify(token, SECRET) else 401     #@verify
    return 200 if user in server.sessions else 401       #@lookup
`;

const MODES = ['stateless (signed token)', 'stateful (server memory)'];

interface In {
  mode: string;
  servers: string[];
  ttl: number;
  requests: number;
}

function clean(i: In) {
  const servers = i.servers.map((s) => s.trim()).filter(Boolean);
  if (servers.length < 1 || servers.length > 4) throw new Error('Give between 1 and 4 server addresses');
  return { servers, ttl: Math.max(1, Math.min(6, Math.round(i.ttl) || 1)), requests: Math.max(2, Math.min(8, Math.round(i.requests) || 2)), stateful: i.mode === MODES[1] };
}

const viz: VizDef<In> = {
  id: 'hld-client-server',
  title: 'Client, DNS and stateless servers',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'Session handling', kind: 'select', default: MODES[0], options: MODES },
    { key: 'servers', label: 'Server IPs (DNS records)', kind: 'strings', default: ['10.0.0.1', '10.0.0.2', '10.0.0.3'], maxItems: 4 },
    { key: 'ttl', label: 'DNS answer reused for N requests', kind: 'number', default: 1 },
    { key: 'requests', label: 'Requests (first is login)', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Stateless: any server works', input: { mode: MODES[0], servers: ['10.0.0.1', '10.0.0.2', '10.0.0.3'], ttl: 1, requests: 5 } },
    { label: 'Stateful: 401 on other servers', input: { mode: MODES[1], servers: ['10.0.0.1', '10.0.0.2', '10.0.0.3'], ttl: 1, requests: 5 } },
    { label: 'Long DNS TTL', input: { mode: MODES[1], servers: ['10.0.0.1', '10.0.0.2'], ttl: 3, requests: 6 } },
  ],
  run(input) {
    const { servers, ttl, requests, stateful } = clean(input);
    const r = new Recorder(code);
    const sessions: Record<string, string[]> = Object.fromEntries(servers.map((s) => [s, []]));
    const log: { text: string; tone?: Tone }[] = [];
    const statuses: number[] = [];
    let cached: string | null = null;
    let loginServer = '';
    const view = (active: string | null, edgeTone: Tone, dnsActive = false, tones: Record<string, Tone> = {}): Panel[] => {
      const nodes: GraphNode[] = [
        { id: 'client', label: 'Client', x: 60, y: 110, shape: 'rect', w: 70, h: 36, tone: 'default' },
        { id: 'dns', label: 'DNS', x: 60, y: 28, shape: 'cylinder', w: 60, h: 36, tone: dnsActive ? 'active' : 'muted', sub: 'api.example.com' },
        ...servers.map((s, i) => ({
          id: s,
          label: s,
          x: 300,
          y: servers.length === 1 ? 100 : 30 + i * (140 / (servers.length - 1)),
          shape: 'rect' as const,
          w: 96,
          h: 34,
          tone: tones[s] ?? (active === s ? 'active' : 'default'),
          badge: stateful ? (sessions[s].length ? `sessions: ${sessions[s].join(',')}` : 'sessions: none') : 'no local state',
        })),
      ];
      const edges: GraphEdge[] = [{ from: 'client', to: 'dns', label: 'lookup', dashed: true, directed: true, flow: dnsActive, tone: dnsActive ? 'active' : undefined }];
      for (const s of servers) edges.push({ from: 'client', to: s, directed: true, flow: active === s, tone: active === s ? edgeTone : 'muted', dashed: active !== s });
      return [
        { type: 'graph', title: stateful ? 'Stateful servers keep sessions in memory' : 'Stateless servers: the token carries the identity', nodes, edges, width: 400, height: 200 },
        kvPanel('Client DNS cache', { 'api.example.com': cached ?? '(empty)', ttl: `${ttl} request${ttl > 1 ? 's' : ''}` }),
        logPanel('Requests', log),
      ];
    };
    r.step('dns', `${requests} requests to api.example.com; DNS has ${servers.length} A record${servers.length > 1 ? 's' : ''}`, view(null, 'default'), { servers: servers.length, ttl });
    for (let i = 0; i < requests; i++) {
      r.op();
      const ip = servers[Math.floor(i / ttl) % servers.length];
      const lookup = i % ttl === 0;
      cached = ip;
      r.step('dns', lookup ? `#${i + 1}: DNS lookup answers ${ip} (cached for ${ttl} request${ttl > 1 ? 's' : ''})` : `#${i + 1}: reuse cached answer ${ip}, no DNS traffic`, view(null, 'default', lookup), { request: i + 1, server: ip });
      if (i === 0) {
        loginServer = ip;
        if (stateful) sessions[ip].push('ann');
        statuses.push(200);
        log.push({ text: `#1 POST /login -> ${ip}: 200`, tone: 'found' });
        r.step(stateful ? 'remember' : 'login', stateful ? `${ip} stores the session in its own memory` : `${ip} returns a signed token; it stores nothing`, view(ip, 'found'), { status: 200 });
        continue;
      }
      let status = 200;
      if (stateful) {
        status = sessions[ip].includes('ann') ? 200 : 401;
        log.push({ text: `#${i + 1} GET /profile -> ${ip}: ${status}`, tone: status === 200 ? 'found' : 'error' });
        r.step('lookup', status === 200 ? `${ip} finds session "ann" in memory: 200` : `${ip} has no session for ann (login was on ${loginServer}): 401`, view(ip, status === 200 ? 'found' : 'error', false, status === 200 ? {} : { [ip]: 'error' }), { status });
      } else {
        log.push({ text: `#${i + 1} GET /profile -> ${ip}: 200`, tone: 'found' });
        r.step('verify', `${ip} verifies the token signature with the shared secret: 200`, view(ip, 'found'), { status });
      }
      statuses.push(status);
    }
    const bad = statuses.filter((s) => s === 401).length;
    r.step('dns', bad ? `${bad} of ${requests} requests failed: servers must not hold sessions in memory` : `All ${requests} requests succeeded on whichever server answered`, view(null, 'default'), { failures: bad });
    return { frames: r.frames, result: statuses };
  },
  reference(input) {
    const { servers, ttl, requests, stateful } = clean(input);
    const idx = (i: number) => Math.floor(i / ttl) % servers.length;
    return Array.from({ length: requests }, (_, i) => (i === 0 || !stateful || idx(i) === idx(0) ? 200 : 401));
  },
};

const unit: Unit = {
  id: 'hld-client-server',
  hook: 'Every system design answer starts here: how a request finds a server and why the app tier should be **stateless**. It is the foundation that makes load balancing and scaling out possible.',
  predict: {
    prompt: 'A user logs in on server A, which keeps the session in its own memory. DNS then sends the next request to server B. What happens?',
    options: ['B asks A for the session automatically', 'B returns 401 because it has never seen this session', 'B creates a new session for the user', 'The request is retried on A by the browser'],
    answer: 1,
    explain: 'Servers do not share memory. Unless sessions live in a shared store (or in a signed token the client sends), only server A can recognise the user.',
  },
  viz,
  deeper: {
    points: [
      'A request path is: DNS name lookup, TCP/TLS connection, HTTP request, server work, response. DNS answers are cached for their TTL.',
      'A **stateless** server keeps nothing between requests: all it needs arrives in the request (token, ids). Any replica can answer, so you can add or kill servers freely.',
      'State has to live somewhere: a database, a shared cache such as Redis, or in the client inside a signed token (JWT-style).',
      'Round-robin DNS spreads clients across servers but is coarse: it does not know about health or load, and cached answers keep clients pinned for the TTL.',
      '"Sticky sessions" (always the same server for a user) are a workaround that gives up easy failover.',
    ],
    complexity: { time: 'One DNS lookup per TTL, one round trip per request', space: 'O(1) per server for stateless apps' },
    pitfalls: ['Keeping login state in process memory', 'Assuming DNS changes take effect instantly', 'Forgetting that tokens need a shared secret or public key on every server'],
  },
  practice: {
    language: 'python',
    fnName: 'pick_servers',
    statement: 'A client resolves a name to one server at a time. `pick_servers(servers, count, ttl)` returns which server each of `count` requests goes to. The first request does a DNS lookup; the answer is reused for `ttl` requests, then the client looks up again. Each lookup returns the next server in the list, wrapping around.',
    signature: 'def pick_servers(servers, count, ttl):',
    solution: `def pick_servers(servers, count, ttl):
    picks = []
    answer = None
    lookups = 0
    for i in range(count):
        if answer is None or i @@%@@ ttl == 0:
            answer = servers[lookups @@%@@ len(servers)]
            lookups @@+=@@ 1
        picks.@@append@@(answer)
    return picks`,
    tests: [
      { args: [['a', 'b', 'c'], 6, 2], expected: ['a', 'a', 'b', 'b', 'c', 'c'], name: 'ttl 2' },
      { args: [['a', 'b'], 5, 1], expected: ['a', 'b', 'a', 'b', 'a'], name: 'new answer each time, wraps' },
      { args: [['a'], 3, 2], expected: ['a', 'a', 'a'], name: 'single server' },
      { args: [['a', 'b'], 4, 10], expected: ['a', 'a', 'a', 'a'], name: 'ttl longer than the session' },
      { args: [['a', 'b'], 0, 3], expected: [], name: 'no requests' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'pick_servers',
    statement: 'Operators moved to a new set of servers, but a client keeps hitting the first one for ever, even after the DNS TTL passed. Fix the resolver loop.',
    buggy: `def pick_servers(servers, count, ttl):
    picks = []
    answer = None
    lookups = 0
    for i in range(count):
        if answer is None:
            answer = servers[lookups % len(servers)]
            lookups += 1
        picks.append(answer)
    return picks`,
    fixed: `def pick_servers(servers, count, ttl):
    picks = []
    answer = None
    lookups = 0
    for i in range(count):
        if answer is None or i % ttl == 0:
            answer = servers[lookups % len(servers)]
            lookups += 1
        picks.append(answer)
    return picks`,
    tests: [
      { args: [['a', 'b', 'c'], 6, 2], expected: ['a', 'a', 'b', 'b', 'c', 'c'], name: 'refreshes after ttl' },
      { args: [['a', 'b'], 3, 1], expected: ['a', 'b', 'a'], name: 'ttl 1 looks up every time' },
      { args: [['a', 'b'], 2, 5], expected: ['a', 'a'], name: 'cache covers the short run' },
    ],
    bugType: 'cache never expires',
    hint: 'When is the cached answer thrown away? Compare with the TTL.',
    explanation: 'The cached answer is only refreshed when it is empty, so the TTL is ignored. Refresh when `i % ttl == 0` (the entry has been used for `ttl` requests).',
  },
  boss: {
    title: 'Stateless session tokens',
    statement:
      'Implement `TokenAuth(secret)` so that any server sharing the secret can verify a login without a session store. `issue(user, now, ttl)` returns the string `user:exp:sig` with `exp = now + ttl` and `sig = _sig(user, exp)`, where `_sig` hashes the text `user + ":" + str(exp) + ":" + secret` with `h = (h * 31 + ord(ch)) % 1000003` over its characters (start h = 0). `verify(token, now)` returns the user, or None if the token is malformed (not exactly 3 parts, non-numeric exp or sig), the signature does not match, or `now >= exp`.',
    language: 'python',
    fnName: 'TokenAuth',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class TokenAuth:
    # your code here
    pass
`,
    solution: `class TokenAuth:
    def __init__(self, secret):
        self.secret = secret

    def _sig(self, user, exp):
        text = user + ':' + str(exp) + ':' + self.secret
        h = 0
        for ch in text:
            h = (h * 31 + ord(ch)) % 1000003
        return h

    def issue(self, user, now, ttl):
        exp = now + ttl
        return user + ':' + str(exp) + ':' + str(self._sig(user, exp))

    def verify(self, token, now):
        parts = token.split(':')
        if len(parts) != 3:
            return None
        user, exp, sig = parts
        if not exp.isdigit() or not sig.isdigit():
            return None
        if int(sig) != self._sig(user, int(exp)):
            return None
        if now >= int(exp):
            return None
        return user`,
    tests: [
      { args: [ops('TokenAuth', 'issue', 'verify', 'verify'), [['k'], ['ann', 0, 10], ['ann:10:943665', 9], ['ann:10:943665', 10]]], expected: [null, 'ann:10:943665', 'ann', null], name: 'valid then expired' },
      { args: [ops('TokenAuth', 'verify'), [['k'], ['bob:10:943665', 1]]], expected: [null, null], name: 'tampered user' },
      { args: [ops('TokenAuth', 'verify'), [['k'], ['ann:99:943665', 1]]], expected: [null, null], name: 'tampered expiry' },
      { args: [ops('TokenAuth', 'verify'), [['other'], ['ann:10:943665', 1]]], expected: [null, null], name: 'signed with a different secret' },
      { args: [ops('TokenAuth', 'verify', 'verify'), [['k'], ['garbage', 0], ['ann:10', 0]]], expected: [null, null, null], name: 'malformed tokens' },
      { args: [ops('TokenAuth', 'issue'), [['k'], ['bob', 5, 20]]], expected: [null, 'bob:25:462070'], name: 'issue uses now + ttl' },
    ],
    hints: ['Write `_sig(user, exp)` first and reuse it in both `issue` and `verify`. Build the text with `user + ":" + str(exp) + ":" + secret`.', 'In verify: split on ":", check there are 3 parts and that exp and sig are digits, recompute the signature, compare, and only then check expiry.'],
    combines: ['be-jwt', 'be-sessions'],
  },
};

export default unit;
