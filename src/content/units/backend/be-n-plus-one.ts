import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { AUTHORS, BOOKS, LIBRARY_HARNESS } from '@/content/lib/backend-orm';
import { SIM_MINIDJANGO, clip } from '@/content/lib/finish-m2m3';

const code = `
books = Book.objects.all()                       #@list
for book in books:                               #@loop
    print(book.title, book.author.name)          #@access
# fix 1: Book.objects.select_related("author")   #@join
# fix 2: Book.objects.prefetch_related("author") #@prefetch
`;

const MODES = ['naive: book.author in the loop', 'select_related("author")', 'prefetch_related("author")'] as const;
type Mode = (typeof MODES)[number];

interface In {
  mode: Mode;
  books: number;
}

const authorName = (id: number): string => AUTHORS.find((a) => a.id === id)!.name;

const viz: VizDef<In> = {
  id: 'be-n-plus-one',
  title: 'N+1 queries and how to remove them',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'How the books are loaded', kind: 'select', options: [...MODES], default: MODES[0] },
    { key: 'books', label: 'Number of books (1-8)', kind: 'number', default: 6 },
  ],
  presets: [
    { label: 'N+1 with 6 books', input: { mode: MODES[0], books: 6 } },
    { label: 'select_related', input: { mode: MODES[1], books: 6 } },
    { label: 'prefetch_related', input: { mode: MODES[2], books: 6 } },
    { label: 'One book', input: { mode: MODES[0], books: 1 } },
  ],
  run({ mode, books }) {
    if (!MODES.includes(mode)) throw new Error('Pick one of: ' + MODES.join(', '));
    const n = Math.round(books);
    if (!(n >= 1 && n <= 8)) throw new Error('Use between 1 and 8 books');
    const rows = BOOKS.slice(0, n);
    const r = new Recorder(code);
    const sql: { text: string; tone?: Tone }[] = [];
    let queries = 0;
    let done = 0;
    let current = -1;
    const series: [number, number][] = [];
    const run = (text: string): number => {
      queries++;
      sql.push({ text: `#${queries} ${text}`, tone: 'active' });
      return queries;
    };
    const panels = (): Panel[] => [
      { type: 'array', title: 'Books being printed', values: rows.map((b) => b.title), tones: Object.fromEntries(rows.map((_, i) => [i, i === current ? 'active' : i < done ? 'done' : 'default'])) as Record<number, Tone>, hideIndex: true },
      { type: 'log', title: 'SQL actually sent to the database', lines: sql.map((l) => ({ ...l })) },
      {
        type: 'chart',
        title: 'Queries so far vs books printed',
        kind: 'line',
        xLabel: 'books printed',
        yLabel: 'queries',
        series: [
          { label: 'N+1 baseline', points: [[0, 1], [n, n + 1]], tone: 'muted' },
          { label: mode.startsWith('naive') ? 'this run' : mode, points: series.map((p) => [...p] as [number, number]), tone: mode.startsWith('naive') ? 'error' : 'found' },
        ],
      },
      { type: 'kv', title: 'Query counter', entries: [{ k: 'queries', v: queries, tone: queries > 2 ? 'error' : 'found' }, { k: 'books printed', v: done }] },
    ];

    const ids = [...new Set(rows.map((b) => b.author_id))];
    if (mode === MODES[1]) {
      const k = run('SELECT book.*, author.* FROM book INNER JOIN author ON author.id = book.author_id');
      series.push([0, queries]);
      r.step('join', clip(`select_related joins the author table: one query (#${k}) fetches books and authors`), panels(), { queries });
    } else {
      const k = run('SELECT book.* FROM book');
      series.push([0, queries]);
      r.step('list', clip(`The loop needs the rows, so query #${k} loads all ${n} books (no authors yet)`), panels(), { queries });
      if (mode === MODES[2]) {
        const k2 = run(`SELECT author.* FROM author WHERE author.id IN (${ids.join(', ')})`);
        series[0] = [0, queries];
        r.step('prefetch', clip(`prefetch_related adds ONE query (#${k2}) for the ${ids.length} distinct author id${ids.length > 1 ? 's' : ''}`), panels(), { queries });
      }
    }
    rows.forEach((b, i) => {
      current = i;
      r.step('loop', `Iteration ${i + 1}: book "${b.title}" (author_id ${b.author_id})`, panels(), { queries, i: i + 1 });
      r.op();
      if (mode === MODES[0]) {
        const k = run(`SELECT author.* FROM author WHERE author.id = ${b.author_id}`);
        done = i + 1;
        series.push([done, queries]);
        r.step('access', clip(`book.author is not loaded, so Django asks the database: query #${k} for ${authorName(b.author_id)}`), panels(), { queries, i: i + 1 });
      } else {
        done = i + 1;
        series.push([done, queries]);
        r.step('access', clip(`book.author is already in memory (${authorName(b.author_id)}): no query`), panels(), { queries, i: i + 1 });
      }
    });
    current = -1;
    r.step(mode === MODES[0] ? 'access' : mode === MODES[1] ? 'join' : 'prefetch', clip(`Done: ${queries} quer${queries === 1 ? 'y' : 'ies'} for ${n} book${n > 1 ? 's' : ''}${mode === MODES[0] ? ' (1 + N)' : ''}`), panels(), { queries });
    return { frames: r.frames, result: queries };
  },
  reference({ mode, books }) {
    const n = Math.round(books);
    return mode === MODES[0] ? 1 + n : mode === MODES[1] ? 1 : 2;
  },
};

