import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LIBRARY_HARNESS, SIM_NOTE, applyCall, emptyQ, existsSql, parseExpr, rowLabel, runQuery, sqlParts, toSql, type SqlParts } from '@/content/lib/backend-orm';

const code = `
qs = Book.objects.all()                 # SELECT book.* FROM book                  #@all
qs = qs.filter(author__name="Ana")      # adds WHERE (a FK lookup adds a JOIN)     #@filter
qs = qs.exclude(pages__lt=100)          # adds NOT (...)                           #@exclude
qs = qs.order_by("-pages")              # adds ORDER BY ... DESC                   #@order
qs = qs.select_related("author")        # adds LEFT OUTER JOIN and author.*        #@select
qs = qs.values_list("title")            # narrows the SELECT list                  #@values
qs = qs[:3]                             # adds LIMIT 3 (slice [2:5] adds OFFSET)   #@slice
list(qs)                                # NOW the SQL runs, once                   #@run
`;

const ANCHOR: Record<string, string> = { all: 'all', filter: 'filter', exclude: 'exclude', order_by: 'order', select_related: 'select', prefetch_related: 'select', values_list: 'values', values: 'values', '[]': 'slice', count: 'run', exists: 'run' };

const clauses = (p: SqlParts): [string, string][] => [
  ['SELECT', p.select],
  ['FROM', p.from],
  ['WHERE', p.where || '-'],
  ['ORDER BY', p.order || '-'],
  ['LIMIT / OFFSET', p.limit || '-'],
];

interface In {
  chain: string;
}

const viz: VizDef<In> = {
  id: 'orm-to-sql',
  title: 'From ORM calls to one SQL statement',
  code,
  language: 'python',
  inputs: [{ key: 'chain', label: 'Queryset expression on Book', kind: 'string', default: 'Book.objects.filter(author__name="Ana").exclude(pages__lt=100).order_by("-pages")[:3]', maxItems: 220, help: 'Fields: title, pages, author (author__name, author__country). Lookups: gt, gte, lt, lte, in, contains, icontains, startswith, endswith, isnull. Optional .count() or .exists() at the end.' }],
  presets: [
    { label: 'exclude with two kwargs', input: { chain: 'Book.objects.exclude(author__name="Ana", pages__lte=100)' } },
    { label: 'Lookups and slice', input: { chain: 'Book.objects.filter(title__icontains="o").filter(pages__in=[90, 120, 150])[1:3]' } },
    { label: 'select_related + count', input: { chain: 'Book.objects.select_related("author").filter(pages__gt=300).count()' } },
  ],
  run({ chain }) {
    const { head, calls } = parseExpr(chain);
    if (head !== 'Book.objects') throw new Error('Start the expression with Book.objects');
    const terminal = calls.length && ['count', 'exists'].includes(calls[calls.length - 1].name) ? calls.pop()! : null;
    const r = new Recorder(code);
    let q = emptyQ();
    let prev = sqlParts(q);
    const lines: { text: string; tone?: Tone }[] = [{ text: 'Book.objects.all()' }];
    const panels = (cur: SqlParts, before: SqlParts | null): Panel[] => {
      const old = before ? clauses(before) : [];
      return [
        { type: 'kv', title: 'The SQL being built (nothing has run yet)', entries: clauses(cur).map(([k, v], i) => ({ k, v, tone: before && old[i][1] !== v ? ('new' as Tone) : ('default' as Tone) })) },
        { type: 'log', title: 'Python so far', lines: [...lines] },
      ];
    };
    r.step('all', 'Book.objects.all() is just a plain SELECT, still lazy', panels(prev, null), { queries: 0 });
    for (const c of calls) {
      q = applyCall(q, c);
      const cur = sqlParts(q);
      lines.push({ text: c.name === '[]' ? c.raw : `.${c.raw}`, tone: 'new' });
      const joinAdded = cur.from !== prev.from;
      const cap =
        c.name === 'filter' ? `filter() adds to WHERE${joinAdded ? ' and joins the author table' : ''}` :
        c.name === 'exclude' ? `exclude() wraps its conditions in NOT (...)${joinAdded ? ' and joins author' : ''}` :
        c.name === 'order_by' ? 'order_by() sets ORDER BY; a leading - means DESC' :
        c.name === 'select_related' ? 'select_related() joins author so one query loads both' :
        c.name === 'prefetch_related' ? 'prefetch_related() changes nothing here: it adds a 2nd query later' :
        c.name === '[]' ? 'Slicing sets LIMIT (and OFFSET when it starts above 0)' :
        c.name.startsWith('values') ? 'values_list() narrows the selected columns' : 'all() returns an equivalent queryset';
      r.step(ANCHOR[c.name] ?? 'all', cap, panels(cur, prev), { queries: 0 });
      prev = cur;
    }
    const rows = runQuery(q);
    if (terminal) {
      const sql = terminal.name === 'count' ? toSql(q, true) : existsSql(q);
      lines.push({ text: `.${terminal.raw}`, tone: 'found' });
      const value = terminal.name === 'count' ? rows.length : rows.length > 0;
      r.step('run', `${terminal.name}() runs one query now: ${terminal.name === 'count' ? 'COUNT(*)' : 'LIMIT 1'}`, [{ type: 'kv', title: 'Executed SQL', entries: [{ k: 'sql', v: sql, tone: 'active' }, { k: 'returns', v: String(value), tone: 'found' }] }, { type: 'log', title: 'Python so far', lines: [...lines] }], { queries: 1 });
      return { frames: r.frames, result: { sql, value } };
    }
    const sql = toSql(q);
    lines.push({ text: 'list(qs)  # evaluation', tone: 'found' });
    r.step('run', `Evaluating the queryset runs it once: ${rows.length} row${rows.length === 1 ? '' : 's'}`, [{ type: 'kv', title: 'Executed SQL', entries: [{ k: 'sql', v: sql, tone: 'active' }] }, { type: 'array', title: 'Rows returned', values: q.values ? rows.map((x) => q.values!.map((c) => (x as Record<string, unknown>)[c]).join(' / ')) : rows.map(rowLabel), hideIndex: true }, { type: 'log', title: 'Python so far', lines: [...lines] }], { queries: 1 });
    return { frames: r.frames, result: { sql, value: rows.map((x) => x.id) } };
  },
};

