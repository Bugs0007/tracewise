import { Recorder } from '@/engine/recorder';
import type { GridPanel, ListPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { parseQuery } from '@/content/lib/backend-rest';

const code = `
FILTERS = {"status", "owner"}
SORTS = {"priority", "created"}

def list_tickets(rows, params):
    out = list(rows)
    for key, value in params.items():                        #@loop
        if key in FILTERS:                                   #@allow
            out = [r for r in out if str(r[key]) == value]   #@filter
    sort = params.get("sort", "")                            #@sort
    field = sort.lstrip("-")
    if field in SORTS:                                       #@sortcheck
        out.sort(key=lambda r: r[field], reverse=sort.startswith("-"))   #@sortapply
    return [r["id"] for r in out]                            #@done
`;

interface Ticket {
  id: number;
  status: string;
  owner: string;
  priority: number;
  created: number;
}

const ROWS: Ticket[] = [
  { id: 1, status: 'open', owner: 'ann', priority: 3, created: 1 },
  { id: 2, status: 'closed', owner: 'bob', priority: 1, created: 2 },
  { id: 3, status: 'open', owner: 'bob', priority: 5, created: 3 },
  { id: 4, status: 'open', owner: 'ann', priority: 2, created: 4 },
  { id: 5, status: 'closed', owner: 'ann', priority: 4, created: 5 },
  { id: 6, status: 'open', owner: 'cy', priority: 5, created: 6 },
];

const FILTERS = ['status', 'owner'];
const SORTS = ['priority', 'created'];

interface In {
  query: string;
}

const viz: VizDef<In> = {
  id: 'be-filtering',
  title: 'Filtering and sorting from query params',
  code,
  language: 'python',
  inputs: [{ key: 'query', label: 'Query string', kind: 'string', default: 'status=open&sort=-priority&debug=1', maxItems: 80, help: 'e.g. status=open&owner=ann&sort=-created' }],
  presets: [
    { label: 'Filter + sort desc', input: { query: 'status=open&sort=-priority&debug=1' } },
    { label: 'Two filters', input: { query: 'owner=ann&status=open' } },
    { label: 'Forbidden sort', input: { query: 'status=closed&sort=-password' } },
    { label: 'Ascending sort', input: { query: 'sort=created' } },
  ],
  run({ query }) {
    const r = new Recorder(code);
    const params = new Map<string, string>(parseQuery(query));
    let out = [...ROWS];
    const marks = new Map<string, Tone>();
    const view = (): [GridPanel, ListPanel] => {
      const keep = new Set(out.map((x) => x.id));
      const tones: Record<string, Tone> = {};
      const shown = [...out, ...ROWS.filter((x) => !keep.has(x.id))];
      shown.forEach((row, i) => {
        if (!keep.has(row.id)) for (let c = 0; c < 5; c++) tones[`${i},${c}`] = 'muted';
      });
      return [
        { type: 'grid', title: 'Tickets (greyed = filtered out)', colLabels: ['id', 'status', 'owner', 'priority', 'created'], cells: shown.map((x) => [x.id, x.status, x.owner, x.priority, x.created]), tones },
        { type: 'list', title: 'Query params', orientation: 'horizontal', items: [...params.entries()].map(([k, v]) => ({ id: k, label: `${k}=${v}`, tone: marks.get(k) ?? ('default' as Tone) })), emptyText: 'no params' },
      ];
    };
    r.step('loop', `${ROWS.length} tickets, ${params.size} query param${params.size === 1 ? '' : 's'} to look at`, view(), { params: params.size });
    for (const [key, value] of params) {
      r.op();
      if (FILTERS.includes(key)) {
        marks.set(key, 'active');
        r.step('allow', `${key} is on the allow-list of filter fields`, view(), { key, value });
        out = out.filter((x) => String((x as any)[key]) === value);
        marks.set(key, 'done');
        r.step('filter', `Keep ${key} == "${value}": ${out.length} ticket${out.length === 1 ? '' : 's'} left`, view(), { key, value, left: out.length });
      } else {
        marks.set(key, 'muted');
        r.step('allow', key === 'sort' ? 'sort is handled separately below, not a filter' : `${key} is not an allowed filter: ignore it`, view(), { key, value });
      }
    }
    const sort = params.get('sort') ?? '';
    r.step('sort', sort ? `sort="${sort}": a leading "-" means descending` : 'No sort param: keep the current order', view(), { sort: sort || 'none' });
    const field = sort.replace(/^-+/, '');
    if (SORTS.includes(field)) {
      r.step('sortcheck', `${field} is on the sort allow-list`, view(), { field });
      const desc = sort.startsWith('-');
      out = [...out].sort((a, b) => ((a as any)[field] - (b as any)[field]) * (desc ? -1 : 1));
      marks.set('sort', 'done');
      r.step('sortapply', `Sort by ${field}, ${desc ? 'descending' : 'ascending'}`, view(), { field, desc });
    } else if (sort) {
      marks.set('sort', 'error');
      r.step('sortcheck', `"${field}" is not sortable: the sort is ignored, not trusted`, view(), { field });
    }
    const ids = out.map((x) => x.id);
    r.step('done', `Response ids: [${ids.join(', ')}]`, view(), { ids });
    return { frames: r.frames, result: ids };
  },
  reference({ query }) {
    const p: Record<string, string> = {};
    for (const [k, v] of parseQuery(query)) p[k] = v;
    let rows = ROWS.filter((t) => FILTERS.every((f) => p[f] === undefined || String((t as any)[f]) === p[f]));
    const s = p.sort ?? '';
    const f = s.replace(/^-+/, '');
    if (SORTS.includes(f)) {
      const sign = s[0] === '-' ? -1 : 1;
      rows = rows
        .map((t, i) => ({ t, i }))
        .sort((a, b) => sign * ((a.t as any)[f] - (b.t as any)[f]) || a.i - b.i)
        .map((x) => x.t);
    }
    return rows.map((t) => t.id);
  },
};

const PY_ROWS = ROWS;

const practiceTests = [
  { args: [PY_ROWS, {}], expected: [1, 2, 3, 4, 5, 6], name: 'no params' },
  { args: [PY_ROWS, { status: 'open' }], expected: [1, 3, 4, 6], name: 'one filter' },
  { args: [PY_ROWS, { status: 'open', owner: 'ann' }], expected: [1, 4], name: 'two filters' },
  { args: [PY_ROWS, { sort: '-priority' }], expected: [3, 6, 5, 1, 4, 2], name: 'descending, ties keep order' },
  { args: [PY_ROWS, { sort: 'priority' }], expected: [2, 4, 1, 5, 3, 6], name: 'ascending' },
  { args: [PY_ROWS, { debug: '1', status: 'closed' }], expected: [2, 5], name: 'unknown param ignored' },
  { args: [PY_ROWS, { sort: 'password' }], expected: [1, 2, 3, 4, 5, 6], name: 'sort field not allowed' },
  { args: [PY_ROWS, { priority: '5' }], expected: [1, 2, 3, 4, 5, 6], name: 'priority is not a filter field' },
  { args: [PY_ROWS, { status: 'open', sort: '-created' }], expected: [6, 4, 3, 1], name: 'filter then sort' },
];

const unit: Unit = {
  id: 'be-filtering',
  hook: 'List endpoints turn user-controlled strings into queries. An allow-list is the difference between a clean API and one that leaks columns or crashes on `?foo=bar`.',
  predict: {
    prompt: 'A lazy endpoint runs `Model.objects.order_by(request.GET["sort"])` for every request. Which request is the most worrying?',
    options: ['`?sort=-created`', '`?sort=password`', '`?sort=`', '`?page=2`'],
    answer: 1,
    explain: 'Sorting by a field you never meant to expose lets an attacker infer its values (sort, compare orders, repeat) and unknown fields raise a 500. Only fields on an explicit allow-list should be sortable or filterable.',
  },
  viz,
  deeper: {
    points: [
      'Keep an **allow-list** for filterable fields and another for sortable fields. Never pass raw param names into ORM lookups.',
      '`sort=-priority` is the common convention: a leading `-` means descending, no sign means ascending.',
      'Unknown query params are ignored (forward compatibility); invalid *values* for known params are a 400.',
      'Sort must be deterministic: add a unique tiebreaker such as `id`, otherwise pagination over equal values can duplicate or skip rows.',
      'Query values are always strings: convert (`int(value)`) and validate before using them.',
    ],
    pitfalls: ['Applying every query param as a filter (`?page=2` empties the list)', 'Letting `?sort=` accept any column', 'Forgetting that Python `sort(reverse=True)` is still stable but a hand-written comparator may not be'],
  },
  practice: {
    language: 'python',
    fnName: 'apply_query',
    statement: 'Filter and sort `rows` (dicts with id, status, owner, priority, created). Only `status` and `owner` may be filtered, compared as strings. `sort` may be `priority` or `created`, with a leading `-` for descending; anything else is ignored. Ignore unknown params. Return the list of ids.',
    signature: 'def apply_query(rows, params):',
    solution: `FILTERS = {"status", "owner"}
SORTS = {"priority", "created"}

def apply_query(rows, params):
    out = list(rows)
    for key, value in params.items():
        if @@key in FILTERS@@:
            out = [r for r in out if @@str(r[key]) == value@@]
    sort = params.get("sort", "")
    field = @@sort.lstrip("-")@@
    if @@field in SORTS@@:
        out.sort(key=lambda r: r[field], reverse=@@sort.startswith("-")@@)
    return [r["id"] for r in out]`,
    tests: practiceTests,
  },
  debug: {
    language: 'python',
    fnName: 'apply_query',
    statement: 'The ticket list becomes empty as soon as the frontend adds a harmless tracking param like `?debug=1`. Fix the handler.',
    buggy: `FILTERS = {"status", "owner"}
SORTS = {"priority", "created"}

def apply_query(rows, params):
    out = list(rows)
    for key, value in params.items():
        if key == "sort":
            continue
        out = [r for r in out if str(r.get(key)) == value]
    sort = params.get("sort", "")
    field = sort.lstrip("-")
    if field in SORTS:
        out.sort(key=lambda r: r[field], reverse=sort.startswith("-"))
    return [r["id"] for r in out]`,
    fixed: `FILTERS = {"status", "owner"}
SORTS = {"priority", "created"}

def apply_query(rows, params):
    out = list(rows)
    for key, value in params.items():
        if key in FILTERS:
            out = [r for r in out if str(r[key]) == value]
    sort = params.get("sort", "")
    field = sort.lstrip("-")
    if field in SORTS:
        out.sort(key=lambda r: r[field], reverse=sort.startswith("-"))
    return [r["id"] for r in out]`,
    tests: practiceTests,
    bugType: 'missing allow-list',
    hint: 'What does the loop do with a param that is not a column at all?',
    explanation: 'Every param except `sort` is treated as a filter, so `debug=1` filters on a column nobody has and wipes the list (and `priority=5` would silently filter on an unexposed field). Only keys in the FILTERS allow-list should filter.',
  },
  boss: {
    title: 'Ticket list view',
    statement:
      'Write the view `ticket_list(request)` on a minidjango `Ticket` model (fields status, owner, priority, created; the harness seeds 6 rows and routes `/tickets/`). Query params: `status`, `owner` (equality filters), `min_priority` (priority >= int; non-integer -> 400 `{"error": "min_priority must be an integer"}`), `sort` (id, priority or created, `-` for descending, default `id`; anything else -> 400 `{"error": "cannot sort by <field>"}`). Ignore other params. Order ties by id ascending. Respond with a JSON list of ids (`JsonResponse(..., safe=False)`).',
    language: 'python',
    fnName: 'ticket_list',
    harness: `
from minidjango import models
from minidjango.http import App, path, JsonResponse
from minidjango.test import Client

class Ticket(models.Model):
    status = models.CharField(max_length=10)
    owner = models.CharField(max_length=10)
    priority = models.IntegerField()
    created = models.IntegerField()

for _s, _o, _p, _c in [("open", "ann", 3, 1), ("closed", "bob", 1, 2), ("open", "bob", 5, 3), ("open", "ann", 2, 4), ("closed", "ann", 4, 5), ("open", "cy", 5, 6)]:
    Ticket.objects.create(status=_s, owner=_o, priority=_p, created=_c)

def run_list(view, qs):
    r = Client(App([path("tickets/", view)])).get("/tickets/?" + qs)
    return [r.status_code, r.json()]
`,
    adapter: 'run_list',
    starter: `def ticket_list(request):
    # your code here
    pass
`,
    solution: `def ticket_list(request):
    qs = Ticket.objects.all()
    filters = {k: v for k, v in request.GET.items() if k in ("status", "owner")}
    qs = qs.filter(**filters)
    if "min_priority" in request.GET:
        try:
            qs = qs.filter(priority__gte=int(request.GET["min_priority"]))
        except ValueError:
            return JsonResponse({"error": "min_priority must be an integer"}, status=400)
    sort = request.GET.get("sort", "id")
    field = sort.lstrip("-")
    if field not in ("id", "priority", "created"):
        return JsonResponse({"error": "cannot sort by " + field}, status=400)
    qs = qs.order_by(sort, "id")
    return JsonResponse([t.id for t in qs], safe=False)`,
    tests: [
      { args: [''], expected: [200, [1, 2, 3, 4, 5, 6]], name: 'defaults' },
      { args: ['status=open&min_priority=3'], expected: [200, [1, 3, 6]], name: 'filter + min_priority' },
      { args: ['sort=-priority'], expected: [200, [3, 6, 5, 1, 4, 2]], name: 'descending with id tiebreak' },
      { args: ['sort=password'], expected: [400, { error: 'cannot sort by password' }], name: 'sort allow-list' },
      { args: ['min_priority=abc'], expected: [400, { error: 'min_priority must be an integer' }], name: 'bad integer' },
      { args: ['owner=ann&sort=created'], expected: [200, [1, 4, 5]], name: 'owner + sort' },
      { args: ['owner=zed'], expected: [200, []], name: 'no matches is not an error' },
      { args: ['color=red&owner=bob&sort=-created'], expected: [200, [3, 2]], name: 'unknown param ignored' },
    ],
    hints: ['Build a dict of allowed filters from `request.GET` and unpack it into `filter(**filters)`. Validate `sort` against the allow-list before calling `order_by`.', '`order_by(sort, "id")` gives the stable tiebreak. `int()` raises ValueError for bad input: catch it and return the 400 JSON.'],
    combines: ['be-pagination'],
  },
  simulationNote: 'The boss task uses `minidjango`, a small pure-Python imitation of Django\'s ORM and views that runs in your browser. Names and behaviour mirror Django, but it is not Django itself.',
  quiz: [
    {
      prompt: 'Why add `id` as a final tiebreaker when sorting a list endpoint?',
      options: ['It makes queries faster', 'Equal values otherwise come back in arbitrary order, which breaks pagination', 'Django requires it', 'It hides internal ids'],
      answer: 1,
      explain: 'Rows with equal sort keys can be returned in any order, so consecutive pages may overlap or skip. A unique tiebreaker makes the order total and repeatable.',
    },
  ],
};

export default unit;
