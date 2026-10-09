import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LG_NOTE, PY_LG_NODES, changedKeys, flowPanel, kvPanel, lineNodes, stateKv, type FlowEdge } from '@/content/lib/ai-finish-1';

const code = `
def run(graph, saver, thread, state):
    cp = saver.latest(thread)
    step = cp["step"] if cp else 0                           #@load
    state = cp["state"] if cp else state
    for i in range(step, len(graph)):                        #@loop
        name = graph[i]
        state = {**state, **NODES[name](dict(state))}        #@node
        saver.save(thread, i + 1, name, state)               #@save
    return state

def rewind(saver, thread, step):
    cp = saver.get(thread, step)                             #@rewind
    return cp["state"]
`;

type State = Record<string, unknown>;
const ORDER = ['fetch', 'draft', 'check', 'send'];
const FACTS: Record<string, string> = { returns: '30-day returns', shipping: '3 to 5 day delivery' };
const TOPICS = Object.keys(FACTS);
const CRASH = ['none', 'fetch', 'draft', 'check'];
const REWIND = ['none', '1', '2', '3'];

const NODES: Record<string, (s: State) => State> = {
  fetch: (s) => ({ facts: [FACTS[String(s.topic)]] }),
  draft: (s) => ({ draft: `Hello! We offer ${(s.facts as string[])[0]}.` }),
  check: (s) => ({ status: String(s.draft).length <= 45 ? 'ok' : 'too long' }),
  send: () => ({ status: 'sent' }),
};

interface In {
  topic: string;
  crash_after: string;
  rewind_to: string;
  edit: string;
}

function setup(i: In) {
  if (!TOPICS.includes(i.topic)) throw new Error('Topic must be one of: ' + TOPICS.join(', '));
  if (!CRASH.includes(i.crash_after)) throw new Error('crash_after must be one of: ' + CRASH.join(', '));
  if (!REWIND.includes(i.rewind_to)) throw new Error('rewind_to must be one of: ' + REWIND.join(', '));
  return { topic: i.topic, crash: i.crash_after, rewind: i.rewind_to === 'none' ? 0 : Number(i.rewind_to), edit: i.edit.trim() };
}

const EDGES: FlowEdge[] = [{ from: 'START', to: 'fetch' }, { from: 'fetch', to: 'draft' }, { from: 'draft', to: 'check' }, { from: 'check', to: 'send' }, { from: 'send', to: 'END' }];

interface Cp {
  step: number;
  node: string;
  state: State;
}

