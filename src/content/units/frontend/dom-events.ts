import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { parentMap, treePanel, type CNode } from '@/content/lib/frontend-react';

const code = `
function dispatch(path, target, event) {
  const ancestors = path.slice(0, -1);               //@start
  for (const node of ancestors) {                    //@capture
    run(node.captureListeners, event);
    if (event.stopped) return;                       //@stopCapture
  }
  run(target.listeners, event);                      //@target
  for (const node of ancestors.reverse()) {          //@bubble
    if (event.stopped) return;                       //@stopBubble
    run(node.bubbleListeners, event);                //@bubbleRun
  }
}
`;

const TREE: CNode = {
  id: 'div',
  name: 'div',
  children: [
    {
      id: 'ul',
      name: 'ul',
      children: [
        { id: 'li', name: 'li', children: [{ id: 'button', name: 'button' }] },
        { id: 'li2', name: 'li#2' },
      ],
    },
  ],
};
const PARENTS = parentMap(TREE);

interface In {
  target: string;
  stop: string;
}

function chain(target: string): string[] {
  const out: string[] = [];
  for (let n: string | null = target; n; n = PARENTS[n]) out.unshift(n);
  return out;
}

const viz: VizDef<In> = {
  id: 'dom-events',
  title: 'Capture, target, bubble',
  code,
  language: 'javascript',
  inputs: [
    { key: 'target', label: 'Clicked element', kind: 'select', default: 'button', options: ['button', 'li', 'li2', 'ul', 'div'] },
    { key: 'stop', label: 'stopPropagation() in', kind: 'select', default: 'none', options: ['none', 'capture:ul', 'target:button', 'bubble:li', 'bubble:ul'] },
  ],
  presets: [
    { label: 'Plain click', input: { target: 'button', stop: 'none' } },
    { label: 'Stop while bubbling', input: { target: 'button', stop: 'bubble:li' } },
    { label: 'Stop while capturing', input: { target: 'button', stop: 'capture:ul' } },
    { label: 'Sibling item', input: { target: 'li2', stop: 'none' } },
  ],
  run({ target, stop }) {
    const r = new Recorder(code);
    const path = chain(target);
    const ancestors = path.slice(0, -1);
    const log: string[] = [];
    const tones: Record<string, Tone> = {};
    const edgeTones: Record<string, Tone> = {};
    const badges: Record<string, string> = {};
    for (let i = 0; i < path.length - 1; i++) edgeTones[`${path[i]}>${path[i + 1]}`] = 'muted';
    const panels = (cur?: string, phase = '-') => {
      const t = { ...tones };
      if (cur) t[cur] = 'active';
      return [
        treePanel(TREE, { tones: t, badges, edgeTones, title: `Click on <${target}>` }),
        { type: 'log' as const, title: 'Listener calls (in order)', lines: log.map((l) => ({ text: l, tone: l === log[log.length - 1] ? ('active' as Tone) : undefined })) },
        { type: 'kv' as const, entries: [{ k: 'event.target', v: target }, { k: 'event.currentTarget', v: cur ?? '-' }, { k: 'phase', v: phase }] },
      ];
    };
    tones[target] = 'compare';
    r.step('start', `Click lands on <${target}>. The browser computes the path from the root down.`, panels(), { path: path.join(' > ') });
    const fire = (id: string, phase: 'capture' | 'target' | 'bubble', anchor: string) => {
      r.op();
      const entry = `${phase}:${id}`;
      log.push(entry);
      badges[id] = phase === 'capture' ? 'down' : phase === 'bubble' ? 'up' : 'hit';
      const verb = phase === 'capture' ? 'capturing listener on' : phase === 'bubble' ? 'bubbling listener on' : 'listener on the target';
      r.step(anchor, `${verb} <${id}> runs (currentTarget=${id}, target=${target})`, panels(id, phase), { phase, currentTarget: id });
      tones[id] = phase === 'capture' ? 'frontier' : phase === 'bubble' ? 'done' : 'compare';
      for (let i = 0; i < path.length - 1; i++) {
        if (path[i] === id && phase === 'capture') edgeTones[`${path[i]}>${path[i + 1]}`] = 'frontier';
        if (path[i + 1] === id && phase === 'bubble') edgeTones[`${path[i]}>${path[i + 1]}`] = 'done';
      }
      if (entry === stop) {
        tones[id] = 'error';
        r.step(phase === 'bubble' ? 'stopBubble' : phase === 'capture' ? 'stopCapture' : 'target', `stopPropagation() in ${id} (${phase}) — the event goes no further`, panels(id, phase), { stopped: true });
        return true;
      }
      return false;
    };
    for (const id of ancestors) {
      if (fire(id, 'capture', 'capture')) return { frames: r.frames, result: log };
    }
    if (fire(target, 'target', 'target')) return { frames: r.frames, result: log };
    for (const id of [...ancestors].reverse()) {
      if (fire(id, 'bubble', 'bubbleRun')) return { frames: r.frames, result: log };
    }
    r.step('bubble', 'Bubbling reached the root — dispatch is finished', panels(), { calls: log.length });
    return { frames: r.frames, result: log };
  },
  reference({ target, stop }) {
    const up: string[] = [];
    for (let n = PARENTS[target]; n; n = PARENTS[n]) up.push(n);
    const order = [...up.slice().reverse().map((a) => `capture:${a}`), `target:${target}`, ...up.map((a) => `bubble:${a}`)];
    const i = order.indexOf(stop);
    return i < 0 ? order : order.slice(0, i + 1);
  },
};

