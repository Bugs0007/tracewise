import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { callsTimeline, checkTimes, OPS_HARNESS, TIMED_HARNESS, type TimerWindow } from '@/content/lib/frontend-js';

const code = `
function debounce(fn, wait, { leading = false } = {}) {
  let timer = null;
  return function (...args) {
    const callNow = leading && timer === null;     //@lead
    clearTimeout(timer);                           //@clear
    timer = setTimeout(() => {                     //@set
      timer = null;                                //@expire
      if (!leading) fn.apply(this, args);          //@fire
    }, wait);
    if (callNow) fn.apply(this, args);             //@leadfire
  };
}
`;

interface In {
  events: number[];
  wait: number;
  mode: 'trailing' | 'leading';
}

const viz: VizDef<In> = {
  id: 'js-debounce',
  title: 'Debounce on a timeline',
  code,
  language: 'javascript',
  inputs: [
    { key: 'events', label: 'Call times (ms, ascending)', kind: 'numbers', default: [0, 20, 40, 120, 130, 300], maxItems: 10 },
    { key: 'wait', label: 'wait (ms)', kind: 'number', default: 50 },
    { key: 'mode', label: 'Edge', kind: 'select', default: 'trailing', options: ['trailing', 'leading'] },
  ],
  presets: [
    { label: 'Burst then quiet', input: { events: [0, 20, 40, 120, 130, 300], wait: 50, mode: 'trailing' } },
    { label: 'Calls spaced apart', input: { events: [0, 100, 200], wait: 50, mode: 'trailing' } },
    { label: 'Leading edge', input: { events: [0, 20, 40, 120, 130, 300], wait: 50, mode: 'leading' } },
    { label: 'Never quiet long enough', input: { events: [0, 40, 80, 120, 160], wait: 50, mode: 'trailing' } },
    { label: 'Exactly at the boundary', input: { events: [0, 50], wait: 50, mode: 'trailing' } },
  ],
  run({ events, wait, mode }) {
    checkTimes(events, wait);
    const leading = mode === 'leading';
    const r = new Recorder(code);
    const calls: { t: number; i: number }[] = [];
    const windows: TimerWindow[] = [];
    const fires: { t: number; i: number }[] = [];
    let timer: { due: number; win: number; last: number } | null = null;
    let now = 0;
    const tMax = events[events.length - 1] + wait + 10;
    const step = (anchor: string, caption: string) =>
      r.step(anchor, caption, [callsTimeline({ calls, windows, fires, now, tMax, title: `debounce(fn, ${wait}) - ${mode}` })], { time: `${now}ms`, timer: timer ? `due ${timer.due}ms` : 'null', 'fn runs': fires.length });
    const expire = () => {
      const t = timer!;
      now = t.due;
      windows[t.win].end = now;
      windows[t.win].tone = 'done';
      windows[t.win].label = 'expired';
      timer = null;
      step('expire', `${now}ms: ${wait}ms of silence, the timer expires`);
      if (!leading) {
        fires.push({ t: now, i: t.last });
        step('fire', `fn runs now with the arguments of call #${t.last}`);
      }
    };
    events.forEach((t, k) => {
      const i = k + 1;
      while (timer && timer.due <= t) expire();
      now = t;
      calls.push({ t, i });
      const callNow = leading && timer === null;
      step('lead', `Call #${i} at ${t}ms: timer ${timer ? 'is running' : 'is idle'}${leading ? (callNow ? ', so this call leads' : ', so no leading run') : ''}`);
      if (timer) {
        windows[timer.win].end = t;
        windows[timer.win].tone = 'muted';
        windows[timer.win].label = 'reset';
        step('clear', 'Cancel the pending timer: the quiet period starts over');
      }
      windows.push({ start: t, end: t + wait, tone: 'active', label: `${wait}ms` });
      timer = { due: t + wait, win: windows.length - 1, last: i };
      step('set', `Start a new ${wait}ms timer, due at ${t + wait}ms`);
      if (callNow) {
        fires.push({ t, i });
        step('leadfire', `Leading edge: fn runs immediately for call #${i}`);
      }
    });
    if (timer) expire();
    return { frames: r.frames, result: fires.map((f) => [f.t, f.i]) };
  },
  reference({ events, wait, mode }) {
    const out: number[][] = [];
    let due = -1;
    let last = 0;
    const end = events[events.length - 1] + wait + 1;
    for (let t = 0; t <= end; t++) {
      if (due === t) {
        if (mode === 'trailing') out.push([t, last]);
        due = -1;
      }
      events.forEach((e, k) => {
        if (e !== t) return;
        if (mode === 'leading' && due === -1) out.push([t, k + 1]);
        due = t + wait;
        last = k + 1;
      });
    }
    return out;
  },
};

