import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq } from '@/content/lib/backend-db-auth';
import { clip } from '@/content/lib/finish-m2m3';

const code = `
def browser_fetch(page, method, is_json, credentials, allowed):      #@fetch
    if page == API_ORIGIN:
        return send(method)                                          #@same
    if method not in ("GET", "HEAD", "POST") or is_json:             #@need
        pre = send("OPTIONS", origin=page)                           #@pre
        if not browser_accepts(pre, page, credentials):              #@prefail
            raise TypeError("blocked by CORS: preflight failed")
    response = send(method, origin=page)                             #@send
    if not browser_accepts(response, page, credentials):             #@respcheck
        raise TypeError("blocked by CORS: JS may not read it")       #@blocked
    return response                                                  #@readable
`;

const API = 'https://api.example';
const PAGES = ['https://app.example', 'https://evil.example', API];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const SIMPLE = ['GET', 'HEAD', 'POST'];

/** What a server with an allow-list answers. Mirrors the practice solution. */
function corsHeaders(origin: string | null, method: string, allowed: string[]): Record<string, string> {
  let h: Record<string, string>;
  if (allowed.includes('*')) h = { 'Access-Control-Allow-Origin': '*' };
  else if (origin !== null && allowed.includes(origin)) h = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' };
  else return {};
  if (method === 'OPTIONS') {
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

interface In {
  page: string;
  method: string;
  body: string;
  credentials: string;
  allowed: string[];
}

interface Out {
  preflight: boolean;
  sent: boolean;
  readable: boolean;
}

/** The check a browser performs on a CORS response; returns the reason it fails, or null. */
function browserCheck(h: Record<string, string>, page: string, credentials: boolean, method: string, json: boolean, pre: boolean): string | null {
  const acao = h['Access-Control-Allow-Origin'];
  if (acao === undefined) return 'no Access-Control-Allow-Origin header';
  if (acao !== '*' && acao !== page) return `origin ${page} is not the allowed one`;
  if (credentials && (acao === '*' || h['Access-Control-Allow-Credentials'] !== 'true')) return 'cookies need a named origin and Allow-Credentials';
  if (pre) {
    if (!SIMPLE.includes(method) && !(h['Access-Control-Allow-Methods'] ?? '').split(', ').includes(method)) return `${method} not in Allow-Methods`;
    if (json && !(h['Access-Control-Allow-Headers'] ?? '').toLowerCase().includes('content-type')) return 'Content-Type not in Allow-Headers';
  }
  return null;
}

const viz: VizDef<In> = {
  id: 'be-cors',
  title: 'A cross-origin request, preflight and all',
  code,
  language: 'python',
  inputs: [
    { key: 'page', label: 'Page origin (where the JS runs)', kind: 'select', options: PAGES, default: PAGES[0] },
    { key: 'method', label: 'Method', kind: 'select', options: METHODS, default: 'PUT' },
    { key: 'body', label: 'Body type', kind: 'select', options: ['form', 'json'], default: 'json' },
    { key: 'credentials', label: 'Send cookies (credentials)', kind: 'select', options: ['omit', 'include'], default: 'omit' },
    { key: 'allowed', label: 'Server allow-list', kind: 'strings', default: ['https://app.example'], maxItems: 4, help: 'Use * to allow every origin.' },
  ],
  presets: [
    { label: 'JSON PUT needs a preflight', input: { page: PAGES[0], method: 'PUT', body: 'json' } },
    { label: 'Simple GET, no preflight', input: { page: PAGES[0], method: 'GET', body: 'form' } },
    { label: 'Unknown origin', input: { page: PAGES[1], method: 'GET', body: 'form' } },
    { label: 'Wildcard with cookies', input: { page: PAGES[0], method: 'GET', body: 'form', credentials: 'include', allowed: ['*'] } },
    { label: 'Same origin', input: { page: API, method: 'DELETE', body: 'json' } },
  ],
  run({ page, method, body, credentials, allowed }) {
    if (!PAGES.includes(page)) throw new Error('Page must be one of ' + PAGES.join(', '));
    if (!METHODS.includes(method)) throw new Error('Method must be one of ' + METHODS.join(', '));
    const json = body === 'json';
    const cred = credentials === 'include';
    const r = new Recorder(code);
    const seq = new Seq(['Browser', 'API server'], `${page} calls ${API}`);
    let lastHeaders: Record<string, string> = {};
    const kv = (): KVPanel => ({
      type: 'kv',
      title: 'Response headers the browser sees',
      entries: Object.keys(lastHeaders).length ? Object.entries(lastHeaders).map(([k, v]) => ({ k, v, tone: 'compare' as Tone })) : [{ k: '(none)', v: 'no CORS headers', tone: 'muted' as Tone }],
    });
    const view = (): Panel[] => [seq.panel(), kv()];
    const out: Out = { preflight: false, sent: false, readable: false };

    r.step('fetch', clip(`JS on ${page} calls fetch(${method}, ${body}, credentials ${credentials})`), view(), { page, method });
    if (page === API) {
      seq.send('Browser', 'API server', `${method} /notes`);
      out.sent = out.readable = true;
      r.step('same', 'Same origin: no CORS involved, the browser sends it and JS reads the reply', view(), { sameOrigin: true });
      seq.send('API server', 'Browser', '200 OK (readable)', 'found', true);
      r.step('readable', 'Result: readable. The same-origin policy only restricts OTHER origins', view(), { ...out });
      return { frames: r.frames, result: out };
    }
    r.op();
    const pre = !SIMPLE.includes(method) || json;
    r.step('need', clip(pre ? `${json ? 'A JSON body' : method} is not a "simple" request: the browser must ask first` : 'GET/POST with a form body is "simple": sent straight away'), view(), { preflight: pre });
    if (pre) {
      out.preflight = true;
      seq.send('Browser', 'API server', `OPTIONS /notes  Origin: ${page}`);
      seq.send('Browser', 'API server', `Access-Control-Request-Method: ${method}`, undefined, true);
      r.step('pre', 'Preflight: OPTIONS asks "would you accept this method and headers from my origin?"', view(), { sent: 'OPTIONS' });
      lastHeaders = corsHeaders(page, 'OPTIONS', allowed);
      const has = Object.keys(lastHeaders).length > 0;
      seq.send('API server', 'Browser', has ? '204 + Allow-* headers' : '204 with no CORS headers', has ? 'done' : 'error', true);
      r.step('pre', 'The server answers the preflight (it never runs your handler)', view(), { headers: Object.keys(lastHeaders).length });
      const why = browserCheck(lastHeaders, page, cred, method, json, true);
      r.op();
      if (why) {
        r.step('prefail', clip('Preflight rejected: ' + why), view(), { blocked: true });
        seq.send('Browser', 'Browser', 'fetch() rejects: real request never sent', 'error');
        r.step('prefail', 'Result: the actual request was NEVER sent. JS only sees a TypeError', view(), { ...out });
        return { frames: r.frames, result: out };
      }
      r.step('prefail', 'Preflight passes: origin, method and headers are all allowed', view(), { preflight: 'ok' });
    }
    seq.send('Browser', 'API server', `${method} /notes  Origin: ${page}${cred ? '  Cookie: sid' : ''}`);
    out.sent = true;
    r.step('send', clip(`Real request sent${cred ? ' with cookies' : ''}; the server runs its handler`), view(), { sent: method });
    lastHeaders = corsHeaders(page, method, allowed);
    const has = Object.keys(lastHeaders).length > 0;
    seq.send('API server', 'Browser', has ? '200 + Access-Control-Allow-Origin' : '200 (no CORS headers)', has ? 'done' : 'error', true);
    r.step('respcheck', 'The response arrives; the browser inspects its CORS headers before JS may read it', view(), { status: 200 });
    r.op();
    const why = browserCheck(lastHeaders, page, cred, method, json, false);
    if (why) {
      seq.send('Browser', 'Browser', 'fetch() rejects: response hidden from JS', 'error');
      r.step('blocked', clip('Blocked: ' + why + '. The server already did the work!'), view(), { ...out });
    } else {
      out.readable = true;
      r.step('readable', 'Allowed: Access-Control-Allow-Origin matches, so JS can read the response', view(), { ...out });
    }
    return { frames: r.frames, result: out };
  },
  reference({ page, method, body, credentials, allowed }) {
    if (page === API) return { preflight: false, sent: true, readable: true };
    const pre = !SIMPLE.includes(method) || body === 'json';
    const named = allowed.includes(page);
    const star = allowed.includes('*');
    const ok = (named || star) && (credentials !== 'include' || (named && !star));
    return { preflight: pre, sent: pre ? ok : true, readable: ok };
  },
};

const unit: Unit = {
  id: 'be-cors',
  hook: 'CORS is the error every full-stack developer meets in week one and almost nobody can explain. Knowing that the BROWSER enforces it, why the preflight exists and why a wildcard cannot be combined with cookies is a strong signal.',
  predict: {
    prompt: 'A page on app.example calls your API on api.example without the right CORS headers. The call is a simple POST. Does the request reach your server?',
    options: ['No: the browser blocks it before sending', 'Yes: the server handles it, but the browser hides the response from JavaScript', 'Only if the server is on the same IP address', 'Only after a preflight succeeds'],
    answer: 1,
    explain: 'For a simple request the browser sends first and checks the response headers afterwards. Your server may already have changed data. CORS protects the response from being read, not the server from being called. That is why CORS is not authentication.',
  },
  simulationNote: 'A small model of browser CORS rules for one API. Real browsers also cache preflights, follow redirects and handle more header types.',
  viz,
  deeper: {
    points: [
      'The same-origin policy (scheme + host + port) stops a page from READING responses from another origin. CORS is the opt-in that relaxes it, using headers the server sends.',
      'A "simple" request (GET/HEAD/POST with form-like content types and no custom headers) is sent immediately. Anything else triggers an OPTIONS preflight first.',
      'The server answers the preflight with Access-Control-Allow-Origin, -Methods, -Headers and optionally -Max-Age, so the browser can cache the answer.',
      'Cookies only travel on cross-origin calls when the client sets credentials: "include" and the server replies with a specific origin plus Access-Control-Allow-Credentials: true. A wildcard is rejected.',
      'If the allowed origin varies by request, add Vary: Origin so caches do not serve one origin\'s answer to another.',
      'CORS is enforced by browsers only. curl or a server-side script ignores it entirely, so it is not an access-control mechanism.',
    ],
    pitfalls: ['Reflecting whatever Origin arrives with credentials allowed (any site can then read private data)', 'Forgetting that the preflight carries no credentials, so an auth middleware can break it', 'Treating a CORS error as a server bug when the request actually succeeded'],
  },
  practice: {
    language: 'python',
    fnName: 'cors_headers',
    statement: 'Write `cors_headers(origin, method, allowed)` returning the response headers. If `"*"` is in `allowed`, send only `Access-Control-Allow-Origin: *`. If `origin` is in `allowed`, echo it and add `Vary: Origin` and `Access-Control-Allow-Credentials: true`. Otherwise return `{}`. For method `OPTIONS` also add `Access-Control-Allow-Methods: GET, POST, PUT, DELETE`, `Access-Control-Allow-Headers: Content-Type, Authorization` and `Access-Control-Max-Age: 600`.',
    signature: 'def cors_headers(origin, method, allowed):',
    solution: `def cors_headers(origin, method, allowed):
    if @@"*" in allowed@@:
        headers = {"Access-Control-Allow-Origin": "*"}
    elif @@origin in allowed@@:
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Vary": @@"Origin"@@,
            "Access-Control-Allow-Credentials": "true",
        }
    else:
        return {}
    if @@method == "OPTIONS"@@:
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE"
        headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        headers["Access-Control-Max-Age"] = "600"
    return headers`,
    tests: [
      { args: ['https://app.example', 'GET', ['https://app.example']], expected: { 'Access-Control-Allow-Origin': 'https://app.example', Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' }, name: 'allowed origin, simple request' },
      { args: ['https://evil.example', 'GET', ['https://app.example']], expected: {}, name: 'unknown origin gets nothing' },
      { args: [null, 'GET', ['https://app.example']], expected: {}, name: 'no Origin header' },
      { args: ['https://app.example', 'OPTIONS', ['https://app.example']], expected: { 'Access-Control-Allow-Origin': 'https://app.example', Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' }, name: 'preflight adds Allow-* headers' },
      { args: ['https://x.example', 'GET', ['*']], expected: { 'Access-Control-Allow-Origin': '*' }, name: 'wildcard: no credentials header' },
      { args: ['https://x.example', 'OPTIONS', ['*']], expected: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' }, name: 'wildcard preflight' },
      { args: ['https://b.example', 'DELETE', ['https://a.example', 'https://b.example']], expected: { 'Access-Control-Allow-Origin': 'https://b.example', Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' }, name: 'echoes the matching one' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'cors_headers',
    statement: 'Any website can read responses from this API, including ones that are not on the allow-list. Fix `cors_headers`.',
    buggy: `def cors_headers(origin, method, allowed):
    if "*" in allowed:
        headers = {"Access-Control-Allow-Origin": "*"}
    elif origin:
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
            "Access-Control-Allow-Credentials": "true",
        }
    else:
        return {}
    if method == "OPTIONS":
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE"
        headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return headers`,
    fixed: `def cors_headers(origin, method, allowed):
    if "*" in allowed:
        headers = {"Access-Control-Allow-Origin": "*"}
    elif origin in allowed:
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
            "Access-Control-Allow-Credentials": "true",
        }
    else:
        return {}
    if method == "OPTIONS":
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE"
        headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return headers`,
    tests: [
      { args: ['https://app.example', 'GET', ['https://app.example']], expected: { 'Access-Control-Allow-Origin': 'https://app.example', Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' }, name: 'allowed origin' },
      { args: ['https://evil.example', 'GET', ['https://app.example']], expected: {}, name: 'evil origin gets nothing' },
      { args: [null, 'GET', ['https://app.example']], expected: {}, name: 'no origin' },
      { args: ['https://app.example', 'OPTIONS', ['https://app.example']], expected: { 'Access-Control-Allow-Origin': 'https://app.example', Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, name: 'preflight' },
    ],
    bugType: 'reflecting any origin',
    hint: 'The elif branch echoes the Origin header back. What should it compare the origin with first?',
    explanation: 'Echoing any non-empty Origin together with Allow-Credentials: true lets every website read authenticated responses. The origin must be looked up in the allow-list before it is reflected.',
  },
  boss: {
    title: 'Judge a CORS response like a browser',
    statement: 'Write `cors_verdict(request, response_headers)`. `request` is `{"origin", "method", "headers": [names], "credentials": bool}`; `response_headers` is the preflight response (header names are case-insensitive). Return `"ok"` or the FIRST failing reason in this order: `"origin-not-allowed"` (Allow-Origin missing or neither `*` nor the origin), `"credentials-not-allowed"` (credentials requested but Allow-Origin is `*` or Allow-Credentials is not `true`), `"method-not-allowed"` (method other than GET/HEAD/POST missing from the comma-separated Allow-Methods), `"header-not-allowed"` (a requested header, ignoring case, missing from Allow-Headers; `content-type` and `accept` are always fine).',
    language: 'python',
    fnName: 'cors_verdict',
    starter: `def cors_verdict(request, response_headers):
    # your code here
    pass
`,
    solution: `def cors_verdict(request, response_headers):
    h = {k.lower(): v for k, v in response_headers.items()}
    origin = h.get("access-control-allow-origin")
    if origin is None or origin not in ("*", request["origin"]):
        return "origin-not-allowed"
    if request["credentials"]:
        if origin == "*" or h.get("access-control-allow-credentials") != "true":
            return "credentials-not-allowed"
    methods = [m.strip().upper() for m in h.get("access-control-allow-methods", "").split(",")]
    method = request["method"].upper()
    if method not in ("GET", "HEAD", "POST") and method not in methods:
        return "method-not-allowed"
    allowed = [x.strip().lower() for x in h.get("access-control-allow-headers", "").split(",")]
    for name in request["headers"]:
        if name.lower() not in ("content-type", "accept") and name.lower() not in allowed:
            return "header-not-allowed"
    return "ok"`,
    tests: [
      { args: [{ origin: 'https://a.example', method: 'GET', headers: [], credentials: false }, { 'Access-Control-Allow-Origin': 'https://a.example' }], expected: 'ok', name: 'simple allowed' },
      { args: [{ origin: 'https://a.example', method: 'GET', headers: [], credentials: false }, {}], expected: 'origin-not-allowed', name: 'no headers at all' },
      { args: [{ origin: 'https://a.example', method: 'GET', headers: [], credentials: false }, { 'access-control-allow-origin': 'https://b.example' }], expected: 'origin-not-allowed', name: 'other origin' },
      { args: [{ origin: 'https://a.example', method: 'GET', headers: [], credentials: true }, { 'Access-Control-Allow-Origin': '*' }], expected: 'credentials-not-allowed', name: 'wildcard with cookies' },
      { args: [{ origin: 'https://a.example', method: 'GET', headers: [], credentials: true }, { 'Access-Control-Allow-Origin': 'https://a.example' }], expected: 'credentials-not-allowed', name: 'missing Allow-Credentials' },
      { args: [{ origin: 'https://a.example', method: 'PUT', headers: [], credentials: false }, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST' }], expected: 'method-not-allowed', name: 'PUT not listed' },
      { args: [{ origin: 'https://a.example', method: 'put', headers: ['Authorization', 'Content-Type'], credentials: true }, { 'Access-Control-Allow-Origin': 'https://a.example', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, PUT', 'Access-Control-Allow-Headers': 'authorization' }], expected: 'ok', name: 'case-insensitive, content-type is free' },
      { args: [{ origin: 'https://a.example', method: 'POST', headers: ['X-Trace'], credentials: false }, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' }], expected: 'header-not-allowed', name: 'custom header not listed' },
    ],
    hints: ['Check the reasons strictly in the stated order and return at the first failure; normalise the response header names to lower case first.', 'Split Allow-Methods and Allow-Headers on commas and strip spaces. GET/HEAD/POST need no listing, and neither do content-type/accept.'],
    combines: ['web-http', 'be-middleware'],
  },
  quiz: [
    {
      prompt: 'Why can\'t `Access-Control-Allow-Origin: *` be combined with cookies?',
      options: ['Wildcards are not valid header values', 'Browsers refuse to expose credentialed responses to every origin; a named origin is required', 'Cookies are blocked on HTTP', 'The preflight cannot use *'],
      answer: 1,
      explain: 'Credentialed cross-origin responses carry user-specific data, so the browser requires the server to name the exact origin and send Allow-Credentials: true.',
    },
  ],
};

export default unit;