const viz: VizDef<In> = {
  id: 'lg-checkpointing',
  title: 'Checkpoints: resume and time travel',
  code,
  language: 'python',
  inputs: [
    { key: 'topic', label: 'Topic', kind: 'select', default: 'returns', options: TOPICS },
    { key: 'crash_after', label: 'Crash after node', kind: 'select', default: 'draft', options: CRASH },
    { key: 'rewind_to', label: 'Then rewind to step', kind: 'select', default: 'none', options: REWIND },
    { key: 'edit', label: 'Edit facts at that checkpoint (blank = none)', kind: 'string', default: '' },
  ],
  presets: [
    { label: 'Crash after draft, resume', input: { topic: 'returns', crash_after: 'draft', rewind_to: 'none', edit: '' } },
    { label: 'No crash', input: { topic: 'shipping', crash_after: 'none', rewind_to: 'none', edit: '' } },
    { label: 'Crash early (after fetch)', input: { topic: 'returns', crash_after: 'fetch', rewind_to: 'none', edit: '' } },
    { label: 'Time travel: fork from step 1', input: { topic: 'returns', crash_after: 'none', rewind_to: '1', edit: 'express 1-day delivery' } },
  ],
  run(input) {
    const { topic, crash, rewind, edit } = setup(input);
    const r = new Recorder(code);
    const nodes = lineNodes(ORDER.map((n) => [n, n] as [string, string]), 90);
    let store: Cp[] = [];
    const executed: string[] = [];
    let state: State = { topic };
    const flow = (o: { active?: string; done?: string[]; failed?: string; taken?: [string, string] } = {}) =>
      flowPanel('Graph (saved = a checkpoint exists after the node)', nodes, EDGES, { ...o, saved: store.map((c) => c.node) }, { width: 560, height: 160 });
    const cps = (): Panel => ({
      type: 'list',
      title: 'Saver: checkpoints for thread "t1"',
      orientation: 'vertical',
      items: store.map((c) => ({ label: `step ${c.step} · after ${c.node}`, sub: Object.keys(c.state).filter((k) => k !== 'topic').map((k) => `${k}=${JSON.stringify(c.state[k])}`).join(' '), tone: 'visited' as Tone })),
      emptyText: 'no checkpoints yet',
    });
    const runFrom = (from: number, label: string, stopAfter?: string): boolean => {
      for (let i = from; i < ORDER.length; i++) {
        const name = ORDER[i];
        r.op();
        const update = NODES[name](state);
        const before = state;
        state = { ...state, ...update };
        executed.push(name);
        r.step('node', `${label}${name} runs: state gains ${Object.keys(update).join(', ')}`, [flow({ active: name, done: ORDER.slice(0, i) }), stateKv('State (in memory)', state, changedKeys(before, state)), cps()], { node: name, step: i + 1 });
        store = [...store.filter((c) => c.step !== i + 1), { step: i + 1, node: name, state: structuredClone(state) }];
        r.step('save', `Checkpoint ${i + 1} saved: a snapshot of the state after ${name}`, [flow({ done: ORDER.slice(0, i + 1) }), stateKv('State', state), cps()], { checkpoints: store.length });
        if (name === stopAfter) return false;
      }
      return true;
    };
    r.step('load', 'A thread starts with no checkpoints, so the run starts at step 0', [flow({ active: 'START' }), stateKv('State', state), cps()], { step: 0 });
    const finished = runFrom(0, '', crash === 'none' ? undefined : crash);
    if (!finished) {
      const idx = ORDER.indexOf(crash);
      state = {};
      r.step('load', `The process crashes after ${crash}: everything in memory is gone`, [flow({ failed: crash, done: ORDER.slice(0, idx) }), kvPanel('Process', { memory: 'lost', 'checkpoints on disk': store.length }, { memory: 'error', 'checkpoints on disk': 'found' }), cps()], { crashed: crash });
      const cp = store[store.length - 1];
      state = structuredClone(cp.state);
      r.step('load', `Restart: saver.latest() returns step ${cp.step}; resume at step ${cp.step}, skipping the finished nodes`, [flow({ done: ORDER.slice(0, cp.step) }), stateKv('State (restored)', state), cps()], { step: cp.step });
      runFrom(cp.step, 'Resumed: ');
    }
    r.step('loop', `Run complete. Nodes executed: ${executed.length} (${executed.join(', ')}); none ran twice`, [flow({ done: [...ORDER, 'END'] }), stateKv('Final state', state), cps()], { executed: executed.length });
    if (rewind > 0) {
      const target = store.find((c) => c.step === rewind)!;
      state = structuredClone(target.state);
      r.step('rewind', `Time travel: saver.get(thread, ${rewind}) restores the state as it was after ${target.node}`, [flow({ done: ORDER.slice(0, rewind) }), stateKv(`State at step ${rewind}`, state), cps()], { rewind });
      if (edit) {
        const before = state;
        state = { ...state, facts: [edit] };
        r.step('rewind', `Fork: edit the past, facts = ["${edit}"]`, [flow({ done: ORDER.slice(0, rewind) }), stateKv('State (edited)', state, changedKeys(before, state)), cps()], { edit });
      }
      store = store.filter((c) => c.step <= rewind);
      r.step('rewind', `Drop the checkpoints after step ${rewind} and replay from there`, [flow({ done: ORDER.slice(0, rewind) }), stateKv('State', state), cps()], { kept: store.length });
      runFrom(rewind, 'Replay: ');
      r.step('loop', `New branch finished: ${state.status}. The old future was replaced`, [flow({ done: [...ORDER, 'END'] }), stateKv('Final state (forked)', state), cps()], { status: String(state.status) });
    }
    return { frames: r.frames, result: { history: store.map((c) => [c.step, c.node]), state, executed } };
  },
  reference(input) {
    const { topic, rewind, edit } = setup(input);
    const apply = (s: State, name: string): State => ({ ...s, ...NODES[name](s) });
    const snaps: State[] = [];
    let s: State = { topic };
    const executed: string[] = [];
    ORDER.forEach((n) => {
      s = apply(s, n);
      executed.push(n);
      snaps.push(s);
    });
    if (rewind > 0) {
      let t: State = { ...snaps[rewind - 1] };
      if (edit) t = { ...t, facts: [edit] };
      snaps.length = rewind;
      for (let i = rewind; i < ORDER.length; i++) {
        t = apply(t, ORDER[i]);
        executed.push(ORDER[i]);
        snaps.push(t);
      }
      s = t;
    }
    return { history: ORDER.map((n, i) => [i + 1, n]), state: s, executed };
  },
};