const unit: Unit = {
  id: 'js-debounce',
  hook: 'Debounce is the most common "implement it yourself" frontend question: search-as-you-type, resize handlers, autosave. The trick is one timer that you cancel and restart on every call.',
  predict: {
    prompt: 'A debounced function (wait = 100ms) is called at t = 0, 60, 120 and 400ms. When does the wrapped function actually run (trailing edge)?',
    options: ['Twice: at 220ms and at 500ms', 'At 100ms, 160ms, 220ms and 500ms', 'Once, at 500ms', 'Once, at 0ms'],
    answer: 0,
    explain: 'Each call restarts the 100ms timer. Calls at 0, 60, 120 keep resetting it (gaps are under 100ms), so the first run happens 100ms after the call at 120: t = 220. The call at 400 is alone, so it runs at 500.',
  },
  viz,
  deeper: {
    points: [
      'Debounce = "wait until the calls stop". Every call clears the previous timer and starts a new one; only the last call in a burst runs (trailing edge).',
      'A leading-edge debounce runs on the first call of a burst and ignores the rest until things go quiet.',
      'The timer id lives in a closure, so each debounced function has its own private timer.',
      'Keep the latest arguments (and `this`) from the last call: that is what the delayed run should use.',
      'Useful extras: `cancel()` to drop a pending run (on unmount) and `flush()` to run it now.',
    ],
    pitfalls: ['Forgetting clearTimeout, which only delays every call instead of collapsing them', 'Creating the debounced function inside a render or handler so each call gets a fresh timer', 'Using debounce where throttle is needed (continuous feedback such as scroll position)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'debounce',
    statement: 'Implement `debounce(fn, wait, clock)`. `clock` has `setTimeout(fn, ms)` (returns an id), `clearTimeout(id)` and a `now` property. The returned function restarts a `wait` timer on every call and runs `fn` with the latest arguments once calls stop (trailing edge).',
    signature: 'function debounce(fn, wait, clock) {',
    solution: `function debounce(fn, wait, clock) {
  let timer = null;
  return function (...args) {
    if (timer !== null) @@clock.clearTimeout(timer)@@;
    timer = @@clock.setTimeout@@(() => {
      timer = null;
      @@fn(...args)@@;
    }, @@wait@@);
  };
}`,
    harness: TIMED_HARNESS,
    adapter: 'runTimed',
    tests: [
      { args: [50, [0, 10, 20]], expected: [[70, 2]], name: 'burst collapses to one run' },
      { args: [50, [0, 100]], expected: [[50, 0], [150, 1]], name: 'spaced calls both run' },
      { args: [50, [0, 40, 80, 120]], expected: [[170, 3]], name: 'gaps shorter than wait keep resetting' },
      { args: [50, [0, 50]], expected: [[50, 0], [100, 1]], name: 'gap equal to wait lets the first run' },
      { args: [30, []], expected: [], name: 'no calls' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'debounce',
    statement: 'This debounce still runs once per call, just later. A burst of three calls should run `fn` only once, for the last call.',
    buggy: `function debounce(fn, wait, clock) {
  let timer = null;
  return function (...args) {
    timer = clock.setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
}`,
    fixed: `function debounce(fn, wait, clock) {
  let timer = null;
  return function (...args) {
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
}`,
    harness: TIMED_HARNESS,
    adapter: 'runTimed',
    tests: [
      { args: [50, [0, 10, 20]], expected: [[70, 2]] },
      { args: [50, [0, 100]], expected: [[50, 0], [150, 1]] },
      { args: [20, [5, 10, 15, 20]], expected: [[40, 3]] },
    ],
    bugType: 'previous timer never cleared',
    hint: 'Each call schedules a new timer. What happens to the timers from the earlier calls?',
    explanation: 'Without clearTimeout every call leaves its own timer behind, so each one fires after `wait`. Debounce needs the previous timer cancelled before starting the next, so only the last survives.',
  },
  boss: {
    title: 'Debounce with cancel and flush',
    language: 'javascript',
    fnName: 'debounce',
    statement:
      'Extend debounce: `debounce(fn, wait, clock)` returns `debounced` with `debounced.cancel()` (drop any pending run) and `debounced.flush()` (if a run is pending, run it now with the latest arguments and clear the timer). After a cancel or flush the debounced function must work normally again.',
    starter: `function debounce(fn, wait, clock) {
  // your code here
}
`,
    solution: `function debounce(fn, wait, clock) {
  let timer = null;
  let lastArgs = null;
  function run() {
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    fn(...args);
  }
  function debounced(...args) {
    lastArgs = args;
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(run, wait);
  }
  debounced.cancel = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  debounced.flush = () => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    run();
  };
  return debounced;
}`,
    harness: OPS_HARNESS,
    adapter: 'runOps',
    tests: [
      { args: [50, [[0, 'call', 'a'], [10, 'call', 'b']]], expected: [[60, 'b']], name: 'latest arguments win' },
      { args: [50, [[0, 'call', 'a'], [10, 'cancel']]], expected: [], name: 'cancel drops the pending run' },
      { args: [50, [[0, 'call', 'a'], [10, 'flush']]], expected: [[10, 'a']], name: 'flush runs now' },
      { args: [50, [[0, 'call', 'a'], [10, 'flush'], [20, 'flush']]], expected: [[10, 'a']], name: 'flush with nothing pending is a no-op' },
      { args: [50, [[0, 'call', 'a'], [5, 'cancel'], [20, 'call', 'b']]], expected: [[70, 'b']], name: 'works again after cancel' },
      { args: [50, [[0, 'call', 'a'], [10, 'flush'], [30, 'call', 'c']]], expected: [[10, 'a'], [80, 'c']], name: 'works again after flush' },
    ],
    hints: ['Keep `timer` and `lastArgs` in the closure. Put the "run fn with the saved args" logic in one inner function that clears both.', 'cancel clears the timer and lastArgs. flush returns early if there is no timer, otherwise clears the timer and calls the same inner run function. Attach both to the returned function.'],
    combines: ['js-closures'],
  },
};

export default unit;
