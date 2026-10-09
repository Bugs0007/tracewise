import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { callsTimeline, checkTimes, FAKE_CLOCK, TIMED_HARNESS, type TimerWindow } from '@/content/lib/frontend-js';

const code = `
function throttle(fn, wait, trailing = true) {
  let timer = null;
  let pending = null;
  return function (...args) {
    if (timer !== null) {                         //@busy
      if (trailing) pending = args;               //@remember
      return;
    }
    fn(...args);                                  //@lead
    timer = setTimeout(function tick() {          //@window
      timer = null;                               //@end
      if (pending) {                              //@check
        const a = pending; pending = null;
        fn(...a);                                 //@trail
        timer = setTimeout(tick, wait);           //@again
      }
    }, wait);
  };
}
`;

interface In {
  events: number[];
  wait: number;
  mode: 'leading + trailing' | 'leading only';
}

const viz: VizDef<In> = {
  id: 'js-throttle',
  title: 'Throttle on a timeline',
  code,
  language: 'javascript',
  inputs: [
    { key: 'events', label: 'Call times (ms, ascending)', kind: 'numbers', default: [0, 10, 20, 30, 60, 70, 140], maxItems: 12 },
    { key: 'wait', label: 'wait (ms)', kind: 'number', default: 50 },
    { key: 'mode', label: 'Edges', kind: 'select', default: 'leading + trailing', options: ['leading + trailing', 'leading only'] },
  ],
  presets: [
    { label: 'Burst, then a lone call', input: { events: [0, 10, 20, 30, 60, 70, 140], wait: 50, mode: 'leading + trailing' } },
    { label: 'Leading only', input: { events: [0, 10, 20, 30, 60, 70, 140], wait: 50, mode: 'leading only' } },
    { label: 'Steady stream', input: { events: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110], wait: 40, mode: 'leading + trailing' } },
    { label: 'Calls spaced apart', input: { events: [0, 100, 200], wait: 50, mode: 'leading + trailing' } },
  ],
  run({ events, wait, mode }) {
    checkTimes(events, wait);
    const trailing = mode === 'leading + trailing';
    const r = new Recorder(code);
    const calls: { t: number; i: number }[] = [];
    const windows: TimerWindow[] = [];
    const fires: { t: number; i: number }[] = [];
    let timer: { due: number; win: number } | null = null;
    let pending: number | null = null;
    let now = 0;
    const tMax = events[events.length - 1] + wait * 2 + 10;
    const step = (anchor: string, caption: string) =>
      r.step(anchor, caption, [callsTimeline({ calls, windows, fires, now, tMax, title: `throttle(fn, ${wait}) - ${mode}` })], { time: `${now}ms`, window: timer ? `until ${timer.due}ms` : 'none', pending: pending === null ? 'none' : `#${pending}`, 'fn runs': fires.length });
    const open = (t: number) => {
      windows.push({ start: t, end: t + wait, tone: 'active', label: `${wait}ms window` });
      timer = { due: t + wait, win: windows.length - 1 };
    };
    const expire = () => {
      const t = timer!;
      now = t.due;
      windows[t.win].tone = 'done';
      timer = null;
      step('end', pending === null ? `${now}ms: window over and nothing is pending, so the next call runs at once` : `${now}ms: window over, but a call is pending`);
      if (pending !== null) {
        step('check', `Pending call #${pending} exists: run it now (trailing edge)`);
        fires.push({ t: now, i: pending });
        pending = null;
        step('trail', `fn runs for the latest call at ${now}ms`);
        open(now);
        step('again', `Start another ${wait}ms window: runs stay at least ${wait}ms apart`);
      }
    };
    events.forEach((t, k) => {
      const i = k + 1;
      while (timer && timer.due <= t) expire();
      now = t;
      calls.push({ t, i });
      if (timer) {
        step('busy', `Call #${i} at ${t}ms: inside the window, fn must not run now`);
        if (trailing) {
          const old = pending;
          pending = i;
          step('remember', old === null ? `Remember call #${i} to run when the window ends` : `Remember call #${i} instead of #${old}: only the latest survives`);
        }
        return;
      }
      fires.push({ t, i });
      step('lead', `Call #${i} at ${t}ms: no window is open, so fn runs now (leading edge)`);
      open(t);
      step('window', `Open a ${wait}ms window until ${t + wait}ms`);
    });
    while (timer) expire();
    return { frames: r.frames, result: fires.map((f) => [f.t, f.i]) };
  },
  reference({ events, wait, mode }) {
    const out: number[][] = [];
    let windowEnd = -1;
    let pending = -1;
    const end = events[events.length - 1] + wait * (events.length + 2);
    for (let t = 0; t <= end; t++) {
      if (windowEnd === t) {
        windowEnd = -1;
        if (pending !== -1) {
          out.push([t, pending]);
          pending = -1;
          windowEnd = t + wait;
        }
      }
      events.forEach((e, k) => {
        if (e !== t) return;
        if (windowEnd !== -1) {
          if (mode === 'leading + trailing') pending = k + 1;
        } else {
          out.push([t, k + 1]);
          windowEnd = t + wait;
        }
      });
    }
    return out;
  },
};

