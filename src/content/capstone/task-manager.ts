import { req, type CapstoneProject } from './types';

const IMPORTS = `from minidjango import models, serializers, auth
from minidjango.http import App, path, JsonResponse, get_object_or_404
from minidjango.exceptions import NotAuthenticated
`;

const MODEL = `
class Task(models.Model):
    title = models.CharField(max_length=100)
    done = models.BooleanField(default=False)


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ["id", "title", "done"]
`;

const LIST_V1 = `

def task_list(request):
    if request.method == "POST":
        ser = TaskSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return JsonResponse(TaskSerializer(ser.save()).data, status=201)
    tasks = Task.objects.order_by("id")
    return JsonResponse({"results": TaskSerializer(tasks, many=True).data})
`;

const DETAIL_V2 = `

def task_detail(request, pk):
    task = get_object_or_404(Task, pk=pk)
    return JsonResponse(TaskSerializer(task).data)
`;

const DETAIL_V3 = `

def task_detail(request, pk):
    task = get_object_or_404(Task, pk=pk)
    if request.method == "PATCH":
        ser = TaskSerializer(task, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return JsonResponse(TaskSerializer(ser.save()).data)
    if request.method == "DELETE":
        task.delete()
        return JsonResponse({}, status=204)
    return JsonResponse(TaskSerializer(task).data)
`;

const B1 = `${IMPORTS}${MODEL}${LIST_V1}

app = App([path("api/tasks/", task_list)])
`;
const B2 = `${IMPORTS}${MODEL}${LIST_V1}${DETAIL_V2}

app = App([path("api/tasks/", task_list), path("api/tasks/<int:pk>/", task_detail)])
`;
const B3 = `${IMPORTS}${MODEL}${LIST_V1}${DETAIL_V3}

app = App([path("api/tasks/", task_list), path("api/tasks/<int:pk>/", task_detail)])
`;

const B6 = `${IMPORTS}${MODEL}
SECRET = "capstone-secret"
auth.create_user("demo", "demo123")


def require_user(request):
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise NotAuthenticated()
    try:
        return auth.jwt_decode(header[7:], SECRET)
    except auth.InvalidToken:
        raise NotAuthenticated("Invalid token")


def login(request):
    user = auth.authenticate(request.data.get("username", ""), request.data.get("password", ""))
    if user is None:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)
    return JsonResponse({"token": auth.jwt_encode({"sub": user.pk}, SECRET)})


def task_list(request):
    require_user(request)
    if request.method == "POST":
        ser = TaskSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return JsonResponse(TaskSerializer(ser.save()).data, status=201)
    tasks = Task.objects.order_by("id")
    return JsonResponse({"results": TaskSerializer(tasks, many=True).data})


def task_detail(request, pk):
    require_user(request)
    task = get_object_or_404(Task, pk=pk)
    if request.method == "PATCH":
        ser = TaskSerializer(task, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return JsonResponse(TaskSerializer(ser.save()).data)
    if request.method == "DELETE":
        task.delete()
        return JsonResponse({}, status=204)
    return JsonResponse(TaskSerializer(task).data)


app = App([
    path("api/login/", login),
    path("api/tasks/", task_list),
    path("api/tasks/<int:pk>/", task_detail),
])
`;

const F4 = `function App() {
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    fetch("/api/tasks/")
      .then((res) => res.json())
      .then((data) => setTasks(data.results));
  }, []);

  if (tasks === null) return <p>Loading…</p>;
  return (
    <div>
      <h1>Tasks</h1>
      {tasks.length === 0 ? (
        <p>No tasks yet</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>{t.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;

const TASK_UI = `  const [title, setTitle] = useState("");

  async function addTask() {
    const res = await fetch("/api/tasks/", { method: "POST", headers: headers(), body: JSON.stringify({ title: title }) });
    if (!res.ok) return;
    const task = await res.json();
    setTasks((ts) => [...ts, task]);
    setTitle("");
  }

  async function toggle(task) {
    const res = await fetch("/api/tasks/" + task.id + "/", { method: "PATCH", headers: headers(), body: JSON.stringify({ done: !task.done }) });
    const updated = await res.json();
    setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
  }
