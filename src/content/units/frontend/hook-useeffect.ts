import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, LaneTimeline } from '@/content/lib/frontend-hooks';

const code = `
function Chat({ room }) {                    //@fn
  useEffect(() => {                          //@effect
    subscribe(room);                         //@run
    return () => unsubscribe(room);          //@cleanup
  }, [room]); // none = every render, [] = mount only   //@deps
  return <h1>{room}</h1>;                    //@render
}
`;

interface In {
  deps: string;
  script: string[];
  strict: string;
}

type Step =
  | { kind: 'render'; room: string; n: number }
  | { kind: 'cleanup'; room: string; why: 'deps' | 'unmount' | 'strict' }
  | { kind: 'run'; room: string; again?: boolean }
  | { kind: 'skip'; room: string; live: string };

/** Expand the script into the sequence of rooms rendered, and whether the component was unmounted. */
function parseScript(script: string[]): { rooms: string[]; unmounted: boolean } {
  const rooms = ['a'];
  for (const raw of script) {
    const tok = raw.trim().toLowerCase();
    if (tok === 'unmount') return { rooms, unmounted: true };
    rooms.push(/^[a-z]$/.test(tok) ? tok : rooms[rooms.length - 1]);
  }
  return { rooms, unmounted: false };
}

const viz: VizDef<In> = {
  id: 'hook-useeffect',
  title: 'Effect timing: run, skip, cleanup',
  code,
  language: 'javascript',
  inputs: [
    { key: 'deps', label: 'Dependency array', kind: 'select', default: '[room]', options: ['every-render', 'mount-only', '[room]'], help: 'every-render = no array, mount-only = [], [room] = depends on room' },
    { key: 'script', label: 'What happens next', kind: 'strings', default: ['tick', 'b', 'tick', 'unmount'], maxItems: 8, help: 'tick = re-render, a letter = room changes to it, unmount' },
    { key: 'strict', label: 'StrictMode (dev)', kind: 'select', default: 'off', options: ['off', 'on'] },
  ],
  presets: [
    { label: '[room]', input: { deps: '[room]', script: ['tick', 'b', 'tick', 'unmount'], strict: 'off' } },
    { label: 'Mount only []', input: { deps: 'mount-only', script: ['b', 'tick', 'unmount'], strict: 'off' } },
    { label: 'Every render', input: { deps: 'every-render', script: ['tick', 'tick', 'unmount'], strict: 'off' } },
    { label: 'StrictMode dev', input: { deps: '[room]', script: ['b'], strict: 'on' } },
  ],
  run({ deps: mode, script, strict }) {
    const r = new HookRecorder(code);
    const { rooms, unmounted } = parseScript(script);
    const isStrict = strict === 'on';

    // 1. Pure model: turn the script into an ordered list of phases.
    const steps: Step[] = [];
    let live: string | null = null;
    let prevDeps: unknown[] | undefined;
    rooms.forEach((room, i) => {
      steps.push({ kind: 'render', room, n: i + 1 });
      const nextDeps = mode === 'every-render' ? undefined : mode === 'mount-only' ? [] : [room];
      const rerun = i === 0 || !nextDeps || !prevDeps || nextDeps.length !== prevDeps.length || nextDeps.some((d, k) => !Object.is(d, prevDeps![k]));
      if (rerun) {
        if (live !== null) steps.push({ kind: 'cleanup', room: live, why: 'deps' });
        steps.push({ kind: 'run', room });
        if (i === 0 && isStrict) {
          steps.push({ kind: 'cleanup', room, why: 'strict' });
          steps.push({ kind: 'run', room, again: true });
        }
        live = room;
      } else {
        steps.push({ kind: 'skip', room, live: live! });
      }
      prevDeps = nextDeps;
    });
    if (unmounted && live !== null) steps.push({ kind: 'cleanup', room: live, why: 'unmount' });

    // 2. Replay the phases as frames.
    const tl = new LaneTimeline(['Render', 'Cleanup', 'Effect']);
    const lines: { text: string; tone?: 'found' | 'swap' }[] = [];
    let subscribed: string | null = null;
    let shown = 'a';
    const depText = mode === 'every-render' ? 'none (every render)' : mode === 'mount-only' ? '[]' : '[room]';
    const panels = (now: number) => [
      tl.panel(steps.length, now, 'Phases in order'),
      { type: 'log' as const, title: 'Effect log', lines: lines.map((l) => ({ ...l })) },
      {
        type: 'kv' as const,
        title: 'State',
        entries: [
          { k: 'room on screen', v: shown },
          { k: 'subscribed to', v: subscribed ?? 'nothing' },
          { k: 'deps', v: depText },
          { k: 'StrictMode', v: isStrict ? 'on (dev)' : 'off' },
        ],
      },
    ];
    steps.forEach((s, idx) => {
      const now = idx + 0.5;
      switch (s.kind) {
        case 'render':
          shown = s.room;
          tl.add(0, now, s.room, 'compare');
          r.step('render', `Render #${s.n}: room = '${s.room}'${s.n === 1 ? ' (mount)' : ''}`, panels(now), { room: s.room });
          break;
        case 'cleanup':
          tl.add(1, now, s.room, 'swap');
          lines.push({ text: `unsubscribe('${s.room}')`, tone: 'swap' });
          subscribed = null;
          r.step(
            'cleanup',
            s.why === 'deps' ? `Deps changed: cleanup runs first, with the OLD room '${s.room}'` : s.why === 'unmount' ? `Unmount: cleanup runs, unsubscribe('${s.room}')` : 'StrictMode (dev only): React simulates an unmount, cleanup runs',
            panels(now),
            { room: s.room },
          );
          break;
        case 'run':
          tl.add(2, now, s.room, 'found');
          lines.push({ text: `subscribe('${s.room}')`, tone: 'found' });
          subscribed = s.room;
          r.step('run', s.again ? `StrictMode remounts: effect runs again, subscribe('${s.room}')` : `Effect runs after paint: subscribe('${s.room}')`, panels(now), { room: s.room });
          break;
        case 'skip':
          r.step('deps', mode === 'mount-only' ? `deps [] never change: skipped, still subscribed to '${s.live}'${s.live !== s.room ? ` while UI shows '${s.room}'` : ''}` : `deps ['${s.room}'] unchanged: effect skipped`, panels(now), { room: s.room });
          break;
      }
    });
    const runs = lines.filter((l) => l.tone === 'found').length;
    r.step('render', `Done: ${runs} subscribe, ${lines.length - runs} unsubscribe${unmounted ? '' : ' (still mounted)'}`, panels(steps.length), { runs });
    return { frames: r.frames, result: lines.map((l) => l.text) };
  },
  reference({ deps, script, strict }) {
    const { rooms, unmounted } = parseScript(script);
    const out: string[] = [];
    let live = '';
    rooms.forEach((room, i) => {
      const should = i === 0 || deps === 'every-render' || (deps === '[room]' && room !== rooms[i - 1]);
      if (!should) return;
      if (i > 0) out.push(`unsubscribe('${live}')`);
      out.push(`subscribe('${room}')`);
      if (i === 0 && strict === 'on') out.push(`unsubscribe('${room}')`, `subscribe('${room}')`);
      live = room;
    });
    if (unmounted) out.push(`unsubscribe('${live}')`);
    return out;
  },
};

