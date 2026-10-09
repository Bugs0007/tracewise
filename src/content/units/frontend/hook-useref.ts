import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, LaneTimeline } from '@/content/lib/frontend-hooks';

const code = `
function Clicker() {
  const bumps = useRef(0);                              //@ref
  const [taps, setTaps] = useState(0);                  //@state
  const onRef = () => { bumps.current += 1; };          //@mutate
  const onState = () => setTaps((t) => t + 1);          //@set
  return <p>ref {bumps.current} / state {taps}</p>;     //@render
}
`;

interface In {
  actions: string[];
}

const screenText = (ref: number, state: number) => `ref ${ref} / state ${state}`;

const viz: VizDef<In> = {
  id: 'hook-useref',
  title: 'useRef: a box that never re-renders',
  code,
  language: 'javascript',
  inputs: [{ key: 'actions', label: 'Clicks', kind: 'strings', default: ['ref', 'ref', 'state', 'ref', 'state'], maxItems: 10, help: 'ref = bump the ref, state = bump the state' }],
  presets: [
    { label: 'Ref only', input: { actions: ['ref', 'ref', 'ref'] } },
    { label: 'State only', input: { actions: ['state', 'state'] } },
    { label: 'Mixed', input: { actions: ['ref', 'ref', 'state', 'ref', 'state'] } },
  ],
  run({ actions: raw }) {
    const r = new HookRecorder(code);
    const actions = raw.map((a) => a.trim().toLowerCase()).filter((a) => a === 'ref' || a === 'state');
    const tl = new LaneTimeline(['ref writes', 'Renders']);
    const screens: string[] = [];
    let ref = 0;
    let state = 0;
    let screen = screenText(0, 0);
    let renders = 1;
    const tMax = actions.length + 2;
    tl.add(1, 0.3, 'R1', 'done');
    screens.push(screen);
    const panels = (now: number, note?: string) => [
      tl.panel(tMax, now, 'What happened when'),
      {
        type: 'kv' as const,
        title: 'Memory (live)',
        entries: [
          { k: 'bumps.current', v: ref, tone: 'swap' as const },
          { k: 'taps (state)', v: state, tone: 'active' as const },
        ],
      },
      { type: 'kv' as const, title: 'Screen (last render)', entries: [{ k: 'text', v: screen, tone: screen === screenText(ref, state) ? ('done' as const) : ('error' as const) }, { k: 'renders so far', v: renders }] },
      ...(note ? [{ type: 'note' as const, text: note, tone: 'compare' as const }] : []),
    ];
    r.step('render', `Render #1: the screen shows "${screen}"`, panels(0.3), { ref, state });
    actions.forEach((a, i) => {
      const t = i + 1;
      if (a === 'ref') {
        ref += 1;
        tl.add(0, t, `${ref}`, 'swap');
        r.step('mutate', `bumps.current = ${ref}. No render is scheduled, screen still says "${screen}"`, panels(t, 'Writing ref.current is silent: React never hears about it.'), { ref, state });
      } else {
        state += 1;
        r.step('set', `setTaps queues a re-render (taps will be ${state})`, panels(t), { ref, state });
        renders += 1;
        screen = screenText(ref, state);
        screens.push(screen);
        tl.add(1, t, `R${renders}`, 'done');
        r.step('render', `Render #${renders} reads bumps.current = ${ref}, so the screen finally shows it`, panels(t), { ref, state });
      }
    });
    const lag = screen !== screenText(ref, state);
    r.step('render', lag ? `End: the screen is stale (shows ref ${screen.split(' ')[1]}, memory has ${ref})` : `End: ${renders} renders, screen matches memory`, panels(tMax - 0.5), { ref, state, renders });
    return { frames: r.frames, result: screens };
  },
  reference({ actions }) {
    const seq = actions.map((a) => a.trim().toLowerCase()).filter((a) => a === 'ref' || a === 'state');
    const out = [screenText(0, 0)];
    seq.forEach((a, i) => {
      if (a !== 'state') return;
      const before = seq.slice(0, i + 1);
      out.push(screenText(before.filter((x) => x === 'ref').length, before.filter((x) => x === 'state').length));
    });
    return out;
  },
};

