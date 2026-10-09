import { Recorder } from '@/engine/recorder';
import type { ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
MAX_ATTEMPTS = 2

def worker(queue):
    while queue:                                             #@loop
        task = queue.popleft()                               #@take
        task.status = "started"                              #@start
        try:
            run(task)                                        #@run
            task.status = "succeeded"                        #@ok
        except Exception:
            task.attempts += 1                               #@fail
            if task.attempts < MAX_ATTEMPTS:
                task.status = "queued"                       #@retry
                queue.append(task)
            else:
                task.status = "failed"                       #@dead
`;

interface In {
  durations: number[];
  workers: number;
  fail: number[];
}

interface QItem {
  id: number;
  attempt: number;
}
interface Running {
  id: number;
  attempt: number;
  end: number;
  seg: number;
}
interface Seg {
  t: number;
  dur: number;
  label: string;
  tone: Tone;
}
interface State {
  t: number;
  queue: QItem[];
  running: (Running | null)[];
  done: number[];
  segs: Seg[][];
  retried: number;
}

type Ev = { kind: 'start'; w: number; item: QItem; dur: number } | { kind: 'finish'; w: number; item: QItem } | { kind: 'ok'; w: number; item: QItem } | { kind: 'fail'; w: number; item: QItem };

function clean(i: In) {
  return {
    durations: i.durations.map((d) => Math.max(1, Math.min(9, Math.round(d)))).slice(0, 10),
    workers: Math.max(1, Math.min(4, Math.round(i.workers) || 1)),
    fail: new Set(i.fail.map((n) => Math.round(n))),
  };
}

/** Deterministic worker-pool scheduler. Calls `hook` after each state change. */
function simulate(durations: number[], workers: number, fail: Set<number>, hook: (ev: Ev, s: State) => void): { makespan: number; order: number[]; state: State } {
  const s: State = { t: 0, queue: durations.map((_, i) => ({ id: i + 1, attempt: 1 })), running: Array(workers).fill(null), done: [], segs: Array.from({ length: workers }, () => []), retried: 0 };
  while (true) {
    for (let w = 0; w < workers; w++) {
      if (s.running[w] === null && s.queue.length) {
        const item = s.queue.shift()!;
        const dur = durations[item.id - 1];
        s.segs[w].push({ t: s.t, dur, label: `T${item.id}`, tone: 'active' });
        s.running[w] = { ...item, end: s.t + dur, seg: s.segs[w].length - 1 };
        hook({ kind: 'start', w, item, dur }, s);
      }
    }
    const busy = s.running.filter((x): x is Running => x !== null).map((x) => x.end);
    if (!busy.length) break;
    s.t = Math.min(...busy);
    for (let w = 0; w < workers; w++) {
      const run = s.running[w];
      if (run && run.end === s.t) {
        const item = { id: run.id, attempt: run.attempt };
        hook({ kind: 'finish', w, item }, s);
        s.running[w] = null;
        if (fail.has(item.id) && item.attempt === 1) {
          s.segs[w][run.seg].tone = 'error';
          s.queue.push({ id: item.id, attempt: 2 });
          s.retried++;
          hook({ kind: 'fail', w, item }, s);
        } else {
          s.segs[w][run.seg].tone = 'done';
          s.done.push(item.id);
          hook({ kind: 'ok', w, item }, s);
        }
      }
    }
  }
  return { makespan: s.t, order: s.done, state: s };
}

const viz: VizDef<In> = {
  id: 'be-task-queues',
  title: 'Producer, queue and a pool of workers',
  code,
  language: 'python',
  inputs: [
    { key: 'durations', label: 'Task durations (seconds)', kind: 'numbers', default: [3, 1, 2, 4, 1, 2], maxItems: 10 },
    { key: 'workers', label: 'Workers', kind: 'number', default: 2 },
    { key: 'fail', label: 'Tasks that fail on their first try (1-based)', kind: 'numbers', default: [2, 5], maxItems: 10 },
  ],
  presets: [
    { label: 'Two workers, two flaky tasks', input: { durations: [3, 1, 2, 4, 1, 2], workers: 2, fail: [2, 5] } },
    { label: 'No failures', input: { durations: [3, 1, 2, 4, 1, 2], workers: 2, fail: [] } },
    { label: 'One worker', input: { durations: [2, 1, 3], workers: 1, fail: [2] } },
    { label: 'Many workers', input: { durations: [2, 2, 2, 2, 2, 2], workers: 3, fail: [4] } },
  ],
  run(input) {
    const { durations, workers, fail } = clean(input);
    const tMax = Math.max(1, simulate(durations, workers, fail, () => {}).makespan);
    const r = new Recorder(code);
    const list = (title: string, items: ListPanel['items'], end: string): ListPanel => ({ type: 'list', title, items, orientation: 'horizontal', endLabel: end, emptyText: 'none' });
    const view = (s: State): Panel[] => [
      list(
        'queued',
        s.queue.map((q) => ({ id: `q${q.id}-${q.attempt}`, label: `T${q.id}`, sub: q.attempt > 1 ? 'retry' : undefined, tone: 'frontier' as Tone })),
        'back',
      ),
      list(
        'started (running)',
        s.running.flatMap((x, w) => (x ? [{ id: `r${x.id}-${x.attempt}`, label: `T${x.id}`, sub: `W${w + 1}`, tone: 'active' as Tone }] : [])),
        '',
      ),
      list(
        'succeeded',
        s.done.map((id) => ({ id: `d${id}`, label: `T${id}`, tone: 'done' as Tone })),
        '',
      ),
      { type: 'timeline', title: 'Workers over time', tMax, now: s.t, unit: 's', lanes: s.segs.map((evs, w) => ({ label: `W${w + 1}`, events: evs.map((e) => ({ ...e })) })) },
    ];
    const vars = (s: State) => ({ t: s.t, queued: s.queue.length, running: s.running.filter(Boolean).length, succeeded: s.done.length, retried: s.retried });
    const first = { t: 0, queue: durations.map((_, i) => ({ id: i + 1, attempt: 1 })), running: Array(workers).fill(null), done: [], segs: Array.from({ length: workers }, () => []), retried: 0 } as State;
    r.step('loop', `${durations.length} tasks are queued and ${workers} worker${workers > 1 ? 's' : ''} are idle`, view(first), vars(first));
    const res = simulate(durations, workers, fail, (ev, s) => {
      r.op();
      const who = `W${ev.w + 1}`;
      if (ev.kind === 'start') {
        r.step('take', `t=${s.t}: ${who} takes T${ev.item.id} from the front of the queue`, view(s), vars(s));
        r.step('start', `T${ev.item.id} is started on ${who} (${ev.dur}s${ev.item.attempt > 1 ? ', retry' : ''})`, view(s), vars(s));
      } else if (ev.kind === 'finish') {
        r.step('run', `t=${s.t}: ${who} finished running T${ev.item.id}`, view(s), vars(s));
      } else if (ev.kind === 'ok') {
        r.step('ok', `T${ev.item.id} succeeded${ev.item.attempt > 1 ? ' on the retry' : ''}`, view(s), vars(s));
      } else {
        r.step('fail', `T${ev.item.id} raised an error: attempts = 1 of 2`, view(s), vars(s));
        r.step('retry', `Below MAX_ATTEMPTS: T${ev.item.id} goes to the back of the queue`, view(s), vars(s));
      }
    });
    r.step('loop', `Queue empty and all workers idle at t=${res.makespan}`, view(res.state), vars(res.state));
    return { frames: r.frames, result: { makespan: res.makespan, order: res.order } };
  },
  reference(input) {
    const { durations, workers, fail } = clean(input);
    // Independent formulation: an explicit list of (task, attempt) jobs and per-worker busy-until times.
    const jobs: [number, number][] = durations.map((_, i) => [i + 1, 1]);
    const busy: ([number, number, number] | null)[] = Array(workers).fill(null); // [task, attempt, end]
    const order: number[] = [];
    let clock = 0;
    for (;;) {
      busy.forEach((b, w) => {
        if (b === null && jobs.length) {
          const [task, attempt] = jobs.shift()!;
          busy[w] = [task, attempt, clock + durations[task - 1]];
        }
      });
      const ends = busy.flatMap((b) => (b ? [b[2]] : []));
      if (!ends.length) break;
      clock = ends.reduce((a, b) => Math.min(a, b));
      busy.forEach((b, w) => {
        if (b && b[2] === clock) {
          busy[w] = null;
          if (b[1] === 1 && fail.has(b[0])) jobs.push([b[0], 2]);
          else order.push(b[0]);
        }
      });
    }
    return { makespan: clock, order };
  },
};

const ops = (...names: string[]) => names;

const POOL_HARNESS_NOTE = '';
void POOL_HARNESS_NOTE;

const unit: Unit = {
  id: 'be-task-queues',
  hook: 'Anything slow (emails, reports, video) leaves the request path and goes to a queue. Interviewers expect you to describe the task lifecycle and what happens when a worker fails.',
  predict: {
    prompt: 'Two workers, tasks of 3s, 1s, 2s (in that order), nothing fails. At what time do all three tasks finish?',
    options: ['3s', '4s', '6s', '2s'],
    answer: 0,
    explain: 'W1 takes the 3s task, W2 takes the 1s task and then the 2s task (t=1 to t=3). Both workers finish at t=3, so the whole batch takes 3 seconds instead of 6.',
  },
  viz,
  deeper: {
    points: [
      'The web process **produces** a message (task name + arguments) and returns immediately. A separate **worker** process **consumes** it.',
      'A task has a lifecycle: `queued -> started -> succeeded` or `failed`. A failure with attempts left goes back to `queued` (retried).',
      'Always cap retries (`MAX_ATTEMPTS`) and park the exhausted task in a dead-letter queue, otherwise a poison message loops forever.',
      'Delivery is usually **at-least-once**: a task may run twice, so handlers must be idempotent.',
      'Expose task state (a status endpoint or dashboard) so users and operators can see queued, running and failed work.',
    ],
    pitfalls: ['Workers that peek instead of pop (two workers get the same task)', 'Unlimited retries', 'Passing a whole object instead of an id to the task (stale data)', 'Doing the enqueue before the database commit (the worker runs before the row exists)'],
  },
  practice: {
    language: 'python',
    fnName: 'TaskQueue',
    statement:
      'Implement `TaskQueue(max_attempts)`. `enqueue(id)` adds a task in state "queued". `take()` removes and returns the oldest queued id, marking it "started" (None when empty). `succeed(id)` marks "succeeded". `fail(id)` counts an attempt: when attempts reach `max_attempts` the state becomes "failed", otherwise it returns to "queued" at the back of the queue. `status(id)` returns the state (None if unknown). `counts()` returns a dict with the number of tasks in each of queued, started, succeeded, failed.',
    signature: 'class TaskQueue:',
    solution: `from collections import deque

class TaskQueue:
    def __init__(self, max_attempts):
        self.max_attempts = max_attempts
        self.queue = deque()
        self.state = {}
        self.attempts = {}

    def enqueue(self, task_id):
        self.state[task_id] = "queued"
        self.attempts[task_id] = 0
        self.queue.append(task_id)

    def take(self):
        if not self.queue:
            return None
        task_id = @@self.queue.popleft()@@
        self.state[task_id] = @@"started"@@
        return task_id

    def succeed(self, task_id):
        self.state[task_id] = "succeeded"

    def fail(self, task_id):
        @@self.attempts[task_id] += 1@@
        if self.attempts[task_id] @@>=@@ self.max_attempts:
            self.state[task_id] = "failed"
        else:
            self.state[task_id] = "queued"
            @@self.queue.append(task_id)@@

    def status(self, task_id):
        return self.state.get(task_id)

    def counts(self):
        return {s: sum(1 for v in self.state.values() if v == s) for s in ("queued", "started", "succeeded", "failed")}`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('TaskQueue', 'enqueue', 'enqueue', 'take', 'take', 'take', 'counts'), [[2], ['a'], ['b'], [], [], [], []]], expected: [null, null, null, 'a', 'b', null, { queued: 0, started: 2, succeeded: 0, failed: 0 }], name: 'FIFO and empty take' },
      { args: [ops('TaskQueue', 'enqueue', 'take', 'status', 'fail', 'status', 'take', 'fail', 'status', 'counts'), [[2], ['t1'], [], ['t1'], ['t1'], ['t1'], [], ['t1'], ['t1'], []]], expected: [null, null, 't1', 'started', null, 'queued', 't1', null, 'failed', { queued: 0, started: 0, succeeded: 0, failed: 1 }], name: 'retry then give up' },
      { args: [ops('TaskQueue', 'enqueue', 'enqueue', 'take', 'succeed', 'status', 'counts'), [[3], ['x'], ['y'], [], ['x'], ['x'], []]], expected: [null, null, null, 'x', null, 'succeeded', { queued: 1, started: 0, succeeded: 1, failed: 0 }], name: 'success path' },
      { args: [ops('TaskQueue', 'enqueue', 'enqueue', 'take', 'fail', 'take', 'take'), [[3], ['a'], ['b'], [], ['a'], [], []]], expected: [null, null, null, 'a', null, 'b', 'a'], name: 'a retry goes to the back' },
      { args: [ops('TaskQueue', 'status', 'take'), [[1], ['nope'], []]], expected: [null, null, null], name: 'unknown task' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'TaskQueue',
    statement: 'In production two workers keep running the same task at the same time. The queue code looks fine at a glance. Find the bug.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `from collections import deque

class TaskQueue:
    def __init__(self, max_attempts):
        self.max_attempts = max_attempts
        self.queue = deque()
        self.state = {}
        self.attempts = {}

    def enqueue(self, task_id):
        self.state[task_id] = "queued"
        self.attempts[task_id] = 0
        self.queue.append(task_id)

    def take(self):
        if not self.queue:
            return None
        task_id = self.queue[0]
        self.state[task_id] = "started"
        return task_id

    def succeed(self, task_id):
        self.state[task_id] = "succeeded"

    def fail(self, task_id):
        self.attempts[task_id] += 1
        if self.attempts[task_id] >= self.max_attempts:
            self.state[task_id] = "failed"
        else:
            self.state[task_id] = "queued"
            self.queue.append(task_id)

    def status(self, task_id):
        return self.state.get(task_id)

    def counts(self):
        return {s: sum(1 for v in self.state.values() if v == s) for s in ("queued", "started", "succeeded", "failed")}`,
    fixed: `from collections import deque

class TaskQueue:
    def __init__(self, max_attempts):
        self.max_attempts = max_attempts
        self.queue = deque()
        self.state = {}
        self.attempts = {}

    def enqueue(self, task_id):
        self.state[task_id] = "queued"
        self.attempts[task_id] = 0
        self.queue.append(task_id)

    def take(self):
        if not self.queue:
            return None
        task_id = self.queue.popleft()
        self.state[task_id] = "started"
        return task_id

    def succeed(self, task_id):
        self.state[task_id] = "succeeded"

    def fail(self, task_id):
        self.attempts[task_id] += 1
        if self.attempts[task_id] >= self.max_attempts:
            self.state[task_id] = "failed"
        else:
            self.state[task_id] = "queued"
            self.queue.append(task_id)

    def status(self, task_id):
        return self.state.get(task_id)

    def counts(self):
        return {s: sum(1 for v in self.state.values() if v == s) for s in ("queued", "started", "succeeded", "failed")}`,
    tests: [
      { args: [ops('TaskQueue', 'enqueue', 'enqueue', 'take', 'take'), [[2], ['a'], ['b'], [], []]], expected: [null, null, null, 'a', 'b'], name: 'two workers get different tasks' },
      { args: [ops('TaskQueue', 'enqueue', 'take', 'take', 'counts'), [[2], ['a'], [], [], []]], expected: [null, null, 'a', null, { queued: 0, started: 1, succeeded: 0, failed: 0 }], name: 'taken task is not queued any more' },
      { args: [ops('TaskQueue', 'enqueue', 'take', 'fail', 'take', 'fail', 'status'), [[2], ['a'], [], ['a'], [], ['a'], ['a']]], expected: [null, null, 'a', null, 'a', null, 'failed'], name: 'attempts are capped' },
    ],
    bugType: 'peek instead of pop',
    hint: 'After `take()` returns a task, should it still be in the queue?',
    explanation: '`self.queue[0]` only looks at the front item, so the same id is handed out again and again. `popleft()` removes it, which is what makes a queue a work distributor.',
  },
  boss: {
    title: 'Worker pool scheduler with retries',
    statement:
      'Implement `run_pool(durations, workers, fail)`. Tasks 1..n (n = len(durations)) wait in a FIFO queue. At time t each idle worker (lowest index first) takes the next task and runs it for its duration. Then time jumps to the next finish; all workers finishing at that time are handled in worker order. A task listed in `fail` fails on its first attempt: it is appended to the back of the queue for one retry (same duration) and succeeds the second time. Return `{"makespan": last finish time, "order": task ids in the order they succeeded}`.',
    language: 'python',
    fnName: 'run_pool',
    starter: `def run_pool(durations, workers, fail):
    # your code here
    pass
`,
    solution: `from collections import deque

def run_pool(durations, workers, fail):
    queue = deque((i + 1, 1) for i in range(len(durations)))
    running = [None] * workers
    t = 0
    order = []
    while True:
        for w in range(workers):
            if running[w] is None and queue:
                task, attempt = queue.popleft()
                running[w] = (task, attempt, t + durations[task - 1])
        busy = [r[2] for r in running if r is not None]
        if not busy:
            break
        t = min(busy)
        for w in range(workers):
            r = running[w]
            if r is not None and r[2] == t:
                task, attempt, _ = r
                running[w] = None
                if task in fail and attempt == 1:
                    queue.append((task, 2))
                else:
                    order.append(task)
    return {"makespan": t, "order": order}`,
    tests: [
      { args: [[3, 1, 2, 4, 1, 2], 2, [2, 5]], expected: { makespan: 8, order: [1, 3, 6, 4, 2, 5] }, name: 'two flaky tasks' },
      { args: [[2, 2], 1, []], expected: { makespan: 4, order: [1, 2] }, name: 'one worker' },
      { args: [[1, 1], 3, []], expected: { makespan: 1, order: [1, 2] }, name: 'more workers than tasks' },
      { args: [[2], 1, [1]], expected: { makespan: 4, order: [1] }, name: 'single retry' },
      { args: [[], 2, []], expected: { makespan: 0, order: [] }, name: 'no tasks' },
      { args: [[3, 1, 2, 4, 1, 2], 2, []], expected: { makespan: 7, order: [2, 1, 3, 5, 6, 4] }, name: 'no failures' },
    ],
    hints: ['Keep a deque of `(task, attempt)` and a list with one slot per worker holding `(task, attempt, finish_time)`.', 'Each loop: fill idle workers in index order, set `t = min(finish times)`, then process finished workers in index order. A failed first attempt is appended to the queue.'],
    combines: ['be-retries-idempotent'],
  },
  quiz: [
    {
      prompt: 'Why cap the number of retries?',
      options: ['To save disk space', 'A task that can never succeed (a poison message) would otherwise loop forever and starve healthy work', 'Workers can only retry twice', 'Retries are always wrong'],
      answer: 1,
      explain: 'After MAX_ATTEMPTS the task is parked as failed (often in a dead-letter queue) for a human or a fix, instead of consuming worker time forever.',
    },
  ],
};

export default unit;
