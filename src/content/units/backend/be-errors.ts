import { Recorder } from '@/engine/recorder';
import type { Panel, SequenceMessage, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel, statusTone } from '@/content/lib/backend-rest';

const code = `
def create_note(request):
    try:
        data = request.data                                  #@parse
        errors = validate(data)                              #@validate
        if errors:
            return error(422, "validation_error", errors)    #@invalid
        note = save(data)                                    #@save
        return ok(201, note)                                 #@ok
    except Conflict as exc:
        return error(409, "conflict", str(exc))              #@conflict
    except Exception as exc:
        log.exception("create_note failed")                  #@log
        return error(500, "internal_error", "Internal server error")   #@internal
`;

const CASES = ['valid request', 'blank title', 'duplicate title', 'database crash'];
const STYLES = ['safe envelope', 'leaky 500'];

interface In {
  scenario: string;
  style: string;
}

const SECRET = 'db connection lost: host=10.0.0.5';

interface Outcome {
  status: number;
  code: string;
  message: string;
}

function outcomeFor(scenario: string, leaky: boolean): Outcome {
  switch (scenario) {
    case 'blank title':
      return { status: 422, code: 'validation_error', message: 'Invalid input' };
    case 'duplicate title':
      return { status: 409, code: 'conflict', message: 'title already exists' };
    case 'database crash':
      return { status: 500, code: 'internal_error', message: leaky ? `RuntimeError: ${SECRET}` : 'Internal server error' };
    default:
      return { status: 201, code: 'ok', message: 'created' };
  }
}

const viz: VizDef<In> = {
  id: 'be-errors',
  title: 'One error envelope, honest status codes',
  code,
  language: 'python',
  inputs: [
    { key: 'scenario', label: 'What the client sends', kind: 'select', default: CASES[3], options: CASES },
    { key: 'style', label: 'Handler style', kind: 'select', default: STYLES[0], options: STYLES },
  ],
  presets: [
    { label: 'Valid', input: { scenario: CASES[0], style: STYLES[0] } },
    { label: 'Validation', input: { scenario: CASES[1], style: STYLES[0] } },
    { label: 'Conflict', input: { scenario: CASES[2], style: STYLES[0] } },
    { label: 'Crash (safe)', input: { scenario: CASES[3], style: STYLES[0] } },
    { label: 'Crash (leaky)', input: { scenario: CASES[3], style: STYLES[1] } },
  ],
  run({ scenario, style }) {
    const r = new Recorder(code);
    const leaky = style === STYLES[1];
    const out = outcomeFor(scenario, leaky);
    const messages: SequenceMessage[] = [];
    const serverLog: { text: string; tone?: Tone }[] = [];
    let response: Record<string, string | number> = {};
    const payload = scenario === 'blank title' ? '{"title": ""}' : scenario === 'duplicate title' ? '{"title": "rent"}' : scenario === 'database crash' ? '{"title": "boom"}' : '{"title": "milk"}';
    const view = (active?: number, tone: Tone = 'default'): Panel[] => [
      { type: 'sequence', title: 'Request path', actors: ['Client', 'View', 'Database'], messages: [...messages], active },
      kvPanel('Response the client sees', Object.keys(response).length ? response : { '(not sent yet)': '' }, Object.fromEntries(Object.keys(response).map((k) => [k, tone]))),
      logPanel('Server log (private)', serverLog),
    ];
    messages.push({ from: 'Client', to: 'View', label: `POST ${payload}` });
    r.step('parse', `The view receives ${payload}`, view(0), { scenario });
    r.step('validate', scenario === 'blank title' ? 'validate() finds title is blank' : 'validate() finds no problems', view(0), { valid: scenario !== 'blank title' });
    r.op();
    const finish = (anchor: string, caption: string, extra: Record<string, string | number> = {}) => {
      response = { status: out.status, 'error.code': out.code, 'error.message': out.message, ...extra };
      if (out.status >= 400) messages.push({ from: 'View', to: 'Client', label: `${out.status} ${out.code}`, tone: statusTone(out.status), dashed: true });
      else messages.push({ from: 'View', to: 'Client', label: `${out.status} Created`, tone: 'found' });
      r.step(anchor, caption, view(messages.length - 1, statusTone(out.status)), { status: out.status, code: out.code });
    };
    if (scenario === 'blank title') {
      finish('invalid', '422: the client can fix this. Say which field is wrong', { 'error.fields': 'title: may not be blank' });
      return { frames: r.frames, result: [out.status, out.code] };
    }
    messages.push({ from: 'View', to: 'Database', label: 'INSERT note' });
    r.step('save', 'save(data) talks to the database', view(1), { scenario });
    if (scenario === 'valid request') {
      finish('ok', '201 Created with the new note');
    } else if (scenario === 'duplicate title') {
      serverLog.push({ text: 'Conflict: title already exists', tone: 'compare' });
      finish('conflict', '409: a business rule failed, safe to show the message');
    } else {
      serverLog.push({ text: `RuntimeError: ${SECRET}`, tone: 'error' }, { text: 'traceback: views.py line 42 in create_note', tone: 'error' });
      r.step('log', 'The real exception and traceback go to the server log only', view(1), { logged: true });
      finish('internal', leaky ? 'LEAK: the response repeats the exception text, host and all' : '500 with a generic message. Nothing internal leaves the server');
    }
    return { frames: r.frames, result: [out.status, out.code] };
  },
  reference({ scenario }) {
    const table: Record<string, [number, string]> = {
      'valid request': [201, 'ok'],
      'blank title': [422, 'validation_error'],
      'duplicate title': [409, 'conflict'],
      'database crash': [500, 'internal_error'],
    };
    return table[scenario] ?? [201, 'ok'];
  },
};

