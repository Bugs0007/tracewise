import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LIBRARY_HARNESS, SIM_NOTE, applyCall, emptyQ, existsSql, parseExpr, parseSlice, runQuery, toSql, type QState } from '@/content/lib/backend-orm';

const code = `
qs = Book.objects.filter(pages__gt=100)    # builds a query, runs nothing      #@build
qs = qs.order_by("title")                  # a NEW lazy queryset, empty cache  #@chain
len(qs)                                    # evaluates: one SELECT, then cached  #@len
for b in qs: ...                           # iterating evaluates (or reuses)    #@iter
list(qs)                                   # evaluates (or reuses the cache)    #@list
bool(qs)   # also: if qs:                  # evaluates everything               #@bool
repr(qs)   # also: print(qs)               # evaluates (shows up to 20 rows)    #@repr
qs[0]                                      # one row: LIMIT 1                   #@index
qs[:2]                                     # still lazy: adds LIMIT 2           #@slice
qs[::2]                                    # a step forces evaluation           #@step
qs.count()                                 # COUNT(*), or len(cache) if cached  #@count
qs.exists()                                # SELECT 1 ... LIMIT 1               #@exists
qs.first()                                 # ORDER BY + LIMIT 1                 #@first
`;

interface Var {
  q: QState;
  cache: number | null; // rows cached (null = lazy)
}

type Op = 'len' | 'list' | 'bool' | 'repr' | 'iter';
const OP_ANCHOR: Record<Op, string> = { len: 'len', list: 'list', bool: 'bool', repr: 'repr', iter: 'iter' };

interface In {
  steps: string[];
}

