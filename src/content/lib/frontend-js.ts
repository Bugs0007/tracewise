// Shared helpers for the JavaScript-core frontend units:
//  - FakeClock harness + adapters (deterministic time for debounce / throttle tasks)
//  - a tiny deterministic event-loop simulator over a scripted program
//  - panel builders (source listing, call/timer timelines)
import type { ListPanel, Tone, TimelinePanel } from '@/engine/types';

// ─── Fake clock harness (hidden code prepended to learner tasks) ───────────────

export const FAKE_CLOCK = `
class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.timers = [];
  }
  setTimeout(fn, ms) {
    const id = this.nextId++;
    this.timers.push({ id: id, at: this.now + ms, fn: fn });
    return id;
  }
  clearTimeout(id) {
    this.timers = this.timers.filter(function (t) { return t.id !== id; });
  }
  advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = this.timers
        .filter(function (t) { return t.at <= end; })
        .sort(function (a, b) { return a.at - b.at || a.id - b.id; })[0];
      if (!due) break;
      this.timers = this.timers.filter(function (t) { return t !== due; });
      this.now = due.at;
      due.fn();
    }
    this.now = end;
  }
}
`;

/** Adapter: runTimed(fn, wait, times) -> [[firedAt, callIndex], ...] */
export const TIMED_HARNESS = `${FAKE_CLOCK}
function runTimed(make, wait, times) {
  const clock = new FakeClock();
  const log = [];
  const wrapped = make(function (i) { log.push([clock.now, i]); }, wait, clock);
  times.forEach(function (t, i) {
    clock.advance(t - clock.now);
    wrapped(i);
  });
  clock.advance(100000);
  return log;
}
`;

/** Adapter: runOps(make, wait, ops) with ops [[t, 'call'|'cancel'|'flush', arg?], ...] */
export const OPS_HARNESS = `${FAKE_CLOCK}
function runOps(make, wait, ops) {
  const clock = new FakeClock();
  const log = [];
  const wrapped = make(function (v) { log.push([clock.now, v]); }, wait, clock);
  ops.forEach(function (op) {
    clock.advance(op[0] - clock.now);
    if (op[1] === 'call') wrapped(op[2]);
    else wrapped[op[1]]();
  });
  clock.advance(100000);
  return log;
}
`;

// ─── Panels ────────────────────────────────────────────────────────────────

const nbsp = (s: string) => s.replace(/^ +/, (m) => ' '.repeat(m.length));

/** Vertical listing of source lines with the running line highlighted. */
export function sourcePanel(lines: string[], active: number, done: Iterable<number> = [], title = 'Program'): ListPanel {
  const d = new Set(done);
  return {
    type: 'list',
    title,
    orientation: 'vertical',
    items: lines.map((l, i) => ({ id: `src${i}`, label: nbsp(l) || ' ', tone: (i === active ? 'active' : d.has(i) ? 'done' : 'default') as Tone })),
  };
}

export interface TimerWindow {
  start: number;
  end: number;
  tone: Tone;
  label: string;
}

/** Calls / timer / fn-runs lanes on a shared time axis. */
export function callsTimeline(o: { calls: { t: number; i: number }[]; windows: TimerWindow[]; fires: { t: number; i: number }[]; now: number; tMax: number; title?: string }): TimelinePanel {
  return {
    type: 'timeline',
    title: o.title,
    unit: 'ms',
    tMax: o.tMax,
    now: o.now,
    lanes: [
      { label: 'calls', events: o.calls.map((c) => ({ t: c.t, label: `#${c.i}`, tone: 'compare' as Tone })) },
      { label: 'timer', events: o.windows.map((w) => ({ t: w.start, dur: Math.max(0, w.end - w.start), label: w.label, tone: w.tone })) },
      { label: 'fn runs', events: o.fires.map((f) => ({ t: f.t, label: `#${f.i}`, tone: 'found' as Tone })) },
    ],
  };
}

