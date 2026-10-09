import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LG_NOTE, PY_LG_NODES, changedKeys, flowPanel, kvPanel, lineNodes, logPanel, stateKv, type FlowEdge } from '@/content/lib/ai-finish-1';

const code = `
def _drive(self, skip_check):
    cur, state = self._cur, self._state
    first = skip_check
    while cur != END:
        if cur in self.interrupts and not first:               #@pause
            self._cur, self._state = cur, state
            return {"status": "paused", "next": cur, "state": state}
        first = False
        state = {**state, **self.nodes[cur](dict(state))}      #@node
        cur = self.edges[cur]
    return {"status": "done", "next": None, "state": state}    #@done

def resume(self, update=None):
    self._state = {**self._state, **(update or {})}            #@human
    return self._drive(True)                                   #@continue
`;

const DECISIONS = ['approve', 'edit', 'reject'];
const ORDER = ['lookup', 'draft', 'send'];
const EDGES: FlowEdge[] = [{ from: 'START', to: 'lookup' }, { from: 'lookup', to: 'draft' }, { from: 'draft', to: 'send' }, { from: 'send', to: 'END' }];

interface In {
  decision: string;
  edit: string;
}

function setup(i: In) {
  if (!DECISIONS.includes(i.decision)) throw new Error('Decision must be one of: ' + DECISIONS.join(', '));
  const edit = i.edit.trim();
  if (i.decision === 'edit' && !edit) throw new Error('Type the corrected message to use the "edit" decision');
  return { decision: i.decision, edit };
}

const DRAFT = 'Hi! Your refund of $40 is approved.';

const viz: VizDef<In> = {
  id: 'lg-hitl',
  title: 'Human in the loop: pause, review, resume',
  code,
  language: 'python',
  inputs: [
    { key: 'decision', label: 'What the human does', kind: 'select', default: 'edit', options: DECISIONS },
    { key: 'edit', label: 'Corrected message (for "edit")', kind: 'string', default: 'Hi! Your refund of $25 is approved.' },
  ],
  presets: [
    { label: 'Human edits the draft', input: { decision: 'edit', edit: 'Hi! Your refund of $25 is approved.' } },
    { label: 'Human approves as is', input: { decision: 'approve', edit: '' } },
    { label: 'Human rejects: nothing is sent', input: { decision: 'reject', edit: '' } },
  ],
  run(input) {
    const { decision, edit } = setup(input);
    const r = new Recorder(code);
    const nodes = lineNodes(ORDER.map((n) => [n, n] as [string, string]), 90);
    const done: string[] = [];
    const flow = (o: { active?: string; paused?: string; taken?: [string, string] } = {}) => flowPanel('Graph (interrupt_before "send")', nodes, EDGES, { ...o, done: [...done] }, { width: 560, height: 160 });
    let state: Record<string, unknown> = { request: 'refund order 1042' };
    const trace: string[] = [];
    r.step('node', 'invoke() starts the graph with the customer request', [flow({ active: 'START' }), stateKv('State', state)], { status: 'running' });
    r.op();
    let before = state;
    state = { ...state, amount: 40 };
    trace.push('lookup');
    r.step('node', 'lookup runs: it finds the refund amount, $40', [flow({ active: 'lookup' }), stateKv('State', state, changedKeys(before, state))], { node: 'lookup' });
    done.push('lookup');
    r.op();
    before = state;
    state = { ...state, draft: DRAFT };
    trace.push('draft');
    r.step('node', 'draft runs: an LLM writes the customer email', [flow({ active: 'draft' }), stateKv('State', state, changedKeys(before, state))], { node: 'draft' });
    done.push('draft');
    r.step('pause', 'send is marked interrupt_before: invoke() saves the state and returns "paused"', [flow({ paused: 'send' }), stateKv('Saved state', state), kvPanel('invoke() returned', { status: 'paused', next: 'send' }, { status: 'compare' })], { status: 'paused', next: 'send' });
    r.step('human', 'A person reads the draft before anything is sent', [flow({ paused: 'send' }), logPanel('Draft awaiting review', [{ text: DRAFT, tone: 'active' }]), kvPanel('Choices', { approve: 'resume() unchanged', edit: 'resume({draft: ...})', reject: 'never resume' })], { waiting: 'human' });
    if (decision === 'reject') {
      r.step('human', 'Rejected: the graph is never resumed, so send never runs and no email leaves', [flow({ paused: 'send' }), stateKv('State (final)', { ...state, status: 'cancelled' }, ['status'])], { status: 'cancelled' });
      return { frames: r.frames, result: { status: 'cancelled', state: { ...state, status: 'cancelled' }, trace } };
    }
    const update = decision === 'edit' ? { draft: edit } : {};
    before = state;
    state = { ...state, ...update };
    r.step('human', decision === 'edit' ? `The human edits the draft; resume({draft: "${edit}"}) merges it into the saved state` : 'The human approves: resume() with no changes', [flow({ paused: 'send' }), stateKv('State after the human step', state, changedKeys(before, state))], { decision });
    r.step('continue', 'resume() restarts at send and skips the pause check this once', [flow({ active: 'send' }), stateKv('State', state)], { next: 'send' });
    r.op();
    before = state;
    state = { ...state, status: 'sent' };
    trace.push('send');
    done.push('send');
    r.step('node', `send runs with the human-approved text: "${state.draft}"`, [flow({ active: 'send' }), stateKv('State', state, changedKeys(before, state))], { node: 'send' });
    done.push('END');
    r.step('done', 'Done: the reviewed message was sent', [flow(), stateKv('Final state', state), kvPanel('resume() returned', { status: 'done' }, { status: 'found' })], { status: 'done' });
    return { frames: r.frames, result: { status: 'sent', state, trace } };
  },
  reference(input) {
    const { decision, edit } = setup(input);
    const base = { request: 'refund order 1042', amount: 40, draft: DRAFT };
    if (decision === 'reject') return { status: 'cancelled', state: { ...base, status: 'cancelled' }, trace: ['lookup', 'draft'] };
    return { status: 'sent', state: { ...base, draft: decision === 'edit' ? edit : DRAFT, status: 'sent' }, trace: ['lookup', 'draft', 'send'] };
  },
};

