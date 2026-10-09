import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LG_NOTE, PY_LG_NODES, changedKeys, flowPanel, kvPanel, stateKv, type FlowEdge, type FlowNode } from '@/content/lib/ai-finish-1';

const code = `
def run(self, state):
    cur = self.entry
    while cur != END:
        update = self.nodes[cur](dict(state))               #@node
        state = {**state, **update}                         #@merge
        if cur in self.conditional:
            router, mapping = self.conditional[cur]
            key = router(state)                             #@router
            if key not in mapping:
                raise ValueError("unknown key: " + key)     #@bad
            cur = mapping[key]                              #@route
        else:
            cur = self.edges[cur]                           #@edge
    return state                                            #@done
`;

const TICKETS = ['I want my money back', 'The app crashes on login', 'Do you sell gift wrap?', 'Legal notice: cease and desist'];

const NODES: FlowNode[] = [
  { id: 'START', label: 'START', x: 30, y: 110 },
  { id: 'classify', label: 'classify', x: 150, y: 110 },
  { id: 'refund', label: 'refund', x: 360, y: 35 },
  { id: 'bug', label: 'bug', x: 360, y: 110 },
  { id: 'human', label: 'human', x: 360, y: 185 },
  { id: 'END', label: 'END', x: 530, y: 110 },
];
const EDGES: FlowEdge[] = [
  { from: 'START', to: 'classify' },
  { from: 'classify', to: 'refund', label: 'refund', dashed: true },
  { from: 'classify', to: 'bug', label: 'bug', dashed: true },
  { from: 'classify', to: 'human', label: 'other', dashed: true },
  { from: 'refund', to: 'END' },
  { from: 'bug', to: 'END' },
  { from: 'human', to: 'END' },
];
const MAPPING: Record<string, string> = { refund: 'refund', bug: 'bug', other: 'human' };
const REPLIES: Record<string, string> = { refund: 'Refund started', bug: 'Bug filed, engineers notified', human: 'Passed to a human agent' };

function classify(text: string): string {
  const t = text.toLowerCase();
  if (/money|refund/.test(t)) return 'refund';
  if (/crash|error|bug/.test(t)) return 'bug';
  if (/legal|lawyer|cease/.test(t)) return 'legal';
  return 'other';
}

interface In {
  ticket: string;
}

function setup(i: In) {
  if (!TICKETS.includes(i.ticket)) throw new Error('Pick one of: ' + TICKETS.join(' | '));
  return i.ticket;
}

const viz: VizDef<In> = {
  id: 'lg-conditional',
  title: 'Conditional edges: a router picks the next node',
  code,
  language: 'python',
  inputs: [{ key: 'ticket', label: 'Support ticket', kind: 'select', default: TICKETS[0], options: TICKETS }],
  presets: [
    { label: 'Refund path', input: { ticket: TICKETS[0] } },
    { label: 'Bug path', input: { ticket: TICKETS[1] } },
    { label: 'Fallback to a human', input: { ticket: TICKETS[2] } },
    { label: 'Router returns an unmapped key', input: { ticket: TICKETS[3] } },
  ],
  run(input) {
    const ticket = setup(input);
    const r = new Recorder(code);
    const done: string[] = [];
    const g = (active?: string, taken?: [string, string], failed?: string) => flowPanel('Graph (dashed edges are chosen by the router)', NODES, EDGES, { active, done: [...done], taken, failed }, { width: 560, height: 220 });
    let state: Record<string, unknown> = { text: ticket };
    const path: string[] = [];
    r.step('node', 'The ticket enters the graph at classify', [g('START'), stateKv('State', state)], { entry: 'classify' });
    r.op();
    const intent = classify(ticket);
    r.step('node', `classify reads the text and returns {intent: "${intent}"}`, [g('classify'), stateKv('State (read)', state), kvPanel('classify returns', { intent }, { intent: 'new' })], { node: 'classify' });
    const before = state;
    state = { ...state, intent };
    path.push('classify');
    r.step('merge', `Merge: state.intent = "${intent}"`, [g('classify'), stateKv('State after merge', state, changedKeys(before, state))], { intent });
    r.step('router', `router(state) reads state.intent and returns "${intent}"`, [g('classify'), kvPanel('Mapping: router key → next node', MAPPING, MAPPING[intent] ? { [intent]: 'found' } : {}), stateKv('State', state)], { key: intent });
    if (!(intent in MAPPING)) {
      done.push('classify');
      r.step('bad', `"${intent}" is not in the mapping, so there is no next node: ValueError`, [g(undefined, undefined, 'classify'), kvPanel('Error', { router_returned: intent, valid_keys: Object.keys(MAPPING).join(', ') }, { router_returned: 'error' })], { error: 'unknown key' });
      return { frames: r.frames, result: { path, reply: null, error: `unknown key: ${intent}` } };
    }
    const next = MAPPING[intent];
    done.push('classify');
    r.step('route', `mapping["${intent}"] = "${next}": the run continues there`, [g(undefined, ['classify', next]), stateKv('State', state)], { next });
    r.op();
    const reply = REPLIES[next];
    r.step('node', `${next} runs and returns {reply: "${reply}"}`, [g(next, undefined), stateKv('State (read)', state), kvPanel(`${next} returns`, { reply }, { reply: 'new' })], { node: next });
    const before2 = state;
    state = { ...state, reply };
    path.push(next);
    done.push(next);
    r.step('merge', `Merge: state.reply = "${reply}"`, [g(next), stateKv('State after merge', state, changedKeys(before2, state))], { reply });
    r.step('edge', `${next} has a plain edge to END`, [g(undefined, [next, 'END']), stateKv('State', state)], { next: 'END' });
    done.push('END');
    r.step('done', `Done. Path taken: ${path.join(' → ')}`, [g(), stateKv('Final state', state)], { path: path.join(' ') });
    return { frames: r.frames, result: { path, reply, error: null } };
  },
  reference(input) {
    const ticket = setup(input);
    const intent = classify(ticket);
    const next = MAPPING[intent];
    if (!next) return { path: ['classify'], reply: null, error: `unknown key: ${intent}` };
    return { path: ['classify', next], reply: REPLIES[next], error: null };
  },
};

