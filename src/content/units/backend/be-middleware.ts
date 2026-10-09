import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, pipelinePanel, type PipeStage } from '@/content/lib/backend-orm';

const code = `
MIDDLEWARE = [logging_mw, auth_mw, timing_mw]            #@list

def auth_mw(get_response):
    def middleware(request):
        # request phase: runs top to bottom through the list   #@in
        if not request.headers.get("authorization"):
            return JsonResponse({"detail": "no token"}, status=401)   #@short
        response = get_response(request)                 #@call
        # response phase: runs bottom to top               #@out
        response["X-Out"] = response.headers.get("x-out", "") + "auth"   #@hdr
        return response                                  #@ret
    return middleware

def view(request):                                       #@view
    return JsonResponse({"ok": True})
`;

interface In {
  order: string[];
  block: string;
}

function simulate(order: string[], block: string): string[] {
  // reference-style summary used for the result: events in the order they happen
  const out: string[] = [];
  const entered: string[] = [];
  for (const n of order) {
    out.push(`${n}:in`);
    entered.push(n);
    if (n === block) {
      out.push(`${n}:stop`);
      entered.pop();
      break;
    }
  }
  if (!out.includes(`${block}:stop`)) out.push('view');
  for (const n of entered.reverse()) out.push(`${n}:out`);
  return out;
}

const viz: VizDef<In> = {
  id: 'middleware-order',
  title: 'Middleware: in order, out in reverse',
  code,
  language: 'python',
  inputs: [
    { key: 'order', label: 'MIDDLEWARE list (top to bottom)', kind: 'strings', default: ['logging', 'auth', 'timing'], maxItems: 5, help: 'Up to 5 unique names.' },
    { key: 'block', label: 'Middleware that returns early (or none)', kind: 'string', default: 'none', maxItems: 12 },
  ],
  presets: [
    { label: 'Auth blocks', input: { block: 'auth' } },
    { label: 'Outermost blocks', input: { block: 'logging' } },
    { label: 'Reordered', input: { order: ['timing', 'auth', 'logging'], block: 'none' } },
  ],
  run({ order, block }) {
    const names = [...new Set(order.map((s) => s.trim()).filter(Boolean))].slice(0, 5);
    if (!names.length) throw new Error('Add at least one middleware name');
    const blocker = names.includes(block) ? block : 'none';
    const r = new Recorder(code);
    const stages: PipeStage[] = [{ id: 'client', label: 'Client' }, ...names.map((n) => ({ id: n, label: n, sub: 'middleware' })), { id: 'view', label: 'View' }];
    const tones: Record<string, Tone> = {};
    const trail: Record<string, Tone> = {};
    const stack: string[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const header: string[] = [];
    const trace: string[] = [];
    let status: number | string = '…';
    const settle = () => {
      for (const s of stages) if (tones[s.id] === 'active') tones[s.id] = 'visited';
    };
    const panels = (flow?: { from: string; to: string; tone?: Tone }): Panel[] => [
      pipelinePanel(stages, { title: 'MIDDLEWARE list wraps the view like onion layers', tones, trail, flow, gap: 108 }),
      { type: 'list', title: 'Waiting on get_response()', orientation: 'vertical', endLabel: 'innermost', items: stack.map((s) => ({ id: s, label: s, tone: 'frontier' as Tone })), emptyText: 'nothing pending' },
      { type: 'log', title: 'Order of execution', lines: [...log] },
      { type: 'kv', entries: [{ k: 'status', v: status }, { k: 'X-Out header', v: header.join('') || '(not set yet)' }] },
    ];
    const vars = (at: string) => ({ at, status, 'X-Out': header.join('') });

    tones.client = 'active';
    r.step('list', `Request enters at the top of the list: ${names[0]}`, panels(), vars('client'));
    const entered: string[] = [];
    let blocked = false;
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      const prev = stages[i].id;
      settle();
      tones[n] = 'active';
      trail[`${prev}>${n}`] = 'visited';
      stack.push(n);
      trace.push(`${n}:in`);
      log.push({ text: `${n}: request phase` });
      r.step('in', `${n}: request phase runs (code before get_response)`, panels({ from: prev, to: n }), vars(n));
      if (n === blocker) {
        blocked = true;
        stack.pop();
        status = 401;
        tones[n] = 'error';
        trace.push(`${n}:stop`);
        log.push({ text: `${n}: returns 401 itself, get_response is never called`, tone: 'error' });
        r.step('short', `${n} returns 401 itself: nothing deeper runs`, panels(), vars(n));
        break;
      }
      entered.push(n);
    }
    if (!blocked) {
      const last = names[names.length - 1];
      settle();
      tones.view = 'active';
      trail[`${last}>view`] = 'visited';
      status = 200;
      trace.push('view');
      log.push({ text: 'view: returns 200' });
      r.step('view', 'The innermost layer calls the view: 200 OK', panels({ from: last, to: 'view' }), vars('view'));
    }
    // response phase: reverse order, only for the layers that called get_response()
    let from = blocked ? blocker : 'view';
    for (const n of [...entered].reverse()) {
      settle();
      tones[n] = 'active';
      const tone: Tone = blocked ? 'error' : 'found';
      trail[`${from}>${n}`] = tone;
      stack.pop();
      header.push(n);
      trace.push(`${n}:out`);
      log.push({ text: `${n}: response phase`, tone });
      r.step('out', `${n}: response phase runs (code after get_response)`, panels({ from, to: n, tone }), vars(n));
      from = n;
    }
    settle();
    tones.client = 'active';
    trail[`${from}>client`] = blocked ? 'error' : 'found';
    log.push({ text: `client receives ${status}`, tone: blocked ? 'error' : 'found' });
    r.step('ret', `Client gets ${status}. Header trail: ${header.join(' then ') || 'none'}`, panels({ from, to: 'client', tone: blocked ? 'error' : 'found' }), vars('client'));
    return { frames: r.frames, result: trace };
  },
  reference({ order, block }) {
    const names = [...new Set(order.map((s) => s.trim()).filter(Boolean))].slice(0, 5);
    return simulate(names, names.includes(block) ? block : 'none');
  },
};

