import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE } from '@/content/lib/backend-orm';

const code = `
class Author(models.Model):
    name = models.CharField(max_length=50)
class Tag(models.Model):
    name = models.CharField(max_length=30)

class Book(models.Model):
    title = models.CharField(max_length=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")   #@fk
    tags = models.ManyToManyField(Tag, related_name="books")                             #@m2m

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")  #@o2o

book = Book.objects.create(title="Orbit", author=ana)    #@insert
book.tags.add(tag)               # INSERT INTO book_tags (book_id, tag_id)   #@add
book.author                      # forward: follow author_id                 #@fwd
ana.books.all()                  # reverse: WHERE author_id = ana.id         #@rev
`;

type Kind = 'foreign key' | 'many-to-many' | 'one-to-one';
type Pair = [string, string];

interface In {
  kind: Kind;
  pairs: Pair[];
}

const NAMES: Record<Kind, { left: string; right: string; table: string; col: string }> = {
  'foreign key': { left: 'Book', right: 'Author', table: 'book', col: 'author_id' },
  'many-to-many': { left: 'Book', right: 'Tag', table: 'book_tags', col: 'tag_id' },
  'one-to-one': { left: 'Profile', right: 'User', table: 'profile', col: 'user_id' },
};

function counts(kind: Kind, pairs: Pair[]): { links: number; rejected: number } {
  if (kind === 'foreign key') return { links: pairs.length, rejected: 0 };
  const keys = new Set(kind === 'many-to-many' ? pairs.map((p) => p.join('\u0000')) : pairs.map((p) => p[1]));
  return { links: keys.size, rejected: pairs.length - keys.size };
}

