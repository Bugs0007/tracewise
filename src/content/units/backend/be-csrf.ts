import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq } from '@/content/lib/backend-db-auth';
import { SIM_MINIDJANGO, clip } from '@/content/lib/finish-m2m3';

const code = `
def transfer(request):                                               #@view
    user = SESSIONS.get(request.COOKIES.get("sessionid"))            #@auth
    if user is None:
        return JsonResponse({"detail": "login required"}, status=401)   #@anon
    if CSRF_PROTECTION:
        if request.data.get("csrf_token") != user.csrf_token:        #@check
            return JsonResponse({"detail": "bad CSRF token"}, status=403)   #@reject
    user.balance -= int(request.data["amount"])                      #@move
    credit(request.data["to"], request.data["amount"])
    return JsonResponse({"ok": True})                                #@ok
`;

const SCENARIOS = ['attack, no defence', 'attack, CSRF token required', 'attack, SameSite=Lax session cookie', 'legitimate transfer, CSRF token required'] as const;
type Scenario = (typeof SCENARIOS)[number];

interface Cfg {
  attack: boolean;
  token: boolean;
  sameSite: 'None' | 'Lax';
}

const CFG: Record<Scenario, Cfg> = {
  'attack, no defence': { attack: true, token: false, sameSite: 'None' },
  'attack, CSRF token required': { attack: true, token: true, sameSite: 'None' },
  'attack, SameSite=Lax session cookie': { attack: true, token: false, sameSite: 'Lax' },
  'legitimate transfer, CSRF token required': { attack: false, token: true, sameSite: 'None' },
};

interface In {
  scenario: Scenario;
}

const AMOUNT = 500;