const harness = `
from minidjango import models, connection, reset
from minidjango.http import App, path, JsonResponse
from minidjango.test import Client

LOG = []

def _view(request):
    LOG.append("view")
    return JsonResponse({"ok": True})

def run_stack(make, names):
    del LOG[:]
    app = App([path("x/", _view)], middleware=[make(n) for n in names])
    r = Client(app).get("/x/")
    return [LOG[:], r.headers.get("x-out"), r.status_code]

def request_id_mw(get_response):
    def middleware(request):
        request.request_id = "req-1"
        response = get_response(request)
        response["X-Request-ID"] = request.request_id
        return response
    return middleware

def logging_mw(get_response):
    def middleware(request):
        LOG.append("%s %s %s" % (request.request_id, request.method, request.path))
        return get_response(request)
    return middleware

def run_with(fn, url):
    del LOG[:]
    app = App([path("ping/", _view)], middleware=fn())
    r = Client(app).get(url)
    return [r.status_code, LOG[:], r.headers.get("x-request-id")]

def run_throttle(make, limit, clients):
    del LOG[:]
    app = App([path("x/", _view)], middleware=[make(limit)])
    c = Client(app)
    out = []
    for who in clients:
        r = c.get("/x/", None, {"X-Client": who})
        out.append([r.status_code, r.headers.get("x-remaining")])
    return [out, len(LOG)]
`;

