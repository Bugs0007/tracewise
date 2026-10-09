import { Recorder } from '@/engine/recorder';
import type { GridPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { NOTES_HARNESS, SIM_MINIDJANGO, clip } from '@/content/lib/finish-m2m3';

const code = `
def check_endpoint(client):
    failures = []
    alice, bob = {"x-user": "alice"}, {"x-user": "bob"}
    if client.get("/notes/").status_code != 401:                          #@login
        failures.append("requires login")
    if client.post("/notes/", {"title": ""}, alice).status_code != 400:  #@validation
        failures.append("rejects empty title")
    made = client.post("/notes/", {"title": "Buy milk"}, alice)          #@create
    if made.status_code != 201:
        failures.append("creates note")
    pk = made.json()["id"]
    if client.get("/notes/999/", None, alice).status_code != 404:        #@missing
        failures.append("returns 404 for missing")
    if client.get("/notes/%d/" % pk, None, bob).status_code != 403:      #@owner
        failures.append("forbids other user's note")
    client.delete("/notes/%d/" % pk, alice)                              #@delete
    if client.get("/notes/%d/" % pk, None, alice).status_code != 404:    #@gone
        failures.append("delete removes note")
    return failures                                                      #@done
`;

const VARIANTS = ['ok', 'no_auth', 'no_validation', 'bad_404', 'wrong_owner', 'delete_noop'] as const;
const NAMES = {
  login: 'requires login',
  validation: 'rejects empty title',
  create: 'creates note',
  missing: 'returns 404 for missing',
  owner: "forbids other user's note",
  delete: 'delete removes note',
} as const;
type Key = keyof typeof NAMES;
const KEYS = Object.keys(NAMES) as Key[];

interface In {
  variant: string;
  skip: string[];
}

interface Res {
  status: number;
  body?: Record<string, unknown>;
}

/** A tiny TypeScript twin of the notes API, with one planted bug per variant. */
class NotesApp {
  notes = new Map<number, { title: string; owner: string }>();
  next = 1;
  constructor(readonly variant: string) {}

  call(method: string, path: string, user: string | null, body?: { title?: string }): Res {
    const who = user ?? (this.variant === 'no_auth' ? 'anonymous' : null);
    if (who === null) return { status: 401 };
    if (path === '/notes/') {
      if (method === 'GET') return { status: 200 };
      const title = (body?.title ?? '').trim();
      if (!title && this.variant !== 'no_validation') return { status: 400 };
      const id = this.next++;
      this.notes.set(id, { title, owner: who });
      return { status: 201, body: { id, title } };
    }
    const id = Number(path.split('/')[2]);
    const note = this.notes.get(id);
    if (!note) return { status: this.variant === 'bad_404' ? 200 : 404 };
    if (note.owner !== who && this.variant !== 'wrong_owner') return { status: 403 };
    if (method === 'DELETE') {
      if (this.variant !== 'delete_noop') this.notes.delete(id);
      return { status: 204 };
    }
    return { status: 200, body: { id, title: note.title } };
  }
}

const viz: VizDef<In> = {
  id: 'be-testing',
  title: 'One test per behaviour of an endpoint',
  code,
  language: 'python',
  inputs: [
    { key: 'variant', label: 'App under test (which bug is planted)', kind: 'select', options: [...VARIANTS], default: 'wrong_owner' },
    { key: 'skip', label: 'Scenarios you did NOT write', kind: 'strings', default: [], maxItems: 6, help: 'Any of: ' + KEYS.join(', ') },
  ],
  presets: [
    { label: 'Healthy app', input: { variant: 'ok', skip: [] } },
    { label: 'Missing ownership check', input: { variant: 'wrong_owner', skip: [] } },
    { label: 'Same bug, test not written', input: { variant: 'wrong_owner', skip: ['owner'] } },
    { label: 'Delete does nothing', input: { variant: 'delete_noop', skip: [] } },
  ],
  run({ variant, skip }) {
    if (!(VARIANTS as readonly string[]).includes(variant)) throw new Error('variant must be one of ' + VARIANTS.join(', '));
    const bad = skip.filter((s) => !KEYS.includes(s as Key));
    if (bad.length) throw new Error('Unknown scenario: ' + bad.join(', ') + '. Use: ' + KEYS.join(', '));
    const r = new Recorder(code);
    const app = new NotesApp(variant);
    const rows: string[][] = KEYS.map(() => ['', '', '']);
    const tones: Record<string, Tone> = {};
    const failures: string[] = [];
    const table = (): GridPanel => ({ type: 'grid', title: `Test results against "${variant}"`, cells: rows.map((x) => [...x]), tones: { ...tones }, rowLabels: KEYS.map((k) => NAMES[k]), colLabels: ['expected', 'actual', 'verdict'] });
    const view = (): Panel[] => [table()];

    r.step(undefined, clip(`Run the whole check against the "${variant}" app, one scenario at a time`), view(), { app: variant });
    let pk = 0;
    const record = (key: Key, expected: number, actual: number, anchor: string): void => {
      const i = KEYS.indexOf(key);
      const pass = expected === actual;
      rows[i] = [String(expected), String(actual), pass ? 'pass' : 'FAIL'];
      tones[`${i},2`] = pass ? 'found' : 'error';
      tones[`${i},1`] = pass ? 'done' : 'error';
      if (!pass) failures.push(NAMES[key]);
      r.op();
      r.step(anchor, clip(pass ? `${NAMES[key]}: got ${actual} as expected` : `${NAMES[key]}: expected ${expected} but the app answered ${actual}`), view(), { failures: failures.length });
    };
    const skipped = (key: Key, anchor: string): boolean => {
      if (!skip.includes(key)) return false;
      const i = KEYS.indexOf(key);
      rows[i] = ['-', '-', 'not tested'];
      tones[`${i},2`] = 'muted';
      r.step(anchor, clip(`No test for "${NAMES[key]}": whatever the app does here goes unnoticed`), view(), { failures: failures.length });
      return true;
    };

    // The app is exercised even for skipped scenarios (the state they create still matters).
    const login = app.call('GET', '/notes/', null);
    if (!skipped('login', 'login')) record('login', 401, login.status, 'login');
    const val = app.call('POST', '/notes/', 'alice', { title: '' });
    if (!skipped('validation', 'validation')) record('validation', 400, val.status, 'validation');
    const made = app.call('POST', '/notes/', 'alice', { title: 'Buy milk' });
    pk = Number(made.body?.id ?? 0);
    if (!skipped('create', 'create')) record('create', 201, made.status, 'create');
    const miss = app.call('GET', '/notes/999/', 'alice');
    if (!skipped('missing', 'missing')) record('missing', 404, miss.status, 'missing');
    const other = app.call('GET', `/notes/${pk}/`, 'bob');
    if (!skipped('owner', 'owner')) record('owner', 403, other.status, 'owner');
    app.call('DELETE', `/notes/${pk}/`, 'alice');
    const gone = app.call('GET', `/notes/${pk}/`, 'alice');
    if (!skipped('delete', 'gone')) record('delete', 404, gone.status, 'gone');
    r.step('done', clip(failures.length ? `The check reports ${failures.length} failing scenario(s): ${failures.join(', ')}` : 'No failures reported: either the app is right or the tests are blind'), view(), { failures: failures.length });
    return { frames: r.frames, result: failures };
  },
  reference({ variant, skip }) {
    const culprits: Record<string, Key[]> = { ok: [], no_auth: ['login'], no_validation: ['validation'], bad_404: ['missing', 'delete'], wrong_owner: ['owner'], delete_noop: ['delete'] };
    return culprits[variant].filter((k) => !skip.includes(k)).map((k) => NAMES[k]);
  },
};

const unit: Unit = {
  id: 'be-testing',
  hook: '"How would you test this endpoint?" is asked to see whether you think beyond the happy path. A good answer walks through validation, authentication, permissions, missing objects and side effects, in that spirit.',
  simulationNote: SIM_MINIDJANGO + ' The Client calls the app directly, with no network, just like Django\'s test client.',
  predict: {
    prompt: 'An endpoint returns the right JSON when a note owner reads their note. The only test you wrote checks exactly that. Which bug would it still let through?',
    options: ['Any logged-in user can read anyone\'s notes', 'The JSON field is misspelled', 'The server crashes on the happy path', 'The response is missing a status code'],
    answer: 0,
    explain: 'A happy-path test only proves the owner can read the note. Permission bugs hide in the paths nobody exercised: another user, no user, a missing object. Each behaviour deserves its own test.',
  },
  viz,
  deeper: {
    points: [
      'Per endpoint, think in scenarios: happy path, validation errors, unauthenticated (401), unauthorised (403), missing object (404), and the side effect actually happening (or not).',
      'Assert the status code AND the effect. A DELETE that returns 204 but leaves the row behind passes a status-only test.',
      'Each test should fail for one reason, with a name that says what broke ("forbids other user\'s note") instead of "test_3".',
      'Use a test client that calls the app in-process: it is fast, deterministic and needs no network or server.',
      'Start every test from a clean state (fresh database, fresh session) so tests cannot depend on each other.',
      'A test that never failed has not proven anything: try breaking the code on purpose (mutation) and watch the test go red.',
    ],
    pitfalls: ['Using the owner account in the "other user" test, so the permission test passes vacuously', 'Only asserting 200 and never the response body', 'Tests that share data and only pass in one order'],
  },
  practice: {
    language: 'python',
    fnName: 'check_endpoint',
    harness: NOTES_HARNESS,
    adapter: 'run_check',
    statement: 'Write `check_endpoint(client)` that probes a notes API and returns the names of the scenarios that FAIL, in this order: "requires login" (GET /notes/ without header `x-user` gives 401), "rejects empty title" (POST empty title as alice gives 400), "creates note" (POST "Buy milk" gives 201), "returns 404 for missing" (GET /notes/999/ as alice), "forbids other user\'s note" (bob GETs alice\'s note: 403), "delete removes note" (alice DELETEs it, then GET gives 404). Send the user as the `x-user` header.',
    signature: 'def check_endpoint(client):',
    solution: `def check_endpoint(client):
    failures = []
    alice = {"x-user": "alice"}
    bob = {"x-user": "bob"}
    if client.get("/notes/").status_code != @@401@@:
        failures.append("requires login")
    if client.post("/notes/", {"title": ""}, alice).status_code != 400:
        failures.append("rejects empty title")
    made = client.post("/notes/", {"title": "Buy milk"}, alice)
    if made.status_code != 201:
        failures.append("creates note")
    pk = made.json()["id"]
    if client.get("/notes/999/", None, alice).status_code != @@404@@:
        failures.append("returns 404 for missing")
    if client.get("/notes/%d/" % pk, None, @@bob@@).status_code != 403:
        failures.append("forbids other user's note")
    client.delete("/notes/%d/" % pk, alice)
    if client.get("/notes/%d/" % pk, None, alice).status_code != @@404@@:
        failures.append("delete removes note")
    return failures`,
    tests: [
      { args: ['ok'], expected: [], name: 'healthy app reports nothing' },
      { args: ['no_auth'], expected: ['requires login'], name: 'anonymous users get in' },
      { args: ['no_validation'], expected: ['rejects empty title'], name: 'empty title accepted' },
      { args: ['bad_404'], expected: ['returns 404 for missing', 'delete removes note'], name: 'missing note answers 200 (also after delete)' },
      { args: ['wrong_owner'], expected: ["forbids other user's note"], name: 'anyone can read any note' },
      { args: ['delete_noop'], expected: ['delete removes note'], name: 'delete does nothing' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'check_endpoint',
    harness: NOTES_HARNESS,
    adapter: 'run_check',
    statement: 'The permission scenario in this check can never fail: it reports a problem on a healthy app and stays silent when anyone can read any note. Fix the check.',
    buggy: `def check_endpoint(client):
    failures = []
    alice = {"x-user": "alice"}
    bob = {"x-user": "bob"}
    made = client.post("/notes/", {"title": "Buy milk"}, alice)
    pk = made.json()["id"]
    if client.get("/notes/%d/" % pk, None, alice).status_code != 403:
        failures.append("forbids other user's note")
    if client.get("/notes/999/", None, alice).status_code != 404:
        failures.append("returns 404 for missing")
    return failures`,
    fixed: `def check_endpoint(client):
    failures = []
    alice = {"x-user": "alice"}
    bob = {"x-user": "bob"}
    made = client.post("/notes/", {"title": "Buy milk"}, alice)
    pk = made.json()["id"]
    if client.get("/notes/%d/" % pk, None, bob).status_code != 403:
        failures.append("forbids other user's note")
    if client.get("/notes/999/", None, alice).status_code != 404:
        failures.append("returns 404 for missing")
    return failures`,
    tests: [
      { args: ['ok'], expected: [], name: 'healthy app' },
      { args: ['wrong_owner'], expected: ["forbids other user's note"], name: 'ownership bug is caught' },
      { args: ['bad_404'], expected: ['returns 404 for missing'], name: '404 bug is caught' },
    ],
    bugType: 'test uses the wrong actor',
    hint: 'Who is making the request in the "other user" check? Is that really another user?',
    explanation: 'The "other user" test sent the request as alice, the owner. The owner is always allowed, so a healthy app looks broken and a broken app looks fine. A permission test must act as someone who should be refused.',
  },
  boss: {
    title: 'Permission matrix',
    statement: 'Write `permission_matrix(client)` returning the list of six status codes you observe, in this order, after alice (header `x-user`) creates a note titled "n": (1) anonymous GET /notes/; (2) alice GET her note; (3) bob GET alice\'s note; (4) bob DELETE alice\'s note; (5) alice DELETE her note; (6) alice GET her note again. Read the note id from the creation response. Run against any app variant; the harness gives you `client`.',
    language: 'python',
    fnName: 'permission_matrix',
    harness: NOTES_HARNESS,
    adapter: 'run_check',
    starter: `def permission_matrix(client):
    # your code here
    pass
`,
    solution: `def permission_matrix(client):
    alice = {"x-user": "alice"}
    bob = {"x-user": "bob"}
    pk = client.post("/notes/", {"title": "n"}, alice).json()["id"]
    url = "/notes/%d/" % pk
    out = [client.get("/notes/").status_code]
    out.append(client.get(url, None, alice).status_code)
    out.append(client.get(url, None, bob).status_code)
    out.append(client.delete(url, bob).status_code)
    out.append(client.delete(url, alice).status_code)
    out.append(client.get(url, None, alice).status_code)
    return out`,
    tests: [
      { args: ['ok'], expected: [401, 200, 403, 403, 204, 404], name: 'healthy app' },
      { args: ['no_auth'], expected: [200, 200, 403, 403, 204, 404], name: 'anonymous allowed in' },
      { args: ['bad_404'], expected: [401, 200, 403, 403, 204, 200], name: 'soft 404' },
      { args: ['wrong_owner'], expected: [401, 200, 200, 204, 404, 404], name: 'bob can read and delete alice\'s note' },
      { args: ['delete_noop'], expected: [401, 200, 403, 403, 204, 200], name: 'note survives its own deletion' },
    ],
    hints: ['Create the note first as alice and keep its id; every later URL is built from it. The matrix is just six calls whose status codes you collect.', 'Order matters: bob\'s DELETE (4) happens before alice\'s DELETE (5), and the final GET (6) comes last. Use client.delete(url, headers) and client.get(url, None, headers).'],
    combines: ['be-request-lifecycle', 'be-rest-methods'],
  },
  quiz: [
    {
      prompt: 'After DELETE /notes/7/ returns 204, what is the strongest extra assertion?',
      options: ['The response body is empty', 'A following GET /notes/7/ returns 404', 'The Content-Type is JSON', 'The status is below 300'],
      answer: 1,
      explain: 'Status codes describe the response, not the state change. Reading the resource back proves the side effect really happened.',
    },
  ],
};

export default unit;
