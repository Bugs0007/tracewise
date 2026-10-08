# Teaching libraries (Python, run in Pyodide)

Real Django and real LLMs can't run in a browser. Two small pure-Python packages in `src/py/` stand in for them so exercises **actually execute and get checked**. They are honest simulations: the UI labels units that use them (`simulationNote`). Both are unit-tested (`src/py/tests`, run by `npm test`) and verified inside Pyodide.

Every test run gets a **fresh import** (the harness clears `minidjango*` / `minillm*` from `sys.modules`), so models, the database, sessions and tokens start empty each run.

## minidjango

Names and behaviour mirror Django / Django REST Framework.

```python
from minidjango import models, serializers, transaction, connection, query_log
from minidjango.http import App, path, HttpRequest, HttpResponse, JsonResponse, View, get_object_or_404, require_http_methods
from minidjango.exceptions import ValidationError, Http404, PermissionDenied, NotAuthenticated
from minidjango.test import Client
from minidjango import auth          # User, create_user, authenticate, login, make_password, check_password,
                                     # SessionMiddleware, AuthenticationMiddleware, TokenAuthMiddleware,
                                     # create_token, jwt_encode, jwt_decode(token, secret, now=None), login_required
from minidjango import migrations    # project_state(*models), diff(old, new) -> ["AddField Post.slug ...", ...]
```

### ORM
```python
class Author(models.Model):
    name = models.CharField(max_length=50, unique=True)

class Book(models.Model):
    title = models.CharField(max_length=100, db_index=True)
    pages = models.IntegerField(default=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")
    tags = models.ManyToManyField("Tag", related_name="books")   # string refs work
    class Meta:
        ordering = ["title"]
        indexes = [models.Index(fields=["pages", "title"])]
```
Fields: `CharField TextField EmailField SlugField IntegerField PositiveIntegerField FloatField DecimalField BooleanField DateTimeField(auto_now_add) DateField ForeignKey OneToOneField ManyToManyField`; options `default null blank unique db_index max_length choices`. `on_delete`: `CASCADE SET_NULL PROTECT`.

QuerySets are **lazy** and cached: `all filter exclude get order_by('-x') [a:b] values values_list(flat=True) count exists first last create get_or_create update delete select_related prefetch_related in_bulk`; lookups `exact iexact gt gte lt lte ne contains icontains in startswith endswith isnull`, across relations (`author__name="Ada"`), and `Q(...) | Q(...)`, `~Q(...)`. `qs.query` returns SQL text without running it. Reverse FK: `author.books.all()`; M2M: `tag.books.add/remove/set/clear/all`.

**Query log**: `connection.queries` is a list of `{"sql", "rows_examined", "index"}`; `connection.query_count` counts SELECT/INSERT/UPDATE/DELETE; `connection.reset_queries()`. Accessing `book.author` on a fresh object runs one query (N+1); `select_related("author")` joins (1 query); `prefetch_related("books")` adds exactly one query per relation. Equality filters on `id`, `unique`, `db_index` or the first column of a `Meta.indexes` entry use an **index** (`index` is the column name, `rows_examined` = matches); anything else is a **full scan** (`index` is `None`, `rows_examined` = table size).

**Transactions**: `with transaction.atomic():` or `@transaction.atomic`; exceptions roll back (nested blocks are savepoints). The log shows `BEGIN/COMMIT/ROLLBACK/SAVEPOINT`.

### HTTP pipeline
```python
def notes(request):                      # request.method .path .GET .data .headers .COOKIES .user .session .trace
    return JsonResponse({"ok": True}, status=200)

def timing(get_response):                # Django-style middleware factory
    def middleware(request):
        response = get_response(request) # in: list order; out: reverse order
        response["X-Timing"] = "1ms"
        return response
    return middleware

app = App([path("notes/", notes), path("notes/<int:pk>/", note_detail)], middleware=[timing])
client = Client(app)
r = client.get("/notes/")                # also post/put/patch/delete(path, data, headers)
r.status_code, r.json(), r.headers, client.last_request.trace
```
Exceptions become responses: `Http404`→404, `NotAuthenticated`→401, `PermissionDenied`→403, `ValidationError`→400 (body = the detail dict), `Model.DoesNotExist`→404, anything else→500. `require_http_methods(["GET"])` returns 405. `View` subclasses dispatch to `get/post/...` via `as_view()`.

### Serializers
```python
class NoteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=20)
    priority = serializers.IntegerField(min_value=1, max_value=5, required=False, default=3)
    def validate_title(self, value): ...          # field hook
    def validate(self, attrs): ...                # object-level; raise ValidationError({"field": ["msg"]}) or ("msg")
    def create(self, validated_data): ...

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title", "pages", "author"]   # FK accepted as an integer id
        read_only_fields = ["id"]
```
`is_valid(raise_exception=False)`, `.errors` (dict of lists, e.g. `{"title": ["This field is required."]}`), `.validated_data`, `.data`, `.save()`; `many=True`, `partial=True`. Field classes: `CharField EmailField URLField IntegerField FloatField BooleanField ChoiceField ListField SerializerMethodField`. ModelSerializer enforces `unique` fields.

### Writing tasks against it
Learner code defines views/serializers/queries; a **harness** (hidden) builds models/data, and an **adapter** drives the scenario and returns JSON-able results (status codes, bodies, query counts). Example:
```ts
harness: `
from minidjango import models, connection
class Post(models.Model):
    title = models.CharField(max_length=50)
def run_view(view, method, data):
    from minidjango.http import App, path
    from minidjango.test import Client
    r = Client(App([path("posts/", view)])).request(method, "/posts/", data)
    return [r.status_code, r.json()]
`,
adapter: 'run_view',
tests: [{ args: ['POST', { title: 'hi' }], expected: [201, { id: 1, title: 'hi' }] }],
```
Remember: the harness runs **before** the learner's code in the same namespace, so learner code can use names the harness defines (say so in the statement), and the adapter can call learner functions.

## minillm

```python
from minillm import tokenize, count_tokens, embed, MockLLM, tool_call, reply
tokenize("Tokenization rocks!")   # ['Toke', '##niza', '##tion', 'rock', '##s', '!']
embed("cats are cute", dim=16)     # deterministic unit vector; shared words/trigrams => higher cosine
llm = MockLLM([tool_call("search", q="weather"), "It is sunny."])   # or dict {substring: reply, "*": default} or fn(messages, tools)
llm.chat(messages, tools=[{"name": "search", ...}]) -> {"role": "assistant", "content": ..., "tool_calls": [{"id","name","arguments": json-string}]}
llm.complete(prompt) -> str;  llm.stream(prompt) -> generator of word pieces;  llm.calls;  llm.usage
```
Use it for agent loops, tool-call handling, RAG generation steps, streaming, caching and evaluation exercises. Learners implement the logic (cosine similarity, chunkers, RRF, retries, routers); the mock only stands in for the model.
