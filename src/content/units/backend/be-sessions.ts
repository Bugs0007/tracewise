import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq, sha256, step, toHex } from '@/content/lib/backend-db-auth';

const code = `
def login(request):
    user = authenticate(request.data["username"], request.data["password"])   #@auth
    if user is None:
        return JsonResponse({"error": "bad credentials"}, status=401)         #@reject
    sid = secrets.token_hex(16)                                               #@mint
    SESSIONS[sid] = {"user_id": user.pk}                                      #@store
    response = JsonResponse({"ok": True})
    response.set_cookie("sessionid", sid)                                     #@cookie
    return response

def profile(request):
    session = SESSIONS.get(request.COOKIES.get("sessionid"))                  #@lookup
    if session is None:
        return JsonResponse({"error": "login required"}, status=401)          #@deny
    return JsonResponse({"user_id": session["user_id"]})                      #@allow

def logout(request):
    SESSIONS.pop(request.COOKIES.get("sessionid"), None)                      #@destroy
    return JsonResponse({"ok": True})                                         #@bye
`;

type Act = { kind: 'login'; pw: string } | { kind: 'profile'; replay?: boolean } | { kind: 'logout' };

const FLOWS: Record<string, Act[]> = {
  'login, profile, logout': [{ kind: 'login', pw: 'pw123' }, { kind: 'profile' }, { kind: 'logout' }, { kind: 'profile' }],
  'profile without login': [{ kind: 'profile' }],
  'wrong password': [{ kind: 'login', pw: 'guess' }],
  'stolen cookie after logout': [{ kind: 'login', pw: 'pw123' }, { kind: 'logout' }, { kind: 'profile', replay: true }],
};

interface In {
  flow: string;
}

