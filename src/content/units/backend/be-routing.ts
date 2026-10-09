import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE } from '@/content/lib/backend-orm';

const code = `
def resolve(urlpatterns, path):
    for pattern in urlpatterns:                 #@loop
        kwargs = pattern.match(path)            #@try
        if kwargs is not None:                  #@check
            return pattern.view, kwargs         #@hit
    raise Http404("No URL matches " + path)     #@miss
`;

const CONVERTERS: Record<string, { rx: string; cast: 'int' | 'str' }> = {
  int: { rx: '[0-9]+', cast: 'int' },
  str: { rx: '[^/]+', cast: 'str' },
  slug: { rx: '[-a-zA-Z0-9_]+', cast: 'str' },
  path: { rx: '.+', cast: 'str' },
  uuid: { rx: '[0-9a-f-]{36}', cast: 'str' },
};

interface Compiled {
  route: string;
  regex: RegExp;
  source: string;
  types: Record<string, 'int' | 'str'>;
}

function compile(route: string): Compiled {
  const types: Record<string, 'int' | 'str'> = {};
  const body = route.replace(/^\//, '').replace(/<(?:(\w+):)?(\w+)>/g, (_m, conv: string | undefined, key: string) => {
    const c = CONVERTERS[conv ?? 'str'];
    if (!c) throw new Error(`Unknown converter "${conv}" in "${route}" (use int, str, slug, path or uuid)`);
    types[key] = c.cast;
    return `(?<${key}>${c.rx})`;
  });
  return { route, regex: new RegExp(`^${body}$`), source: `^${body.replace(/\(\?<(\w+)>/g, '(?P<$1>')}$`, types };
}

