import type { ListItem, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder } from '@/content/lib/frontend-hooks';

const code = `
function reducer(state, action) {                                       //@reducer
  switch (action.type) {
    case 'add':
      return { nextId: state.nextId + 1, todos: [                       //@add
        ...state.todos, { id: state.nextId, text: action.text, done: false }] };
    case 'toggle':
      return { ...state, todos: state.todos.map(t =>                    //@toggle
        t.id === action.id ? { ...t, done: !t.done } : t) };
    case 'remove':
      return { ...state, todos: state.todos.filter(t => t.id !== action.id) };   //@remove
    case 'clear':
      return { ...state, todos: state.todos.filter(t => !t.done) };     //@clear
    default:
      return state;                                                     //@default
  }
}

const [state, dispatch] = useReducer(reducer, { todos: [], nextId: 1 });   //@use
`;

interface Todo {
  id: number;
  text: string;
  done: boolean;
}
interface State {
  nextId: number;
  todos: Todo[];
}
interface Action {
  type: string;
  text?: string;
  id?: number;
}
interface In {
  actions: string[];
}

function parseAction(raw: string): Action {
  const s = raw.trim();
  const i = s.indexOf(':');
  const type = (i < 0 ? s : s.slice(0, i)).trim().toLowerCase();
  const arg = i < 0 ? '' : s.slice(i + 1).trim();
  if (type === 'add') return { type, text: arg || 'item' };
  if (type === 'toggle' || type === 'remove') return { type, id: Number(arg) };
  return { type };
}

function reduce(state: State, a: Action): State {
  switch (a.type) {
    case 'add':
      return { nextId: state.nextId + 1, todos: [...state.todos, { id: state.nextId, text: a.text ?? 'item', done: false }] };
    case 'toggle':
      return { ...state, todos: state.todos.map((t) => (t.id === a.id ? { ...t, done: !t.done } : t)) };
    case 'remove':
      return { ...state, todos: state.todos.filter((t) => t.id !== a.id) };
    case 'clear':
      return { ...state, todos: state.todos.filter((t) => !t.done) };
    default:
      return state;
  }
}

const label = (a: Action) => (a.type === 'add' ? `{ type: 'add', text: '${a.text}' }` : a.id !== undefined ? `{ type: '${a.type}', id: ${a.id} }` : `{ type: '${a.type}' }`);