`;

const TASK_VIEW = `  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div>
      <h1>Tasks</h1>
      <input placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button onClick={addTask}>Add</button>
      <p>
        {doneCount} of {tasks.length} done
      </p>
      {tasks.length === 0 ? (
        <p>No tasks yet</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)} /> {t.title}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;

const F5 = `function App() {
  const [tasks, setTasks] = useState(null);
  const headers = () => ({ "Content-Type": "application/json" });

  useEffect(() => {
    fetch("/api/tasks/")
      .then((res) => res.json())
      .then((data) => setTasks(data.results));
  }, []);

${TASK_UI}
  if (tasks === null) return <p>Loading…</p>;
${TASK_VIEW}`;

const F7 = `function App() {
  const [token, setToken] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const headers = () => ({ "Content-Type": "application/json", Authorization: "Bearer " + token });

  useEffect(() => {
    if (!token) return;
    fetch("/api/tasks/", { headers: headers() })
      .then((res) => res.json())
      .then((data) => setTasks(data.results));
  }, [token]);

  async function logIn() {
    const res = await fetch("/api/login/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username, password: password }) });
    if (!res.ok) {
      setError("Invalid credentials");
      return;
    }
    const data = await res.json();
    setError("");
    setToken(data.token);
  }

${TASK_UI}
  if (!token)
    return (
      <div>
        <h1>Log in</h1>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={logIn}>Log in</button>
        {error && <p>{error}</p>}
      </div>
    );
  if (tasks === null) return <p>Loading…</p>;
${TASK_VIEW}`;

