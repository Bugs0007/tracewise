import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { ReactTest, Unit } from '@/content/types';
import { treePanel, type CNode } from '@/content/lib/frontend-react';

const code = `
function Temperature() {
  const [celsius, setCelsius] = useState(0);                       //@owner
  const fahrenheit = celsius * 9 / 5 + 32;                          //@derive
  return (
    <>
      <Field label="Celsius" value={celsius} onChange={setCelsius} />                          //@fieldC
      <Field label="Fahrenheit" value={fahrenheit} onChange={f => setCelsius((f - 32) * 5 / 9)} />  //@fieldF
    </>
  );
}

// duplicated state: every Field keeps its own copy, so siblings drift apart
function Field({ initial }) {
  const [value, setValue] = useState(initial);                      //@dup
}
`;

const MODES = ['separate state', 'lifted to parent'];

interface In {
  mode: string;
  celsius: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toF = (c: number) => round2((c * 9) / 5 + 32);

const viz: VizDef<In> = {
  id: 'react-lifting-state',
  title: 'Lifting state up',
  code,
  language: 'javascript',
  inputs: [
    { key: 'mode', label: 'Where does the value live?', kind: 'select', default: 'separate state', options: MODES },
    { key: 'celsius', label: 'User types in Celsius', kind: 'number', default: 100 },
  ],
  presets: [
    { label: 'Separate (broken)', input: { mode: 'separate state', celsius: 100 } },
    { label: 'Lifted (in sync)', input: { mode: 'lifted to parent', celsius: 100 } },
    { label: 'Freezing point', input: { mode: 'lifted to parent', celsius: 0 } },
  ],
  run({ mode, celsius }) {
    if (!MODES.includes(mode)) throw new Error(`Pick one of ${MODES.join(', ')}`);
    const r = new Recorder(code);
    const lifted = mode === 'lifted to parent';
    const root: CNode = { id: 'parent', name: 'Temperature', children: [{ id: 'fc', name: 'Field' }, { id: 'ff', name: 'Field' }] };
    const tones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    const subs: Record<string, string> = { fc: 'Celsius', ff: 'Fahrenheit', parent: lifted ? 'owns celsius' : 'no state' };
    const edgeTones: Record<string, Tone> = {};
    const edgeLabels: Record<string, string> = {};
    let c = 0;
    let f = 32;
    const view = (title: string) => [
      treePanel(root, { tones, badges, subs, edgeTones, edgeLabels, title }, { gapX: 112, gapY: 76 }),
      { type: 'kv' as const, entries: [{ k: 'Celsius field shows', v: String(c), tone: 'compare' as Tone }, { k: 'Fahrenheit field shows', v: String(f), tone: (f === toF(c) ? 'done' : 'error') as Tone }, { k: 'consistent?', v: f === toF(c) ? 'yes' : 'NO — 0 °C is 32 °F, they disagree' }] },
    ];
    const setBadges = () => {
      if (lifted) {
        badges.parent = `celsius=${c}`;
        badges.fc = `value=${c}`;
        badges.ff = `value=${f}`;
      } else {
        badges.fc = `state=${c}`;
        badges.ff = `state=${f}`;
      }
    };
    setBadges();
    if (lifted) {
      edgeLabels['parent>fc'] = 'value, onChange';
      edgeLabels['parent>ff'] = 'value, onChange';
      edgeTones['parent>fc'] = 'frontier';
      edgeTones['parent>ff'] = 'frontier';
      tones.parent = 'active';
      r.step('owner', 'The parent owns ONE value: celsius. Both fields only display props.', view('Lifted state'), { celsius: c });
    } else {
      tones.fc = 'frontier';
      tones.ff = 'frontier';
      r.step('dup', 'Each Field keeps its own copy of the value in its own state', view('Separate state'), { c, f });
    }
    tones.fc = 'active';
    c = celsius;
    r.step(lifted ? 'fieldC' : 'dup', `User types ${celsius} into the Celsius field`, (setBadges(), view(lifted ? 'Lifted state' : 'Separate state')), { typed: celsius });
    if (lifted) {
      edgeTones['parent>fc'] = 'swap';
      tones.parent = 'swap';
      f = toF(c);
      r.step('owner', `Field calls onChange(${celsius}) → Temperature runs setCelsius(${celsius})`, (setBadges(), view('Lifted state')), { celsius: c });
      tones.ff = 'swap';
      edgeTones['parent>ff'] = 'swap';
      r.step('derive', `Parent re-renders and derives fahrenheit = ${f}; both fields get fresh props`, view('Lifted state'), { fahrenheit: f });
      tones.parent = 'done';
      tones.fc = 'done';
      tones.ff = 'done';
      r.step('fieldF', 'Single source of truth: the two fields cannot disagree', view('Lifted state'), { c, f });
    } else {
      tones.ff = 'error';
      r.step('dup', `The Fahrenheit field never heard about it: it still shows ${f}`, view('Separate state'), { c, f });
      r.step('dup', 'Siblings cannot read each other\'s state. The fix: move the state to their closest common parent.', view('Separate state'), { c, f });
    }
    return { frames: r.frames, result: { c, f } };
  },
  reference({ mode, celsius }) {
    return { c: celsius, f: mode === 'lifted to parent' ? toF(celsius) : 32 };
  },
};

const CONVERT = `const parse = (s) => (s === '' || isNaN(parseFloat(s)) ? null : parseFloat(s));
const round = (n) => String(Math.round(n * 100) / 100);
const toF = (c) => (parse(c) === null ? '' : round((parse(c) * 9) / 5 + 32));
const toC = (f) => (parse(f) === null ? '' : round(((parse(f) - 32) * 5) / 9));
`;

const PAIR = `function TemperaturePair() {
  const [celsius, setCelsius] = useState('');
  const fahrenheit = toF(celsius);
  return (
    <div>
      <Field
        label="Celsius"
        value={celsius}
        onChange={setCelsius}
      />
      <Field
        label="Fahrenheit"
        value={fahrenheit}
        onChange={(f) => setCelsius(toC(f))}
      />
    </div>
  );
}`;

const FIELD_GOOD = `function Field({ label, value, onChange }) {
  return (
    <p>
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span> {label}: {value}</span>
    </p>
  );
}`;

const FIELD_BAD = `function Field({ label, value, onChange }) {
  const [text, setText] = useState(value);
  return (
    <p>
      <input
        aria-label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
      <span> {label}: {text}</span>
    </p>
  );
}`;

const tempTests: ReactTest[] = [
  { name: 'celsius drives fahrenheit', steps: [{ type: 'input[aria-label="Celsius"]', value: '100' }, { expectText: 'Celsius: 100' }, { expectText: 'Fahrenheit: 212' }] },
  { name: 'fahrenheit drives celsius', steps: [{ type: 'input[aria-label="Fahrenheit"]', value: '32' }, { expectText: 'Celsius: 0' }, { expectText: 'Fahrenheit: 32' }] },
  { name: 'both directions in one session', steps: [{ type: 'input[aria-label="Celsius"]', value: '37' }, { expectText: 'Fahrenheit: 98.6' }, { type: 'input[aria-label="Fahrenheit"]', value: '212' }, { expectText: 'Celsius: 100' }] },
];

const unit: Unit = {
  id: 'react-lifting-state',
  hook: '"Two components need the same data and they drift apart" is the textbook state-design question. Lifting state to the closest common parent, and deriving everything else from it, is the answer interviewers expect before reaching for context or a store.',
  predict: {
    prompt: 'Two sibling inputs (Celsius, Fahrenheit) each call `useState` for their own value. Typing in one should update the other. What is the cleanest fix?',
    options: ['Use `useEffect` in each sibling to copy the other\'s value', 'Store the value in a global variable', 'Move one state value to their common parent and pass it down with an `onChange` callback', 'Make both inputs uncontrolled and read each other\'s DOM node'],
    answer: 2,
    explain: 'Siblings cannot see each other\'s state, but they can both receive props from a parent. Keep a single source of truth in the closest common parent, derive the other value during render, and pass callbacks down for changes.',
  },
  viz,
  deeper: {
    points: [
      'If two components must reflect the same changing data, the state belongs in their closest common ancestor.',
      'Store the minimal state (celsius) and DERIVE the rest (fahrenheit) during render; two copies of the same fact will eventually disagree.',
      'Children become "controlled" by the parent: they receive `value` and `onChange` as props instead of owning state.',
      'Copying a prop into state (`useState(props.value)`) only reads it once; later prop changes are ignored.',
      'Don\'t lift higher than necessary: the higher the state, the more of the tree re-renders when it changes. If lifting becomes painful, that is the signal for context.',
    ],
    pitfalls: ['Syncing siblings with effects instead of lifting', 'Copying props into state "for convenience"', 'Lifting state to the app root when only two siblings need it'],
  },
  practice: {
    language: 'jsx',
    fnName: 'TemperaturePair',
    statement: '`toF` and `toC` convert strings (given). Make `TemperaturePair` own ONE state value, `celsius`, and render two `Field` inputs (labels Celsius and Fahrenheit). Typing in either must update both.',
    signature: 'function TemperaturePair() {',
    solution: `${CONVERT}
${FIELD_GOOD}

function TemperaturePair() {
  const [celsius, setCelsius] = @@useState('')@@;
  const fahrenheit = @@toF(celsius)@@;
  return (
    <div>
      <Field
        label="Celsius"
        value={celsius}
        onChange={@@setCelsius@@}
      />
      <Field
        label="Fahrenheit"
        value={fahrenheit}
        onChange={@@(f) => setCelsius(toC(f))@@}
      />
    </div>
  );
}`,
    reactTests: tempTests,
  },
  debug: {
    language: 'jsx',
    fnName: 'TemperaturePair',
    statement: 'Typing in the Celsius field updates the parent, yet the Fahrenheit field stays empty (and vice versa). Find the duplicated state.',
    buggy: `${CONVERT}
${FIELD_BAD}

${PAIR}`,
    fixed: `${CONVERT}
${FIELD_GOOD}

${PAIR}`,
    reactTests: tempTests,
    bugType: 'duplicated state',
    hint: 'Where does the Fahrenheit field get the text it displays: from its props or from somewhere else?',
    explanation: '`useState(value)` reads the prop only on the first render. After that the field shows its own copy, so the parent\'s updates never reach it. Make Field a pure display of `value`, with the parent as the single source of truth.',
  },
  boss: {
    title: 'Inbox with selection',
    statement:
      'Build `Inbox`. Messages: Welcome ("Hello and welcome"), Invoice ("Your invoice is ready"), Lunch? ("Noon at the cafe"), all unread. Render a `Header` (`Unread: n`), a `MessageList` (each `<li>` has a `<button>` with the title; unread items also show a `<span>new</span>`; the selected `<li>` gets class `sel`) and a `Detail` pane showing `Title: …` and `Body: …`, or `Select a message`. Clicking a title selects it and marks it read. All state lives in `Inbox`.',
    language: 'jsx',
    fnName: 'Inbox',
    starter: `function Inbox() {
  return <div></div>;
}`,
    solution: `const MESSAGES = [
  { id: 1, title: 'Welcome', body: 'Hello and welcome', read: false },
  { id: 2, title: 'Invoice', body: 'Your invoice is ready', read: false },
  { id: 3, title: 'Lunch?', body: 'Noon at the cafe', read: false },
];

function Header({ unread }) {
  return <h2>Unread: {unread}</h2>;
}

function MessageList({ messages, selectedId, onSelect }) {
  return (
    <ul>
      {messages.map((m) => (
        <li key={m.id} className={m.id === selectedId ? 'sel' : ''}>
          <button onClick={() => onSelect(m.id)}>{m.title}</button>
          {!m.read && <span>new</span>}
        </li>
      ))}
    </ul>
  );
}

function Detail({ message }) {
  if (!message) return <p>Select a message</p>;
  return (
    <div>
      <p>Title: {message.title}</p>
      <p>Body: {message.body}</p>
    </div>
  );
}

function Inbox() {
  const [messages, setMessages] = useState(MESSAGES);
  const [selectedId, setSelectedId] = useState(null);
  const select = (id) => {
    setSelectedId(id);
    setMessages(messages.map((m) => (m.id === id ? { ...m, read: true } : m)));
  };
  const selected = messages.find((m) => m.id === selectedId);
  return (
    <div>
      <Header unread={messages.filter((m) => !m.read).length} />
      <MessageList messages={messages} selectedId={selectedId} onSelect={select} />
      <Detail message={selected} />
    </div>
  );
}`,
    reactTests: [
      { name: 'initial state', steps: [{ expectText: 'Unread: 3' }, { expectText: 'Select a message' }, { expectCount: 'li', n: 3 }, { expectCount: 'li.sel', n: 0 }] },
      { name: 'selecting shows the detail and reads it', steps: [{ click: 'text=Welcome' }, { expectText: 'Unread: 2' }, { expectText: 'Title: Welcome' }, { expectText: 'Body: Hello and welcome' }, { expectCount: 'li.sel', n: 1 }] },
      { name: 'switching and re-selecting', steps: [{ click: 'text=Invoice' }, { click: 'text=Welcome' }, { expectText: 'Unread: 1' }, { click: 'text=Invoice' }, { expectText: 'Body: Your invoice is ready' }, { expectText: 'Unread: 1' }, { expectCount: 'li.sel', n: 1 }] },
      { name: 'all read', steps: [{ click: 'text=Welcome' }, { click: 'text=Invoice' }, { click: 'text=Lunch?' }, { expectText: 'Unread: 0' }, { expectText: 'Body: Noon at the cafe' }, { expectNoText: 'new' }] },
    ],
    hints: ['Header, list and detail all need the same data, so `messages` and `selectedId` live in `Inbox`; the three children only get props and an `onSelect` callback.', 'One handler does both jobs: `setSelectedId(id)` and `setMessages(messages.map(...))` marking that message read. Derive the unread count and the selected message during render.'],
    combines: ['react-tree', 'react-lifting-state'],
  },
};

export default unit;
