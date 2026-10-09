import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { DOC_BY_ID, LG_NOTE, PY_LG_NODES, changedKeys, flowPanel, kvPanel, lineNodes, rankDocs, stateKv, tfVec, type FlowEdge } from '@/content/lib/ai-finish-1';

const code = `
class StateGraph:
    def __init__(self):
        self.nodes, self.edges, self.entry = {}, {}, None      #@init

    def run(self, state):
        state = dict(state)
        cur = self.entry                                       #@start
        while cur != END:                                      #@loop
            update = self.nodes[cur](dict(state))              #@node
            state = {**state, **update}                        #@merge
            cur = self.edges[cur]                              #@edge
        return state                                           #@done
`;

const QUESTIONS = ['How long does delivery take?', 'How do I reset my password?', 'Do gift cards expire?', 'Where can I download my invoice?'];

type State = Record<string, unknown>;
type NodeFn = (s: State) => State;

const NODES: Record<string, NodeFn> = {
  plan: (s) => ({ plan: `look up: ${s.question}` }),
  search: (s) => ({ docs: [rankDocs(tfVec(String(s.question)))[0].id] }),
  answer: (s) => {
    const id = (s.docs as string[])[0];
    return { answer: `${id}: ${DOC_BY_ID[id].text.split(' ').slice(0, 7).join(' ')}...` };
  },
};
const ORDER = ['plan', 'search', 'answer'];
const NEXT: Record<string, string> = { START: 'plan', plan: 'search', search: 'answer', answer: 'END' };

interface In {
  question: string;
}

function setup(i: In) {
  if (!QUESTIONS.includes(i.question)) throw new Error('Pick one of: ' + QUESTIONS.join(' | '));
  return i.question;
}

const EDGES: FlowEdge[] = [
  { from: 'START', to: 'plan' },
  { from: 'plan', to: 'search' },
  { from: 'search', to: 'answer' },
  { from: 'answer', to: 'END' },
];

const viz: VizDef<In> = {
  id: 'lg-state-graph',
  title: 'A state graph, step by step',
  code,
  language: 'python',
  inputs: [{ key: 'question', label: 'Question', kind: 'select', default: QUESTIONS[0], options: QUESTIONS }],
  presets: QUESTIONS.map((q, i) => ({ label: ['Delivery', 'Password', 'Gift cards', 'Invoice'][i], input: { question: q } })),
  run(input) {
    const question = setup(input);
    const r = new Recorder(code);
    const nodes = lineNodes([['plan', 'plan'], ['search', 'search'], ['answer', 'answer']], 100);
    let state: State = { question };
    const done: string[] = [];
    r.step('start', 'The graph starts with the input state: just the question', [flowPanel('Graph', nodes, EDGES, { active: 'START' }), stateKv('State', state)], { entry: 'plan' });
    for (const name of ORDER) {
      r.op();
      const update = NODES[name](state);
      r.step('node', `${name}() reads the state and returns a partial update: {${Object.keys(update).join(', ')}}`, [flowPanel('Graph', nodes, EDGES, { active: name, done: [...done] }), stateKv('State (read)', state), kvPanel(`${name} returns`, update, Object.fromEntries(Object.keys(update).map((k) => [k, 'new'])))], { node: name });
      const before = state;
      state = { ...state, ...update };
      r.step('merge', `Merge: the update is written into the state under ${Object.keys(update).map((k) => `"${k}"`).join(', ')}`, [flowPanel('Graph', nodes, EDGES, { active: name, done: [...done] }), stateKv('State after merge', state, changedKeys(before, state))], { keys: Object.keys(state).join(' ') });
      done.push(name);
      const next = NEXT[name];
      r.step('edge', `Follow the edge ${name} → ${next}`, [flowPanel('Graph', nodes, EDGES, { done: [...done], taken: [name, next] }), stateKv('State', state)], { next });
    }
    done.push('END');
    r.step('done', 'Reached END: the final state is returned to the caller', [flowPanel('Graph', nodes, EDGES, { done: [...done] }), stateKv('Final state', state)], { keys: Object.keys(state).length });
    return { frames: r.frames, result: state };
  },
  reference(input) {
    const question = setup(input);
    const top = rankDocs(tfVec(question))[0].id;
    return { question, plan: `look up: ${question}`, docs: [top], answer: `${top}: ${DOC_BY_ID[top].text.split(' ').slice(0, 7).join(' ')}...` };
  },
};

const HARNESS =
  PY_LG_NODES +
  `
def run_graph(cls, nodes, edges, entry, state):
    initial = copy.deepcopy(state)
    g = cls()
    for n in nodes:
        g.add_node(n, NODE_LIB[n])
    for a, b in edges:
        g.add_edge(a, b)
    if entry is not None:
        g.set_entry(entry)
    try:
        final = g.run(state)
    except ValueError:
        return "ValueError"
    return {"state": final, "visited": list(g.trace), "input_unchanged": state == initial}
`;

