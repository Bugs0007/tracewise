import { req, type CapstoneProject } from '../types';

const IMPORTS = `from minidjango import models, serializers, auth
from minidjango.http import App, path, JsonResponse, get_object_or_404
from minidjango.exceptions import NotAuthenticated
`;

const TAGS = `
def pack_tags(tags):
    clean = []
    for tag in tags:
        tag = tag.strip().lower()
        if tag and tag not in clean:
            clean.append(tag)
    return "," + ",".join(clean) + "," if clean else ""


def unpack_tags(text):
    return [tag for tag in text.split(",") if tag]
`;

const SERIALIZER = `
class NoteSerializer(serializers.ModelSerializer):
    tags = serializers.ListField(child=serializers.CharField(max_length=20), required=False)

    class Meta:
        model = Note
        fields = ["id", "title", "body", "tags"]

    def validate_tags(self, value):
        return pack_tags(value)

    def to_representation(self, note):
        data = super().to_representation(note)
        data["tags"] = unpack_tags(note.tags)
        return data
`;

const MODEL = `${TAGS}

class Note(models.Model):
    title = models.CharField(max_length=100)
    body = models.TextField(blank=True, default="")
    tags = models.CharField(max_length=200, blank=True, default="")

${SERIALIZER}`;

const LIST_V1 = `

def note_list(request):
    if request.method == "POST":
        ser = NoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return JsonResponse(NoteSerializer(ser.save()).data, status=201)
    notes = Note.objects.order_by("-id")
    return JsonResponse({"results": NoteSerializer(notes, many=True).data})
`;

const DETAIL = `

def note_detail(request, pk):
    note = get_object_or_404(Note, pk=pk)
    if request.method == "PATCH":
        ser = NoteSerializer(note, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return JsonResponse(NoteSerializer(ser.save()).data)
    if request.method == "DELETE":
        note.delete()
        return JsonResponse({}, status=204)
    return JsonResponse(NoteSerializer(note).data)
`;

const LIST_V4 = `

PAGE_SIZE = 5


def note_list(request):
    if request.method == "POST":
        ser = NoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return JsonResponse(NoteSerializer(ser.save()).data, status=201)
    notes = Note.objects.order_by("-id")
    q = request.GET.get("q", "").strip()
    if q:
        notes = notes.filter(models.Q(title__icontains=q) | models.Q(body__icontains=q))
    tag = request.GET.get("tag", "").strip().lower()
    if tag:
        notes = notes.filter(tags__contains="," + tag + ",")
    count = notes.count()
    pages = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 0
    if page < 1 or page > pages:
        return JsonResponse({"detail": "Invalid page."}, status=404)
    start = (page - 1) * PAGE_SIZE
    results = NoteSerializer(notes[start:start + PAGE_SIZE], many=True).data
    return JsonResponse({"count": count, "next": page + 1 if page < pages else None, "results": results})
`;

const B1 = `${IMPORTS}${MODEL}${LIST_V1}

app = App([path("api/notes/", note_list)])
`;

const B2 = `${IMPORTS}${MODEL}${LIST_V1}${DETAIL}

app = App([path("api/notes/", note_list), path("api/notes/<int:pk>/", note_detail)])
`;

const B4 = `${IMPORTS}${MODEL}${LIST_V4}${DETAIL}

app = App([path("api/notes/", note_list), path("api/notes/<int:pk>/", note_detail)])
`;

