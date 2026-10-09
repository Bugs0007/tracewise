import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { treePanel, type CNode } from '@/content/lib/frontend-react';

const code = `
function setState(owner) {                       //@set
  rendered = [];
  render(owner);
}

function render(node) {                           //@render
  rendered.push(node.name);                       //@mark
  for (const child of node.children) {            //@loop
    if (rendered.includes(child.createdBy)) {     //@check
      render(child);                              //@recurse
    } else {
      skip(child);                                //@skip
    }
  }
}
`;

interface Spec {
  tree: CNode;
  createdBy: Record<string, string>;
  trigger: string;
  note: string;
}

const SCENARIOS: Record<string, Spec> = {
  'State at the top': {
    tree: { id: 'App', name: 'App', children: [{ id: 'Header', name: 'Header' }, { id: 'Main', name: 'Main', children: [{ id: 'Feed', name: 'Feed' }, { id: 'Sidebar', name: 'Sidebar' }] }] },
    createdBy: { Header: 'App', Main: 'App', Feed: 'Main', Sidebar: 'Main' },
    trigger: 'App',
    note: 'App calls setState; it creates every element below it',
  },
  'State pushed down': {
    tree: { id: 'App', name: 'App', children: [{ id: 'Header', name: 'Header', children: [{ id: 'SearchBox', name: 'SearchBox' }] }, { id: 'Main', name: 'Main', children: [{ id: 'Feed', name: 'Feed' }, { id: 'Sidebar', name: 'Sidebar' }] }] },
    createdBy: { Header: 'App', SearchBox: 'Header', Main: 'App', Feed: 'Main', Sidebar: 'Main' },
    trigger: 'SearchBox',
    note: 'only SearchBox owns the changing state (the typed query)',
  },
  'Children passed as props': {
    tree: { id: 'App', name: 'App', children: [{ id: 'Theme', name: 'Theme', children: [{ id: 'Badge', name: 'Badge' }, { id: 'Main', name: 'Main', children: [{ id: 'Feed', name: 'Feed' }, { id: 'Sidebar', name: 'Sidebar' }] }] }] },
    createdBy: { Theme: 'App', Badge: 'Theme', Main: 'App', Feed: 'Main', Sidebar: 'Main' },
    trigger: 'Theme',
    note: 'Theme owns state, but <Main/> is passed in as children from App',
  },
};

interface In {
  scenario: string;
}

function flat(n: CNode, out: CNode[] = []): CNode[] {
  out.push(n);
  (n.children ?? []).forEach((c) => flat(c, out));
  return out;
}

const viz: VizDef<In> = {
  id: 'react-rerender',
  title: 'Who re-renders?',
  code,
  language: 'javascript',
  inputs: [{ key: 'scenario', label: 'Where does the state live?', kind: 'select', default: 'State at the top', options: Object.keys(SCENARIOS) }],
  presets: Object.keys(SCENARIOS).map((label) => ({ label, input: { scenario: label } })),
  run({ scenario }) {
    const spec = SCENARIOS[scenario];
    if (!spec) throw new Error(`Pick one of ${Object.keys(SCENARIOS).join(', ')}`);
    const r = new Recorder(code);
    const nodes = flat(spec.tree);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    const subs: Record<string, string> = {};
    const edgeTones: Record<string, Tone> = {};
    const parentOf: Record<string, string> = {};
    nodes.forEach((n) => (n.children ?? []).forEach((c) => (parentOf[c.id] = n.id)));
    for (const [id, by] of Object.entries(spec.createdBy)) if (parentOf[id] !== by) subs[id] = `element made by ${by}`;
    const rendered: string[] = [];
    const skipped: string[] = [];
    const panels = () => [
      treePanel(spec.tree, { tones, badges, subs, edgeTones, title: scenario }, { gapX: 100, gapY: 70 }),
      { type: 'array' as const, title: 'Rendered this update', values: rendered.length ? rendered : ['(nothing yet)'], hideIndex: true, tones: Object.fromEntries(rendered.map((_n, i) => [i, 'swap'])) as Record<number, Tone> },
      { type: 'array' as const, title: 'Skipped (same element, bail out)', values: skipped.length ? skipped : ['(none)'], hideIndex: true, tones: Object.fromEntries(skipped.map((_n, i) => [i, 'muted'])) as Record<number, Tone> },
    ];
    r.step('set', `All components rendered once. Now ${spec.trigger} calls setState — ${spec.note}.`, panels(), { owner: spec.trigger });
    tones[spec.trigger] = 'active';
    const mute = (n: CNode) => {
      tones[n.id] = 'muted';
      badges[n.id] = 'skipped';
      skipped.push(n.id);
      (n.children ?? []).forEach(mute);
    };
    const render = (n: CNode) => {
      r.op();
      rendered.push(n.id);
      tones[n.id] = 'swap';
      badges[n.id] = `render ${rendered.length}`;
      r.step('mark', n.id === spec.trigger ? `${n.id} re-renders: its own state changed` : `${n.id} re-renders: its parent just made a fresh <${n.id} /> element`, panels(), { rendered: rendered.length });
      for (const c of n.children ?? []) {
        const by = spec.createdBy[c.id];
        if (rendered.includes(by)) {
          edgeTones[`${n.id}>${c.id}`] = 'swap';
          r.step('check', `${c.id} was created by ${by}, which just rendered → new element object`, panels(), { child: c.id });
          render(c);
        } else {
          edgeTones[`${n.id}>${c.id}`] = 'muted';
          mute(c);
          r.step('skip', `${c.id} was created by ${by}, which did not render → same element, React skips ${c.id} and everything below`, panels(), { child: c.id });
        }
      }
    };
    render(byId[spec.trigger]);
    r.step('set', `Done: ${rendered.length} rendered (${rendered.join(', ')}), ${skipped.length} skipped`, panels(), { rendered: rendered.length, skipped: skipped.length });
    return { frames: r.frames, result: rendered };
  },
  reference({ scenario }) {
    const spec = SCENARIOS[scenario];
    const start = flat(spec.tree).find((n) => n.id === spec.trigger)!;
    const out: string[] = [];
    const stack: CNode[] = [start];
    while (stack.length) {
      const n = stack.pop()!;
      out.push(n.id);
      const kids = (n.children ?? []).filter((c) => out.includes(spec.createdBy[c.id]));
      stack.push(...kids.reverse());
    }
    return out;
  },
};

