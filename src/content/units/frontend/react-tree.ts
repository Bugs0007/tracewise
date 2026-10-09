import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { ReactTest, Unit } from '@/content/types';
import { treePanel, type CNode } from '@/content/lib/frontend-react';

const code = `
function App() {
  const [todos, setTodos] = useState(initial);                     //@state
  const toggle = (id) =>                                          //@handler
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  return (
    <>
      <Header remaining={todos.filter(t => !t.done).length} />    //@header
      <List todos={todos} onToggle={toggle} />                    //@list
    </>
  );
}

function List({ todos, onToggle }) {
  return <ul>{todos.map(t => <Item key={t.id} todo={t} onToggle={onToggle} />)}</ul>;   //@items
}

function Item({ todo, onToggle }) {
  return <li onClick={() => onToggle(todo.id)}>{todo.name}</li>;    //@click
}
`;

interface In {
  names: string[];
  clicked: number;
}

interface Todo {
  id: number;
  name: string;
  done: boolean;
}

const viz: VizDef<In> = {
  id: 'react-tree',
  title: 'Props down, events up',
  code,
  language: 'javascript',
  inputs: [
    { key: 'names', label: 'Todo names', kind: 'strings', default: ['milk', 'eggs', 'tea'], maxItems: 4 },
    { key: 'clicked', label: 'Item to click (index)', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'Click first', input: { clicked: 0 } },
    { label: 'Click last', input: { clicked: 2 } },
  ],
  run({ names, clicked }) {
    if (!names.length) throw new Error('Add at least one todo name');
    if (!Number.isInteger(clicked) || clicked < 0 || clicked >= names.length) throw new Error(`Item index must be between 0 and ${names.length - 1}`);
    const r = new Recorder(code);
    let todos: Todo[] = names.map((name, i) => ({ id: i + 1, name, done: false }));
    const remaining = () => todos.filter((t) => !t.done).length;
    const root: CNode = { id: 'app', name: 'App', children: [{ id: 'header', name: 'Header' }, { id: 'list', name: 'List', children: todos.map((_t, i) => ({ id: `item${i}`, name: 'Item' })) }] };
    const tones: Record<string, Tone> = {};
    const edgeTones: Record<string, Tone> = {};
    const edgeLabels: Record<string, string> = {};
    const badges: Record<string, string> = {};
    const subs: Record<string, string> = {};
    const refresh = () => {
      subs.app = `state: ${todos.length} todos`;
      todos.forEach((t, i) => (badges[`item${i}`] = `${t.done ? '✓ ' : ''}${t.name}`));
    };
    const panels = () => [
      treePanel(root, { tones, badges, subs, edgeTones, edgeLabels, title: 'Component tree' }, { gapX: 96, gapY: 70 }),
      { type: 'array' as const, title: 'Todos held in App state', values: todos.map((t) => `${t.done ? '✓' : '·'} ${t.name}`), tones: Object.fromEntries(todos.map((t, i) => [i, t.done ? 'done' : 'default'])) as Record<number, Tone> },
    ];
    refresh();
    tones.app = 'active';
    r.step('state', 'App owns the state: one `todos` array. No other component has its own copy.', panels(), { todos: todos.length });
    edgeLabels['app>header'] = `remaining=${remaining()}`;
    edgeTones['app>header'] = 'frontier';
    tones.header = 'frontier';
    r.step('header', 'Props flow DOWN: Header receives remaining = ' + remaining(), panels(), { remaining: remaining() });
    edgeLabels['app>list'] = 'todos, onToggle';
    edgeTones['app>list'] = 'frontier';
    tones.list = 'frontier';
    r.step('list', 'List receives the todos array and the onToggle callback', panels(), {});
    todos.forEach((_t, i) => {
      edgeLabels[`list>item${i}`] = 'todo';
      edgeTones[`list>item${i}`] = 'frontier';
      tones[`item${i}`] = 'frontier';
    });
    r.step('items', `Each Item gets one todo and the same callback (${todos.length} items)`, panels(), {});
    tones.app = 'default';
    tones[`item${clicked}`] = 'active';
    r.step('click', `User clicks "${names[clicked]}". Only Item ${clicked} knows about the click.`, panels(), { clicked });
    edgeTones[`list>item${clicked}`] = 'swap';
    edgeTones['app>list'] = 'swap';
    tones.list = 'swap';
    r.step('click', `Item calls onToggle(${clicked + 1}) — the event goes UP through the callback prop`, panels(), { id: clicked + 1 });
    tones.list = 'frontier';
    tones.app = 'active';
    todos = todos.map((t, i) => (i === clicked ? { ...t, done: !t.done } : t));
    refresh();
    subs.app = 'new todos array';
    r.step('handler', 'App\'s toggle runs setTodos with a NEW array: the only place state changes', panels(), { done: todos[clicked].done });
    refresh();
    edgeLabels['app>header'] = `remaining=${remaining()}`;
    edgeTones['app>header'] = 'swap';
    tones.header = 'swap';
    tones[`item${clicked}`] = 'swap';
    edgeLabels[`list>item${clicked}`] = todos[clicked].done ? 'done=true' : 'done=false';
    r.step('header', `App re-renders; new props flow down: remaining=${remaining()} and Item ${clicked} is ${todos[clicked].done ? 'checked' : 'unchecked'}`, panels(), { remaining: remaining() });
    return { frames: r.frames, result: todos.map((t) => t.done) };
  },
  reference({ names, clicked }) {
    return names.map((_n, i) => i === clicked);
  },
};