const B6 = `${IMPORTS}${TAGS}
SECRET = "notes-secret"
auth.create_user("demo", "demo123")
auth.create_user("guest", "guest123")


class Note(models.Model):
    title = models.CharField(max_length=100)
    body = models.TextField(blank=True, default="")
    tags = models.CharField(max_length=200, blank=True, default="")
    owner = models.ForeignKey(auth.User, on_delete=models.CASCADE)

${SERIALIZER}

def require_user(request):
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise NotAuthenticated()
    try:
        payload = auth.jwt_decode(header[7:], SECRET)
    except auth.InvalidToken:
        raise NotAuthenticated("Invalid token")
    return auth.User.objects.get(pk=payload["sub"])


def login(request):
    user = auth.authenticate(request.data.get("username", ""), request.data.get("password", ""))
    if user is None:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)
    return JsonResponse({"token": auth.jwt_encode({"sub": user.pk}, SECRET)})


PAGE_SIZE = 5


def note_list(request):
    user = require_user(request)
    if request.method == "POST":
        ser = NoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return JsonResponse(NoteSerializer(ser.save(owner=user)).data, status=201)
    notes = Note.objects.filter(owner=user).order_by("-id")
    q = request.GET.get("q", "").strip()
    if q:
        notes = notes.filter(models.Q(title__icontains=q) | models.Q(body__icontains=q))
    tag = request.GET.get("tag", "").strip().lower()
    if tag:
        notes = notes.filter(tags__contains="," + tag + ",")
    count = notes.count()
    pages = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 0
    if page < 1 or page > pages:
        return JsonResponse({"detail": "Invalid page."}, status=404)
    start = (page - 1) * PAGE_SIZE
    results = NoteSerializer(notes[start:start + PAGE_SIZE], many=True).data
    return JsonResponse({"count": count, "next": page + 1 if page < pages else None, "results": results})


def note_detail(request, pk):
    user = require_user(request)
    note = get_object_or_404(Note, pk=pk, owner=user)
    if request.method == "PATCH":
        ser = NoteSerializer(note, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return JsonResponse(NoteSerializer(ser.save()).data)
    if request.method == "DELETE":
        note.delete()
        return JsonResponse({}, status=204)
    return JsonResponse(NoteSerializer(note).data)


app = App([
    path("api/login/", login),
    path("api/notes/", note_list),
    path("api/notes/<int:pk>/", note_detail),
])
`;

const FORM_STATE = `  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
`;

const startEdit = `  function startEdit(note) {
    setEditingId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags.join(", "));
    setError("");
  }
`;

const saveFn = (headers: string, reload: string) => `  async function save() {
    const payload = { title: title, body: body, tags: tags.split(",").map((t) => t.trim()).filter((t) => t) };
    const url = editingId ? "/api/notes/" + editingId + "/" : "/api/notes/";
    const res = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: ${headers}, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.title ? data.title[0] : "Could not save");
      return;
    }
    setTitle("");
    setBody("");
    setTags("");
    setEditingId(null);
    setError("");
    ${reload};
  }
`;

const FORM_VIEW = `      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
      <input placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
      <button onClick={save}>{editingId ? "Save" : "Add note"}</button>
      {error && <p>{error}</p>}
`;

const LIST_VIEW = `      {notes.length === 0 ? (
        <p>No notes yet</p>
      ) : (
        <ul>
          {notes.map((n) => (
            <li key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
              {n.tags.map((t) => (
                <span key={t}>#{t} </span>
              ))}
              <button onClick={() => startEdit(n)}>Edit</button>
            </li>
          ))}
        </ul>
      )}
`;

const F3 = `function App() {
  const [notes, setNotes] = useState(null);
${FORM_STATE}
  function load() {
    return fetch("/api/notes/")
      .then((res) => res.json())
      .then((data) => setNotes(data.results));
  }

  useEffect(() => {
    load();
  }, []);

${startEdit}
${saveFn('{ "Content-Type": "application/json" }', 'load()')}
  if (notes === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Notes</h1>
${FORM_VIEW}${LIST_VIEW}    </div>
  );
}
`;

const SEARCH_VIEW = `      <input placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button onClick={runSearch}>Search</button>
      <p>
        Showing {notes.length} of {count} notes
      </p>
`;

const PAGER_VIEW = `      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button>
      <span> Page {page} </span>
      <button disabled={!next} onClick={() => setPage(page + 1)}>Next page</button>
`;

const F5 = `function App() {
  const [notes, setNotes] = useState(null);
  const [count, setCount] = useState(0);
  const [next, setNext] = useState(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
${FORM_STATE}
  function load(q, p) {
    return fetch("/api/notes/?q=" + encodeURIComponent(q) + "&page=" + p)
      .then((res) => res.json())
      .then((data) => {
        setNotes(data.results);
        setCount(data.count);
        setNext(data.next);
      });
  }

  useEffect(() => {
    load(search, page);
  }, [search, page]);

  function runSearch() {
    setPage(1);
    setSearch(query.trim());
  }

${startEdit}
${saveFn('{ "Content-Type": "application/json" }', 'load(search, page)')}
  if (notes === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Notes</h1>
${SEARCH_VIEW}${FORM_VIEW}${LIST_VIEW}${PAGER_VIEW}    </div>
  );
}
`;