const tests = [
  { args: [['upper', 'exclaim'], [['upper', 'exclaim'], ['exclaim', 'END']], 'upper', { text: 'hi' }], expected: { state: { text: 'HI!' }, visited: ['upper', 'exclaim'], input_unchanged: true }, name: 'two nodes in a chain' },
  { args: [['exclaim', 'count'], [['exclaim', 'count'], ['count', 'END']], 'exclaim', { text: 'hi' }], expected: { state: { text: 'hi!', length: 3 }, visited: ['exclaim', 'count'], input_unchanged: true }, name: 'later nodes see earlier updates' },
  { args: [['sneaky', 'upper'], [['sneaky', 'upper'], ['upper', 'END']], 'sneaky', { text: 'abc' }], expected: { state: { text: 'ABC', seen: true }, visited: ['sneaky', 'upper'], input_unchanged: true }, name: 'a node that mutates its input cannot corrupt the state' },
  { args: [['upper'], [['upper', 'END']], null, { text: 'x' }], expected: 'ValueError', name: 'no entry node' },
  { args: [['upper'], [], 'upper', { text: 'x' }], expected: 'ValueError', name: 'a node without an outgoing edge' },
  { args: [['tag', 'upper'], [['tag', 'upper'], ['upper', 'END']], 'tag', { text: 'go', tags: ['x'] }], expected: { state: { text: 'GO', tags: ['x', 'g'] }, visited: ['tag', 'upper'], input_unchanged: true }, name: 'untouched keys survive the merge' },
  { args: [['upper'], [['upper', 'ghost']], 'upper', { text: 'x' }], expected: 'ValueError', name: 'an edge to an unknown node' },
];

const VAL_HARNESS = 'END = "END"\n';

