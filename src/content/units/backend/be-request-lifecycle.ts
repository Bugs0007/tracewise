import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, pipelinePanel, type PipeStage } from '@/content/lib/backend-orm';

const code = `
# client: POST /notes/  {"title": "Buy milk"}          #@client

def auth_middleware(get_response):
    def middleware(request):
        if "authorization" not in request.headers:     #@mw
            raise NotAuthenticated()                   # becomes 401
        return get_response(request)                   #@next
    return middleware

urlpatterns = [path("notes/", create_note)]            #@router

def create_note(request):                              #@view
    s = NoteSerializer(data=request.data)              #@ser
    s.is_valid(raise_exception=True)                   # bad input becomes 400
    note = Note.objects.create(**s.validated_data)     #@orm
    # INSERT INTO note (title) VALUES ('Buy milk')     #@db
    return JsonResponse(s.data, status=201)            #@resp
`;

const STAGES: (PipeStage & { anchor: string; ok: string })[] = [
  { id: 'client', label: 'Client', anchor: 'client', ok: 'Client sends POST /notes/' },
  { id: 'mw', label: 'Middleware', sub: 'auth', anchor: 'mw', ok: 'Middleware: Authorization header found, pass it on' },
  { id: 'router', label: 'URL router', anchor: 'router', ok: 'Router: path("notes/") matches, call create_note' },
  { id: 'view', label: 'View', anchor: 'view', ok: 'View: create_note(request) starts running' },
  { id: 'ser', label: 'Serializer', anchor: 'ser', ok: 'Serializer: title is valid, validated_data is ready' },
  { id: 'orm', label: 'ORM', anchor: 'orm', ok: 'ORM: Note.objects.create() builds an INSERT' },
  { id: 'db', label: 'Database', anchor: 'db', ok: 'Database: runs the INSERT, row id 1 comes back' },
];

const FAILS: Record<string, { stage: string; status: number; why: string }> = {
  '401 in middleware': { stage: 'mw', status: 401, why: 'No Authorization header: middleware answers 401 itself' },
  '404 at router': { stage: 'router', status: 404, why: 'No pattern matches: Http404 becomes a 404 response' },
  '400 in serializer': { stage: 'ser', status: 400, why: 'title is blank: ValidationError becomes a 400 with errors' },
  '500 database error': { stage: 'db', status: 500, why: 'IntegrityError is not handled anywhere, so it is a 500' },
};

interface In {
  fail: string;
}

const viz: VizDef<In> = {
  id: 'request-lifecycle',
  title: 'One request, end to end',
  code,
  language: 'python',
  inputs: [{ key: 'fail', label: 'Inject a failure', kind: 'select', default: 'none', options: ['none', ...Object.keys(FAILS)], help: 'Pick where things go wrong and watch the response travel back.' }],
  presets: Object.keys(FAILS).map((k) => ({ label: k, input: { fail: k } })),
  run({ fail }) {
    const r = new Recorder(code);
    const f = FAILS[fail];
    const failIdx = f ? STAGES.findIndex((s) => s.id === f.stage) : -1;
    const tones: Record<string, Tone> = {};
    const trail: Record<string, Tone> = {};
    const log: { text: string; tone?: Tone }[] = [];
    let status: number | string = '…';
    let queries = 0;
    const panels = (flow?: { from: string; to: string; tone?: Tone }): Panel[] => [
      pipelinePanel(STAGES, { title: 'POST /notes/  (solid: request, dashed: response)', tones, trail, flow }),
      { type: 'log', title: 'What happened', lines: [...log] },
      { type: 'kv', entries: [{ k: 'status', v: status, tone: typeof status === 'number' ? (status < 400 ? 'found' : 'error') : 'default' }, { k: 'queries run', v: queries }] },
    ];
    const vars = (stage: string) => ({ stage, status, queries });
    const settle = () => {
      for (const st of STAGES) if (tones[st.id] === 'active') tones[st.id] = 'visited';
    };

    tones.client = 'active';
    r.step('client', STAGES[0].ok, panels(), vars('client'));
    let reached = 0;
    for (let i = 1; i < STAGES.length; i++) {
      const s = STAGES[i];
      const prev = STAGES[i - 1].id;
      settle();
      reached = i;
      trail[`${prev}>${s.id}`] = 'visited';
      if (i === failIdx) {
        tones[s.id] = 'error';
        status = f.status;
        log.push({ text: `${s.label}: ${f.why}`, tone: 'error' });
        r.step(s.anchor, f.why, panels(), vars(s.id));
        break;
      }
      tones[s.id] = 'active';
      if (s.id === 'db') queries = 1;
      log.push({ text: s.ok });
      r.step(s.anchor, s.ok, panels({ from: prev, to: s.id }), vars(s.id));
    }
    if (failIdx < 0) status = 201;
    // the response travels back through every stage that was entered
    const back = failIdx < 0 ? STAGES.length - 1 : failIdx;
    const tone: Tone = failIdx < 0 ? 'found' : 'error';
    for (let i = back; i >= 1; i--) {
      const from = STAGES[i].id;
      const to = STAGES[i - 1].id;
      settle();
      tones[to] = 'active';
      const cap = i === 1 ? `Response ${status} reaches the client` : `Response ${status} passes back through ${STAGES[i - 1].label}`;
      trail[`${from}>${to}`] = tone;
      log.push({ text: cap, tone });
      r.step('resp', cap, panels({ from, to, tone }), vars(to));
    }
    if (failIdx >= 0) for (const st of STAGES.slice(failIdx + 1)) tones[st.id] = 'muted';
    settle();
    r.step('resp', failIdx < 0 ? 'Done: 201 Created, the note was stored' : `Done: the client sees ${status}, later stages never ran`, panels(), vars('client'));
    return { frames: r.frames, result: { status, reached } };
  },
  reference({ fail }) {
    const table: Record<string, [number, number]> = { none: [201, 6], '401 in middleware': [401, 1], '404 at router': [404, 2], '400 in serializer': [400, 4], '500 database error': [500, 6] };
    const [status, reached] = table[fail];
    return { status, reached };
  },
};