const sqlTitles = (n: string, a: unknown[], sql: string, titles: string[]) => ({ args: a, expected: [sql, titles], name: n });

const unit: Unit = {
  id: 'be-orm-sql',
  hook: 'Interviewers ask "what SQL does this ORM line produce?" to see whether you think in tables and joins. Reading `qs.query` is the fastest way to catch wrong filters and hidden joins.',
  predict: {
    prompt: 'Which rows does this queryset return?',
    code: 'Book.objects.exclude(author__name="Ana", pages__lte=100)',
    codeLang: 'python',
    options: ['Books not by Ana that have more than 100 pages', 'Everything except Ana\'s short books (Ana\'s long books are kept)', 'Only Ana\'s books longer than 100 pages', 'Nothing: exclude takes one keyword only'],
    answer: 1,
    explain: 'Keywords inside one exclude() are ANDed and then negated: NOT (author = Ana AND pages <= 100). Only rows matching both are removed. To say "not Ana and long", chain two calls.',
  },
  viz,
  deeper: {
    points: [
      'Each chained call returns a new queryset with one more piece of SQL: filter adds WHERE, order_by adds ORDER BY, slicing adds LIMIT/OFFSET.',
      'Keyword arguments in one filter() are ANDed; chaining filter() calls is also AND for single-valued fields. exclude() negates the whole group.',
      'Double underscores walk relations (`author__name`) and add a JOIN; suffixes pick the operator (`__gt`, `__in`, `__icontains`).',
      'Print `str(qs.query)` while debugging: it shows the SQL without running it.',
    ],
    pitfalls: ['exclude(a=1, b=2) is NOT (a AND b), not "neither a nor b"', 'Slicing after you already iterated does not re-run the query', 'A lookup across a relation silently joins; on big tables that needs an index on the joined column'],
  },
  practice: {
    language: 'python',
    fnName: 'top_books',
    statement: 'Return a queryset (do not evaluate it) of books by the author named `author_name` with more than `min_pages` pages, longest first, at most `limit` rows. `Book` and `Author` exist.',
    signature: 'def top_books(author_name, min_pages, limit):',
    solution: `def top_books(author_name, min_pages, limit):
    qs = Book.objects.filter(author__name=@@author_name@@, pages__gt=@@min_pages@@)
    qs = qs.order_by(@@"-pages"@@)
    return qs[:@@limit@@]`,
    harness: `${LIBRARY_HARNESS}
def sql_and_titles(fn, *args):
    seed_library()
    qs = fn(*args)
    return [qs.query, [b.title for b in qs]]
`,
    adapter: 'sql_and_titles',
    tests: [
      sqlTitles('top two of Ana', ['Ana', 100, 2], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE author.name = 'Ana' AND book.pages > 100 ORDER BY book.pages DESC LIMIT 2", ['Lantern', 'Compass']),
      sqlTitles('min pages filters', ['Ben', 200, 5], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE author.name = 'Ben' AND book.pages > 200 ORDER BY book.pages DESC LIMIT 5", ['Tundra', 'Meadow']),
      sqlTitles('single result', ['Cleo', 100, 3], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE author.name = 'Cleo' AND book.pages > 100 ORDER BY book.pages DESC LIMIT 3", ['Ember']),
      sqlTitles('unknown author', ['Zed', 0, 1], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE author.name = 'Zed' AND book.pages > 0 ORDER BY book.pages DESC LIMIT 1", []),
      sqlTitles('limit 1', ['Ana', 400, 1], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE author.name = 'Ana' AND book.pages > 400 ORDER BY book.pages DESC LIMIT 1", ['Lantern']),
    ],
  },
  debug: {
    language: 'python',
    fnName: 'books_not_by',
    statement: '`books_not_by(name, min_pages)` should return books NOT written by `name` that have more than `min_pages` pages. It also returns long books by that author. Fix it.',
    buggy: `def books_not_by(name, min_pages):
    return Book.objects.exclude(author__name=name, pages__lte=min_pages)`,
    fixed: `def books_not_by(name, min_pages):
    return Book.objects.exclude(author__name=name).filter(pages__gt=min_pages)`,
    harness: `${LIBRARY_HARNESS}
def sql_and_titles(fn, *args):
    seed_library()
    qs = fn(*args)
    return [qs.query, [b.title for b in qs]]
`,
    adapter: 'sql_and_titles',
    tests: [
      sqlTitles('not Ana, over 100', ['Ana', 100], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE NOT (author.name = 'Ana') AND book.pages > 100", ['Harbor', 'Meadow', 'Ember', 'Tundra']),
      sqlTitles('not Ben, over 100', ['Ben', 100], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE NOT (author.name = 'Ben') AND book.pages > 100", ['Orbit', 'Lantern', 'Compass', 'Ember']),
      sqlTitles('not Cleo, over 300', ['Cleo', 300], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE NOT (author.name = 'Cleo') AND book.pages > 300", ['Orbit', 'Lantern', 'Compass', 'Tundra']),
      sqlTitles('nothing long enough', ['Ana', 500], "SELECT book.* FROM book INNER JOIN author ON book.author_id = author.id WHERE NOT (author.name = 'Ana') AND book.pages > 500", []),
    ],
    bugType: 'exclude() with several kwargs',
    hint: 'Print `qs.query`. Does the WHERE say "not Ana AND long", or "NOT (Ana AND short)"?',
    explanation: 'Keywords in one exclude() are ANDed and the group negated, so only books matching both conditions were removed; Ana\'s long books survived. Use exclude() for the author and filter() for the page count.',
  },
  boss: {
    title: 'Book search endpoint',
    statement: 'Write the view `book_search(request)`. Query params (all optional): `author` (exact author name), `min_pages` (integer, pages >= value), `sort` (one of title, -title, pages, -pages; default title). Return 200 `{"results": [{"title", "author"}...]}` with the author name read from the book. A non-integer min_pages gives 400 `{"min_pages": ["A valid integer is required."]}`; a bad sort gives 400 `{"sort": ["Choose one of: title, -title, pages, -pages."]}`. Validate before touching the database, and a successful request must run exactly one query.',
    language: 'python',
    fnName: 'book_search',
    starter: `def book_search(request):
    # your code here
    pass
`,
    solution: `SORTS = ("title", "-title", "pages", "-pages")

def book_search(request):
    sort = request.GET.get("sort", "title")
    if sort not in SORTS:
        return JsonResponse({"sort": ["Choose one of: title, -title, pages, -pages."]}, status=400)
    qs = Book.objects.select_related("author")
    author = request.GET.get("author")
    if author:
        qs = qs.filter(author__name=author)
    min_pages = request.GET.get("min_pages")
    if min_pages is not None:
        try:
            qs = qs.filter(pages__gte=int(min_pages))
        except ValueError:
            return JsonResponse({"min_pages": ["A valid integer is required."]}, status=400)
    qs = qs.order_by(sort)
    return JsonResponse({"results": [{"title": b.title, "author": b.author.name} for b in qs]})`,
    harness: LIBRARY_HARNESS,
    adapter: 'get_json',
    tests: [
      {
        args: ['/books/'],
        expected: [200, { results: [{ title: 'Compass', author: 'Ana' }, { title: 'Ember', author: 'Cleo' }, { title: 'Harbor', author: 'Ben' }, { title: 'Lantern', author: 'Ana' }, { title: 'Meadow', author: 'Ben' }, { title: 'Orbit', author: 'Ana' }, { title: 'Quartz', author: 'Cleo' }, { title: 'Tundra', author: 'Ben' }] }, 1],
        name: 'defaults, one query',
      },
      { args: ['/books/?author=Ana&min_pages=400&sort=-pages'], expected: [200, { results: [{ title: 'Lantern', author: 'Ana' }, { title: 'Compass', author: 'Ana' }] }, 1], name: 'filters and sorting' },
      { args: ['/books/?min_pages=abc'], expected: [400, { min_pages: ['A valid integer is required.'] }, 0], name: 'bad min_pages' },
      { args: ['/books/?sort=author'], expected: [400, { sort: ['Choose one of: title, -title, pages, -pages.'] }, 0], name: 'bad sort' },
      { args: ['/books/?author=Nobody'], expected: [200, { results: [] }, 1], name: 'no results' },
    ],
    hints: ['Read everything from `request.GET.get(...)`, build the queryset step by step, and only iterate it at the very end. Return the 400s before iterating.', 'Use `select_related("author")` so `b.author.name` does not run a query per row, and `int(...)` inside try/except ValueError for min_pages.'],
    combines: ['be-orm-sql', 'be-n-plus-one', 'be-request-lifecycle'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
