import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq } from '@/content/lib/backend-db-auth';
import { sameSiteAllows, type SameSiteValue } from '@/content/lib/frontend-css-web';
import { clip } from '@/content/lib/finish-m2m3';

const code = `
// Set-Cookie: sid=abc; HttpOnly; Secure; SameSite=Lax                     //@cookie
app.post('/transfer', (req, res) => {                                      //@route
  const origin = req.headers.origin;                                       //@origin
  if (origin && !ALLOWED.includes(origin)) return res.sendStatus(403);     //@originCheck
  if (req.body.csrf !== req.session.csrf) return res.sendStatus(403);      //@token
  transfer(req.session.user, req.body.to, req.body.amount);                //@move
  res.sendStatus(200);
});
app.get('/transfer', (req, res) => {                                       //@getRoute
  transfer(req.session.user, req.query.to, req.query.amount);              //@getMove
});
`;

const REQUESTS = ['cross-site form POST', 'cross-site link click (GET /transfer)', 'cross-site fetch with JSON', 'same-site form POST (genuine)'];
const SAMESITES = ['Strict', 'Lax', 'None'];
const DEFENCES = ['none', 'CSRF token', 'Origin check'];

interface In {
  request: string;
  sameSite: string;
  defence: string;
}

interface Out {
  cookieSent: boolean;
  requestSent: boolean;
  accepted: boolean;
}

interface Shape {
  method: string;
  crossSite: boolean;
  topLevelNav: boolean;
  preflight: boolean;
  line: string;
}

const SHAPES: Record<string, Shape> = {
  'cross-site form POST': { method: 'POST', crossSite: true, topLevelNav: true, preflight: false, line: 'evil.example auto-submits <form method=POST action=bank.example/transfer>' },
  'cross-site link click (GET /transfer)': { method: 'GET', crossSite: true, topLevelNav: true, preflight: false, line: 'evil.example links to bank.example/transfer?to=mallory (a state-changing GET)' },
  'cross-site fetch with JSON': { method: 'POST', crossSite: true, topLevelNav: false, preflight: true, line: 'evil.example runs fetch(bank, {credentials:"include", JSON body})' },
  'same-site form POST (genuine)': { method: 'POST', crossSite: false, topLevelNav: true, preflight: false, line: 'The bank\'s own transfer page submits its form (includes the CSRF token)' },
};