const F7 = `function App() {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notes, setNotes] = useState(null);
  const [count, setCount] = useState(0);
  const [next, setNext] = useState(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
${FORM_STATE}  const headers = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token });

  function load(q, p) {
    return fetch("/api/notes/?q=" + encodeURIComponent(q) + "&page=" + p, { headers: headers() })
      .then((res) => res.json())
      .then((data) => {
        setNotes(data.results);
        setCount(data.count);
        setNext(data.next);
      });
  }

  useEffect(() => {
    if (token) load(search, page);
  }, [token, search, page]);

  async function logIn() {
    const res = await fetch("/api/login/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username, password: password }) });
    if (!res.ok) {
      setLoginError("Invalid credentials");
      return;
    }
    const data = await res.json();
    setLoginError("");
    setToken(data.token);
  }

  function runSearch() {
    setPage(1);
    setSearch(query.trim());
  }

${startEdit}
${saveFn('headers()', 'load(search, page)')}
  if (!token)
    return (
      <div>
        <h1>Log in</h1>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={logIn}>Log in</button>
        {loginError && <p>{loginError}</p>}
      </div>
    );
  if (notes === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Notes</h1>
${SEARCH_VIEW}${FORM_VIEW}${LIST_VIEW}${PAGER_VIEW}    </div>
  );
}
`;

// ── test data ──
const st = (r: ReturnType<typeof req>) => ({ ...r, only: 'status' });
const authed = (r: ReturnType<typeof req>) => ({ ...r, auth: true });
const login = (u: string, p: string) => req('POST', '/api/login/', { username: u, password: p });
const note = (id: number, title: string, body = '', tags: string[] = []) => ({ id, title, body, tags });

const MILK = { title: 'Milk run', body: 'buy oat drink', tags: ['home', 'shopping'] };
const SPRINT = { title: 'Sprint plan', body: 'Ship the MILK feature', tags: ['work'] };
const IDEAS = { title: 'Ideas', body: 'nothing here', tags: ['Work', 'ideas'] };
const seedThree = (): ReturnType<typeof req>[] => [req('POST', '/api/notes/', MILK), req('POST', '/api/notes/', SPRINT), req('POST', '/api/notes/', IDEAS)];
const milk = note(1, 'Milk run', 'buy oat drink', ['home', 'shopping']);
const sprint = note(2, 'Sprint plan', 'Ship the MILK feature', ['work']);
const ideas = note(3, 'Ideas', 'nothing here', ['work', 'ideas']);

// twelve notes "Note 1" .. "Note 12" for the pagination checks
const TWELVE = Array.from({ length: 12 }, (_, i) => i + 1);
const twelvePosts = TWELVE.map((i) => st(req('POST', '/api/notes/', { title: 'Note ' + i })));
const pageOf = (ids: number[]) => ids.map((i) => note(i, 'Note ' + i));

