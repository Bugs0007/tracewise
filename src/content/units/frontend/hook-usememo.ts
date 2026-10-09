import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder } from '@/content/lib/frontend-hooks';

const code = `
const Table = memo(function Table({ rows, onSelect }) { /* ... */ });

function Report({ rows }) {
  const [filter, setFilter] = useState('all');
  const [theme, setTheme] = useState('light');
  const visible = useMemo(() => applyFilter(rows, filter), [rows, filter]);   //@memo
  const onSelect = useCallback((id) => select(id), [filter]);                 //@cb
  return <Table rows={visible} onSelect={onSelect} />;                        //@child
}
`;

interface In {
  triggers: string[];
  memoize: string;
}

const COLS = ['What changed', 'useMemo(visible)', 'useCallback(onSelect)', 'Table (memo child)'];
const VALID = new Set(['filter', 'theme', 'rows']);

const viz: VizDef<In> = {
  id: 'hook-usememo',
  title: 'Recompute or reuse, render by render',
  code,
  language: 'javascript',
  inputs: [
    { key: 'triggers', label: 'Re-render caused by', kind: 'strings', default: ['theme', 'filter', 'theme', 'rows'], maxItems: 8, help: 'filter = filter state, theme = unrelated state, rows = parent passes a new rows array' },
    { key: 'memoize', label: 'Use useMemo / useCallback', kind: 'select', default: 'yes', options: ['yes', 'no'] },
  ],
  presets: [
    { label: 'Memoized', input: { triggers: ['theme', 'filter', 'theme', 'rows'], memoize: 'yes' } },
    { label: 'Not memoized', input: { triggers: ['theme', 'filter', 'theme', 'rows'], memoize: 'no' } },
    { label: 'Only theme', input: { triggers: ['theme', 'theme', 'theme'], memoize: 'yes' } },
  ],
  run({ triggers: raw, memoize }) {
    const r = new HookRecorder(code);
    const on = memoize !== 'no';
    const triggers = ['mount', ...raw.map((t) => t.trim().toLowerCase()).filter((t) => VALID.has(t))];
    const cells: string[][] = triggers.map(() => ['·', '·', '·', '·']);
    const tones: Record<string, Tone> = {};
    let filterVal = 'all';
    let rowsNo = 1;
    let visibleNo = 0;
    let cbNo = 0;
    let lastDeps: { rows: number; filter: string; cbFilter: string } | null = null;
    let childProps = { visible: 0, cb: 0 };
    let recomputes = 0;
    let newCallbacks = 0;
    let childRenders = 0;
    const panels = (upto: number) => [
      { type: 'grid' as const, title: 'One row per render', cells: cells.slice(0, upto + 1).map((c) => [...c]), rowLabels: triggers.slice(0, upto + 1).map((_, i) => `render ${i + 1}`), colLabels: COLS, tones: { ...tones } },
      {
        type: 'kv' as const,
        title: 'Inputs right now',
        entries: [
          { k: 'rows (array identity)', v: `rows#${rowsNo}` },
          { k: 'filter', v: filterVal },
          { k: 'visible', v: `array#${visibleNo}` },
          { k: 'onSelect', v: `fn#${cbNo}` },
        ],
      },
    ];
    const setCell = (i: number, c: number, text: string, tone: Tone) => {
      cells[i][c] = text;
      tones[`${i},${c}`] = tone;
    };

    triggers.forEach((t, i) => {
      if (t === 'filter') filterVal = filterVal === 'all' ? 'open' : 'all';
      if (t === 'rows') rowsNo += 1;
      setCell(i, 0, t === 'mount' ? 'mount' : t, 'compare');
      r.step('memo', i === 0 ? 'Render 1 (mount): nothing is cached yet' : `Render ${i + 1}: ${t === 'theme' ? 'theme state changed (not a dependency)' : t === 'filter' ? `filter is now '${filterVal}'` : `parent passed rows#${rowsNo}`}`, panels(i), { render: i + 1 });

      const deps = { rows: rowsNo, filter: filterVal, cbFilter: filterVal };
      const memoChanged = !on || !lastDeps || lastDeps.rows !== deps.rows || lastDeps.filter !== deps.filter;
      if (memoChanged) {
        visibleNo += 1;
        recomputes += 1;
        setCell(i, 1, `recomputed #${visibleNo}`, 'swap');
        r.step('memo', on ? `useMemo: [rows, filter] changed, so applyFilter runs again` : 'No useMemo: applyFilter runs on every render', panels(i), { visible: visibleNo });
      } else {
        setCell(i, 1, `reused #${visibleNo}`, 'done');
        r.step('memo', 'useMemo: [rows, filter] same as last render, cached array reused', panels(i), { visible: visibleNo });
      }
      const cbChanged = !on || !lastDeps || lastDeps.cbFilter !== deps.cbFilter;
      if (cbChanged) {
        cbNo += 1;
        newCallbacks += 1;
        setCell(i, 2, `new fn #${cbNo}`, 'swap');
        r.step('cb', on ? 'useCallback: [filter] changed, a new function is created' : 'No useCallback: a new function is created every render', panels(i), { onSelect: cbNo });
      } else {
        setCell(i, 2, `same fn #${cbNo}`, 'done');
        r.step('cb', 'useCallback: [filter] unchanged, the same function is passed on', panels(i), { onSelect: cbNo });
      }
      lastDeps = deps;
      const propsChanged = childProps.visible !== visibleNo || childProps.cb !== cbNo;
      childProps = { visible: visibleNo, cb: cbNo };
      if (propsChanged) {
        childRenders += 1;
        setCell(i, 3, `rendered (${childRenders})`, 'active');
        r.step('child', 'Table is memo: a prop identity changed, so it renders', panels(i), { tableRenders: childRenders });
      } else {
        setCell(i, 3, 'skipped', 'muted');
        r.step('child', 'Table is memo: both props are identical, render skipped', panels(i), { tableRenders: childRenders });
      }
    });
    r.step('child', `${triggers.length} renders: ${recomputes} recomputes, ${newCallbacks} new callbacks, ${childRenders} Table renders`, panels(triggers.length - 1), { recomputes, newCallbacks, childRenders });
    return { frames: r.frames, result: [recomputes, newCallbacks, childRenders] };
  },
  reference({ triggers, memoize }) {
    const seq = triggers.map((t) => t.trim().toLowerCase()).filter((t) => VALID.has(t));
    const total = seq.length + 1;
    if (memoize === 'no') return [total, total, total];
    const dataChanges = seq.filter((t) => t === 'filter' || t === 'rows').length;
    const filterChanges = seq.filter((t) => t === 'filter').length;
    return [1 + dataChanges, 1 + filterChanges, 1 + dataChanges];
  },
};

const unit: Unit = {
  id: 'hook-usememo',
  hook: 'Everyone says "wrap it in useMemo". Interviewers want to hear what it actually buys you: a stable reference and skipped work, only when the dependencies really stay the same.',
  predict: {
    prompt: 'Parent renders 6 times in total with the same `color` prop. How many times does `compute` run?',
    code: `function Parent({ color }) {
  const style = { color };
  const result = useMemo(() => compute(style), [style]);
  return <Child result={result} />;
}`,
    codeLang: 'jsx',
    options: ['1', '5', '6', '0'],
    answer: 2,
    explain: '`style` is a brand-new object on every render, so Object.is(prevStyle, style) is false each time and the memo never hits. Depend on the primitive instead: [color].',
  },
  viz,
  deeper: {
    points: [
      'useMemo(fn, deps) caches fn() and recomputes only when a dependency changed (Object.is). useCallback(fn, deps) is useMemo(() => fn, deps).',
      'It is an optimisation, not a guarantee: React may drop the cache. Your code must be correct without it.',
      'The main payoff is referential equality: a memoized child (React.memo) only skips rendering if the props it receives are the same references.',
      'Dependencies must be the values the function reads. Objects and arrays created during render are new every time, so use their primitive parts or memoize them too.',
      'Measure before wrapping everything: each memo costs a comparison and some memory, and cheap computations are faster than the bookkeeping.',
    ],
    pitfalls: ['Putting an inline object or array in the dependency array', 'Wrapping a cheap calculation (the memo costs more than it saves)', 'Using useCallback for a function passed to a child that is not memoized (no benefit)'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Squares',
    statement: 'Compute the squares list with useMemo so it only recomputes when `n` changes, not when the theme is toggled. The page shows how many times the computation ran.',
    signature: `function expensiveSquares(n, calls) {
  calls.current += 1;
  return Array.from({ length: n }, (_, i) => i * i);
}

function Squares() {`,
    solution: `function expensiveSquares(n, calls) {
  calls.current += 1;
  return Array.from({ length: n }, (_, i) => i * i);
}

function Squares() {
  const [n, setN] = useState(3);
  const [dark, setDark] = useState(false);
  const calls = @@useRef@@(0);
  const squares = @@useMemo@@(() => expensiveSquares(n, calls), [@@n@@]);
  return (
    <div className={dark ? 'dark' : 'light'}>
      <p>Computed: {calls.current}</p>
      <ul>
        {squares.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <button onClick={() => setN(n + 1)}>More</button>
      <button onClick={() => setDark(!dark)}>Theme</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'computes once on mount', steps: [{ expectText: 'Computed: 1' }, { expectCount: 'li', n: 3 }] },
      { name: 'theme change reuses the cache', steps: [{ click: 'text=Theme' }, { click: 'text=Theme' }, { expectText: 'Computed: 1' }] },
      { name: 'changing n recomputes', steps: [{ click: 'text=More' }, { expectText: 'Computed: 2' }, { expectCount: 'li', n: 4 }] },
      { name: 'cache is kept after the recompute', steps: [{ click: 'text=More' }, { click: 'text=Theme' }, { click: 'text=Theme' }, { expectText: 'Computed: 2' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'FruitSearch',
    statement: 'The search is wrapped in useMemo, yet "Searches" climbs every time the theme button is clicked. Make the memo hit when only the theme changed.',
    buggy: `const WORDS = ['apple', 'apricot', 'banana', 'blueberry', 'cherry'];

function FruitSearch() {
  const [text, setText] = useState('');
  const [dark, setDark] = useState(false);
  const calls = useRef(0);
  const query = { text: text.toLowerCase() };
  const matches = useMemo(() => {
    calls.current += 1;
    return WORDS.filter((w) => w.startsWith(query.text));
  }, [query]);
  return (
    <div className={dark ? 'dark' : 'light'}>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => setDark(!dark)}>Theme</button>
      <p>Searches: {calls.current}</p>
      <ul>
        {matches.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}`,
    fixed: `const WORDS = ['apple', 'apricot', 'banana', 'blueberry', 'cherry'];

function FruitSearch() {
  const [text, setText] = useState('');
  const [dark, setDark] = useState(false);
  const calls = useRef(0);
  const query = text.toLowerCase();
  const matches = useMemo(() => {
    calls.current += 1;
    return WORDS.filter((w) => w.startsWith(query));
  }, [query]);
  return (
    <div className={dark ? 'dark' : 'light'}>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => setDark(!dark)}>Theme</button>
      <p>Searches: {calls.current}</p>
      <ul>
        {matches.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'all fruit and one search at first', steps: [{ expectText: 'Searches: 1' }, { expectCount: 'li', n: 5 }] },
      { name: 'theme does not search again', steps: [{ click: 'text=Theme' }, { expectText: 'Searches: 1' }] },
      { name: 'typing filters and searches once', steps: [{ type: 'input', value: 'ap' }, { expectText: 'Searches: 2' }, { expectCount: 'li', n: 2 }, { click: 'text=Theme' }, { expectText: 'Searches: 2' }] },
    ],
    bugType: 'unstable dependency',
    hint: 'Look at what is in the dependency array and when that value is created.',
    explanation: '`query` is an object literal built during render, so it is a different reference every time and the dependency check always fails. Depend on a primitive (the lower-cased string) and the memo hits whenever the text is unchanged.',
  },
  boss: {
    title: 'Leaderboard that skips work',
    statement:
      'Build `Leaderboard` with players Ada 30, Bo 50, Cy 40 (module constant). Show `Theme: light|dark`, `Sorts: n`, `Selected: none|<name>` and a `<ul>` of rows sorted by score, highest first. Each row is a memoized `Row` component rendering `<li>` with `Name Score - renders: n` (n counts that row\'s renders, via a ref) and a button that reads "Select" ("Selected" for the chosen row). A "Theme" button toggles the theme. Sorting must run once (count it in Sorts) and toggling the theme or selecting a row must only re-render the rows whose props changed.',
    language: 'jsx',
    fnName: 'Leaderboard',
    starter: `function Leaderboard() {
  // your code here
  return null;
}
`,
    solution: `const PLAYERS = [
  { id: 1, name: 'Ada', score: 30 },
  { id: 2, name: 'Bo', score: 50 },
  { id: 3, name: 'Cy', score: 40 },
];

const Row = memo(function Row({ player, selected, onSelect }) {
  const renders = useRef(0);
  renders.current += 1;
  return (
    <li>
      {player.name} {player.score} - renders: {renders.current}
      <button onClick={() => onSelect(player.id)}>{selected ? 'Selected' : 'Select'}</button>
    </li>
  );
});

function Leaderboard() {
  const [selected, setSelected] = useState(null);
  const [dark, setDark] = useState(false);
  const sorts = useRef(0);
  const ranked = useMemo(() => {
    sorts.current += 1;
    return [...PLAYERS].sort((a, b) => b.score - a.score);
  }, []);
  const onSelect = useCallback((id) => setSelected(id), []);
  const chosen = ranked.find((p) => p.id === selected);
  return (
    <div>
      <p>Theme: {dark ? 'dark' : 'light'}</p>
      <p>Sorts: {sorts.current}</p>
      <p>Selected: {chosen ? chosen.name : 'none'}</p>
      <ul>
        {ranked.map((p) => (
          <Row key={p.id} player={p} selected={p.id === selected} onSelect={onSelect} />
        ))}
      </ul>
      <button onClick={() => setDark(!dark)}>Theme</button>
    </div>
  );
}`,
    reactTests: [
      {
        name: 'sorted once',
        steps: [{ expectCount: 'li', n: 3 }, { expectText: 'Bo 50 - renders: 1', in: 'li:nth-child(1)' }, { expectText: 'Cy 40', in: 'li:nth-child(2)' }, { expectText: 'Ada 30', in: 'li:nth-child(3)' }, { expectText: 'Sorts: 1' }, { expectText: 'Selected: none' }],
      },
      { name: 'theme re-renders no row', steps: [{ click: 'text=Theme' }, { expectText: 'Theme: dark' }, { expectText: 'Sorts: 1' }, { expectNoText: 'renders: 2' }] },
      {
        name: 'selecting re-renders only that row',
        steps: [
          { click: 'li:nth-child(2) button' },
          { expectText: 'Selected: Cy' },
          { expectText: 'renders: 1', in: 'li:nth-child(1)' },
          { expectText: 'renders: 2', in: 'li:nth-child(2)' },
          { expectText: 'renders: 1', in: 'li:nth-child(3)' },
        ],
      },
      { name: 'theme after select still skips rows', steps: [{ click: 'li:nth-child(2) button' }, { click: 'text=Theme' }, { expectText: 'renders: 2', in: 'li:nth-child(2)' }, { expectText: 'renders: 1', in: 'li:nth-child(1)' }, { expectText: 'Sorts: 1' }] },
    ],
    hints: ['Three things must keep their identity across renders: the sorted array, the onSelect function, and the Row component itself. Which tool handles each?', 'Wrap Row in memo, compute `ranked` with useMemo(..., []), create onSelect with useCallback((id) => setSelected(id), []), and pass `selected` as a boolean so only the affected rows get new props.'],
    combines: ['hook-usestate', 'hook-useref'],
  },
  quiz: [
    {
      prompt: 'When does wrapping a callback in useCallback actually prevent a child re-render?',
      options: ['Always', 'When the child is memoized and every other prop is stable too', 'Only when the callback has no dependencies', 'Never, it only caches the function body'],
      answer: 1,
      explain: 'useCallback keeps the function reference stable. That only matters to something that compares references, such as a React.memo child.',
    },
  ],
};

export default unit;