const unit: Unit = {
  id: 'hook-useeffect',
  hook: 'useEffect questions test whether you can predict WHEN code runs. Dependency arrays, cleanup order and the StrictMode double run are the classic ways to get that wrong.',
  predict: {
    prompt: 'The component first renders with id = 1, then re-renders with id = 2. What is logged, in order?',
    code: `function Item({ id }) {
  useEffect(() => {
    console.log('run', id);
    return () => console.log('cleanup', id);
  }, [id]);
  return <p>{id}</p>;
}`,
    codeLang: 'jsx',
    options: ['run 1, run 2', 'run 1, cleanup 1, run 2', 'run 1, cleanup 2, run 2', 'run 1, run 2, cleanup 1'],
    answer: 1,
    explain: 'Mount logs run 1. When id changes, React renders with id = 2, then runs the previous effect\'s cleanup (which still closes over id = 1), and only then the new effect: cleanup 1, run 2.',
  },
  viz,
  deeper: {
    points: [
      'No array: the effect runs after every render. `[]`: after mount only. `[x]`: after mount and whenever x changed (Object.is).',
      'Cleanup runs before the next run of the same effect and on unmount. It closes over the values of the render that created it.',
      'Effects run after the browser has painted. Use useLayoutEffect only when you must measure or mutate the DOM before paint.',
      'In development StrictMode mounts, unmounts and remounts once to expose missing cleanup. Production runs the effect once. If a double run breaks your code, the cleanup is wrong.',
      'Async work needs a guard in the cleanup (an ignore flag or AbortController) so a slow, stale response cannot overwrite a newer one.',
    ],
    pitfalls: ['Leaving a value out of the dependency array (stale value inside the effect)', 'Putting an object or function created during render in the deps (the effect re-runs every render)', 'Starting a timer or subscription without returning a cleanup (they stack up)'],
  },
  practice: {
    language: 'jsx',
    fnName: 'RoomLog',
    statement: 'Log "join <room>" when the room is entered and "leave <room>" from the effect cleanup. The effect must re-run only when the room changes, not when the ping counter changes.',
    signature: 'function RoomLog() {',
    solution: `function RoomLog() {
  const [room, setRoom] = useState('lobby');
  const [pings, setPings] = useState(0);
  const [log, setLog] = useState([]);
  useEffect(() => {
    setLog((l) => [...l, 'join ' + @@room@@]);
    return @@() => setLog((l) => [...l, 'leave ' + room])@@;
  }, [@@room@@]);
  return (
    <div>
      <p>Room: {room}</p>
      <p>Pings: {pings}</p>
      <button className="go" onClick={() => setRoom('arena')}>Go to arena</button>
      <button className="ping" onClick={() => setPings(pings + 1)}>Ping</button>
      <ul>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}`,
    skeleton: `function RoomLog() {
  const [room, setRoom] = useState('lobby');
  const [pings, setPings] = useState(0);
  const [log, setLog] = useState([]);
  useEffect(() => {
    // TODO: add "join <room>" to the log, return a cleanup that adds "leave <room>"
  }, []);
  return (
    <div>
      <p>Room: {room}</p>
      <p>Pings: {pings}</p>
      <button className="go" onClick={() => setRoom('arena')}>Go to arena</button>
      <button className="ping" onClick={() => setPings(pings + 1)}>Ping</button>
      <ul>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'joins the first room on mount', steps: [{ expectCount: 'li', n: 1 }, { expectText: 'join lobby', in: 'li:nth-child(1)' }] },
      {
        name: 'leaving runs cleanup before the next join',
        steps: [{ click: '.go' }, { expectCount: 'li', n: 3 }, { expectText: 'leave lobby', in: 'li:nth-child(2)' }, { expectText: 'join arena', in: 'li:nth-child(3)' }],
      },
      { name: 'unrelated state does not re-run the effect', steps: [{ click: '.ping' }, { click: '.ping' }, { expectText: 'Pings: 2' }, { expectCount: 'li', n: 1 }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Ticker',
    statement: 'Switching speed should replace the running timer, so "Active timers" always reads 1. After a few switches it keeps growing. Find the leak.',
    buggy: `const timers = { active: 0 };
function startTimer(fn, ms) {
  timers.active += 1;
  const id = setInterval(fn, ms);
  return () => {
    timers.active -= 1;
    clearInterval(id);
  };
}

function Ticker() {
  const [fast, setFast] = useState(false);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    startTimer(() => setTicks((t) => t + 1), fast ? 4 : 8);
  }, [fast]);
  return (
    <div>
      <p>Active timers: {timers.active}</p>
      <p>Ticks: {ticks}</p>
      <button onClick={() => setFast(!fast)}>Switch speed</button>
    </div>
  );
}`,
    fixed: `const timers = { active: 0 };