const viz: VizDef<In> = {
  id: 'web-csrf',
  title: 'CSRF from the browser\'s point of view',
  code,
  language: 'javascript',
  inputs: [
    { key: 'request', label: 'The request', kind: 'select', options: REQUESTS, default: REQUESTS[0] },
    { key: 'sameSite', label: 'Session cookie SameSite', kind: 'select', options: SAMESITES, default: 'None' },
    { key: 'defence', label: 'Server-side defence', kind: 'select', options: DEFENCES, default: 'none' },
  ],
  presets: [
    { label: 'Classic attack', input: { request: REQUESTS[0], sameSite: 'None', defence: 'none' } },
    { label: 'SameSite=Lax stops POST', input: { request: REQUESTS[0], sameSite: 'Lax', defence: 'none' } },
    { label: 'Lax and state-changing GET', input: { request: REQUESTS[1], sameSite: 'Lax', defence: 'Origin check' } },
    { label: 'Token beats cookie-only', input: { request: REQUESTS[0], sameSite: 'None', defence: 'CSRF token' } },
    { label: 'JSON fetch hits CORS', input: { request: REQUESTS[2], sameSite: 'None', defence: 'none' } },
    { label: 'Genuine request', input: { request: REQUESTS[3], sameSite: 'Strict', defence: 'CSRF token' } },
  ],
  run({ request, sameSite, defence }) {
    const shape = SHAPES[request];
    if (!shape) throw new Error('request must be one of: ' + REQUESTS.join(' | '));
    if (!SAMESITES.includes(sameSite)) throw new Error('sameSite must be Strict, Lax or None');
    if (!DEFENCES.includes(defence)) throw new Error('defence must be one of: ' + DEFENCES.join(' | '));
    const r = new Recorder(code);
    const seq = new Seq(['Browser', 'evil.example', 'bank.example'], request);
    const out: Out = { cookieSent: false, requestSent: false, accepted: false };
    const origin = shape.crossSite ? 'https://evil.example' : 'https://bank.example';
    const decision = (rows: [string, string, Tone][]): KVPanel => ({ type: 'kv', title: 'Decisions', entries: rows.map(([k, v, tone]) => ({ k, v, tone })) });
    let rows: [string, string, Tone][] = [];
    const view = (): Panel[] => [seq.panel(), decision(rows)];

    r.step('cookie', clip(`The victim is logged in to the bank; its session cookie is SameSite=${sameSite}`), view(), { sameSite });
    seq.send('Browser', shape.crossSite ? 'evil.example' : 'bank.example', shape.crossSite ? 'GET page (the victim visits)' : 'GET /transfer-form');
    r.step(undefined, clip(shape.line), view(), { origin });
    r.op();

    // 1. does the browser even send it?
    if (shape.preflight) {
      rows = [['preflight', 'bank.example does not allow evil.example', 'error']];
      seq.send('Browser', 'bank.example', 'OPTIONS /transfer (preflight, JSON needs it)');
      seq.send('bank.example', 'Browser', 'no CORS headers: preflight fails', 'done', true);
      r.step('route', 'A JSON fetch is not a simple request: the CORS preflight fails and the real request is never sent', view(), { preflight: 'failed' });
      r.step(undefined, 'Nothing reaches the bank handler, no cookie matters', view(), { ...out });
      return { frames: r.frames, result: out };
    }
    out.requestSent = true;
    const cookieOk = sameSiteAllows(sameSite as SameSiteValue, { crossSite: shape.crossSite, topLevelNav: shape.topLevelNav, method: shape.method });
    out.cookieSent = cookieOk;
    rows = [['SameSite rule', cookieOk ? 'cookie attached' : 'cookie withheld', cookieOk ? 'swap' : 'done']];
    const reason = !shape.crossSite ? 'same site: always attached' : sameSite === 'None' ? 'None: attached everywhere' : sameSite === 'Strict' ? 'Strict: never on cross-site' : shape.method === 'GET' && shape.topLevelNav ? 'Lax: allowed for top-level GET navigation' : 'Lax: not for a cross-site POST';
    seq.send('Browser', 'bank.example', `${shape.method} /transfer  ${cookieOk ? 'Cookie: sid' : '(no cookie)'}  Origin: ${shape.method === 'GET' ? '-' : origin}`, cookieOk ? 'error' : undefined);
    r.step('cookie', clip(`${reason}`), view(), { cookieSent: cookieOk, method: shape.method });

    // 2. what the server does
    if (!cookieOk) {
      rows.push(['server', 'anonymous: 401', 'done']);
      seq.send('bank.example', 'Browser', '401 login required', 'done', true);
      r.step('route', 'No session cookie, so the server treats the request as anonymous', view(), { status: 401 });
    } else {
      let accepted = true;
      let why = 'no extra check: the cookie alone is trusted';
      if (defence === 'Origin check') {
        const checkApplies = shape.method !== 'GET';
        r.step('origin', clip(checkApplies ? `Origin header is ${origin}; the allow-list only has https://bank.example` : 'Safe methods skip the Origin check, so a GET that changes state slips through'), view(), { origin: shape.method === 'GET' ? '-' : origin });
        if (checkApplies && shape.crossSite) {
          accepted = false;
          why = 'Origin not on the allow-list: 403';
        } else why = checkApplies ? 'Origin matches: accepted' : 'GET skipped the check: accepted';
      } else if (defence === 'CSRF token') {
        const hasToken = !shape.crossSite;
        r.step('token', clip(hasToken ? 'The genuine page embedded the secret token and sends it back' : 'evil.example cannot read the token (same-origin policy): the field is missing'), view(), { token: hasToken ? 'present' : 'missing' });
        accepted = hasToken;
        why = hasToken ? 'token matches the session: accepted' : 'missing token: 403';
      }
      rows.push(['server', accepted ? 'accepted: ' + why : 'rejected: ' + why, accepted ? (shape.crossSite ? 'error' : 'found') : 'done']);
      out.accepted = accepted;
      seq.send('bank.example', 'Browser', accepted ? '200 transfer executed' : '403 forbidden', accepted ? (shape.crossSite ? 'error' : 'found') : 'done', true);
      r.step(accepted ? 'move' : 'originCheck', clip(accepted ? (shape.crossSite ? 'The forged request succeeded: money moved without the victim intending it' : 'The genuine request succeeds as intended') : 'The forged request is rejected'), view(), { status: accepted ? 200 : 403 });
    }
    r.step(undefined, clip(out.accepted && shape.crossSite ? 'Attack succeeded. Fix: SameSite cookies + CSRF token or Origin check, and no state change on GET' : out.accepted ? 'Genuine request worked' : 'Attack failed'), view(), { ...out });
    return { frames: r.frames, result: out };
  },
  reference({ request, sameSite, defence }) {
    if (request === REQUESTS[2]) return { cookieSent: false, requestSent: false, accepted: false };
    const cross = request !== REQUESTS[3];
    const isGet = request === REQUESTS[1];
    const cookieSent = !cross || sameSite === 'None' || (sameSite === 'Lax' && isGet);
    let accepted = cookieSent;
    if (cookieSent && defence === 'CSRF token') accepted = !cross;
    if (cookieSent && defence === 'Origin check') accepted = isGet || !cross;
    return { cookieSent, requestSent: true, accepted };
  },
};

