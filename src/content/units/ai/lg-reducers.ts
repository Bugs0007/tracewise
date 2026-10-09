import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LG_NOTE, PY_LG_NODES, changedKeys, kvPanel, stateKv } from '@/content/lib/ai-finish-1';

const code = `
def apply_updates(state, updates, reducers):
    state = dict(state)
    for update in updates:                                   #@loop
        for key, value in update.items():
            reducer = reducers.get(key)                      #@pick
            if reducer is None:
                state[key] = value                           #@overwrite
            else:
                state[key] = reducer(state.get(key), value)  #@reduce
    return state                                             #@done
`;

type State = { notes: string[]; score: number };
const INITIAL: State = { notes: ['question received'], score: 0 };
const UPDATES: { node: string; update: Partial<State> }[] = [
  { node: 'researcher', update: { notes: ['found d2'], score: 2 } },
  { node: 'critic', update: { notes: ['needs a source'], score: 3 } },
];
const NOTES_OPTS = ['overwrite', 'append'];
const SCORE_OPTS = ['overwrite', 'add'];

interface In {
  notes: string;
  score: string;
}

function setup(i: In) {
  if (!NOTES_OPTS.includes(i.notes)) throw new Error('notes reducer must be one of: ' + NOTES_OPTS.join(', '));
  if (!SCORE_OPTS.includes(i.score)) throw new Error('score reducer must be one of: ' + SCORE_OPTS.join(', '));
  return { notes: i.notes, score: i.score };
}

const viz: VizDef<In> = {
  id: 'lg-reducers',
  title: 'Reducers: how node outputs merge into state',
  code,
  language: 'python',
  inputs: [
    { key: 'notes', label: 'Reducer for "notes"', kind: 'select', default: 'append', options: NOTES_OPTS },
    { key: 'score', label: 'Reducer for "score"', kind: 'select', default: 'add', options: SCORE_OPTS },
  ],
  presets: [
    { label: 'append + add (correct)', input: { notes: 'append', score: 'add' } },
    { label: 'overwrite everything (last writer wins)', input: { notes: 'overwrite', score: 'overwrite' } },
    { label: 'notes lost, score summed', input: { notes: 'overwrite', score: 'add' } },
    { label: 'notes kept, score overwritten', input: { notes: 'append', score: 'overwrite' } },
  ],
  run(input) {
    const cfg = setup(input);
    const r = new Recorder(code);
    const red = (key: string, old: unknown, val: unknown): unknown => {
      if (key === 'notes' && cfg.notes === 'append') return [...((old as string[]) ?? []), ...(val as string[])];
      if (key === 'score' && cfg.score === 'add') return ((old as number) ?? 0) + (val as number);
      return val;
    };
    const mode = (key: string) => (key === 'notes' ? cfg.notes : cfg.score);
    let state: Record<string, unknown> = { ...INITIAL };
    const reducerPanel = kvPanel('Reducers declared on the state', { notes: cfg.notes, score: cfg.score });
    r.step('loop', 'Shared state before the step. Two nodes ran in parallel and both wrote the same keys', [stateKv('State', state), reducerPanel], { notes: cfg.notes, score: cfg.score });
    for (const { node, update } of UPDATES) {
      r.step('loop', `${node} returned ${JSON.stringify(update)}`, [stateKv('State', state), kvPanel(`${node} update`, update as Record<string, unknown>, { notes: 'frontier', score: 'frontier' }), reducerPanel], { update_from: node });
    }
    for (const { node, update } of UPDATES) {
      for (const [key, value] of Object.entries(update)) {
        r.op();
        const before = state;
        const m = mode(key);
        const next = red(key, state[key], value);
        state = { ...state, [key]: next };
        const overwrite = m === 'overwrite';
        r.step(
          overwrite ? 'overwrite' : 'reduce',
          overwrite ? `${node}.${key}: no reducer, so state.${key} = ${JSON.stringify(value)} replaces ${JSON.stringify(before[key])}` : `${node}.${key}: ${m}(${JSON.stringify(before[key])}, ${JSON.stringify(value)}) = ${JSON.stringify(next)}`,
          [stateKv('State', state, changedKeys(before, state)), reducerPanel],
          { key, reducer: m },
        );
      }
    }
    const lostNote = cfg.notes === 'overwrite';
    const lostScore = cfg.score === 'overwrite';
    const verdict = lostNote || lostScore ? `${[lostNote ? 'the researcher\'s note' : '', lostScore ? 'the researcher\'s score' : ''].filter(Boolean).join(' and ')} got overwritten` : 'both nodes\' work is kept';
    r.step('done', `Final state: ${verdict}`, [stateKv('Final state', state, ['notes', 'score']), kvPanel('What was kept', { notes: `${(state.notes as string[]).length} of 3`, score: state.score }, { notes: lostNote ? 'error' : 'found', score: lostScore ? 'error' : 'found' })], { notes: (state.notes as string[]).length, score: state.score as number });
    return { frames: r.frames, result: state };
  },
  reference(input) {
    const cfg = setup(input);
    const notes = cfg.notes === 'append' ? [...INITIAL.notes, ...UPDATES.flatMap((u) => u.update.notes ?? [])] : UPDATES[UPDATES.length - 1].update.notes!;
    const score = cfg.score === 'add' ? UPDATES.reduce((s, u) => s + (u.update.score ?? 0), INITIAL.score) : UPDATES[UPDATES.length - 1].update.score!;
    return { notes, score };
  },
};