const HARNESS =
  PY_LG_NODES +
  `
ROUTERS = {
    "length": lambda s: "long" if len(s["text"]) > 4 else "short",
    "flag": lambda s: "yes" if s.get("ok") else "no",
    "kind": lambda s: s["kind"],
}

def run_cond(cls, nodes, edges, cond, entry, state):
    g = cls()
    for n in nodes:
        g.add_node(n, NODE_LIB[n])
    for a, b in edges:
        g.add_edge(a, b)
    src, rname, mapping = cond
    g.add_conditional_edges(src, ROUTERS[rname], mapping)
    g.set_entry(entry)
    try:
        final = g.run(state)
    except ValueError:
        return "ValueError"
    return {"state": final, "visited": list(g.trace)}
`;

const LEN = ['count', 'length', { long: 'upper', short: 'exclaim' }];
const tests = [
  { args: [['count', 'upper', 'exclaim'], [['upper', 'END'], ['exclaim', 'END']], LEN, 'count', { text: 'hello world' }], expected: { state: { text: 'HELLO WORLD', length: 11 }, visited: ['count', 'upper'] }, name: 'long text takes the upper branch' },
  { args: [['count', 'upper', 'exclaim'], [['upper', 'END'], ['exclaim', 'END']], LEN, 'count', { text: 'hi' }], expected: { state: { text: 'hi!', length: 2 }, visited: ['count', 'exclaim'] }, name: 'short text takes the exclaim branch' },
  { args: [['count', 'upper'], [['upper', 'END']], ['count', 'length', { long: 'upper', short: 'END' }], 'count', { text: 'hi' }], expected: { state: { text: 'hi', length: 2 }, visited: ['count'] }, name: 'a branch can lead straight to END' },
  { args: [['count', 'upper'], [['upper', 'END']], ['count', 'kind', { refund: 'upper', bug: 'END' }], 'count', { text: 'hi', kind: 'legal' }], expected: 'ValueError', name: 'router returns a key that is not mapped' },
  { args: [['tag', 'upper', 'exclaim'], [['upper', 'END'], ['exclaim', 'END']], ['tag', 'flag', { yes: 'upper', no: 'exclaim' }], 'tag', { text: 'go', ok: true }], expected: { state: { text: 'GO', ok: true, tags: ['g'] }, visited: ['tag', 'upper'] }, name: 'router reads the merged state' },
  { args: [['tag', 'upper', 'exclaim'], [['upper', 'END'], ['exclaim', 'END']], ['tag', 'flag', { yes: 'upper', no: 'exclaim' }], 'tag', { text: 'go' }], expected: { state: { text: 'go!', tags: ['g'] }, visited: ['tag', 'exclaim'] }, name: 'missing flag takes the other branch' },
];

const LOOP_HARNESS =
  PY_LG_NODES +
  `
LOOP_ROUTERS = {
    "tags3": lambda s: "again" if len(s.get("tags", [])) < 3 else "done",
    "length": lambda s: "long" if len(s["text"]) > 4 else "short",
    "never": lambda s: "again",
}

def run_loop_adapter(fn, node_names, edges, conds, entry, state, limit):
    nodes = {n: NODE_LIB[n] for n in node_names}
    cs = {src: (LOOP_ROUTERS[r], m) for src, (r, m) in conds.items()}
    try:
        return fn(nodes, edges, cs, entry, state, limit)
    except ValueError:
        return "ValueError"
`;

