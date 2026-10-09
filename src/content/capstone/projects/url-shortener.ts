import { req, type CapstoneProject } from '../types';

const IMPORTS = `from minidjango import models, serializers, auth
from minidjango.http import App, path, JsonResponse, get_object_or_404, require_http_methods
from minidjango.exceptions import NotAuthenticated
`;

const BASE62 = `
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def to_base62(n):
    digits = ""
    while n > 0:
        n, rest = divmod(n, 62)
        digits = ALPHABET[rest] + digits
    return digits or "0"
`;

const MODEL = `${BASE62}

class Link(models.Model):
    url = models.CharField(max_length=2000)
    code = models.CharField(max_length=12, unique=True, blank=True, default="")
    clicks = models.IntegerField(default=0)


class LinkSerializer(serializers.ModelSerializer):
    url = serializers.URLField(max_length=2000)

    class Meta:
        model = Link
        fields = ["id", "url", "code", "clicks"]
        read_only_fields = ["id", "code", "clicks"]
`;

const LIST_V1 = `

def link_list(request):
    if request.method == "POST":
        ser = LinkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        link = ser.save()
        link.code = to_base62(link.id)
        link.save()
        return JsonResponse(LinkSerializer(link).data, status=201)
    links = Link.objects.order_by("id")
    return JsonResponse({"results": LinkSerializer(links, many=True).data})
`;

const LIST_V4 = `

def link_list(request):
    if request.method == "POST":
        ser = LinkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        link = ser.save()
        link.code = to_base62(link.id)
        link.save()
        return JsonResponse(LinkSerializer(link).data, status=201)
    links = Link.objects.order_by("-clicks", "id")
    data = LinkSerializer(links, many=True).data
    return JsonResponse({"results": data, "total_clicks": sum(item["clicks"] for item in data)})
`;

const FOLLOW = `

@require_http_methods(["GET", "POST"])
def follow(request, code):
    link = get_object_or_404(Link, code=code)
    link.clicks += 1
    link.save()
    return JsonResponse({"location": link.url})
`;

const B1 = `${IMPORTS}${MODEL}${LIST_V1}

app = App([path("api/links/", link_list)])
`;

const B2 = `${IMPORTS}${MODEL}${LIST_V1}${FOLLOW}

app = App([path("api/links/", link_list), path("api/r/<str:code>/", follow)])
`;

const B4 = `${IMPORTS}${MODEL}${LIST_V4}${FOLLOW}

app = App([path("api/links/", link_list), path("api/r/<str:code>/", follow)])
`;

const B6 = `${IMPORTS}${BASE62}

SECRET = "shortener-secret"
auth.create_user("demo", "demo123")
auth.create_user("guest", "guest123")


class Link(models.Model):
    url = models.CharField(max_length=2000)
    code = models.CharField(max_length=12, unique=True, blank=True, default="")
    clicks = models.IntegerField(default=0)
    owner = models.ForeignKey(auth.User, on_delete=models.CASCADE)


class LinkSerializer(serializers.ModelSerializer):
    url = serializers.URLField(max_length=2000)

    class Meta:
        model = Link
        fields = ["id", "url", "code", "clicks"]
        read_only_fields = ["id", "code", "clicks"]


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


def link_list(request):
    user = require_user(request)
    if request.method == "POST":
        ser = LinkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        link = ser.save(owner=user)
        link.code = to_base62(link.id)
        link.save()
        return JsonResponse(LinkSerializer(link).data, status=201)
    links = Link.objects.filter(owner=user).order_by("-clicks", "id")
    data = LinkSerializer(links, many=True).data
    return JsonResponse({"results": data, "total_clicks": sum(item["clicks"] for item in data)})


@require_http_methods(["GET", "POST"])
def follow(request, code):
    link = get_object_or_404(Link, code=code)
    link.clicks += 1
    link.save()
    return JsonResponse({"location": link.url})


app = App([
    path("api/login/", login),
    path("api/links/", link_list),
    path("api/r/<str:code>/", follow),
])
`;

