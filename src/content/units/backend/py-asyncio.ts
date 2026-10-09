import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { ASYNC_HARNESS, clip } from '@/content/lib/finish-m2m3';

const code = `
import asyncio, time

async def fetch(name, delay):
    print(name, "start")                       #@start
    await asyncio.sleep(delay)                 #@await
    # time.sleep(delay) here would freeze the whole loop   #@block
    print(name, "done")                        #@done
    return name

async def main():
    print("main: start")                       #@main
    # sequential: await fetch("A", 3); await fetch("B", 1); ...   #@seq
    results = await asyncio.gather(            #@gather
        fetch("A", 3), fetch("B", 1), fetch("C", 2))
    print("main:", results)                    #@results

asyncio.run(main())                            #@run
`;

type Mode = 'gather (concurrent)' | 'await one by one' | 'blocking time.sleep';
const MODES: Mode[] = ['gather (concurrent)', 'await one by one', 'blocking time.sleep'];
const NAMES = ['A', 'B', 'C', 'D'];

type Op =
  | { k: 'print'; at: string; text: string; fin?: string }
  | { k: 'sleep'; d: number }
  | { k: 'block'; d: number }
  | { k: 'spawn'; names: string[] }
  | { k: 'gather'; names: string[] };

interface Task {
  name: string;
  ops: Op[];
  pc: number;
  state: 'ready' | 'sleeping' | 'waiting' | 'done';
  wake: number;
  waitFor: string[];
}

interface Lane {
  label: string;
  events: { t: number; dur: number; label: string; tone: Tone }[];
}

interface Sim {
  clock: number;
  running: string | null;
  ready: string[];
  sleeping: Task[];
  log: string[];
  lanes: Record<string, Lane>;
  finished: string[];
  tasks: Record<string, Task>;
}

type Emit = (anchor: string, caption: string, s: Sim) => void;

function fetchOps(name: string, d: number, mode: Mode): Op[] {
  return [{ k: 'print', at: 'start', text: `${name} start` }, mode === 'blocking time.sleep' ? { k: 'block', d } : { k: 'sleep', d }, { k: 'print', at: 'done', text: `${name} done`, fin: name }];
}

