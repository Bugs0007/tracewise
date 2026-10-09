import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def fits(template, path):
    a, b = template.split("/"), path.split("/")
    return len(a) == len(b) and all(x.startswith("{") or x == y for x, y in zip(a, b))

def handle(req, stages, routes, state, rate, burst):
    if req["stage"] not in stages:
        return 403                                              #@stage
    route = None
    for r in routes:                                            #@scan
        if r["method"] == req["method"] and fits(r["path"], req["path"]):
            route = r
            break
    if route is None:
        return 404                                              #@route
    elapsed = req["t"] - state["last"]
    state["tokens"] = min(burst, state["tokens"] + elapsed * rate)   #@refill
    state["last"] = req["t"]
    if state["tokens"] < 1:
        return 429                                              #@throttle
    state["tokens"] -= 1
    if route["auth"] and req["token"] != "ok":
        return 401 if req["token"] == "none" else 403           #@auth
    return 200                                                  #@ok
`;

interface In {
  routes: string[];
  stages: string[];
  limits: number[];
  requests: string[];
}

interface Route {
  method: string;
  path: string;
  auth: boolean;
  target: string;
  text: string;
}
interface Req {
  t: number;
  method: string;
  stage: string;
  path: string;
  token: string;
  text: string;
}

function parseRoute(s: string): Route {
  const m = s.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*?)\s*(auth)?\s*>\s*([\w-]+)$/);
  if (!m) throw new Error(`Route "${s}" should look like: GET /users/{id} > users-fn  or  POST /orders auth > orders-fn`);
  return { method: m[1], path: m[2], auth: !!m[3], target: m[4], text: s.trim() };
}
function parseReq(s: string): Req {
  const m = s.trim().match(/^(\d+)\s+(GET|POST|PUT|PATCH|DELETE)\s+([\w-]+)(\/\S*)\s+(ok|bad|none)$/);
  if (!m) throw new Error(`Request "${s}" should look like: 0 GET prod/users/7 none  (time method stage/path token: ok, bad or none)`);
  return { t: Number(m[1]), method: m[2], stage: m[3], path: m[4], token: m[5], text: s.trim() };
}

function fits(template: string, path: string): boolean {
  const a = template.split('/');
  const b = path.split('/');
  return a.length === b.length && a.every((x, i) => x.startsWith('{') || x === b[i]);
}

function prep(i: In) {
  const routes = i.routes.map(parseRoute);
  const reqs = i.requests.map(parseReq);
  if (!routes.length) throw new Error('Add at least one route');
  if (!reqs.length) throw new Error('Add at least one request');
  if (i.limits.length !== 2) throw new Error('Limits are two numbers: steady rate (requests/second) and burst size');
  const rate = Math.round(i.limits[0]);
  const burst = Math.round(i.limits[1]);
  if (!(rate >= 0 && burst >= 1)) throw new Error('Rate must be 0 or more and burst at least 1');
  for (let k = 1; k < reqs.length; k++) if (reqs[k].t < reqs[k - 1].t) throw new Error('Request times must not go backwards');
  return { routes, reqs, rate, burst, stages: i.stages };
}

const MSG: Record<number, string> = { 200: 'OK', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests' };

const viz: VizDef<In> = {
  id: 'aws-api-gateway',
  title: 'API Gateway: stages, throttling and authorizers',
  code,
  language: 'python',
  inputs: [
    { key: 'routes', label: 'Routes (METHOD /path [auth] > target)', kind: 'strings', default: ['GET /users/{id} > users-fn', 'POST /orders auth > orders-fn', 'GET /health > health-fn'], maxItems: 3, help: '{id} matches one path segment. "auth" means the route has an authorizer.' },
    { key: 'stages', label: 'Deployed stages', kind: 'strings', default: ['prod'], maxItems: 3 },
    { key: 'limits', label: 'Throttle: [rate per second, burst size]', kind: 'numbers', default: [1, 3], maxItems: 2 },
    { key: 'requests', label: 'Requests (time method stage/path token)', kind: 'strings', default: ['0 GET prod/users/7 none', '0 POST prod/orders ok', '0 POST prod/orders none', '0 GET prod/health none', '2 GET dev/users/1 none', '3 GET prod/users/9 none'], maxItems: 6, help: 'token is ok, bad or none' },
  ],
  presets: [
    { label: 'Throttle, auth and stage errors', input: {} },
    { label: 'Burst drains, then slow refill', input: { limits: [1, 2], requests: ['0 GET prod/health none', '0 GET prod/health none', '0 GET prod/health none', '1 GET prod/health none', '1 GET prod/health none', '10 GET prod/health none'] } },
    { label: 'Unknown route and bad token', input: { requests: ['0 GET prod/nope none', '0 POST prod/orders bad', '1 DELETE prod/users/3 ok', '1 POST prod/orders ok'] } },
    { label: 'Deploy a second stage', input: { stages: ['prod', 'dev'], requests: ['0 GET dev/users/1 none', '0 GET staging/users/1 none', '1 GET prod/users/1 none'] } },
  ],
  run(input) {
    const { routes, reqs, rate, burst, stages } = prep(input);
    const height = Math.max(150, routes.length * 52 + 30);
    const nodes: ArchNode[] = [
      { id: 'client', label: 'Client', x: 50, y: height / 2, shape: 'actor' },
      { id: 'gw', label: 'API Gateway', x: 215, y: height / 2 },
      { id: 'auth', label: 'Authorizer', x: 215, y: 25, shape: 'pill', w: 100, h: 28 },
    ];
    const edges: ArchEdge[] = [{ from: 'client', to: 'gw' }, { from: 'gw', to: 'auth', dashed: true }];
    routes.forEach((rt, i) => {
      nodes.push({ id: `t${i}`, label: rt.target, x: 470, y: 35 + i * 52, w: 120 });
      edges.push({ from: 'gw', to: `t${i}`, label: `${rt.method} ${rt.path}` });
    });
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const state = { tokens: burst, last: 0 };
    const history: [number, number][] = [[0, burst]];
    const out: number[] = [];
    const view = (tones: Record<string, Tone>, flow: string | null, rowTones: Record<number, Tone> = {}): Panel[] => [
      arch(`Stages: ${stages.join(', ') || '(none)'}`, 640, height, nodes, edges, { tones, flow, badges: { gw: `${state.tokens}/${burst} tokens` } }),
      listPanel('Routes', routes.map((x) => x.text), rowTones),
      { type: 'chart', title: `Token bucket (refill ${rate}/s, burst ${burst})`, series: [{ label: 'tokens', points: history.map((p) => [p[0], p[1]] as [number, number]), tone: 'active' }], xLabel: 'request', yLabel: 'tokens', kind: 'line' },
      logPanel('Responses', log),
    ];
    frame(r, 'stage', `${routes.length} routes, stages [${stages.join(', ')}], throttle ${rate}/s with burst ${burst}`, view({}, null), { tokens: state.tokens });
    reqs.forEach((q, n) => {
      r.op();
      const finish = (code: number, at: string, why: string, tones: Record<string, Tone>, flow: string | null, rows: Record<number, Tone> = {}) => {
        out.push(code);
        log.push({ text: `${q.text} -> ${code} ${MSG[code]}`, tone: code === 200 ? 'found' : 'error' });
        history.push([n + 1, state.tokens]);
        frame(r, at, `${code} ${MSG[code]}: ${why}`, view(tones, flow, rows), { status: code, tokens: state.tokens });
      };
      frame(r, 'stage', `t=${q.t}s: ${q.method} /${q.stage}${q.path} arrives (token: ${q.token})`, view({ client: 'active', gw: 'compare' }, 'client>gw'), { t: q.t, stage: q.stage });
      if (!stages.includes(q.stage)) return finish(403, 'stage', `stage "${q.stage}" is not deployed`, { gw: 'error' }, null);
      const idx = routes.findIndex((x) => x.method === q.method && fits(x.path, q.path));
      if (idx < 0) return finish(404, 'route', `no route matches ${q.method} ${q.path}`, { gw: 'error' }, null);
      const rt = routes[idx];
      const elapsed = q.t - state.last;
      state.tokens = Math.min(burst, state.tokens + elapsed * rate);
      state.last = q.t;
      if (state.tokens < 1) return finish(429, 'throttle', `bucket empty after ${elapsed}s of refill: request rejected`, { gw: 'error' }, null, { [idx]: 'compare' });
      state.tokens -= 1;
      frame(r, 'refill', `Route ${idx + 1} matches. Refill +${elapsed * rate}, take 1 token: ${state.tokens} left`, view({ gw: 'compare', [`t${idx}`]: 'compare' }, null, { [idx]: 'compare' }), { tokens: state.tokens });
      if (rt.auth && q.token !== 'ok') return finish(q.token === 'none' ? 401 : 403, 'auth', q.token === 'none' ? 'authorizer found no token' : 'authorizer rejected the token', { gw: 'compare', auth: 'error' }, 'gw>auth', { [idx]: 'error' });
      finish(200, 'ok', `${rt.auth ? 'authorized, ' : ''}forwarded to ${rt.target}`, { gw: 'found', [`t${idx}`]: 'found', ...(rt.auth ? { auth: 'found' } : {}) }, `gw>t${idx}`, { [idx]: 'found' });
    });
    const okN = out.filter((c) => c === 200).length;
    frame(r, 'ok', `${okN} of ${out.length} requests reached a backend`, view({ gw: 'done' }, null), { ok: okN });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { routes, reqs, rate, burst, stages } = prep(input);
    // Independent formulation: route templates as regular expressions, bucket tracked as "credit" with a clock.
    const res = routes.map((x) => ({ x, re: new RegExp('^' + x.path.replace(/\{[^}]*\}/g, '[^/]*') + '$') }));
    let credit = burst;
    let clock = 0;
    return reqs.map((q) => {
      if (!stages.includes(q.stage)) return 403;
      const hit = res.find((e) => e.x.method === q.method && e.re.test(q.path));
      if (!hit) return 404;
      credit = Math.min(burst, credit + (q.t - clock) * rate);
      clock = q.t;
      if (credit < 1) return 429;
      credit -= 1;
      if (hit.x.auth && q.token !== 'ok') return q.token === 'none' ? 401 : 403;
      return 200;
    });
  },
};

const unit: Unit = {
  id: 'aws-api-gateway',
  hook: 'API Gateway is the front door for serverless APIs. Interview questions are about what answers a request before your code ever runs: stage, route, throttling and authorizer, each with its own status code.',
  predict: {
    prompt: 'A route has a Lambda authorizer. A client sends 10,000 requests with no token while the stage is already throttled. Which status do the rejected requests mostly get, and does the authorizer run?',
    options: ['401 from the authorizer for every request', '429 for requests over the limit, without invoking the authorizer', '403 for all of them', '500 because the backend is overloaded'],
    answer: 1,
    explain: 'Throttling is applied at the gateway before the request is processed further. Requests beyond the rate and burst get 429 Too Many Requests; only requests that pass the throttle reach the authorizer, which then answers 401 or 403.',
  },
  viz,
  deeper: {
    points: [
      'An API is a set of **routes** (method plus path template) deployed to **stages** such as `dev` and `prod`; each stage has its own URL, variables, throttling and logging.',
      '**Throttling** is a token bucket: a steady **rate** per second and a **burst** capacity. Over the limit means **429**; clients should retry with exponential backoff and jitter.',
      '**Authorizers** decide who may call: IAM, Cognito user pools, or a Lambda authorizer that returns a policy (cacheable per token). Missing credentials typically give 401, denied ones 403.',
      'Integrations: Lambda proxy, HTTP backends, AWS services. REST APIs have more features (usage plans, API keys, request validation); HTTP APIs are cheaper and faster.',
      'Responses can be cached per stage, and a **usage plan** with API keys gives each customer their own quota.',
    ],
    pitfalls: ['Treating 429 as a server fault instead of backing off', 'Caching an authorizer result for too long after permissions change', 'Calling an undeployed stage: deploying the API is a separate step'],
  },
  practice: {
    language: 'python',
    fnName: 'allow_requests',
    statement: 'A token bucket starts full with `burst` tokens and gains `rate` tokens per second, capped at `burst`. For each request time in `times` (non-decreasing, whole seconds) refill first, then allow it (True) and spend one token if at least one is available; otherwise False.',
    signature: 'def allow_requests(rate, burst, times):',
    solution: `def allow_requests(rate, burst, times):
    tokens = burst
    last = 0
    out = []
    for t in times:
        tokens = @@min(burst, tokens + (t - last) * rate)@@
        last = t
        if tokens @@>=@@ 1:
            tokens -= 1
            out.append(True)
        else:
            out.append(@@False@@)
    return out`,
    tests: [
      { args: [1, 3, [0, 0, 0, 0]], expected: [true, true, true, false], name: 'burst then empty' },
      { args: [1, 2, [0, 0, 0, 1, 2]], expected: [true, true, false, true, true], name: 'one token per second' },
      { args: [2, 3, [0, 0, 0, 100, 100, 100, 100]], expected: [true, true, true, true, true, true, false], name: 'refill is capped at the burst' },
      { args: [0, 2, [0, 5, 9]], expected: [true, true, false], name: 'zero rate never refills' },
      { args: [1, 1, []], expected: [], name: 'no requests' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'allow_requests',
    statement: 'After a long quiet period a client is allowed far more than `burst` requests in a row. Fix `allow_requests`.',
    buggy: `def allow_requests(rate, burst, times):
    tokens = burst
    last = 0
    out = []
    for t in times:
        tokens = tokens + (t - last) * rate
        last = t
        if tokens >= 1:
            tokens -= 1
            out.append(True)
        else:
            out.append(False)
    return out`,
    fixed: `def allow_requests(rate, burst, times):
    tokens = burst
    last = 0
    out = []
    for t in times:
        tokens = min(burst, tokens + (t - last) * rate)
        last = t
        if tokens >= 1:
            tokens -= 1
            out.append(True)
        else:
            out.append(False)
    return out`,
    tests: [
      { args: [2, 3, [0, 0, 0, 100, 100, 100, 100]], expected: [true, true, true, true, true, true, false], name: 'long idle then burst' },
      { args: [1, 3, [0, 0, 0, 0]], expected: [true, true, true, false], name: 'plain burst' },
      { args: [1, 2, [0, 0, 0, 1]], expected: [true, true, false, true], name: 'refill after drain' },
    ],
    bugType: 'unbounded refill',
    hint: 'What stops the bucket from holding more than `burst` tokens after a long gap?',
    explanation: 'Tokens accumulate without a ceiling, so 100 idle seconds buy hundreds of requests. A bucket is capped at its burst size: `min(burst, tokens + elapsed * rate)`.',
  },
  boss: {
    title: 'Gateway request pipeline',
    statement: 'Write `handle_all(stages, routes, rate, burst, requests)`. Routes are `[method, template, needs_auth]`; a `{name}` segment in a template matches exactly one path segment. Requests are `[t, method, stage, path, token]` with token `"ok"`, `"bad"` or `"none"`. For each request in order: unknown stage gives 403; no route gives 404; otherwise refill the shared token bucket (starts with `burst` tokens, last refill time 0, gains `rate` per second, capped at `burst`) and if fewer than 1 token remains give 429; otherwise spend a token, and if the route needs auth and the token is not "ok" give 401 for "none" or 403 for "bad"; else 200. Return the list of status codes. Rejections for stage or route do not touch the bucket.',
    language: 'python',
    fnName: 'handle_all',
    starter: `def handle_all(stages, routes, rate, burst, requests):
    pass