const viz: VizDef<In> = {
  id: 'be-sessions',
  title: 'Session authentication',
  code,
  language: 'python',
  inputs: [{ key: 'flow', label: 'Scenario', kind: 'select', options: Object.keys(FLOWS), default: 'login, profile, logout' }],
  presets: Object.keys(FLOWS).map((f) => ({ label: f, input: { flow: f } })),
  run({ flow }) {
    const r = new Recorder(code);
    const acts = FLOWS[flow] ?? FLOWS['login, profile, logout'];
    const store = new Map<string, string>();
    let jar: string | null = null;
    let saved: string | null = null;
    let counter = 0;
    const statuses: number[] = [];

    const kvJar = (): KVPanel => ({ type: 'kv', title: 'Browser cookie jar', entries: [{ k: 'sessionid', v: jar ?? '(none)', tone: jar ? 'active' : 'muted' }] });
    const kvStore = (hot?: string): KVPanel => ({
      type: 'kv',
      title: 'Session store (server side)',
      entries: store.size ? [...store.entries()].map(([k, v]) => ({ k, v, tone: k === hot ? 'compare' : 'default' })) : [{ k: '(empty)', v: '-', tone: 'muted' }],
    });

    step(r, 0, `Start: empty cookie jar, empty session store. ${acts.length} request${acts.length > 1 ? 's' : ''} to go`, [new Seq(['Browser', 'Server', 'Session store'], 'Before any request').panel(), kvJar(), kvStore()], { requests: acts.length });

    acts.forEach((act, n) => {
      const seq = new Seq(['Browser', 'Server', 'Session store'], `Request ${n + 1} of ${acts.length}`);
      const panels = (hot?: string): Panel[] => [seq.panel(), kvJar(), kvStore(hot)];
      const cookieOut = act.kind === 'profile' && act.replay ? saved : jar;
      const cookieText = cookieOut ? `Cookie: sessionid=${cookieOut}` : 'no cookie';

      if (act.kind === 'login') {
        seq.send('Browser', 'Server', 'POST /login alice + password');
        const good = act.pw === 'pw123';
        step(r, 'auth', `Server checks the password: ${good ? 'correct' : 'wrong'}`, panels(), { request: n + 1 });
        if (!good) {
          seq.send('Server', 'Browser', '401 bad credentials (no cookie)', 'error', true);
          statuses.push(401);
          step(r, 'reject', 'Wrong password: 401, nothing stored, no cookie set', panels(), { request: n + 1, status: 401 });
          return;
        }
        const sid = 'sid_' + toHex(sha256('session-' + ++counter)).slice(0, 8);
        step(r, 'mint', `Server mints a random session id: ${sid}`, panels(), { request: n + 1, sid });
        store.set(sid, 'user_id=1 (alice)');
        seq.send('Server', 'Session store', `SET ${sid} = alice`);
        step(r, 'store', 'The id maps to the user in the server-side store', panels(sid), { request: n + 1, sid });
        jar = sid;
        saved = sid;
        seq.send('Server', 'Browser', `200 Set-Cookie: sessionid=${sid}`, 'done', true);
        statuses.push(200);
        step(r, 'cookie', 'Browser saves the cookie and will attach it to every request', panels(sid), { request: n + 1, status: 200 });
      } else if (act.kind === 'profile') {
        seq.send('Browser', 'Server', `GET /profile (${cookieText})`);
        const sid = cookieOut;
        step(r, 'lookup', sid ? `Server reads the cookie and looks ${sid} up` : 'Request has no session cookie to look up', panels(), { request: n + 1 });
        const user = sid ? store.get(sid) : undefined;
        if (sid) {
          seq.send('Server', 'Session store', `GET ${sid}`);
          seq.send('Session store', 'Server', user ? `alice` : 'nil', user ? 'done' : 'error', true);
          step(r, 'lookup', user ? 'Store knows this id: the request belongs to alice' : 'Store has no such id: the cookie is worthless now', panels(user ? sid : undefined), { request: n + 1 });
        }
        if (user) {
          seq.send('Server', 'Browser', '200 {"user_id": 1}', 'done', true);
          statuses.push(200);
          step(r, 'allow', 'Authenticated: 200 with alice\'s profile', panels(sid ?? undefined), { request: n + 1, status: 200 });
        } else {
          seq.send('Server', 'Browser', '401 login required', 'error', true);
          statuses.push(401);
          step(r, 'deny', act.replay ? 'Replayed cookie rejected: logout deleted it server-side' : 'Anonymous request: 401 login required', panels(), { request: n + 1, status: 401 });
        }
      } else {
        seq.send('Browser', 'Server', `POST /logout (${cookieText})`);
        step(r, 'destroy', 'Server deletes the session from its store', panels(jar ?? undefined), { request: n + 1 });
        if (jar) {
          seq.send('Server', 'Session store', `DELETE ${jar}`);
          store.delete(jar);
        }
        seq.send('Server', 'Browser', '200 (cookie cleared)', 'done', true);
        jar = null;
        statuses.push(200);
        step(r, 'bye', 'Logged out: the id is gone from the store, the jar is empty', panels(), { request: n + 1, status: 200 });
      }
    });
    step(r, 0, `Status codes in order: ${statuses.join(', ')}`, [kvJar(), kvStore()], { statuses: statuses.join(',') });
    return { frames: r.frames, result: statuses };
  },
  reference({ flow }) {
    const table: Record<string, number[]> = {
      'login, profile, logout': [200, 200, 200, 401],
      'profile without login': [401],
      'wrong password': [401],
      'stolen cookie after logout': [200, 200, 401],
    };
    return table[flow];
  },
};

const HARNESS = `
from minidjango import auth
from minidjango.http import App, path, JsonResponse
from minidjango.test import Client

def me_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "login required"}, status=401)
    return JsonResponse({"username": request.user.username})

def logout_view(request):
    auth.logout(request)
    return JsonResponse({"detail": "bye"})

def good_login_view(request):
    user = auth.authenticate(request.data.get("username"), request.data.get("password"))
    if user is None:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)
    auth.login(request, user)
    return JsonResponse({"username": user.username})

def _app(login, logout):
    import minidjango
    minidjango.reset()
    auth.create_user("alice", "secret1")
    return App(
        [path("login/", login), path("me/", me_view), path("logout/", logout)],
        middleware=[auth.SessionMiddleware, auth.AuthenticationMiddleware],
    )

def run_flow(login_view, steps):
    client = Client(_app(login_view, logout_view))
    out = []
    for method, url, data in steps:
        r = client.request(method, url, data)
        out.append([r.status_code, r.json()])
    return out

def run_logout(logout_fn, mode):
    app = _app(good_login_view, logout_fn)
    owner = Client(app)
    if mode != "anonymous":
        owner.post("/login/", {"username": "alice", "password": "secret1"})
    saved = dict(owner.cookies)
    logout_status = owner.post("/logout/").status_code
    if mode == "thief":
        client = Client(app)
        client.cookies = saved
    else:
        client = owner
    return [logout_status, client.get("/me/").status_code]
`;

