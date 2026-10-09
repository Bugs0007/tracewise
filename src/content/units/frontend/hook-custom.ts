import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, slotsPanel } from '@/content/lib/frontend-hooks';

const code = `
function useToggle(initial) {                                   //@hook
  const [on, setOn] = useState(initial);                        //@slot
  const toggle = () => setOn((v) => !v);                        //@toggle
  return [on, toggle];                                          //@ret
}

function Sidebar() {                                            //@sidebar
  const [open, toggleOpen] = useToggle(false);                  //@callA
  return <button onClick={toggleOpen}>{String(open)}</button>;
}

function Modal() {                                              //@modal
  const [open, toggleOpen] = useToggle(true);                   //@callB
  return <button onClick={toggleOpen}>{String(open)}</button>;
}
`;

interface In {
  clicks: string[];
}

const _NAMES = ['sidebar', 'modal'] as const;
type Who = (typeof _NAMES)[number];
const parse = (raw: string[]): Who[] => raw.map((c) => c.trim().toLowerCase()).filter((c): c is Who => c === 'sidebar' || c === 'modal');

const viz: VizDef<In> = {
  id: 'hook-custom',
  title: 'One custom hook, separate state per call',
  code,
  language: 'javascript',
  inputs: [{ key: 'clicks', label: 'Clicks on', kind: 'strings', default: ['sidebar', 'sidebar', 'modal'], maxItems: 8, help: 'sidebar or modal' }],
  presets: [
    { label: 'Sidebar twice, modal once', input: { clicks: ['sidebar', 'sidebar', 'modal'] } },
    { label: 'Modal only', input: { clicks: ['modal', 'modal'] } },
    { label: 'Alternate', input: { clicks: ['sidebar', 'modal', 'sidebar', 'modal'] } },
  ],
  run({ clicks: raw }) {
    const r = new HookRecorder(code);
    const clicks = parse(raw);
    const on: Record<Who, boolean | null> = { sidebar: null, modal: null };
    const renders: Record<Who, number> = { sidebar: 0, modal: 0 };
    let touched: Who | null = null;
    const panels = (note?: string) => [
      slotsPanel(
        `Sidebar: renders ${renders.sidebar}`,
        on.sidebar === null ? [] : [{ label: 'useState (from useToggle)', value: on.sidebar, tone: touched === 'sidebar' ? 'swap' : 'default' }],
        'not rendered yet',
      ),
      slotsPanel(
        `Modal: renders ${renders.modal}`,
        on.modal === null ? [] : [{ label: 'useState (from useToggle)', value: on.modal, tone: touched === 'modal' ? 'swap' : 'default' }],
        'not rendered yet',
      ),
      ...(note ? [{ type: 'note' as const, text: note, tone: 'compare' as const }] : []),
    ];
    on.sidebar = false;
    renders.sidebar = 1;
    r.step('callA', 'Sidebar renders: useToggle(false) runs inline, its useState takes Sidebar slot #0', panels(), { sidebar: false });
    on.modal = true;
    renders.modal = 1;
    r.step('callB', 'Modal renders: the same hook, but useState takes Modal slot #0 (starts true)', panels('Same hook code, two separate instances of its state.'), { modal: true });
    clicks.forEach((who) => {
      touched = who;
      on[who] = !on[who];
      r.step('toggle', `Click ${who}: its setOn flips ${who}'s slot only`, panels(), { sidebar: on.sidebar, modal: on.modal });
      renders[who] += 1;
      r.step('ret', `Only ${who} re-renders. useToggle returns [${on[who]}, toggle] to it`, panels(), { sidebar: on.sidebar, modal: on.modal });
    });
    r.step('hook', `Done: sidebar=${on.sidebar}, modal=${on.modal}, renders ${renders.sidebar}/${renders.modal}`, panels(), { sidebar: on.sidebar, modal: on.modal });
    return { frames: r.frames, result: [on.sidebar, on.modal, renders.sidebar, renders.modal] };
  },
  reference({ clicks }) {
    const list = parse(clicks);
    const s = list.filter((c) => c === 'sidebar').length;
    const m = list.filter((c) => c === 'modal').length;
    return [s % 2 === 1, m % 2 === 0, 1 + s, 1 + m];
  },
};