function startTimer(fn, ms) {
  timers.active += 1;
  const id = setInterval(fn, ms);
  return () => {
    timers.active -= 1;
    clearInterval(id);
  };
}

function Ticker() {
  const [fast, setFast] = useState(false);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    return startTimer(() => setTicks((t) => t + 1), fast ? 4 : 8);
  }, [fast]);
  return (
    <div>
      <p>Active timers: {timers.active}</p>
      <p>Ticks: {ticks}</p>
      <button onClick={() => setFast(!fast)}>Switch speed</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'one timer after mount', steps: [{ expectText: 'Active timers: 1' }] },
      { name: 'switching replaces the timer', steps: [{ click: 'text=Switch speed' }, { expectText: 'Active timers: 1' }] },
      { name: 'still one after several switches', steps: [{ click: 'text=Switch speed' }, { click: 'text=Switch speed' }, { click: 'text=Switch speed' }, { expectText: 'Active timers: 1' }] },
    ],
    bugType: 'missing cleanup',
    hint: 'startTimer returns a function that stops the timer. Where does that function end up?',
    explanation: 'The effect called startTimer but never returned the stop function, so React had no cleanup to run when `fast` changed. Every switch started another interval on top of the old ones. Return the stop function from the effect.',
  },
  boss: {
    title: 'Search that ignores stale answers',
    statement:
      'The shell of `Search` is given: the "Type fast" button sets the query to "r" and, a tick later, to "re". `fakeSearch("r")` is slow and `fakeSearch("re")` is fast, so the slow answer arrives last. Add one effect: when `query` is non-empty show "Loading..." then the answer, but never let an answer for an outdated query overwrite a newer one. The final text must be "Results for [re]".',
    language: 'jsx',
    fnName: 'Search',
    starter: `function fakeSearch(query) {
  const delay = query.length === 1 ? 16 : 3;
  return new Promise((resolve) => setTimeout(() => resolve('Results for [' + query + ']'), delay));
}

function Search() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('Idle');
  const burst = () => {
    setQuery('r');
    setTimeout(() => setQuery('re'), 0);
  };
  // your effect here
  return (
    <div>
      <button onClick={burst}>Type fast</button>
      <p>Query: {query}</p>
      <p>{result}</p>
    </div>
  );
}
`,
    solution: `function fakeSearch(query) {
  const delay = query.length === 1 ? 16 : 3;
  return new Promise((resolve) => setTimeout(() => resolve('Results for [' + query + ']'), delay));
}

function Search() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('Idle');
  const burst = () => {
    setQuery('r');
    setTimeout(() => setQuery('re'), 0);
  };
  useEffect(() => {
    if (!query) return;
    let ignore = false;
    setResult('Loading...');
    fakeSearch(query).then((res) => {
      if (!ignore) setResult(res);
    });
    return () => {
      ignore = true;
    };
  }, [query]);
  return (
    <div>
      <button onClick={burst}>Type fast</button>
      <p>Query: {query}</p>
      <p>{result}</p>
    </div>
  );
}`,
    reactTests: [
      { name: 'idle at first', steps: [{ expectText: 'Idle' }, { expectNoText: 'Loading' }] },
      { name: 'newest answer wins', steps: [{ click: 'text=Type fast' }, { expectText: 'Query: re' }, { expectText: 'Results for [re]' }] },
      { name: 'stale answer never shows', steps: [{ click: 'text=Type fast' }, { expectNoText: 'Results for [r]' }, { expectNoText: 'Loading' }] },
    ],
    hints: ['Both requests are in flight at once. What can the cleanup of the first effect do to say "my answer is old"?', 'Declare `let ignore = false` inside the effect, set it to true in the returned cleanup, and only call setResult when ignore is still false. Depend on [query].'],
    combines: ['hook-usestate'],
  },
  quiz: [
    {
      prompt: 'Which dependency array makes an effect run once after mount and once more only if `userId` changes?',
      options: ['No array', '[]', '[userId]', '[userId, userId]'],
      answer: 2,
      explain: '[userId] runs on mount and after any render where userId differs from the previous render (Object.is).',
    },
  ],
};

export default unit;