const harness = `
from minidjango import models, serializers, connection, reset
from minidjango.http import App, path, JsonResponse, get_object_or_404
from minidjango.exceptions import NotAuthenticated, ValidationError
from minidjango.test import Client

class Note(models.Model):
    title = models.CharField(max_length=40)

class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "title"]

def auth_middleware(get_response):
    def middleware(request):
        if "authorization" not in request.headers:
            raise NotAuthenticated()
        return get_response(request)
    return middleware

def call(view, method, url, data=None, token=True, seed=False):
    reset()
    if seed:
        Note.objects.create(title="Buy milk")
    headers = {"Authorization": "Bearer t"} if token else {}
    app = App([path("notes/", view), path("notes/<int:pk>/", view)], middleware=[auth_middleware])
    r = Client(app).request(method, url, data, headers)
    return [r.status_code, r.json(), Note.objects.count()]

def run_create(view, data, token=True):
    return call(view, "POST", "/notes/", data, token)

def run_detail(view, pk, token=True):
    return call(view, "GET", "/notes/%d/" % pk, None, token, seed=True)

PING_CALLS = []

def ping(request):
    PING_CALLS.append(1)
    return JsonResponse({"pong": True})

def boom(request):
    raise ValueError("boom")

def run_mw(mw, url, headers):
    del PING_CALLS[:]
    app = App([path("ping/", ping), path("boom/", boom)], middleware=[mw])
    r = Client(app).get(url, None, headers)
    return [r.status_code, r.headers.get("x-request-id"), len(PING_CALLS)]
`;

const createTests = [
  { args: [{ title: 'Buy milk' }, true], expected: [201, { id: 1, title: 'Buy milk' }, 1], name: 'valid POST is 201' },
  { args: [{ title: '' }, true], expected: [400, { title: ['This field may not be blank.'] }, 0], name: 'blank title is 400' },
  { args: [{}, true], expected: [400, { title: ['This field is required.'] }, 0], name: 'missing title is 400' },
  { args: [{ title: 'x'.repeat(41) }, true], expected: [400, { title: ['Ensure this field has no more than 40 characters.'] }, 0], name: 'too long is 400' },
  { args: [{ title: 'Buy milk' }, false], expected: [401, { detail: 'Authentication credentials were not provided.' }, 0], name: 'no token: view never runs' },
];

const detailTests = [
  { args: [1, true], expected: [200, { id: 1, title: 'Buy milk' }, 1], name: 'existing note' },
  { args: [7, true], expected: [404, { detail: 'No Note matches the given query.' }, 1], name: 'missing note is 404' },
  { args: [1, false], expected: [401, { detail: 'Authentication credentials were not provided.' }, 1], name: 'no token is 401' },
];