const viz: VizDef<In> = {
  id: 'hook-usereducer',
  title: 'dispatch → reducer → new state',
  code,
  language: 'javascript',
  inputs: [{ key: 'actions', label: 'Dispatches', kind: 'strings', default: ['add:Milk', 'add:Eggs', 'toggle:1', 'add:Tea', 'remove:2', 'ping', 'clear'], maxItems: 10, help: 'add:text, toggle:id, remove:id, clear. Anything else is an unknown action.' }],
  presets: [
    { label: 'Build a list', input: { actions: ['add:Milk', 'add:Eggs', 'toggle:1', 'add:Tea', 'remove:2', 'ping', 'clear'] } },
    { label: 'Unknown action', input: { actions: ['add:Milk', 'ping', 'ping'] } },
    { label: 'Clear done', input: { actions: ['add:A', 'add:B', 'toggle:1', 'toggle:2', 'clear'] } },
  ],
  run({ actions: raw }) {
    const r = new HookRecorder(code);
    const actions = raw.map(parseAction);
    let state: State = { nextId: 1, todos: [] };
    let version = 0;
    let renders = 1;
    const log: { text: string; tone?: Tone }[] = [];
    const panels = (hot?: number, same?: boolean) => {
      const items: ListItem[] = state.todos.map((t) => ({ label: `#${t.id} ${t.text}`, sub: t.done ? 'done' : 'open', tone: t.id === hot ? 'new' : t.done ? 'done' : 'default' }));
      return [
        { type: 'log' as const, title: 'Dispatch log', lines: log.map((l) => ({ ...l })) },
        { type: 'list' as const, title: 'state.todos', items, orientation: 'vertical' as const, emptyText: 'empty list' },
        {
          type: 'kv' as const,
          title: 'React bookkeeping',
          entries: [
            { k: 'state object', v: `state#${version}` },
            { k: 'renders', v: renders },
            ...(same === undefined ? [] : [{ k: 'prev === next', v: same, tone: same ? ('muted' as const) : ('active' as const) }]),
          ],
        },
      ];
    };
    r.step('use', 'useReducer(reducer, initial): state#0 is an empty list', panels(), { renders });
    actions.forEach((a) => {
      log.push({ text: `dispatch(${label(a)})`, tone: 'compare' });
      r.step('use', `dispatch(${label(a)}) hands the action to the reducer`, panels(), { action: a.type });
      const next = reduce(state, a);
      const same = next === state;
      const hot = a.type === 'add' ? state.nextId : a.type === 'toggle' ? a.id : undefined;
      state = next;
      if (!same) {
        version += 1;
        renders += 1;
      }
      const at = ['add', 'toggle', 'remove', 'clear'].includes(a.type) ? a.type : 'default';
      r.step(at, same ? 'Same object returned: React sees no change and skips the render' : `Reducer returned a NEW state object (state#${version}) → re-render`, panels(hot, same), { renders });
    });
    r.step('reducer', `Final: ${state.todos.length} todos after ${renders - 1} state changes`, panels(), { renders });
    return { frames: r.frames, result: state.todos };
  },
  reference({ actions }) {
    // independent version: mutate a private copy instead of building new objects
    const todos: Todo[] = [];
    let nextId = 1;
    for (const raw of actions) {
      const a = parseAction(raw);
      if (a.type === 'add') todos.push({ id: nextId++, text: a.text ?? 'item', done: false });
      else if (a.type === 'toggle') {
        const t = todos.find((x) => x.id === a.id);
        if (t) t.done = !t.done;
      } else if (a.type === 'remove') {
        const k = todos.findIndex((x) => x.id === a.id);
        if (k >= 0) todos.splice(k, 1);
      } else if (a.type === 'clear') {
        for (let k = todos.length - 1; k >= 0; k--) if (todos[k].done) todos.splice(k, 1);
      }
    }
    return todos;
  },
};

