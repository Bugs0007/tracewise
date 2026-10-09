import type { ListItem, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, show } from '@/content/lib/frontend-hooks';

const code = `
function Profile({ admin }) {
  const [name] = useState('Ada');          //@name
  if (admin) {                             //@cond
    const [role] = useState('admin');      //@role
  }
  const [count] = useState(7);             //@count
  return <p>{name} {count}</p>;            //@render
}
`;

interface In {
  admin: string[];
}

interface Call {
  name: string;
  init: unknown;
  cond?: boolean;
}
const CALLS: Call[] = [
  { name: 'name', init: 'Ada' },
  { name: 'role', init: 'admin', cond: true },
  { name: 'count', init: 7 },
];

const flagsOf = (raw: string[]): boolean[] => raw.map((s) => s.trim().toLowerCase()).filter((s) => s === 'true' || s === 'false').map((s) => s === 'true');

const viz: VizDef<In> = {
  id: 'hook-rules',
  title: 'Hooks are matched by call order',
  code,
  language: 'javascript',
  inputs: [{ key: 'admin', label: 'admin prop per render', kind: 'strings', default: ['true', 'false'], maxItems: 6, help: 'true or false for each render' }],
  presets: [
    { label: 'Condition flips off', input: { admin: ['true', 'false'] } },
    { label: 'Condition flips on', input: { admin: ['false', 'true'] } },
    { label: 'Condition never changes', input: { admin: ['true', 'true', 'true'] } },
  ],
  run({ admin }) {
    const r = new HookRecorder(code);
    const flags = flagsOf(admin);
    if (!flags.length) flags.push(true);
    const slots: { label: string; value: unknown }[] = [];
    const statuses: string[] = [];
    const slotTones: Record<number, Tone> = {};
    let got: ListItem[] = [];
    const panels = () => [
      {
        type: 'list' as const,
        title: 'React stores hook state by position',
        orientation: 'vertical' as const,
        startLabel: 'slot #0',
        items: slots.map((s, i) => ({ label: `slot #${i} (created by ${s.label})`, sub: show(s.value), tone: slotTones[i] })),
        emptyText: 'no slots yet',
      },
      { type: 'list' as const, title: 'Hook calls this render', orientation: 'vertical' as const, items: got.map((g) => ({ ...g })), emptyText: 'none yet' },
    ];
    for (let k = 0; k < flags.length; k++) {
      const calls = CALLS.filter((c) => !c.cond || flags[k]);
      got = [];
      Object.keys(slotTones).forEach((key) => delete slotTones[Number(key)]);
      r.step('cond', `Render ${k + 1}: admin = ${flags[k]}, so ${calls.length} hooks will run`, panels(), { admin: flags[k] });
      let failed: string | null = null;
      for (let i = 0; i < calls.length && !failed; i++) {
        const c = calls[i];
        const at = c.name;
        if (k === 0) {
          slots.push({ label: c.name, value: c.init });
          slotTones[i] = 'new';
          got.push({ label: `${c.name} = useState(${show(c.init)})`, sub: `slot #${i}`, tone: 'new' });
          r.step(at, `First render: ${c.name} claims slot #${i} with ${show(c.init)}`, panels(), { slot: i });
        } else if (i >= slots.length) {
          slotTones[i] = 'error';
          got.push({ label: `${c.name} = useState(${show(c.init)})`, sub: `no slot #${i}`, tone: 'error' });
          failed = 'more';
          r.step(at, `${c.name} wants slot #${i} but it does not exist: more hooks than last render`, panels(), { slot: i });
        } else {
          const bad = slots[i].label !== c.name;
          slotTones[i] = bad ? 'error' : 'compare';
          got.push({ label: `${c.name} = useState(${show(c.init)})`, sub: `reads slot #${i}: ${show(slots[i].value)}`, tone: bad ? 'error' : 'done' });
          r.step(at, bad ? `${c.name} reads slot #${i} and gets ${show(slots[i].value)} instead of ${show(c.init)}` : `${c.name} reads slot #${i}: ${show(slots[i].value)}`, panels(), { slot: i });
        }
      }
      if (!failed && calls.length < slots.length) {
        for (let i = calls.length; i < slots.length; i++) slotTones[i] = 'error';
        failed = 'fewer';
      }
      if (failed) {
        statuses.push(failed);
        r.step('render', failed === 'more' ? 'React throws: Rendered more hooks than during the previous render' : 'React throws: Rendered fewer hooks than expected', panels(), { status: failed });
        break;
      }
      statuses.push('ok');
      r.step('render', `Render ${k + 1} finished: every slot matched its call`, panels(), { status: 'ok' });
    }
    return { frames: r.frames, result: statuses };
  },
  reference({ admin }) {
    const flags = flagsOf(admin);
    if (!flags.length) flags.push(true);
    const out: string[] = [];
    for (let i = 0; i < flags.length; i++) {
      if (i === 0 || flags[i] === flags[i - 1]) out.push('ok');
      else {
        out.push(flags[i] ? 'more' : 'fewer');
        break;
      }
    }
    return out;
  },
};