const unit: Unit = {
  id: 'js-throttle',
  hook: 'Throttle limits how OFTEN something runs (scroll, resize, mousemove), where debounce waits for silence. Interviewers want you to explain the difference and handle the trailing call.',
  predict: {
    prompt: 'A throttled function (wait = 100ms, leading + trailing) is called at t = 0, 30, 60 and 250ms. When does the wrapped function run?',
    options: ['0, 100 and 250', '0 and 250 only', '0, 30, 60 and 250', '100 and 350'],
    answer: 0,
    explain: 'The call at 0 runs immediately and opens a window until 100. Calls at 30 and 60 fall inside it; only the latest (60) is kept and runs at 100 (trailing edge). The window then reopens until 200 with nothing pending; the call at 250 finds no window and runs immediately.',
  },
  viz,
  deeper: {
    points: [
      'Throttle guarantees a maximum rate (one run per `wait`); debounce guarantees a minimum quiet gap before a run.',
      'Leading edge: run on the first call of a window. Trailing edge: run once more at the window end with the latest arguments, so the final state is never lost.',
      'A throttle needs one timer plus a slot for the pending arguments, both in a closure.',
      'Re-arming the window after a trailing run keeps successive runs at least `wait` apart.',
      'For animation-driven work, requestAnimationFrame is often a better throttle than a fixed millisecond wait.',
    ],
    pitfalls: ['Never resetting the "busy" flag, so the function stops firing forever', 'Dropping the trailing call, so the UI ends up showing a stale scroll position', 'Using Date.now() comparisons without a timer, which can miss the trailing call entirely'],
  },
  practice: {
    language: 'javascript',
    fnName: 'throttle',
    statement: 'Implement `throttle(fn, wait, clock)` with leading and trailing edges. `clock` has `setTimeout(fn, ms)`, `clearTimeout(id)` and `now`. The first call runs at once and opens a `wait` window; calls inside it only remember the latest arguments, which run when the window ends (and open a new window).',
    signature: 'function throttle(fn, wait, clock) {',
    solution: `function throttle(fn, wait, clock) {
  let timer = null;
  let pending = null;
  return function (...args) {
    if (@@timer !== null@@) {
      pending = @@args@@;
      return;
    }
    fn(...args);
    const tick = () => {
      timer = null;
      if (pending !== null) {
        const a = pending;
        pending = null;
        fn(...a);
        timer = clock.setTimeout(tick, wait);
      }
    };
    timer = @@clock.setTimeout(tick, wait)@@;
  };
}`,
    harness: TIMED_HARNESS,
    adapter: 'runTimed',
    tests: [
      { args: [50, [0, 10, 20]], expected: [[0, 0], [50, 2]], name: 'leading call, then latest at window end' },
      { args: [50, [0, 100]], expected: [[0, 0], [100, 1]], name: 'spaced calls both run at once' },
      { args: [50, [0, 60, 70]], expected: [[0, 0], [60, 1], [110, 2]], name: 'trailing call after a second window' },
      { args: [50, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]], expected: [[0, 0], [50, 4], [100, 9], [150, 12]], name: 'steady stream runs every wait ms' },
      { args: [50, []], expected: [], name: 'no calls' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'throttle',
    statement: 'This leading-edge throttle should run `fn` at most once per `wait` ms, dropping calls inside the window. After the first run it never fires again.',
    buggy: `function throttle(fn, wait, clock) {
  let timer = null;
  return function (...args) {
    if (timer !== null) return;
    fn(...args);
    timer = clock.setTimeout(() => {}, wait);
  };
}`,
    fixed: `function throttle(fn, wait, clock) {
  let timer = null;
  return function (...args) {
    if (timer !== null) return;
    fn(...args);
    timer = clock.setTimeout(() => {
      timer = null;
    }, wait);
  };
}`,
    harness: TIMED_HARNESS,
    adapter: 'runTimed',
    tests: [
      { args: [50, [0, 10, 60]], expected: [[0, 0], [60, 2]] },
      { args: [50, [0, 100]], expected: [[0, 0], [100, 1]] },
      { args: [50, [5]], expected: [[5, 0]] },
      { args: [30, [0, 10, 20, 30, 40]], expected: [[0, 0], [30, 3]] },
    ],
    bugType: 'busy flag never reset',
    hint: 'What value does `timer` hold after the timeout callback has run, and what does the first line of the returned function check?',
    explanation: 'The timer callback was empty, so `timer` stayed non-null forever and every later call returned early. The callback must reset `timer = null` to end the window.',
  },
  boss: {
    title: 'Scroll handler: throttled moves, debounced end',
    language: 'javascript',
    fnName: 'createScrollHandler',
    statement:
      'Implement `createScrollHandler(onMove, onEnd, clock, throttleMs, idleMs)` and return a function `handle(y)` for scroll events. `onMove(y)` is throttled (leading + trailing, window `throttleMs`). `onEnd(y)` is debounced: it runs once, `idleMs` after the last scroll event, with the last y. `clock` offers `setTimeout`, `clearTimeout`, `now`.',
    starter: `function createScrollHandler(onMove, onEnd, clock, throttleMs, idleMs) {
  // your code here
}
`,
    solution: `function createScrollHandler(onMove, onEnd, clock, throttleMs, idleMs) {
  let moveTimer = null;
  let pendingY = null;
  let idleTimer = null;
  const tick = () => {
    moveTimer = null;
    if (pendingY !== null) {
      const y = pendingY;
      pendingY = null;
      onMove(y);
      moveTimer = clock.setTimeout(tick, throttleMs);
    }
  };
  return function handle(y) {
    if (moveTimer !== null) {
      pendingY = y;
    } else {
      onMove(y);
      moveTimer = clock.setTimeout(tick, throttleMs);
    }
    if (idleTimer !== null) clock.clearTimeout(idleTimer);
    idleTimer = clock.setTimeout(() => {
      idleTimer = null;
      onEnd(y);
    }, idleMs);
  };
}`,
    harness: `${FAKE_CLOCK}
function runScroll(make, throttleMs, idleMs, events) {
  const clock = new FakeClock();
  const log = [];
  const handle = make(
    function (y) { log.push([clock.now, 'move', y]); },
    function (y) { log.push([clock.now, 'end', y]); },
    clock, throttleMs, idleMs
  );
  events.forEach(function (e) {
    clock.advance(e[0] - clock.now);
    handle(e[1]);
  });
  clock.advance(100000);
  return log;
}`,
    adapter: 'runScroll',
    tests: [
      { args: [50, 80, [[0, 10], [10, 20], [20, 30]]], expected: [[0, 'move', 10], [50, 'move', 30], [100, 'end', 30]], name: 'burst: lead, trail, then end' },
      { args: [50, 80, [[5, 7]]], expected: [[5, 'move', 7], [85, 'end', 7]], name: 'single event' },
      { args: [50, 80, [[0, 1], [200, 2]]], expected: [[0, 'move', 1], [80, 'end', 1], [200, 'move', 2], [280, 'end', 2]], name: 'two separate scrolls' },
      { args: [50, 80, [[0, 0], [30, 3], [60, 6], [90, 9]]], expected: [[0, 'move', 0], [50, 'move', 3], [100, 'move', 9], [170, 'end', 9]], name: 'continuous scrolling' },
      { args: [50, 80, []], expected: [], name: 'no scrolling' },
    ],
    hints: ['Use two independent mechanisms: a throttle (window timer + pending y) for onMove and a debounce (one idle timer you reset) for onEnd.', 'On each event: if the move window is open, store y as pending; otherwise call onMove and open the window. Then always clear and restart the idle timer with the latest y. When the window timer fires, run a pending move and re-arm.'],
    combines: ['js-debounce', 'js-closures'],
  },
};

export default unit;
