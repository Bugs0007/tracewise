import { Recorder } from '@/engine/recorder';
import type { Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function reconcile(oldRows, items, keyOf) {
  const byKey = new Map(oldRows.map(row => [row.key, row]));   //@index
  return items.map((item, i) => {                              //@loop
    const key = keyOf(item, i);                                //@key
    const old = byKey.get(key);                                //@lookup
    if (old) return { key, item, state: old.state };           //@reuse
    return { key, item, state: '' };                           //@mount
  });
}
// <Row key={i} />        keyOf = (item, i) => i
// <Row key={item.id} />  keyOf = (item) => item.id
`;

interface Row {
  key: string;
  item: string;
  /** what the row remembers (its local input) and who typed it */
  text: string;
  owner: string;
}

interface In {
  items: string[];
  inserted: string;
  mode: string;
}

const viz: VizDef<In> = {
  id: 'react-keys',
  title: 'Index keys vs stable keys',
  code,
  language: 'javascript',
  inputs: [
    { key: 'items', label: 'List (unique names)', kind: 'strings', default: ['Apple', 'Banana', 'Cherry'], maxItems: 5 },
    { key: 'inserted', label: 'Insert at top', kind: 'string', default: 'Kiwi', maxItems: 10 },
    { key: 'mode', label: 'key =', kind: 'select', default: 'index', options: ['index', 'id'] },
  ],
  presets: [
    { label: 'key={index}', input: { mode: 'index' } },
    { label: 'key={item.id}', input: { mode: 'id' } },
  ],
  run({ items, inserted, mode }) {
    const all = [inserted, ...items];
    if (new Set(all).size !== all.length || !inserted || !items.length) throw new Error('Use a non-empty list of unique names');
    const r = new Recorder(code);
    const keyOf = (item: string, i: number) => (mode === 'index' ? String(i) : item);
    const before: Row[] = items.map((item, i) => ({ key: keyOf(item, i), item, text: `${item.toLowerCase()} note`, owner: item }));
    const grid = (rows: Row[], tones: Record<string, Tone> = {}, title = '') => ({ type: 'grid' as const, title, cells: rows.map((x): Scalar[] => [x.key, x.item, x.text || '(empty)']) as Scalar[][], colLabels: ['key', 'prop item', 'typed in input (row state)'], tones });
    const kvMode = { type: 'kv' as const, entries: [{ k: 'key strategy', v: mode === 'index' ? 'key={index}' : 'key={item.id}' }] };
    r.step('index', `Each row holds a note the user typed into its own input. Keys: ${mode === 'index' ? '0, 1, 2…' : 'the item names'}.`, [grid(before, {}, 'Mounted rows (before)'), kvMode], { rows: before.length });
    r.step('loop', `New data arrives: "${inserted}" is inserted at the top of the list`, [grid(before, {}, 'Mounted rows (before)'), { type: 'array', title: 'New items prop', values: all, tones: { 0: 'new' }, hideIndex: true }, kvMode], { items: all.length });
    const out: Row[] = [];
    all.forEach((item, i) => {
      r.op();
      const key = keyOf(item, i);
      const old = before.find((x) => x.key === key);
      const row: Row = old ? { key, item, text: old.text, owner: old.owner } : { key, item, text: '', owner: '' };
      out.push(row);
      const bad = old && old.owner !== item;
      const tones: Record<string, Tone> = {};
      out.forEach((x, j) => {
        const wrong = x.text && x.owner !== x.item;
        tones[`${j},0`] = 'compare';
        tones[`${j},2`] = wrong ? 'error' : x.text ? 'done' : 'new';
      });
      if (!old) r.step('mount', `key ${key} has no mounted row → mount a fresh ${item} row with empty state`, [grid(before), grid(out, tones, 'Rows after reconcile'), kvMode], { key, item });
      else
        r.step('reuse', bad ? `key ${key} found → React REUSES that row: ${item} now shows ${old.owner}'s note` : `key ${key} found → reuse the row; it is still ${item}'s note`, [grid(before), grid(out, tones, 'Rows after reconcile'), kvMode], { key, item });
    });
    const wrong = out.filter((x) => x.text && x.owner !== x.item);
    const finalTones: Record<string, Tone> = {};
    out.forEach((x, j) => (finalTones[`${j},2`] = x.text && x.owner !== x.item ? 'error' : x.text ? 'done' : 'new'));
    r.step('mount', wrong.length ? `Bug: ${wrong.length} row(s) show another item's input. State follows the key, not the item.` : 'Correct: every note is still attached to the item it was typed for', [grid(out, finalTones, 'Result'), kvMode], { misplaced: wrong.length });
    return { frames: r.frames, result: out.map((x) => `${x.item}: ${x.text}`) };
  },
  reference({ items, inserted, mode }) {
    const notes = items.map((i) => `${i.toLowerCase()} note`);
    const next = [inserted, ...items];
    return next.map((item, j) => {
      if (mode === 'index') return `${item}: ${j < notes.length ? notes[j] : ''}`;
      const k = items.indexOf(item);
      return `${item}: ${k >= 0 ? notes[k] : ''}`;
    });
  },
};