const LIST_VIEW = `      {links.length === 0 ? (
        <p>No links yet</p>
      ) : (
        <ul>
          {links.map((l) => (
            <li key={l.id}>
              <strong>/r/{l.code}</strong> {l.url} <span>Clicks: {l.clicks}</span>
              LIST_ACTIONS
            </li>
          ))}
        </ul>
      )}
`;

const F3 = `function App() {
  const [links, setLinks] = useState(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/links/")
      .then((res) => res.json())
      .then((data) => setLinks(data.results));
  }, []);

  async function shorten() {
    const res = await fetch("/api/links/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url }) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.url ? data.url[0] : "Something went wrong");
      return;
    }
    setError("");
    setUrl("");
    setLinks((ls) => [...ls, data]);
  }

  if (links === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Link shortener</h1>
      <input placeholder="Paste a long URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button onClick={shorten}>Shorten</button>
      {error && <p>{error}</p>}
${LIST_VIEW.replace('              LIST_ACTIONS\n', '')}    </div>
  );
}
`;

const F5 = `function App() {
  const [links, setLinks] = useState(null);
  const [total, setTotal] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [lastVisit, setLastVisit] = useState("");

  async function load() {
    const res = await fetch("/api/links/");
    const data = await res.json();
    setLinks(data.results);
    setTotal(data.total_clicks);
  }

  useEffect(() => {
    load();
  }, []);

  async function shorten() {
    const res = await fetch("/api/links/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url }) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.url ? data.url[0] : "Something went wrong");
      return;
    }
    setError("");
    setUrl("");
    load();
  }

  async function visit(link) {
    const res = await fetch("/api/r/" + link.code + "/", { method: "POST" });
    const data = await res.json();
    setLastVisit(data.location);
    load();
  }

  if (links === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Link shortener</h1>
      <input placeholder="Paste a long URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button onClick={shorten}>Shorten</button>
      {error && <p>{error}</p>}
      <p>Total clicks: {total}</p>
      {lastVisit && <p>Last visit: {lastVisit}</p>}
${LIST_VIEW.replace('LIST_ACTIONS', '<button onClick={() => visit(l)}>Visit</button>')}    </div>
  );
}
`;

const F7 = `function App() {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [links, setLinks] = useState(null);
  const [total, setTotal] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [lastVisit, setLastVisit] = useState("");
  const headers = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token });

  async function load() {
    const res = await fetch("/api/links/", { headers: headers() });
    const data = await res.json();
    setLinks(data.results);
    setTotal(data.total_clicks);
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

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

  async function shorten() {
    const res = await fetch("/api/links/", { method: "POST", headers: headers(), body: JSON.stringify({ url: url }) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.url ? data.url[0] : "Something went wrong");
      return;
    }
    setError("");
    setUrl("");
    load();
  }

  async function visit(link) {
    const res = await fetch("/api/r/" + link.code + "/", { method: "POST" });
    const data = await res.json();
    setLastVisit(data.location);
    load();
  }

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
  if (links === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Link shortener</h1>
      <input placeholder="Paste a long URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button onClick={shorten}>Shorten</button>
      {error && <p>{error}</p>}
      <p>Total clicks: {total}</p>
      {lastVisit && <p>Last visit: {lastVisit}</p>}
${LIST_VIEW.replace('LIST_ACTIONS', '<button onClick={() => visit(l)}>Visit</button>')}    </div>
  );
}
`;

// 62 links: ids 10, 11, 36 and 62 are checked in full (codes "a", "b", "A", "10")
const IDS = Array.from({ length: 62 }, (_, i) => i + 1);
const FULL = new Map<number, string>([[10, 'a'], [11, 'b'], [36, 'A'], [62, '10']]);
const manySteps = IDS.map((i) => {
  const r = req('POST', '/api/links/', { url: 'https://example.com/' + i });
  return FULL.has(i) ? r : { ...r, only: 'status' };
});
const manyExpected = IDS.map((i) => (FULL.has(i) ? [201, { id: i, url: 'https://example.com/' + i, code: FULL.get(i), clicks: 0 }] : 201));

const A = 'https://example.com/a';
const B = 'https://example.com/b';
const C = 'https://example.com/c';
const st = (r: ReturnType<typeof req>) => ({ ...r, only: 'status' });
const authed = (r: ReturnType<typeof req>) => ({ ...r, auth: true });
const login = (u: string, p: string) => req('POST', '/api/login/', { username: u, password: p });