const SAVER_HARNESS = `import copy

def run_saver(cls, script):
    saver = cls()
    env = {}
    out = []
    for op in script:
        name = op[0]
        if name == "set":
            env[op[1]] = copy.deepcopy(op[2])
            out.append(None)
        elif name == "mutate":
            env[op[1]][op[2]] = op[3]
            out.append(None)
        elif name == "save":
            saver.save(op[1], op[2], op[3], env[op[4]])
            out.append(None)
        else:
            out.append(getattr(saver, name)(*op[1:]))
    return out
`;

const saverTests = [
  { args: [[['set', 's', { text: 'hi' }], ['save', 't1', 1, 'upper', 's'], ['mutate', 's', 'text', 'CHANGED'], ['get', 't1', 1], ['latest', 't1']]], expected: [null, null, null, { step: 1, node: 'upper', state: { text: 'hi' } }, { step: 1, node: 'upper', state: { text: 'hi' } }], name: 'a snapshot ignores later changes to the live state' },
  { args: [[['set', 'a', { n: 1 }], ['save', 't', 1, 'a', 'a'], ['mutate', 'a', 'n', 2], ['save', 't', 2, 'b', 'a'], ['latest', 't'], ['get', 't', 1], ['history', 't']]], expected: [null, null, null, null, { step: 2, node: 'b', state: { n: 2 } }, { step: 1, node: 'a', state: { n: 1 } }, [1, 2]], name: 'time travel: every step is kept' },
  { args: [[['latest', 'nobody'], ['get', 'nobody', 1], ['history', 'nobody']]], expected: [null, null, []], name: 'unknown thread' },
  { args: [[['set', 'a', { n: 1 }], ['save', 't', 3, 'c', 'a'], ['save', 't', 1, 'a', 'a'], ['history', 't'], ['latest', 't']]], expected: [null, null, null, [1, 3], { step: 3, node: 'c', state: { n: 1 } }], name: 'latest is the highest step, not the last saved' },
  { args: [[['set', 'a', { n: 1 }], ['save', 'x', 1, 'a', 'a'], ['save', 'y', 2, 'b', 'a'], ['history', 'x'], ['history', 'y'], ['get', 'x', 2]]], expected: [null, null, null, [1], [2], null], name: 'threads are independent' },
  { args: [[['set', 'a', { n: 1 }], ['save', 't', 1, 'a', 'a'], ['mutate', 'a', 'n', 9], ['save', 't', 1, 'a2', 'a'], ['history', 't'], ['latest', 't']]], expected: [null, null, null, null, [1], { step: 1, node: 'a2', state: { n: 9 } }], name: 'saving the same step again replaces it' },
];

const RESUME_HARNESS =
  PY_LG_NODES +
  `
class MemorySaver:
    def __init__(self):
        self.store = {}

    def save(self, thread, step, node, state):
        self.store.setdefault(thread, {})[step] = {"step": step, "node": node, "state": copy.deepcopy(state)}

    def latest(self, thread):
        steps = self.store.get(thread)
        if not steps:
            return None
        return copy.deepcopy(steps[max(steps)])

def run_resume_adapter(fn, plan, state, stop_after):
    saver = MemorySaver()
    first = fn(plan, state, saver, "t", stop_after)
    second = fn(plan, state, saver, "t", None)
    third = fn(plan, state, saver, "t", None)
    return {"first": first, "second": second, "third": third}
`;

const P3 = ['upper', 'exclaim', 'count'];

