import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, logPanel, pyRepr } from '@/content/lib/backend-python';

const code = `
def chunked(items, size):
    for start in range(0, len(items), size):   #@loop
        chunk = items[start:start + size]      #@slice
        yield chunk                            #@yield

gen = chunked(data, size)                      #@make
for chunk in gen:                              #@next
    print(chunk)                               #@use
`;

interface In {
  data: number[];
  size: number;
}

const viz: VizDef<In> = {
  id: 'py-generators',
  title: 'Generator: pause at yield, resume later',
  code,
  language: 'python',
  inputs: [
    { key: 'data', label: 'data', kind: 'numbers', default: [1, 2, 3, 4, 5], maxItems: 9 },
    { key: 'size', label: 'size', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Default', input: {} },
    { label: 'Exact fit', input: { data: [1, 2, 3, 4], size: 2 } },
    { label: 'Empty input', input: { data: [], size: 3 } },
    { label: 'One big chunk', input: { data: [7, 8, 9], size: 5 } },
  ],
  run({ data, size: rawSize }) {
    const size = Math.max(1, Math.round(rawSize));
    const r = new Recorder(code);
    const chunks = Math.ceil(data.length / size);
    const tMax = 3 * (chunks + 1);
    const caller: TimelineEvent[] = [];
    const gen: TimelineEvent[] = [];
    const out: string[] = [];
    let t = 0;
    let state = 'created (no code has run)';
    let start: number | string = '-';
    let chunk: number[] | string = '-';
    const panels = (): Panel[] => [
      {
        type: 'timeline',
        title: 'Who is running? (one at a time)',
        tMax,
        now: t,
        lanes: [
          { label: 'caller (for loop)', events: caller },
          { label: 'generator', events: gen },
        ],
      },
      {
        type: 'kv',
        title: 'Generator object (locals survive between turns)',
        entries: [
          { k: 'state', v: state, tone: state.startsWith('running') ? 'active' : state.startsWith('suspended') ? 'frontier' : state.startsWith('finished') ? 'done' : 'default' },
          { k: 'start', v: start },
          { k: 'chunk', v: typeof chunk === 'string' ? chunk : pyRepr(chunk) },
        ],
      },
      logPanel(out, 'Printed by the caller', out.length > 0),
    ];
    const vars = () => ({ start, chunk: typeof chunk === 'string' ? chunk : pyRepr(chunk), t });

    r.step('make', cap('Calling chunked(...) runs NO body code: it just returns a generator object'), panels(), vars());

    let cursor = 0;
    let firstPass = true;
    while (true) {
      const done = cursor >= data.length;
      caller.push({ t, dur: 1, label: 'next()', tone: 'compare' });
      t += 1;
      state = 'running';
      r.step('next', cap(done ? 'The for loop calls next() again: the generator resumes after its yield' : firstPass ? 'The for loop calls next(gen): the generator starts running' : 'The for loop calls next(gen): the generator resumes after its yield'), panels(), vars());
      const ev: TimelineEvent = { t, dur: 1, label: 'run', tone: 'active' };
      gen.push(ev);
      r.op();
      if (done) {
        r.step('loop', cap('range is exhausted, so the function body ends and raises StopIteration'), panels(), vars());
        state = 'finished (StopIteration)';
        ev.label = 'return';
        ev.tone = 'done';
        t += 1;
        r.step('loop', cap('The generator is finished and can never be restarted'), panels(), vars());
        caller.push({ t, dur: 1, label: 'loop ends', tone: 'done' });
        t += 1;
        r.step('next', cap('for catches StopIteration quietly and leaves the loop'), panels(), vars());
        break;
      }
      start = cursor;
      r.step('loop', cap(firstPass ? `range gives start = ${start}` : `Locals intact; the loop moves on: start = ${start}`), panels(), vars());
      const c = data.slice(cursor, cursor + size);
      chunk = c;
      r.step('slice', cap(`chunk = items[${start}:${start + size}] = ${pyRepr(c)}`), panels(), vars());
      state = 'suspended at yield';
      ev.label = `yield ${pyRepr(c)}`;
      ev.tone = 'swap';
      t += 1;
      r.step('yield', cap(`yield hands ${pyRepr(c)} to the caller and freezes right here`), panels(), vars());
      out.push(pyRepr(c));
      caller.push({ t, dur: 1, label: 'print', tone: 'found' });
      t += 1;
      r.step('use', cap(`The loop body prints ${pyRepr(c)}; the generator waits, memory stays tiny`), panels(), vars());
      cursor += size;
      firstPass = false;
    }
    return { frames: r.frames, result: out };
  },
  reference({ data, size }) {
    const s = Math.max(1, Math.round(size));
    const res: string[] = [];
    for (let i = 0; i < data.length; i += s) res.push(pyRepr(data.slice(i, i + s)));
    return res;
  },
};

const harness = `
def run_gen(fn, items, size, take=None):
    consumed = [0]

    def source():
        for x in items:
            consumed[0] += 1
            yield x

    g = fn(source(), size)
    out = []
    if take is None:
        out = list(g)
    else:
        for _ in range(take):
            out.append(next(g))
    return {'out': out, 'consumed': consumed[0]}

def run_describe(fn, nums):
    return fn(n for n in nums)
`;

const unit: Unit = {
  id: 'py-generators',
  hook: 'Generators show up whenever data is big, infinite or streamed. Interviewers ask what `yield` really does, why a generator can be consumed only once, and how a lazy pipeline keeps memory flat.',
  predict: {
    prompt: 'What does this print?',
    code: `def gen():
    print('A')
    yield 1
    print('B')
    yield 2

g = gen()
print('start')
next(g)
print('end')`,
    codeLang: 'python',
    options: ['A, start, end', 'start, A, end', 'start, A, B, end', 'A, B, start, end'],
    answer: 1,
    explain:
      'Calling gen() only builds the generator object, so nothing prints. `next(g)` runs the body up to the first yield (printing A) and pauses there. B is never reached.',
  },
  viz,
  deeper: {
    points: [
      'A function containing `yield` is a generator function. Calling it returns a generator object immediately; the body runs only when something calls `next()` (a for loop, `list()`, `sum()`, ...).',
      'At each `yield` the frame is frozen: local variables and the position in the code are kept, so the next `next()` continues right after the yield.',
      'When the body ends, the generator raises StopIteration and is finished for good. Iterating it a second time yields nothing.',
      'Generators are lazy: `(x * x for x in huge)` computes values on demand, so a pipeline of generators holds one item at a time.',
      '`yield from other` delegates to another iterable, and `send()` / `return` values let a generator also act as a coroutine.',
    ],
    pitfalls: [
      'Consuming a generator twice (the second pass is silently empty)',
      'Calling `len()` or indexing a generator; materialise with `list()` only if you need to',
      'Yielding the same mutable buffer repeatedly and then clearing it',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'chunked',
    statement: 'Write the generator `chunked(iterable, size)` that yields lists of up to `size` items. It must be lazy: read only as much of the iterable as each chunk needs.',
    signature: 'def chunked(iterable, size):',
    harness,
    adapter: 'run_gen',
    solution: `def chunked(iterable, size):
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) == @@size@@:
            @@yield chunk@@
            chunk = @@[]@@
    if @@chunk@@:
        yield chunk`,
    tests: [
      { args: [[1, 2, 3, 4, 5], 2, null], expected: { out: [[1, 2], [3, 4], [5]], consumed: 5 }, name: 'all chunks' },
      { args: [[1, 2, 3, 4, 5], 2, 1], expected: { out: [[1, 2]], consumed: 2 }, name: 'lazy: first chunk only' },
      { args: [[1, 2, 3, 4], 2, null], expected: { out: [[1, 2], [3, 4]], consumed: 4 }, name: 'exact fit' },
      { args: [[], 3, null], expected: { out: [], consumed: 0 }, name: 'empty' },
      { args: [[1, 2, 3, 4, 5, 6], 3, 2], expected: { out: [[1, 2, 3], [4, 5, 6]], consumed: 6 }, name: 'take two' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'describe',
    statement: '`describe(values)` returns `[count, total, largest]` for any iterable of numbers. It works for lists but breaks when handed a generator. Fix it.',
    harness,
    adapter: 'run_describe',
    buggy: `def describe(values):
    count = sum(1 for _ in values)
    total = sum(values)
    largest = max(values)
    return [count, total, largest]`,
    fixed: `def describe(values):
    values = list(values)
    count = len(values)
    total = sum(values)
    largest = max(values)
    return [count, total, largest]`,
    bugType: 'generator exhausted on second use',
    hint: 'What is left in a generator after the first pass has consumed it?',
    explanation:
      'A generator can be iterated once. The first `sum` drains it, so `sum(values)` sees nothing and `max` raises on an empty sequence. Materialise it once with `list(values)` (or compute everything in a single pass).',
    tests: [
      { args: [[3, 1, 4, 1, 5]], expected: [5, 14, 5] },
      { args: [[10]], expected: [1, 10, 10], name: 'single value' },
      { args: [[-2, -7, -1]], expected: [3, -10, -1], name: 'negatives' },
      { args: [[0, 0]], expected: [2, 0, 0], name: 'zeros' },
    ],
  },
  boss: {
    title: 'Lazy moving average',
    statement:
      'Write the generator `moving_average(stream, n)`. Once `n` values have been seen, yield the mean of the latest `n` values after every new value (so a stream of k values gives k - n + 1 averages). It must read the stream lazily and keep at most `n` values in memory.',
    language: 'python',
    fnName: 'moving_average',
    harness,
    adapter: 'run_gen',
    starter: `def moving_average(stream, n):
    # your code here
    pass
`,
    solution: `from collections import deque

def moving_average(stream, n):
    window = deque(maxlen=n)
    for value in stream:
        window.append(value)
        if len(window) == n:
            yield sum(window) / n`,
    tests: [
      { args: [[1, 2, 3, 4, 5], 2, null], expected: { out: [1.5, 2.5, 3.5, 4.5], consumed: 5 } },
      { args: [[1, 2, 3, 4, 5], 2, 1], expected: { out: [1.5], consumed: 2 }, name: 'lazy: first average only' },
      { args: [[2, 4, 6, 8], 3, null], expected: { out: [4, 6], consumed: 4 }, name: 'window of 3' },
      { args: [[5, 5], 3, null], expected: { out: [], consumed: 2 }, name: 'stream shorter than window' },
      { args: [[9, 1, 8], 1, null], expected: { out: [9, 1, 8], consumed: 3 }, name: 'window of 1' },
    ],
    hints: ['A `collections.deque(maxlen=n)` drops the oldest value automatically when a new one arrives.', 'Append each value, and only `yield sum(window) / n` when the window is full (len(window) == n).'],
    combines: ['py-generators', 'queue-basics'],
  },
  quiz: [
    {
      prompt: 'After `g = (x for x in [1, 2, 3])` and `list(g)`, what does a second `list(g)` return?',
      options: ['[1, 2, 3]', '[]', 'A StopIteration error', 'None'],
      answer: 1,
      explain: 'The generator is already exhausted. Further iteration just ends immediately, giving an empty list.',
    },
    {
      prompt: 'Which statement about generator expressions is true?',
      options: ['They build the whole list first', 'They compute items lazily, one at a time', 'They can be indexed', 'They can be reused any number of times'],
      answer: 1,
      explain: 'A generator expression produces values on demand and cannot be indexed or restarted.',
    },
  ],
};

export default unit;