const seedF5 = ['Alpha milk', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta milk', 'Eta'].map((title) => req('POST', '/api/notes/', JSON.stringify({ title })));

const project: CapstoneProject = {
  id: 'notes-search',
  title: 'Notes with search',
  blurb: 'A notes app with tags, search, pagination, per-user data and a React front end.',
  backendStarter: `${IMPORTS}

# Build your backend here. Milestone 1: a Note model, a serializer
# (tags are a list in JSON), a list/create view and \`app = App([...])\`.
`,
  frontendStarter: `function App() {
  // Milestone 3 starts here: list the notes, add a form to create and edit them.
  return <h1>Notes</h1>;
}
`,
  milestones: [
    {
      id: 'b1',
      title: 'Notes with tags: list and create',
      part: 'backend',
      brief:
        'Create a `Note` model (`title`: CharField max 100, `body`: TextField `blank=True, default=""`, `tags`: CharField max 200 `blank=True, default=""`) and a `NoteSerializer` with fields `id`, `title`, `body`, `tags`. Over the API `tags` is a **list of strings** (declare `tags = serializers.ListField(child=serializers.CharField(max_length=20), required=False)`); in the database store it as one string with a comma on both ends, lower-cased and de-duplicated: `["Home", "home", "Shop"]` becomes `",home,shop,"` and an empty list becomes `""`. Add a view at `api/notes/`: **POST** creates a note and returns `{"id", "title", "body", "tags"}` with status **201**; **GET** returns `{"results": [...]}` with the **newest note first**. A missing, blank or over-long title is a **400** with a message for `title`.',
      tests: [
        { name: 'empty list', args: [[req('GET', '/api/notes/')]], expected: [[200, { results: [] }]] },
        {
          name: 'create then list, newest first',
          args: [[req('POST', '/api/notes/', { title: 'First' }), req('POST', '/api/notes/', { title: 'Second', body: 'Hello', tags: ['Home', 'home', ' Shop '] }), req('GET', '/api/notes/')]],
          expected: [
            [201, note(1, 'First')],
            [201, note(2, 'Second', 'Hello', ['home', 'shop'])],
            [200, { results: [note(2, 'Second', 'Hello', ['home', 'shop']), note(1, 'First')] }],
          ],
        },
        {
          name: 'title validation',
          args: [[req('POST', '/api/notes/', {}), req('POST', '/api/notes/', { title: '   ' }), req('POST', '/api/notes/', { title: 'x'.repeat(101) }), req('GET', '/api/notes/')]],
          expected: [[400, { title: ['This field is required.'] }], [400, { title: ['This field may not be blank.'] }], [400, { title: ['Ensure this field has no more than 100 characters.'] }], [200, { results: [] }]],
        },
        { name: 'tags must be a list of short strings', args: [[req('POST', '/api/notes/', { title: 'A', tags: 'home' }), req('POST', '/api/notes/', { title: 'A', tags: ['x'.repeat(21)] })]], expected: [[400, { tags: ['Expected a list of items.'] }], [400, { tags: ['Ensure this field has no more than 20 characters.'] }]] },
      ],
      hints: [
        'ModelSerializer only knows about the plain string column, so declare `tags` as a `ListField` on the serializer, turn the list into the packed string in `validate_tags`, and override `to_representation` to turn the string back into a list: `[t for t in note.tags.split(",") if t]`.',
        'Packing: strip and lower-case each tag, skip empties and repeats, then `"," + ",".join(clean) + ","` (or `""` when nothing is left). The surrounding commas are what lets `tags__contains=",work,"` match whole tags later.',
      ],
      reveal: B1,
    },
    {
      id: 'b2',
      title: 'Detail, update and delete',
      part: 'backend',
      brief:
        'Add `api/notes/<int:pk>/`: **GET** returns one note (**404** if unknown), **PATCH** updates only the fields sent (`title`, `body` and/or `tags`) and returns the note, **DELETE** removes it and returns **204**. The same validation rules apply to PATCH.',
      tests: [
        {
          name: 'detail and 404',
          args: [[req('POST', '/api/notes/', { title: 'Read', body: 'Chapter 1', tags: ['books'] }), req('GET', '/api/notes/1/'), st(req('GET', '/api/notes/99/'))]],
          expected: [[201, note(1, 'Read', 'Chapter 1', ['books'])], [200, note(1, 'Read', 'Chapter 1', ['books'])], 404],
        },
        {
          name: 'patch only what is sent',
          args: [[req('POST', '/api/notes/', { title: 'Plan', body: 'Draft', tags: ['work'] }), req('PATCH', '/api/notes/1/', { title: 'Plan v2' }), req('PATCH', '/api/notes/1/', { tags: ['Work', 'Ideas'] }), req('GET', '/api/notes/1/')]],
          expected: [[201, note(1, 'Plan', 'Draft', ['work'])], [200, note(1, 'Plan v2', 'Draft', ['work'])], [200, note(1, 'Plan v2', 'Draft', ['work', 'ideas'])], [200, note(1, 'Plan v2', 'Draft', ['work', 'ideas'])]],
        },
        {
          name: 'patch can clear tags and validates',
          args: [[req('POST', '/api/notes/', { title: 'Keep', tags: ['a'] }), req('PATCH', '/api/notes/1/', { tags: [] }), req('PATCH', '/api/notes/1/', { title: '' }), st(req('PATCH', '/api/notes/99/', { title: 'x' }))]],
          expected: [[201, note(1, 'Keep', '', ['a'])], [200, note(1, 'Keep')], [400, { title: ['This field may not be blank.'] }], 404],
        },
        {
          name: 'delete',
          args: [[req('POST', '/api/notes/', { title: 'Temp' }), st(req('DELETE', '/api/notes/1/')), req('GET', '/api/notes/'), st(req('DELETE', '/api/notes/1/'))]],
          expected: [[201, note(1, 'Temp')], 204, [200, { results: [] }], 404],
        },
      ],
      hints: [
        'Use `get_object_or_404(Note, pk=pk)` in a `note_detail(request, pk)` view and register `path("api/notes/<int:pk>/", note_detail)`.',
        'PATCH: `ser = NoteSerializer(note, data=request.data, partial=True)`, `ser.is_valid(raise_exception=True)`, `ser.save()`. DELETE: `note.delete()` then `JsonResponse({}, status=204)`.',
      ],
      reveal: B2,
    },
    {
      id: 'f3',
      title: 'Show, add and edit notes',
      part: 'frontend',
      brief:
        'In `App`, fetch `/api/notes/` on mount and render one `<li>` per note with its title in an `<h3>`, its body, its tags as `#tag` and an `Edit` button. Show `No notes yet` when the list is empty. Add a form: inputs with placeholders `Title`, `Body` (a textarea) and `Tags (comma separated)`, plus a button labelled `Add note` that POSTs the note (split the tags on commas) and reloads the list. Clicking `Edit` copies that note into the form and switches the button label to `Save`, which PATCHes the note, clears the form and reloads. If the server answers 400 show the first `title` message (for example `This field may not be blank.`). Use `onClick` for the buttons.',
      seed: [req('POST', '/api/notes/', JSON.stringify({ title: 'First note', body: 'Oldest', tags: ['work'] })), req('POST', '/api/notes/', JSON.stringify({ title: 'Second note', body: 'Newest' }))],
      reactTests: [
        {
          name: 'lists the notes, newest first',
          steps: [{ expectCount: 'li', n: 2 }, { expectText: 'Second note', in: 'li:first-child' }, { expectText: 'First note', in: 'li:last-child' }, { expectText: '#work' }],
        },
        {
          name: 'adds a note',
          steps: [
            { type: 'input[placeholder="Title"]', value: 'Fresh idea' },
            { type: 'textarea[placeholder="Body"]', value: 'Remember the milk' },
            { type: 'input[placeholder="Tags (comma separated)"]', value: 'home, errands' },
            { click: 'text=Add note' },
            { expectCount: 'li', n: 3 },
            { expectText: 'Fresh idea', in: 'li:first-child' },
            { expectText: 'Remember the milk' },
            { expectText: '#home' },
            { expectText: '#errands' },
          ],
        },
        { name: 'needs a title', steps: [{ click: 'text=Add note' }, { expectText: 'This field may not be blank.' }] },
        {
          name: 'edits a note',
          steps: [
            { click: 'li:last-child button' },
            { expectText: 'Save' },
            { type: 'input[placeholder="Title"]', value: 'Renamed note' },
            { click: 'text=Save' },
            { expectText: 'Renamed note', in: 'li:last-child' },
            { expectNoText: 'First note' },
            { expectText: '#work', in: 'li:last-child' },
            { expectText: 'Add note' },
          ],
        },
      ],
      hints: [
        'Keep `notes` in state (`null` while loading) and a separate state for each form field plus `editingId`. A `load()` function that fetches and sets `data.results` can be called on mount and after every save.',
        'One `save()` for both cases: `const url = editingId ? "/api/notes/" + editingId + "/" : "/api/notes/"` and `method: editingId ? "PATCH" : "POST"`. Tags: `tags.split(",").map(t => t.trim()).filter(t => t)`; when editing, show them again with `note.tags.join(", ")`.',
      ],
      reveal: F3,
    },
    {
      id: 'b4',
      title: 'Search, tag filter and pagination',
      part: 'backend',
      brief:
        'Upgrade **GET** `api/notes/`. `?q=word` keeps notes whose title **or** body contains the text, ignoring case (`models.Q(...) | models.Q(...)` with `icontains`). `?tag=work` keeps notes that carry exactly that tag (case-insensitive; `wor` does not match `work`). Filters combine with AND and the newest note still comes first. The response is paginated with **5 notes per page**: `{"count": <matches over all pages>, "next": <next page number or null>, "results": [...]}`, chosen with `?page=` (default 1). A page that is not a positive integer or is past the last page (page 1 of an empty result is fine) is **404** `{"detail": "Invalid page."}`. (Use single-word search text: the sandbox does not decode `%20` or `+`.)',
      tests: [
        {
          name: 'search title or body, any case',
          args: [[...seedThree(), req('GET', '/api/notes/?q=milk'), req('GET', '/api/notes/?q=NOTHING'), req('GET', '/api/notes/?q=zzz')]],
          expected: [
            [201, milk],
            [201, sprint],
            [201, ideas],
            [200, { count: 2, next: null, results: [sprint, milk] }],
            [200, { count: 1, next: null, results: [ideas] }],
            [200, { count: 0, next: null, results: [] }],
          ],
        },
        {
          name: 'tag filter matches whole tags',
          args: [[...seedThree(), req('GET', '/api/notes/?tag=work'), req('GET', '/api/notes/?tag=Home'), req('GET', '/api/notes/?tag=wor'), req('GET', '/api/notes/?tag=ideas')]],
          expected: [
            [201, milk],
            [201, sprint],
            [201, ideas],
            [200, { count: 2, next: null, results: [ideas, sprint] }],
            [200, { count: 1, next: null, results: [milk] }],
            [200, { count: 0, next: null, results: [] }],
            [200, { count: 1, next: null, results: [ideas] }],
          ],
        },
        {
          name: 'search and tag together',
          args: [[...seedThree(), req('GET', '/api/notes/?q=milk&tag=work'), req('GET', '/api/notes/?tag=work&q=milk')]],
          expected: [[201, milk], [201, sprint], [201, ideas], [200, { count: 1, next: null, results: [sprint] }], [200, { count: 1, next: null, results: [sprint] }]],
        },
        {
          name: 'pages of five',
          args: [[...twelvePosts, req('GET', '/api/notes/'), req('GET', '/api/notes/?page=2'), req('GET', '/api/notes/?page=3')]],
          expected: [
            ...TWELVE.map(() => 201),
            [200, { count: 12, next: 2, results: pageOf([12, 11, 10, 9, 8]) }],
            [200, { count: 12, next: 3, results: pageOf([7, 6, 5, 4, 3]) }],
            [200, { count: 12, next: null, results: pageOf([2, 1]) }],
          ],
        },
        {
          name: 'bad pages',
          args: [[...twelvePosts, st(req('GET', '/api/notes/?page=4')), st(req('GET', '/api/notes/?page=0')), st(req('GET', '/api/notes/?page=abc')), req('GET', '/api/notes/?q=zzz&page=1'), st(req('GET', '/api/notes/?q=zzz&page=2'))]],
          expected: [...TWELVE.map(() => 201), 404, 404, 404, [200, { count: 0, next: null, results: [] }], 404],
        },
        {
          name: 'filters apply before paging',
          args: [[...twelvePosts, req('GET', '/api/notes/?q=1&page=1'), st(req('GET', '/api/notes/?q=1&page=2'))]],
          expected: [...TWELVE.map(() => 201), [200, { count: 4, next: null, results: pageOf([12, 11, 10, 1]) }], 404],
        },
      ],
      hints: [
        'Build the queryset step by step: `notes = Note.objects.order_by("-id")`, then `notes = notes.filter(...)` for `q` and for `tag`. `request.GET.get("q", "")` reads the query string. Tag filter: `tags__contains="," + tag + ","`.',
        'Pagination: `count = notes.count()`, `pages = max(1, (count + 4) // 5)`, `start = (page - 1) * 5`, `notes[start:start + 5]`. Parse `page` with `int(...)` inside `try/except ValueError`, and return `JsonResponse({"detail": "Invalid page."}, status=404)` when it is below 1 or above `pages`.',
      ],
      reveal: B4,
    },
    {
      id: 'f5',
      title: 'Search box and pager',
      part: 'frontend',
      brief:
        'Add an input with placeholder `Search notes` and a `Search` button. Clicking it loads `/api/notes/?q=<text>&page=1`. Show `Showing <n> of <count> notes` (n = notes on this page, count = `count` from the API) and `Page <p>`, plus `Previous page` / `Next page` buttons that move through the pages (disable `Previous page` on page 1 and `Next page` when `next` is null). Searching always goes back to page 1. Keep add/edit working: reload the current search and page after saving.',
      seed: seedF5,
      reactTests: [
        {
          name: 'pages through the notes',
          steps: [
            { expectCount: 'li', n: 5 },
            { expectText: 'Showing 5 of 7 notes' },
            { expectText: 'Page 1' },
            { expectText: 'Eta', in: 'li:first-child' },
            { click: 'text=Next page' },
            { expectCount: 'li', n: 2 },
            { expectText: 'Page 2' },
            { expectText: 'Alpha milk' },
            { click: 'text=Previous page' },
            { expectCount: 'li', n: 5 },
          ],
        },
        {
          name: 'search starts again at page one',
          steps: [
            { click: 'text=Next page' },
            { expectCount: 'li', n: 2 },
            { type: 'input[placeholder="Search notes"]', value: 'milk' },
            { click: 'text=Search' },
            { expectCount: 'li', n: 2 },
            { expectText: 'Showing 2 of 2 notes' },
            { expectText: 'Page 1' },
            { expectText: 'Zeta milk' },
            { expectNoText: 'Epsilon' },
          ],
        },
        {
          name: 'adding a note keeps the list fresh',
          steps: [
            { type: 'input[placeholder="Title"]', value: 'Theta' },
            { click: 'text=Add note' },
            { expectText: 'Showing 5 of 8 notes' },
            { expectText: 'Theta', in: 'li:first-child' },
          ],
        },
      ],
      hints: [
        'Keep two pieces of state: `query` (what is typed) and `search` (what was submitted), plus `page`. A `useEffect(() => { load(search, page); }, [search, page])` refetches whenever either changes. The Search button does `setPage(1); setSearch(query.trim())`.',
        '`fetch("/api/notes/?q=" + encodeURIComponent(q) + "&page=" + p)` returns `{count, next, results}`: keep all three in state. `disabled={!next}` on Next, `disabled={page <= 1}` on Previous; after `save()` call `load(search, page)` again.',
      ],
      reveal: F5,
    },
    {
      id: 'b6',
      title: 'Accounts and private notes',
      part: 'backend',
      brief:
        'Add an `owner` ForeignKey (to `auth.User`) on `Note`. Create users `demo` / `demo123` and `guest` / `guest123` (`auth.create_user`). Add **POST** `api/login/` returning `{"token": ...}` (a JWT with `{"sub": user.pk}`) or **401** for bad credentials. Every notes endpoint now requires `Authorization: Bearer <token>` (**401** otherwise), saves new notes under the caller, and only ever sees the caller\'s notes: list, search, tag filter, `count` and pages are all per user, and another user\'s note is **404** on GET, PATCH and DELETE.',
      tests: [
        { name: 'every endpoint needs a token', args: [[st(req('GET', '/api/notes/')), st(req('POST', '/api/notes/', { title: 'x' })), st(req('GET', '/api/notes/1/')), st(req('DELETE', '/api/notes/1/'))]], expected: [401, 401, 401, 401] },
        { name: 'bad login and forged token', args: [[st(login('demo', 'nope')), st(login('ghost', 'demo123')), st(req('GET', '/api/notes/', undefined, { Authorization: 'Bearer abc.def.ghi' }))]], expected: [401, 401, 401] },
        {
          name: 'login, create and read back',
          args: [[st(login('demo', 'demo123')), authed(req('POST', '/api/notes/', { title: 'Mine', body: 'Secret', tags: ['Home'] })), authed(req('GET', '/api/notes/')), authed(req('GET', '/api/notes/1/')), authed(req('PATCH', '/api/notes/1/', { title: 'Mine v2' }))]],
          expected: [200, [201, note(1, 'Mine', 'Secret', ['home'])], [200, { count: 1, next: null, results: [note(1, 'Mine', 'Secret', ['home'])] }], [200, note(1, 'Mine', 'Secret', ['home'])], [200, note(1, 'Mine v2', 'Secret', ['home'])]],
        },
        {
          name: 'users cannot see each other',
          args: [[
            st(login('demo', 'demo123')),
            authed(req('POST', '/api/notes/', { title: 'Demo only', tags: ['work'] })),
            st(login('guest', 'guest123')),
            authed(req('GET', '/api/notes/')),
            authed(req('GET', '/api/notes/?q=demo')),
            authed(req('GET', '/api/notes/?tag=work')),
            st(authed(req('GET', '/api/notes/1/'))),
            st(authed(req('PATCH', '/api/notes/1/', { title: 'Hijacked' }))),
            st(authed(req('DELETE', '/api/notes/1/'))),
            authed(req('POST', '/api/notes/', { title: 'Guest note' })),
            st(login('demo', 'demo123')),
            authed(req('GET', '/api/notes/')),
          ]],
          expected: [
            200,
            [201, note(1, 'Demo only', '', ['work'])],
            200,
            [200, { count: 0, next: null, results: [] }],
            [200, { count: 0, next: null, results: [] }],
            [200, { count: 0, next: null, results: [] }],
            404,
            404,
            404,
            [201, note(2, 'Guest note')],
            200,
            [200, { count: 1, next: null, results: [note(1, 'Demo only', '', ['work'])] }],
          ],
        },
        {
          name: 'paging counts only my notes',
          args: [[
            st(login('guest', 'guest123')),
            ...TWELVE.map((i) => st(authed(req('POST', '/api/notes/', { title: 'Note ' + i })))),
            st(login('demo', 'demo123')),
            authed(req('POST', '/api/notes/', { title: 'Demo note' })),
            authed(req('GET', '/api/notes/')),
            st(login('guest', 'guest123')),
            authed(req('GET', '/api/notes/?page=3')),
          ]],
          expected: [200, ...TWELVE.map(() => 201), 200, [201, note(13, 'Demo note')], [200, { count: 1, next: null, results: [note(13, 'Demo note')] }], 200, [200, { count: 12, next: null, results: [note(2, 'Note 2'), note(1, 'Note 1')] }]],
        },
      ],
      hints: [
        '`owner = models.ForeignKey(auth.User, on_delete=models.CASCADE)`. Keep `owner` out of the serializer fields; pass it on create with `ser.save(owner=user)`. Start the list from `Note.objects.filter(owner=user)` so search, tags and paging all inherit the scoping.',
        'Write `require_user(request)` (read the `Bearer ` header, `auth.jwt_decode(token, SECRET)`, raise `NotAuthenticated` on `auth.InvalidToken`, return `auth.User.objects.get(pk=payload["sub"])`) and call it first in both views. `get_object_or_404(Note, pk=pk, owner=user)` turns someone else\'s note into a 404.',
      ],
      reveal: B6,
    },
    {
      id: 'f7',
      title: 'Log in from the page',
      part: 'frontend',
      brief:
        'Show a login screen first: inputs with placeholders `Username` and `Password` and a `Log in` button. On success keep the token in state and send `Authorization: Bearer <token>` with every notes request (list, search, pages, create, edit); on failure show `Invalid credentials`. Once logged in the page behaves as before, but each user only sees their own notes.',
      reactTests: [
        { name: 'wrong password', steps: [{ type: 'input[placeholder="Username"]', value: 'demo' }, { type: 'input[placeholder="Password"]', value: 'wrong' }, { click: 'text=Log in' }, { expectText: 'Invalid credentials' }] },
        {
          name: 'log in, add and find a note',
          steps: [
            { type: 'input[placeholder="Username"]', value: 'demo' },
            { type: 'input[placeholder="Password"]', value: 'demo123' },
            { click: 'text=Log in' },
            { expectText: 'Showing 0 of 0 notes' },
            { type: 'input[placeholder="Title"]', value: 'Pack bags' },
            { type: 'input[placeholder="Tags (comma separated)"]', value: 'travel' },
            { click: 'text=Add note' },
            { expectText: 'Showing 1 of 1 notes' },
            { expectText: '#travel' },
            { type: 'input[placeholder="Search notes"]', value: 'bags' },
            { click: 'text=Search' },
            { expectCount: 'li', n: 1 },
            { click: 'li button' },
            { type: 'input[placeholder="Title"]', value: 'Pack small bags' },
            { click: 'text=Save' },
            { expectText: 'Pack small bags' },
          ],
        },
        {
          name: 'another user starts empty',
          steps: [
            { type: 'input[placeholder="Username"]', value: 'guest' },
            { type: 'input[placeholder="Password"]', value: 'guest123' },
            { click: 'text=Log in' },
            { expectText: 'Showing 0 of 0 notes' },
            { expectText: 'No notes yet' },
            { expectNoText: 'Pack' },
          ],
        },
      ],
      hints: [
        'Keep `token` in state; render the login screen while it is null and make the load effect depend on `[token, search, page]` (do nothing while the token is empty).',
        'Build the headers in one helper, `{ "Content-Type": "application/json", Authorization: "Bearer " + token }`, and pass it to the GET in `load` as well as to the POST and PATCH in `save`.',
      ],
      reveal: F7,
    },
  ],
};

export default project;
