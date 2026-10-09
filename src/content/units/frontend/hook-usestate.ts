import type { ListItem, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, LaneTimeline, clampInt } from '@/content/lib/frontend-hooks';

const code = `
function ValueCounter() {                              //@vfn
  const [count, setCount] = useState(0);               //@vstate
  function addThree() {                                //@vclick
    setCount(count + 1);                               //@v1
    setCount(count + 1);                               //@v2
    setCount(count + 1);                               //@v3
  }
  return <button onClick={addThree}>{count}</button>;  //@vrender
}

function FnCounter() {                                 //@ffn
  const [count, setCount] = useState(0);               //@fstate
  function addThree() {                                //@fclick
    setCount(c => c + 1);                              //@f1
    setCount(c => c + 1);                              //@f2
    setCount(c => c + 1);                              //@f3
  }
  return <button onClick={addThree}>{count}</button>;  //@frender
}
`;

interface In {
  mode: string;
  clicks: number;
}

const viz: VizDef<In> = {
  id: 'hook-usestate',
  title: 'Batched updates & render snapshots',
  code,
  language: 'javascript',
  inputs: [
    { key: 'mode', label: 'Update style', kind: 'select', default: 'value', options: ['value', 'functional'], help: 'value = setCount(count + 1), functional = setCount(c => c + 1)' },
    { key: 'clicks', label: 'Clicks', kind: 'number', default: 1, help: '1 to 4' },
  ],
  presets: [
    { label: 'Stale value', input: { mode: 'value', clicks: 1 } },
    { label: 'Functional', input: { mode: 'functional', clicks: 1 } },
    { label: 'Value, 2 clicks', input: { mode: 'value', clicks: 2 } },
    { label: 'Functional, 2 clicks', input: { mode: 'functional', clicks: 2 } },
  ],
  run({ mode, clicks: rawClicks }) {
    const r = new HookRecorder(code);
    const isValue = mode !== 'functional';
    const p = isValue ? 'v' : 'f';
    const clicks = clampInt(rawClicks, 1, 4, 1);
    const tl = new LaneTimeline(['Renders', 'Handler']);
    const queue: ListItem[] = [];
    let state = 0;
    let renderNo = 1;
    tl.add(0, 0, 'count=0', 'done', 1);

    const panels = (snap: number, now: number) => [
      tl.panel(clicks + 1, now, 'Render snapshots'),
      { type: 'list' as const, title: 'Queued updates (this click)', orientation: 'horizontal' as const, items: queue.map((q) => ({ ...q })), startLabel: 'first', emptyText: 'none yet' },
      {
        type: 'kv' as const,
        title: 'Values',
        entries: [
          { k: 'count in the handler', v: snap, tone: 'compare' as const },
          { k: 'state held by React', v: state, tone: 'active' as const },
        ],
      },
    ];

    r.step(`${p}state`, 'Render #1: useState(0) hands this render count = 0', panels(0, 0.5), { count: 0 });
    for (let k = 0; k < clicks; k++) {
      const snap = state;
      queue.length = 0;
      tl.add(1, k + 0.5, 'click', 'swap');
      r.step(`${p}click`, `Click: addThree runs and sees count = ${snap} from its render`, panels(snap, k + 0.5), { count: snap });
      for (let i = 1; i <= 3; i++) {
        queue.push({ label: isValue ? `set ${snap + 1}` : 'c => c + 1', tone: 'frontier' });
        r.step(
          `${p}${i}`,
          isValue ? `setCount(${snap} + 1) queues "set to ${snap + 1}"; count is still ${snap}` : `setCount(c => c + 1) queues an updater; count is still ${snap}`,
          panels(snap, k + 0.5),
          { count: snap, queued: queue.length },
        );
      }
      r.step(`${p}click`, 'Handler ends: React batches all 3 updates into one render', panels(snap, k + 0.5), { count: snap, queued: 3 });
      for (let i = 0; i < 3; i++) {
        const prev = state;
        state = isValue ? snap + 1 : state + 1;
        queue.forEach((q, j) => (q.tone = j < i ? 'done' : j === i ? 'active' : 'frontier'));
        r.step(
          `${p}${i + 1}`,
          isValue ? `Replay "set to ${snap + 1}": state ${prev} → ${state}` : `Replay c => c + 1 on ${prev}: state → ${state}`,
          panels(snap, k + 0.5),
          { state },
        );
      }
      queue.forEach((q) => (q.tone = 'done'));
      renderNo++;
      tl.add(0, k + 1, `count=${state}`, 'done', 1);
      r.step(`${p}render`, `Render #${renderNo}: count = ${state}${isValue ? ' (three updates, one +1)' : ''}`, panels(state, k + 1), { count: state });
    }
    return { frames: r.frames, result: state };
  },
  reference({ mode, clicks }) {
    const n = clampInt(clicks, 1, 4, 1);
    return mode === 'functional' ? 3 * n : n;
  },
};

