import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { referenceEventLoop, simulateEventLoop, sourcePanel, type LoopOp } from '@/content/lib/frontend-js';

const code = `
run(script)                                  //@script
for (;;) {
  while (microtasks.length) {                //@drain
    run(microtasks.shift())                  //@micro
  }
  if (!tasks.length) waitForTimer()          //@wait
  if (!tasks.length) break                   //@idle
  run(tasks.shift())                         //@task
}
`;

interface In {
  script: LoopOp[];
}

const classic: LoopOp[] = [{ log: 'A' }, { timeout: 0, do: [{ log: 'B' }] }, { then: [{ log: 'C' }] }, { micro: [{ log: 'D' }] }, { log: 'E' }];

const queueItems = (labels: string[], tone: Tone) => labels.map((label, i) => ({ id: `${label}${i}`, label, tone }));

const viz: VizDef<In> = {
  id: 'js-event-loop',
  title: 'Event loop: stack, microtasks, tasks',
  code,
  language: 'javascript',
  inputs: [
    {
      key: 'script',
      label: 'Program (JSON)',
      kind: 'json',
      default: classic,
      help: 'Ops: {"log":"A"}, {"timeout":ms,"do":[...]}, {"then":[...]}, {"micro":[...]}, {"async":[... {"await":true} ...]}',
    },
  ],
  presets: [
    { label: 'Classic', input: { script: classic } },
    {
      label: 'async / await',
      input: { script: [{ log: '1' }, { timeout: 0, do: [{ log: '2' }] }, { then: [{ log: '3' }] }, { async: [{ log: '4' }, { await: true }, { log: '5' }] }, { log: '6' }] },
    },
    {
      label: 'Microtask inside a task',
      input: {
        script: [
          { log: 'start' },
          { timeout: 0, do: [{ log: 'timer 1' }, { then: [{ log: 'micro in timer 1' }] }] },
          { timeout: 0, do: [{ log: 'timer 2' }] },
          { then: [{ log: 'p1' }, { micro: [{ log: 'p2' }] }] },
        ],
      },
    },
    { label: 'Timer order', input: { script: [{ timeout: 20, do: [{ log: 'slow' }] }, { timeout: 5, do: [{ log: 'fast' }] }, { timeout: 0, do: [{ log: 'now' }] }, { log: 'sync' }] } },
  ],
  run({ script }) {
    if (!Array.isArray(script) || !script.length) throw new Error('The program needs at least one op');
    const r = new Recorder(code);
    const log = simulateEventLoop(script, (anchor, caption, s) => {
      const panels: Panel[] = [
        sourcePanel(s.lines, s.active, s.done, 'Program'),
        { type: 'list', title: 'Call stack', items: queueItems(s.stack, 'active'), orientation: 'vertical', endLabel: 'top', emptyText: 'empty' },
        { type: 'list', title: 'Web APIs (timers)', items: queueItems(s.timers, 'muted'), orientation: 'horizontal', emptyText: 'none' },
        { type: 'list', title: 'Microtask queue', items: queueItems(s.micro, 'frontier'), orientation: 'horizontal', startLabel: 'next', emptyText: 'empty' },
        { type: 'list', title: 'Task (macrotask) queue', items: queueItems(s.tasks, 'compare'), orientation: 'horizontal', startLabel: 'next', emptyText: 'empty' },
        { type: 'log', title: 'Console', lines: s.log.map((text) => ({ text, tone: 'found' as Tone })) },
      ];
      r.step(anchor, caption, panels, { clock: `${s.now}ms`, stack: s.stack.length, microtasks: s.micro.length, tasks: s.tasks.length });
    });
    return { frames: r.frames, result: log };
  },
  reference: ({ script }) => referenceEventLoop(script),
};