const rowsBuggy = `function TaskRow({ text, onRemove }) {
  const [done, setDone] = useState(false);
  return (
    <li>
      <span>{done ? 'Done: ' : ''}{text}</span>
      <button className="done" onClick={() => setDone(!done)}>Done</button>
      <button className="remove" onClick={onRemove}>Remove</button>
    </li>
  );
}

function Tasks() {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Write' },
    { id: 2, text: 'Test' },
    { id: 3, text: 'Ship' },
  ]);
  return (
    <ul>
      {tasks.map((task, index) => (
        <TaskRow
          key={index}
          text={task.text}
          onRemove={() => setTasks(tasks.filter((t) => t.id !== task.id))}
        />
      ))}
    </ul>
  );
}`;

const unit: Unit = {
  id: 'react-keys',
  hook: 'Index keys "work" until the list changes order — then inputs, checkboxes and animations show up on the wrong row. This is one of the most common real-world React bugs and a favorite review question.',
  predict: {
    prompt: 'A list renders `<Row key={index} />` where each row has an input the user typed into. A new item is inserted at the TOP of the list. What does the user see?',
    options: ['Everything is correct; React sees the new item and moves rows down', 'Each typed value stays with its original item', 'The typed values stay at their positions, so every item appears to have shifted onto the wrong text', 'All inputs are cleared because every key changed'],
    answer: 2,
    explain: 'Keys 0, 1, 2 still exist after the insert, so React reuses the same three row instances (with their state) and just hands each a different `item` prop. The state sticks to the POSITION, not the item. A stable id as key ties the state to the item.',
  },
  viz,
  deeper: {
    points: [
      'A key is the identity of a child among its siblings. React uses it to decide whether a row is "the same one as before" (reuse and keep state) or new (mount).',
      'Index keys are fine only for lists that never reorder, insert or delete in the middle — and even then they are a trap when the list grows features.',
      'Use a stable, unique id from the data (database id, slug). Generate it once when the item is created, not during render.',
      'Keys only need to be unique among siblings. They are not passed as a prop to the component.',
      'Changing the key on purpose is a feature: `<Form key={userId} />` remounts the form and resets all its state when the user changes.',
    ],
    pitfalls: ['`key={Math.random()}` — remounts every row on every render', 'Using the item\'s text as the key when text can repeat', 'Putting the key on the inner element instead of the element returned from `map`'],
  },
  practice: {
    language: 'jsx',
    fnName: 'NoteList',
    statement: 'Build `NoteList`: two items (Apple, Pear) each in a `Row` with a note input, and an `Add on top` button that prepends `New 3`, `New 4`, … Notes typed into a row must stay with that item after adding. Each row shows `name note: text`.',
    signature: 'function NoteList() {',
    solution: `function Row({ name }) {
  const [note, setNote] = useState('');
  return (
    <li>
      <span>{name} note: {note}</span>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
    </li>
  );
}

function NoteList() {
  const [items, setItems] = useState([{ id: 1, name: 'Apple' }, { id: 2, name: 'Pear' }]);
  const nextId = @@useRef(3)@@;
  const addOnTop = () => {
    const id = @@nextId.current++@@;
    @@setItems([{ id, name: 'New ' + id }, ...items])@@;
  };
  return (
    <div>
      <button onClick={addOnTop}>Add on top</button>
      <ul>
        {items.map((item) => (
          <Row
            @@key={item.id}@@
            name={item.name}
          />
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'renders two rows', steps: [{ expectCount: 'li', n: 2 }, { expectText: 'Apple note: ' }] },
      { name: 'add on top creates a row', steps: [{ click: 'text=Add on top' }, { expectCount: 'li', n: 3 }, { expectText: 'New 3 note: ' }] },
      { name: 'note stays with its item', steps: [{ type: 'li:nth-child(1) input', value: 'hello' }, { expectText: 'Apple note: hello' }, { click: 'text=Add on top' }, { expectText: 'Apple note: hello' }, { expectNoText: 'New 3 note: hello' }] },
      { name: 'adds twice', steps: [{ click: 'text=Add on top' }, { click: 'text=Add on top' }, { expectCount: 'li', n: 4 }, { expectText: 'New 4' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Tasks',
    statement: 'Mark "Write" as done and remove it: the next task, "Test", now appears done. Find the bug.',
    buggy: rowsBuggy,
    fixed: rowsBuggy.replace('key={index}', 'key={task.id}').replace('(task, index) =>', '(task) =>'),
    reactTests: [
      { name: 'removed row takes its done state with it', steps: [{ click: 'li:nth-child(1) .done' }, { expectText: 'Done: Write' }, { click: 'li:nth-child(1) .remove' }, { expectCount: 'li', n: 2 }, { expectNoText: 'Done:' }] },
      { name: 'second row keeps its own state', steps: [{ click: 'li:nth-child(2) .done' }, { click: 'li:nth-child(1) .remove' }, { expectText: 'Done: Test' }, { expectNoText: 'Done: Ship' }] },
      { name: 'removing works', steps: [{ click: '.remove' }, { expectNoText: 'Write' }, { expectText: 'Test' }, { expectText: 'Ship' }] },
    ],
    bugType: 'index as key',
    hint: 'After removing the first task, which key does "Test" have now, and which mounted row owns that key?',
    explanation: 'With `key={index}`, "Test" moves from key 1 to key 0 and inherits the row instance (and its `done` state) that used to belong to "Write". Key by `task.id` so state follows the task.',
  },
  boss: {
    title: 'Filterable contacts',
    statement:
      'Build `Contacts` with people Ada, Bea and Cy. A search `<input>` (case-insensitive substring) filters the list; show `Showing n of 3` and `No matches` when empty. Every `ContactRow` renders `Name: likes` and has a `like` button (class `like`) that bumps the row\'s own like count, kept in the row\'s state. Likes must stay attached to the right person while filtering.',
    language: 'jsx',
    fnName: 'Contacts',
    starter: `function Contacts() {
  return <ul></ul>;
}`,
    solution: `const PEOPLE = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Bea' },
  { id: 3, name: 'Cy' },
];

function ContactRow({ name }) {
  const [likes, setLikes] = useState(0);
  return (
    <li>
      <span>{name}: {likes}</span>
      <button className="like" onClick={() => setLikes(likes + 1)}>Like</button>
    </li>
  );
}

function Contacts() {
  const [query, setQuery] = useState('');
  const shown = PEOPLE.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>Showing {shown.length} of {PEOPLE.length}</p>
      {shown.length === 0 && <p>No matches</p>}
      <ul>
        {shown.map((p) => (
          <ContactRow key={p.id} name={p.name} />
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'initial list', steps: [{ expectText: 'Showing 3 of 3' }, { expectText: 'Ada: 0' }, { expectCount: 'li', n: 3 }] },
      { name: 'filters by substring, ignoring case', steps: [{ type: 'input', value: 'B' }, { expectText: 'Showing 1 of 3' }, { expectText: 'Bea: 0' }, { type: 'input', value: 'CY' }, { expectText: 'Cy: 0' }] },
      { name: 'likes stay with the person', steps: [{ click: 'li:nth-child(2) .like' }, { click: 'li:nth-child(2) .like' }, { expectText: 'Bea: 2' }, { type: 'input', value: 'be' }, { expectText: 'Bea: 2' }, { expectNoText: 'Ada' }] },
      { name: 'empty result', steps: [{ type: 'input', value: 'zzz' }, { expectText: 'No matches' }, { expectText: 'Showing 0 of 3' }, { expectCount: 'li', n: 0 }] },
    ],
    hints: ['Each row needs its own like state, so make `ContactRow` a component. Filter the people array during render from the `query` state.', 'Render rows with `key={p.id}`. With index keys, filtering would hand Ada\'s likes to whoever lands in position 0.'],
    combines: ['react-keys', 'react-controlled'],
  },
};

export default unit;