const nestedBuggy = `function Page() {
  const [tick, setTick] = useState(0);

  function Details() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button onClick={() => setOpen(!open)}>Toggle details</button>
        {open && <p>Details are open</p>}
      </div>
    );
  }

  return (
    <div>
      <button className="refresh" onClick={() => setTick(tick + 1)}>Refresh {tick}</button>
      <Details />
    </div>
  );
}`;

const nestedFixed = `function Details() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Toggle details</button>
      {open && <p>Details are open</p>}
    </div>
  );
}

function Page() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button className="refresh" onClick={() => setTick(tick + 1)}>Refresh {tick}</button>
      <Details />
    </div>
  );
}`;

const unit: Unit = {
  id: 'react-rerender',
  hook: '"Does changing this state re-render that child?" is the question behind most React performance discussions. The honest answer depends on who owns the state and who created the child element, and interviewers want that reasoning, not "use memo everywhere".',
  predict: {
    prompt: 'In `function App() { return <Theme><Main /></Theme>; }`, `Theme` holds state and renders `{children}` inside a div. When `Theme` calls `setState`, what happens to `Main`?',
    options: ['It re-renders, because every child re-renders with its parent', 'It does not re-render: App created the `<Main />` element and App did not render', 'It re-renders only if Main reads props', 'It unmounts and mounts again'],
    answer: 1,
    explain: '`<Main />` is an element object created in App\'s render. Theme re-rendering does not run App again, so Theme receives the identical `children` element and React bails out of Main. Components rendered by Theme itself would re-render.',
  },
  viz,
  deeper: {
    points: [
      'Rendering means calling your component function. A state change re-renders the owner, then (by default) every descendant whose element is created during that render.',
      'Props do not need to change for a child to re-render. A parent render creates new child elements, and React re-renders them regardless — unless you wrap the child in `memo`.',
      'Elements passed from higher up (`children`, or JSX in props) keep the same identity across the wrapper\'s re-renders, so React skips them.',
      'Moving state down into the smallest component that needs it limits the re-render blast radius with no extra API.',
      'A re-render is not a DOM update. React diffs the output and only touches the DOM for real differences; re-rendering is usually cheap, so measure before optimizing.',
    ],
    pitfalls: ['Defining a component inside another component, which gives it a new identity each render and wipes its state', 'Reaching for memo/useCallback before checking where state lives', 'Assuming a re-render means the browser repaints'],
  },
  practice: {
    language: 'jsx',
    fnName: 'App',
    statement: '`Counter` holds a count and renders whatever `children` it is given. In `App`, put `<Expensive />` inside `<Counter>` so that clicking the button never re-renders `Expensive` (it shows how many times it rendered).',
    signature: 'function App() {',
    solution: `function Expensive() {
  const renders = useRef(0);
  renders.current += 1;
  return <p>Expensive renders: {renders.current}</p>;
}

function Counter({ children }) {
  const [count, setCount] = @@useState(0)@@;
  return (
    <div>
      <button
        onClick={@@() => setCount(count + 1)@@}
      >
        Count: {count}
      </button>
      @@{children}@@
    </div>
  );
}

function App() {
  return (
    <Counter>
      @@<Expensive />@@
    </Counter>
  );
}`,
    reactTests: [
      { name: 'renders once at start', steps: [{ expectText: 'Count: 0' }, { expectText: 'Expensive renders: 1' }] },
      { name: 'counter works', steps: [{ click: 'button' }, { click: 'button' }, { expectText: 'Count: 2' }] },
      { name: 'Expensive is not re-rendered', steps: [{ click: 'button' }, { click: 'button' }, { click: 'button' }, { expectText: 'Count: 3' }, { expectText: 'Expensive renders: 1' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Page',
    statement: 'Open the details panel, then press Refresh: the panel snaps shut and loses its state. Why?',
    buggy: nestedBuggy,
    fixed: nestedFixed,
    reactTests: [
      { name: 'details toggles', steps: [{ click: 'text=Toggle details' }, { expectText: 'Details are open' }] },
      { name: 'refresh keeps details state', steps: [{ click: 'text=Toggle details' }, { click: '.refresh' }, { expectText: 'Refresh 1' }, { expectText: 'Details are open' }] },
      { name: 'refresh twice', steps: [{ click: '.refresh' }, { click: '.refresh' }, { expectText: 'Refresh 2' }, { expectNoText: 'Details are open' }] },
    ],
    bugType: 'component defined inside render',
    hint: 'What is the identity of `Details` after `Page` runs a second time?',
    explanation: '`Details` is re-created on every Page render, so React sees a different component type at that position, unmounts the old one (state lost) and mounts a new one. Define components at module level.',
  },
  boss: {
    title: 'Keep the chart calm',
    statement:
      'The `Chart` below counts its renders. Write `Dashboard` so that (1) a button `Theme: light`/`Theme: dark` toggles the theme, (2) an `<input>` feeds a `Preview: text` line, and (3) neither interaction ever re-renders `Chart` (it must keep saying `Chart renders: 1`). Use state placement and `children`, not memo.',
    language: 'jsx',
    fnName: 'Dashboard',
    starter: `function Chart() {
  const renders = useRef(0);
  renders.current += 1;
  return <p>Chart renders: {renders.current}</p>;
}

function Dashboard() {
  return <Chart />;
}`,
    solution: `function Chart() {
  const renders = useRef(0);
  renders.current += 1;
  return <p>Chart renders: {renders.current}</p>;
}

function ThemeShell({ children }) {
  const [theme, setTheme] = useState('light');
  return (
    <div className={theme}>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Theme: {theme}</button>
      {children}
    </div>
  );
}

function NoteBox() {
  const [note, setNote] = useState('');
  return (
    <div>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <p>Preview: {note}</p>
    </div>
  );
}

function Dashboard() {
  return (
    <ThemeShell>
      <Chart />
      <NoteBox />
    </ThemeShell>
  );
}`,
    reactTests: [
      { name: 'initial render', steps: [{ expectText: 'Theme: light' }, { expectText: 'Chart renders: 1' }, { expectText: 'Preview:' }] },
      { name: 'typing does not render the chart', steps: [{ type: 'input', value: 'hello' }, { expectText: 'Preview: hello' }, { type: 'input', value: 'hello world' }, { expectText: 'Preview: hello world' }, { expectText: 'Chart renders: 1' }] },
      { name: 'theme toggle does not render the chart', steps: [{ click: 'button' }, { expectText: 'Theme: dark' }, { click: 'button' }, { expectText: 'Theme: light' }, { expectText: 'Chart renders: 1' }] },
    ],
    hints: ['If `Dashboard` itself held the state, everything it creates would re-render. Put each piece of state in its own small component.', 'Make a `ThemeShell({ children })` that owns the theme and a `NoteBox` that owns the text; `Dashboard` only composes them and creates `<Chart />` once.'],
    combines: ['react-tree', 'react-rerender'],
  },
  quiz: [
    {
      prompt: 'A parent re-renders and passes the SAME props to a child that is not wrapped in `memo`. Does the child function run again?',
      options: ['No, props are unchanged', 'Yes, by default a child re-renders whenever its parent renders it', 'Only if the child has state', 'Only in development'],
      answer: 1,
      explain: 'Without memo, React re-renders a child whenever the parent creates its element again, regardless of prop equality.',
    },
  ],
};

export default unit;