const unit: Unit = {
  id: 'hook-usereducer',
  hook: 'useReducer shows up whenever state has several related fields or many ways to change. Interviewers check that you keep reducers pure and immutable, and can explain when you would pick it over useState.',
  predict: {
    prompt: 'The user clicks "Add". What happens on screen?',
    code: `function reducer(items, action) {
  if (action.type === 'add') {
    items.push(action.item);
    return items;
  }
  return items;
}
// const [items, dispatch] = useReducer(reducer, []);
// <button onClick={() => dispatch({ type: 'add', item: 'milk' })}>Add</button>`,
    codeLang: 'jsx',
    options: ['The list shows "milk"', 'Nothing changes: the same array comes back, so React bails out', 'It throws because the reducer is impure', 'The list shows "milk" twice'],
    answer: 1,
    explain: 'The reducer mutated the old array and returned the very same reference. React compares old and new state with Object.is, sees no change and does not commit a new screen.',
  },
  viz,
  deeper: {
    points: [
      'A reducer is a pure function (state, action) => newState. Same inputs, same output, no side effects, no mutation.',
      'dispatch(action) only describes what happened. All the logic of how state changes lives in one place that is easy to unit test.',
      'Return a new object only for the parts that changed (spread the rest). Returning the same reference means "nothing changed" and skips the render.',
      'dispatch has a stable identity, so passing it to memoized children or effect dependencies is safe, unlike inline callbacks.',
      'Pick useReducer over useState when next state depends on several fields, when many handlers update the same state, or when transitions have names ("checkout/submit").',
    ],
    pitfalls: ['Mutating state (push, splice, obj.x = ...) and returning it', 'Doing side effects (fetch, timers, random ids) inside the reducer', 'Forgetting a default case so unknown actions return undefined and wipe the state'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Cart',
    statement: 'Complete the cart with useReducer. "add" appends a new item with quantity 1, "inc" raises one item\'s quantity by 1, "clear" empties the cart. Never mutate the old array.',
    signature: 'function Cart() {',
    solution: `function cartReducer(cart, action) {
  switch (action.type) {
    case 'add':
      return @@[...cart, { name: action.name, qty: 1 }]@@;
    case 'inc':
      return cart.map((it) => (it.name === action.name ? { ...it, qty: @@it.qty + 1@@ } : it));
    case 'clear':
      return @@[]@@;
    default:
      return cart;
  }
}

function Cart() {
  const [cart, dispatch] = useReducer(@@cartReducer@@, []);
  return (
    <div>
      <button onClick={() => dispatch({ type: 'add', name: 'Tea' })}>Add tea</button>
      <button onClick={() => dispatch({ type: 'add', name: 'Jam' })}>Add jam</button>
      <button onClick={() => dispatch({ type: 'inc', name: 'Tea' })}>+1 Tea</button>
      <button onClick={() => dispatch({ type: 'clear' })}>Clear</button>
      <ul>
        {cart.map((it) => (
          <li key={it.name}>
            {it.name} x{it.qty}
          </li>
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts empty', steps: [{ expectCount: 'li', n: 0 }] },
      { name: 'add appends', steps: [{ click: 'text=Add tea' }, { click: 'text=Add jam' }, { expectCount: 'li', n: 2 }, { expectText: 'Tea x1' }, { expectText: 'Jam x1' }] },
      { name: 'inc raises one quantity', steps: [{ click: 'text=Add tea' }, { click: 'text=Add jam' }, { click: 'text=+1 Tea' }, { click: 'text=+1 Tea' }, { expectText: 'Tea x3' }, { expectText: 'Jam x1' }] },
      { name: 'clear empties', steps: [{ click: 'text=Add tea' }, { click: 'text=Clear' }, { expectCount: 'li', n: 0 }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Playlist',
    statement: 'Clicking "Add song" does nothing on screen (the count stays at 0). Fix the reducer.',
    buggy: `function playlistReducer(songs, action) {
  switch (action.type) {
    case 'add':
      songs.push('Song ' + (songs.length + 1));
      return songs;
    case 'clear':
      return [];
    default:
      return songs;
  }
}

function Playlist() {
  const [songs, dispatch] = useReducer(playlistReducer, []);
  return (
    <div>
      <p>Count: {songs.length}</p>
      <button onClick={() => dispatch({ type: 'add' })}>Add song</button>
      <button onClick={() => dispatch({ type: 'clear' })}>Clear</button>
      <ul>
        {songs.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}`,
    fixed: `function playlistReducer(songs, action) {
  switch (action.type) {
    case 'add':
      return [...songs, 'Song ' + (songs.length + 1)];
    case 'clear':
      return [];
    default:
      return songs;
  }
}

function Playlist() {
  const [songs, dispatch] = useReducer(playlistReducer, []);
  return (
    <div>
      <p>Count: {songs.length}</p>
      <button onClick={() => dispatch({ type: 'add' })}>Add song</button>
      <button onClick={() => dispatch({ type: 'clear' })}>Clear</button>
      <ul>
        {songs.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'empty at first', steps: [{ expectText: 'Count: 0' }] },
      { name: 'add shows a song', steps: [{ click: 'text=Add song' }, { expectText: 'Count: 1' }, { expectCount: 'li', n: 1 }] },
      { name: 'adds keep counting', steps: [{ click: 'text=Add song' }, { click: 'text=Add song' }, { expectText: 'Song 2' }, { expectCount: 'li', n: 2 }] },
      { name: 'clear works', steps: [{ click: 'text=Add song' }, { click: 'text=Clear' }, { expectCount: 'li', n: 0 }] },
    ],
    bugType: 'state mutation',
    hint: 'Compare the array the reducer returns with the one it received.',
    explanation: 'push() changes the existing array and the reducer returns that same reference. React treats it as "no change" and keeps the old screen. Return a new array with the spread operator instead.',
  },
  boss: {
    title: 'Reducer-driven todo list',
    statement:
      'Build `TodoApp` with useReducer and an immutable reducer. A text `<input>` and an "Add" button append a todo (trim the text, ignore blanks, clear the input). Each todo renders as `<li>` containing `<span className="text">` with "[ ] text" or "[x] text", a `<button className="toggle">Toggle</button>` and a `<button className="remove">Remove</button>`. Show `Left: n` (open todos) and a "Clear done" button that removes the finished ones.',
    language: 'jsx',
    fnName: 'TodoApp',
    starter: `function TodoApp() {
  // your code here
  return null;
}
`,
    solution: `function todoReducer(todos, action) {
  switch (action.type) {
    case 'add':
      return [...todos, { id: action.id, text: action.text, done: false }];
    case 'toggle':
      return todos.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case 'remove':
      return todos.filter((t) => t.id !== action.id);
    case 'clear':
      return todos.filter((t) => !t.done);
    default:
      return todos;
  }
}

function TodoApp() {
  const [todos, dispatch] = useReducer(todoReducer, []);
  const [text, setText] = useState('');
  const nextId = useRef(1);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    dispatch({ type: 'add', id: nextId.current++, text: t });
    setText('');
  };
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={add}>Add</button>
      <p>Left: {todos.filter((t) => !t.done).length}</p>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>
            <span className="text">{t.done ? '[x] ' : '[ ] '}{t.text}</span>
            <button className="toggle" onClick={() => dispatch({ type: 'toggle', id: t.id })}>Toggle</button>
            <button className="remove" onClick={() => dispatch({ type: 'remove', id: t.id })}>Remove</button>
          </li>
        ))}
      </ul>
      <button onClick={() => dispatch({ type: 'clear' })}>Clear done</button>
    </div>
  );
}`,
    reactTests: [
      {
        name: 'adds todos',
        steps: [{ type: 'input', value: 'Milk' }, { click: 'text=Add' }, { type: 'input', value: 'Eggs' }, { click: 'text=Add' }, { expectCount: 'li', n: 2 }, { expectText: '[ ] Milk', in: 'li:nth-child(1)' }, { expectText: 'Left: 2' }],
      },
      { name: 'ignores blank input', steps: [{ type: 'input', value: '   ' }, { click: 'text=Add' }, { expectCount: 'li', n: 0 }, { expectText: 'Left: 0' }] },
      {
        name: 'toggles back and forth',
        steps: [{ type: 'input', value: 'Milk' }, { click: 'text=Add' }, { click: 'li:nth-child(1) .toggle' }, { expectText: '[x] Milk' }, { expectText: 'Left: 0' }, { click: 'li:nth-child(1) .toggle' }, { expectText: '[ ] Milk' }, { expectText: 'Left: 1' }],
      },
      {
        name: 'removes one todo',
        steps: [{ type: 'input', value: 'Milk' }, { click: 'text=Add' }, { type: 'input', value: 'Eggs' }, { click: 'text=Add' }, { click: 'li:nth-child(1) .remove' }, { expectCount: 'li', n: 1 }, { expectNoText: 'Milk' }, { expectText: 'Eggs' }],
      },
      {
        name: 'clear done keeps open todos',
        steps: [{ type: 'input', value: 'Milk' }, { click: 'text=Add' }, { type: 'input', value: 'Eggs' }, { click: 'text=Add' }, { click: 'li:nth-child(1) .toggle' }, { click: 'text=Clear done' }, { expectCount: 'li', n: 1 }, { expectNoText: 'Milk' }, { expectText: 'Left: 1' }],
      },
    ],
    hints: ['Keep all todos in one array managed by a reducer. Which four action types do you need, and what must each one return?', 'add: [...todos, newTodo]. toggle: todos.map and copy only the matching todo with { ...t, done: !t.done }. remove / clear: todos.filter. Always end the switch with default: return todos.'],
    combines: ['hook-usestate', 'hook-useref'],
  },
  quiz: [
    {
      prompt: 'Which statement about a reducer is true?',
      options: ['It may call fetch to load data', 'It should return a new state object when something changed', 'It receives only the action', 'It can mutate state if it returns the same object'],
      answer: 1,
      explain: 'Reducers are pure: (state, action) in, new state out. Mutating and returning the same reference makes React skip the update.',
    },
  ],
};

export default unit;