`,
    solution: `def handle_all(stages, routes, rate, burst, requests):
    def fits(template, path):
        a, b = template.split("/"), path.split("/")
        return len(a) == len(b) and all(x.startswith("{") or x == y for x, y in zip(a, b))

    tokens, last = burst, 0
    out = []
    for t, method, stage, path, token in requests:
        if stage not in stages:
            out.append(403)
            continue
        route = None
        for m, template, auth in routes:
            if m == method and fits(template, path):
                route = (m, template, auth)
                break
        if route is None:
            out.append(404)
            continue
        tokens = min(burst, tokens + (t - last) * rate)
        last = t
        if tokens < 1:
            out.append(429)
            continue
        tokens -= 1
        if route[2] and token != "ok":
            out.append(401 if token == "none" else 403)
        else:
            out.append(200)
    return out`,
    tests: [
      { args: [['prod'], [['GET', '/users/{id}', false], ['POST', '/orders', true]], 1, 3, [[0, 'GET', 'prod', '/users/7', 'none'], [0, 'POST', 'prod', '/orders', 'ok'], [0, 'POST', 'prod', '/orders', 'none'], [0, 'GET', 'prod', '/users/1', 'none'], [3, 'GET', 'prod', '/users/9', 'none']]], expected: [200, 200, 401, 429, 200], name: 'mixed outcomes' },
      { args: [['prod'], [['GET', '/a', false]], 1, 1, [[0, 'GET', 'dev', '/a', 'none'], [0, 'GET', 'prod', '/b', 'none'], [0, 'GET', 'prod', '/a', 'none']]], expected: [403, 404, 200], name: 'stage and route errors do not use tokens' },
      { args: [['prod'], [['POST', '/o', true]], 1, 2, [[0, 'POST', 'prod', '/o', 'bad'], [0, 'POST', 'prod', '/o', 'ok'], [0, 'POST', 'prod', '/o', 'ok'], [1, 'POST', 'prod', '/o', 'ok']]], expected: [403, 200, 429, 200], name: 'rejected auth still spends the token' },
      { args: [['prod'], [['GET', '/u/{id}/p/{pid}', false]], 5, 2, [[0, 'GET', 'prod', '/u/1/p/2', 'none'], [0, 'GET', 'prod', '/u/1/p', 'none'], [60, 'GET', 'prod', '/u/3/p/4', 'none']]], expected: [200, 404, 200], name: 'two path parameters and segment count' },
      { args: [['prod'], [['GET', '/a', false]], 0, 1, [[0, 'GET', 'prod', '/a', 'none'], [100, 'GET', 'prod', '/a', 'none']]], expected: [200, 429], name: 'zero rate never refills' },
    ],
    hints: ['Handle the cheap checks first (stage, then route) and `continue` so they never touch the bucket. A template matches when both split on "/" have the same length and each segment is a `{param}` or equal.', 'Refill with `min(burst, tokens + (t - last) * rate)` and update `last`; if `tokens < 1` answer 429, otherwise subtract one and only then look at the authorizer.'],
    combines: ['aws-lambda', 'aws-iam'],
  },
  quiz: [
    {
      prompt: 'Which response should a well-behaved client treat as "slow down and retry later"?',
      options: ['401', '403', '404', '429'],
      answer: 3,
      explain: '429 means the throttle rejected the call. Retry with exponential backoff and jitter; 401, 403 and 404 will not be fixed by waiting.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