const unit: Unit = {
  id: 'hook-usestate',
  hook: 'Interviewers love `setCount(count + 1)` called three times: it separates people who memorised the API from people who know that each render is a snapshot and updates are queued, not applied.',
  predict: {
    prompt: 'The button starts at 0. What does it show after ONE click?',
    code: `function Counter() {
  const [count, setCount] = useState(0);
  const handle = () => {
    setCount(count + 1);
    setCount(count + 1);
    setCount(c => c + 1);
  };
  return <button onClick={handle}>{count}</button>;
}`,
    codeLang: 'jsx',
    options: ['1', '2', '3', '0'],
    answer: 1,
    explain: 'The queue is: set to 1, set to 1, then c => c + 1. Replayed in order: 0 → 1 → 1 → 2. The first two ignore each other because both used the stale count = 0 from this render.',
  },
  viz,
  deeper: {
    points: [
      'Every render is a snapshot: `count` inside a handler is a constant for that render. setCount does not change it.',
      'Updates are queued and applied together after the handler finishes (automatic batching, also inside timeouts and promises in React 18).',
      'setCount(value) replaces the state; setCount(fn) receives the latest queued state, so it is safe for repeated or async updates.',
      'If the new value is identical (Object.is), React bails out. A mutated object or array keeps its identity, so the screen never updates.',
      'Storing a function in state needs a wrapper: setFn(() => myFn), otherwise React calls it as an updater.',
    ],
    pitfalls: ['Reading state right after calling the setter and expecting the new value', 'Mutating an array or object in state and calling the setter with the same reference', 'Using setCount(count + 1) inside setTimeout or an interval with an empty dependency array'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Counter',
    statement: 'Make the "+3" button add exactly 3 to the count, using three separate setCount calls in one handler. Reset sets it back to 0.',
    signature: 'function Counter() {',
    solution: `function Counter() {
  const [count, setCount] = useState(@@0@@);
  const addThree = () => {
    setCount(@@c => c + 1@@);
    setCount(@@c => c + 1@@);
    setCount(@@c => c + 1@@);
  };
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={addThree}>+3</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts at 0', steps: [{ expectText: 'Count: 0' }] },
      { name: '+3 adds three', steps: [{ click: 'text=+3' }, { expectText: 'Count: 3' }] },
      { name: 'two clicks', steps: [{ click: 'text=+3' }, { click: 'text=+3' }, { expectText: 'Count: 6' }] },
      { name: 'reset', steps: [{ click: 'text=+3' }, { click: 'text=Reset' }, { expectText: 'Count: 0' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Counter',
    statement: 'The "+3" button only ever adds 1. Fix the handler so each click adds 3.',
    buggy: `function Counter() {
  const [count, setCount] = useState(0);
  const addThree = () => {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  };
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={addThree}>+3</button>
    </div>
  );
}`,
    fixed: `function Counter() {
  const [count, setCount] = useState(0);
  const addThree = () => {
    setCount((c) => c + 1);
    setCount((c) => c + 1);
    setCount((c) => c + 1);
  };
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={addThree}>+3</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts at 0', steps: [{ expectText: 'Count: 0' }] },
      { name: 'one click adds 3', steps: [{ click: 'text=+3' }, { expectText: 'Count: 3' }] },
      { name: 'two clicks add 6', steps: [{ click: 'text=+3' }, { click: 'text=+3' }, { expectText: 'Count: 6' }] },
    ],
    bugType: 'stale closure',
    hint: 'All three calls read the same `count` variable. What value does it hold during this render?',
    explanation: 'Inside one render `count` never changes, so each call queues "set to count + 1" with the same number. Use the functional form so every update starts from the previous queued result.',
  },
  boss: {
    title: 'Scoreboard with undo',
    statement:
      'Build `ScoreBoard`. It shows `Score: n` and `Moves: m` (both start at 0). Buttons: "+1" and "+3" add that many points and count as one move each. "Undo" reverts the last move (does nothing at the start). "Reset" goes back to the beginning. Keep a history so Undo is exact.',
    language: 'jsx',
    fnName: 'ScoreBoard',
    starter: `function ScoreBoard() {
  // your code here
  return null;
}
`,
    solution: `function ScoreBoard() {
  const [history, setHistory] = useState([0]);
  const score = history[history.length - 1];
  const add = (n) => setHistory((h) => [...h, h[h.length - 1] + n]);
  const undo = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  return (
    <div>
      <p>Score: {score}</p>
      <p>Moves: {history.length - 1}</p>
      <button onClick={() => add(1)}>+1</button>
      <button onClick={() => add(3)}>+3</button>
      <button onClick={undo}>Undo</button>
      <button onClick={() => setHistory([0])}>Reset</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts empty', steps: [{ expectText: 'Score: 0' }, { expectText: 'Moves: 0' }] },
      { name: 'adds points', steps: [{ click: 'text=+1' }, { click: 'text=+3' }, { expectText: 'Score: 4' }, { expectText: 'Moves: 2' }] },
      { name: 'undo reverts the last move', steps: [{ click: 'text=+1' }, { click: 'text=+3' }, { click: 'text=Undo' }, { expectText: 'Score: 1' }, { expectText: 'Moves: 1' }] },
      { name: 'undo at start is harmless', steps: [{ click: 'text=Undo' }, { expectText: 'Score: 0' }, { expectText: 'Moves: 0' }] },
      { name: 'reset', steps: [{ click: 'text=+3' }, { click: 'text=+3' }, { click: 'text=Reset' }, { expectText: 'Score: 0' }, { expectText: 'Moves: 0' }] },
    ],
    hints: ['Undo needs more than the latest number. What single piece of state remembers every past score?', 'Keep an array `history` starting at [0]. Derive score from its last item and moves from its length. Update with setHistory(h => ...) so no update reads a stale value.'],
    combines: ['hook-usestate'],
  },
  quiz: [
    {
      prompt: 'Inside a click handler you call setName("Ada") and then console.log(name). What is logged?',
      options: ['"Ada"', 'The value from before the click', 'undefined', 'It depends on batching'],
      answer: 1,
      explain: 'name is a constant of the current render. The new value only exists in the next render.',
    },
  ],
};

export default unit;