const viz: VizDef<In> = {
  id: 'relations',
  title: 'Relations are ids pointing at ids',
  code,
  language: 'python',
  inputs: [
    { key: 'kind', label: 'Relation', kind: 'select', default: 'foreign key', options: ['foreign key', 'many-to-many', 'one-to-one'] },
    { key: 'pairs', label: 'Links [left, right] in order', kind: 'json', default: [['Orbit', 'Ana'], ['Harbor', 'Ben'], ['Lantern', 'Ana']], help: 'At most 6 pairs, e.g. [["Orbit","Ana"],["Harbor","Ben"]]. Left = Book/Profile, right = Author/Tag/User.' },
  ],
  presets: [
    { label: 'Many-to-many', input: { kind: 'many-to-many', pairs: [['Orbit', 'sci-fi'], ['Orbit', 'classic'], ['Harbor', 'classic'], ['Orbit', 'sci-fi']] } },
    { label: 'One-to-one', input: { kind: 'one-to-one', pairs: [['bio-1', 'ana'], ['bio-2', 'ben'], ['bio-3', 'ana']] } },
  ],
  run({ kind, pairs }) {
    if (!NAMES[kind]) throw new Error('Pick a relation kind');
    if (!Array.isArray(pairs) || !pairs.length || pairs.length > 6 || pairs.some((p) => !Array.isArray(p) || p.length !== 2)) throw new Error('Give 1 to 6 [left, right] pairs');
    const N = NAMES[kind];
    const m2m = kind === 'many-to-many';
    const r = new Recorder(code);
    const lefts: { id: number; name: string }[] = []; // M2M books
    const rights: { id: number; name: string }[] = []; // authors / tags / users
    const kids: { id: number; name: string; parent: number }[] = []; // FK / O2O child rows
    const links: { id: number; a: number; b: number }[] = [];
    let rejected = 0;
    const log: { text: string; tone?: Tone }[] = [];
    const hlNodes = new Map<string, Tone>();
    const hlEdges = new Map<string, Tone>();

    const panel = (): Panel => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const X = m2m ? [70, 290, 510] : [70, 420];
      const rowY = (i: number) => 34 + i * 60;
      const box = (id: string, label: string, sub: string, x: number, i: number, badge?: string): GraphNode => ({ id, label, sub, x, y: rowY(i), w: 124, h: 40, shape: 'rect', tone: hlNodes.get(id), badge });
      if (m2m) {
        lefts.forEach((b, i) => nodes.push(box(`l${b.id}`, b.name, `book id=${b.id}`, X[0], i)));
        links.forEach((k, i) => {
          nodes.push(box(`k${k.id}`, `link ${k.id}`, `book_id=${k.a}, tag_id=${k.b}`, X[1], i));
          edges.push({ from: `k${k.id}`, to: `l${k.a}`, directed: true, tone: hlEdges.get(`k${k.id}>l${k.a}`) });
          edges.push({ from: `k${k.id}`, to: `r${k.b}`, directed: true, tone: hlEdges.get(`k${k.id}>r${k.b}`) });
        });
        rights.forEach((t, i) => nodes.push(box(`r${t.id}`, t.name, `tag id=${t.id}`, X[2], i)));
      } else {
        rights.forEach((p, i) => nodes.push(box(`r${p.id}`, p.name, `${N.right.toLowerCase()} id=${p.id}`, X[0], i)));
        kids.forEach((k, i) => {
          nodes.push(box(`c${k.id}`, k.name, `${N.left.toLowerCase()} id=${k.id}`, X[1], i, `${N.col}=${k.parent}`));
          edges.push({ from: `c${k.id}`, to: `r${k.parent}`, directed: true, label: N.col, tone: hlEdges.get(`c${k.id}>r${k.parent}`) });
        });
      }
      const rows = Math.max(1, lefts.length, rights.length, kids.length, links.length);
      const title = m2m ? 'Book rows, through table book_tags, Tag rows' : `${N.right} rows <- ${N.left} rows (the child holds the id)`;
      return { type: 'graph', title, nodes, edges, width: X[X.length - 1] + 70, height: Math.max(80, rowY(rows - 1) + 30) };
    };
    const panels = (): Panel[] => [
      panel(),
      { type: 'log', title: 'SQL', lines: [...log] },
      { type: 'kv', entries: [{ k: 'pointers', v: m2m ? links.length : kids.length }, { k: 'rejected / ignored', v: rejected, tone: rejected ? 'error' : 'default' }] },
    ];
    const clear = () => {
      hlNodes.clear();
      hlEdges.clear();
    };
    const anchorKind = kind === 'foreign key' ? 'fk' : m2m ? 'm2m' : 'o2o';
    const vars = () => ({ kind, pointers: m2m ? links.length : kids.length, rejected });

    r.step(anchorKind, `${N.left} points at ${N.right} through ${m2m ? 'a hidden through table' : 'an id column'}`, panels(), vars());
    const ensure = (list: { id: number; name: string }[], name: string, prefix: string, table: string): { id: number; name: string } => {
      let e = list.find((x) => x.name === name);
      if (!e) {
        e = { id: list.length + 1, name };
        list.push(e);
        clear();
        hlNodes.set(`${prefix}${e.id}`, 'new');
        log.push({ text: `INSERT INTO ${table} (name) VALUES ('${name}')` });
        r.step('insert', `Insert ${table} row "${name}" (id ${e.id})`, panels(), vars());
      }
      return e;
    };
    for (const [a, b] of pairs) {
      if (m2m) {
        const book = ensure(lefts, a, 'l', 'book');
        const tag = ensure(rights, b, 'r', 'tag');
        clear();
        if (links.some((k) => k.a === book.id && k.b === tag.id)) {
          rejected++;
          hlNodes.set(`l${book.id}`, 'muted');
          hlNodes.set(`r${tag.id}`, 'muted');
          r.step('add', `${book.name}.tags.add(${tag.name}) again: already linked, nothing inserted`, panels(), vars());
          continue;
        }
        const k = { id: links.length + 1, a: book.id, b: tag.id };
        links.push(k);
        hlNodes.set(`k${k.id}`, 'new');
        log.push({ text: `INSERT INTO book_tags (book_id, tag_id) VALUES (${book.id}, ${tag.id})` });
        r.step('add', `add() inserts one link row (${book.id}, ${tag.id}); neither side changes`, panels(), vars());
      } else {
        const parent = ensure(rights, b, 'r', N.right.toLowerCase());
        clear();
        if (kind === 'one-to-one' && kids.some((k) => k.parent === parent.id)) {
          rejected++;
          hlNodes.set(`r${parent.id}`, 'error');
          log.push({ text: `INSERT INTO profile ... FAILED: UNIQUE constraint failed: profile.user_id`, tone: 'error' });
          r.step('o2o', `${parent.name} already has a profile: the unique id column rejects a second one`, panels(), vars());
          continue;
        }
        const kid = { id: kids.length + 1, name: a, parent: parent.id };
        kids.push(kid);
        hlNodes.set(`c${kid.id}`, 'new');
        hlEdges.set(`c${kid.id}>r${parent.id}`, 'active');
        log.push({ text: `INSERT INTO ${N.table} (..., ${N.col}) VALUES (..., ${parent.id})` });
        r.step('insert', `Insert ${N.left.toLowerCase()} "${a}" with ${N.col}=${parent.id}`, panels(), vars());
      }
    }
    // read it back both ways
    clear();
    if (m2m) {
      const book = lefts[0];
      const mine = links.filter((k) => k.a === book.id);
      hlNodes.set(`l${book.id}`, 'active');
      for (const k of mine) {
        hlNodes.set(`k${k.id}`, 'found');
        hlNodes.set(`r${k.b}`, 'found');
        hlEdges.set(`k${k.id}>l${k.a}`, 'found');
        hlEdges.set(`k${k.id}>r${k.b}`, 'found');
      }
      log.push({ text: `SELECT tag_id FROM book_tags WHERE book_id = ${book.id}` });
      r.step('fwd', `book.tags.all(): read the link rows for book ${book.id}, then the tags`, panels(), vars());
      clear();
      const tag = rights[0];
      hlNodes.set(`r${tag.id}`, 'active');
      for (const k of links.filter((x) => x.b === tag.id)) {
        hlNodes.set(`k${k.id}`, 'found');
        hlNodes.set(`l${k.a}`, 'found');
        hlEdges.set(`k${k.id}>l${k.a}`, 'found');
        hlEdges.set(`k${k.id}>r${k.b}`, 'found');
      }
      log.push({ text: `SELECT book_id FROM book_tags WHERE tag_id = ${tag.id}` });
      r.step('rev', `tag.books.all(): the same through table read from the other side`, panels(), vars());
    } else {
      const kid = kids[0];
      hlNodes.set(`c${kid.id}`, 'active');
      hlNodes.set(`r${kid.parent}`, 'found');
      hlEdges.set(`c${kid.id}>r${kid.parent}`, 'found');
      log.push({ text: `SELECT ${N.right.toLowerCase()}.* FROM ${N.right.toLowerCase()} WHERE id = ${kid.parent}` });
      r.step('fwd', `Forward: follow ${N.col}=${kid.parent} to the ${N.right.toLowerCase()} row (1 query)`, panels(), vars());
      clear();
      const parent = rights.find((p) => p.id === kids[0].parent)!;
      hlNodes.set(`r${parent.id}`, 'active');
      for (const k of kids.filter((x) => x.parent === parent.id)) {
        hlNodes.set(`c${k.id}`, 'found');
        hlEdges.set(`c${k.id}>r${parent.id}`, 'found');
      }
      log.push({ text: `SELECT ${N.table}.* FROM ${N.table} WHERE ${N.col} = ${parent.id}` });
      r.step('rev', kind === 'one-to-one' ? 'Reverse: at most one row can carry that user id' : `Reverse: every ${N.left.toLowerCase()} whose ${N.col} is ${parent.id}`, panels(), vars());
    }
    return { frames: r.frames, result: { links: m2m ? links.length : kids.length, rejected } };
  },
  reference({ kind, pairs }) {
    return counts(kind, pairs);
  },
};