const unit: Unit = {
  id: 'js-event-loop',
  hook: 'The event loop is the most-asked JavaScript internals question: "what does this print?" Knowing that microtasks always drain before the next task lets you answer any ordering puzzle in seconds.',
  predict: {
    prompt: 'What is logged, in order?',
    code: `console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
(async () => {
  console.log('4');
  await null;
  console.log('5');
})();
console.log('6');`,
    codeLang: 'javascript',
    options: ['1 4 6 3 5 2', '1 4 6 2 3 5', '1 6 3 4 5 2', '1 2 4 6 3 5'],
    answer: 0,
    explain: 'Synchronous code first: 1, then the async function runs to its first await (4), then 6. The stack is empty, so the microtasks run in the order queued: the then (3), then the continuation after await (5). Only then does the timer task run (2).',
  },
  viz,
  deeper: {
    points: [
      'One thread, one call stack. Timers, network and DOM events are handled by the host (Web APIs); only their callbacks come back to JavaScript.',
      'After every task, and whenever the stack empties, the engine drains the whole microtask queue (promise reactions, queueMicrotask, code after await) before taking the next task.',
      'Microtasks queued by microtasks run in the same drain, so a microtask loop can starve timers and rendering.',
      '`setTimeout(fn, 0)` means "not before 0ms, and after the current task and all its microtasks" - never "immediately".',
      'The browser may render between tasks but never in the middle of a microtask drain.',
    ],
    pitfalls: ['Assuming setTimeout 0 runs before a resolved promise callback', 'Forgetting that code after `await` is a microtask even when the awaited value is not a promise', 'Blocking the stack with a long loop: nothing else (clicks, timers) can run until it ends'],
  },
  practice: {
    language: 'javascript',
    fnName: 'schedule',
    statement: 'Given a list of kinds ("sync", "micro", "macro"), schedule one job per entry in order. A job pushes its label (kind + index) to a log: sync jobs immediately, micro jobs via queueMicrotask, macro jobs via setTimeout 0. Resolve with the log once everything has run.',
    signature: 'function schedule(kinds) {',
    solution: `function schedule(kinds) {
  const log = [];
  kinds.forEach((kind, i) => {
    const label = kind + i;
    if (kind === 'sync') log.push(label);
    else if (kind === 'micro') @@queueMicrotask@@(() => log.push(label));
    else @@setTimeout@@(() => log.push(label), @@0@@);
  });
  return new Promise((resolve) => setTimeout(() => resolve(@@log@@), 20));
}`,
    tests: [
      { args: [['sync', 'micro', 'macro', 'sync']], expected: ['sync0', 'sync3', 'micro1', 'macro2'], name: 'sync, micro, macro' },
      { args: [['macro', 'micro', 'sync']], expected: ['sync2', 'micro1', 'macro0'], name: 'registration order is irrelevant' },
      { args: [['micro', 'macro', 'micro']], expected: ['micro0', 'micro2', 'macro1'], name: 'microtasks drain together' },
      { args: [['macro', 'macro']], expected: ['macro0', 'macro1'], name: 'tasks keep FIFO order' },
      { args: [[]], expected: [], name: 'nothing scheduled' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'flushOrder',
    statement: '`flushOrder(timerName, promiseName)` must log "sync", then the promise job, then the timer job - even though the timer is registered first. It returns the log after everything ran. The order is wrong.',
    buggy: `function flushOrder(timerName, promiseName) {
  const log = [];
  setTimeout(() => log.push(timerName), 0);
  setTimeout(() => log.push(promiseName), 0);
  log.push('sync');
  return new Promise((resolve) => setTimeout(() => resolve(log), 20));
}`,
    fixed: `function flushOrder(timerName, promiseName) {
  const log = [];
  setTimeout(() => log.push(timerName), 0);
  Promise.resolve().then(() => log.push(promiseName));
  log.push('sync');
  return new Promise((resolve) => setTimeout(() => resolve(log), 20));
}`,
    tests: [
      { args: ['t', 'p'], expected: ['sync', 'p', 't'] },
      { args: ['tick', 'job'], expected: ['sync', 'job', 'tick'] },
      { args: ['', 'x'], expected: ['sync', 'x', ''] },
    ],
    bugType: 'task used where a microtask was needed',
    hint: 'Two setTimeout callbacks run in registration order, one task each. Which API runs before any task?',
    explanation: 'Both jobs were macrotasks, so they ran in the order they were registered (timer first). A promise reaction is a microtask and runs as soon as the stack empties, before any timer task.',
  },
  boss: {
    title: 'Mini event loop',
    language: 'javascript',
    fnName: 'runLoop',
    statement:
      'Implement `runLoop(script)` that returns the console output of a program. Ops: `{log: text}` prints; `{timeout: ms, do: ops}` runs `ops` as a task after `ms` of virtual time (ties run in registration order); `{micro: ops}` queues `ops` as a microtask. Nested ops behave the same way. All microtasks drain after the script and after every task.',
    starter: `function runLoop(script) {
  // your code here
}
`,
    solution: `function runLoop(script) {
  const out = [];
  const micro = [];
  const timers = [];
  let now = 0;
  let seq = 0;
  const run = (ops) => {
    for (const op of ops) {
      if ('log' in op) out.push(op.log);
      else if ('timeout' in op) timers.push({ at: now + op.timeout, seq: seq++, body: op.do });
      else micro.push(op.micro);
    }
  };
  run(script);
  for (;;) {
    while (micro.length) run(micro.shift());
    if (!timers.length) break;
    timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const next = timers.shift();
    now = next.at;
    run(next.body);
  }
  return out;
}`,
    tests: [
      { args: [[{ log: 'A' }, { timeout: 0, do: [{ log: 'B' }] }, { micro: [{ log: 'C' }] }, { log: 'D' }]], expected: ['A', 'D', 'C', 'B'], name: 'sync, micro, task' },
      { args: [[{ timeout: 20, do: [{ log: 'slow' }] }, { timeout: 5, do: [{ log: 'fast' }] }]], expected: ['fast', 'slow'], name: 'timers by due time' },
      {
        args: [[{ timeout: 0, do: [{ log: 't1' }, { micro: [{ log: 'm1' }] }] }, { timeout: 0, do: [{ log: 't2' }] }]],
        expected: ['t1', 'm1', 't2'],
        name: 'microtasks drain between tasks',
      },
      { args: [[{ micro: [{ log: 'a' }, { micro: [{ log: 'c' }] }] }, { micro: [{ log: 'b' }] }]], expected: ['a', 'b', 'c'], name: 'nested microtask goes to the back' },
      { args: [[{ timeout: 10, do: [{ timeout: 5, do: [{ log: 'inner' }] }] }, { timeout: 12, do: [{ log: 'outer' }] }]], expected: ['outer', 'inner'], name: 'nested timer is relative to now' },
      { args: [[]], expected: [], name: 'empty program' },
    ],
    hints: ['Keep two structures: a FIFO array of microtask bodies and a list of timers with a due time and a sequence number.', 'Loop: drain every microtask, then take the timer with the smallest (due, sequence), set `now` to its due time, run its body. New timers are due at `now + ms`.'],
    combines: ['js-promises'],
  },
  quiz: [
    {
      prompt: 'Which of these runs first once the call stack is empty?',
      options: ['A resolved promise\'s .then callback', 'A setTimeout(fn, 0) callback', 'A click handler already waiting', 'A requestAnimationFrame callback'],
      answer: 0,
      explain: 'Microtasks (promise reactions) are drained before the next task or render step.',
    },
  ],
  simulationNote: 'A teaching model: one virtual clock, timers as tasks, promises that are already resolved. Real browsers also interleave rendering and input events between tasks.',
};

export default unit;