const HARNESS = `
from minidjango import serializers
from minidjango.http import App, path, JsonResponse
from minidjango.test import Client

class Conflict(Exception):
    pass

class NoteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=20)
    priority = serializers.IntegerField(min_value=1, max_value=5, required=False, default=3)

NOTES = []

def save_note(data):
    if data["title"] == "boom":
        raise RuntimeError("db connection lost: host=10.0.0.5")
    if any(n["title"] == data["title"] for n in NOTES):
        raise Conflict("title already exists")
    note = {"id": len(NOTES) + 1, "title": data["title"], "priority": data["priority"]}
    NOTES.append(note)
    return note

def error_response(status, code, message, fields=None):
    body = {"error": {"code": code, "message": message}}
    if fields:
        body["error"]["fields"] = fields
    return JsonResponse(body, status=status)

def run_view(view, data, existing):
    NOTES.clear()
    for title in existing:
        NOTES.append({"id": len(NOTES) + 1, "title": title, "priority": 3})
    r = Client(App([path("notes/", view)])).post("/notes/", data)
    return [r.status_code, r.json()]
`;

const viewTests = [
  { args: [{ title: 'milk' }, []], expected: [201, { id: 1, title: 'milk', priority: 3 }], name: 'happy path' },
  { args: [{ title: '' }, []], expected: [422, { error: { code: 'validation_error', message: 'Invalid input', fields: { title: ['This field may not be blank.'] } } }], name: 'blank title' },
  { args: [{}, []], expected: [422, { error: { code: 'validation_error', message: 'Invalid input', fields: { title: ['This field is required.'] } } }], name: 'missing title' },
  { args: [{ title: 'x'.repeat(21) }, []], expected: [422, { error: { code: 'validation_error', message: 'Invalid input', fields: { title: ['Ensure this field has no more than 20 characters.'] } } }], name: 'too long' },
  { args: [{ title: 'rent' }, ['rent']], expected: [409, { error: { code: 'conflict', message: 'title already exists' } }], name: 'duplicate' },
  { args: [{ title: 'boom' }, []], expected: [500, { error: { code: 'internal_error', message: 'Internal server error' } }], name: 'crash does not leak internals' },
];