const LOGIN = { username: 'alice', password: 'secret1' };

const unit: Unit = {
  id: 'be-sessions',
  hook: 'Session cookies are still how most websites authenticate people. Interviewers ask where the state lives, what the cookie actually contains and what happens on logout, because that is where sessions and JWTs differ.',
  predict: {
    prompt: 'After a successful login the browser holds a cookie sessionid=sid_9f3a. Where does the information "this id belongs to alice" live?',
    options: ['Inside the cookie itself, signed by the server', 'In the server-side session store, keyed by that id', 'In the browser\'s localStorage', 'In the URL of every request'],
    answer: 1,
    explain: 'With classic sessions the cookie is only an unguessable key. The user, expiry and any data live on the server, which is why the server can revoke a session instantly by deleting the entry.',
  },
  viz,
  deeper: {
    points: [
      'The session id is a long random, unguessable value. The cookie carries only that id; the server keeps the data (database, Redis or cache).',
      'The browser attaches the cookie to every request for that site automatically, so the server needs no code on the client.',
      'Logout means deleting the server-side entry. Clearing the cookie in the browser alone does not stop anyone who copied it.',
      'Cookie flags matter: HttpOnly hides it from JavaScript (XSS), Secure keeps it on HTTPS, SameSite limits cross-site sending (CSRF).',
      'Rotate the session id at login to prevent session fixation, and expire idle sessions.',
    ],
    pitfalls: ['Only clearing the cookie on logout', 'Reusing the pre-login session id after authentication (session fixation)', 'Putting the user id in a plain, unsigned cookie', 'Forgetting HttpOnly and Secure'],
  },
  practice: {
    language: 'python',
    fnName: 'login_view',
    statement: 'Write login_view(request): authenticate request.data["username"] / ["password"] (use .get) with auth.authenticate; on failure return JsonResponse({"detail": "Invalid credentials"}, status=401); on success call auth.login(request, user) and return JsonResponse({"username": ...}). auth and JsonResponse are already imported.',
    signature: 'def login_view(request):',
    solution: `def login_view(request):
    user = @@auth.authenticate(request.data.get("username"), request.data.get("password"))@@
    if user is None:
        return JsonResponse({"detail": "Invalid credentials"}, status=@@401@@)
    @@auth.login(request, user)@@
    return JsonResponse({"username": user.username})`,
    harness: HARNESS,
    adapter: 'run_flow',
    tests: [
      { args: [[['GET', '/me/', null]]], expected: [[401, { detail: 'login required' }]], name: 'anonymous is rejected' },
      { args: [[['POST', '/login/', LOGIN], ['GET', '/me/', null]]], expected: [[200, { username: 'alice' }], [200, { username: 'alice' }]], name: 'login then profile' },
      { args: [[['POST', '/login/', { username: 'alice', password: 'nope' }], ['GET', '/me/', null]]], expected: [[401, { detail: 'Invalid credentials' }], [401, { detail: 'login required' }]], name: 'wrong password' },
      { args: [[['POST', '/login/', { username: 'mallory', password: 'x' }]]], expected: [[401, { detail: 'Invalid credentials' }]], name: 'unknown user' },
      { args: [[['POST', '/login/', LOGIN], ['POST', '/logout/', null], ['GET', '/me/', null]]], expected: [[200, { username: 'alice' }], [200, { detail: 'bye' }], [401, { detail: 'login required' }]], name: 'logout ends the session' },
      { args: [[['POST', '/login/', {}]]], expected: [[401, { detail: 'Invalid credentials' }]], name: 'empty body' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'logout_view',
    statement: 'Logout looks fine in the browser, but anyone who copied the session cookie before logout can still use it. Fix logout_view (it must still return a 200 JSON response and clear the cookie).',
    buggy: `def logout_view(request):
    response = JsonResponse({"detail": "bye"})
    response.set_cookie("sessionid", "")
    return response`,
    fixed: `def logout_view(request):
    auth.logout(request)
    response = JsonResponse({"detail": "bye"})
    response.set_cookie("sessionid", "")
    return response`,
    harness: HARNESS,
    adapter: 'run_logout',
    tests: [
      { args: ['owner'], expected: [200, 401], name: 'owner is logged out' },
      { args: ['thief'], expected: [200, 401], name: 'copied cookie stops working' },
      { args: ['anonymous'], expected: [200, 401], name: 'logout without a session' },
    ],
    bugType: 'client-side-only logout',
    hint: 'The browser forgets the cookie. What does the server still remember?',
    explanation: 'The session lives in the server-side store. Setting an empty cookie only affects this browser; a copied cookie still maps to a live session. auth.logout(request) deletes the entry so the id becomes worthless.',
  },
  boss: {
    title: 'Session store with sliding expiry',
    statement: 'Write class SessionStore(ttl). create(user, now) returns ids "s1", "s2", ... get(sid, now) returns the user, or None for unknown or expired ids; a session expires when now - last_seen >= ttl (and is deleted), and every successful get refreshes last_seen (sliding expiry). destroy(sid) returns True if it existed. destroy_user(user) deletes all of that user\'s sessions and returns how many. count(now) purges expired sessions and returns how many remain. Pass time explicitly; never read the clock.',
    language: 'python',
    fnName: 'SessionStore',
    starter: `class SessionStore:
    # your code here
    pass
`,
    solution: `class SessionStore:
    def __init__(self, ttl):
        self.ttl = ttl
        self.sessions = {}  # sid -> [user, last_seen]
        self.counter = 0

    def create(self, user, now):
        self.counter += 1
        sid = f"s{self.counter}"
        self.sessions[sid] = [user, now]
        return sid

    def _alive(self, sid, now):
        entry = self.sessions.get(sid)
        if entry is None:
            return False
        if now - entry[1] >= self.ttl:
            del self.sessions[sid]
            return False
        return True

    def get(self, sid, now):
        if not self._alive(sid, now):
            return None
        self.sessions[sid][1] = now
        return self.sessions[sid][0]

    def destroy(self, sid):
        return self.sessions.pop(sid, None) is not None

    def destroy_user(self, user):
        doomed = [s for s, (u, _) in self.sessions.items() if u == user]
        for s in doomed:
            del self.sessions[s]
        return len(doomed)

    def count(self, now):
        for sid in list(self.sessions):
            self._alive(sid, now)
        return len(self.sessions)`,
    harness: `
def run_store(cls, ttl, ops):
    store = cls(ttl)
    out = []
    for op in ops:
        out.append(getattr(store, op[0])(*op[1:]))
    return out
`,
    adapter: 'run_store',
    tests: [
      { args: [10, [['create', 'alice', 0], ['get', 's1', 5], ['get', 's1', 14], ['get', 's1', 24], ['get', 's1', 25]]], expected: ['s1', 'alice', 'alice', null, null], name: 'sliding expiry' },
      { args: [10, [['create', 'alice', 0], ['create', 'bob', 0], ['destroy', 's1'], ['get', 's1', 1], ['get', 's2', 1], ['destroy', 's1']]], expected: ['s1', 's2', true, null, 'bob', false], name: 'destroy' },
      { args: [10, [['create', 'alice', 0], ['create', 'alice', 1], ['create', 'bob', 2], ['destroy_user', 'alice'], ['get', 's1', 3], ['get', 's3', 3], ['count', 3]]], expected: ['s1', 's2', 's3', 2, null, 'bob', 1], name: 'log out everywhere' },
      { args: [10, [['create', 'a', 0], ['create', 'b', 6], ['count', 12]]], expected: ['s1', 's2', 1], name: 'count purges expired' },
      { args: [10, [['get', 'nope', 0]]], expected: [null], name: 'unknown id' },
    ],
    hints: ['Keep a dict sid -> [user, last_seen] and a counter for ids. A helper that checks (and deletes) an expired entry keeps get() and count() short.', 'Expired means now - last_seen >= ttl. Only refresh last_seen after you know the session is alive.'],
    combines: ['be-sessions'],
  },
  quiz: [
    {
      prompt: 'An attacker steals a session cookie. What is the fastest way to cut off that attacker?',
      options: ['Wait for the browser to expire the cookie', 'Delete the session entry on the server', 'Ask the user to clear cookies', 'Change the cookie name'],
      answer: 1,
      explain: 'The server decides whether an id is valid. Deleting the entry invalidates every copy of the cookie at once.',
    },
  ],
  simulationNote: 'Tasks run on minidjango (an in-memory stand-in for Django\'s auth and sessions). Session ids in the visualizer come from a deterministic hash, not real randomness.',
};

export default unit;