const tm: CapstoneProject = {
  id: 'task-manager',
  title: 'Task manager',
  blurb: 'A to-do app with a REST API, validation, token auth and a React UI.',
  backendStarter: `${IMPORTS}

# Build your backend here. Milestone 1: a Task model, a serializer,
# a list/create view and \`app = App([...])\`.
`,
  frontendStarter: `function App() {
  // Milestone 4 starts here: fetch /api/tasks/ and render the list.
  return <h1>Tasks</h1>;
}
`,
  milestones: [
    {
      id: 'b1',
      title: 'Model and list/create endpoint',
      part: 'backend',
      brief:
        'Create a `Task` model (`title`: CharField max 100, `done`: BooleanField default False) and a `TaskSerializer` with fields `id`, `title`, `done`. Add a view at `api/tasks/`: **GET** returns `{"results": [...]}` ordered by id, **POST** creates a task and returns it with status **201**. Finish with `app = App([...])`.',
      tests: [
        { name: 'empty list', args: [[req('GET', '/api/tasks/')]], expected: [[200, { results: [] }]] },
        {
          name: 'create then list',
          args: [[req('POST', '/api/tasks/', { title: 'Buy milk' }), req('POST', '/api/tasks/', { title: 'Write code' }), req('GET', '/api/tasks/')]],
          expected: [
            [201, { id: 1, title: 'Buy milk', done: false }],
            [201, { id: 2, title: 'Write code', done: false }],
            [200, { results: [{ id: 1, title: 'Buy milk', done: false }, { id: 2, title: 'Write code', done: false }] }],
          ],
        },
      ],
      hints: ['A ModelSerializer with `Meta.model` and `Meta.fields` gives you validation and `.data` for free. Branch on `request.method` inside one view.', 'For POST: `ser = TaskSerializer(data=request.data)`, `ser.is_valid(raise_exception=True)`, then `JsonResponse(TaskSerializer(ser.save()).data, status=201)`. For GET: `TaskSerializer(Task.objects.order_by("id"), many=True).data`.'],
      reveal: B1,
    },
    {
      id: 'b2',
      title: 'Validation and the detail endpoint',
      part: 'backend',
      brief:
        'Bad input must get **400** with field errors (a missing, blank or over-long title). Add `api/tasks/<int:pk>/`: **GET** returns one task, or **404** if it does not exist.',
      tests: [
        { name: 'missing title', args: [[req('POST', '/api/tasks/', {})]], expected: [[400, { title: ['This field is required.'] }]] },
        { name: 'blank title', args: [[req('POST', '/api/tasks/', { title: '   ' })]], expected: [[400, { title: ['This field may not be blank.'] }]] },
        { name: 'too long', args: [[req('POST', '/api/tasks/', { title: 'x'.repeat(101) })]], expected: [[400, { title: ['Ensure this field has no more than 100 characters.'] }]] },
        { name: 'detail and 404', args: [[req('POST', '/api/tasks/', { title: 'Read' }), req('GET', '/api/tasks/1/'), { ...req('GET', '/api/tasks/99/'), only: 'status' }]], expected: [[201, { id: 1, title: 'Read', done: false }], [200, { id: 1, title: 'Read', done: false }], 404] },
      ],
      hints: ['If you used a ModelSerializer with `max_length=100`, most validation already works — check that you raise on invalid data.', 'Use `get_object_or_404(Task, pk=pk)` in a `task_detail(request, pk)` view and register `path("api/tasks/<int:pk>/", task_detail)`.'],
      reveal: B2,
    },
    {
      id: 'b3',
      title: 'Update and delete',
      part: 'backend',
      brief: 'On the detail URL, **PATCH** updates only the fields sent (e.g. `{"done": true}`) and returns the task; **DELETE** removes it and returns **204**. Unknown ids stay **404**.',
      tests: [
        { name: 'patch done', args: [[req('POST', '/api/tasks/', { title: 'Ship' }), req('PATCH', '/api/tasks/1/', { done: true })]], expected: [[201, { id: 1, title: 'Ship', done: false }], [200, { id: 1, title: 'Ship', done: true }]] },
        { name: 'patch keeps title', args: [[req('POST', '/api/tasks/', { title: 'Keep me' }), req('PATCH', '/api/tasks/1/', { done: true }), req('GET', '/api/tasks/1/')]], expected: [[201, { id: 1, title: 'Keep me', done: false }], [200, { id: 1, title: 'Keep me', done: true }], [200, { id: 1, title: 'Keep me', done: true }]] },
        {
          name: 'delete',
          args: [[req('POST', '/api/tasks/', { title: 'Temp' }), { ...req('DELETE', '/api/tasks/1/'), only: 'status' }, req('GET', '/api/tasks/'), { ...req('PATCH', '/api/tasks/1/', { done: true }), only: 'status' }]],
          expected: [[201, { id: 1, title: 'Temp', done: false }], 204, [200, { results: [] }], 404],
        },
      ],
      hints: ['Pass `partial=True` to the serializer so missing fields are not "required".', '`TaskSerializer(task, data=request.data, partial=True)` → `is_valid(raise_exception=True)` → `ser.save()`. For DELETE call `task.delete()` and return `JsonResponse({}, status=204)`.'],
      reveal: B3,
    },
    {
      id: 'f4',
      title: 'Show the tasks',
      part: 'frontend',
      brief: 'In `App`, fetch `/api/tasks/` when the component mounts and render each title in an `<li>`. Show `No tasks yet` for an empty list. (Use `useEffect` with an empty dependency array.)',
      seed: [req('POST', '/api/tasks/', JSON.stringify({ title: 'Buy milk' })), req('POST', '/api/tasks/', JSON.stringify({ title: 'Write code' }))],
      reactTests: [{ name: 'renders the tasks from the API', steps: [{ expectCount: 'li', n: 2 }, { expectText: 'Buy milk' }, { expectText: 'Write code' }] }],
      hints: ['Keep the tasks in state (start with `null` for "loading"), and set them from `data.results`.', '`useEffect(() => { fetch("/api/tasks/").then(r => r.json()).then(d => setTasks(d.results)); }, []);` then `tasks.map(t => <li key={t.id}>{t.title}</li>)`.'],
      reveal: F4,
    },
    {
      id: 'f5',
      title: 'Add and complete tasks',
      part: 'frontend',
      brief:
        'Add an input with placeholder `New task` and a button `Add` that POSTs the title and appends the new task. Each `<li>` gets a checkbox that PATCHes `done`. Show `X of Y done`. Use the button\'s `onClick` (form submission is disabled in the sandbox).',
      reactTests: [
        {
          name: 'add, then complete',
          steps: [
            { type: 'input[placeholder="New task"]', value: 'Ship it' },
            { click: 'text=Add' },
            { expectText: 'Ship it' },
            { expectText: '0 of 1 done' },
            { click: 'li input[type=checkbox]' },
            { expectText: '1 of 1 done' },
          ],
        },
      ],
      hints: ['Send JSON: `fetch(url, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ title }) })`.', 'After POST, append the returned task with a functional update `setTasks(ts => [...ts, task])`; after PATCH, replace the matching task by id.'],
      reveal: F5,
    },
    {
      id: 'b6',
      title: 'Token authentication',
      part: 'backend',
      brief:
        'Create a user `demo` / `demo123` (`auth.create_user`). Add **POST** `api/login/` returning `{"token": ...}` (a JWT via `auth.jwt_encode`) or **401** for wrong credentials. Every task endpoint must now require `Authorization: Bearer <token>` and return **401** without a valid one.',
      tests: [
        { name: 'protected', args: [[{ ...req('GET', '/api/tasks/'), only: 'status' }]], expected: [401] },
        { name: 'bad login', args: [[{ ...req('POST', '/api/login/', { username: 'demo', password: 'nope' }), only: 'status' }]], expected: [401] },
        {
          name: 'login then use the token',
          args: [[{ ...req('POST', '/api/login/', { username: 'demo', password: 'demo123' }), only: 'status' }, { ...req('POST', '/api/tasks/', { title: 'Secret' }), auth: true }, { ...req('GET', '/api/tasks/'), auth: true }]],
          expected: [200, [201, { id: 1, title: 'Secret', done: false }], [200, { results: [{ id: 1, title: 'Secret', done: false }] }]],
        },
        { name: 'forged token', args: [[{ ...req('GET', '/api/tasks/', undefined, { Authorization: 'Bearer abc.def.ghi' }), only: 'status' }]], expected: [401] },
      ],
      hints: ['`auth.authenticate(username, password)` returns the user or None. Sign `{"sub": user.pk}` with a constant secret.', 'Write `require_user(request)` that reads `request.headers.get("authorization")`, checks the `Bearer ` prefix, calls `auth.jwt_decode(token, SECRET)` and raises `NotAuthenticated` on failure; call it first in both task views.'],
      reveal: B6,
    },
    {
      id: 'f7',
      title: 'Log in from the UI',
      part: 'frontend',
      brief:
        'Before showing tasks, render a login screen: inputs with placeholders `Username` and `Password` and a `Log in` button. On success keep the token in state and send `Authorization: Bearer <token>` on every request; on failure show `Invalid credentials`.',
      reactTests: [
        { name: 'wrong password', steps: [{ type: 'input[placeholder="Username"]', value: 'demo' }, { type: 'input[placeholder="Password"]', value: 'wrong' }, { click: 'text=Log in' }, { expectText: 'Invalid credentials' }] },
        {
          name: 'log in and add a task',
          steps: [
            { type: 'input[placeholder="Username"]', value: 'demo' },
            { type: 'input[placeholder="Password"]', value: 'demo123' },
            { click: 'text=Log in' },
            { expectText: '0 of 0 done' },
            { type: 'input[placeholder="New task"]', value: 'Plan launch' },
            { click: 'text=Add' },
            { expectText: 'Plan launch' },
          ],
        },
      ],
      hints: ['Keep `token` in state; render the login screen while it is null, and load tasks in an effect that depends on `[token]`.', 'Build headers in one place: `{ "Content-Type": "application/json", Authorization: "Bearer " + token }` and use them for GET, POST and PATCH.'],
      reveal: F7,
    },
  ],
};

export default tm;