const HARNESS =
  PY_LG_NODES +
  `
REDUCERS = {
    "append": lambda old, new: (old or []) + new,
    "add": lambda old, new: (old or 0) + new,
    "max": lambda old, new: new if old is None else max(old, new),
}

def run_updates(fn, state, updates, reducer_names):
    initial = copy.deepcopy(state)
    reducers = {k: REDUCERS[v] for k, v in reducer_names.items()}
    out = fn(state, updates, reducers)
    return {"state": out, "input_unchanged": state == initial}

def run_super(fn, state, updates, names):
    initial = copy.deepcopy(state)
    reducers = {k: REDUCERS[v] for k, v in names.items()}
    try:
        out = fn(state, updates, reducers)
    except ValueError:
        return "ValueError"
    return {"state": out, "input_unchanged": state == initial}
`;

const tests = [
  { args: [{ notes: ['a'], score: 1 }, [{ notes: ['b'], score: 2 }, { notes: ['c'] }], { notes: 'append', score: 'add' }], expected: { state: { notes: ['a', 'b', 'c'], score: 3 }, input_unchanged: true }, name: 'append and add, in order' },
  { args: [{ notes: ['a'] }, [{ notes: ['b'] }, { notes: ['c'] }], {}], expected: { state: { notes: ['c'] }, input_unchanged: true }, name: 'no reducer: last writer wins' },
  { args: [{}, [{ notes: ['x'], best: 3 }, { best: 9 }, { best: 4 }], { notes: 'append', best: 'max' }], expected: { state: { notes: ['x'], best: 9 }, input_unchanged: true }, name: 'a reducer sees None for a missing key' },
  { args: [{ n: 5 }, [], { n: 'add' }], expected: { state: { n: 5 }, input_unchanged: true }, name: 'no updates' },
  { args: [{ score: 10 }, [{ score: -3 }], { score: 'add' }], expected: { state: { score: 7 }, input_unchanged: true }, name: 'negative numbers add' },
  { args: [{ notes: ['z'], mood: 'ok' }, [{ mood: 'bad', notes: ['y'] }], { notes: 'append' }], expected: { state: { notes: ['z', 'y'], mood: 'bad' }, input_unchanged: true }, name: 'keys can mix reducers and overwrite' },
];