const unit: Unit = {
  id: 'lg-checkpointing',
  hook: 'Checkpointing is what turns a toy agent loop into something that survives crashes, pauses for days and can be rewound. The follow-up is always "what exactly do you store, and why must it be a copy?".',
  predict: {
    prompt: 'A 5-node graph crashes after node 3 finished. The saver wrote a checkpoint after every node. On restart, which node should run first?',
    options: ['Node 1: always restart from scratch', 'Node 3 again, to be safe', 'Node 4, using the state saved after node 3', 'Node 5'],
    answer: 2,
    explain: 'The checkpoint after node 3 contains the state that node 3 produced, so the next node to run is node 4. Re-running node 3 would repeat its side effects (emails, API calls, charges).',
  },
  viz,
  deeper: {
    points: [
      'A checkpoint is (thread id, step, node that just finished, snapshot of the state). It is written after every node.',
      'Resume = load the latest checkpoint of the thread, restore its state, and continue from the step AFTER it. Finished nodes are never re-run.',
      'Snapshots must be copies. If the saver keeps a reference to the live dict, later edits silently rewrite history.',
      'Time travel = load an older checkpoint (optionally edit its state) and replay from there; the later checkpoints belong to the old branch.',
      'Key checkpoints by a thread id so many conversations can share one saver, and save to a database (not memory) if the process may die.',
    ],
    complexity: { time: 'O(state size) per saved step', space: 'O(steps × state size) per thread' },
    pitfalls: ['Storing a reference instead of a copy', 'Resuming at the node that already finished', 'Using wall-clock order instead of the step number to find the latest', 'Keeping checkpoints only in process memory'],
  },
  practice: {
    language: 'python',
    fnName: 'MemorySaver',
    statement:
      'Implement `MemorySaver` with `save(thread, step, node, state)`, `get(thread, step)`, `latest(thread)` and `history(thread)`. A checkpoint is {"step", "node", "state"}; saving the same (thread, step) again replaces it. Store a deep copy of the state, return copies from `get` and `latest` (None when missing; `latest` is the highest step), and `history` returns the sorted list of steps ([] for an unknown thread).',
    signature: 'class MemorySaver:',
    solution: `import copy

class MemorySaver:
    def __init__(self):
        self.store = {}

    def save(self, thread, step, node, state):
        self.store.setdefault(thread, {})[step] = {"step": step, "node": node, "state": @@copy.deepcopy(state)@@}

    def get(self, thread, step):
        cp = self.store.get(thread, {}).get(step)
        return copy.deepcopy(cp) if cp else None

    def latest(self, thread):
        steps = self.store.get(thread)
        if not steps:
            return None
        return copy.deepcopy(steps[@@max(steps)@@])

    def history(self, thread):
        return @@sorted(self.store.get(thread, {}))@@`,
    harness: SAVER_HARNESS,
    adapter: 'run_saver',
    tests: saverTests,
  },
  debug: {
    language: 'python',
    fnName: 'MemorySaver',
    statement: 'After a node changes the state, loading an old checkpoint returns the NEW values. The saved history is being rewritten. Find the bug.',
    harness: SAVER_HARNESS,
    adapter: 'run_saver',
    buggy: `import copy

class MemorySaver:
    def __init__(self):
        self.store = {}

    def save(self, thread, step, node, state):
        self.store.setdefault(thread, {})[step] = {"step": step, "node": node, "state": state}

    def get(self, thread, step):
        cp = self.store.get(thread, {}).get(step)
        return copy.deepcopy(cp) if cp else None

    def latest(self, thread):
        steps = self.store.get(thread)
        if not steps:
            return None
        return copy.deepcopy(steps[max(steps)])

    def history(self, thread):
        return sorted(self.store.get(thread, {}))`,
    fixed: `import copy

class MemorySaver:
    def __init__(self):
        self.store = {}

    def save(self, thread, step, node, state):
        self.store.setdefault(thread, {})[step] = {"step": step, "node": node, "state": copy.deepcopy(state)}

    def get(self, thread, step):
        cp = self.store.get(thread, {}).get(step)
        return copy.deepcopy(cp) if cp else None

    def latest(self, thread):
        steps = self.store.get(thread)
        if not steps:
            return None
        return copy.deepcopy(steps[max(steps)])

    def history(self, thread):
        return sorted(self.store.get(thread, {}))`,
    tests: saverTests,
    bugType: 'state aliasing',
    hint: 'When `save` stores `state`, do the saver and the running graph now share the same dictionary?',
    explanation: 'The checkpoint holds a reference to the live state dict. When the next node updates that dict, every earlier "snapshot" that points to it changes too, so time travel returns the present. Store `copy.deepcopy(state)`.',
  },
  boss: {
    title: 'Resumable runner',
    statement:
      'Implement `run_resumable(plan, state, saver, thread, stop_after=None)`. `plan` is a list of node names (functions come from the global `NODE_LIB`; call each with a copy of the state and merge its update). A `saver` with `save(thread, step, node, state)` and `latest(thread)` (a checkpoint dict {"step","node","state"} or None) is provided. First look at `saver.latest(thread)`: if it exists, restore its state and continue with the node at index `cp["step"]` (the finished ones are NOT re-run). After each node, `saver.save(thread, index + 1, name, state)`. If the node just finished equals `stop_after`, return {"status": "stopped", ...} immediately (a simulated crash). Return {"status": "stopped" or "done", "state": ..., "ran": names executed in THIS call}.',
    language: 'python',
    fnName: 'run_resumable',
    harness: RESUME_HARNESS,
    adapter: 'run_resume_adapter',
    starter: `def run_resumable(plan, state, saver, thread, stop_after=None):
    # your code here
    pass
`,
    solution: `def run_resumable(plan, state, saver, thread, stop_after=None):
    ran = []
    start = 0
    cp = saver.latest(thread)
    if cp:
        start = cp["step"]
        state = cp["state"]
    for i in range(start, len(plan)):
        name = plan[i]
        state = {**state, **NODE_LIB[name](dict(state))}
        ran.append(name)
        saver.save(thread, i + 1, name, state)
        if name == stop_after:
            return {"status": "stopped", "state": state, "ran": ran}
    return {"status": "done", "state": state, "ran": ran}`,
    tests: [
      { args: [P3, { text: 'hi' }, 'exclaim'], expected: { first: { status: 'stopped', state: { text: 'HI!' }, ran: ['upper', 'exclaim'] }, second: { status: 'done', state: { text: 'HI!', length: 3 }, ran: ['count'] }, third: { status: 'done', state: { text: 'HI!', length: 3 }, ran: [] } }, name: 'crash in the middle, resume, then nothing left' },
      { args: [P3, { text: 'hi' }, 'upper'], expected: { first: { status: 'stopped', state: { text: 'HI' }, ran: ['upper'] }, second: { status: 'done', state: { text: 'HI!', length: 3 }, ran: ['exclaim', 'count'] }, third: { status: 'done', state: { text: 'HI!', length: 3 }, ran: [] } }, name: 'crash after the first node' },
      { args: [P3, { text: 'hi' }, 'count'], expected: { first: { status: 'stopped', state: { text: 'HI!', length: 3 }, ran: ['upper', 'exclaim', 'count'] }, second: { status: 'done', state: { text: 'HI!', length: 3 }, ran: [] }, third: { status: 'done', state: { text: 'HI!', length: 3 }, ran: [] } }, name: 'crash after the last node: nothing to redo' },
      { args: [P3, { text: 'hi' }, null], expected: { first: { status: 'done', state: { text: 'HI!', length: 3 }, ran: ['upper', 'exclaim', 'count'] }, second: { status: 'done', state: { text: 'HI!', length: 3 }, ran: [] }, third: { status: 'done', state: { text: 'HI!', length: 3 }, ran: [] } }, name: 'no crash' },
      { args: [['tag', 'exclaim', 'tag'], { text: 'go' }, 'exclaim'], expected: { first: { status: 'stopped', state: { text: 'go!', tags: ['g'] }, ran: ['tag', 'exclaim'] }, second: { status: 'done', state: { text: 'go!', tags: ['g', 'g'] }, ran: ['tag'] }, third: { status: 'done', state: { text: 'go!', tags: ['g', 'g'] }, ran: [] } }, name: 'the same node name twice in the plan' },
    ],
    hints: ['Resume point: `start = cp["step"]` is the number of finished nodes, which is exactly the index of the next one. Do not look the node up by name (names can repeat).', 'Loop `for i in range(start, len(plan))`, save with step `i + 1` after merging the update, and return early when the finished node equals `stop_after`.'],
    combines: ['lg-state-graph', 'lg-reducers'],
  },
  quiz: [
    {
      prompt: 'Why must a saver store a copy of the state rather than the state object itself?',
      options: ['Copies are smaller', 'Later in-place changes to the live state would silently rewrite the saved history', 'Python cannot pickle references', 'It is required by JSON'],
      answer: 1,
      explain: 'A reference shares memory with the running graph. Only an independent snapshot stays correct when the state keeps changing.',
    },
  ],
  simulationNote: LG_NOTE,
};

export default unit;