const unit: Unit = {
  id: 'be-middleware',
  hook: 'Middleware order is a classic source of production bugs and interview questions: auth before logging or after? What runs when a layer returns early? The answer is always "in on the way in, reverse on the way out".',
  predict: {
    prompt: 'MIDDLEWARE = [A, B, C]. B returns a 401 response without calling `get_response`. Which "after get_response()" blocks run?',
    options: ['A, B and C, in reverse order', 'Only A', 'B, then A', 'None of them'],
    answer: 1,
    explain: 'C never ran. B returned early, so its own code after get_response never executes. The 401 response still travels back through A, whose after-block runs.',
  },
  viz,
  deeper: {
    points: [
      'Each middleware is a function that receives `get_response` (the next layer) and returns a function that handles one request.',
      'Code before `get_response(request)` runs on the way in, in list order; code after it runs on the way out, in reverse list order.',
      'Returning early short-circuits: deeper layers and the view are skipped, but layers above still see the response.',
      'Order matters when one layer needs another: a logger that reads `request.user` must come after the layer that sets it.',
    ],
    pitfalls: ['Mutating the response before calling get_response (there is no response yet)', 'Keeping per-request state on the factory closure instead of the request', 'Putting expensive checks first when a cheap rejection could come earlier'],
  },
  practice: {
    language: 'python',
    fnName: 'make_middleware',
    statement: '`make_middleware(name)` returns a middleware factory. It appends `"<name>:in"` to `LOG` on the way in, `"<name>:out"` on the way out, and appends the name to the `X-Out` response header (use `response.headers.get("x-out", "")`). `LOG` already exists.',
    signature: 'def make_middleware(name):',
    solution: `def make_middleware(name):
    def factory(get_response):
        def middleware(request):
            LOG.append(@@f"{name}:in"@@)
            response = @@get_response(request)@@
            LOG.append(@@f"{name}:out"@@)
            response["X-Out"] = @@response.headers.get("x-out", "") + name@@
            return @@response@@
        return middleware
    return factory`,
    harness,
    adapter: 'run_stack',
    tests: [
      { args: [['a']], expected: [['a:in', 'view', 'a:out'], 'a', 200], name: 'one layer' },
      { args: [['a', 'b']], expected: [['a:in', 'b:in', 'view', 'b:out', 'a:out'], 'ba', 200], name: 'two layers' },
      { args: [['a', 'b', 'c']], expected: [['a:in', 'b:in', 'c:in', 'view', 'c:out', 'b:out', 'a:out'], 'cba', 200], name: 'three layers' },
      { args: [[]], expected: [['view'], null, 200], name: 'no middleware' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'middleware_list',
    statement: 'Every request returns 500 since `logging_mw` was added. `logging_mw` prints `request.request_id`, which `request_id_mw` sets. Fix the list.',
    buggy: `def middleware_list():
    return [logging_mw, request_id_mw]`,
    fixed: `def middleware_list():
    return [request_id_mw, logging_mw]`,
    harness,
    adapter: 'run_with',
    tests: [
      { args: ['/ping/'], expected: [200, ['req-1 GET /ping/', 'view'], 'req-1'], name: 'ping works' },
      { args: ['/nope/'], expected: [404, ['req-1 GET /nope/'], 'req-1'], name: '404 is logged too' },
      { args: ['/other/'], expected: [404, ['req-1 GET /other/'], 'req-1'], name: 'another 404' },
    ],
    bugType: 'wrong middleware order',
    hint: 'Which layer sees the request first, the first or the last item in the list? Who needs `request_id` already set?',
    explanation: 'Layers run top to bottom on the way in. `logging_mw` was first, so it read `request.request_id` before `request_id_mw` had set it (AttributeError, a 500). Put the layer that provides data before the layer that uses it.',
  },
  boss: {
    title: 'Per-client throttle',
    statement: '`make_throttle(limit)` returns a middleware factory. Each client (header `x-client`, default "anon") may make `limit` requests. After that, return a 429 JsonResponse without calling the view. Successful responses get an `X-Remaining` header with the number of requests left, as a string. Counts live in the factory, not in module globals.',
    language: 'python',
    fnName: 'make_throttle',
    starter: `def make_throttle(limit):
    # your code here
    pass
`,
    solution: `def make_throttle(limit):
    def factory(get_response):
        used = {}
        def middleware(request):
            who = request.headers.get("x-client", "anon")
            if used.get(who, 0) >= limit:
                return JsonResponse({"detail": "Too many requests"}, status=429)
            used[who] = used.get(who, 0) + 1
            response = get_response(request)
            response["X-Remaining"] = str(limit - used[who])
            return response
        return middleware
    return factory`,
    harness,
    adapter: 'run_throttle',
    tests: [
      { args: [2, ['a', 'a', 'a', 'b']], expected: [[[200, '1'], [200, '0'], [429, null], [200, '1']], 3], name: 'limit is per client' },
      { args: [1, ['a', 'a']], expected: [[[200, '0'], [429, null]], 1], name: 'limit of one' },
      { args: [3, []], expected: [[], 0], name: 'no requests' },
      { args: [2, ['a', 'b', 'a', 'b', 'a']], expected: [[[200, '1'], [200, '1'], [200, '0'], [200, '0'], [429, null]], 4], name: 'interleaved clients' },
      { args: [0, ['a']], expected: [[[429, null]], 0], name: 'limit zero blocks everyone' },
    ],
    hints: ['Create the counts dict inside `factory` (once per app), not inside `middleware` (once per request).', 'Check the count first and return the 429 early; only then increment, call `get_response`, and set the header on its result.'],
    combines: ['be-middleware', 'be-request-lifecycle'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