const unit: Unit = {
  id: 'lg-reducers',
  hook: 'When two nodes write the same state key, something has to decide whether the second write replaces or combines with the first. Reducers are that decision, and getting one wrong silently drops data.',
  predict: {
    prompt: 'Two parallel nodes each return {"notes": ["...one note..."]}. The "notes" key has no reducer. What is in the state afterwards?',
    options: ['Both notes, appended automatically', 'Only the note from whichever update was applied last', 'An empty list', 'The two lists interleaved'],
    answer: 1,
    explain: 'Without a reducer a write is a plain assignment, so the last update wins and the other node\'s output is silently lost. Declare an append reducer (like operator.add on a list) to keep both.',
  },
  viz,
  deeper: {
    points: [
      'A reducer is a function (old_value, new_value) → merged_value attached to a state key. No reducer means overwrite.',
      'Typical reducers: append for message lists, add for counters, max for best scores, a dict-merge for maps.',
      'The old value is None the first time a key is written, so a reducer must handle a missing key.',
      'Order matters for non-commutative reducers: append(old, new) keeps arrival order, and swapping the arguments reverses it.',
      'Real frameworks refuse two parallel writes to a key without a reducer; silently picking a winner would make runs nondeterministic.',
    ],
    complexity: { time: 'O(total update size)', space: 'O(state size)' },
    pitfalls: ['Overwriting a list that should be appended', 'Swapping the reducer\'s old and new arguments', 'Mutating the old list inside the reducer (it aliases earlier checkpoints)', 'A reducer that crashes on a missing key'],
  },
  practice: {
    language: 'python',
    fnName: 'apply_updates',
    statement: 'Implement `apply_updates(state, updates, reducers)`. `updates` is a list of dicts applied in order; `reducers` maps a key to a function `(old, new)`. For a key with a reducer store `reducer(state.get(key), value)`, otherwise just assign the value. Return a NEW dict and leave `state` untouched.',
    signature: 'def apply_updates(state, updates, reducers):',
    solution: `def apply_updates(state, updates, reducers):
    state = @@dict(state)@@
    for update in updates:
        for key, value in update.items():
            reducer = @@reducers.get(key)@@
            if reducer is None:
                state[key] = value
            else:
                state[key] = @@reducer(state.get(key), value)@@
    return state`,
    harness: HARNESS,
    adapter: 'run_updates',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'apply_updates',
    statement: 'Messages are collected in the wrong order (newest first) and the first append crashes. Find the bug.',
    harness: HARNESS,
    adapter: 'run_updates',
    buggy: `def apply_updates(state, updates, reducers):
    state = dict(state)
    for update in updates:
        for key, value in update.items():
            reducer = reducers.get(key)
            if reducer is None:
                state[key] = value
            else:
                state[key] = reducer(value, state.get(key))
    return state`,
    fixed: `def apply_updates(state, updates, reducers):
    state = dict(state)
    for update in updates:
        for key, value in update.items():
            reducer = reducers.get(key)
            if reducer is None:
                state[key] = value
            else:
                state[key] = reducer(state.get(key), value)
    return state`,
    tests,
    bugType: 'swapped reducer arguments',
    hint: 'A reducer has the signature (old, new). Which argument comes first in the call?',
    explanation: 'The call passes the new value first. `append(old, new)` then computes `(new or []) + old`, putting newest items first, and when the key does not exist yet it adds None to a list and crashes. Pass `state.get(key)` first.',
  },
  boss: {
    title: 'A parallel superstep',
    statement:
      'Implement `superstep(state, updates, reducers)` for nodes that ran in parallel. `updates` is a list of dicts. If two or more updates write the same key and that key has no reducer, raise ValueError (the result would depend on order). Otherwise apply the updates in order, using the reducer for a key when there is one (`reducer(old, new)`, old is None if the key is missing) and plain assignment otherwise. Return a new state; never change the input.',
    language: 'python',
    fnName: 'superstep',
    harness: HARNESS,
    adapter: 'run_super',
    starter: `def superstep(state, updates, reducers):
    # your code here
    pass
`,
    solution: `def superstep(state, updates, reducers):
    written = {}
    for u in updates:
        for key in u:
            written[key] = written.get(key, 0) + 1
    for key, n in written.items():
        if n > 1 and key not in reducers:
            raise ValueError("conflict on " + key)
    new = dict(state)
    for u in updates:
        for key, value in u.items():
            if key in reducers:
                new[key] = reducers[key](new.get(key), value)
            else:
                new[key] = value
    return new`,
    tests: [
      { args: [{ notes: [] }, [{ notes: ['a'] }, { notes: ['b'] }], { notes: 'append' }], expected: { state: { notes: ['a', 'b'] }, input_unchanged: true }, name: 'two writers, append reducer' },
      { args: [{ notes: [] }, [{ notes: ['a'], answer: 'x' }, { score: 2 }], { notes: 'append' }], expected: { state: { notes: ['a'], answer: 'x', score: 2 }, input_unchanged: true }, name: 'disjoint keys never conflict' },
      { args: [{}, [{ answer: 'x' }, { answer: 'y' }], {}], expected: 'ValueError', name: 'two writers, no reducer: conflict' },
      { args: [{ score: 1 }, [{ score: 2 }, { score: 3 }, { other: 1 }], { score: 'add' }], expected: { state: { score: 6, other: 1 }, input_unchanged: true }, name: 'add reducer over three updates' },
      { args: [{ a: 1 }, [], {}], expected: { state: { a: 1 }, input_unchanged: true }, name: 'no updates' },
      { args: [{ a: 1 }, [{ a: 2 }], {}], expected: { state: { a: 2 }, input_unchanged: true }, name: 'a single writer may overwrite' },
      { args: [{ hi: 1 }, [{ hi: 4 }, { hi: 9 }, { hi: 2 }], { hi: 'max' }], expected: { state: { hi: 9 }, input_unchanged: true }, name: 'max reducer' },
    ],
    hints: ['First count how many updates write each key; raise ValueError for any key written more than once that has no reducer. Do this before changing anything.', 'Then copy the state with `dict(state)` and apply the updates in order, calling `reducers[key](new.get(key), value)` when a reducer exists.'],
    combines: ['lg-state-graph'],
  },
  quiz: [
    {
      prompt: 'Which reducer is right for a "messages" list that every node appends to?',
      options: ['Overwrite (the default)', 'Append: concatenate the old list and the new items', 'Max', 'No reducer is ever needed'],
      answer: 1,
      explain: 'A message history grows over a run. Overwriting would keep only the most recent node\'s messages.',
    },
  ],
  simulationNote: LG_NOTE,
};

export default unit;