/** Validate an ascending list of non-negative integer call times. */
export function checkTimes(times: number[], wait: number): void {
  if (!Number.isInteger(wait) || wait < 1 || wait > 500) throw new Error('wait must be a whole number from 1 to 500');
  if (!times.length) throw new Error('Add at least one call time');
  times.forEach((t, i) => {
    if (!Number.isInteger(t) || t < 0 || t > 2000) throw new Error('Call times are whole milliseconds from 0 to 2000');
    if (i > 0 && t < times[i - 1]) throw new Error('Call times must be in ascending order');
  });
}

// ─── Event-loop simulator ──────────────────────────────────────────────────

export type LoopOp =
  | { log: string }
  | { timeout: number; do: LoopOp[] }
  | { then: LoopOp[] }
  | { micro: LoopOp[] }
  | { async: LoopOp[] }
  | { await: true };

export interface LoopState {
  lines: string[];
  active: number;
  done: number[];
  stack: string[];
  micro: string[];
  tasks: string[];
  timers: string[];
  log: string[];
  now: number;
}

export type LoopAnchor = 'script' | 'drain' | 'micro' | 'wait' | 'task' | 'idle';

interface LoopTask {
  ops: LoopOp[];
  from: number;
  label: string;
  line: number;
  due: number;
  seq: number;
}

const firstLog = (ops: LoopOp[]): string => {
  for (const op of ops) {
    if ('log' in op) return op.log;
    const inner = 'timeout' in op ? op.do : 'then' in op ? op.then : 'micro' in op ? op.micro : 'async' in op ? op.async : null;
    if (inner) {
      const f = firstLog(inner);
      if (f) return f;
    }
  }
  return '';
};

function flatten(ops: LoopOp[], depth: number, lines: string[], lineOf: Map<LoopOp, number>): void {
  const pad = '  '.repeat(depth);
  for (const op of ops) {
    lineOf.set(op, lines.length);
    if ('log' in op) lines.push(`${pad}console.log('${op.log}')`);
    else if ('await' in op) lines.push(`${pad}await null`);
    else {
      const [open, close, body] =
        'timeout' in op
          ? ['setTimeout(() => {', `}, ${op.timeout})`, op.do]
          : 'then' in op
            ? ['Promise.resolve().then(() => {', '})', op.then]
            : 'micro' in op
              ? ['queueMicrotask(() => {', '})', op.micro]
              : ['(async () => {', '})()', op.async];
      lines.push(pad + open);
      flatten(body as LoopOp[], depth + 1, lines, lineOf);
      lines.push(pad + close);
    }
  }
}

