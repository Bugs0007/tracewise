import { Recorder } from '@/engine/recorder';
import type { GridPanel, ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, statusTone } from '@/content/lib/backend-rest';

const code = `
def handle(method, path, body, user, notes):
    parts = path.strip("/").split("/")                       #@route
    if parts[0] != "notes" or len(parts) > 2:
        return 404                                           #@no_route
    allowed = ["GET", "POST"] if len(parts) == 1 else ["GET", "PUT", "DELETE"]   #@allowed
    if method not in allowed:
        return 405                                           #@e405
    if method != "GET" and user is None:
        return 401                                           #@e401
    if len(parts) == 1:                                      #@collection
        if method == "GET":
            return 200                                       #@list
        if not isinstance(body, dict):
            return 400                                       #@e400
        if not valid_title(body):
            return 422                                       #@e422
        if any(n["title"] == body["title"] for n in notes):
            return 409                                       #@e409
        return 201                                           #@e201
    note = find(notes, parts[1])                             #@item
    if note is None:
        return 404                                           #@e404
    if method == "GET":
        return 200                                           #@get
    if note["owner"] != user:
        return 403                                           #@e403
    if method == "DELETE":
        return 204                                           #@e204
    if not isinstance(body, dict) or not valid_title(body):
        return 422                                           #@e422put
    return 200                                               #@put
`;

interface Note {
  id: number;
  owner: string;
  title: string;
}
interface Req {
  method: string;
  path: string;
  body?: unknown;
  user: string | null;
}
interface In {
  scenario: string;
}

const SCENARIOS: Record<string, Req[]> = {
  'Notes API tour': [
    { method: 'GET', path: '/notes', user: 'ann' },
    { method: 'POST', path: '/notes', body: { title: 'milk' }, user: 'ann' },
    { method: 'POST', path: '/notes', body: { title: 'milk' }, user: 'ann' },
    { method: 'PUT', path: '/notes/1', body: { title: 'rent!' }, user: 'ann' },
    { method: 'DELETE', path: '/notes/2', user: 'ann' },
    { method: 'GET', path: '/notes/2', user: 'ann' },
    { method: 'PATCH', path: '/notes', body: { title: 'x' }, user: 'ann' },
  ],
  'Bad requests': [
    { method: 'POST', path: '/notes', body: 'oops', user: 'ann' },
    { method: 'POST', path: '/notes', body: { title: '' }, user: 'ann' },
    { method: 'POST', path: '/notes', body: { title: 'eggs' }, user: null },
    { method: 'GET', path: '/users', user: 'ann' },
    { method: 'DELETE', path: '/notes', user: 'ann' },
    { method: 'PUT', path: '/notes/1', body: { title: '' }, user: 'bob' },
  ],
  'Who may do what': [
    { method: 'DELETE', path: '/notes/1', user: null },
    { method: 'DELETE', path: '/notes/1', user: 'ann' },
    { method: 'GET', path: '/notes/1', user: null },
    { method: 'DELETE', path: '/notes/1', user: 'bob' },
    { method: 'DELETE', path: '/notes/1', user: 'bob' },
  ],
};

const validTitle = (b: unknown) => typeof b === 'object' && b !== null && typeof (b as any).title === 'string' && (b as any).title.trim() !== '';

/** Returns [status, anchor of the deciding line, why]. */
function decide(req: Req, notes: Note[]): [number, string, string] {
  const parts = req.path.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] !== 'notes' || parts.length > 2) return [404, 'no_route', `404: no route matches ${req.path}`];
  const coll = parts.length === 1;
  const allowed = coll ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
  if (!allowed.includes(req.method)) return [405, 'e405', `405: ${req.method} is not allowed here (${allowed.join(', ')})`];
  if (req.method !== 'GET' && req.user === null) return [401, 'e401', '401: writes need a logged-in user'];
  if (coll) {
    if (req.method === 'GET') return [200, 'list', '200: reading the collection is safe'];
    if (typeof req.body !== 'object' || req.body === null) return [400, 'e400', '400: the body is not a JSON object'];
    if (!validTitle(req.body)) return [422, 'e422', '422: JSON is fine, but title is blank or missing'];
    const t = (req.body as Note).title;
    if (notes.some((n) => n.title === t)) return [409, 'e409', `409: a note titled "${t}" already exists`];
    return [201, 'e201', '201 Created, with a Location header for the new note'];
  }
  const note = notes.find((n) => String(n.id) === parts[1]);
  if (!note) return [404, 'e404', `404: there is no note ${parts[1]}`];
  if (req.method === 'GET') return [200, 'get', '200: anyone may read a note'];
  if (note.owner !== req.user) return [403, 'e403', `403: note ${note.id} belongs to ${note.owner}, not ${req.user}`];
  if (req.method === 'DELETE') return [204, 'e204', '204 No Content: deleted, nothing to send back'];
  if (typeof req.body !== 'object' || req.body === null || !validTitle(req.body)) return [422, 'e422put', '422: a replacement note needs a non-blank title'];
  return [200, 'put', '200: the note was replaced'];
}