const TAGLOOP = { tag: ['tags3', { again: 'tag', done: 'exclaim' }] };

const unit: Unit = {
  id: 'lg-conditional',
  hook: 'Agents loop, branch and give up, and in LangGraph all of that is a router function on a conditional edge. Interviewers ask what the router returns and what happens when it returns something unexpected.',
  predict: {
    prompt: 'A conditional edge has mapping {"refund": "refund_node", "bug": "bug_node"}. The router returns "legal". What should happen?',
    options: ['The graph silently ends', 'The first node in the mapping runs', 'An error: "legal" is not a key of the mapping', 'The router is called again'],
    answer: 2,
    explain: 'The mapping translates the router\'s return value into a node name. A key that is not in the mapping has no destination, and the right behaviour is to fail loudly (or provide an explicit default branch), not guess.',
  },
  viz,
  deeper: {
    points: [
      'A conditional edge is (source, router, mapping). After `source` runs and its update is merged, `router(state)` returns a KEY; `mapping[key]` is the next node (which may be END).',
      'The router sees the already-merged state, so it can react to what the node just produced.',
      'Routers must be pure functions of the state. Keeping them side-effect free is what makes runs replayable.',
      'Cycles are legal: a router that can send execution back to an earlier node gives you retry and agent loops, so you need a recursion limit to stop runaway loops.',
      'Cover every key the router can return, or add a catch-all (for example "other") that sends to a human.',
    ],
    complexity: { time: 'one router call per conditional node visit', space: 'O(1) extra' },
    pitfalls: ['Using the router\'s return value as the node name and skipping the mapping', 'A router that returns a key the mapping does not have', 'A loop with no exit condition and no recursion limit', 'Routers with side effects'],
  },
  practice: {
    language: 'python',
    fnName: 'StateGraph',
    statement:
      'Extend the graph with `add_conditional_edges(source, router, mapping)`. After `source` runs and its update is merged, call `router(state)`; the result must be a key of `mapping` (otherwise raise ValueError) and `mapping[key]` is the next node, possibly `END`. Other nodes use plain edges. Keep `run`, `add_node`, `add_edge`, `set_entry` and `self.trace` as before; nodes get a copy of the state.',
    signature: 'class StateGraph:',
    solution: `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.conditional = {}
        self.entry = None
        self.trace = []

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def add_conditional_edges(self, source, router, mapping):
        self.conditional[source] = (router, mapping)

    def set_entry(self, name):
        self.entry = name

    def run(self, state):
        if self.entry is None:
            raise ValueError("no entry node")
        self.trace = []
        state = dict(state)
        cur = self.entry
        while cur != END:
            update = self.nodes[cur](dict(state))
            state = {**state, **update}
            self.trace.append(cur)
            if cur in self.conditional:
                router, mapping = self.conditional[cur]
                key = @@router(state)@@
                if key not in mapping:
                    raise ValueError("router returned unknown key: " + str(key))
                cur = @@mapping[key]@@
            elif cur in self.edges:
                cur = self.edges[cur]
            else:
                raise ValueError("no edge from " + cur)
        return state`,
    harness: HARNESS,
    adapter: 'run_cond',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'StateGraph',
    statement: 'Branching crashes with a KeyError on a node called "long" (or "short"). Find the bug.',
    harness: HARNESS,
    adapter: 'run_cond',
    buggy: `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.conditional = {}
        self.entry = None
        self.trace = []

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def add_conditional_edges(self, source, router, mapping):
        self.conditional[source] = (router, mapping)

    def set_entry(self, name):
        self.entry = name

    def run(self, state):
        if self.entry is None:
            raise ValueError("no entry node")
        self.trace = []
        state = dict(state)
        cur = self.entry
        while cur != END:
            update = self.nodes[cur](dict(state))
            state = {**state, **update}
            self.trace.append(cur)
            if cur in self.conditional:
                router, mapping = self.conditional[cur]
                cur = router(state)
            elif cur in self.edges:
                cur = self.edges[cur]
            else:
                raise ValueError("no edge from " + cur)
        return state`,
    fixed: `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.conditional = {}
        self.entry = None
        self.trace = []

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def add_conditional_edges(self, source, router, mapping):
        self.conditional[source] = (router, mapping)

    def set_entry(self, name):
        self.entry = name

    def run(self, state):
        if self.entry is None:
            raise ValueError("no entry node")
        self.trace = []
        state = dict(state)
        cur = self.entry
        while cur != END:
            update = self.nodes[cur](dict(state))
            state = {**state, **update}
            self.trace.append(cur)
            if cur in self.conditional:
                router, mapping = self.conditional[cur]
                key = router(state)
                if key not in mapping:
                    raise ValueError("router returned unknown key: " + str(key))
                cur = mapping[key]
            elif cur in self.edges:
                cur = self.edges[cur]
            else:
                raise ValueError("no edge from " + cur)
        return state`,
    tests,
    bugType: 'router result used as a node name',
    hint: 'What does the router return: a node name or a key? Where is the mapping used?',
    explanation: 'The router returns a KEY such as "long"; the mapping turns it into a node name. Assigning the key straight to `cur` makes the loop look for a node called "long" and fail. Look the key up in the mapping (and reject unknown keys explicitly).',
  },
  boss: {
    title: 'Loops with a recursion limit',
    statement:
      'Implement `run_loop(nodes, edges, conds, entry, state, limit)`. `nodes` maps names to functions, `edges` maps a node to its next node (or END), and `conds` maps a node to a (router, mapping) pair. Run from `entry`: call each node with a copy of the state, merge its update into a new dict, record the node name in `visited`, then pick the next node (router + mapping if the node is in `conds`, else `edges`). If the router returns a key not in the mapping raise ValueError. Before running a node, if `len(visited) >= limit`, raise ValueError("recursion limit"). Return {"state": final state, "visited": names}.',
    language: 'python',
    fnName: 'run_loop',
    harness: LOOP_HARNESS,
    adapter: 'run_loop_adapter',
    starter: `def run_loop(nodes, edges, conds, entry, state, limit=10):
    # your code here
    pass
`,
    solution: `def run_loop(nodes, edges, conds, entry, state, limit=10):
    state = dict(state)
    visited = []
    cur = entry
    while cur != END:
        if len(visited) >= limit:
            raise ValueError("recursion limit")
        update = nodes[cur](dict(state))
        state = {**state, **update}
        visited.append(cur)
        if cur in conds:
            router, mapping = conds[cur]
            key = router(state)
            if key not in mapping:
                raise ValueError("unknown key " + str(key))
            cur = mapping[key]
        else:
            cur = edges[cur]
    return {"state": state, "visited": visited}`,
    tests: [
      { args: [['tag', 'exclaim'], { exclaim: 'END' }, TAGLOOP, 'tag', { text: 'go' }, 10], expected: { state: { text: 'go!', tags: ['g', 'g', 'g'] }, visited: ['tag', 'tag', 'tag', 'exclaim'] }, name: 'loop until three tags' },
      { args: [['tag', 'exclaim'], { exclaim: 'END' }, TAGLOOP, 'tag', { text: 'go' }, 3], expected: 'ValueError', name: 'limit hit one step short' },
      { args: [['tag', 'exclaim'], { exclaim: 'END' }, TAGLOOP, 'tag', { text: 'go' }, 4], expected: { state: { text: 'go!', tags: ['g', 'g', 'g'] }, visited: ['tag', 'tag', 'tag', 'exclaim'] }, name: 'exactly at the limit is fine' },
      { args: [['tag'], {}, { tag: ['never', { again: 'tag' }] }, 'tag', { text: 'go' }, 5], expected: 'ValueError', name: 'an endless loop is stopped' },
      { args: [['upper', 'exclaim'], { exclaim: 'END' }, { upper: ['length', { long: 'exclaim', short: 'exclaim' }] }, 'upper', { text: 'abcdef' }, 5], expected: { state: { text: 'ABCDEF!' }, visited: ['upper', 'exclaim'] }, name: 'conditional then plain edge' },
      { args: [['upper'], { upper: 'END' }, {}, 'upper', { text: 'z' }, 1], expected: { state: { text: 'Z' }, visited: ['upper'] }, name: 'one step with limit 1' },
      { args: [['upper'], { upper: 'END' }, {}, 'upper', { text: 'z' }, 0], expected: 'ValueError', name: 'limit 0 allows nothing' },
    ],
    hints: ['Check the limit at the TOP of each loop iteration: `if len(visited) >= limit: raise ValueError(...)`, before calling the node.', 'After running a node, choose the next one: if the node is in `conds` use `mapping[router(state)]` (rejecting unknown keys), otherwise `edges[cur]`.'],
    combines: ['lg-state-graph', 'agent-tool-calling'],
  },
  quiz: [
    {
      prompt: 'Why do real graph frameworks enforce a recursion limit?',
      options: ['To keep the state small', 'A conditional edge can loop back, and a router bug would otherwise spin forever', 'To make nodes run in parallel', 'Because Python cannot loop more than 10 times'],
      answer: 1,
      explain: 'Cycles are what make agent loops possible, and also what make infinite loops possible. A step cap turns a bug into a clear error.',
    },
  ],
  simulationNote: LG_NOTE,
};

export default unit;