const REQ_CASES = (): { args: unknown[]; expected: boolean; name: string }[] => {
  const ok = ['https://bank.example'];
  return [
    { args: [{ method: 'GET', headers: { origin: 'https://evil.example' } }, ok], expected: true, name: 'safe methods always pass' },
    { args: [{ method: 'POST', headers: { origin: 'https://bank.example' } }, ok], expected: true, name: 'POST from our own origin' },
    { args: [{ method: 'POST', headers: { origin: 'https://evil.example' } }, ok], expected: false, name: 'POST from another origin' },
    { args: [{ method: 'DELETE', headers: { origin: 'null' } }, ok], expected: false, name: 'opaque "null" origin' },
    { args: [{ method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }, ok], expected: true, name: 'Sec-Fetch-Site same-origin' },
    { args: [{ method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }, ok], expected: false, name: 'Sec-Fetch-Site cross-site' },
    { args: [{ method: 'PUT', headers: { 'sec-fetch-site': 'none' } }, ok], expected: true, name: 'user-initiated request' },
    { args: [{ method: 'POST', headers: { referer: 'https://bank.example/account?x=1' } }, ok], expected: true, name: 'Referer fallback, allowed' },
    { args: [{ method: 'POST', headers: { referer: 'https://evil.example/page' } }, ok], expected: false, name: 'Referer fallback, foreign' },
    { args: [{ method: 'POST', headers: {} }, ok], expected: false, name: 'no information: refuse' },
    { args: [{ method: 'post', headers: { origin: 'https://app.example' } }, ['https://bank.example', 'https://app.example']], expected: true, name: 'second allowed origin, lowercase method' },
  ];
};