const HARNESS =
  PY_LG_NODES +
  `
def run_hitl(cls, nodes, edges, entry, interrupts, state, updates):
    g = cls()
    for n in nodes:
        g.add_node(n, NODE_LIB[n])
    for a, b in edges:
        g.add_edge(a, b)
    g.set_entry(entry)
    for i in interrupts:
        g.interrupt_before(i)
    out = [g.invoke(state)]
    for u in updates:
        try:
            out.append(g.resume(u))
        except ValueError:
            out.append("ValueError")
    return {"results": out, "trace": list(g.trace)}
`;

const CHAIN = [['upper', 'exclaim'], ['exclaim', 'count'], ['count', 'END']];
const N3 = ['upper', 'exclaim', 'count'];

const tests = [
  { args: [N3, CHAIN, 'upper', ['exclaim'], { text: 'hi' }, [null]], expected: { results: [{ status: 'paused', next: 'exclaim', state: { text: 'HI' } }, { status: 'done', next: null, state: { text: 'HI!', length: 3 } }], trace: ['upper', 'exclaim', 'count'] }, name: 'pause before a node, resume unchanged' },
  { args: [N3, CHAIN, 'upper', ['exclaim'], { text: 'hi' }, [{ text: 'HELLO' }]], expected: { results: [{ status: 'paused', next: 'exclaim', state: { text: 'HI' } }, { status: 'done', next: null, state: { text: 'HELLO!', length: 6 } }], trace: ['upper', 'exclaim', 'count'] }, name: 'the human edit wins over the saved state' },
  { args: [N3, CHAIN, 'upper', [], { text: 'hi' }, []], expected: { results: [{ status: 'done', next: null, state: { text: 'HI!', length: 3 } }], trace: ['upper', 'exclaim', 'count'] }, name: 'no interrupts: runs straight through' },
  { args: [N3, CHAIN, 'upper', ['exclaim', 'count'], { text: 'hi' }, [{ extra: 1 }, { text: 'ok' }]], expected: { results: [{ status: 'paused', next: 'exclaim', state: { text: 'HI' } }, { status: 'paused', next: 'count', state: { text: 'HI!', extra: 1 } }, { status: 'done', next: null, state: { text: 'ok', extra: 1, length: 2 } }], trace: ['upper', 'exclaim', 'count'] }, name: 'two pauses in one run' },
  { args: [['upper', 'exclaim'], [['upper', 'exclaim'], ['exclaim', 'END']], 'upper', ['upper'], { text: 'hi' }, [{ text: 'edited' }]], expected: { results: [{ status: 'paused', next: 'upper', state: { text: 'hi' } }, { status: 'done', next: null, state: { text: 'EDITED!' } }], trace: ['upper', 'exclaim'] }, name: 'pausing before the entry node' },
  { args: [['upper'], [['upper', 'END']], 'upper', [], { text: 'x' }, [null]], expected: { results: [{ status: 'done', next: null, state: { text: 'X' } }, 'ValueError'], trace: ['upper'] }, name: 'resume with nothing paused' },
  { args: [N3, CHAIN, 'upper', ['exclaim'], { text: 'hi' }, [{ text: 'A' }, null]], expected: { results: [{ status: 'paused', next: 'exclaim', state: { text: 'HI' } }, { status: 'done', next: null, state: { text: 'A!', length: 2 } }, 'ValueError'], trace: ['upper', 'exclaim', 'count'] }, name: 'cannot resume twice' },
];