const INFO: Record<string, [string, string]> = {
  GET: ['yes', 'yes'],
  HEAD: ['yes', 'yes'],
  POST: ['no', 'no'],
  PUT: ['no', 'yes'],
  PATCH: ['no', 'no'],
  DELETE: ['no', 'yes'],
};

const viz: VizDef<In> = {
  id: 'be-rest-methods',
  title: 'HTTP methods & status codes',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Request table', kind: 'select', default: 'Notes API tour', options: Object.keys(SCENARIOS) }],
  presets: Object.keys(SCENARIOS).map((label) => ({ label, input: { scenario: label } })),
  run({ scenario }) {
    const r = new Recorder(code);
    const reqs = SCENARIOS[scenario] ?? SCENARIOS['Notes API tour'];
    const notes: Note[] = [{ id: 1, owner: 'bob', title: 'rent' }];
    let nextId = 2;
    const rows: { req: Req; status?: number }[] = [];
    const statuses: number[] = [];
    const table = (): GridPanel => {
      const tones: Record<string, Tone> = {};
      rows.forEach((row, i) => {
        if (row.status !== undefined) tones[`${i},4`] = statusTone(row.status);
        else tones[`${i},4`] = 'active';
      });
      return {
        type: 'grid',
        title: 'Requests',
        colLabels: ['Method', 'Path', 'Body', 'User', 'Status'],
        cells: rows.map((row) => [row.req.method, row.req.path, row.req.body === undefined ? '-' : JSON.stringify(row.req.body), row.req.user ?? 'anonymous', row.status ?? '?']),
        tones,
      };
    };
    const db = (): ListPanel => ({
      type: 'list',
      title: 'notes table',
      orientation: 'horizontal',
      items: notes.map((n) => ({ id: `n${n.id}`, label: `#${n.id} ${n.title}`, sub: n.owner, tone: 'default' as Tone })),
      emptyText: 'empty',
    });
    const info = (m: string): Panel => kvPanel(`${m} semantics`, { 'safe (no state change)': (INFO[m] ?? ['?', '?'])[0], 'idempotent (replay = same state)': (INFO[m] ?? ['?', '?'])[1] });
    for (const req of reqs) {
      rows.push({ req });
      r.step('route', `${req.method} ${req.path} as ${req.user ?? 'anonymous'}: which status?`, [table(), info(req.method), db()], { method: req.method, path: req.path });
      r.op();
      const [status, anchor, why] = decide(req, notes);
      rows[rows.length - 1].status = status;
      if (status === 201) notes.push({ id: nextId++, owner: req.user!, title: (req.body as Note).title });
      if (status === 204) notes.splice(notes.findIndex((n) => String(n.id) === req.path.split('/')[2]), 1);
      if (status === 200 && req.method === 'PUT') notes.find((n) => String(n.id) === req.path.split('/')[2])!.title = (req.body as Note).title;
      statuses.push(status);
      r.step(anchor, why, [table(), info(req.method), db()], { status });
    }
    return { frames: r.frames, result: statuses };
  },
  reference({ scenario }) {
    // Independent, table-driven version of the same rules.
    const reqs = SCENARIOS[scenario] ?? SCENARIOS['Notes API tour'];
    const db: Note[] = [{ id: 1, owner: 'bob', title: 'rent' }];
    let next = 2;
    return reqs.map((q) => {
      const segs = q.path.split('/').filter(Boolean);
      if (segs[0] !== 'notes' || segs.length > 2) return 404;
      const verbs = segs.length === 1 ? 'GET POST' : 'GET PUT DELETE';
      if (!verbs.split(' ').includes(q.method)) return 405;
      if (q.method !== 'GET' && !q.user) return 401;
      const bodyObj = typeof q.body === 'object' && q.body !== null;
      if (segs.length === 1) {
        if (q.method === 'GET') return 200;
        if (!bodyObj) return 400;
        if (!validTitle(q.body)) return 422;
        const title = (q.body as Note).title;
        if (db.some((n) => n.title === title)) return 409;
        db.push({ id: next++, owner: q.user!, title });
        return 201;
      }
      const idx = db.findIndex((n) => String(n.id) === segs[1]);
      if (idx < 0) return 404;
      if (q.method === 'GET') return 200;
      if (db[idx].owner !== q.user) return 403;
      if (q.method === 'DELETE') {
        db.splice(idx, 1);
        return 204;
      }
      if (!bodyObj || !validTitle(q.body)) return 422;
      db[idx].title = (q.body as Note).title;
      return 200;
    });
  },
};

