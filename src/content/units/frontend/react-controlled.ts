import { Recorder } from '@/engine/recorder';
import type { SequenceMessage, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
// controlled: React state is the source of truth
function Controlled() {
  const [name, setName] = useState('');                                  //@state
  return <input value={name} onChange={e => setName(e.target.value)} />;  //@controlled
}

// bug: value without onChange -> a frozen, read-only field
const frozen = <input value={name} />;                                    //@frozen

// uncontrolled: the DOM is the source of truth
function Uncontrolled() {
  const ref = useRef(null);                                               //@ref
  const submit = () => send(ref.current.value);                           //@read
  return <input defaultValue="" ref={ref} />;                             //@uncontrolled
}
`;

const MODES = ['controlled', 'controlled, no onChange', 'uncontrolled'];

interface In {
  typed: string;
  mode: string;
}

function simulate(typed: string, mode: string): { dom: string; state: string; submitted: string } {
  let dom = '';
  let state = '';
  for (const ch of typed) {
    dom += ch;
    if (mode === 'controlled') state = dom;
    if (mode === 'controlled, no onChange') dom = state;
  }
  return { dom, state, submitted: mode === 'uncontrolled' ? dom : state };
}

const viz: VizDef<In> = {
  id: 'react-controlled',
  title: 'Controlled vs uncontrolled',
  code,
  language: 'javascript',
  inputs: [
    { key: 'mode', label: 'Input style', kind: 'select', default: 'controlled', options: MODES },
    { key: 'typed', label: 'User types', kind: 'string', default: 'hey', maxItems: 4 },
  ],
  presets: MODES.map((m) => ({ label: m, input: { mode: m } })),
  run({ typed, mode }) {
    if (!MODES.includes(mode)) throw new Error(`Pick one of ${MODES.join(', ')}`);
    if (!typed) throw new Error('Type at least one character');
    const r = new Recorder(code);
    const msgs: SequenceMessage[] = [];
    let dom = '';
    let state = '';
    const controlled = mode !== 'uncontrolled';
    const panels = () => {
      const shown = msgs.slice(-6);
      return [
        { type: 'sequence' as const, title: 'Who tells whom', actors: ['User', 'DOM <input>', 'React state'], messages: shown, active: shown.length - 1 },
        { type: 'kv' as const, entries: [{ k: 'DOM value', v: dom || '""', tone: 'compare' as Tone }, { k: 'React state', v: controlled ? state || '""' : '(none — not tracked)', tone: controlled ? ('active' as Tone) : ('muted' as Tone) }, { k: 'source of truth', v: mode === 'uncontrolled' ? 'the DOM' : 'React state' }] },
      ];
    };
    r.step(controlled ? 'state' : 'ref', mode === 'uncontrolled' ? 'Uncontrolled: the input owns its text. React only gets a ref.' : mode === 'controlled' ? 'Controlled: value comes from state, every change goes through onChange.' : 'value is set but there is no onChange handler.', panels(), {});
    for (const ch of typed) {
      r.op();
      dom += ch;
      msgs.push({ from: 'User', to: 'DOM <input>', label: `types "${ch}"` });
      r.step(controlled ? 'controlled' : 'uncontrolled', `Browser puts "${ch}" into the field: DOM value is now "${dom}"`, panels(), { key: ch });
      if (mode === 'controlled') {
        msgs.push({ from: 'DOM <input>', to: 'React state', label: `onChange("${dom}")` });
        state = dom;
        r.step('controlled', `onChange runs setName("${state}") — state is updated`, panels(), { state });
        msgs.push({ from: 'React state', to: 'DOM <input>', label: `value="${state}"`, tone: 'found' });
        r.step('controlled', `React re-renders and writes value="${state}" back: DOM and state agree`, panels(), { dom, state });
      } else if (mode === 'controlled, no onChange') {
        msgs.push({ from: 'DOM <input>', to: 'React state', label: 'no onChange handler', dashed: true, tone: 'error' });
        r.step('frozen', 'No handler runs, state does not change', panels(), { state });
        dom = state;
        msgs.push({ from: 'React state', to: 'DOM <input>', label: `reset to "${state}"`, tone: 'error' });
        r.step('frozen', `React restores value="${state}" — the field refuses to change`, panels(), { dom, state });
      } else {
        msgs.push({ from: 'DOM <input>', to: 'React state', label: 'nothing (no re-render)', dashed: true });
        r.step('uncontrolled', 'React is not involved: no state, no re-render per keystroke', panels(), { dom });
      }
    }
    const res = simulate(typed, mode);
    if (mode === 'uncontrolled') {
      msgs.push({ from: 'React state', to: 'DOM <input>', label: 'ref.current.value', tone: 'found' });
      r.step('read', `On submit React reads the DOM through the ref: "${res.submitted}"`, panels(), { submitted: res.submitted });
    } else {
      msgs.push({ from: 'React state', to: 'DOM <input>', label: `submit uses state "${res.submitted}"`, tone: res.submitted ? 'found' : 'error' });
      r.step(controlled && mode === 'controlled' ? 'state' : 'frozen', res.submitted ? `On submit React uses state: "${res.submitted}"` : 'Everything the user typed was lost — state never changed', panels(), { submitted: res.submitted });
    }
    return { frames: r.frames, result: res };
  },
  reference({ typed, mode }) {
    if (mode === 'controlled') return { dom: typed, state: typed, submitted: typed };
    if (mode === 'uncontrolled') return { dom: typed, state: '', submitted: typed };
    return { dom: '', state: '', submitted: '' };
  },
};

const searchBuggy = `function Search() {
  const [query, setQuery] = useState('');
  return (
    <div>
      <input aria-label="Search" value={query} onBlur={(e) => setQuery(e.target.value)} />
      <button onClick={() => setQuery('')}>Clear</button>
      <p>Searching for: {query || 'nothing'}</p>
    </div>
  );
}`;

const unit: Unit = {
  id: 'react-controlled',
  hook: '"Controlled or uncontrolled?" shows up in every forms interview. It is really a question about who owns the value — React state or the DOM — and what each choice makes easy (validation, resets) or hard.',
  predict: {
    prompt: 'You render `<input value={name} />` with `name` from `useState` and no `onChange`. The user types "a". What happens?',
    options: ['The field shows "a" and `name` becomes "a"', 'The field shows "a" but `name` stays empty', 'The field stays empty: React keeps resetting it to `name` (and warns in the console)', 'React throws and the component unmounts'],
    answer: 2,
    explain: 'Providing `value` makes the input controlled: React is the source of truth. With no handler to update state, every keystroke is undone on the next render, so the field looks frozen. Use `onChange` (controlled) or `defaultValue` (uncontrolled).',
  },
  viz,
  simulationNote: 'A small model of the keystroke, onChange and re-render cycle; it ignores batching and caret handling but shows who holds the value.',
  deeper: {
    points: [
      'Controlled: `value` + `onChange`. The value lives in state, so you can validate, format, disable buttons and reset it from anywhere during render.',
      'Uncontrolled: `defaultValue` + a ref. The DOM keeps the text and you read `ref.current.value` when you need it (submit, focus handling, file inputs).',
      'Switching an input between `value={undefined}` and a string makes it change from uncontrolled to controlled — React warns. Initialize state with `""`.',
      'Controlled inputs re-render on every keystroke; that is usually cheap, but for huge forms uncontrolled inputs or form libraries can help.',
      '`<input type="file">` is always uncontrolled. Use `defaultValue`/`defaultChecked` for initial values, `value`/`checked` for controlled ones.',
    ],
    pitfalls: ['`value` without `onChange` (frozen field)', '`useState()` with no initial value, then passing it as `value`', 'Passing the setter directly as `onChange={setName}`, which stores the event object instead of the text'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Greeter',
    statement: 'Build a controlled name field. Show `Hello, {name}!` (or `Hello, stranger!` while empty), `Length: n`, and a `Clear` button that empties the field through state.',
    signature: 'function Greeter() {',
    solution: `function Greeter() {
  const [name, setName] = @@useState('')@@;
  return (
    <div>
      <input
        aria-label="Name"
        value={@@name@@}
        onChange={@@(e) => setName(e.target.value)@@}
      />
      <button onClick={@@() => setName('')@@}>Clear</button>
      <p>Hello, {name || 'stranger'}!</p>
      <p>Length: {name.length}</p>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts empty', steps: [{ expectText: 'Hello, stranger!' }, { expectText: 'Length: 0' }] },
      { name: 'typing updates the greeting', steps: [{ type: 'input', value: 'Ana' }, { expectText: 'Hello, Ana!' }, { expectText: 'Length: 3' }] },
      { name: 'clear resets through state', steps: [{ type: 'input', value: 'Ana' }, { click: 'text=Clear' }, { expectText: 'Hello, stranger!' }, { expectText: 'Length: 0' }, { expectCount: 'input[value=""]', n: 1 }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Search',
    statement: 'Typing in the search box never updates the "Searching for" line; the field even seems to reject characters. Fix it.',
    buggy: searchBuggy,
    fixed: searchBuggy.replace('onBlur=', 'onChange='),
    reactTests: [
      { name: 'starts with nothing', steps: [{ expectText: 'Searching for: nothing' }] },
      { name: 'typing is reflected', steps: [{ type: 'input', value: 'abc' }, { expectText: 'Searching for: abc' }] },
      { name: 'clear returns to nothing', steps: [{ type: 'input', value: 'abc' }, { click: 'text=Clear' }, { expectText: 'Searching for: nothing' }] },
    ],
    bugType: 'controlled input without onChange',
    hint: 'Which event fires on every keystroke of an input, and which one only fires when focus leaves it?',
    explanation: 'The value is controlled by state, but state only updates on blur, which never happens while typing, so React resets the field after each keystroke. Updating state in `onChange` keeps DOM and state in sync.',
  },
  boss: {
    title: 'Profile form',
    statement:
      'Build `ProfileForm`: controlled inputs `name="name"` and `name="email"`, plus an UNCONTROLLED `<textarea>` for notes read through a ref. `Save` is disabled until the name is non-blank and the email contains `@`; clicking it shows `Saved: {name} <{email}> | notes: {notes}`. `Reset` clears name, email, the saved message AND the textarea.',
    language: 'jsx',
    fnName: 'ProfileForm',
    starter: `function ProfileForm() {
  return <form></form>;
}`,
    solution: `function ProfileForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState('');
  const notesRef = useRef(null);
  const valid = name.trim() !== '' && email.includes('@');
  const save = () => setSaved('Saved: ' + name + ' <' + email + '> | notes: ' + notesRef.current.value);
  const reset = () => {
    setName('');
    setEmail('');
    setSaved('');
    notesRef.current.value = '';
  };
  return (
    <div>
      <input name="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input name="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea ref={notesRef} defaultValue="" />
      <button disabled={!valid} onClick={save}>Save</button>
      <button onClick={reset}>Reset</button>
      <p>{saved}</p>
    </div>
  );
}`,
    reactTests: [
      { name: 'save needs a valid name and email', steps: [{ click: 'text=Save' }, { expectNoText: 'Saved:' }, { type: 'input[name="name"]', value: 'Ana' }, { type: 'input[name="email"]', value: 'ana' }, { click: 'text=Save' }, { expectNoText: 'Saved:' }, { type: 'input[name="email"]', value: 'ana@x.io' }, { click: 'text=Save' }, { expectText: 'Saved: Ana <ana@x.io>' }] },
      { name: 'notes are read from the uncontrolled textarea', steps: [{ type: 'textarea', value: 'hi' }, { type: 'input[name="name"]', value: 'Bo' }, { type: 'input[name="email"]', value: 'b@o' }, { click: 'text=Save' }, { expectText: 'Saved: Bo <b@o> | notes: hi' }] },
      { name: 'reset clears everything', steps: [{ type: 'textarea', value: 'hi' }, { type: 'input[name="name"]', value: 'Bo' }, { type: 'input[name="email"]', value: 'b@o' }, { click: 'text=Save' }, { click: 'text=Reset' }, { expectNoText: 'Saved:' }, { type: 'input[name="name"]', value: 'Cy' }, { type: 'input[name="email"]', value: 'c@y' }, { click: 'text=Save' }, { expectText: 'notes: ' }, { expectNoText: 'notes: hi' }] },
    ],
    hints: ['Name and email are controlled: state plus `value`/`onChange`. Derive `valid` during render and use it for `disabled`.', 'The textarea has `defaultValue=""` and `ref={notesRef}`; read `notesRef.current.value` in the save handler, and set it to `""` in reset.'],
    combines: ['react-controlled'],
  },
};

export default unit;