const unit: Unit = {
  id: 'be-relations',
  hook: 'Foreign keys, many-to-many and one-to-one are the vocabulary of every data-model question. If you can draw the ids on the whiteboard, you can answer "which table holds the pointer?" instantly.',
  predict: {
    prompt: 'A Book has `tags = ManyToManyField(Tag)`. Which tables get a new row when you run `book.tags.add(tag)`?',
    options: ['The book table gets a tags column', 'The tag table gets a book column', 'Only the hidden through table gets a row (book_id, tag_id)', 'Both book and tag tables are updated'],
    answer: 2,
    explain: 'Neither side stores the other side. A many-to-many lives in its own through table with one row per link, so add() is a single INSERT there.',
  },
  viz,
  deeper: {
    points: [
      'ForeignKey: the "many" side stores the id (book.author_id). Forward access follows that id; reverse access (author.books) is a query filtered on it.',
      'ManyToManyField: a through table with two foreign keys. Adding the same link twice is a no-op, and the link table can carry extra columns if you define it yourself.',
      'OneToOneField: a foreign key with a unique constraint. The reverse accessor returns one object and raises DoesNotExist when there is none.',
      'on_delete decides what happens to children when the parent row goes: CASCADE deletes them, SET_NULL clears the id, PROTECT refuses.',
    ],
    pitfalls: ['Forgetting related_name and then writing author.books when the default is author.book_set', 'Assuming reverse one-to-one returns None instead of raising DoesNotExist', 'Using CASCADE on a relation where losing the children would be a data-loss bug'],
  },
  practice: {
    language: 'python',
    fnName: 'Book',
    statement: 'Define `Book` with a `title`, a foreign key `author` to `Author` (cascade delete, reverse name `books`) and a many-to-many `tags` to `Tag` (reverse name `books`). `Author` and `Tag` already exist.',
    signature: 'class Book(models.Model):',
    solution: `class Book(models.Model):
    title = models.CharField(max_length=100)
    author = models.ForeignKey(@@Author@@, on_delete=@@models.CASCADE@@, related_name=@@"books"@@)
    tags = models.ManyToManyField(@@Tag@@, related_name="books")`,
    harness: `
from minidjango import models, connection, reset

class Author(models.Model):
    name = models.CharField(max_length=50)

class Tag(models.Model):
    name = models.CharField(max_length=30)

def inspect_book(Book, what):
    reset()
    ana = Author.objects.create(name="Ana")
    ben = Author.objects.create(name="Ben")
    b1 = Book.objects.create(title="Orbit", author=ana)
    b2 = Book.objects.create(title="Lantern", author=ana)
    b3 = Book.objects.create(title="Harbor", author=ben)
    t1 = Tag.objects.create(name="sci-fi")
    t2 = Tag.objects.create(name="classic")
    b1.tags.add(t1, t2)
    b2.tags.add(t2)
    if what == "reverse_fk":
        return [b.title for b in ana.books.all()]
    if what == "forward_fk":
        return b3.author.name
    if what == "forward_m2m":
        return [t.name for t in b1.tags.all()]
    if what == "reverse_m2m":
        return [b.title for b in t2.books.all()]
    if what == "through_rows":
        return len(connection.tables["book_tags"].rows)
    if what == "cascade":
        ana.delete()
        return Book.objects.count()
`,
    adapter: 'inspect_book',
    tests: [
      { args: ['reverse_fk'], expected: ['Orbit', 'Lantern'], name: 'author.books' },
      { args: ['forward_fk'], expected: 'Ben', name: 'book.author' },
      { args: ['forward_m2m'], expected: ['sci-fi', 'classic'], name: 'book.tags' },
      { args: ['reverse_m2m'], expected: ['Orbit', 'Lantern'], name: 'tag.books' },
      { args: ['through_rows'], expected: 3, name: 'three link rows' },
      { args: ['cascade'], expected: 1, name: 'deleting an author deletes its books' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'author_books',
    statement: '`GET /authors/1/books/` crashes with a 500, but the author exists and has books. Fix the model.',
    buggy: `class Book(models.Model):
    title = models.CharField(max_length=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE)

def author_books(request, pk):
    author = get_object_or_404(Author, pk=pk)
    return JsonResponse({"author": author.name, "books": [b.title for b in author.books.all()]})`,
    fixed: `class Book(models.Model):
    title = models.CharField(max_length=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

def author_books(request, pk):
    author = get_object_or_404(Author, pk=pk)
    return JsonResponse({"author": author.name, "books": [b.title for b in author.books.all()]})`,
    harness: `
from minidjango import models, connection, reset
from minidjango.http import App, path, JsonResponse, get_object_or_404
from minidjango.test import Client

class Author(models.Model):
    name = models.CharField(max_length=50)

def run_author_books(view, pk):
    reset()
    ana = Author.objects.create(name="Ana")
    ben = Author.objects.create(name="Ben")
    Author.objects.create(name="Cleo")
    Book = globals()["Book"]
    Book.objects.create(title="Orbit", author=ana)
    Book.objects.create(title="Lantern", author=ana)
    Book.objects.create(title="Harbor", author=ben)
    r = Client(App([path("authors/<int:pk>/books/", view)])).get("/authors/%d/books/" % pk)
    return [r.status_code, r.json()]
`,
    adapter: 'run_author_books',
    tests: [
      { args: [1], expected: [200, { author: 'Ana', books: ['Orbit', 'Lantern'] }], name: 'author with two books' },
      { args: [2], expected: [200, { author: 'Ben', books: ['Harbor'] }], name: 'author with one book' },
      { args: [3], expected: [200, { author: 'Cleo', books: [] }], name: 'author without books' },
      { args: [9], expected: [404, { detail: 'No Author matches the given query.' }], name: 'missing author' },
    ],
    bugType: 'missing related_name',
    hint: 'Without `related_name`, what is the reverse accessor called? Read the 500 error text.',
    explanation: 'The reverse accessor defaults to `book_set`, so `author.books` raised AttributeError. Either set `related_name="books"` on the ForeignKey or use `author.book_set`; naming it makes intent clear.',
  },
  boss: {
    title: 'Profile endpoint',
    statement: 'Write the view `profile(request, pk)` for an Account that has an optional one-to-one `Profile` (reverse accessor `account.profile`; models, `path`, `JsonResponse`, `get_object_or_404` and `require_http_methods` exist). GET returns 200 `{"username", "bio"}` with `bio` null when there is no profile. POST creates the profile from `request.data["bio"]`: 201 with the same shape, or 409 `{"detail": "profile exists"}` if one already exists. Unknown account: 404. Other methods: 405.',
    language: 'python',
    fnName: 'profile',
    starter: `def profile(request, pk):
    # your code here
    pass
`,
    solution: `@require_http_methods(["GET", "POST"])
def profile(request, pk):
    account = get_object_or_404(Account, pk=pk)
    if request.method == "POST":
        if Profile.objects.filter(account=account).exists():
            return JsonResponse({"detail": "profile exists"}, status=409)
        created = Profile.objects.create(account=account, bio=request.data.get("bio", ""))
        return JsonResponse({"username": account.username, "bio": created.bio}, status=201)
    try:
        bio = account.profile.bio
    except Profile.DoesNotExist:
        bio = None
    return JsonResponse({"username": account.username, "bio": bio})`,
    harness: `
from minidjango import models, connection, reset
from minidjango.http import App, path, JsonResponse, get_object_or_404, require_http_methods
from minidjango.test import Client

class Account(models.Model):
    username = models.CharField(max_length=30)

class Profile(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE, related_name="profile")
    bio = models.CharField(max_length=100)

def drive_profile(view, calls):
    reset()
    ana = Account.objects.create(username="ana")
    Account.objects.create(username="ben")
    Profile.objects.create(account=ana, bio="hi")
    c = Client(App([path("accounts/<int:pk>/profile/", view)]))
    out = []
    for method, pk, data in calls:
        r = c.request(method, "/accounts/%d/profile/" % pk, data)
        out.append([r.status_code, r.json()])
    return out
`,
    adapter: 'drive_profile',
    tests: [
      { args: [[['GET', 1, null]]], expected: [[200, { username: 'ana', bio: 'hi' }]], name: 'account with profile' },
      { args: [[['GET', 2, null]]], expected: [[200, { username: 'ben', bio: null }]], name: 'account without profile' },
      { args: [[['GET', 9, null]]], expected: [[404, { detail: 'No Account matches the given query.' }]], name: 'unknown account' },
      { args: [[['POST', 2, { bio: 'new' }], ['GET', 2, null]]], expected: [[201, { username: 'ben', bio: 'new' }], [200, { username: 'ben', bio: 'new' }]], name: 'create then read' },
      { args: [[['POST', 1, { bio: 'x' }]]], expected: [[409, { detail: 'profile exists' }]], name: 'second profile is a conflict' },
      { args: [[['DELETE', 1, null]]], expected: [[405, { detail: 'Method not allowed' }]], name: 'other methods are 405' },
    ],
    hints: ['Reading `account.profile` raises `Profile.DoesNotExist` when there is no row: catch it and use None.', 'Before creating, check `Profile.objects.filter(account=account).exists()` and return 409; decorate the view with `@require_http_methods(["GET", "POST"])`.'],
    combines: ['be-relations', 'be-routing', 'be-request-lifecycle'],
  },
  simulationNote: SIM_NOTE,
};

export default unit;