const project: CapstoneProject = {
  id: 'url-shortener',
  title: 'URL shortener',
  blurb: 'Shorten links with base62 codes, count the clicks, rank them, then lock it down per user.',
  backendStarter: `${IMPORTS}

# Build your backend here. Milestone 1: a Link model, a serializer,
# a base62 helper, a list/create view and \`app = App([...])\`.
`,
  frontendStarter: `function App() {
  // Milestone 3 starts here: a form to shorten a URL, and the list of links.
  return <h1>Link shortener</h1>;
}
`,
  milestones: [
    {
      id: 'b1',
      title: 'Create short links',
      part: 'backend',
      brief:
        'Create a `Link` model (`url`: CharField max 2000, `code`: CharField max 12, `unique=True, blank=True, default=""`, `clicks`: IntegerField default 0) and a `LinkSerializer` with fields `id`, `url`, `code`, `clicks`. Only `url` is writable (use `serializers.URLField` so junk gets **400** `{"url": ["Enter a valid URL."]}`; `id`, `code` and `clicks` go in `read_only_fields`). Add a view at `api/links/`: **POST** creates a link and returns it with status **201**, where `code` is the **base62** of the new id (digits `0-9`, then `a-z`, then `A-Z`: id 1 → `"1"`, 10 → `"a"`, 36 → `"A"`, 62 → `"10"`); **GET** returns `{"results": [...]}` ordered by id. Finish with `app = App([...])`.',
      tests: [
        { name: 'empty list', args: [[req('GET', '/api/links/')]], expected: [[200, { results: [] }]] },
        {
          name: 'create then list',
          args: [[req('POST', '/api/links/', { url: A }), req('POST', '/api/links/', { url: B }), req('GET', '/api/links/')]],
          expected: [
            [201, { id: 1, url: A, code: '1', clicks: 0 }],
            [201, { id: 2, url: B, code: '2', clicks: 0 }],
            [200, { results: [{ id: 1, url: A, code: '1', clicks: 0 }, { id: 2, url: B, code: '2', clicks: 0 }] }],
          ],
        },
        {
          name: 'invalid urls',
          args: [[req('POST', '/api/links/', { url: 'not a url' }), req('POST', '/api/links/', {}), req('POST', '/api/links/', { url: '' }), req('GET', '/api/links/')]],
          expected: [[400, { url: ['Enter a valid URL.'] }], [400, { url: ['This field is required.'] }], [400, { url: ['This field may not be blank.'] }], [200, { results: [] }]],
        },
        { name: 'code and clicks are read-only', args: [[req('POST', '/api/links/', { url: A, code: 'hack', clicks: 50 })]], expected: [[201, { id: 1, url: A, code: '1', clicks: 0 }]] },
        { name: 'base62 codes', args: [manySteps], expected: manyExpected },
      ],
      hints: [
        'The id only exists after the row is saved: call `ser.save()` first, then set `link.code = to_base62(link.id)` and `link.save()`. Mark `id`, `code` and `clicks` as `read_only_fields` so clients cannot choose them.',
        'Base62: `while n > 0: n, rest = divmod(n, 62); digits = ALPHABET[rest] + digits` with `ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"`. Declare `url = serializers.URLField(max_length=2000)` on the serializer.',
      ],
      reveal: B1,
    },
    {
      id: 'b2',
      title: 'Follow a code and count clicks',
      part: 'backend',
      brief:
        'Add `api/r/<str:code>/`. A **GET** (or **POST**) answers **200** `{"location": "<the long url>"}` and adds 1 to that link\'s `clicks`. Unknown codes are **404** and change nothing; other methods (PUT, DELETE...) get **405** and are not counted. (The sandbox network only replays POST/PATCH/DELETE to rebuild state, which is why the web page will use POST for its "Visit" button later.)',
      tests: [
        {
          name: 'follow counts clicks',
          args: [[req('POST', '/api/links/', { url: A }), req('GET', '/api/r/1/'), req('GET', '/api/r/1/'), req('GET', '/api/links/')]],
          expected: [[201, { id: 1, url: A, code: '1', clicks: 0 }], [200, { location: A }], [200, { location: A }], [200, { results: [{ id: 1, url: A, code: '1', clicks: 2 }] }]],
        },
        {
          name: 'post counts too',
          args: [[req('POST', '/api/links/', { url: B }), req('POST', '/api/r/1/'), req('GET', '/api/links/')]],
          expected: [[201, { id: 1, url: B, code: '1', clicks: 0 }], [200, { location: B }], [200, { results: [{ id: 1, url: B, code: '1', clicks: 1 }] }]],
        },
        {
          name: 'unknown code and other methods',
          args: [[req('POST', '/api/links/', { url: A }), st(req('GET', '/api/r/zzz/')), st(req('DELETE', '/api/r/1/')), st(req('PUT', '/api/r/1/', { url: B })), req('GET', '/api/links/')]],
          expected: [[201, { id: 1, url: A, code: '1', clicks: 0 }], 404, 405, 405, [200, { results: [{ id: 1, url: A, code: '1', clicks: 0 }] }]],
        },
      ],
      hints: [
        'Register `path("api/r/<str:code>/", follow)`; `get_object_or_404(Link, code=code)` gives you the 404 for free.',
        'Decorate the view with `@require_http_methods(["GET", "POST"])` (it returns 405 for everything else), then `link.clicks += 1`, `link.save()` and `return JsonResponse({"location": link.url})`.',
      ],
      reveal: B2,
    },
    {
      id: 'f3',
      title: 'Shorten from the page',
      part: 'frontend',
      brief:
        'In `App`, fetch `/api/links/` on mount and render one `<li>` per link showing `/r/<code>`, the long URL and `Clicks: <n>`. Show `No links yet` when the list is empty. Add an input with placeholder `Paste a long URL` and a `Shorten` button (use `onClick`) that POSTs `{url}`, clears the input and appends the new link. If the server answers 400, show the first message for `url` (for example `Enter a valid URL.`).',
      seed: [req('POST', '/api/links/', JSON.stringify({ url: A }))],
      reactTests: [
        {
          name: 'lists links and shortens a new one',
          steps: [
            { expectCount: 'li', n: 1 },
            { expectText: '/r/1' },
            { expectText: A },
            { expectText: 'Clicks: 0' },
            { type: 'input[placeholder="Paste a long URL"]', value: B },
            { click: 'text=Shorten' },
            { expectCount: 'li', n: 2 },
            { expectText: '/r/2' },
            { expectText: B },
          ],
        },
        {
          name: 'shows the validation error',
          steps: [{ type: 'input[placeholder="Paste a long URL"]', value: 'nope' }, { click: 'text=Shorten' }, { expectText: 'Enter a valid URL.' }],
        },
      ],
      hints: [
        'Keep `links` in state (start with `null` while loading) and fill it from `data.results` inside a `useEffect(..., [])`. Keep the input text in its own state.',
        'After `const res = await fetch("/api/links/", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ url }) })` check `res.ok`; on failure read `data.url[0]`; on success `setLinks(ls => [...ls, data])`.',
      ],
      reveal: F3,
    },
    {
      id: 'b4',
      title: 'Most-clicked first',
      part: 'backend',
      brief: 'The list endpoint (**GET** `api/links/`) now orders links by `clicks` descending, ties broken by `id` ascending, and returns `{"results": [...], "total_clicks": <sum of all clicks>}`.',
      tests: [
        {
          name: 'ranked by clicks',
          args: [[req('POST', '/api/links/', { url: A }), req('POST', '/api/links/', { url: B }), req('POST', '/api/links/', { url: C }), st(req('GET', '/api/r/3/')), st(req('GET', '/api/r/3/')), st(req('GET', '/api/r/2/')), req('GET', '/api/links/')]],
          expected: [
            [201, { id: 1, url: A, code: '1', clicks: 0 }],
            [201, { id: 2, url: B, code: '2', clicks: 0 }],
            [201, { id: 3, url: C, code: '3', clicks: 0 }],
            200,
            200,
            200,
            [200, { results: [{ id: 3, url: C, code: '3', clicks: 2 }, { id: 2, url: B, code: '2', clicks: 1 }, { id: 1, url: A, code: '1', clicks: 0 }], total_clicks: 3 }],
          ],
        },
        {
          name: 'ties keep id order',
          args: [[req('POST', '/api/links/', { url: A }), req('POST', '/api/links/', { url: B }), st(req('POST', '/api/r/2/')), st(req('POST', '/api/r/1/')), req('GET', '/api/links/')]],
          expected: [[201, { id: 1, url: A, code: '1', clicks: 0 }], [201, { id: 2, url: B, code: '2', clicks: 0 }], 200, 200, [200, { results: [{ id: 1, url: A, code: '1', clicks: 1 }, { id: 2, url: B, code: '2', clicks: 1 }], total_clicks: 2 }]],
        },
        { name: 'empty total', args: [[req('GET', '/api/links/')]], expected: [[200, { results: [], total_clicks: 0 }]] },
      ],
      hints: [
        '`Link.objects.order_by("-clicks", "id")` sorts by several keys; the minus sign means descending.',
        'Serialize first (`data = LinkSerializer(links, many=True).data`), then `sum(item["clicks"] for item in data)` for `total_clicks`.',
      ],
      reveal: B4,
    },
    {
      id: 'f5',
      title: 'Visit a link, watch the counts move',
      part: 'frontend',
      brief:
        'Show `Total clicks: <n>` (from `total_clicks`) above the list and give every `<li>` a `Visit` button. Clicking it POSTs to `/api/r/<code>/`, shows `Last visit: <location>` and then **re-fetches the list** so the counts and the order come from the server. Re-fetch after shortening a link as well.',
      seed: [req('POST', '/api/links/', JSON.stringify({ url: A })), req('POST', '/api/links/', JSON.stringify({ url: B }))],
      reactTests: [
        {
          name: 'visiting updates counts and order',
          steps: [
            { expectCount: 'li', n: 2 },
            { expectText: 'Total clicks: 0' },
            { click: 'li:nth-child(2) button' },
            { expectText: 'Total clicks: 1' },
            { expectText: 'Last visit: ' + B },
            { expectText: B, in: 'li:first-child' },
            { expectText: 'Clicks: 1', in: 'li:first-child' },
            { click: 'li:first-child button' },
            { expectText: 'Total clicks: 2' },
            { expectText: 'Clicks: 2', in: 'li:first-child' },
          ],
        },
      ],
      hints: [
        'Move the fetch into a `load()` function that sets both `links` and `total`; call it from the mount effect, after a successful shorten and after a visit.',
        '`async function visit(link) { const res = await fetch("/api/r/" + link.code + "/", { method: "POST" }); const data = await res.json(); setLastVisit(data.location); load(); }` and `<button onClick={() => visit(l)}>Visit</button>` inside each `<li>`.',
      ],
      reveal: F5,
    },
    {
      id: 'b6',
      title: 'Accounts and private links',
      part: 'backend',
      brief:
        'Add an `owner` ForeignKey (to `auth.User`) on `Link`. Create users `demo` / `demo123` and `guest` / `guest123` (`auth.create_user`). Add **POST** `api/login/` returning `{"token": ...}` (a JWT with `{"sub": user.pk}` via `auth.jwt_encode`) or **401** for bad credentials. `api/links/` now needs `Authorization: Bearer <token>` (**401** without a valid one); **POST** stores the link under the caller, and **GET** lists only the caller\'s links (same ordering and `total_clicks`, computed over the caller\'s links only). `api/r/<code>/` stays **public**: anyone can follow a code, and the click counts for the owner.',
      tests: [
        { name: 'links need a token', args: [[st(req('GET', '/api/links/')), st(req('POST', '/api/links/', { url: A }))]], expected: [401, 401] },
        { name: 'bad login', args: [[st(login('demo', 'nope')), st(login('nobody', 'demo123'))]], expected: [401, 401] },
        { name: 'forged token', args: [[st(req('GET', '/api/links/', undefined, { Authorization: 'Bearer abc.def.ghi' }))]], expected: [401] },
        {
          name: 'each user sees only their links',
          args: [[
            st(login('demo', 'demo123')),
            authed(req('POST', '/api/links/', { url: A })),
            st(login('guest', 'guest123')),
            authed(req('GET', '/api/links/')),
            authed(req('POST', '/api/links/', { url: B })),
            authed(req('GET', '/api/links/')),
            st(login('demo', 'demo123')),
            authed(req('GET', '/api/links/')),
          ]],
          expected: [
            200,
            [201, { id: 1, url: A, code: '1', clicks: 0 }],
            200,
            [200, { results: [], total_clicks: 0 }],
            [201, { id: 2, url: B, code: '2', clicks: 0 }],
            [200, { results: [{ id: 2, url: B, code: '2', clicks: 0 }], total_clicks: 0 }],
            200,
            [200, { results: [{ id: 1, url: A, code: '1', clicks: 0 }], total_clicks: 0 }],
          ],
        },
        {
          name: 'following a code is public and counts for the owner',
          args: [[st(login('demo', 'demo123')), authed(req('POST', '/api/links/', { url: A })), req('GET', '/api/r/1/'), req('POST', '/api/r/1/'), authed(req('GET', '/api/links/')), st(req('GET', '/api/r/nope/'))]],
          expected: [200, [201, { id: 1, url: A, code: '1', clicks: 0 }], [200, { location: A }], [200, { location: A }], [200, { results: [{ id: 1, url: A, code: '1', clicks: 2 }], total_clicks: 2 }], 404],
        },
        {
          name: 'validation still applies',
          args: [[st(login('demo', 'demo123')), authed(req('POST', '/api/links/', { url: 'nope' }))]],
          expected: [200, [400, { url: ['Enter a valid URL.'] }]],
        },
      ],
      hints: [
        '`owner = models.ForeignKey(auth.User, on_delete=models.CASCADE)`. Keep `owner` out of the serializer fields and pass it when saving: `ser.save(owner=user)`; list with `Link.objects.filter(owner=user)`.',
        'Write `require_user(request)`: read `request.headers.get("authorization")`, check the `Bearer ` prefix, `auth.jwt_decode(token, SECRET)` (raise `NotAuthenticated` on `auth.InvalidToken`) and return `auth.User.objects.get(pk=payload["sub"])`. Call it first in `link_list` only, not in `follow`.',
      ],
      reveal: B6,
    },
    {
      id: 'f7',
      title: 'Log in from the page',
      part: 'frontend',
      brief:
        'Show a login screen first: inputs with placeholders `Username` and `Password` and a `Log in` button. On success keep the token in state, then load the links with `Authorization: Bearer <token>` (send it on the list and shorten requests); on failure show `Invalid credentials`. The rest of the page keeps working as before, and each user only sees their own links (an empty list shows `No links yet`).',
      reactTests: [
        { name: 'wrong password', steps: [{ type: 'input[placeholder="Username"]', value: 'demo' }, { type: 'input[placeholder="Password"]', value: 'wrong' }, { click: 'text=Log in' }, { expectText: 'Invalid credentials' }] },
        {
          name: 'log in, shorten and visit',
          steps: [
            { type: 'input[placeholder="Username"]', value: 'demo' },
            { type: 'input[placeholder="Password"]', value: 'demo123' },
            { click: 'text=Log in' },
            { expectText: 'Total clicks: 0' },
            { type: 'input[placeholder="Paste a long URL"]', value: A },
            { click: 'text=Shorten' },
            { expectText: '/r/1' },
            { click: 'li button' },
            { expectText: 'Clicks: 1' },
            { expectText: 'Total clicks: 1' },
          ],
        },
        {
          name: 'another user starts empty',
          steps: [
            { type: 'input[placeholder="Username"]', value: 'guest' },
            { type: 'input[placeholder="Password"]', value: 'guest123' },
            { click: 'text=Log in' },
            { expectText: 'No links yet' },
            { expectNoText: 'example.com' },
          ],
        },
      ],
      hints: [
        'Keep `token` in state; render the login screen while it is null, and load the links in an effect that depends on `[token]`.',
        'Build the headers in one helper: `{ "Content-Type": "application/json", Authorization: "Bearer " + token }` and use it for the list and the shorten request. The visit request does not need it.',
      ],
      reveal: F7,
    },
  ],
};

export default project;