/** Run a scripted program through a model event loop, reporting every state change. Returns the console output. */
export function simulateEventLoop(script: LoopOp[], emit: (anchor: LoopAnchor, caption: string, s: LoopState) => void): string[] {
  const lines: string[] = [];
  const lineOf = new Map<LoopOp, number>();
  flatten(script, 0, lines, lineOf);
  const log: string[] = [];
  const micro: LoopTask[] = [];
  const timers: LoopTask[] = [];
  const tasks: LoopTask[] = [];
  const stack: string[] = [];
  const done = new Set<number>();
  let now = 0;
  let seq = 0;
  let active = -1;
  let steps = 0;
  const snap = (anchor: LoopAnchor, caption: string) => {
    if (++steps > 400) throw new Error('Program is too long to animate');
    emit(anchor, caption, {
      lines,
      active,
      done: [...done],
      stack: [...stack],
      micro: micro.map((t) => t.label),
      tasks: tasks.map((t) => t.label),
      timers: timers.map((t) => `${t.label} (due ${t.due}ms)`),
      log: [...log],
      now,
    });
  };
  const mk = (kind: string, ops: LoopOp[], from: number, line: number, due = 0): LoopTask => ({ ops, from, line, due, seq: seq++, label: `${kind} → ${firstLog(ops.slice(from)) || '…'}` });
  const exec = (ops: LoopOp[], from: number, anchor: LoopAnchor): void => {
    for (let i = from; i < ops.length; i++) {
      const op = ops[i];
      active = lineOf.get(op) ?? -1;
      done.add(active);
      if ('log' in op) {
        log.push(op.log);
        snap(anchor, `console.log('${op.log}') prints right away`);
      } else if ('timeout' in op) {
        timers.push(mk(`timer ${op.timeout}ms`, op.do, 0, active, now + op.timeout));
        snap(anchor, `setTimeout hands the callback to the timer Web API (${op.timeout}ms)`);
      } else if ('then' in op) {
        micro.push(mk('then', op.then, 0, active));
        snap(anchor, 'Promise already resolved: .then callback goes to the microtask queue');
      } else if ('micro' in op) {
        micro.push(mk('queueMicrotask', op.micro, 0, active));
        snap(anchor, 'queueMicrotask puts the callback in the microtask queue');
      } else if ('async' in op) {
        stack.push('async fn');
        snap(anchor, 'async function called: its body runs synchronously');
        exec(op.async, 0, anchor);
        stack.pop();
      } else {
        micro.push(mk('await', ops, i + 1, active));
        snap(anchor, 'await pauses the function: the rest is queued as a microtask');
        return;
      }
    }
  };
  const runTask = (t: LoopTask, anchor: LoopAnchor, verb: string) => {
    stack.push(t.label);
    active = t.line;
    snap(anchor, `${verb}: ${t.label}`);
    exec(t.ops, t.from, anchor);
    stack.pop();
    active = -1;
  };

  stack.push('<script>');
  exec(script, 0, 'script');
  stack.pop();
  active = -1;
  snap('script', 'Script finished: the call stack is empty');
  for (;;) {
    if (micro.length) snap('drain', 'Stack empty: drain ALL microtasks before any task');
    while (micro.length) runTask(micro.shift()!, 'micro', 'Run microtask');
    if (!tasks.length) {
      if (!timers.length) break;
      timers.sort((a, b) => a.due - b.due || a.seq - b.seq);
      now = timers[0].due;
      while (timers.length && timers[0].due <= now) tasks.push(timers.shift()!);
      snap('wait', `Clock reaches ${now}ms: due timer callbacks join the task queue`);
    }
    runTask(tasks.shift()!, 'task', 'Run task');
  }
  snap('idle', `Nothing left to run. Output: ${log.join(' ') || '(empty)'}`);
  return log;
}

/** Independent, closure-based model of the same loop used to cross-check the visualizer. */
export function referenceEventLoop(script: LoopOp[]): string[] {
  const out: string[] = [];
  const micros: (() => void)[] = [];
  let timers: { at: number; id: number; run: () => void }[] = [];
  let clock = 0;
  let ids = 0;
  const compile = (ops: LoopOp[], from = 0): (() => void) => () => {
    for (let i = from; i < ops.length; i++) {
      const op = ops[i];
      if ('log' in op) out.push(op.log);
      else if ('timeout' in op) {
        const at = clock + op.timeout;
        timers.push({ at, id: ids++, run: compile(op.do) });
      } else if ('then' in op) micros.push(compile(op.then));
      else if ('micro' in op) micros.push(compile(op.micro));
      else if ('async' in op) compile(op.async)();
      else {
        micros.push(compile(ops, i + 1));
        return;
      }
    }
  };
  compile(script)();
  for (;;) {
    while (micros.length) micros.shift()!();
    if (!timers.length) break;
    const next = Math.min(...timers.map((t) => t.at));
    const batch = timers.filter((t) => t.at === next).sort((a, b) => a.id - b.id);
    timers = timers.filter((t) => t.at !== next);
    clock = next;
    for (const t of batch) {
      t.run();
      while (micros.length) micros.shift()!();
    }
  }
  return out;
}
