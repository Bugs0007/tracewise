import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/backend-python';

const code = `
import threading, time

def worker(kind):                          #@worker
    for _ in range(work):
        crunch()                           #@cpu
        if kind == 'io':
            time.sleep(wait)               #@io

Worker = threading.Thread                  #@make
pool = [Worker(target=worker, args=(kind,)) for _ in range(n)]
for w in pool: w.start()                   #@start
for w in pool: w.join()                    #@join
`;

interface In {
  kind: string;
  mode: string;
  n: number;
  work: number;
  wait: number;
  slice: number;
}

type Cell = 'run' | 'gil' | 'io' | 'done';

interface Sim {
  ticks: Cell[][]; // ticks[t][thread]
  holders: number[][];
  queues: number[][];
  wall: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Deterministic tick-by-tick scheduler: one GIL for threads, one interpreter each for processes. */
function simulate(kind: string, mode: string, n: number, work: number, wait: number, slice: number): Sim {
  const threadsMode = mode === 'threads';
  const io = kind === 'io';
  type S = 'ready' | 'run' | 'wait' | 'done';
  const th = Array.from({ length: n }, (_, id) => ({ id, round: 0, sliceUsed: 0, state: 'ready' as S, wake: 0 }));
  const ready: number[] = th.map((t) => t.id);
  const running: number[] = [];
  const ticks: Cell[][] = [];
  const holders: number[][] = [];
  const queues: number[][] = [];
  let t = 0;
  while (th.some((x) => x.state !== 'done') && t < 400) {
    const woken = th.filter((x) => x.state === 'wait' && x.wake <= t).sort((a, b) => a.wake - b.wake || a.id - b.id);
    for (const w of woken) {
      if (w.round >= work) w.state = 'done';
      else {
        w.state = 'ready';
        ready.push(w.id);
      }
    }
    const capacity = threadsMode ? 1 : n;
    while (running.length < capacity && ready.length) {
      const id = ready.shift()!;
      th[id].state = 'run';
      th[id].sliceUsed = 0;
      running.push(id);
    }
    if (th.every((x) => x.state === 'done')) break;
    ticks.push(th.map((x) => (x.state === 'done' ? 'done' : x.state === 'run' ? 'run' : x.state === 'ready' ? 'gil' : 'io')));
    holders.push([...running]);
    queues.push([...ready]);
    for (const id of [...running]) {
      const x = th[id];
      x.round++;
      x.sliceUsed++;
      if (io) {
        x.state = 'wait';
        x.wake = t + 1 + wait;
        running.splice(running.indexOf(id), 1);
      } else if (x.round >= work) {
        x.state = 'done';
        running.splice(running.indexOf(id), 1);
      } else if (threadsMode && x.sliceUsed >= slice && ready.length) {
        x.state = 'ready';
        ready.push(id);
        running.splice(running.indexOf(id), 1);
      }
    }
    t++;
  }
  return { ticks, holders, queues, wall: ticks.length };
}

const LABEL: Record<Cell, string> = { run: 'run', gil: 'wait GIL', io: 'I/O', done: 'done' };
const TONE: Record<Cell, Tone> = { run: 'active', gil: 'muted', io: 'frontier', done: 'done' };

function lanes(sim: Sim, upTo: number, n: number): { label: string; events: TimelineEvent[] }[] {
  const out: { label: string; events: TimelineEvent[] }[] = [];
  for (let i = 0; i < n; i++) {
    const events: TimelineEvent[] = [];
    for (let t = 0; t <= upTo && t < sim.ticks.length; t++) {
      const c = sim.ticks[t][i];
      if (c === 'done') continue;
      const last = events[events.length - 1];
      if (last && last.label === LABEL[c] && last.t + (last.dur ?? 0) === t) last.dur = (last.dur ?? 0) + 1;
      else events.push({ t, dur: 1, label: LABEL[c], tone: TONE[c] });
    }
    out.push({ label: `thread ${i}`, events });
  }
  return out;
}

const viz: VizDef<In> = {
  id: 'py-gil-threading',
  title: 'The GIL: one thread runs Python at a time',
  code,
  language: 'python',
  inputs: [
    { key: 'kind', label: 'Workload', kind: 'select', default: 'cpu', options: ['cpu', 'io'] },
    { key: 'mode', label: 'Workers are', kind: 'select', default: 'threads', options: ['threads', 'processes'] },
    { key: 'n', label: 'Workers (n)', kind: 'number', default: 3 },
    { key: 'work', label: 'Rounds each (work)', kind: 'number', default: 3 },
    { key: 'wait', label: 'I/O wait ticks (wait)', kind: 'number', default: 3 },
    { key: 'slice', label: 'Switch interval (ticks)', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'CPU-bound threads', input: { kind: 'cpu', mode: 'threads' } },
    { label: 'I/O-bound threads', input: { kind: 'io', mode: 'threads' } },
    { label: 'CPU-bound processes', input: { kind: 'cpu', mode: 'processes' } },
    { label: 'I/O-bound processes', input: { kind: 'io', mode: 'processes' } },
  ],
  run(input) {
    const kind = input.kind === 'io' ? 'io' : 'cpu';
    const mode = input.mode === 'processes' ? 'processes' : 'threads';
    const n = clampInt(input.n, 2, 4);
    const work = clampInt(input.work, 1, 4);
    const wait = clampInt(input.wait, 1, 4);
    const slice = clampInt(input.slice, 1, 4);
    const sim = simulate(kind, mode, n, work, wait, slice);
    const serial = n * work * (kind === 'io' ? 1 + wait : 1);
    const r = new Recorder(code);
    const unitName = mode === 'threads' ? 'thread' : 'process';

    const view = (upTo: number, holder: string, queue: number[]): Panel[] => [
      { type: 'timeline', title: `Time in ticks, one lane per ${unitName}`, tMax: Math.max(sim.wall, 1), now: upTo + 1, lanes: lanes(sim, upTo, n) },
      {
        type: 'list',
        title: mode === 'threads' ? 'Waiting for the GIL (FIFO)' : 'Waiting for a lock',
        orientation: 'horizontal',
        items: queue.map((q) => ({ id: String(q), label: `T${q}`, tone: 'frontier' as Tone })),
        emptyText: mode === 'threads' ? 'nobody is queued' : 'no shared lock: nobody waits',
        endLabel: 'next',
      },
      { type: 'kv', title: 'Right now', entries: [{ k: mode === 'threads' ? 'GIL holder' : 'running in parallel', v: holder }, { k: 'ticks elapsed', v: upTo + 1 }] },
    ];
    r.step('make', cap(mode === 'threads' ? `${n} Thread objects share one interpreter and one GIL` : `${n} Process objects each get their own interpreter and their own GIL`), view(-1, '-', []), { n, kind, mode });
    r.step('start', cap(mode === 'threads' ? 'start() makes all threads runnable; the GIL admits one at a time' : 'start() launches separate OS processes: nothing is shared'), view(-1, '-', mode === 'threads' ? Array.from({ length: n }, (_, i) => i) : []), { n });

    for (let t = 0; t < sim.wall; t++) {
      const hs = sim.holders[t];
      const q = sim.queues[t];
      const names = hs.map((h) => `T${h}`).join(', ') || 'none';
      let caption: string;
      if (!hs.length) caption = `t=${t}: nobody needs the interpreter; every ${unitName} is waiting on I/O`;
      else if (mode === 'threads') caption = q.length ? `t=${t}: T${hs[0]} holds the GIL; ${q.map((x) => 'T' + x).join(', ')} must wait` : `t=${t}: T${hs[0]} holds the GIL and nobody else is ready`;
      else caption = `t=${t}: ${names} compute at the same time (separate GILs)`;
      r.op();
      r.step(hs.length ? 'cpu' : 'io', cap(caption), view(t, names, q), { t, holder: names });
    }
    const speed = Math.round((serial / sim.wall) * 10) / 10;
    r.step('join', cap(`All done at t=${sim.wall}. One after another it would take ${serial}: speed-up x${speed}`), view(sim.wall - 1, '-', []), { wall: sim.wall, serial });
    return { frames: r.frames, result: { wall: sim.wall, serial } };
  },
  reference(input) {
    const kind = input.kind === 'io' ? 'io' : 'cpu';
    const mode = input.mode === 'processes' ? 'processes' : 'threads';
    const n = clampInt(input.n, 2, 4);
    const work = clampInt(input.work, 1, 4);
    const wait = clampInt(input.wait, 1, 4);
    const serial = n * work * (kind === 'io' ? 1 + wait : 1);
    if (mode === 'processes') return { wall: work * (kind === 'io' ? 1 + wait : 1), serial };
    if (kind === 'cpu') return { wall: n * work, serial };
    // I/O threads: each round needs the GIL for one tick; serve whoever became ready first
    const avail = Array.from({ length: n }, () => 0);
    const left = Array.from({ length: n }, () => work);
    let free = 0;
    let wall = 0;
    for (;;) {
      let pick = -1;
      for (let i = 0; i < n; i++) if (left[i] > 0 && (pick < 0 || avail[i] < avail[pick])) pick = i;
      if (pick < 0) break;
      const start = Math.max(free, avail[pick]);
      free = start + 1;
      avail[pick] = start + 1 + wait;
      left[pick]--;
      wall = Math.max(wall, avail[pick]);
    }
    return { wall, serial };
  },
};

const unit: Unit = {
  id: 'py-gil-threading',
  hook: '"Does threading make Python faster?" is a classic. The honest answer depends on the workload: the GIL lets only one thread run Python bytecode at a time, so threads help with waiting (I/O) but not with computing; processes sidestep the lock.',
  predict: {
    prompt: 'On standard CPython, roughly how does this compare?',
    code: `def count(n):
    while n:
        n -= 1

# A: count(100_000_000) in one thread
# B: two threads, each running count(50_000_000)`,
    codeLang: 'python',
    options: ['B is about twice as fast as A', 'B is about as slow as A, sometimes slower', 'B is four times as fast as A', 'B cannot run because of the GIL'],
    answer: 1,
    explain:
      'The work is pure Python bytecode, so the two threads take turns holding the GIL. Total CPU work is unchanged, and the lock hand-offs add a little overhead. Use multiprocessing for CPU-bound parallelism.',
  },
  viz,
  deeper: {
    points: [
      'The Global Interpreter Lock is a mutex inside CPython that lets only one thread execute Python bytecode at a time. It protects the interpreter\'s internal state (like reference counts).',
      'A running thread gives up the GIL when it blocks on I/O or sleeps, or after the switch interval (5 ms by default) when others are waiting. That is why CPU-bound threads interleave but do not speed up.',
      'I/O-bound work gains from threads: while one thread waits on the network, others run. `asyncio` gets the same overlap with a single thread.',
      'Processes (`multiprocessing`, `concurrent.futures.ProcessPoolExecutor`) each have their own interpreter and GIL, so CPU-bound work scales across cores. The cost: startup time and copying data between processes.',
      'Libraries like NumPy release the GIL during heavy native loops. Even with the GIL, compound operations such as `counter += 1` are not atomic, so shared state still needs a `threading.Lock`.',
    ],
    pitfalls: [
      'Using threads to speed up CPU-bound loops',
      'Assuming the GIL makes your code thread-safe (read-modify-write races still happen)',
      'Spawning a process per tiny task: the overhead exceeds the work',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'gil_schedule',
    statement:
      'Model GIL hand-off. `work` maps thread names (in start order) to the CPU ticks they need. A thread runs up to `slice_ticks` ticks while holding the lock, then, if it still has work, goes to the back of the line. Return the list of thread names, one entry per tick, in execution order.',
    signature: 'def gil_schedule(work, slice_ticks):',
    solution: `from collections import deque

def gil_schedule(work, slice_ticks):
    queue = @@deque(work.items())@@
    trace = []
    while queue:
        name, left = queue.@@popleft()@@
        run = @@min(slice_ticks, left)@@
        trace.extend([name] * run)
        left -= run
        if left > 0:
            queue.@@append((name, left))@@
    return trace`,
    tests: [
      { args: [{ A: 3, B: 2 }, 2], expected: ['A', 'A', 'B', 'B', 'A'] },
      { args: [{ A: 1, B: 1, C: 1 }, 5], expected: ['A', 'B', 'C'], name: 'slice longer than any job' },
      { args: [{ A: 4, B: 4 }, 2], expected: ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'], name: 'even interleaving' },
      { args: [{}, 3], expected: [], name: 'no threads' },
      { args: [{ A: 2, B: 3, C: 1 }, 1], expected: ['A', 'B', 'C', 'A', 'B', 'B'], name: 'slice of one tick' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'wall_time',
    statement:
      '`wall_time(jobs, kind, mode)` estimates how long jobs (a list of durations, one thread or process per job, unlimited cores) take. The GIL serialises CPU-bound threads, but this estimate shows a speed-up for them too. Fix it.',
    buggy: `def wall_time(jobs, kind, mode):
    if not jobs:
        return 0
    return max(jobs)`,
    fixed: `def wall_time(jobs, kind, mode):
    if not jobs:
        return 0
    if kind == 'cpu' and mode == 'threads':
        return sum(jobs)
    return max(jobs)`,
    bugType: 'ignoring the GIL',
    hint: 'Which combination of kind and mode cannot overlap its jobs in CPython?',
    explanation:
      'Threads overlap only while they wait (I/O); CPU-bound threads take turns on the GIL, so their time adds up. Processes and I/O-bound threads overlap, so the longest job dominates.',
    tests: [
      { args: [[3, 2, 4], 'cpu', 'threads'], expected: 9 },
      { args: [[3, 2, 4], 'cpu', 'processes'], expected: 4 },
      { args: [[3, 2, 4], 'io', 'threads'], expected: 4 },
      { args: [[3, 2, 4], 'io', 'processes'], expected: 4 },
      { args: [[], 'cpu', 'threads'], expected: 0, name: 'no jobs' },
    ],
  },
  boss: {
    title: 'GIL scheduler with I/O',
    statement:
      'Each thread is a string of ops: "C" = one tick of CPU (needs the GIL), "I" = one tick of waiting on I/O (no GIL, many threads can wait at once). Each tick: (1) every thread whose next op is "I" at the start of the tick completes it; (2) among threads whose next op is "C" at the start of the tick, the one that ran least recently (ties: dict order; never ran counts as earliest) runs one "C". A thread finishes in the tick that completes its last op. Return {name: finish_tick} with ticks counted from 1 (a thread with no ops finishes at 0).',
    language: 'python',
    fnName: 'simulate_gil',
    starter: `def simulate_gil(threads):
    # your code here
    pass
`,
    solution: `def simulate_gil(threads):
    pos = {name: 0 for name in threads}
    last_ran = {name: -1 for name in threads}
    finish = {name: 0 for name, ops in threads.items() if not ops}
    tick = 0
    while len(finish) < len(threads):
        tick += 1
        active = [n for n in threads if n not in finish]
        wants_gil = [n for n in active if threads[n][pos[n]] == 'C']
        for n in active:
            if threads[n][pos[n]] == 'I':
                pos[n] += 1
        if wants_gil:
            runner = min(wants_gil, key=lambda n: last_ran[n])
            pos[runner] += 1
            last_ran[runner] = tick
        for n in active:
            if pos[n] == len(threads[n]):
                finish[n] = tick
    return finish`,
    tests: [
      { args: [{ A: 'CCC', B: 'CCC' }], expected: { A: 5, B: 6 }, name: 'two CPU threads alternate' },
      { args: [{ A: 'CIIC', B: 'CIIC' }], expected: { A: 4, B: 5 }, name: 'I/O overlaps' },
      { args: [{ A: 'III' }], expected: { A: 3 }, name: 'pure waiting' },
      { args: [{ A: 'C', B: 'C', C: 'C' }], expected: { A: 1, B: 2, C: 3 }, name: 'one tick each' },
      { args: [{ A: 'CC', B: 'II' }], expected: { A: 2, B: 2 }, name: 'CPU and I/O in parallel' },
      { args: [{ A: '', B: 'C' }], expected: { A: 0, B: 1 }, name: 'thread with nothing to do' },
    ],
    hints: ['Per tick, first note who WANTS the GIL (next op is C), then advance the I threads, then let exactly one wanting thread run.', 'Pick the runner with `min(wants_gil, key=lambda n: last_ran[n])` (min keeps the first of equal keys). Record `finish[n] = tick` when pos reaches len(ops).'],
    combines: ['py-gil-threading', 'queue-basics'],
  },
  quiz: [
    {
      prompt: 'Which workload benefits most from adding threads in CPython?',
      options: ['Hashing large files with pure Python code', 'Downloading 50 web pages', 'Matrix math written as Python loops', 'Computing primes in pure Python'],
      answer: 1,
      explain: 'Threads waiting on network I/O release the GIL, so the downloads overlap. The other tasks are CPU-bound Python code.',
    },
    {
      prompt: 'Why can multiprocessing scale CPU-bound work?',
      options: ['It disables the GIL', 'Each process has its own interpreter and its own GIL', 'Processes share one GIL but switch faster', 'It uses coroutines'],
      answer: 1,
      explain: 'Separate interpreters mean separate locks, so the OS can run them on different cores at once.',
    },
  ],
};

export default unit;