const viz: VizDef<In> = {
  id: 'lazy-querysets',
  title: 'Lazy querysets: when does the SQL run?',
  code,
  language: 'python',
  inputs: [
    {
      key: 'steps',
      label: 'Statements, one per item',
      kind: 'strings',
      default: ['qs = Book.objects.filter(pages__gt=100)', 'qs = qs.order_by("title")', 'qs.count()', 'len(qs)', 'for b in qs', 'qs.count()', 'qs2 = qs.exclude(pages__gt=400)', 'qs2[0]', 'list(qs2)', 'qs2[::2]'],
      maxItems: 12,
      help: 'Forms: NAME = Book.objects.<chain>, NAME = other.<chain>, len(x) list(x) bool(x) repr(x), for b in x, x[0], x[:2], x[::2], x.count(), x.exists(), x.first(). One lookup per call.',
    },
  ],
  presets: [
    { label: 'bool(qs) vs exists()', input: { steps: ['qs = Book.objects.filter(pages__gt=300)', 'bool(qs)', 'qs.exists()', 'for b in qs', 'qs.exists()'] } },
    { label: 'Slicing', input: { steps: ['qs = Book.objects.order_by("-pages")', 'top = qs[:3]', 'list(top)', 'list(top)', 'qs[::2]'] } },
    { label: 'Chaining loses the cache', input: { steps: ['qs = Book.objects.all()', 'list(qs)', 'list(qs)', 'qs = qs.filter(pages__lt=200)', 'list(qs)'] } },
  ],
  run({ steps }) {
    const list = steps.map((s) => s.trim()).filter(Boolean);
    if (!list.length) throw new Error('Add at least one statement');
    const r = new Recorder(code);
    const vars: Record<string, Var> = {};
    const executed: { text: string; tone?: Tone }[] = [];
    let queries = 0;
    let focus: QState = emptyQ();
    const panels = (): Panel[] => [
      {
        type: 'list',
        title: 'Variables',
        orientation: 'vertical',
        items: Object.entries(vars).map(([name, v]) => ({ id: name, label: name, sub: v.cache === null ? 'lazy, no rows' : `cached ${v.cache} rows`, tone: (v.cache === null ? 'muted' : 'done') as Tone })),
        emptyText: 'none yet',
      },
      { type: 'kv', title: 'Query counter', entries: [{ k: 'queries run', v: queries, tone: queries ? 'active' : 'default' }, { k: 'SQL of last queryset', v: toSql(focus) }] },
      { type: 'log', title: 'SQL actually executed', lines: [...executed] },
    ];
    const hit = (sql: string): number => {
      queries++;
      executed.push({ text: `#${queries} ${sql}`, tone: 'active' });
      return queries;
    };
    r.step('build', 'Start: no queryset exists, no query has run', panels(), { queries });

    for (const s of list) {
      let m: RegExpMatchArray | null;
      let anchor = 'build';
      let cap = '';
      const get = (n: string): Var => {
        if (!vars[n]) throw new Error(`Unknown variable "${n}"`);
        return vars[n];
      };
      const evaluate = (n: string, op: Op) => {
        const v = get(n);
        focus = v.q;
        anchor = OP_ANCHOR[op];
        const label = op === 'iter' ? `for b in ${n}` : `${op}(${n})`;
        if (v.cache !== null) cap = `${label}: served from the cache, no query`;
        else {
          const rows = runQuery(v.q).length;
          const k = hit(toSql(v.q));
          v.cache = rows;
          cap = `${label} evaluates it: query #${k}, ${rows} rows are now cached`;
        }
      };
      if ((m = s.match(/^for\s+\w+\s+in\s+(\w+)$/))) evaluate(m[1], 'iter');
      else if ((m = s.match(/^(len|list|bool|repr|print|str)\(\s*(\w+)\s*\)$/))) evaluate(m[2], m[1] === 'print' || m[1] === 'str' ? 'repr' : (m[1] as Op));
      else {
        const asg = s.match(/^(\w+)\s*=\s*(.+)$/);
        const expr = asg ? asg[2] : s;
        const { head, calls } = parseExpr(expr);
        const base = head === 'Book.objects' ? null : get(head);
        let q = base ? base.q : emptyQ();
        let cached = base ? base.cache : null;
        const ownName = base ? head : '';
        let produced = false;
        let done = false;
        for (let i = 0; i < calls.length && !done; i++) {
          const c = calls[i];
          if (c.name === 'count' || c.name === 'exists' || c.name === 'first') {
            focus = q;
            anchor = c.name;
            if (cached !== null && !produced) cap = `${c.name}() uses the cache: no query`;
            else if (c.name === 'count') cap = `count() sends COUNT(*): query #${hit(toSql(q, true))}`;
            else if (c.name === 'exists') cap = `exists() sends SELECT 1 ... LIMIT 1: query #${hit(existsSql(q))}`;
            else cap = `first() sends ORDER BY + LIMIT 1: query #${hit(toSql({ ...q, order: q.order ?? ['id'], high: q.low + 1 }))}`;
            done = true;
          } else if (c.name === '[]') {
            const sl = parseSlice(c.raw);
            focus = q;
            if ('index' in sl) {
              anchor = 'index';
              if (cached !== null && !produced) cap = `${ownName}[${sl.index}] reads the cached list: no query`;
              else cap = `[${sl.index}] fetches one row: query #${hit(toSql(applyCall(q, c)))}, LIMIT 1`;
              done = true;
            } else if (sl.step) {
              anchor = 'step';
              const nq = applyCall(q, c);
              if (cached !== null && !produced) cap = 'A step slice on a cached queryset reuses the cache: no query';
              else cap = `A slice with step ${sl.step} evaluates now: query #${hit(toSql(nq))}`;
              done = true;
            } else if (cached !== null && !produced) {
              anchor = 'slice';
              cap = 'Slicing a cached queryset returns a list from the cache: no query';
              if (asg) vars[asg[1]] = { q, cache: cached };
              done = true;
            } else {
              anchor = 'slice';
              q = applyCall(q, c);
              produced = true;
              cached = null;
              cap = 'A slice with no step stays lazy: it only adds LIMIT / OFFSET';
            }
          } else {
            q = applyCall(q, c);
            produced = true;
            cached = null;
            anchor = base ? 'chain' : 'build';
            cap = base ? `Chaining makes a NEW lazy queryset; ${head}'s cache is not carried over` : 'Building a queryset sends nothing to the database';
          }
        }
        if (produced && !done) {
          if (asg) vars[asg[1]] = { q, cache: null };
          focus = q;
        }
        if (!calls.length && asg) {
          vars[asg[1]] = { q, cache: null };
          focus = q;
          cap = 'An un-filtered queryset is still lazy';
        }
        if (!cap) cap = 'Nothing runs';
      }
      r.step(anchor, cap.length > 90 ? cap.slice(0, 87) + '...' : cap, panels(), { queries });
    }
    r.step('count', `Done: ${queries} quer${queries === 1 ? 'y' : 'ies'} for ${list.length} statements`, panels(), { queries });
    return { frames: r.frames, result: queries };
  },
  reference({ steps }) {
    // independent bookkeeping with plain text rules: which names hold a warm cache, and what costs a query
    const cached = new Set<string>();
    let n = 0;
    for (const raw of steps.map((x) => x.trim()).filter(Boolean)) {
      const loop = raw.match(/^for\s+\w+\s+in\s+(\w+)$/) ?? raw.match(/^(?:len|list|bool|repr|print|str)\(\s*(\w+)\s*\)$/);
      if (loop) {
        if (!cached.has(loop[1])) {
          n++;
          cached.add(loop[1]);
        }
        continue;
      }
      const asg = raw.match(/^(\w+)\s*=\s*(.+)$/);
      const expr = asg ? asg[2] : raw;
      const warm = expr.split(/[.[]/)[0] !== 'Book' && cached.has(expr.split(/[.[]/)[0]);
      const chain = /\.(filter|exclude|order_by|select_related|prefetch_related|all|values_list|values)\(/.test(expr);
      const stepped = /\[[^\]]*:[^\]]*:[^\]]*\]$/.test(expr);
      const lazySlice = !stepped && /\[[^\]]*:[^\]]*\]$/.test(expr);
      if (/\.(count|exists|first)\(\)$/.test(expr) || stepped || /\[\d+\]$/.test(expr)) {
        if (!(warm && !chain)) n++;
        continue;
      }
      if (asg) {
        if (warm && !chain && lazySlice) cached.add(asg[1]);
        else cached.delete(asg[1]);
      }
    }
    return n;
  },
};