const unit: Unit = {
  id: 'be-errors',
  hook: 'Clients parse your errors, and attackers read them. A consistent envelope plus honest status codes (and silence about internals) is a mark of a production-minded API.',
  predict: {
    prompt: 'A view ends with `except Exception: return 500`. A client posts valid JSON with a blank `title`, which raises a ValidationError inside the try. What is wrong with the response?',
    options: ['Nothing, the server could not handle it', 'It blames the server for the client\'s mistake, so alerts fire and clients retry pointlessly', 'It should be 404', 'It should be 200 with an error field'],
    answer: 1,
    explain: '5xx means "the server failed, try again later". A fixable input problem must be a 4xx (422 here) with field-level detail; only truly unexpected failures belong in a generic 500.',
  },
  viz,
  deeper: {
    points: [
      'Use one **error envelope** everywhere, e.g. `{"error": {"code", "message", "fields"}}`, so clients write one parser. Machine-readable `code`, human-readable `message`.',
      'Map exceptions to statuses in one place: validation 400/422, missing 404, conflict 409, forbidden 403, unauthenticated 401, everything else 500.',
      'On a 500, log the traceback **server-side** (with a request id) and return a generic message. Stack traces, SQL, hostnames and file paths help attackers.',
      'Order `except` clauses from specific to general; a broad `except Exception` placed first swallows everything.',
      'Return field-level errors for validation (`{"title": ["may not be blank"]}`) so a form can highlight the right input.',
    ],
    pitfalls: ['Returning `str(exc)` on a 500', '200 OK with `{"error": ...}`', 'Catching Exception before specific errors', 'Different error shapes per endpoint'],
  },
  practice: {
    language: 'python',
    fnName: 'create_note',
    statement:
      'Write the view `create_note(request)`. The harness provides `NoteSerializer`, `save_note(data)` (may raise `Conflict` or crash with another exception), `error_response(status, code, message, fields=None)` and `JsonResponse`. Invalid input -> 422 `validation_error` / "Invalid input" with `serializer.errors` as fields. `Conflict` -> 409 `conflict` with `str(exc)`. Any other exception -> 500 `internal_error` / "Internal server error" (never the exception text). Success -> `JsonResponse(note, status=201)`.',
    signature: 'def create_note(request):',
    solution: `def create_note(request):
    serializer = NoteSerializer(data=request.data)
    if not @@serializer.is_valid()@@:
        return error_response(@@422@@, "validation_error", "Invalid input", serializer.errors)
    try:
        note = save_note(serializer.validated_data)
    except @@Conflict@@ as exc:
        return error_response(409, "conflict", @@str(exc)@@)
    except @@Exception@@:
        return error_response(@@500@@, "internal_error", "Internal server error")
    return JsonResponse(note, status=201)`,
    harness: HARNESS,
    adapter: 'run_view',
    tests: viewTests,
  },
  debug: {
    language: 'python',
    fnName: 'create_note',
    statement: 'A security scan flags that a failing request response contains an internal IP address. Find the line that leaks it.',
    harness: HARNESS,
    adapter: 'run_view',
    buggy: `def create_note(request):
    serializer = NoteSerializer(data=request.data)
    if not serializer.is_valid():
        return error_response(422, "validation_error", "Invalid input", serializer.errors)
    try:
        note = save_note(serializer.validated_data)
    except Conflict as exc:
        return error_response(409, "conflict", str(exc))
    except Exception as exc:
        return error_response(500, "internal_error", str(exc))
    return JsonResponse(note, status=201)`,
    fixed: `def create_note(request):
    serializer = NoteSerializer(data=request.data)
    if not serializer.is_valid():
        return error_response(422, "validation_error", "Invalid input", serializer.errors)
    try:
        note = save_note(serializer.validated_data)
    except Conflict as exc:
        return error_response(409, "conflict", str(exc))
    except Exception:
        return error_response(500, "internal_error", "Internal server error")
    return JsonResponse(note, status=201)`,
    tests: viewTests,
    bugType: 'leaking internals on 500',
    hint: 'Compare the message in the 500 branch with the one in the 409 branch. Who wrote each exception message?',
    explanation: 'The 409 message was written by you for clients. The text of an arbitrary exception was not: it can contain hosts, SQL or paths. Log the exception on the server and send a fixed generic message with the 500.',
  },
  boss: {
    title: 'A reusable error-envelope decorator',
    statement:
      'Write the decorator `with_errors(view)` returning a wrapped view. On success return the view\'s response unchanged. Otherwise return `JsonResponse({"error": {"code", "message", ...}}, status=...)`: `ValidationError` -> 422 `validation_error` "Invalid input" plus `"fields": exc.detail`; `Http404` -> 404 `not_found` "Not found"; `PermissionDenied` -> 403 `forbidden` "Permission denied"; `NotAuthenticated` -> 401 `unauthenticated` "Authentication required"; any other exception -> 500 `internal_error` "Internal server error". Import the exception classes from `minidjango.exceptions` and `JsonResponse` from `minidjango.http`.',
    language: 'python',
    fnName: 'with_errors',
    harness: `
from minidjango.http import App, path, JsonResponse
from minidjango.test import Client
from minidjango.exceptions import ValidationError, Http404, PermissionDenied, NotAuthenticated

def run_deco(deco, kind):
    def view(request):
        if kind == "ok":
            return JsonResponse({"ok": True})
        if kind == "validation":
            raise ValidationError({"title": ["This field is required."]})
        if kind == "not_found":
            raise Http404("Note 9 does not exist")
        if kind == "forbidden":
            raise PermissionDenied("owner only")
        if kind == "unauthenticated":
            raise NotAuthenticated("login first")
        raise KeyError("password_hash")
    r = Client(App([path("x/", deco(view))])).get("/x/")
    return [r.status_code, r.json()]
`,
    adapter: 'run_deco',
    starter: `def with_errors(view):
    # your code here
    pass
`,
    solution: `from minidjango.http import JsonResponse
from minidjango.exceptions import ValidationError, Http404, PermissionDenied, NotAuthenticated

def _envelope(status, code, message, fields=None):
    body = {"error": {"code": code, "message": message}}
    if fields is not None:
        body["error"]["fields"] = fields
    return JsonResponse(body, status=status)

def with_errors(view):
    def wrapper(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except ValidationError as exc:
            return _envelope(422, "validation_error", "Invalid input", exc.detail)
        except Http404:
            return _envelope(404, "not_found", "Not found")
        except PermissionDenied:
            return _envelope(403, "forbidden", "Permission denied")
        except NotAuthenticated:
            return _envelope(401, "unauthenticated", "Authentication required")
        except Exception:
            return _envelope(500, "internal_error", "Internal server error")
    return wrapper`,
    tests: [
      { args: ['ok'], expected: [200, { ok: true }], name: 'success passes through' },
      { args: ['validation'], expected: [422, { error: { code: 'validation_error', message: 'Invalid input', fields: { title: ['This field is required.'] } } }], name: 'validation' },
      { args: ['not_found'], expected: [404, { error: { code: 'not_found', message: 'Not found' } }], name: 'not found' },
      { args: ['forbidden'], expected: [403, { error: { code: 'forbidden', message: 'Permission denied' } }], name: 'forbidden' },
      { args: ['unauthenticated'], expected: [401, { error: { code: 'unauthenticated', message: 'Authentication required' } }], name: 'unauthenticated' },
      { args: ['bug'], expected: [500, { error: { code: 'internal_error', message: 'Internal server error' } }], name: 'unexpected error is generic' },
    ],
    hints: ['Wrap the call in `try:` inside an inner function and put one `except` per exception class, specific ones first and `Exception` last.', 'Write a small helper that builds the envelope so every branch differs only in status, code and message. Only validation errors carry `fields` (use `exc.detail`).'],
    combines: ['be-rest-methods'],
  },
  simulationNote: 'These exercises run on `minidjango`, a small pure-Python imitation of Django\'s views and serializers that runs in your browser. Names and behaviour mirror Django, but it is not Django itself.',
  quiz: [
    {
      prompt: 'Which is the best place to put the full traceback of an unexpected error?',
      options: ['In the 500 response body', 'In the server log, tied to a request id the client can quote', 'In a response header', 'Nowhere, tracebacks are noise'],
      answer: 1,
      explain: 'Developers need the traceback, clients do not. Log it with a request id and return that id (not the trace) so support can find it.',
    },
  ],
};

export default unit;
