import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, clampInt } from '@/content/lib/frontend-hooks';
import { nTreePanel, type NTreeNode } from '@/engine/layout';

const code = `
const Header = memo(function Header({ title }) { /* ... */ });
const Chart  = memo(function Chart({ options }) { /* ... */ });
const Gauge  = memo(function Gauge({ options }) { /* ... */ });
const Footer = memo(function Footer({ onHelp }) { /* ... */ });
const Notes  = memo(function Notes({ onSave }) { /* ... */ });
function Sidebar() { /* no memo */ }

const GAUGE_OPTIONS = { max: 100 };

function App() {
  const [tick, setTick] = useState(0);                       //@state
  const onSave = useCallback(() => save(), []);
  return (
    <div onClick={() => setTick(tick + 1)}>
      <Header title="Dashboard" />                           //@header
      <Sidebar />                                            //@sidebar
      <Chart options={{ max: 100 }} />                       //@chart
      <Gauge options={GAUGE_OPTIONS} />                      //@gauge
      <Footer onHelp={() => openHelp()} />                   //@footer
      <Notes onSave={onSave} />                              //@notes
    </div>
  );
}
`;

interface In {
  memo: string;
  clicks: number;
}

interface Kid {
  id: string;
  label: string;
  memo: boolean;
  /** why the props differ on every render, if they do */
  unstable?: string;
  /** why the props stay equal */
  stable?: string;
}

const KIDS: Kid[] = [
  { id: 'Header', label: 'Header', memo: true, stable: 'title is the same string' },
  { id: 'Sidebar', label: 'Sidebar', memo: false },
  { id: 'Chart', label: 'Chart', memo: true, unstable: 'options={{ ... }} is a new object' },
  { id: 'Gauge', label: 'Gauge', memo: true, stable: 'options is the same module constant' },
  { id: 'Footer', label: 'Footer', memo: true, unstable: 'onHelp={() => ...} is a new function' },
  { id: 'Notes', label: 'Notes', memo: true, stable: 'onSave is the same useCallback result' },
];