const buggy = `const INITIAL = [
  { id: 1, name: 'Write', done: false },
  { id: 2, name: 'Test', done: false },
  { id: 3, name: 'Ship', done: false },
];

function Task({ task, onToggle }) {
  return (
    <li onClick={() => onToggle(task.id)}>
      {task.done ? '✓ ' : ''}
      {task.name}
    </li>
  );
}

function TaskBoard() {
  const [tasks, setTasks] = useState(INITIAL.map((t) => ({ ...t })));
  const toggle = (id) => {
    const task = tasks.find((t) => t.id === id);
    task.done = !task.done;
    setTasks(tasks);
  };
  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div>
      <h2>Done: {doneCount} of {tasks.length}</h2>
      <ul>
        {tasks.map((t) => (
          <Task key={t.id} task={t} onToggle={toggle} />
        ))}
      </ul>
    </div>
  );
}`;

const taskTests: ReactTest[] = [
  { name: 'starts with nothing done', steps: [{ expectText: 'Done: 0 of 3' }, { expectCount: 'li', n: 3 }] },
  { name: 'child click updates the parent summary', steps: [{ click: 'text=Test' }, { expectText: 'Done: 1 of 3' }, { expectText: '✓ Test' }] },
  { name: 'toggle twice returns to 0', steps: [{ click: 'text=Test' }, { click: 'text=✓ Test' }, { expectText: 'Done: 0 of 3' }, { click: 'text=Ship' }, { expectText: 'Done: 1 of 3' }] },
];