const NOTES = [
  { id: 1, owner: 'bob', title: 'rent' },
  { id: 2, owner: 'ann', title: 'milk' },
];

const tests = [
  { args: ['GET', '/notes', null, null, NOTES], expected: 200, name: 'list is public' },
  { args: ['POST', '/notes', { title: 'eggs' }, 'ann', NOTES], expected: 201, name: 'create' },
  { args: ['POST', '/notes', { title: 'milk' }, 'ann', NOTES], expected: 409, name: 'duplicate title' },
  { args: ['POST', '/notes', 'oops', 'ann', NOTES], expected: 400, name: 'body is not an object' },
  { args: ['POST', '/notes', { title: '  ' }, 'ann', NOTES], expected: 422, name: 'blank title' },
  { args: ['POST', '/notes', { title: 'eggs' }, null, NOTES], expected: 401, name: 'anonymous write' },
  { args: ['PATCH', '/notes', { title: 'x' }, 'ann', NOTES], expected: 405, name: 'method not allowed' },
  { args: ['GET', '/users', null, 'ann', NOTES], expected: 404, name: 'unknown route' },
  { args: ['GET', '/notes/99', null, 'ann', NOTES], expected: 404, name: 'missing note' },
  { args: ['GET', '/notes/1', null, null, NOTES], expected: 200, name: 'read someone else\'s note' },
  { args: ['PUT', '/notes/1', { title: 'x' }, 'ann', NOTES], expected: 403, name: 'not the owner' },
  { args: ['DELETE', '/notes/2', null, 'ann', NOTES], expected: 204, name: 'owner deletes' },
  { args: ['DELETE', '/notes/1', null, null, NOTES], expected: 401, name: 'anonymous delete' },
  { args: ['PUT', '/notes/2', { title: 'bread' }, 'ann', NOTES], expected: 200, name: 'owner replaces' },
  { args: ['PUT', '/notes/2', { title: '' }, 'ann', NOTES], expected: 422, name: 'replace with blank title' },
];