const viz: VizDef<In> = {
  id: 'react-memo',
  title: 'Who re-renders when the parent does?',
  code,
  language: 'javascript',
  inputs: [
    { key: 'memo', label: 'React.memo', kind: 'select', default: 'on', options: ['on', 'off'] },
    { key: 'clicks', label: 'Parent re-renders', kind: 'number', default: 2, help: '1 to 4' },
  ],
  presets: [
    { label: 'memo on', input: { memo: 'on', clicks: 2 } },
    { label: 'memo off', input: { memo: 'off', clicks: 1 } },
    { label: 'Four clicks', input: { memo: 'on', clicks: 4 } },
  ],
  run({ memo, clicks: rawClicks }) {
    const r = new HookRecorder(code);
    const useMemoOn = memo !== 'off';
    const clicks = clampInt(rawClicks, 1, 4, 2);
    const counts: Record<string, number> = { App: 1 };
    KIDS.forEach((k) => (counts[k.id] = 1));
    const tones: Record<string, Tone> = {};
    const tree = (): ReturnType<typeof nTreePanel> => {
      const nodes: Record<string, NTreeNode> = {
        App: { id: 'App', label: 'App', children: KIDS.map((k) => k.id), tone: tones.App ?? 'default', badge: `×${counts.App}` },
      };
      KIDS.forEach((k) => (nodes[k.id] = { id: k.id, label: k.label + (k.memo && useMemoOn ? ' (memo)' : ''), children: [], tone: tones[k.id] ?? 'default', badge: `×${counts[k.id]}` }));
      return nTreePanel(nodes, 'App', { title: 'Component tree (×n = times rendered)', gapX: 78 });
    };
    const note = (text: string, tone: Tone = 'compare') => ({ type: 'note' as const, text, tone });

    KIDS.forEach((k) => (tones[k.id] = 'active'));
    tones.App = 'active';
    r.step('state', 'Mount: every component renders once', [tree(), note('First render always renders the whole tree.')], { App: 1 });

    for (let c = 1; c <= clicks; c++) {
      counts.App += 1;
      tones.App = 'swap';
      KIDS.forEach((k) => (tones[k.id] = 'default'));
      r.step('state', `Click ${c}: setTick re-renders App, children are still undecided`, [tree(), note('A parent render re-renders its children unless they are memoized and their props are equal.')], { App: counts.App });
      for (const k of KIDS) {
        const rerender = !(useMemoOn && k.memo) || !!k.unstable;
        const at = k.id.toLowerCase();
        if (rerender) {
          counts[k.id] += 1;
          tones[k.id] = 'active';
          const why = !k.memo ? 'no memo, always follows the parent' : !useMemoOn ? 'memo is off in this run' : k.unstable!;
          r.step(at, `${k.label} renders: ${why}`, [tree(), note(`${k.label} rendered again (×${counts[k.id]}).`, 'active')], { [k.id]: counts[k.id] });
        } else {
          tones[k.id] = 'muted';
          r.step(at, `${k.label} skipped: ${k.stable}`, [tree(), note(`${k.label} stays at ×${counts[k.id]}: props are equal by Object.is.`, 'done')], { [k.id]: counts[k.id] });
        }
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    r.step('state', `After ${clicks} click${clicks > 1 ? 's' : ''}: ${total} renders in total`, [tree()], { total });
    return { frames: r.frames, result: { ...counts } };
  },
  reference({ memo, clicks }) {
    const c = clampInt(clicks, 1, 4, 2);
    const on = memo !== 'off';
    return {
      App: 1 + c,
      Header: on ? 1 : 1 + c,
      Sidebar: 1 + c,
      Chart: 1 + c,
      Gauge: on ? 1 : 1 + c,
      Footer: 1 + c,
      Notes: on ? 1 : 1 + c,
    };
  },
};

const unit: Unit = {
  id: 'react-memo',
  hook: 'React.memo is the first answer to "how do you stop unnecessary re-renders", and the follow-up is always why it sometimes does nothing. The answer is referential equality.',
  predict: {
    prompt: 'Child is wrapped in memo. The parent re-renders after a click on the button. Does Child render again?',
    code: `const Child = memo(function Child({ data }) {
  return <p>{data.a}</p>;
});

function Parent() {
  const [n, setN] = useState(0);
  return (
    <div>
      <button onClick={() => setN(n + 1)}>{n}</button>
      <Child data={{ a: 1 }} />
    </div>
  );
}`,
    codeLang: 'jsx',
    options: ['No, memo sees the same contents', 'Yes, { a: 1 } is a new object on every render, so the shallow comparison fails', 'No, Child has no state of its own', 'Only on the first click'],
    answer: 1,
    explain: 'memo compares each prop with Object.is. Two objects with equal contents are still different references, so the inline literal defeats memo. Hoist it, or wrap it in useMemo.',
  },
  viz,
  deeper: {
    points: [
      'By default a component re-renders whenever its parent does, even if its props are identical.',
      'memo(Component) skips the render when every prop is equal by Object.is (shallow). Primitives compare by value, objects, arrays and functions by reference.',
      'Stable references come from module-level constants, useMemo for objects/arrays and useCallback for functions.',
      '`children` is a prop too: JSX like <Box><Item /></Box> creates a new element every parent render, which defeats memo on Box.',
      'Rendering is cheap until it is not. Profile first (React DevTools "why did this render"), then memoize the expensive subtree, not everything.',
    ],
    pitfalls: ['Passing an inline object, array or arrow function to a memoized child', 'Memoizing a component whose props change on every render anyway', 'Expecting memo to stop re-renders caused by the component\'s own state or context'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Page',
    statement: 'Badge counts its own renders. Make it skip re-renders when the page ticks: memoize Badge and give it the same style object every time. Badge must read "Badge renders: 1" no matter how often Tick is clicked.',
    signature: 'function Page() {',
    solution: `const Badge = @@memo@@(function Badge({ style }) {
  const renders = useRef(0);
  renders.current @@+= 1@@;
  return <span>Badge renders: {renders.current}</span>;
});

function Page() {
  const [tick, setTick] = useState(0);
  const style = @@useMemo@@(() => ({ color: 'teal' }), @@[]@@);
  return (
    <div>
      <p>Tick: {tick}</p>
      <Badge style={style} />
      <button onClick={() => setTick(tick + 1)}>Tick</button>
    </div>
  );
}`,
    skeleton: `const Badge = function Badge({ style }) {
  const renders = useRef(0);
  // TODO: count this render
  return <span>Badge renders: {renders.current}</span>;
};
// TODO: skip re-renders when the props are equal

function Page() {
  const [tick, setTick] = useState(0);
  // TODO: keep style the same object on every render
  const style = { color: 'teal' };
  return (
    <div>
      <p>Tick: {tick}</p>
      <Badge style={style} />
      <button onClick={() => setTick(tick + 1)}>Tick</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'renders once at first', steps: [{ expectText: 'Badge renders: 1' }, { expectText: 'Tick: 0' }] },
      { name: 'ticking does not re-render Badge', steps: [{ click: 'text=Tick' }, { expectText: 'Tick: 1' }, { expectText: 'Badge renders: 1' }] },
      { name: 'still once after many ticks', steps: [{ click: 'text=Tick' }, { click: 'text=Tick' }, { click: 'text=Tick' }, { expectText: 'Tick: 3' }, { expectText: 'Badge renders: 1' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Editor',
    statement: 'Toolbar is memoized, yet toggling the theme re-renders it. Typing may legitimately re-render it (the save callback depends on the draft), but the theme should not.',
    buggy: `const Toolbar = memo(function Toolbar({ onSave }) {
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div>
      <button onClick={onSave}>Save</button>
      <span>Toolbar renders: {renders.current}</span>
    </div>
  );
});

function Editor() {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('nothing');
  const [dark, setDark] = useState(false);
  const onSave = () => setSaved(draft);
  return (
    <div className={dark ? 'dark' : 'light'}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={() => setDark(!dark)}>Theme</button>
      <p>Saved: {saved}</p>
      <Toolbar onSave={onSave} />
    </div>
  );
}`,
    fixed: `const Toolbar = memo(function Toolbar({ onSave }) {
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div>
      <button onClick={onSave}>Save</button>
      <span>Toolbar renders: {renders.current}</span>
    </div>
  );
});

function Editor() {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('nothing');
  const [dark, setDark] = useState(false);
  const onSave = useCallback(() => setSaved(draft), [draft]);
  return (
    <div className={dark ? 'dark' : 'light'}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={() => setDark(!dark)}>Theme</button>
      <p>Saved: {saved}</p>
      <Toolbar onSave={onSave} />
    </div>
  );
}`,
    reactTests: [
      { name: 'rendered once at first', steps: [{ expectText: 'Toolbar renders: 1' }] },
      { name: 'theme does not touch Toolbar', steps: [{ click: 'text=Theme' }, { click: 'text=Theme' }, { expectText: 'Toolbar renders: 1' }] },
      { name: 'typing changes the callback, so Toolbar updates', steps: [{ type: 'input', value: 'hi' }, { expectText: 'Toolbar renders: 2' }] },
      { name: 'save still uses the latest draft', steps: [{ type: 'input', value: 'hi' }, { click: 'text=Save' }, { expectText: 'Saved: hi' }, { expectText: 'Toolbar renders: 2' }] },
    ],
    bugType: 'memo defeated by inline function',
    hint: 'What does memo compare, and is `onSave` the same function after a theme change?',
    explanation: '`onSave` was recreated on every render, so memo saw a new prop each time. useCallback with [draft] keeps the same function until the draft really changes, which is exactly when Toolbar needs the new closure.',
  },
  boss: {
    title: 'Todo board with surgical renders',
    statement:
      'Build `TodoBoard` with three todos (Write, Test, Ship; all open) in state. It shows `Done: n` and a `<ul>` of memoized `Row` components. A row renders `<li>` as `Write [ ] renders: 1` (the text, then `[x]` when done or `[ ]` when open, then how many times this row rendered, counted with a ref) followed by a "Toggle" button. Toggling a todo must re-render only that row: use a stable callback and update the list without recreating unchanged todos.',
    language: 'jsx',
    fnName: 'TodoBoard',
    starter: `function TodoBoard() {
  // your code here
  return null;
}
`,
    solution: `const INITIAL = [
  { id: 1, text: 'Write', done: false },
  { id: 2, text: 'Test', done: false },
  { id: 3, text: 'Ship', done: false },
];

const Row = memo(function Row({ todo, onToggle }) {
  const renders = useRef(0);
  renders.current += 1;
  return (
    <li>
      {todo.text} [{todo.done ? 'x' : ' '}] renders: {renders.current}
      <button onClick={() => onToggle(todo.id)}>Toggle</button>
    </li>
  );
});

function TodoBoard() {
  const [todos, setTodos] = useState(INITIAL);
  const onToggle = useCallback((id) => {
    setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);
  return (
    <div>
      <p>Done: {todos.filter((t) => t.done).length}</p>
      <ul>
        {todos.map((t) => (
          <Row key={t.id} todo={t} onToggle={onToggle} />
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'three rows rendered once', steps: [{ expectCount: 'li', n: 3 }, { expectText: 'Write [ ] renders: 1', in: 'li:nth-child(1)' }, { expectText: 'Test [ ] renders: 1', in: 'li:nth-child(2)' }, { expectText: 'Ship [ ] renders: 1', in: 'li:nth-child(3)' }, { expectText: 'Done: 0' }] },
      {
        name: 'toggle re-renders only its row',
        steps: [
          { click: 'li:nth-child(2) button' },
          { expectText: 'Test [x] renders: 2', in: 'li:nth-child(2)' },
          { expectText: 'renders: 1', in: 'li:nth-child(1)' },
          { expectText: 'renders: 1', in: 'li:nth-child(3)' },
          { expectText: 'Done: 1' },
        ],
      },
      { name: 'toggle back', steps: [{ click: 'li:nth-child(2) button' }, { click: 'li:nth-child(2) button' }, { expectText: 'Test [ ] renders: 3', in: 'li:nth-child(2)' }, { expectText: 'Done: 0' }] },
      { name: 'other rows stay untouched', steps: [{ click: 'li:nth-child(1) button' }, { click: 'li:nth-child(3) button' }, { expectText: 'renders: 2', in: 'li:nth-child(1)' }, { expectText: 'renders: 1', in: 'li:nth-child(2)' }, { expectText: 'renders: 2', in: 'li:nth-child(3)' }, { expectText: 'Done: 2' }] },
    ],
    hints: ['For a row to be skipped, every prop it receives must be the same reference as last time. Which two props does Row get, and what could change them?', 'Wrap Row in memo. Create onToggle with useCallback and an empty dependency array, using setTodos(list => ...) so it never needs `todos`. In map, return the original todo object for every id that did not change.'],
    combines: ['hook-usememo', 'hook-useref'],
  },
  quiz: [
    {
      prompt: 'Which prop defeats React.memo on a child on every parent render?',
      options: ['A string literal', 'A number from state', 'An arrow function written inline in the JSX', 'A constant imported from another module'],
      answer: 2,
      explain: 'An inline arrow function is a new function each render. The other three keep the same value or reference.',
    },
  ],
};

export default unit;