const HARNESS = `${LIBRARY_HARNESS}
def run_queries(fn, *args):
    seed_library()
    result = fn(*args)
    return [result, connection.query_count]

def run_with_books(fn, n_books):
    seed_library(n_books)
    result = fn()
    return [result, connection.query_count]
`;

const unit: Unit = {
  id: 'be-n-plus-one',
  hook: 'N+1 is the most common reason a Django endpoint is slow, and interviewers love it because the code looks innocent. Spotting it and naming the fix (select_related or prefetch_related) is a standard backend screen.',
  simulationNote: SIM_MINIDJANGO,
  predict: {
    prompt: 'The table has 50 books by 5 authors. How many queries does this code run?',
    code: 'for book in Book.objects.all():\n    print(book.title, book.author.name)',
    codeLang: 'python',
    options: ['2: one for books, one for the 5 authors', '6: one for books, one per distinct author', '51: one for books, then one per book', '1: Django joins automatically'],
    answer: 2,
    explain: 'Each book object loads its author lazily on first access, and objects do not share a cache. Even though only 5 authors exist, every one of the 50 books asks the database again: 1 + 50 queries.',
  },
  viz,
  deeper: {
    points: [
      'The "+1" is the query for the list; the "N" is one extra query per row to fetch a related object. Cost grows with the number of rows.',
      '`select_related("author")` uses a SQL JOIN, so books and authors come back in a single query. It works for ForeignKey and OneToOne (single related objects).',
      '`prefetch_related("books")` runs a second query for all related rows (`WHERE id IN (...)`) and joins them in Python. Use it for reverse foreign keys and many-to-many.',
      'Count the queries in a test (`connection.query_count`, or `assertNumQueries` in Django) so a regression is caught automatically.',
      'Fetching less also helps: `values_list` or `only` avoid loading columns you never read.',
    ],
    complexity: { time: 'N+1 queries naive, 1 with a join, 2 with a prefetch', space: 'rows held in memory while joining' },
    pitfalls: ['Calling `.all()` or `.filter()` on a prefetched relation inside the loop, which throws the cache away', 'Using select_related on a many-to-many or reverse relation (it only follows single-valued links)', 'Fixing the query count but returning huge joined rows nobody needs'],
  },
  practice: {
    language: 'python',
    fnName: 'titles_with_authors',
    statement: 'Return `[title, author_name]` pairs for every book with at least `min_pages` pages, ordered by title, using exactly one database query. `Book` and `Author` exist.',
    signature: 'def titles_with_authors(min_pages):',
    solution: `def titles_with_authors(min_pages):
    books = Book.objects.filter(pages__gte=min_pages).@@select_related("author")@@.order_by("title")
    return [[b.title, @@b.author.name@@] for b in books]`,
    harness: HARNESS,
    adapter: 'run_queries',
    tests: [
      { args: [0], expected: [[['Compass', 'Ana'], ['Ember', 'Cleo'], ['Harbor', 'Ben'], ['Lantern', 'Ana'], ['Meadow', 'Ben'], ['Orbit', 'Ana'], ['Quartz', 'Cleo'], ['Tundra', 'Ben']], 1], name: 'all books, still one query' },
      { args: [300], expected: [[['Compass', 'Ana'], ['Lantern', 'Ana'], ['Orbit', 'Ana'], ['Tundra', 'Ben']], 1], name: 'filtered' },
      { args: [400], expected: [[['Compass', 'Ana'], ['Lantern', 'Ana']], 1], name: 'two long books' },
      { args: [1000], expected: [[], 1], name: 'no match' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'author_book_counts',
    statement: '`author_book_counts(country)` returns `{author name: number of books}` for the authors of one country (or everyone when `country` is None). The answer is right but it runs one extra query per author. It should take exactly two.',
    buggy: `def author_book_counts(country):
    authors = Author.objects.all()
    if country is not None:
        authors = authors.filter(country=country)
    return {a.name: a.books.count() for a in authors}`,
    fixed: `def author_book_counts(country):
    authors = Author.objects.prefetch_related("books")
    if country is not None:
        authors = authors.filter(country=country)
    return {a.name: len(a.books.all()) for a in authors}`,
    harness: HARNESS,
    adapter: 'run_queries',
    tests: [
      { args: [null], expected: [{ Ana: 3, Ben: 3, Cleo: 2 }, 2], name: 'everyone' },
      { args: ['PT'], expected: [{ Ana: 3 }, 2], name: 'one country' },
      { args: ['KE'], expected: [{ Cleo: 2 }, 2], name: 'another country' },
    ],
    bugType: 'N+1 on a reverse relation',
    hint: 'Count the queries in the expected output. Which line asks the database once per author?',
    explanation: '`a.books.count()` sends a COUNT query for every author. prefetch_related("books") loads all the books in one extra query, and `len(a.books.all())` then reads that cache instead of querying again.',
  },
  boss: {
    title: 'Country report in two queries',
    statement: 'Write `country_report()`: one dict per country, sorted by country code, shaped `{"country": "PT", "authors": [names sorted A-Z], "pages": total pages of all books by those authors}`. Authors without books count 0 pages. It must use exactly two queries no matter how many books exist. `Author` and `Book` exist.',
    language: 'python',
    fnName: 'country_report',
    starter: `def country_report():
    # your code here
    pass
`,
    solution: `def country_report():
    rows = {}
    for author in Author.objects.prefetch_related("books"):
        row = rows.setdefault(author.country, {"country": author.country, "authors": [], "pages": 0})
        row["authors"].append(author.name)
        row["pages"] += sum(b.pages for b in author.books.all())
    for row in rows.values():
        row["authors"].sort()
    return sorted(rows.values(), key=lambda r: r["country"])`,
    harness: HARNESS,
    adapter: 'run_with_books',
    tests: [
      { args: [8], expected: [[{ country: 'KE', authors: ['Cleo'], pages: 210 }, { country: 'PT', authors: ['Ana'], pages: 1210 }, { country: 'US', authors: ['Ben'], pages: 760 }], 2], name: 'full catalogue' },
      { args: [3], expected: [[{ country: 'KE', authors: ['Cleo'], pages: 0 }, { country: 'PT', authors: ['Ana'], pages: 800 }, { country: 'US', authors: ['Ben'], pages: 150 }], 2], name: 'an author with no books' },
      { args: [1], expected: [[{ country: 'KE', authors: ['Cleo'], pages: 0 }, { country: 'PT', authors: ['Ana'], pages: 320 }, { country: 'US', authors: ['Ben'], pages: 0 }], 2], name: 'one book' },
      { args: [0], expected: [[{ country: 'KE', authors: ['Cleo'], pages: 0 }, { country: 'PT', authors: ['Ana'], pages: 0 }, { country: 'US', authors: ['Ben'], pages: 0 }], 2], name: 'no books at all' },
    ],
    hints: ['Loop over `Author.objects.prefetch_related("books")` once. Group by `author.country` in a dict as you go.', 'Inside the loop use `author.books.all()` (served from the prefetch cache) and sum the pages in Python; sort authors and rows at the end.'],
    combines: ['be-relations', 'be-lazy-querysets'],
  },
  quiz: [
    {
      prompt: 'Which call fixes N+1 when listing each author with all of their books?',
      options: ['select_related("books")', 'prefetch_related("books")', 'values_list("books")', 'Author.objects.count()'],
      answer: 1,
      explain: 'books is a reverse foreign key (many rows per author), so use prefetch_related. select_related only follows single-valued relations by joining.',
    },
  ],
};

export default unit;