const unit: Unit = {
  id: 'be-rest-methods',
  hook: 'Picking the right method and status code is the first thing a reviewer reads in your API. Mixing up 401/403 or 400/422 tells them you have not shipped a real client-facing API.',
  predict: {
    prompt: 'Ann is logged in and sends `DELETE /notes/1`. Note 1 exists but belongs to Bob. Which status should the server return?',
    options: ['401 Unauthorized', '403 Forbidden', '404 Not Found', '405 Method Not Allowed'],
    answer: 1,
    explain: 'The server knows who Ann is (so not 401) and the route accepts DELETE (so not 405). She simply may not touch Bob\'s data: 403. Some APIs return 404 to hide that the note exists, but that is a deliberate privacy choice.',
  },
  viz,
  deeper: {
    points: [
      '**Safe** methods (GET, HEAD) must not change state. **Idempotent** methods (GET, PUT, DELETE) can be replayed with the same end state. POST and PATCH are neither by default.',
      '401 means "I do not know who you are" (send credentials); 403 means "I know who you are, and the answer is no".',
      '400 is a request the server cannot parse at all; 422 is well-formed input that fails validation rules. Pick one convention per API and keep it.',
      '201 Created should come with a `Location` header; 204 No Content has no body; 405 should come with an `Allow` header.',
      '409 Conflict is for a state clash (duplicate title, stale version) rather than a bad value.',
    ],
    pitfalls: ['Returning 200 with `{"error": ...}` in the body', 'Using 403 for anonymous users', 'Making GET change data (prefetching crawlers will trigger it)'],
  },
  practice: {
    language: 'python',
    fnName: 'status_for',
    statement:
      'Return the status code for a request to a notes API. Rules in order: unknown path 404; wrong method 405 (collection allows GET/POST, item allows GET/PUT/DELETE); anonymous writes 401; then collection POST: body not a dict 400, blank title 422, duplicate title 409, else 201. For an item: missing 404, GET 200, non-owner 403, DELETE 204, PUT with bad body 400/422 else 200.',
    signature: 'def status_for(method, path, body, user, notes):',
    solution: `def check_body(body):
    if not isinstance(body, dict):
        return @@400@@
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        return @@422@@
    return None

def status_for(method, path, body, user, notes):
    parts = path.strip("/").split("/")
    if parts[0] != "notes" or len(parts) > 2:
        return 404
    allowed = ["GET", "POST"] if len(parts) == 1 else ["GET", "PUT", "DELETE"]
    if method not in allowed:
        return @@405@@
    if method != "GET" and @@user is None@@:
        return @@401@@
    if len(parts) == 1:
        if method == "GET":
            return 200
        problem = check_body(body)
        if problem:
            return problem
        if any(n["title"] == body["title"] for n in notes):
            return @@409@@
        return @@201@@
    note = next((n for n in notes if str(n["id"]) == parts[1]), None)
    if note is None:
        return 404
    if method == "GET":
        return 200
    if @@note["owner"] != user@@:
        return @@403@@
    if method == "DELETE":
        return @@204@@
    return check_body(body) or 200`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'status_for',
    statement: 'Anonymous users get the wrong status from this handler, and clients that rely on it never prompt for a login. Fix it.',
    buggy: `def check_body(body):
    if not isinstance(body, dict):
        return 400
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        return 422
    return None

def status_for(method, path, body, user, notes):
    parts = path.strip("/").split("/")
    if parts[0] != "notes" or len(parts) > 2:
        return 404
    allowed = ["GET", "POST"] if len(parts) == 1 else ["GET", "PUT", "DELETE"]
    if method not in allowed:
        return 405
    if method != "GET" and user is None:
        return 403
    if len(parts) == 1:
        if method == "GET":
            return 200
        problem = check_body(body)
        if problem:
            return problem
        if any(n["title"] == body["title"] for n in notes):
            return 409
        return 201
    note = next((n for n in notes if str(n["id"]) == parts[1]), None)
    if note is None:
        return 404
    if method == "GET":
        return 200
    if note["owner"] != user:
        return 403
    if method == "DELETE":
        return 204
    return check_body(body) or 200`,
    fixed: `def check_body(body):
    if not isinstance(body, dict):
        return 400
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        return 422
    return None

def status_for(method, path, body, user, notes):
    parts = path.strip("/").split("/")
    if parts[0] != "notes" or len(parts) > 2:
        return 404
    allowed = ["GET", "POST"] if len(parts) == 1 else ["GET", "PUT", "DELETE"]
    if method not in allowed:
        return 405
    if method != "GET" and user is None:
        return 401
    if len(parts) == 1:
        if method == "GET":
            return 200
        problem = check_body(body)
        if problem:
            return problem
        if any(n["title"] == body["title"] for n in notes):
            return 409
        return 201
    note = next((n for n in notes if str(n["id"]) == parts[1]), None)
    if note is None:
        return 404
    if method == "GET":
        return 200
    if note["owner"] != user:
        return 403
    if method == "DELETE":
        return 204
    return check_body(body) or 200`,
    tests,
    bugType: 'wrong status code (401 vs 403)',
    hint: 'Which status tells a client "authenticate and try again"?',
    explanation: '403 means "known user, not allowed". An anonymous caller has not been identified yet, so the right answer is 401 (ideally with a `WWW-Authenticate` header). Clients and browsers treat the two very differently.',
  },
  boss: {
    title: 'Responses with headers',
    statement:
      'Extend the notes API. `respond(method, path, body, user, notes)` returns `[status, headers]`. Same rules as before, but the item route also allows PATCH (needs a dict body, else 400; if `title` is present it must be non-blank, else 422; no 409 check). Add headers: 201 gets `{"Location": "/notes/<id>"}` where id is max existing id + 1; 405 gets `{"Allow": ...}` listing allowed methods in the order GET, POST, PUT, PATCH, DELETE; 401 gets `{"WWW-Authenticate": "Bearer"}`; everything else `{}`.',
    language: 'python',
    fnName: 'respond',
    starter: `def respond(method, path, body, user, notes):
    # your code here
    pass
`,
    solution: `def check_body(body):
    if not isinstance(body, dict):
        return 400
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        return 422
    return None

def respond(method, path, body, user, notes):
    parts = path.strip("/").split("/")
    if parts[0] != "notes" or len(parts) > 2:
        return [404, {}]
    allowed = ["GET", "POST"] if len(parts) == 1 else ["GET", "PUT", "PATCH", "DELETE"]
    if method not in allowed:
        return [405, {"Allow": ", ".join(allowed)}]
    if method != "GET" and user is None:
        return [401, {"WWW-Authenticate": "Bearer"}]
    if len(parts) == 1:
        if method == "GET":
            return [200, {}]
        problem = check_body(body)
        if problem:
            return [problem, {}]
        if any(n["title"] == body["title"] for n in notes):
            return [409, {}]
        new_id = max([n["id"] for n in notes], default=0) + 1
        return [201, {"Location": "/notes/" + str(new_id)}]
    note = next((n for n in notes if str(n["id"]) == parts[1]), None)
    if note is None:
        return [404, {}]
    if method == "GET":
        return [200, {}]
    if note["owner"] != user:
        return [403, {}]
    if method == "DELETE":
        return [204, {}]
    if method == "PATCH":
        if not isinstance(body, dict):
            return [400, {}]
        if "title" in body:
            problem = check_body(body)
            if problem:
                return [problem, {}]
        return [200, {}]
    return [check_body(body) or 200, {}]`,
    tests: [
      { args: ['POST', '/notes', { title: 'eggs' }, 'ann', NOTES], expected: [201, { Location: '/notes/3' }], name: 'Location header' },
      { args: ['POST', '/notes', { title: 'eggs' }, 'ann', []], expected: [201, { Location: '/notes/1' }], name: 'Location on empty table' },
      { args: ['PUT', '/notes', { title: 'eggs' }, 'ann', NOTES], expected: [405, { Allow: 'GET, POST' }], name: 'Allow on collection' },
      { args: ['POST', '/notes/2', { title: 'eggs' }, 'ann', NOTES], expected: [405, { Allow: 'GET, PUT, PATCH, DELETE' }], name: 'Allow on item' },
      { args: ['DELETE', '/notes/2', null, null, NOTES], expected: [401, { 'WWW-Authenticate': 'Bearer' }], name: 'anonymous' },
      { args: ['PATCH', '/notes/2', {}, 'ann', NOTES], expected: [200, {}], name: 'empty PATCH is fine' },
      { args: ['PATCH', '/notes/2', { title: '' }, 'ann', NOTES], expected: [422, {}], name: 'PATCH blank title' },
      { args: ['PATCH', '/notes/1', { title: 'x' }, 'ann', NOTES], expected: [403, {}], name: 'PATCH not owner' },
      { args: ['DELETE', '/notes/2', null, 'ann', NOTES], expected: [204, {}], name: 'delete' },
      { args: ['GET', '/notes/7', null, 'ann', NOTES], expected: [404, {}], name: 'missing' },
    ],
    hints: ['Reuse the decision order from the practice task; only the return value changes from an int to a pair. Compute `allowed` once so 405 can reuse it.', 'The new id for Location is `max([n["id"] for n in notes], default=0) + 1`. PATCH only validates `title` when the key is present.'],
  },
  quiz: [
    {
      prompt: 'Which pair is correct?',
      options: ['GET is idempotent but not safe', 'PUT is idempotent but not safe', 'POST is safe but not idempotent', 'DELETE is safe'],
      answer: 1,
      explain: 'PUT changes state (not safe) but replaying it gives the same end state (idempotent). GET is both. POST is neither. DELETE is idempotent, not safe.',
    },
    {
      prompt: 'A client sends `{"title": ""}` to create a note. JSON is valid. Best status?',
      options: ['200', '400 or 422 (pick one convention)', '500', '409'],
      answer: 1,
      explain: 'It is the client\'s fault, so 4xx. 422 is the more precise "valid syntax, invalid content"; many APIs use 400. 500 would blame the server for a client mistake.',
    },
  ],
};

export default unit;