const PARENTS_TEST = { div: null, ul: 'div', li: 'ul', button: 'li', li2: 'ul' };

const modalBuggy = `function Modal() {
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  if (!open) return <p>Closed</p>;
  return (
    <div className="backdrop" onClick={() => setOpen(false)}>
      <div className="dialog">
        <p>Are you sure?</p>
        <button onClick={() => setConfirmed(true)}>Confirm</button>
        {confirmed && <p>Confirmed!</p>}
      </div>
    </div>
  );
}`;

const unit: Unit = {
  id: 'dom-events',
  hook: 'Almost every "why did my click handler fire twice / not fire?" question is really about the event path. Knowing capture, target and bubble — and what `stopPropagation` and delegation do — separates guessers from people who can reason about the DOM.',
  predict: {
    prompt: 'A `<button>` sits inside `<li>` inside `<ul>`. Every element has both a capturing and a bubbling click listener, and nobody calls `stopPropagation`. In which order do the **`ul`** listeners run relative to the **`button`** listener?',
    options: ['ul capture, then button, then ul bubble', 'button, then ul bubble only (capture listeners never run on ancestors)', 'ul bubble, then button, then ul capture', 'button first, then ul capture, then ul bubble'],
    answer: 0,
    explain: "The event first travels DOWN from the root to the target (capturing listeners of every ancestor), runs the target's listeners, then travels back UP (bubbling listeners). So `ul` capture fires before the button, and `ul` bubble fires after it.",
  },
  viz,
  deeper: {
    points: [
      "Dispatch has three phases: capture (root down to the target's parent), target, then bubble (back up). Most `onclick` / `addEventListener(type, fn)` handlers are bubble listeners; pass `{ capture: true }` to listen on the way down.",
      '`event.target` is the element that was actually clicked and never changes; `event.currentTarget` is the element whose listener is running right now.',
      '`stopPropagation()` stops the event from moving to the next node. Other listeners on the same node still run; `stopImmediatePropagation()` also silences those.',
      'Event delegation: attach one listener to a stable ancestor and use `e.target.closest(selector)` to find which child was hit. It handles items added later and saves listeners.',
      'React attaches its listeners at the root container and simulates this path: `onClickCapture` runs on the way down and `onClick` on the way up, in the React tree.',
    ],
    pitfalls: ['Calling `stopPropagation` to "fix" a bug and breaking analytics or outside-click handlers higher up', 'Using `e.target` when the click may land on a child icon inside the button (use `closest`)', 'Assuming `focus` and `blur` bubble (they do not; `focusin` and `focusout` do)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'propagate',
    statement: '`parents` maps each node id to its parent id (root maps to `null`). Return the listener calls for a click on `target` as strings like `capture:ul`, `target:button`, `bubble:ul`. If `stopAt` (for example `"bubble:li"`) is given, stop right after that call.',
    signature: 'function propagate(parents, target, stopAt) {',
    solution: `function propagate(parents, target, stopAt) {
  const ancestors = [];
  for (let n = parents[target]; @@n@@; n = @@parents[n]@@) {
    ancestors.unshift(n);
  }
  const order = [
    ...ancestors.map((id) => @@'capture:' + id@@),
    'target:' + target,
    ...@@ancestors.reverse()@@.map((id) => 'bubble:' + id),
  ];
  const log = [];
  for (const step of order) {
    log.push(step);
    if (@@step === stopAt@@) break;
  }
  return log;
}`,
    tests: [
      { args: [PARENTS_TEST, 'button', null], expected: ['capture:div', 'capture:ul', 'capture:li', 'target:button', 'bubble:li', 'bubble:ul', 'bubble:div'], name: 'full path' },
      { args: [PARENTS_TEST, 'li2', null], expected: ['capture:div', 'capture:ul', 'target:li2', 'bubble:ul', 'bubble:div'], name: 'sibling target' },
      { args: [PARENTS_TEST, 'button', 'bubble:li'], expected: ['capture:div', 'capture:ul', 'capture:li', 'target:button', 'bubble:li'], name: 'stopped while bubbling' },
      { args: [PARENTS_TEST, 'button', 'capture:ul'], expected: ['capture:div', 'capture:ul'], name: 'stopped while capturing' },
      { args: [PARENTS_TEST, 'div', null], expected: ['target:div'], name: 'target is the root' },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'Modal',
    statement: 'Clicking anywhere on the backdrop should close the modal, but right now clicking inside the dialog (even on its text) closes it too. Fix it.',
    buggy: modalBuggy,
    fixed: modalBuggy.replace('onClick={() => setOpen(false)}', 'onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}'),
    reactTests: [
      { name: 'click on dialog text keeps it open', steps: [{ click: '.dialog p' }, { expectText: 'Are you sure?' }, { expectNoText: 'Closed' }] },
      { name: 'confirm works and stays open', steps: [{ click: 'text=Confirm' }, { expectText: 'Confirmed!' }, { expectNoText: 'Closed' }] },
      { name: 'backdrop click closes', steps: [{ click: '.backdrop' }, { expectText: 'Closed' }] },
    ],
    bugType: 'unwanted event bubbling',
    hint: "A click on the dialog bubbles up to the backdrop's onClick. What do `e.target` and `e.currentTarget` say in that case?",
    explanation: 'The dialog is a child of the backdrop, so its clicks bubble to the backdrop handler. Close only when the click started on the backdrop itself (`e.target === e.currentTarget`) — or stop propagation on the dialog, which has side effects for handlers further up.',
  },
  boss: {
    title: 'Delegated tag list',
    statement: 'Build `TagList`: it starts with the tags react, dom, css, each in an `<li>` with a `<span>` for the name and a `<button data-tag="name"><b>x</b></button>`. Use ONE `onClick` on the `<ul>` (delegation) that removes the tag of the clicked button, even when the click lands on the inner `<b>`. Clicking the tag text must remove nothing. A wrapper `<div>` uses `onClickCapture` to count every click inside it and shows `Clicks: n`.',
    language: 'jsx',
    fnName: 'TagList',
    starter: `function TagList() {
  return <ul></ul>;
}`,
    solution: `function TagList() {
  const [tags, setTags] = useState(['react', 'dom', 'css']);
  const [clicks, setClicks] = useState(0);
  const onListClick = (e) => {
    const btn = e.target.closest('button[data-tag]');
    if (!btn) return;
    setTags(tags.filter((t) => t !== btn.dataset.tag));
  };
  return (
    <div onClickCapture={() => setClicks((c) => c + 1)}>
      <p>Clicks: {clicks}</p>
      <ul onClick={onListClick}>
        {tags.map((t) => (
          <li key={t}>
            <span>{t}</span>
            <button data-tag={t}><b>x</b></button>
          </li>
        ))}
      </ul>
    </div>
  );
}`,
    reactTests: [
      { name: 'renders three tags', steps: [{ expectCount: 'li', n: 3 }, { expectText: 'Clicks: 0' }] },
      { name: 'removing via the inner <b>', steps: [{ click: '[data-tag="dom"] b' }, { expectCount: 'li', n: 2 }, { expectNoText: 'dom' }, { expectText: 'Clicks: 1' }] },
      { name: 'clicking the text removes nothing but is counted', steps: [{ click: 'text=react' }, { expectCount: 'li', n: 3 }, { expectText: 'Clicks: 1' }] },
      { name: 'several removals', steps: [{ click: '[data-tag="css"]' }, { click: '[data-tag="react"] b' }, { expectCount: 'li', n: 1 }, { expectText: 'Clicks: 2' }, { expectText: 'dom' }] },
    ],
    hints: ['Read `e.target.closest(...)` in the `ul` handler instead of putting a handler on every button.', 'The count lives on the wrapper: `onClickCapture` runs on the way down, so it fires for every click inside. Use `setClicks((c) => c + 1)`.'],
    combines: ['dom-events'],
  },
  quiz: [
    {
      prompt: 'Inside a click handler, `e.currentTarget` is…',
      options: ['the element the user clicked', 'the element the running listener is attached to', 'always `document`', 'the first ancestor with a capture listener'],
      answer: 1,
      explain: '`target` is the origin of the event; `currentTarget` changes as the event moves through listeners.',
    },
  ],
};

export default unit;