const unit: Unit = {
  id: 'lg-state-graph',
  hook: 'LangGraph is "a state machine whose nodes read a shared state and return partial updates". Being able to build the 15-line core yourself is the best answer to "how does it work?".',
  predict: {
    prompt: 'In a state graph, node `search` returns `{"docs": ["d2"]}`. What happens to the other keys already in the state, such as `question`?',
    options: ['They are deleted; the update replaces the whole state', 'They are kept; only the returned keys are written', 'An error is raised because the update is incomplete', 'They are copied into docs'],
    answer: 1,
    explain: 'Nodes return partial updates. The framework merges them into the existing state, so keys a node does not mention are untouched.',
  },
  viz,
  deeper: {
    points: [
      'A graph has three parts: a state (a shared dict), nodes (functions state → partial update) and edges (which node runs next).',
      'After every node, its update is merged into the state; the next node sees the merged result.',
      'Give nodes a copy of the state so a node that mutates its argument cannot corrupt the graph or the caller; return updates instead.',
      'START and END are virtual nodes: the entry edge leaves START, a path that reaches END stops the run.',
      'A node without an outgoing edge is a dead end. Real frameworks validate this at compile time rather than at run time.',
    ],
    complexity: { time: 'one function call per visited node', space: 'O(state size)' },
    pitfalls: ['Mutating the state dict in place instead of returning an update', 'Replacing the state with the update, which drops other keys', 'Forgetting an edge to END', 'Letting a node mutate the caller\'s input'],
  },
  practice: {
    language: 'python',
    fnName: 'StateGraph',
    statement:
      'Implement a tiny `StateGraph` with `add_node(name, fn)`, `add_edge(source, target)`, `set_entry(name)` and `run(state)`. `run` starts at the entry node (ValueError if none), calls each node with a COPY of the state, merges the returned update into a new state dict, appends the node name to `self.trace`, and follows its edge until it reaches `END` (a global equal to "END"). Raise ValueError for an unknown node or a node without an edge. The caller\'s dict must not change.',
    signature: 'class StateGraph:',
    solution: `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.entry = None
        self.trace = []

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def set_entry(self, name):
        self.entry = name

    def run(self, state):
        if self.entry is None:
            raise ValueError("no entry node")
        self.trace = []
        state = dict(state)
        cur = self.entry
        while cur != END:
            if cur not in self.nodes:
                raise ValueError("unknown node " + cur)
            update = self.nodes[cur](@@dict(state)@@)
            state = @@{**state, **update}@@
            self.trace.append(cur)
            if cur not in self.edges:
                raise ValueError("no edge from " + cur)
            cur = @@self.edges[cur]@@
        return state`,
    harness: HARNESS,
    adapter: 'run_graph',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'StateGraph',
    statement: 'A node that tweaks its input state ends up changing the CALLER\'s dictionary and the final state is corrupted. Find the bug.',
    harness: HARNESS,
    adapter: 'run_graph',
    buggy: `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.entry = None
        self.trace = []

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def set_entry(self, name):
        self.entry = name

    def run(self, state):
        if self.entry is None:
            raise ValueError("no entry node")
        self.trace = []
        cur = self.entry
        while cur != END:
            if cur not in self.nodes:
                raise ValueError("unknown node " + cur)
            update = self.nodes[cur](state)
            state = {**state, **update}
            self.trace.append(cur)
            if cur not in self.edges:
                raise ValueError("no edge from " + cur)
            cur = self.edges[cur]
        return state`,
    fixed: `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.entry = None
        self.trace = []

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def set_entry(self, name):
        self.entry = name

    def run(self, state):
        if self.entry is None:
            raise ValueError("no entry node")
        self.trace = []
        cur = self.entry
        while cur != END:
            if cur not in self.nodes:
                raise ValueError("unknown node " + cur)
            update = self.nodes[cur](dict(state))
            state = {**state, **update}
            self.trace.append(cur)
            if cur not in self.edges:
                raise ValueError("no edge from " + cur)
            cur = self.edges[cur]
        return state`,
    tests,
    bugType: 'state aliasing',
    hint: 'On the first node, which dictionary does the node receive: the caller\'s or a copy?',
    explanation: 'The first node is handed the caller\'s own dict. A node that assigns into it (`s["text"] = ...`) silently rewrites the input, and every later "merge" builds on corrupted data. Pass `dict(state)` so nodes work on a copy and communicate only through their returned update.',
  },
  boss: {
    title: 'Validate a graph before running it',
    statement:
      'Implement `validate_graph(nodes, edges, entry)` where `nodes` is a list of names, `edges` a list of [source, target] pairs (a target may be "END", a global equal to "END"), and `entry` the first node. Return a SORTED list of problem strings: "bad entry" if the entry is not a node; "unknown source: X" / "unknown target: X" for edge endpoints that are not nodes (END is allowed as a target); then, for every node: "unreachable: X" if it cannot be reached from the entry, otherwise "dead end: X" if it has no outgoing edge. A valid graph returns [].',
    language: 'python',
    fnName: 'validate_graph',
    harness: VAL_HARNESS,
    starter: `def validate_graph(nodes, edges, entry):
    # your code here
    pass
`,
    solution: `def validate_graph(nodes, edges, entry):
    problems = []
    names = set(nodes)
    if entry not in names:
        problems.append("bad entry")
    out = {}
    for a, b in edges:
        if a not in names:
            problems.append("unknown source: " + a)
        if b != END and b not in names:
            problems.append("unknown target: " + b)
        out.setdefault(a, []).append(b)
    seen = set()
    stack = [entry] if entry in names else []
    while stack:
        n = stack.pop()
        if n in seen or n == END:
            continue
        seen.add(n)
        stack.extend(out.get(n, []))
    for n in nodes:
        if n not in seen:
            problems.append("unreachable: " + n)
        elif n not in out:
            problems.append("dead end: " + n)
    return sorted(problems)`,
    tests: [
      { args: [['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'END']], 'a'], expected: [], name: 'a valid chain' },
      { args: [['a', 'b', 'c'], [['a', 'b'], ['b', 'END']], 'a'], expected: ['unreachable: c'], name: 'an orphan node' },
      { args: [['a', 'b'], [['a', 'b']], 'a'], expected: ['dead end: b'], name: 'a reachable node with no way out' },
      { args: [['a', 'b'], [['a', 'x'], ['b', 'END']], 'a'], expected: ['unknown target: x', 'unreachable: b'], name: 'an edge to nowhere' },
      { args: [['a', 'b'], [['a', 'b'], ['b', 'END']], 'z'], expected: ['bad entry', 'unreachable: a', 'unreachable: b'], name: 'bad entry' },
      { args: [['a', 'b', 'c'], [['a', 'b'], ['b', 'a'], ['c', 'END']], 'a'], expected: ['unreachable: c'], name: 'cycles are walked once' },
      { args: [['a'], [['q', 'a'], ['a', 'END']], 'a'], expected: ['unknown source: q'], name: 'unknown source' },
    ],
    hints: ['Collect edge problems first, building an `out` map source → targets at the same time. Then do a depth-first walk from the entry with a `seen` set.', 'After the walk, loop over `nodes`: not in `seen` → unreachable; in `seen` but not a key of `out` → dead end. Return `sorted(problems)`.'],
    combines: ['lg-conditional'],
  },
  quiz: [
    {
      prompt: 'Why does the framework merge a node\'s returned update into the state instead of letting the node replace it?',
      options: ['It is faster', 'Nodes only need to describe what they changed, and other keys survive', 'Replacing is not possible in Python', 'To keep the graph acyclic'],
      answer: 1,
      explain: 'Partial updates keep nodes small and independent; the shared state keeps everything else.',
    },
  ],
  simulationNote: LG_NOTE,
};

export default unit;