/** A real (tiny) event loop: ready queue, timers, a virtual clock. Returns what finished and when. */
function simulate(mode: Mode, delays: number[], emit: Emit): { finished: string[]; total: number } {
  const names = delays.map((_, i) => NAMES[i]);
  const s: Sim = { clock: 0, running: null, ready: [], sleeping: [], log: [], lanes: {}, finished: [], tasks: {} };
  const lane = (n: string): Lane => (s.lanes[n] ??= { label: n === 'main' ? 'main()' : `fetch ${n}`, events: [] });
  const mk = (name: string, ops: Op[]): Task => {
    const t: Task = { name, ops, pc: 0, state: 'ready', wake: 0, waitFor: [] };
    s.tasks[name] = t;
    lane(name);
    return t;
  };
  const mainOps: Op[] =
    mode === 'await one by one'
      ? [{ k: 'print', at: 'main', text: 'main: start' }, ...names.flatMap((n, i) => fetchOps(n, delays[i], mode)), { k: 'print', at: 'results', text: `main: [${names.map((n) => `'${n}'`).join(', ')}]` }]
      : [{ k: 'print', at: 'main', text: 'main: start' }, { k: 'spawn', names }, { k: 'gather', names }, { k: 'print', at: 'results', text: `main: [${names.map((n) => `'${n}'`).join(', ')}]` }];
  const main = mk('main', mainOps);
  s.ready.push('main');
  emit('run', 'asyncio.run starts the loop with main() as the only task in the ready queue', s);

  const timers: Task[] = s.sleeping;
  const runSlice = (t: Task) => {
    s.running = t.name;
    lane(t.name).events.push({ t: s.clock, dur: 0.25, label: 'run', tone: 'active' });
    for (;;) {
      if (t.pc >= t.ops.length) {
        t.state = 'done';
        s.running = null;
        // wake whoever waits on us
        for (const w of Object.values(s.tasks)) {
          if (w.state === 'waiting' && w.waitFor.every((n) => s.tasks[n].state === 'done')) {
            w.state = 'ready';
            s.ready.push(w.name);
            emit('gather', `${t.name} was the last one gather waits for: main goes back in the ready queue`, s);
          }
        }
        return;
      }
      const op = t.ops[t.pc++];
      if (op.k === 'print') {
        s.log.push(op.text);
        if (op.fin) s.finished.push(op.fin);
        emit(op.at, `${t.name} prints "${op.text}"`, s);
      } else if (op.k === 'spawn') {
        for (const n of op.names) {
          const i = names.indexOf(n);
          mk(n, fetchOps(n, delays[i], mode));
          s.ready.push(n);
        }
        emit('gather', `gather wraps ${op.names.join(', ')} in tasks and queues them; none has started yet`, s);
      } else if (op.k === 'gather') {
        t.state = 'waiting';
        t.waitFor = op.names;
        s.running = null;
        lane(t.name).events.push({ t: s.clock, dur: 0.1, label: 'await gather', tone: 'muted' });
        emit('gather', `main awaits gather: it parks, the loop picks the next ready task (${s.ready[0] ?? 'none'})`, s);
        return;
      } else if (op.k === 'block') {
        lane(t.name).events.push({ t: s.clock, dur: op.d, label: `time.sleep(${op.d})`, tone: 'error' });
        s.clock += op.d;
        emit('block', `${t.name} calls time.sleep(${op.d}): the loop is frozen, clock jumps to t=${s.clock}`, s);
      } else if (op.d <= 0) {
        // sleep(0): just yield to the back of the ready queue
        t.state = 'ready';
        s.ready.push(t.name);
        s.running = null;
        emit('await', `${t.name} awaits sleep(0): it yields and re-queues behind ${s.ready.length > 1 ? s.ready[0] : 'nobody'}`, s);
        return;
      } else {
        t.state = 'sleeping';
        t.wake = s.clock + op.d;
        timers.push(t);
        lane(t.name).events.push({ t: s.clock, dur: op.d, label: `sleep ${op.d}`, tone: 'frontier' });
        s.running = null;
        emit('await', `${t.name} awaits sleep(${op.d}): it parks until t=${t.wake}, the loop moves on`, s);
        return;
      }
    }
  };

  while (main.state !== 'done') {
    if (s.ready.length) {
      const t = s.tasks[s.ready.shift()!];
      t.state = 'ready';
      runSlice(t);
      continue;
    }
    if (!timers.length) throw new Error('Deadlock: nothing is ready and no timer is pending');
    timers.sort((a, b) => a.wake - b.wake);
    const next = timers[0].wake;
    if (next > s.clock) {
      s.clock = next;
      emit('await', `Nothing is ready: the loop jumps the clock to t=${s.clock}, the next timer`, s);
    }
    while (timers.length && timers[0].wake <= s.clock) {
      const t = timers.shift()!;
      t.state = 'ready';
      s.ready.push(t.name);
      emit('await', `t=${s.clock}: ${t.name}'s sleep is over, so it re-enters the ready queue`, s);
    }
  }
  return { finished: s.finished, total: s.clock };
}

interface In {
  mode: Mode;
  delays: number[];
}

const viz: VizDef<In> = {
  id: 'py-asyncio',
  title: 'The asyncio event loop',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'How main() runs the fetches', kind: 'select', options: MODES, default: 'gather (concurrent)' },
    { key: 'delays', label: 'Delay of each fetch (seconds)', kind: 'numbers', default: [3, 1, 2], maxItems: 4, help: '1 to 4 whole numbers from 0 to 9. A, B, C, D are the fetch tasks.' },
  ],
  presets: [
    { label: 'Concurrent', input: { mode: 'gather (concurrent)', delays: [3, 1, 2] } },
    { label: 'One by one', input: { mode: 'await one by one', delays: [3, 1, 2] } },
    { label: 'Blocking call', input: { mode: 'blocking time.sleep', delays: [3, 1, 2] } },
    { label: 'Zero delays', input: { mode: 'gather (concurrent)', delays: [0, 0, 1] } },
  ],
  run({ mode, delays }) {
    if (!MODES.includes(mode)) throw new Error('Pick one of: ' + MODES.join(', '));
    if (!delays.length || delays.length > 4 || delays.some((d) => !Number.isInteger(d) || d < 0 || d > 9)) throw new Error('Give 1 to 4 whole-number delays between 0 and 9');
    const full = simulate(mode, delays, () => {});
    const r = new Recorder(code);
    const tMax = Math.max(full.total, 1) + 0.5;
    const panels = (s: Sim): Panel[] => [
      {
        type: 'list',
        title: 'Ready queue (front runs next)',
        orientation: 'horizontal',
        items: [...(s.running ? [{ id: s.running, label: s.running, sub: 'running', tone: 'active' as Tone }] : []), ...s.ready.map((n) => ({ id: n, label: n, tone: 'frontier' as Tone }))],
        emptyText: 'empty',
      },
      {
        type: 'list',
        title: 'Waiting on a timer',
        orientation: 'horizontal',
        items: [...s.sleeping].sort((a, b) => a.wake - b.wake).map((t) => ({ id: t.name, label: t.name, sub: `wakes t=${t.wake}`, tone: 'muted' as Tone })),
        emptyText: 'none',
      },
      { type: 'timeline', title: 'Per-task timeline (virtual seconds)', lanes: Object.values(s.lanes).map((l) => ({ label: l.label, events: l.events.map((e) => ({ ...e })) })), tMax, now: s.clock, unit: 's' },
      { type: 'log', title: 'Output so far', lines: s.log.map((text) => ({ text, tone: 'default' as Tone })) },
    ];
    const out = simulate(mode, delays, (anchor, caption, s) => {
      r.op();
      r.step(anchor, clip(caption), panels(s), { clock: s.clock, running: s.running ?? '-', ready: s.ready.join(',') || '-' });
    });
    return { frames: r.frames, result: { finished: out.finished, total: out.total } };
  },
  reference({ mode, delays }) {
    const names = delays.map((_, i) => NAMES[i]);
    if (mode === 'gather (concurrent)') {
      const order = names.map((n, i) => ({ n, d: delays[i], i })).sort((a, b) => a.d - b.d || a.i - b.i);
      return { finished: order.map((o) => o.n), total: Math.max(...delays) };
    }
    return { finished: names, total: delays.reduce((a, b) => a + b, 0) };
  },
};

