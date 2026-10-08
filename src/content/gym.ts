// Syntax Gym snippets: short, idiomatic code to retype for muscle memory.
// Keep each under ~12 lines. Indentation is auto-inserted after Enter.

export interface GymSnippet {
  id: string;
  lang: 'python' | 'javascript' | 'typescript' | 'jsx';
  group: string;
  title: string;
  code: string;
}

const py = (id: string, group: string, title: string, code: string): GymSnippet => ({ id, lang: 'python', group, title, code: code.trim() });
const js = (id: string, group: string, title: string, code: string): GymSnippet => ({ id, lang: 'javascript', group, title, code: code.trim() });
const ts = (id: string, group: string, title: string, code: string): GymSnippet => ({ id, lang: 'typescript', group, title, code: code.trim() });
const rx = (id: string, group: string, title: string, code: string): GymSnippet => ({ id, lang: 'jsx', group, title, code: code.trim() });

export const GYM: GymSnippet[] = [
  py('py-func', 'Python basics', 'Function with default arg', `
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"
`),
  py('py-loop', 'Python basics', 'enumerate and zip', `
for i, (a, b) in enumerate(zip(xs, ys)):
    print(i, a + b)
`),
  py('py-comp', 'Python basics', 'Comprehensions', `
squares = [x * x for x in nums if x % 2 == 0]
index = {name: i for i, name in enumerate(names)}
unique = {c.lower() for c in text if c.isalpha()}
`),
  py('py-dict', 'Python basics', 'Dict counting', `
counts = {}
for word in words:
    counts[word] = counts.get(word, 0) + 1
best = max(counts, key=counts.get)
`),
  py('py-class', 'Python basics', 'Class with dunder methods', `
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Point({self.x}, {self.y})"
`),
  py('py-try', 'Python basics', 'try / except / finally', `
try:
    value = int(raw)
except ValueError as e:
    value = 0
finally:
    done = True
`),
  py('py-sort', 'Python basics', 'Sorting with keys', `
people.sort(key=lambda p: (-p.age, p.name))
top3 = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:3]
`),
  py('py-collections', 'Python for interviews', 'collections toolkit', `
from collections import Counter, defaultdict, deque

freq = Counter(s)
graph = defaultdict(list)
queue = deque([start])
node = queue.popleft()
`),
  py('py-heapq', 'Python for interviews', 'heapq', `
import heapq

heap = []
heapq.heappush(heap, (dist, node))
d, u = heapq.heappop(heap)
smallest = heapq.nsmallest(k, nums)
`),
  py('py-bisect', 'Python for interviews', 'bisect', `
from bisect import bisect_left, insort

i = bisect_left(sorted_nums, target)
found = i < len(sorted_nums) and sorted_nums[i] == target
insort(sorted_nums, 7)
`),
  py('py-grid', 'Python for interviews', 'Grid neighbours', `
for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
    nr, nc = r + dr, c + dc
    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
        stack.append((nr, nc))
`),
  py('py-memo', 'Python for interviews', 'Memoized recursion', `
from functools import lru_cache

@lru_cache(maxsize=None)
def ways(n):
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)
`),
  py('py-decorator', 'Python advanced', 'Decorator', `
import functools

def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print("calling", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper
`),
  py('py-generator', 'Python advanced', 'Generator', `
def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]
`),
  py('py-ctx', 'Python advanced', 'Context manager', `
from contextlib import contextmanager

@contextmanager
def timer(label):
    start = time.perf_counter()
    yield
    print(label, time.perf_counter() - start)
`),
  py('py-dataclass', 'Python advanced', 'dataclass', `
from dataclasses import dataclass, field

@dataclass
class Order:
    id: int
    items: list = field(default_factory=list)
    paid: bool = False
`),
  py('py-async', 'Python advanced', 'asyncio.gather', `
import asyncio

async def main():
    results = await asyncio.gather(fetch(1), fetch(2))
    return results
`),
  py('py-django-view', 'Backend', 'Django-style view', `
def article_detail(request, pk):
    article = Article.objects.select_related("author").get(pk=pk)
    return JsonResponse({"title": article.title, "author": article.author.name})
`),
  py('py-django-model', 'Backend', 'Django-style model', `
class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    body = models.TextField()
    created = models.DateTimeField(auto_now_add=True)
`),
  js('js-arrow', 'JavaScript basics', 'Arrow functions & array methods', `
const total = items
  .filter((it) => it.inStock)
  .map((it) => it.price * it.qty)
  .reduce((sum, x) => sum + x, 0);
`),
  js('js-destructure', 'JavaScript basics', 'Destructuring & spread', `
const { id, name = "anon", ...rest } = user;
const [first, , third] = list;
const merged = { ...defaults, ...options, id };
`),
  js('js-optional', 'JavaScript basics', 'Optional chaining & nullish', `
const city = user?.address?.city ?? "unknown";
const count = data.items?.length || 0;
`),
  js('js-class', 'JavaScript basics', 'Class', `
class Stack {
  #items = [];
  push(x) { this.#items.push(x); }
  pop() { return this.#items.pop(); }
  get size() { return this.#items.length; }
}
`),
  js('js-closure', 'JavaScript core', 'Closure counter', `
function makeCounter() {
  let count = 0;
  return () => ++count;
}
const next = makeCounter();
`),
  js('js-async', 'JavaScript core', 'async / await with try', `
async function loadUser(id) {
  try {
    const res = await fetch(\`/api/users/\${id}\`);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}
`),
  js('js-promise-all', 'JavaScript core', 'Promise.all', `
const [posts, comments] = await Promise.all([
  getPosts(userId),
  getComments(userId),
]);
`),
  js('js-debounce', 'JavaScript core', 'Debounce', `
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
`),
  js('js-map-set', 'JavaScript core', 'Map and Set', `
const seen = new Set();
const byId = new Map();
for (const item of items) {
  if (seen.has(item.id)) continue;
  seen.add(item.id);
  byId.set(item.id, item);
}
`),
  ts('ts-interface', 'TypeScript', 'Interfaces & unions', `
interface User {
  id: number;
  name: string;
  role: "admin" | "member";
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
`),
  ts('ts-generic', 'TypeScript', 'Generic function', `
function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) (out[key(it)] ??= []).push(it);
  return out;
}
`),
  rx('rx-counter', 'React', 'useState counter', `
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>
      Clicked {count} times
    </button>
  );
}
`),
  rx('rx-effect', 'React', 'useEffect with cleanup', `
useEffect(() => {
  const id = setInterval(() => setTick((t) => t + 1), 1000);
  return () => clearInterval(id);
}, []);
`),
  rx('rx-list', 'React', 'List with keys', `
<ul>
  {todos.map((todo) => (
    <li key={todo.id}>{todo.title}</li>
  ))}
</ul>
`),
  rx('rx-input', 'React', 'Controlled input', `
const [query, setQuery] = useState("");
return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
`),
  rx('rx-hook', 'React', 'Custom hook', `
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle];
}
`),
  rx('rx-context', 'React', 'Context', `
const ThemeContext = createContext("light");

function Toolbar() {
  const theme = useContext(ThemeContext);
  return <div className={theme}>Toolbar</div>;
}
`),
];