const unit: Unit = {
  id: 'hook-useref',
  hook: 'useRef is the escape hatch interviewers probe: can you say what belongs in a ref (timer ids, DOM nodes, previous values) and what must be state (anything the screen shows)?',
  predict: {
    prompt: 'The user clicks the button three times. What does it say afterwards?',
    code: `function Clicker() {
  const clicks = useRef(0);
  return (
    <button onClick={() => { clicks.current += 1; }}>
      Clicked {clicks.current}
    </button>
  );
}`,
    codeLang: 'jsx',
    options: ['Clicked 3', 'Clicked 0', 'Clicked 1', 'It throws, refs are read-only'],
    answer: 1,
    explain: 'Changing ref.current is a plain mutation. React is not told, so it never re-renders and the JSX that read clicks.current keeps showing 0. Use state for values that appear on screen.',
  },
  viz,
  deeper: {
    points: [
      'useRef returns the same { current } object on every render. Writing current does not trigger a render.',
      'Refs survive renders like state does, but they are not part of the render snapshot: read and write them in handlers and effects, not while rendering.',
      'DOM refs: <input ref={inputRef} /> fills inputRef.current after commit, so use it in effects or handlers (inputRef.current.focus()).',
      'Typical contents: timer and interval ids, the previous value of a prop, an AbortController, a mutable flag such as "already submitted".',
      'Rule of thumb: if the screen must change when the value changes, it is state. Otherwise a ref avoids a pointless render.',
    ],
    pitfalls: ['Showing ref.current in JSX and expecting it to update', 'Storing a timer id in a plain `let` inside the component (it resets on every render)', 'Reading a DOM ref during render, when it is still null on mount'],
  },
  practice: {
    language: 'jsx',
    fnName: 'PrevValue',
    statement: 'Show the current value and the value from the previous render ("none" at first). Store the previous value in a ref that is updated after each render.',
    signature: 'function PrevValue() {',
    solution: `function PrevValue() {
  const [value, setValue] = useState(@@0@@);
  const prev = useRef(@@null@@);
  useEffect(() => {
    @@prev.current = value;@@
  });
  return (
    <div>
      <p>Now: {value}</p>
      <p>Before: {String(prev.current ?? 'none')}</p>
      <button onClick={() => setValue(value + 1)}>Next</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'nothing before the first value', steps: [{ expectText: 'Now: 0' }, { expectText: 'Before: none' }] },
      { name: 'previous follows current', steps: [{ click: 'text=Next' }, { expectText: 'Now: 1' }, { expectText: 'Before: 0' }] },
      { name: 'keeps following', steps: [{ click: 'text=Next' }, { click: 'text=Next' }, { expectText: 'Now: 2' }, { expectText: 'Before: 1' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Pulse',
    statement: 'Start begins a timer and Stop should end it, but "Live timers" stays at 1 after Stop and the beats keep coming. Fix it.',
    buggy: `const live = new Set();
function startTimer(fn, ms) {
  const id = setInterval(fn, ms);
  live.add(id);
  return id;
}
function stopTimer(id) {
  clearInterval(id);
  live.delete(id);
}

function Pulse() {
  const [beats, setBeats] = useState(0);
  const [running, setRunning] = useState(false);
  let timer = null;
  const start = () => {
    timer = startTimer(() => setBeats((b) => b + 1), 5);
    setRunning(true);
  };
  const stop = () => {
    stopTimer(timer);
    setRunning(false);
  };
  return (
    <div>
      <p>Status: {running ? 'running' : 'stopped'}</p>
      <p>Live timers: {live.size}</p>
      <p>Beats: {beats}</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}`,
    fixed: `const live = new Set();
function startTimer(fn, ms) {
  const id = setInterval(fn, ms);
  live.add(id);
  return id;
}
function stopTimer(id) {
  clearInterval(id);
  live.delete(id);
}

function Pulse() {
  const [beats, setBeats] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);
  const start = () => {
    timer.current = startTimer(() => setBeats((b) => b + 1), 5);
    setRunning(true);
  };
  const stop = () => {
    stopTimer(timer.current);
    setRunning(false);
  };
  return (
    <div>
      <p>Status: {running ? 'running' : 'stopped'}</p>
      <p>Live timers: {live.size}</p>
      <p>Beats: {beats}</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'idle at first', steps: [{ expectText: 'Status: stopped' }, { expectText: 'Live timers: 0' }] },
      { name: 'start creates one timer', steps: [{ click: 'text=Start' }, { expectText: 'Status: running' }, { expectText: 'Live timers: 1' }, { click: 'text=Stop' }, { expectText: 'Live timers: 0' }] },
      { name: 'stop really stops it', steps: [{ click: 'text=Start' }, { click: 'text=Stop' }, { expectText: 'Status: stopped' }, { expectText: 'Live timers: 0' }] },
    ],
    bugType: 'lost across renders',
    hint: 'Every re-render runs the component function again. What happens to a `let timer` declared in it?',
    explanation: 'Each beat re-renders Pulse, which creates a brand-new `timer = null`. The stop handler you click belongs to a later render and sees null, so clearInterval(null) does nothing. A ref keeps the id between renders without causing renders.',
  },
  boss: {
    title: 'Stopwatch',
    statement:
      'Build `Stopwatch`. It shows `Ticks: n` (starts at 0) and `Status: running` or `Status: stopped`. "Start" begins adding 1 to the ticks every 5 ms (starting twice must not double the speed). "Stop" freezes the ticks. "Reset" stops the timer and sets the ticks to 0. Keep the timer id in a ref and clear the timer if the component unmounts.',
    language: 'jsx',
    fnName: 'Stopwatch',
    starter: `function Stopwatch() {
  // your code here
  return null;
}
`,
    solution: `function Stopwatch() {
  const [ticks, setTicks] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const start = () => {
    if (timer.current !== null) return;
    timer.current = setInterval(() => setTicks((t) => t + 1), 5);
    setRunning(true);
  };
  const stop = () => {
    clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  };
  const reset = () => {
    stop();
    setTicks(0);
  };
  return (
    <div>
      <p>Ticks: {ticks}</p>
      <p>Status: {running ? 'running' : 'stopped'}</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts stopped at zero', steps: [{ expectText: 'Ticks: 0' }, { expectText: 'Status: stopped' }] },
      { name: 'start ticks', steps: [{ click: 'text=Start' }, { expectText: 'Status: running' }, { expectNoText: 'Ticks: 0' }] },
      { name: 'stop changes the status', steps: [{ click: 'text=Start' }, { click: 'text=Stop' }, { expectText: 'Status: stopped' }, { expectNoText: 'Ticks: 0' }] },
      { name: 'reset really clears the timer', steps: [{ click: 'text=Start' }, { click: 'text=Stop' }, { click: 'text=Reset' }, { click: 'text=Start' }, { click: 'text=Reset' }, { click: 'text=Reset' }, { expectText: 'Ticks: 0' }, { expectText: 'Status: stopped' }] },
    ],
    hints: ['A timer id has to survive re-renders without causing one. Which hook gives you a box like that?', 'Keep `timer = useRef(null)`. Start stores setInterval(...) in timer.current (skip if it is already set), stop clears it and nulls it. Add useEffect(() => () => clearInterval(timer.current), []) for unmount.'],
    combines: ['hook-useeffect', 'hook-usestate'],
  },
  quiz: [
    {
      prompt: 'Which value is best kept in a ref rather than state?',
      options: ['The text in a controlled input', 'The id returned by setInterval', 'The list of todos to display', 'Whether a modal is open'],
      answer: 1,
      explain: 'A timer id is never shown on screen and must survive renders, which is exactly what a ref is for.',
    },
  ],
};

export default unit;