const unit: Unit = {
  id: 'react-tree',
  hook: 'Every React interview starts here: data flows down through props, state lives in one owner, and children talk back by calling functions. If you can say who owns each piece of state, most "why is this broken?" questions answer themselves.',
  predict: {
    prompt: 'A `TodoItem` deep in the tree needs to mark its todo as done. The todos array is state in `App`. What is the idiomatic way for the item to change it?',
    options: ['Mutate `props.todo.done = true` inside the item', 'Call a function prop (like `onToggle(id)`) that App passed down; App updates its state', 'Give the item its own copy of the todos in local state', 'Import App\'s `setTodos` directly into the item file'],
    answer: 1,
    explain: 'Props are read-only inputs. State is changed only by its owner, so the owner hands down a callback and the child calls it ("events up"). The new state then flows down again as fresh props.',
  },
  viz,
  deeper: {
    points: [
      'A React app is a tree of components. Data flows one way — from parent to child via props — which makes it traceable.',
      'State belongs to exactly one component (the owner). Others receive it as props and request changes through callbacks passed as props.',
      'Props are read-only snapshots for that render. Never assign to them or to objects inside them.',
      'State updates must create new arrays/objects (`map`, spread). React compares references, so an in-place mutation followed by `setState(sameRef)` is ignored.',
      'Derived values (like `remaining`) should be computed during render from state, not stored separately.',
    ],
    pitfalls: ['Mutating a state array/object in place and passing the same reference to the setter', 'Copying a prop into state and then wondering why updates are ignored', 'Passing the setter itself too deep instead of an intention-revealing callback'],
  },
  practice: {
    language: 'jsx',
    fnName: 'TaskBoard',
    statement: '`TaskBoard` owns the list of tasks in state. Each `Task` row is clicked to toggle done and shows a check mark when done. The heading reads `Done: n of total`.',
    signature: 'function TaskBoard() {',
    solution: `const INITIAL = [
  { id: 1, name: 'Write', done: false },
  { id: 2, name: 'Test', done: false },
  { id: 3, name: 'Ship', done: false },
];

function Task({ task, onToggle }) {
  return (
    <li
      onClick={@@() => onToggle(task.id)@@}
    >
      {task.done ? '✓ ' : ''}
      {task.name}
    </li>
  );
}

function TaskBoard() {
  const [tasks, setTasks] = @@useState(INITIAL)@@;
  const toggle = (id) => {
    @@setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))@@;
  };
  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div>
      <h2>Done: {doneCount} of {tasks.length}</h2>
      <ul>
        {tasks.map((t) => (
          <Task
            key={t.id}
            task={t}
            onToggle={@@toggle@@}
          />
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: taskTests,
  },
  debug: {
    language: 'jsx',
    fnName: 'TaskBoard',
    statement: 'Clicking a task does nothing visible: the heading and the check marks never change. Find why React ignores the update.',
    buggy,
    fixed: buggy.replace(
      `    const task = tasks.find((t) => t.id === id);
    task.done = !task.done;
    setTasks(tasks);`,
      `    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));`,
    ),
    reactTests: taskTests,
    bugType: 'mutating state in place',
    hint: '`setTasks(tasks)` passes the very same array reference that is already in state. What does React conclude?',
    explanation: 'The handler mutates the existing task and sets the same array, so React sees no change (same reference) and skips the re-render. Build a new array with a new object for the changed task.',
  },
  boss: {
    title: 'Shopping cart',
    statement:
      'Build `Cart` with state owned by `Cart` only. Rows: Tea ($3, qty 1), Cake ($5, qty 0), Jam ($4, qty 2), each as an `<li>` showing `Name x{qty}` plus a `+` button with class `inc` and a `-` button with class `dec`. `-` never goes below 0. Above the list show `Items: n` (total quantity) and `Total: $n`. Rows are a separate `Row` component that receives props and calls back.',
    language: 'jsx',
    fnName: 'Cart',
    starter: `function Cart() {
  return <ul></ul>;
}`,
    solution: `const START = [
  { id: 1, name: 'Tea', price: 3, qty: 1 },
  { id: 2, name: 'Cake', price: 5, qty: 0 },
  { id: 3, name: 'Jam', price: 4, qty: 2 },
];

function Row({ item, onChange }) {
  return (
    <li>
      {item.name} x{item.qty}
      <button className="inc" onClick={() => onChange(item.id, 1)}>+</button>
      <button className="dec" onClick={() => onChange(item.id, -1)}>-</button>
    </li>
  );
}

function Cart() {
  const [items, setItems] = useState(START);
  const change = (id, delta) =>
    setItems(items.map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i)));
  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.qty * i.price, 0);
  return (
    <div>
      <p>Items: {count}</p>
      <p>Total: \${total}</p>
      <ul>
        {items.map((i) => (
          <Row key={i.id} item={i} onChange={change} />
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'initial totals', steps: [{ expectText: 'Items: 3' }, { expectText: 'Total: $11' }, { expectCount: 'li', n: 3 }] },
      { name: 'increment a row', steps: [{ click: 'li:nth-child(2) .inc' }, { expectText: 'Cake x1' }, { expectText: 'Items: 4' }, { expectText: 'Total: $16' }] },
      { name: 'decrement stops at zero', steps: [{ click: 'li:nth-child(1) .dec' }, { click: 'li:nth-child(1) .dec' }, { expectText: 'Tea x0' }, { expectText: 'Items: 2' }, { expectText: 'Total: $8' }] },
      { name: 'rows are independent', steps: [{ click: 'li:nth-child(3) .dec' }, { click: 'li:nth-child(2) .inc' }, { expectText: 'Jam x1' }, { expectText: 'Cake x1' }, { expectText: 'Tea x1' }] },
    ],
    hints: ['Keep one `items` array in `Cart` and pass `item` and an `onChange(id, delta)` callback to each `Row`.', 'Compute `Items` and `Total` with `reduce` during render. Update with `items.map(...)` and `Math.max(0, qty + delta)`.'],
    combines: ['react-tree'],
  },
};

export default unit;