function match(p: Compiled, path: string): Record<string, number | string> | null {
  const m = p.regex.exec(path.replace(/^\//, ''));
  if (!m) return null;
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(m.groups ?? {})) out[k] = p.types[k] === 'int' ? Number(v) : v;
  return out;
}

interface In {
  patterns: string[];
  path: string;
}

const viz: VizDef<In> = {
  id: 'url-routing',
  title: 'URL patterns: top to bottom, first match wins',
  code,
  language: 'python',
  inputs: [
    { key: 'patterns', label: 'urlpatterns (top to bottom)', kind: 'strings', default: ['admin/', 'notes/', 'notes/new/', 'notes/<int:pk>/', 'notes/<slug:slug>/'], maxItems: 8, help: 'Converters: <int:pk>, <str:name>, <slug:s>, <path:p>' },
    { key: 'path', label: 'Request path', kind: 'string', default: '/notes/42/', maxItems: 40 },
  ],
  presets: [
    { label: 'Shadowed route', input: { patterns: ['notes/<slug:slug>/', 'notes/new/'], path: '/notes/new/' } },
    { label: 'No match (404)', input: { path: '/archive/2020/' } },
    { label: 'int rejects text', input: { patterns: ['notes/', 'notes/<int:pk>/'], path: '/notes/abc/' } },
    { label: 'Slug fallback', input: { path: '/notes/hello-world/' } },
  ],
  run({ patterns, path }) {
    const list = patterns.map((s) => s.trim()).filter((s) => s !== '' || patterns.length === 1);
    if (!list.length) throw new Error('Add at least one URL pattern');
    const compiled = list.map(compile);
    const r = new Recorder(code);
    const tones: Tone[] = compiled.map(() => 'default');
    let kwargs: Record<string, number | string> | null = null;
    let hit = -1;
    const items = (): ListItem[] => compiled.map((c, i) => ({ id: `p${i}`, label: c.route === '' ? '""' : c.route, sub: c.source, tone: tones[i] }));
    const panels = (note?: { text: string; tone: Tone }): Panel[] => {
      const out: Panel[] = [
        { type: 'list', title: `urlpatterns (request: ${path})`, orientation: 'vertical', items: items(), endLabel: 'last' },
        {
          type: 'kv',
          title: 'Captured kwargs passed to the view',
          entries: kwargs && Object.keys(kwargs).length ? Object.entries(kwargs).map(([k, v]) => ({ k, v: `${typeof v === 'number' ? v : JSON.stringify(v)}  (${typeof v === 'number' ? 'int' : 'str'})`, tone: 'found' as Tone })) : [{ k: '(none)', v: hit >= 0 ? 'view gets no extra kwargs' : '-' }],
        },
      ];
      if (note) out.push({ type: 'note', text: note.text, tone: note.tone });
      return out;
    };
    const vars = (i: number) => ({ index: i, path, matched: hit });

    r.step('loop', `Resolve ${path}: try each pattern from the top`, panels(), vars(-1));
    for (let i = 0; i < compiled.length; i++) {
      tones[i] = 'compare';
      r.step('try', `Try "${compiled[i].route}" against "${path.replace(/^\//, '')}"`, panels(), vars(i));
      const k = match(compiled[i], path);
      if (k) {
        hit = i;
        kwargs = k;
        tones[i] = 'found';
        const left = compiled.length - i - 1;
        r.step('hit', `Match. Stop here${left ? `: the ${left} pattern${left > 1 ? 's' : ''} below never run` : ''}`, panels({ text: `View #${i + 1} is called with ${Object.keys(k).length ? Object.entries(k).map(([a, b]) => `${a}=${JSON.stringify(b)}`).join(', ') : 'no kwargs'}.`, tone: 'found' }), vars(i));
        return { frames: r.frames, result: { index: i, kwargs: k } };
      }
      tones[i] = 'muted';
      r.step('check', `No match for "${compiled[i].route}": move on`, panels(), vars(i));
    }
    r.step('miss', 'Every pattern failed: Http404, the client sees 404', panels({ text: 'No pattern matched, so Django answers 404.', tone: 'error' }), vars(-1));
    return { frames: r.frames, result: { index: -1, kwargs: null } };
  },
  reference({ patterns, path }) {
    // independent matcher: compare segment by segment instead of using regular expressions
    const segs = (s: string) => s.replace(/^\//, '').split('/');
    const want = segs(path);
    const list = patterns.map((s) => s.trim()).filter((s) => s !== '' || patterns.length === 1);
    for (let i = 0; i < list.length; i++) {
      const route = segs(list[i]);
      const got: Record<string, number | string> = {};
      let ok = true;
      let j = 0;
      for (; j < route.length && ok; j++) {
        const m = route[j].match(/^<(?:(\w+):)?(\w+)>$/);
        const w = want[j];
        if (w === undefined) {
          ok = false;
        } else if (!m) {
          ok = route[j] === w;
        } else if (m[1] === 'path') {
          const rest = want.slice(j).join('/');
          ok = rest.length > 0;
          got[m[2]] = rest;
          j = route.length;
          want.length = Math.min(want.length, route.length);
        } else if (m[1] === 'int') {
          ok = /^[0-9]+$/.test(w);
          if (ok) got[m[2]] = Number(w);
        } else if (m[1] === 'slug') {
          ok = /^[-a-zA-Z0-9_]+$/.test(w);
          got[m[2]] = w;
        } else {
          ok = w !== '';
          got[m[2]] = w;
        }
      }
      if (ok && (route.some((x) => /^<path:/.test(x)) || route.length === want.length)) return { index: i, kwargs: got };
    }
    return { index: -1, kwargs: null };
  },
};

const harness = `
from minidjango import models, connection, reset
from minidjango.http import App, path, JsonResponse, get_object_or_404, require_http_methods
from minidjango.test import Client

def _mk(name):
    def view(request, **kwargs):
        return JsonResponse({"view": name, "kwargs": kwargs})
    view.__name__ = name
    return view

note_list = _mk("note_list")
note_new = _mk("note_new")
note_detail = _mk("note_detail")
note_by_slug = _mk("note_by_slug")

def resolve_all(fn, urls):
    c = Client(App(fn()))
    out = []
    for u in urls:
        r = c.get(u)
        body = r.json()
        out.append([r.status_code, body.get("view"), body.get("kwargs")])
    return out

class Note(models.Model):
    title = models.CharField(max_length=40)

def fetch_all(fn, urls):
    reset()
    Note.objects.create(title="First")
    Note.objects.create(title="Second")
    c = Client(App(fn()))
    out = []
    for u in urls:
        r = c.get(u)
        out.append([r.status_code, r.json()])
    return out

def drive(fn, calls):
    reset()
    c = Client(App(fn()))
    out = []
    for method, url, data in calls:
        r = c.request(method, url, data)
        out.append([r.status_code, r.json()])
    return out
`;

const MISSING = { detail: 'No Note matches the given query.' };

const unit: Unit = {
  id: 'be-routing',
  hook: 'Routing bugs hide in plain sight: a catch-all above a specific route, or a converter name that does not match the view. Interviewers ask how Django picks a view and what happens when two patterns overlap.',
  predict: {
    prompt: 'urlpatterns lists `notes/<slug:slug>/` first and `notes/new/` second. A client requests `/notes/new/`. Which view runs?',
    code: 'urlpatterns = [\n    path("notes/<slug:slug>/", note_by_slug),\n    path("notes/new/", note_new),\n]',
    codeLang: 'python',
    options: ['note_new, the more specific route', 'note_by_slug with slug="new"', 'Both run, top to bottom', 'Neither: Django reports a conflict'],
    answer: 1,
    explain: 'Patterns are tried top to bottom and the first match wins. "new" is a valid slug, so note_by_slug captures it and note_new is unreachable.',
  },
  viz,
  deeper: {
    points: [
      'The resolver walks urlpatterns in order and stops at the first match; later patterns are never tried.',
      'Converters both constrain and convert: `<int:pk>` only matches digits and passes an int to the view.',
      'Captured names become keyword arguments, so the view parameter must be named exactly like the converter key.',
      'No match means Http404, which the handler turns into a 404 response. A missing trailing slash is also a non-match.',
    ],
    pitfalls: ['Putting a broad route (slug, str, path) above a specific one', 'Naming the converter `<int:id>` but the view parameter `pk`', 'Forgetting that `<str:x>` never matches a slash, so use `<path:x>` for nested paths'],
  },
  practice: {
    language: 'python',
    fnName: 'build_urls',
    statement: 'Return the urlpatterns: `notes/` to `note_list`, `notes/new/` to `note_new`, `notes/<int:pk>/` to `note_detail`, and `notes/<slug:slug>/` to `note_by_slug`. Order them so no route is shadowed. The four views and `path` already exist.',
    signature: 'def build_urls():',
    solution: `def build_urls():
    return [
        path(@@"notes/"@@, note_list),
        path("notes/new/", @@note_new@@),
        path(@@"notes/<int:pk>/"@@, note_detail),
        path("notes/<slug:slug>/", @@note_by_slug@@),
    ]`,
    harness,
    adapter: 'resolve_all',
    tests: [
      { args: [['/notes/']], expected: [[200, 'note_list', {}]], name: 'list' },
      { args: [['/notes/new/']], expected: [[200, 'note_new', {}]], name: 'new is not a slug' },
      { args: [['/notes/7/']], expected: [[200, 'note_detail', { pk: 7 }]], name: 'int wins over slug' },
      { args: [['/notes/hello-world/']], expected: [[200, 'note_by_slug', { slug: 'hello-world' }]], name: 'slug fallback' },
      { args: [['/missing/', '/notes/7']], expected: [[404, null, null], [404, null, null]], name: '404s' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'get_patterns',
    statement: 'Every note detail request returns 500. The view takes `pk`, but something does not line up. Fix it.',
    buggy: `def note_detail(request, pk):
    note = get_object_or_404(Note, pk=pk)
    return JsonResponse({"id": note.id, "title": note.title})

def get_patterns():
    return [path("notes/<int:id>/", note_detail)]`,
    fixed: `def note_detail(request, pk):
    note = get_object_or_404(Note, pk=pk)
    return JsonResponse({"id": note.id, "title": note.title})

def get_patterns():
    return [path("notes/<int:pk>/", note_detail)]`,
    harness,
    adapter: 'fetch_all',
    tests: [
      { args: [['/notes/1/']], expected: [[200, { id: 1, title: 'First' }]], name: 'first note' },
      { args: [['/notes/2/']], expected: [[200, { id: 2, title: 'Second' }]], name: 'second note' },
      { args: [['/notes/99/']], expected: [[404, MISSING]], name: 'missing note' },
      { args: [['/notes/abc/']], expected: [[404, { detail: "No URL matches '/notes/abc/'" }]], name: 'int rejects text' },
    ],
    bugType: 'converter name does not match view parameter',
    hint: 'The resolver calls `note_detail(request, id=...)`. What parameter names does the view accept?',
    explanation: 'The pattern captured the value under the name `id`, so the view was called with `id=1`, but it only accepts `pk`: a TypeError, so 500. Converter names must equal the view parameter names.',
  },
  boss: {
    title: 'Tiny notes API',
    statement: 'Write `get_patterns()` plus the views. `notes/` supports GET (`{"results": [{"id","title"}...]}` ordered by id) and POST (create from `request.data["title"]`, 201 with id and title; blank or missing title gives 400 `{"title": ["This field is required."]}`). `notes/<int:pk>/` supports GET only (404 when missing). Other methods get 405. `Note`, `path`, `JsonResponse`, `get_object_or_404` and `require_http_methods` exist.',
    language: 'python',
    fnName: 'get_patterns',
    starter: `def get_patterns():
    # your code here
    pass
`,
    solution: `@require_http_methods(["GET", "POST"])
def notes(request):
    if request.method == "POST":
        title = (request.data.get("title") or "").strip()
        if not title:
            return JsonResponse({"title": ["This field is required."]}, status=400)
        note = Note.objects.create(title=title)
        return JsonResponse({"id": note.id, "title": note.title}, status=201)
    return JsonResponse({"results": [{"id": n.id, "title": n.title} for n in Note.objects.order_by("id")]})

@require_http_methods(["GET"])
def note_detail(request, pk):
    note = get_object_or_404(Note, pk=pk)
    return JsonResponse({"id": note.id, "title": note.title})

def get_patterns():
    return [path("notes/", notes), path("notes/<int:pk>/", note_detail)]`,
    harness,
    adapter: 'drive',
    tests: [
      { args: [[['GET', '/notes/', null]]], expected: [[200, { results: [] }]], name: 'empty list' },
      { args: [[['POST', '/notes/', { title: 'a' }], ['POST', '/notes/', { title: 'b' }], ['GET', '/notes/', null]]], expected: [[201, { id: 1, title: 'a' }], [201, { id: 2, title: 'b' }], [200, { results: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] }]], name: 'create then list' },
      { args: [[['POST', '/notes/', { title: '  ' }], ['POST', '/notes/', {}]]], expected: [[400, { title: ['This field is required.'] }], [400, { title: ['This field is required.'] }]], name: 'blank title is 400' },
      { args: [[['POST', '/notes/', { title: 'a' }], ['GET', '/notes/1/', null], ['GET', '/notes/2/', null]]], expected: [[201, { id: 1, title: 'a' }], [200, { id: 1, title: 'a' }], [404, MISSING]], name: 'detail and 404' },
      { args: [[['DELETE', '/notes/', null], ['PUT', '/notes/1/', { title: 'x' }]]], expected: [[405, { detail: 'Method not allowed' }], [405, { detail: 'Method not allowed' }]], name: 'other methods are 405' },
    ],
    hints: ['Decorate each view with `@require_http_methods([...])` for the 405s, and branch on `request.method` inside the list view.', '`get_object_or_404(Note, pk=pk)` gives the detail 404 for free. Name the view parameter exactly like the converter: `pk`.'],
    combines: ['be-routing', 'be-request-lifecycle'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