const harness = `${LIBRARY_HARNESS}
def run_counted(fn, *args):
    seed_library()
    result = fn(*args)
    sqls = [q["sql"] for q in connection.queries]
    return [result, connection.query_count, sqls[-1] if sqls else None]
`;

const unit: Unit = {
  id: 'be-lazy-querysets',
  hook: 'Laziness is why Django code is both elegant and easy to make slow. Interviewers ask "when does this query actually run?" and "what is the difference between count(), len() and exists()?".',
  predict: {
    prompt: 'How many database queries does this code run?',
    code: 'qs = Book.objects.filter(pages__gt=100)\nn = len(qs)\nfor b in qs:\n    print(b.title)\nm = qs.count()',
    codeLang: 'python',
    options: ['1', '2', '3', '4'],
    answer: 0,
    explain: 'len(qs) evaluates the queryset with one SELECT and caches the rows. Iterating reuses that cache, and count() on an already-evaluated queryset returns len(cache) instead of sending COUNT(*).',
  },
  viz,
  deeper: {
    points: [
      'Chaining (filter, exclude, order_by, all, slicing without a step) never touches the database; it builds a new queryset object with more SQL.',
      'Evaluation points: iteration, len(), list(), bool() / `if qs`, repr(), indexing with [i] (LIMIT 1), slicing with a step, and the terminal methods count(), exists(), first().',
      'An evaluated queryset caches its rows; reusing the same object is free, but every new queryset derived from it starts empty.',
      'Use exists() instead of `if qs:`, count() instead of len(qs) when you do not need the rows, and slices to cap how many rows you load.',
    ],
    pitfalls: ['Calling .all() or .filter() on a variable inside a loop, which discards the cache and re-queries', 'Using `if queryset:` as an existence check, which loads every row', 'Calling count() and then iterating the same unevaluated queryset (two queries)'],
  },
  practice: {
    language: 'python',
    fnName: 'top_titles',
    statement: 'Return the titles (plain strings) of the `n` books with the most pages, most pages first, using exactly one query that selects only the title column and limits the rows in SQL. `Book` exists.',
    signature: 'def top_titles(n):',
    solution: `def top_titles(n):
    qs = Book.objects.@@order_by("-pages")@@
    qs = qs.@@values_list("title", flat=True)@@
    return @@list@@(qs[:@@n@@])`,
    harness,
    adapter: 'run_counted',
    tests: [
      { args: [3], expected: [['Lantern', 'Compass', 'Tundra'], 1, 'SELECT book.title FROM book ORDER BY book.pages DESC LIMIT 3'], name: 'top three' },
      { args: [1], expected: [['Lantern'], 1, 'SELECT book.title FROM book ORDER BY book.pages DESC LIMIT 1'], name: 'top one' },
      { args: [0], expected: [[], 1, 'SELECT book.title FROM book ORDER BY book.pages DESC LIMIT 0'], name: 'zero rows' },
      { args: [20], expected: [['Lantern', 'Compass', 'Tundra', 'Orbit', 'Meadow', 'Harbor', 'Ember', 'Quartz'], 1, 'SELECT book.title FROM book ORDER BY book.pages DESC LIMIT 20'], name: 'more than exist' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'has_long_books',
    statement: '`has_long_books(min_pages)` returns the right answer but loads every matching book just to check whether any exists. It should send a single `SELECT 1 ... LIMIT 1`.',
    buggy: `def has_long_books(min_pages):
    books = Book.objects.filter(pages__gt=min_pages)
    return bool(books)`,
    fixed: `def has_long_books(min_pages):
    books = Book.objects.filter(pages__gt=min_pages)
    return books.exists()`,
    harness,
    adapter: 'run_counted',
    tests: [
      { args: [300], expected: [true, 1, 'SELECT 1 FROM book WHERE book.pages > 300 LIMIT 1'], name: 'some match' },
      { args: [500], expected: [false, 1, 'SELECT 1 FROM book WHERE book.pages > 500 LIMIT 1'], name: 'none match' },
      { args: [479], expected: [true, 1, 'SELECT 1 FROM book WHERE book.pages > 479 LIMIT 1'], name: 'boundary' },
    ],
    bugType: 'bool(queryset) loads everything',
    hint: 'Look at the SQL of the last query. Which queryset method asks the database only "is there at least one row"?',
    explanation: '`bool(books)` evaluates the whole queryset, fetching every matching row to answer yes or no. `exists()` sends `SELECT 1 ... LIMIT 1`, which stops at the first match.',
  },
  boss: {
    title: 'Paginated catalog',
    statement: 'Write `catalog_page(page, size)` (pages start at 1). Order books by title and return `{"count": total_books, "results": [titles on that page], "has_next": bool}`. Use exactly two queries: one COUNT and one page query whose SQL has LIMIT/OFFSET. Never load the whole table.',
    language: 'python',
    fnName: 'catalog_page',
    starter: `def catalog_page(page, size):
    # your code here
    pass
`,
    solution: `def catalog_page(page, size):
    qs = Book.objects.order_by("title")
    total = qs.count()
    start = (page - 1) * size
    titles = [b.title for b in qs[start:start + size]]
    return {"count": total, "results": titles, "has_next": start + size < total}`,
    harness,
    adapter: 'run_counted',
    tests: [
      { args: [1, 3], expected: [{ count: 8, results: ['Compass', 'Ember', 'Harbor'], has_next: true }, 2, 'SELECT book.* FROM book ORDER BY book.title ASC LIMIT 3'], name: 'first page' },
      { args: [2, 3], expected: [{ count: 8, results: ['Lantern', 'Meadow', 'Orbit'], has_next: true }, 2, 'SELECT book.* FROM book ORDER BY book.title ASC LIMIT 3 OFFSET 3'], name: 'second page' },
      { args: [3, 3], expected: [{ count: 8, results: ['Quartz', 'Tundra'], has_next: false }, 2, 'SELECT book.* FROM book ORDER BY book.title ASC LIMIT 3 OFFSET 6'], name: 'last page' },
      { args: [9, 3], expected: [{ count: 8, results: [], has_next: false }, 2, 'SELECT book.* FROM book ORDER BY book.title ASC LIMIT 3 OFFSET 24'], name: 'past the end' },
      { args: [1, 8], expected: [{ count: 8, results: ['Compass', 'Ember', 'Harbor', 'Lantern', 'Meadow', 'Orbit', 'Quartz', 'Tundra'], has_next: false }, 2, 'SELECT book.* FROM book ORDER BY book.title ASC LIMIT 8'], name: 'everything on one page' },
    ],
    hints: ['Keep one lazy queryset `qs`. `qs.count()` is query one; slicing `qs[start:start + size]` and iterating it is query two.', 'start = (page - 1) * size, and there is a next page when start + size < total.'],
    combines: ['be-lazy-querysets', 'be-orm-sql'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