const viz: VizDef<In> = {
  id: 'be-csrf',
  title: 'A CSRF attack and the token defence',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Scenario', kind: 'select', options: [...SCENARIOS], default: SCENARIOS[0] }],
  presets: SCENARIOS.map((s) => ({ label: s, input: { scenario: s } })),
  run({ scenario }) {
    const cfg = CFG[scenario];
    if (!cfg) throw new Error('Pick one of: ' + SCENARIOS.join(' | '));
    const r = new Recorder(code);
    const actors = ['Victim browser', 'Evil site', 'Bank'];
    const seq = new Seq(actors, scenario);
    const bal = { victim: 1000, attacker: 0, friend: 0 };
    const jar = { cookie: null as string | null, token: null as string | null };
    const bank = (): KVPanel => ({
      type: 'kv',
      title: 'Bank balances',
      entries: [
        { k: 'victim', v: bal.victim, tone: bal.victim < 1000 ? 'error' : 'default' },
        { k: 'mallory (attacker)', v: bal.attacker, tone: bal.attacker > 0 ? 'error' : 'default' },
        { k: 'friend', v: bal.friend, tone: bal.friend > 0 ? 'found' : 'default' },
      ],
    });
    const browser = (): KVPanel => ({
      type: 'kv',
      title: 'Victim browser',
      entries: [
        { k: 'bank cookie', v: jar.cookie ?? '(none)', tone: jar.cookie ? 'active' : 'muted' },
        { k: 'token on the bank page', v: cfg.token ? (jar.token ?? '(not loaded)') : '(bank sends none)', tone: 'default' },
      ],
    });
    const panels = (): Panel[] => [seq.panel(), browser(), bank()];

    r.step(undefined, 'The victim has an open session at bank.example in this browser', [seq.panel(), browser(), bank()], { balance: bal.victim });
    seq.send('Victim browser', 'Bank', 'POST /login (alice + password)');
    jar.cookie = 'sessionid=s1';
    jar.token = 'T-7f3a';
    seq.send('Bank', 'Victim browser', cfg.sameSite === 'Lax' ? '200 Set-Cookie: sessionid=s1; SameSite=Lax' : '200 Set-Cookie: sessionid=s1', 'done', true);
    r.step(undefined, clip(cfg.token ? 'Login works: browser stores the cookie, bank pages embed a secret CSRF token' : 'Login works: the browser stores the session cookie'), panels(), { cookie: 's1' });

    let status = 0;
    const settle = (): void => {
      if (cfg.attack) {
        seq.send('Victim browser', 'Evil site', 'GET evil.example (victim clicks a link)');
        seq.send('Evil site', 'Victim browser', 'page with hidden auto-submitting form', 'error', true);
        r.step(undefined, 'Victim opens evil.example; its hidden form targets bank.example/transfer', panels(), { site: 'evil.example' });
      } else {
        seq.send('Victim browser', 'Bank', 'GET /transfer (bank own form page)');
        seq.send('Bank', 'Victim browser', 'form with hidden csrf_token=T-7f3a', 'done', true);
        r.step(undefined, 'Victim opens the bank\'s own transfer form; it contains the CSRF token', panels(), { site: 'bank.example' });
      }
      const cookieSent = !cfg.attack || cfg.sameSite === 'None';
      const sentToken = cfg.token && !cfg.attack ? 'csrf_token=T-7f3a' : 'no token';
      const to = cfg.attack ? 'mallory' : 'friend';
      seq.send('Victim browser', 'Bank', `POST /transfer ${AMOUNT} to ${to}, ${cookieSent ? 'cookie sent' : 'NO cookie'}, ${sentToken}`, cfg.attack ? 'error' : undefined);
      r.step(
        'view',
        clip(cfg.attack ? (cookieSent ? 'The browser submits the form and attaches the bank cookie by itself' : 'SameSite=Lax: a cross-site POST does not carry the cookie') : 'The victim submits the form: cookie and token both travel with it'),
        panels(),
        { cookieSent, token: sentToken },
      );
      // the bank's decision
      r.step('auth', cookieSent ? 'Bank looks the session cookie up: alice is logged in' : 'Bank looks for a session cookie and finds none', panels(), { cookieSent });
      if (!cookieSent) {
        seq.send('Bank', 'Victim browser', '401 login required', 'done', true);
        status = 401;
        r.step('anon', 'Anonymous request: 401, nothing moved. The browser rule stopped the attack', panels(), { status });
        return;
      }
      if (cfg.token) {
        const ok = !cfg.attack;
        r.step('check', ok ? 'Token in the body equals the session token: genuine form' : 'The attacker could not read the token (same-origin policy): it is missing', panels(), { tokenOk: ok });
        if (!ok) {
          seq.send('Bank', 'Victim browser', '403 bad CSRF token', 'done', true);
          status = 403;
          r.step('reject', 'Request rejected with 403: no money moves', panels(), { status });
          return;
        }
      }
      bal.victim -= AMOUNT;
      if (cfg.attack) bal.attacker += AMOUNT;
      else bal.friend += AMOUNT;
      seq.send('Bank', 'Victim browser', '200 {"ok": true}', cfg.attack ? 'error' : 'done', true);
      status = 200;
      r.step('move', clip(cfg.attack ? `The bank cannot tell the forged request from a real one: ${AMOUNT} moves to mallory` : `Transfer approved: ${AMOUNT} moves to the friend`), panels(), { status, victim: bal.victim });
    };
    settle();
    const tone: Tone = bal.attacker > 0 ? 'error' : 'found';
    r.step('ok', clip(bal.attacker > 0 ? `Attack succeeded: victim ${bal.victim}, attacker ${bal.attacker}` : `Attack failed or request was genuine: victim ${bal.victim}, attacker ${bal.attacker}`), [seq.panel(), bank(), { type: 'note', text: bal.attacker > 0 ? 'The browser attached the cookie to a request the victim never meant to send.' : 'Without the secret token or the cookie, a forged request is useless.', tone }], { status });
    return { frames: r.frames, result: { status, victim: bal.victim, attacker: bal.attacker } };
  },
  reference({ scenario }) {
    const table: Record<Scenario, { status: number; victim: number; attacker: number }> = {
      'attack, no defence': { status: 200, victim: 500, attacker: 500 },
      'attack, CSRF token required': { status: 403, victim: 1000, attacker: 0 },
      'attack, SameSite=Lax session cookie': { status: 401, victim: 1000, attacker: 0 },
      'legitimate transfer, CSRF token required': { status: 200, victim: 500, attacker: 0 },
    };
    return table[scenario];
  },
};