const unit: Unit = {
  id: 'hook-rules',
  hook: 'The rules of hooks sound arbitrary until you know the mechanism: React has no names for your hooks, only their order. This is one of the most asked "why" questions.',
  predict: {
    prompt: 'First render has cond = true, the second has cond = false. What happens on the second render?',
    code: `function Demo({ cond }) {
  if (cond) {
    const [flag] = useState('x');
  }
  const [n] = useState(0);
  return <p>{n}</p>;
}`,
    codeLang: 'jsx',
    options: ['It renders fine: n is still 0', 'n reads the wrong slot, then React throws "Rendered fewer hooks than expected"', 'React skips the first hook and everything works', 'The component remounts with fresh state'],
    answer: 1,
    explain: 'On the first render the slots are [flag, n]. On the second render only one hook runs, so useState(0) reads slot #0 (flag). React then sees that slot #1 was never claimed and throws a hook-count error.',
  },
  viz,
  deeper: {
    points: [
      'React stores each component\'s hook state in an ordered list. The Nth hook call on a render reads the Nth slot, nothing else identifies it.',
      'So hooks must run in the same order every render: top level only, never inside if, loops, nested functions or after an early return.',
      'Call hooks only from function components and other custom hooks (names starting with "use"). The eslint-plugin-react-hooks rules enforce both.',
      'To use a hook conditionally, move it into a child component and render that child conditionally, or call the hook always and branch on its result.',
      'Different hook types in the same slot throw in development; the same type silently returns another hook\'s data, which is the nastier bug.',
    ],
    pitfalls: ['An early return placed above a later useState or useEffect', 'Calling a hook inside an event handler or a callback', 'Calling a hook inside a loop whose length can change'],
  },
  practice: {
    language: 'jsx',
    fnName: 'Card',
    statement: 'Show a "Likes: n" button only when the card is expanded. The counter needs useState, so put it in its own `Likes` component and render that component conditionally. Collapsing must reset the likes.',
    signature: 'function Card() {',
    solution: `function Likes() {
  const [likes, setLikes] = useState(@@0@@);
  return <button onClick={() => setLikes(@@likes + 1@@)}>Likes: {likes}</button>;
}

function Card() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Expand'}</button>
      {expanded && @@<Likes />@@}
    </div>
  );
}`,
    skeleton: `function Likes() {
  // TODO: own the likes counter here
  return null;
}

function Card() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Expand'}</button>
      {/* TODO: render <Likes /> only when expanded */}
    </div>
  );
}`,
    reactTests: [
      { name: 'collapsed at first', steps: [{ expectText: 'Expand' }, { expectNoText: 'Likes' }] },
      { name: 'expanding shows the counter', steps: [{ click: 'text=Expand' }, { expectText: 'Likes: 0' }, { expectText: 'Collapse' }] },
      { name: 'counter counts', steps: [{ click: 'text=Expand' }, { click: 'text=Likes: 0' }, { click: 'text=Likes: 1' }, { expectText: 'Likes: 2' }] },
      { name: 'collapse unmounts and resets', steps: [{ click: 'text=Expand' }, { click: 'text=Likes: 0' }, { click: 'text=Collapse' }, { expectNoText: 'Likes' }, { click: 'text=Expand' }, { expectText: 'Likes: 0' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Inbox',
    statement: 'Clicking "Fetch mail" crashes the component instead of showing the first message. Fix the hook usage.',
    buggy: `function Inbox() {
  const [messages, setMessages] = useState([]);
  if (messages.length === 0) {
    return <button onClick={() => setMessages(['Hi', 'Lunch?'])}>Fetch mail</button>;
  }
  const [open, setOpen] = useState(0);
  return (
    <div>
      <p>Open: {messages[open]}</p>
      <button onClick={() => setOpen((open + 1) % messages.length)}>Next</button>
    </div>
  );
}`,
    fixed: `function Inbox() {
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(0);
  if (messages.length === 0) {
    return <button onClick={() => setMessages(['Hi', 'Lunch?'])}>Fetch mail</button>;
  }
  return (
    <div>
      <p>Open: {messages[open]}</p>
      <button onClick={() => setOpen((open + 1) % messages.length)}>Next</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'empty inbox offers a fetch', steps: [{ expectText: 'Fetch mail' }] },
      { name: 'fetching shows the first message', steps: [{ click: 'text=Fetch mail' }, { expectText: 'Open: Hi' }] },
      { name: 'next cycles through', steps: [{ click: 'text=Fetch mail' }, { click: 'text=Next' }, { expectText: 'Open: Lunch?' }, { click: 'text=Next' }, { expectText: 'Open: Hi' }] },
    ],
    bugType: 'hook after early return',
    hint: 'How many hooks run on the first render, and how many on the render after the click?',
    explanation: 'While the inbox is empty the early return skips the second useState, so React records one slot. After the fetch the second useState runs and React finds more hooks than before, so it throws. Call every hook before any return.',
  },
  boss: {
    title: 'Quiz with a safe finish',
    statement:
      'Build `Quiz` using the given QUESTIONS. It shows `Question n of 3` with the question text and "Yes" / "No" buttons. After the last answer it returns a result screen early: `Score: x of 3` and a "Restart" button. Compute the score with useMemo from the recorded answers. Every hook must be called before the early return, otherwise the finish screen crashes.',
    language: 'jsx',
    fnName: 'Quiz',
    starter: `const QUESTIONS = [
  { text: 'Is JSX compiled into function calls?', answer: true },
  { text: 'Can hooks run inside loops?', answer: false },
  { text: 'Do hooks run in the same order every render?', answer: true },
];

function Quiz() {
  // your code here
  return null;
}
`,
    solution: `const QUESTIONS = [
  { text: 'Is JSX compiled into function calls?', answer: true },
  { text: 'Can hooks run inside loops?', answer: false },
  { text: 'Do hooks run in the same order every render?', answer: true },
];

function Quiz() {
  const [answers, setAnswers] = useState([]);
  const score = useMemo(() => answers.filter((a, i) => a === QUESTIONS[i].answer).length, [answers]);
  const step = answers.length;
  if (step === QUESTIONS.length) {
    return (
      <div>
        <p>Score: {score} of {QUESTIONS.length}</p>
        <button onClick={() => setAnswers([])}>Restart</button>
      </div>
    );
  }
  return (
    <div>
      <p>Question {step + 1} of {QUESTIONS.length}</p>
      <p>{QUESTIONS[step].text}</p>
      <button onClick={() => setAnswers([...answers, true])}>Yes</button>
      <button onClick={() => setAnswers([...answers, false])}>No</button>
    </div>
  );
}`,
    reactTests: [
      { name: 'starts at question 1', steps: [{ expectText: 'Question 1 of 3' }, { expectText: 'Is JSX compiled into function calls?' }] },
      { name: 'moves to the next question', steps: [{ click: 'text=Yes' }, { expectText: 'Question 2 of 3' }, { expectText: 'Can hooks run inside loops?' }] },
      { name: 'perfect score', steps: [{ click: 'text=Yes' }, { click: 'text=No' }, { click: 'text=Yes' }, { expectText: 'Score: 3 of 3' }, { expectNoText: 'Question' }] },
      { name: 'zero then restart', steps: [{ click: 'text=No' }, { click: 'text=Yes' }, { click: 'text=No' }, { expectText: 'Score: 0 of 3' }, { click: 'text=Restart' }, { expectText: 'Question 1 of 3' }] },
      { name: 'partial score', steps: [{ click: 'text=Yes' }, { click: 'text=Yes' }, { click: 'text=Yes' }, { expectText: 'Score: 2 of 3' }] },
    ],
    hints: ['The result screen is returned early. Which of your hooks could end up below that return?', 'Declare useState and useMemo first. Only then write `if (answers.length === QUESTIONS.length) return ...` for the result screen.'],
    combines: ['hook-usestate', 'hook-usememo'],
  },
  quiz: [
    {
      prompt: 'Why can\'t a hook be called inside an if statement?',
      options: ['Hooks are slow in branches', 'React identifies hooks by call order, so skipping one shifts all later hooks to the wrong slots', 'The compiler forbids it', 'Hooks only work in the first render'],
      answer: 1,
      explain: 'There are no hook names, only positions. A conditional call changes the positions of every hook after it.',
    },
  ],
};

export default unit;