const unit: Unit = {
  id: 'hook-custom',
  hook: 'Custom hooks are how real React code shares logic. Interviewers want to hear that they share behaviour, not state: every call gets its own slots.',
  predict: {
    prompt: 'After ONE click on the button, what does it show?',
    code: `function useCounter() {
  const [n, setN] = useState(0);
  return { n, inc: () => setN((c) => c + 1) };
}

function App() {
  const a = useCounter();
  const b = useCounter();
  return (
    <button onClick={() => { a.inc(); a.inc(); b.inc(); }}>
      {a.n}/{b.n}
    </button>
  );
}`,
    codeLang: 'jsx',
    options: ['1/1', '2/1', '3/3', '3/0'],
    answer: 1,
    explain: 'Each useCounter() call owns its own useState slot. a.inc() twice queues two functional updates on a\'s slot (0 → 2); b\'s slot gets one (0 → 1).',
  },
  viz,
  deeper: {
    points: [
      'A custom hook is a function whose name starts with "use" and that calls other hooks. React tracks the hooks it calls in the component that called it.',
      'Calling useToggle() twice (in one component or in two) creates two independent sets of state. Hooks share logic, never data.',
      'To share data across components use context, a store or lift the state up. A module-level variable is shared but will not trigger renders.',
      'Good hooks return a small API: a value and the functions to change it ([on, toggle], { data, error, loading }).',
      'Typical interview hooks: useToggle, useDebouncedValue (value + timer + cleanup), useFetch (state machine around an async call), usePrevious (ref).',
    ],
    pitfalls: ['Keeping the state in a module-level variable (all components share it and nothing re-renders)', 'Forgetting the effect cleanup inside the hook (timers and listeners leak per call)', 'Breaking the rules of hooks inside the hook, for example calling useState in an if'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Counters',
    statement: 'Write a `useCounter(start)` hook that returns { count, inc, reset }, and use it twice in `Counters` (one starting at 0, one at 10). Each counter must move on its own.',
    signature: 'function Counters() {',
    solution: `function useCounter(start) {
  const [count, setCount] = useState(@@start@@);
  const inc = @@() => setCount((c) => c + 1)@@;
  const reset = () => setCount(start);
  return @@{ count, inc, reset }@@;
}

function Counters() {
  const a = useCounter(0);
  const b = useCounter(10);
  return (
    <div>
      <p>A: {a.count}</p>
      <p>B: {b.count}</p>
      <button onClick={a.inc}>A+</button>
      <button onClick={b.inc}>B+</button>
      <button onClick={() => { a.reset(); b.reset(); }}>Reset all</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'two independent starts', steps: [{ expectText: 'A: 0' }, { expectText: 'B: 10' }] },
      { name: 'A moves alone', steps: [{ click: 'text=A+' }, { click: 'text=A+' }, { expectText: 'A: 2' }, { expectText: 'B: 10' }] },
      { name: 'B moves alone', steps: [{ click: 'text=B+' }, { expectText: 'A: 0' }, { expectText: 'B: 11' }] },
      { name: 'reset returns to each start', steps: [{ click: 'text=A+' }, { click: 'text=B+' }, { click: 'text=Reset all' }, { expectText: 'A: 0' }, { expectText: 'B: 10' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Toggles',
    statement: 'Toggle A and Toggle B are supposed to be independent, but after clicking A then B, B does not show "on". Fix the hook.',
    buggy: `let on = false;

function useToggle() {
  const [, force] = useState(0);
  const toggle = () => {
    on = !on;
    force((n) => n + 1);
  };
  return [on, toggle];
}

function Toggles() {
  const [a, toggleA] = useToggle();
  const [b, toggleB] = useToggle();
  return (
    <div>
      <p>A: {a ? 'on' : 'off'}</p>
      <p>B: {b ? 'on' : 'off'}</p>
      <button onClick={toggleA}>Toggle A</button>
      <button onClick={toggleB}>Toggle B</button>
    </div>
  );
}`,
    fixed: `function useToggle() {
  const [on, setOn] = useState(false);
  const toggle = () => setOn((v) => !v);
  return [on, toggle];
}

function Toggles() {
  const [a, toggleA] = useToggle();
  const [b, toggleB] = useToggle();
  return (
    <div>
      <p>A: {a ? 'on' : 'off'}</p>
      <p>B: {b ? 'on' : 'off'}</p>
      <button onClick={toggleA}>Toggle A</button>
      <button onClick={toggleB}>Toggle B</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'both off', steps: [{ expectText: 'A: off' }, { expectText: 'B: off' }] },
      { name: 'A alone', steps: [{ click: 'text=Toggle A' }, { expectText: 'A: on' }, { expectText: 'B: off' }] },
      { name: 'A then B', steps: [{ click: 'text=Toggle A' }, { click: 'text=Toggle B' }, { expectText: 'A: on' }, { expectText: 'B: on' }] },
      { name: 'B twice', steps: [{ click: 'text=Toggle B' }, { click: 'text=Toggle B' }, { expectText: 'B: off' }, { expectText: 'A: off' }] },
    ],
    bugType: 'shared state',
    hint: 'Where does `on` live? Is it created once per useToggle() call, or once per file?',
    explanation: 'The flag was a module-level variable, so every useToggle() call read and flipped the same one, and only the clicked component re-rendered. State must live in useState inside the hook so each call owns a separate slot.',
  },
  boss: {
    title: 'Debounced search box',
    statement:
      'Write a `useDebouncedValue(value, delay)` hook and a `SearchBox` that uses it with a 15 ms delay. SearchBox shows `Typing: <text>`, `Searching: <debounced text>`, a text input, and a "Burst" button that simulates very fast typing: it sets the text to "r", then "re" after 1 ms and "rea" after 2 ms (setTimeout). A `<ul>` lists every non-empty debounced value, one `<li>` each, in the order they settled.',
    language: 'jsx',
    fnName: 'SearchBox',
    starter: `function useDebouncedValue(value, delay) {
  // your code here
}

function SearchBox() {
  // your code here
  return null;
}
`,
    solution: `function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchBox() {
  const [text, setText] = useState('');
  const [history, setHistory] = useState([]);
  const debounced = useDebouncedValue(text, 15);
  useEffect(() => {
    if (debounced) setHistory((h) => [...h, debounced]);
  }, [debounced]);
  const burst = () => {
    setText('r');
    setTimeout(() => setText('re'), 1);
    setTimeout(() => setText('rea'), 2);
  };
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={burst}>Burst</button>
      <p>Typing: {text}</p>
      <p>Searching: {debounced}</p>
      <ul>
        {history.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'empty at first', steps: [{ expectText: 'Typing: ' }, { expectCount: 'li', n: 0 }] },
      { name: 'settles after typing', steps: [{ type: 'input', value: 'ab' }, { expectText: 'Typing: ab' }, { expectText: 'Searching: ab' }, { expectCount: 'li', n: 1 }] },
      { name: 'each pause is a search', steps: [{ type: 'input', value: 'ab' }, { type: 'input', value: 'abc' }, { expectText: 'Searching: abc' }, { expectCount: 'li', n: 2 }, { expectText: 'abc', in: 'li:nth-child(2)' }] },
      { name: 'a burst is one search', steps: [{ click: 'text=Burst' }, { expectText: 'Typing: rea' }, { expectText: 'Searching: rea' }, { expectCount: 'li', n: 1 }, { expectText: 'rea', in: 'li:nth-child(1)' }] },
      { name: 'empty text is not recorded', steps: [{ type: 'input', value: 'ab' }, { type: 'input', value: '' }, { expectCount: 'li', n: 1 }] },
    ],
    hints: ['The hook keeps its own copy of the value in state and updates that copy later. What schedules the later update, and what cancels it when the value changes again?', 'useState(value) for the copy; useEffect with setTimeout(() => setDebounced(value), delay) and `return () => clearTimeout(id)`; deps [value, delay]. In SearchBox, record history in a second effect that depends on [debounced].'],
    combines: ['hook-useeffect', 'hook-usestate'],
  },
  quiz: [
    {
      prompt: 'Two components both call useToggle(). What do they share?',
      options: ['The toggle state', 'The hook code only, each call has its own state', 'Nothing, even the code is copied', 'The state, but only if the hook is imported from the same file'],
      answer: 1,
      explain: 'Hooks are ordinary functions. State is attached to the component instance that called them, one slot per call.',
    },
  ],
};

export default unit;