const GRAPH_SOLUTION = `class StateGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.entry = None
        self.interrupts = set()
        self.trace = []
        self._cur = None
        self._state = None

    def add_node(self, name, fn):
        self.nodes[name] = fn

    def add_edge(self, source, target):
        self.edges[source] = target

    def set_entry(self, name):
        self.entry = name

    def interrupt_before(self, name):
        self.interrupts.add(name)

    def _drive(self, skip_check):
        cur, state = self._cur, self._state
        first = skip_check
        while cur != END:
            if cur in self.interrupts and not first:
                self._cur, self._state = cur, state
                return {"status": "paused", "next": cur, "state": state}
            first = False
            update = self.nodes[cur](dict(state))
            state = {**state, **update}
            self.trace.append(cur)
            cur = self.edges[cur]
        self._cur, self._state = END, state
        return {"status": "done", "next": None, "state": state}

    def invoke(self, state):
        self.trace = []
        self._cur, self._state = self.entry, dict(state)
        return self._drive(False)

    def resume(self, update=None):
        if self._cur in (None, END):
            raise ValueError("nothing to resume")
        self._state = {**self._state, **(update or {})}
        return self._drive(True)`;

const unit: Unit = {
  id: 'lg-hitl',
  hook: 'Agents that send emails or move money need a person in the loop. "How do you let a human approve or edit before the next step?" is answered with interrupts: pause, persist the state, wait, merge the human\'s change and resume.',
  predict: {
    prompt: 'A graph is paused before `send`. The reviewer edits the draft and the app calls resume with the new text. Which statement is true?',
    options: ['The graph restarts from the first node', 'The edit is merged into the saved state and execution continues at `send`', 'The edit is ignored because the draft was already computed', 'The earlier nodes run again with the new text'],
    answer: 1,
    explain: 'The pause stored the state and the pointer to the next node. Resume applies the human\'s update to that state and carries on from send; finished nodes are not repeated.',
  },
  viz,
  deeper: {
    points: [
      'interrupt_before(node) makes the run stop just before that node, persist the state and return a "paused" result that names the next node.',
      'A pause is only useful if the state survives: pair interrupts with a checkpointer, so approval can come minutes or days later from another process.',
      'resume(update) merges the human\'s edit into the saved state, then continues at the paused node. It must skip the interrupt check once, or the graph would pause again forever.',
      'Typical uses: approve a dangerous tool call, correct a draft, supply missing input, choose between options.',
      'Rejecting is simply not resuming (or resuming into a cancel branch); nothing after the pause may run.',
    ],
    complexity: { time: 'no extra work while paused', space: 'one saved state per paused thread' },
    pitfalls: ['The human edit is overwritten by the old state during the merge', 'resume pauses again at the same node', 'Allowing resume when nothing is paused', 'Pausing in memory only, so a restart loses pending approvals'],
  },
  practice: {
    language: 'python',
    fnName: 'StateGraph',
    statement:
      'Add interrupts to the tiny graph. `interrupt_before(name)` marks a node. `invoke(state)` runs from the entry and returns {"status", "next", "state"}: "paused" (next = the node it stopped in front of, which has NOT run) or "done" (next = None). `resume(update=None)` merges `update` into the saved state, then continues at the paused node without pausing there again; it raises ValueError if nothing is paused. `self.trace` lists the nodes that ran. Nodes get a copy of the state.',
    signature: 'class StateGraph:',
    solution: GRAPH_SOLUTION.replace('if cur in self.interrupts and not first:', 'if cur in @@self.interrupts@@ and not first:')
      .replace('first = False\n            update', '@@first = False@@\n            update')
      .replace('self._state = {**self._state, **(update or {})}', 'self._state = @@{**self._state, **(update or {})}@@')
      .replace('return self._drive(True)', 'return self._drive(@@True@@)'),
    harness: HARNESS,
    adapter: 'run_hitl',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'StateGraph',
    statement: 'The reviewer edits the draft, but the message that goes out is still the original text. Find the bug.',
    harness: HARNESS,
    adapter: 'run_hitl',
    buggy: GRAPH_SOLUTION.replace('self._state = {**self._state, **(update or {})}', 'self._state = {**(update or {}), **self._state}'),
    fixed: GRAPH_SOLUTION,
    tests,
    bugType: 'merge order',
    hint: 'In `{**a, **b}`, which dict wins when both have the same key?',
    explanation: 'In a dict merge the right-hand side wins. `{**update, **self._state}` lets the old saved state override the human\'s correction, so the edit is silently dropped. Put the update last: `{**self._state, **update}`.',
  },
  boss: {
    title: 'Approval gate',
    statement:
      'Implement `run_approvals(plan, state, decisions)`. `plan` is a list of node names (functions in the global `NODE_LIB`; call each with a copy of the state and merge its update). Nodes in the global set `REQUIRE_APPROVAL` pause BEFORE they run: record the node in `pauses`, then take the next entry of `decisions`. "approve" continues; "reject" (or no decisions left) stops with status "rejected" without running that node; a dict like {"edit": {...}} merges the edit into the state first, then continues. Return {"status": "done" or "rejected", "state", "ran", "pauses"}.',
    language: 'python',
    fnName: 'run_approvals',
    harness:
      PY_LG_NODES +
      `
REQUIRE_APPROVAL = {"exclaim", "count"}
`,
    starter: `def run_approvals(plan, state, decisions):
    # your code here
    pass
`,
    solution: `def run_approvals(plan, state, decisions):
    decisions = list(decisions)
    ran, pauses = [], []
    state = dict(state)
    for name in plan:
        if name in REQUIRE_APPROVAL:
            pauses.append(name)
            d = decisions.pop(0) if decisions else "reject"
            if d == "reject":
                return {"status": "rejected", "state": state, "ran": ran, "pauses": pauses}
            if isinstance(d, dict):
                state = {**state, **d["edit"]}
        state = {**state, **NODE_LIB[name](dict(state))}
        ran.append(name)
    return {"status": "done", "state": state, "ran": ran, "pauses": pauses}`,
    tests: [
      { args: [N3, { text: 'hi' }, ['approve', 'approve']], expected: { status: 'done', state: { text: 'HI!', length: 3 }, ran: ['upper', 'exclaim', 'count'], pauses: ['exclaim', 'count'] }, name: 'approve every gate' },
      { args: [N3, { text: 'hi' }, ['approve', 'reject']], expected: { status: 'rejected', state: { text: 'HI!' }, ran: ['upper', 'exclaim'], pauses: ['exclaim', 'count'] }, name: 'reject at the second gate' },
      { args: [N3, { text: 'hi' }, [{ edit: { text: 'edited' } }, 'approve']], expected: { status: 'done', state: { text: 'edited!', length: 7 }, ran: ['upper', 'exclaim', 'count'], pauses: ['exclaim', 'count'] }, name: 'an edit is applied before the node runs' },
      { args: [N3, { text: 'hi' }, ['reject']], expected: { status: 'rejected', state: { text: 'HI' }, ran: ['upper'], pauses: ['exclaim'] }, name: 'reject at the first gate' },
      { args: [N3, { text: 'hi' }, ['approve']], expected: { status: 'rejected', state: { text: 'HI!' }, ran: ['upper', 'exclaim'], pauses: ['exclaim', 'count'] }, name: 'no decision left counts as reject' },
      { args: [['upper'], { text: 'hi' }, []], expected: { status: 'done', state: { text: 'HI' }, ran: ['upper'], pauses: [] }, name: 'no gate on the plan' },
      { args: [['count', 'upper'], { text: 'hi' }, [{ edit: { text: 'zzz' } }]], expected: { status: 'done', state: { text: 'ZZZ', length: 3 }, ran: ['count', 'upper'], pauses: ['count'] }, name: 'the first node can be gated too' },
    ],
    hints: ['Walk the plan in order. Before running a node that is in `REQUIRE_APPROVAL`, append it to `pauses` and pop the next decision (default to "reject" when the list is empty).', 'For a dict decision merge `d["edit"]` into the state BEFORE running the node; for "reject" return immediately without running it. Remember to pass a copy of the state to node functions.'],
    combines: ['lg-checkpointing', 'lg-conditional'],
  },
  quiz: [
    {
      prompt: 'Why does an interrupt need a checkpointer behind it in production?',
      options: ['Interrupts are faster with a checkpointer', 'The approval may arrive much later, in another process, so the paused state must be stored durably', 'Without it the nodes cannot run', 'Checkpointers pick which human reviews'],
      answer: 1,
      explain: 'A paused graph is just a saved state plus a pointer to the next node. If it lives only in memory a restart loses every pending approval.',
    },
  ],
  simulationNote: LG_NOTE,
};

export default unit;