const unit: Unit = {
  id: 'web-csrf',
  hook: 'CSRF is easy to explain badly. From the browser side the story is: cookies are attached by destination, so a form on another site can act as you. SameSite, tokens and Origin checks each cut that off at a different point.',
  predict: {
    prompt: 'A site sets its session cookie with SameSite=Lax and its transfer endpoint is `GET /transfer?to=x&amount=y`. An attacker page links to it. The victim clicks the link. What happens?',
    options: ['Nothing: Lax blocks every cross-site request', 'The cookie is sent (top-level GET navigation) and the transfer runs', 'The browser asks the user to confirm', 'Only a POST would be sent, so it fails'],
    answer: 1,
    explain: 'Lax still sends cookies on cross-site top-level navigations that use safe methods. Because this endpoint changes state on GET, the link works as an attack. State changes belong behind POST (plus a token), never GET.',
  },
  simulationNote: 'The browser rules are modelled for four request shapes. Real browsers have extra details, such as the Lax-allowing-POST grace period some browsers add for fresh cookies.',
  viz,
  deeper: {
    points: [
      'Browsers attach cookies by destination. A request started by evil.example to bank.example still carries bank.example\'s cookies, unless SameSite says no.',
      'SameSite=Strict: never on cross-site requests. Lax (default in modern browsers): only on top-level navigations with safe methods. None: always (requires Secure).',
      'A CSRF token is a secret the attacker page cannot read, so it cannot put it into the forged request. Synchronizer tokens live in the session; double-submit tokens are compared with a cookie.',
      'Origin (and Referer, Sec-Fetch-Site) headers tell the server where a request came from. Checking them on unsafe methods is cheap defence in depth.',
      'CORS is not CSRF protection: simple cross-site form POSTs are sent anyway. A JSON fetch is stopped by the preflight, but you should not rely on that alone.',
      'APIs that authenticate with an Authorization header set by your own JavaScript are not vulnerable, because the browser never adds that header by itself.',
    ],
    pitfalls: ['Changing state on GET', 'Treating SameSite=None cookies as safe', 'Checking Origin by substring or prefix instead of exact match', 'Accepting requests that carry no Origin and no token'],
  },
  practice: {
    language: 'javascript',
    fnName: 'isCrossSiteRequestAllowed',
    statement: 'Write `isCrossSiteRequestAllowed(req, allowedOrigins)` for `req = { method, headers }` (header names are lower case). GET, HEAD and OPTIONS are always allowed. Otherwise decide with the first header available: `origin` (allowed only if it is exactly in `allowedOrigins`); else `sec-fetch-site` (`same-origin` and `none` are allowed, anything else is not); else `referer` (its origin must be in `allowedOrigins`; an invalid URL is refused). With no information at all, refuse. Method comparison ignores case.',
    signature: 'function isCrossSiteRequestAllowed(req, allowedOrigins) {',
    solution: `function isCrossSiteRequestAllowed(req, allowedOrigins) {
  const method = req.method.toUpperCase();
  if (@@['GET', 'HEAD', 'OPTIONS'].includes(method)@@) return true;
  const h = req.headers;
  if (h.origin !== undefined) return @@allowedOrigins.includes(h.origin)@@;
  if (h['sec-fetch-site'] !== undefined) {
    return h['sec-fetch-site'] === 'same-origin' || h['sec-fetch-site'] === 'none';
  }
  if (h.referer !== undefined) {
    try {
      return allowedOrigins.includes(new URL(h.referer).origin);
    } catch (e) {
      return @@false@@;
    }
  }
  return false;
}`,
    tests: REQ_CASES(),
  },
  debug: {
    language: 'javascript',
    fnName: 'isCrossSiteRequestAllowed',
    statement: 'A request with `Origin: https://bank.example.evil.net` is accepted by the Origin check. Fix the comparison.',
    buggy: `function isCrossSiteRequestAllowed(req, allowedOrigins) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const origin = req.headers.origin;
  if (origin === undefined) return false;
  return allowedOrigins.some((allowed) => origin.startsWith(allowed));
}`,
    fixed: `function isCrossSiteRequestAllowed(req, allowedOrigins) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const origin = req.headers.origin;
  if (origin === undefined) return false;
  return allowedOrigins.includes(origin);
}`,
    tests: [
      { args: [{ method: 'POST', headers: { origin: 'https://bank.example' } }, ['https://bank.example']], expected: true, name: 'exact match' },
      { args: [{ method: 'POST', headers: { origin: 'https://bank.example.evil.net' } }, ['https://bank.example']], expected: false, name: 'lookalike suffix' },
      { args: [{ method: 'POST', headers: { origin: 'https://evil.example' } }, ['https://bank.example']], expected: false, name: 'other origin' },
      { args: [{ method: 'GET', headers: {} }, ['https://bank.example']], expected: true, name: 'safe method' },
    ],
    bugType: 'prefix match on an origin',
    hint: 'Does "https://bank.example.evil.net" start with "https://bank.example"?',
    explanation: 'startsWith treats any host that merely begins with the trusted origin as trusted, so an attacker registers bank.example.evil.net. Origins must be compared exactly.',
  },
  boss: {
    title: 'Full CSRF check',
    statement: 'Write `checkCsrf(req, session, allowedOrigins)` returning `{ ok, reason }`. `req = { method, headers, body }`; `session` is `null` or `{ csrfToken }`. In order: GET/HEAD/OPTIONS give `{ ok: true, reason: "safe-method" }`; no session gives reason `"no-session"`; an `origin` header that is not exactly in `allowedOrigins` gives `"bad-origin"` (no origin header is fine); then the token is `headers["x-csrf-token"]`, or `body.csrf` when the header is absent; a missing or empty token gives `"missing-token"`; a token that differs from `session.csrfToken` gives `"bad-token"`; otherwise `{ ok: true, reason: "ok" }`. Failures have `ok: false`.',
    language: 'javascript',
    fnName: 'checkCsrf',
    starter: `function checkCsrf(req, session, allowedOrigins) {
  // your code here
}
`,
    solution: `function checkCsrf(req, session, allowedOrigins) {
  const fail = (reason) => ({ ok: false, reason });
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return { ok: true, reason: 'safe-method' };
  if (!session) return fail('no-session');
  const origin = req.headers.origin;
  if (origin !== undefined && !allowedOrigins.includes(origin)) return fail('bad-origin');
  const token = req.headers['x-csrf-token'] !== undefined ? req.headers['x-csrf-token'] : (req.body || {}).csrf;
  if (typeof token !== 'string' || token === '') return fail('missing-token');
  if (token !== session.csrfToken) return fail('bad-token');
  return { ok: true, reason: 'ok' };
}`,
    tests: [
      { args: [{ method: 'GET', headers: {} }, null, ['https://bank.example']], expected: { ok: true, reason: 'safe-method' }, name: 'safe method needs nothing' },
      { args: [{ method: 'POST', headers: {}, body: { csrf: 't1' } }, null, ['https://bank.example']], expected: { ok: false, reason: 'no-session' }, name: 'anonymous' },
      { args: [{ method: 'POST', headers: { origin: 'https://evil.example', 'x-csrf-token': 't1' } }, { csrfToken: 't1' }, ['https://bank.example']], expected: { ok: false, reason: 'bad-origin' }, name: 'right token, wrong origin' },
      { args: [{ method: 'POST', headers: {}, body: {} }, { csrfToken: 't1' }, ['https://bank.example']], expected: { ok: false, reason: 'missing-token' }, name: 'no token anywhere' },
      { args: [{ method: 'POST', headers: { 'x-csrf-token': '' }, body: { csrf: 't1' } }, { csrfToken: 't1' }, ['https://bank.example']], expected: { ok: false, reason: 'missing-token' }, name: 'empty header wins over body' },
      { args: [{ method: 'DELETE', headers: { 'x-csrf-token': 'nope' } }, { csrfToken: 't1' }, ['https://bank.example']], expected: { ok: false, reason: 'bad-token' }, name: 'wrong token' },
      { args: [{ method: 'POST', headers: { origin: 'https://bank.example' }, body: { csrf: 't1' } }, { csrfToken: 't1' }, ['https://bank.example']], expected: { ok: true, reason: 'ok' }, name: 'form body token' },
      { args: [{ method: 'put', headers: { 'x-csrf-token': 't1' } }, { csrfToken: 't1' }, ['https://bank.example']], expected: { ok: true, reason: 'ok' }, name: 'header token, no origin header, lowercase method' },
    ],
    hints: ['Run the checks in exactly the stated order and return at the first failure; a small helper that builds { ok: false, reason } keeps it tidy.', 'The token comes from the header if the header exists (even if empty), otherwise from req.body.csrf. Compare strings only after checking it is a non-empty string.'],
    combines: ['be-csrf', 'web-storage'],
  },
  quiz: [
    {
      prompt: 'Why does a hidden CSRF token stop a forged cross-site form post?',
      options: ['Browsers refuse forms from other sites', 'The attacker\'s page cannot read the token because of the same-origin policy, so it cannot include it', 'Tokens are encrypted in transit', 'Tokens make cookies HttpOnly'],
      answer: 1,
      explain: 'The forged form is built by the attacker, who cannot read the bank page or its token. Without it the server rejects the request even though the cookie was attached.',
    },
  ],
};

export default unit;