const HARNESS = `
from minidjango.http import App, path, JsonResponse
from minidjango.test import Client

def notes(request):
    if request.method == "GET":
        return JsonResponse({"notes": []})
    if request.method == "DELETE":
        return JsonResponse({"deleted": True})
    return JsonResponse({"created": True}, status=201)

def run_csrf(mw, requests):
    app = App([path("notes/", notes)], middleware=[mw])
    out = []
    for method, cookie, header in requests:
        client = Client(app)
        if cookie is not None:
            client.cookies["csrftoken"] = cookie
        headers = {} if header is None else {"X-CSRF-Token": header}
        out.append(client.request(method, "/notes/", None, headers).status_code)
    return out

def run_guard(cls, secret, ops):
    guard = cls(secret)
    tokens = {}
    out = []
    for op in ops:
        if op[0] == "issue":
            tokens[op[2]] = guard.issue(op[1])
            out.append(len(tokens[op[2]]))
        elif op[0] == "same":
            out.append(tokens[op[1]] == tokens[op[2]])
        else:
            _, sid, alias, method = op
            out.append(guard.check(sid, tokens.get(alias, alias), method))
    return out
`;

const unit: Unit = {
  id: 'be-csrf',
  hook: 'CSRF is the classic "why is a session cookie not enough?" question. Explaining that the browser attaches cookies to any request, even one started by another site, and how a token breaks the attack, shows real understanding of web security.',
  simulationNote: SIM_MINIDJANGO + ' The attack sequence is a simplified model of what browsers do.',
  predict: {
    prompt: 'You are logged in to bank.example. You open evil.example, which silently POSTs a transfer form to bank.example. Without any CSRF defence, does the bank see your session cookie?',
    options: ['No: cookies never leave the site that set them', 'Yes: the browser attaches the cookie to every request to bank.example, whoever started it', 'Only if evil.example can read the cookie with JavaScript', 'Only for GET requests'],
    answer: 1,
    explain: 'Cookies are attached by destination, not by who caused the request. evil.example cannot read the cookie, but it does not need to: it only needs the browser to send it. That is why state-changing endpoints need something an attacker cannot forge.',
  },
  viz,
  deeper: {
    points: [
      'CSRF abuses ambient authority: the browser adds the cookie automatically, so the server cannot tell a request the user meant from one a malicious page triggered.',
      'The synchronizer token pattern puts a secret random value in each form (or a header). An attacker page cannot read it because of the same-origin policy.',
      'The double-submit variant compares a token in a cookie with the same token in a header or form field; the attacker cannot set that header cross-site.',
      '`SameSite=Lax` (the browser default now) stops cross-site POST cookies, but defence in depth still matters.',
      'Safe methods (GET, HEAD, OPTIONS) must not change state; that is why CSRF checks only unsafe methods.',
      'APIs that authenticate with an `Authorization` header instead of cookies are not exposed to CSRF, because the browser never adds that header by itself.',
    ],
    pitfalls: ['Changing state on GET requests', 'Skipping the token check when the token is missing (null equals null)', 'Using one global token for every user', 'Assuming CORS blocks the attack (the request is still sent)'],
  },
  practice: {
    language: 'python',
    fnName: 'csrf_middleware',
    statement: 'Write the Django-style middleware `csrf_middleware(get_response)`. For POST, PUT, PATCH and DELETE the `x-csrf-token` header must equal the `csrftoken` cookie and be non-empty; otherwise return `JsonResponse({"detail": "CSRF check failed"}, status=403)`. Other methods pass straight through. `JsonResponse` is imported.',
    signature: 'def csrf_middleware(get_response):',
    solution: `UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

def csrf_middleware(get_response):
    def middleware(request):
        if request.method in @@UNSAFE@@:
            cookie = request.COOKIES.get("csrftoken")
            sent = request.headers.get("x-csrf-token")
            if @@not cookie@@ or sent != cookie:
                return JsonResponse({"detail": "CSRF check failed"}, status=@@403@@)
        return get_response(request)
    return middleware`,
    harness: HARNESS,
    adapter: 'run_csrf',
    tests: [
      { args: [[['GET', null, null]]], expected: [200], name: 'safe method needs no token' },
      { args: [[['POST', null, null]]], expected: [403], name: 'no cookie and no header' },
      { args: [[['POST', 'abc', 'abc']]], expected: [201], name: 'matching token' },
      { args: [[['POST', 'abc', 'xyz']]], expected: [403], name: 'wrong token' },
      { args: [[['DELETE', 'abc', null]]], expected: [403], name: 'cookie but no header' },
      { args: [[['POST', null, 'abc']]], expected: [403], name: 'header but no cookie' },
      { args: [[['DELETE', 'abc', 'abc'], ['GET', 'abc', null]]], expected: [200, 200], name: 'delete with token, then a read' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'csrf_middleware',
    statement: 'Requests that carry neither a cookie nor a header are getting through the CSRF check. Fix the middleware.',
    buggy: `def csrf_middleware(get_response):
    def middleware(request):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("x-csrf-token") != request.COOKIES.get("csrftoken"):
                return JsonResponse({"detail": "CSRF check failed"}, status=403)
        return get_response(request)
    return middleware`,
    fixed: `def csrf_middleware(get_response):
    def middleware(request):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            cookie = request.COOKIES.get("csrftoken")
            if not cookie or request.headers.get("x-csrf-token") != cookie:
                return JsonResponse({"detail": "CSRF check failed"}, status=403)
        return get_response(request)
    return middleware`,
    harness: HARNESS,
    adapter: 'run_csrf',
    tests: [
      { args: [[['POST', null, null]]], expected: [403], name: 'both missing' },
      { args: [[['POST', 'abc', 'abc']]], expected: [201], name: 'match' },
      { args: [[['POST', 'abc', 'nope']]], expected: [403], name: 'mismatch' },
      { args: [[['GET', null, null]]], expected: [200], name: 'safe method' },
    ],
    bugType: 'missing equals missing',
    hint: 'What does `dict.get` return for a missing key, and what does None != None evaluate to?',
    explanation: 'When both the header and the cookie are absent, both lookups give None and None != None is False, so the check passes. A CSRF check must first require a real, non-empty token and only then compare.',
  },
  boss: {
    title: 'Session-bound CSRF tokens',
    statement: 'Write class `CsrfGuard(secret)`. `issue(session_id)` returns the first 32 hex characters of HMAC-SHA256(secret, session_id) so the same session always gets the same token and different sessions get different ones. `check(session_id, token, method)` returns True for safe methods (GET, HEAD, OPTIONS, any case); for the others it returns True only when `token` is a non-empty string equal to the token issued for that session (compare in constant time). `hmac` and `hashlib` are available to import.',
    language: 'python',
    fnName: 'CsrfGuard',
    starter: `class CsrfGuard:
    # your code here
    pass
`,
    solution: `import hmac, hashlib

class CsrfGuard:
    def __init__(self, secret):
        self.secret = secret.encode()

    def issue(self, session_id):
        return hmac.new(self.secret, session_id.encode(), hashlib.sha256).hexdigest()[:32]

    def check(self, session_id, token, method):
        if method.upper() in ("GET", "HEAD", "OPTIONS"):
            return True
        if not isinstance(token, str) or not token:
            return False
        return hmac.compare_digest(token, self.issue(session_id))`,
    harness: HARNESS,
    adapter: 'run_guard',
    tests: [
      { args: ['k1', [['issue', 's1', 'a'], ['issue', 's1', 'b'], ['same', 'a', 'b']]], expected: [32, 32, true], name: 'same session, same token' },
      { args: ['k1', [['issue', 's1', 'a'], ['issue', 's2', 'b'], ['same', 'a', 'b']]], expected: [32, 32, false], name: 'different sessions differ' },
      { args: ['k1', [['issue', 's1', 'a'], ['check', 's1', 'a', 'POST']]], expected: [32, true], name: 'own token accepted' },
      { args: ['k1', [['issue', 's1', 'a'], ['check', 's2', 'a', 'POST']]], expected: [32, false], name: 'token from another session rejected' },
      { args: ['k1', [['check', 's1', null, 'POST'], ['check', 's1', '', 'DELETE'], ['check', 's1', 'guess', 'PUT']]], expected: [false, false, false], name: 'missing or wrong tokens' },
      { args: ['k1', [['check', 's1', null, 'GET'], ['check', 's1', null, 'options']]], expected: [true, true], name: 'safe methods in any case' },
    ],
    hints: ['issue() is one line with hmac.new(key, message, hashlib.sha256).hexdigest(), cut to 32 characters.', 'In check(): return True for safe methods; reject a token that is not a non-empty str; compare with hmac.compare_digest against a freshly computed issue(session_id).'],
    combines: ['be-sessions', 'be-middleware'],
  },
  quiz: [
    {
      prompt: 'Why does an API that authenticates with an Authorization: Bearer header not need CSRF tokens?',
      options: ['Bearer tokens are encrypted', 'The browser never adds that header automatically to cross-site requests', 'HTTPS prevents CSRF', 'Bearer requests are always GET'],
      answer: 1,
      explain: 'CSRF depends on the browser attaching credentials on its own. A custom Authorization header must be set by JavaScript, and a malicious page cannot set it for another origin.',
    },
  ],
};

export default unit;