const unit: Unit = {
  id: 'be-request-lifecycle',
  hook: 'Interviewers love "walk me through what happens when a request hits your API". Knowing who can answer first, and how an error becomes a status code, separates memorised answers from understanding.',
  predict: {
    prompt: 'The project has an auth middleware that raises `NotAuthenticated` when the Authorization header is missing. A client with no header requests a URL that does not exist. What status comes back?',
    options: ['404, the router answers first', '401, middleware runs before URL routing', '403, the user is not allowed', '500, nothing handles this case'],
    answer: 1,
    explain: 'Middleware wraps the whole handler, including URL resolution. The auth check fails first, so the client sees 401 and the router never runs.',
  },
  viz,
  deeper: {
    points: [
      'Order is: middleware in (list order), URL resolving, view, then the response travels back out through middleware in reverse.',
      'Exceptions are turned into responses at the handler: Http404 to 404, ValidationError to 400, NotAuthenticated to 401, anything else to 500.',
      'The view is thin: validate with a serializer, talk to the ORM, return a response. The serializer and ORM never know about HTTP.',
      'A short-circuit (like the 401) skips every later stage, including database queries, which is why cheap checks belong early.',
    ],
    pitfalls: ['Assuming the router runs before middleware', 'Returning a plain dict or None from a view instead of an HttpResponse', 'Catching every exception in the view and returning 200 with an error message'],
  },
  practice: {
    language: 'python',
    fnName: 'create_note',
    statement: 'Write the view for `POST /notes/`. Validate `request.data` with `NoteSerializer` (already defined, as are `Note` and `JsonResponse`), save the note, and return the serializer data with status 201. Invalid data must become a 400 without extra code.',
    signature: 'def create_note(request):',
    solution: `def create_note(request):
    serializer = @@NoteSerializer(data=request.data)@@
    serializer.is_valid(@@raise_exception=True@@)
    @@serializer.save()@@
    return JsonResponse(serializer.data, status=@@201@@)`,
    harness,
    adapter: 'run_create',
    tests: createTests,
  },
  debug: {
    language: 'python',
    fnName: 'note_detail',
    statement: 'Requesting a note that does not exist returns a 500 instead of a 404. Fix the view.',
    buggy: `def note_detail(request, pk):
    note = Note.objects.filter(pk=pk).first()
    return JsonResponse({"id": note.id, "title": note.title})`,
    fixed: `def note_detail(request, pk):
    note = get_object_or_404(Note, pk=pk)
    return JsonResponse({"id": note.id, "title": note.title})`,
    harness,
    adapter: 'run_detail',
    tests: detailTests,
    bugType: 'filter().first() instead of get()',
    hint: 'What does `filter(...).first()` return when nothing matches, and what happens on the next line?',
    explanation: '`first()` returns None for no match, so `note.id` raised AttributeError, which the handler maps to 500. `get()` or `get_object_or_404` raises an exception the handler maps to 404.',
  },
  boss: {
    title: 'API key middleware',
    statement: 'Write `api_middleware(get_response)`. Requests without an `X-API-Key` header get a 401 JsonResponse and never reach the view. Every other response, including 404s and 500s, gets an `X-Request-ID` header copied from the request header `x-request-id`, or "req-0" if absent.',
    language: 'python',
    fnName: 'api_middleware',
    starter: `def api_middleware(get_response):
    # your code here
    pass
`,
    solution: `def api_middleware(get_response):
    def middleware(request):
        if not request.headers.get("x-api-key"):
            return JsonResponse({"detail": "API key required"}, status=401)
        response = get_response(request)
        response["X-Request-ID"] = request.headers.get("x-request-id", "req-0")
        return response
    return middleware`,
    harness,
    adapter: 'run_mw',
    tests: [
      { args: ['/ping/', { 'X-API-Key': 'k', 'X-Request-ID': 'abc' }], expected: [200, 'abc', 1], name: 'id is echoed' },
      { args: ['/ping/', { 'X-API-Key': 'k' }], expected: [200, 'req-0', 1], name: 'default id' },
      { args: ['/nope/', { 'X-API-Key': 'k' }], expected: [404, 'req-0', 0], name: '404 still gets the header' },
      { args: ['/ping/', {}], expected: [401, null, 0], name: 'no key: view never runs' },
      { args: ['/boom/', { 'X-API-Key': 'k' }], expected: [500, 'req-0', 0], name: '500 still gets the header' },
    ],
    hints: ['Return early (without calling `get_response`) when the key is missing, so the view is never reached.', 'Call `response = get_response(request)`, set the header on `response`, then return it. Errors are already responses by the time they get back to you.'],
    combines: ['be-request-lifecycle', 'be-middleware'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