const HARNESS = `${ASYNC_HARNESS}
LOG = []
STATE = {"active": 0, "peak": 0}
DELAYS = {"a": 3, "b": 1, "c": 2, "d": 0}

async def fetch(name):
    STATE["active"] += 1
    STATE["peak"] = max(STATE["peak"], STATE["active"])
    LOG.append(name + " start")
    await asyncio.sleep(DELAYS[name])
    LOG.append(name + " done")
    STATE["active"] -= 1
    return name.upper()

def run_fetch(fn, *args):
    STATE["active"] = STATE["peak"] = 0
    results, elapsed = run_virtual(fn(*args))
    return [results, elapsed]

def run_peak(fn, *args):
    STATE["active"] = STATE["peak"] = 0
    results, elapsed = run_virtual(fn(*args))
    return [results, elapsed, STATE["peak"]]
`;

const unit: Unit = {
  id: 'py-asyncio',
  hook: 'Async Python is everywhere in modern backends, and interviewers use it to check whether you know what `await` really does. The answer is not "runs in parallel": it hands control back to a single-threaded event loop.',
  simulationNote: 'The visualizer is a tiny event-loop simulation. Exercises use a small deterministic loop with a virtual clock (sleeps cost no real time), because real asyncio.run() cannot block inside the browser.',
  predict: {
    prompt: 'What is the total running time of this program?',
    code: 'import asyncio, time\n\nasync def job(n):\n    time.sleep(1)\n    return n\n\nasync def main():\n    await asyncio.gather(job(1), job(2), job(3))\n\nasyncio.run(main())',
    codeLang: 'python',
    options: ['About 1 second, because gather runs the jobs concurrently', 'About 3 seconds, because time.sleep blocks the event loop', 'About 1 second, but the results come back out of order', 'It raises an error because time.sleep is not awaitable'],
    answer: 1,
    explain: 'There is one thread. time.sleep never hands control back to the loop, so job 1 holds the whole loop for a second, then job 2, then job 3. With await asyncio.sleep(1) each job would park and the total would be about 1 second.',
  },
  viz,
  deeper: {
    points: [
      'One thread, one event loop: it keeps a ready queue of tasks that can run now and a set of timers for tasks that are waiting.',
      '`await` is a polite pause. The coroutine stops at that line, the loop runs another ready task, and the coroutine resumes when what it awaited is done.',
      'Calling `fetch(...)` only creates a coroutine object. Nothing runs until it is awaited or wrapped in a task by `asyncio.create_task` or `asyncio.gather`.',
      '`gather` returns results in the order you passed the awaitables, not in the order they finished.',
      'Async helps with waiting (network, disk, sleeps). It does not speed up CPU-bound work and any blocking call, such as time.sleep or a heavy loop, freezes every task.',
    ],
    complexity: { time: 'max of the waits when concurrent, sum of the waits when sequential', space: 'one small task object per coroutine' },
    pitfalls: ['Calling a blocking function (time.sleep, requests.get) inside async code', 'Awaiting inside a loop and thinking the work is concurrent', 'Forgetting to await a coroutine, which silently does nothing', 'Starting tasks and never keeping a reference or awaiting them'],
  },
  practice: {
    language: 'python',
    fnName: 'fetch_all',
    statement: 'Write `async def fetch_all(names)` that starts `fetch(name)` for every name at the same time and returns the results in the same order as `names`. `fetch` and `asyncio` are already available.',
    signature: 'async def fetch_all(names):',
    solution: `async def fetch_all(names):
    coros = [@@fetch(n)@@ for n in names]
    results = await @@asyncio.gather(*coros)@@
    return @@list(results)@@`,
    harness: HARNESS,
    adapter: 'run_fetch',
    tests: [
      { args: [['a', 'b', 'c']], expected: [['A', 'B', 'C'], 3], name: 'three at once take as long as the slowest' },
      { args: [['c', 'a']], expected: [['C', 'A'], 3], name: 'results follow the input order' },
      { args: [['b']], expected: [['B'], 1], name: 'single name' },
      { args: [[]], expected: [[], 0], name: 'no names' },
      { args: [['a', 'd', 'b']], expected: [['A', 'D', 'B'], 3], name: 'a zero-delay fetch in the middle' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'fetch_all',
    statement: 'This version creates tasks but the three fetches still run one after another (total 6 seconds instead of 3). Fix it so they overlap.',
    buggy: `async def fetch_all(names):
    results = []
    for n in names:
        task = asyncio.create_task(fetch(n))
        results.append(await task)
    return results`,
    fixed: `async def fetch_all(names):
    tasks = [asyncio.create_task(fetch(n)) for n in names]
    results = []
    for task in tasks:
        results.append(await task)
    return results`,
    harness: HARNESS,
    adapter: 'run_fetch',
    tests: [
      { args: [['a', 'b', 'c']], expected: [['A', 'B', 'C'], 3], name: 'overlapping fetches' },
      { args: [['b', 'b']], expected: [['B', 'B'], 1], name: 'two equal waits overlap' },
      { args: [['c', 'a']], expected: [['C', 'A'], 3], name: 'order preserved' },
      { args: [[]], expected: [[], 0], name: 'empty' },
    ],
    bugType: 'await inside the creating loop',
    hint: 'Where does the first task get awaited? Has the second task been created by then?',
    explanation: 'create_task schedules the coroutine, but awaiting it immediately parks the loop on that one task until it ends, so the next task is not even created yet. Create every task first, then await them.',
  },
  boss: {
    title: 'Fetch with a concurrency limit',
    statement: 'Write `async def fetch_limited(names, limit)` that returns the results in the order of `names` but never has more than `limit` fetches running at the same time (the others wait their turn). Use an asyncio primitive for the limit. `fetch` and `asyncio` are available.',
    language: 'python',
    fnName: 'fetch_limited',
    starter: `async def fetch_limited(names, limit):
    # your code here
    pass
`,
    solution: `async def fetch_limited(names, limit):
    gate = asyncio.Semaphore(limit)

    async def guarded(name):
        async with gate:
            return await fetch(name)

    return await asyncio.gather(*[guarded(n) for n in names])`,
    harness: HARNESS,
    adapter: 'run_peak',
    tests: [
      { args: [['a', 'b', 'c', 'd'], 2], expected: [['A', 'B', 'C', 'D'], 3, 2], name: 'two at a time' },
      { args: [['a', 'b', 'c'], 1], expected: [['A', 'B', 'C'], 6, 1], name: 'limit 1 is sequential' },
      { args: [['a', 'b', 'c'], 3], expected: [['A', 'B', 'C'], 3, 3], name: 'limit equals the number of jobs' },
      { args: [['c', 'a', 'b', 'd'], 2], expected: [['C', 'A', 'B', 'D'], 3, 2], name: 'slots are reused as jobs finish' },
      { args: [[], 2], expected: [[], 0, 0], name: 'nothing to do' },
    ],
    hints: ['asyncio.Semaphore(limit) hands out `limit` permits; `async with gate:` takes one and returns it when the block ends.', 'Wrap each fetch in a small inner coroutine that acquires the semaphore, then gather all the wrapped coroutines at once.'],
    combines: [],
  },
  quiz: [
    {
      prompt: 'What happens if you call an async function without awaiting it, like `fetch("a")` on its own line?',
      options: ['It runs in the background immediately', 'It creates a coroutine object and runs nothing', 'It blocks the loop until it is done', 'It raises a SyntaxError'],
      answer: 1,
      explain: 'Calling an async function only builds a coroutine object. It runs when something awaits it or schedules it as a task.',
    },
  ],
};

export default unit;
