import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { AGENT_HARNESS, MOCK_NOTE, RUN_AGENT_HARNESS, flowGraph, kvPanel, logPanel, short, step, type FlowDef } from '@/content/lib/ai-finish-2';

const code = `
def run_agent(llm, tools, question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    for step in range(max_steps):                                   #@loop
        reply = llm.chat(messages, specs(tools))                    #@think
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "steps": step + 1, "stopped": "final"}   #@final
        messages.append(reply)                                      #@keep
        for call in reply["tool_calls"]:
            messages.append(run_tool(tools, call))                  #@act
    return {"answer": None, "steps": max_steps, "stopped": "max_steps"}   #@limit
`;

interface Move {
  thought: string;
  call?: { name: string; args: Record<string, string> };
  final?: string;
}

const SCENARIOS = ['two-hop lookup', 'recover from tool error', 'stuck in a loop', 'direct answer'];

const SCRIPTS: Record<string, { question: string; moves: Move[]; repeatLast?: boolean }> = {
  'two-hop lookup': {
    question: 'How many people live in the capital of France?',
    moves: [
      { thought: 'I need the capital first', call: { name: 'search', args: { q: 'capital of france' } } },
      { thought: 'Now the population of Paris', call: { name: 'search', args: { q: 'population of paris' } } },
      { thought: 'I have everything', final: 'About 2.1 million people live in Paris.' },
    ],
  },
  'recover from tool error': {
    question: 'What is 12 times 7?',
    moves: [
      { thought: 'Use the calculator', call: { name: 'calculator', args: { expr: '12 x 7' } } },
      { thought: 'The tool rejected "x"; use *', call: { name: 'calculator', args: { expr: '12 * 7' } } },
      { thought: 'Got 84', final: '12 times 7 is 84.' },
    ],
  },
  'stuck in a loop': {
    question: 'What is the best database?',
    moves: [{ thought: 'Search again, maybe it works now', call: { name: 'search', args: { q: 'best database' } } }],
    repeatLast: true,
  },
  'direct answer': { question: 'Say hello.', moves: [{ thought: 'No tool needed', final: 'Hello!' }] },
};

const TABLE: Record<string, string> = { 'capital of france': 'Paris', 'population of paris': '2.1 million' };

function runTool(name: string, args: Record<string, string>): { text: string; ok: boolean } {
  if (name === 'search') return { text: TABLE[args.q] ?? 'no results', ok: true };
  if (name === 'calculator') {
    if (!/^[0-9+\-*/ ]+$/.test(args.expr)) return { text: 'error: bad expression', ok: false };
    return { text: String(Function(`"use strict"; return (${args.expr})`)()), ok: true };
  }
  return { text: `error: unknown tool '${name}'`, ok: false };
}

function moveAt(sc: (typeof SCRIPTS)[string], i: number): Move {
  return sc.moves[Math.min(i, sc.moves.length - 1)];
}

interface In {
  scenario: string;
  max_steps: number;
}

const FLOW: FlowDef = {
  title: 'Plan, act, observe',
  width: 640,
  height: 210,
  nodes: [
    { id: 'q', label: 'Question', x: 70, y: 50, w: 96 },
    { id: 'model', label: 'Model', x: 290, y: 50, w: 96 },
    { id: 'tools', label: 'Tools', x: 520, y: 50, w: 96 },
    { id: 'ans', label: 'Answer', x: 290, y: 165, w: 96 },
    { id: 'stop', label: 'max_steps', x: 520, y: 165, w: 96 },
  ],
  edges: [
    { from: 'q', to: 'model' },
    { from: 'model', to: 'tools', label: 'act' },
    { from: 'tools', to: 'model', label: 'observe', curve: 0.45 },
    { from: 'model', to: 'ans', label: 'final' },
    { from: 'model', to: 'stop', label: 'limit', dashed: true },
  ],
};

const viz: VizDef<In> = {
  id: 'agent-react-loop',
  title: 'The ReAct loop with a step limit',
  code,
  language: 'python',
  inputs: [
    { key: 'scenario', label: 'Scenario', kind: 'select', options: SCENARIOS, default: SCENARIOS[0] },
    { key: 'max_steps', label: 'max_steps', kind: 'number', default: 5, help: '1 to 10 model calls' },
  ],
  presets: [
    { label: 'Two-hop lookup', input: { scenario: 'two-hop lookup', max_steps: 5 } },
    { label: 'Tool error, then retry', input: { scenario: 'recover from tool error', max_steps: 5 } },
    { label: 'Stuck loop is capped', input: { scenario: 'stuck in a loop', max_steps: 4 } },
    { label: 'Limit too small', input: { scenario: 'two-hop lookup', max_steps: 2 } },
  ],
  run(input) {
    const sc = SCRIPTS[input.scenario];
    if (!sc) throw new Error('Pick one of: ' + SCENARIOS.join(', '));
    const maxSteps = Math.round(Number(input.max_steps));
    if (!Number.isFinite(maxSteps) || maxSteps < 1 || maxSteps > 10) throw new Error('max_steps must be between 1 and 10.');
    const r = new Recorder(code);
    const trace: { text: string; tone?: Tone }[] = [];
    let stepNo = 0;
    const view = (nodes: Record<string, Tone>, edges: Record<string, Tone>, flow: string[] = []): Panel[] => [
      flowGraph(FLOW, { nodes, edges, flow, badges: { model: `step ${stepNo}/${maxSteps}` } }),
      logPanel('Trace', trace, 7),
      kvPanel('Loop state', { step: stepNo, max_steps: maxSteps, messages: 1 + trace.filter((t) => t.text.startsWith('obs')).length * 2 }),
    ];
    step(r, 'loop', `Start: one user message, up to ${maxSteps} model calls`, view({ q: 'active' }, { 'q>model': 'active' }, ['q>model']), { step: 0, max_steps: maxSteps });
    for (let i = 0; i < maxSteps; i++) {
      stepNo = i + 1;
      const mv = moveAt(sc, i);
      r.op();
      trace.push({ text: `think: ${short(mv.thought, 40)}` });
      step(r, 'think', `Step ${stepNo}/${maxSteps}: model thinks "${short(mv.thought, 40)}"`, view({ model: 'active' }, {}), { step: stepNo });
      if (mv.final !== undefined) {
        trace.push({ text: `final: ${short(mv.final, 40)}`, tone: 'found' });
        step(r, 'final', 'No tool call in the reply: its content is the answer, so the loop returns', view({ model: 'done', ans: 'found' }, { 'model>ans': 'found' }, ['model>ans']), { step: stepNo, stopped: 'final' });
        return { frames: r.frames, result: { answer: mv.final, steps: stepNo, stopped: 'final' } };
      }
      const call = mv.call!;
      trace.push({ text: `act: ${call.name}(${Object.values(call.args).join(', ')})`, tone: 'active' });
      step(r, 'keep', `Model asks for ${call.name}; the request is kept in the history`, view({ model: 'swap', tools: 'frontier' }, { 'model>tools': 'active' }, ['model>tools']), { step: stepNo });
      const out = runTool(call.name, call.args);
      trace.push({ text: `obs: ${short(out.text, 36)}`, tone: out.ok ? 'new' : 'error' });
      step(r, 'act', out.ok ? `Tool returns "${short(out.text, 30)}"; appended as an observation` : `Tool failed ("${short(out.text, 30)}"); the model still sees it`, view({ tools: out.ok ? 'done' : 'error', model: 'compare' }, { 'tools>model': out.ok ? 'found' : 'error' }, ['tools>model']), { step: stepNo, ok: out.ok });
    }
    trace.push({ text: `stop: hit max_steps=${maxSteps}`, tone: 'error' });
    step(r, 'limit', `Out of steps (${maxSteps}): stop with no answer instead of looping forever`, view({ stop: 'error', model: 'muted' }, { 'model>stop': 'error' }, ['model>stop']), { step: maxSteps, stopped: 'max_steps' });
    return { frames: r.frames, result: { answer: null, steps: maxSteps, stopped: 'max_steps' } };
  },
  reference({ scenario, max_steps }) {
    const sc = SCRIPTS[scenario];
    for (let i = 0; i < Math.round(max_steps); i++) {
      const mv = sc.moves[Math.min(i, sc.moves.length - 1)];
      if (mv.final !== undefined) return { answer: mv.final, steps: i + 1, stopped: 'final' };
    }
    return { answer: null, steps: Math.round(max_steps), stopped: 'max_steps' };
  },
};

const RUNTOOL = `
import json

def run_tool(tools, call):
    name = call["name"]
    if name not in tools:
        out = "error: unknown tool '" + name + "'"
    else:
        try:
            out = str(tools[name](**json.loads(call["arguments"])))
        except Exception as exc:
            out = "error: " + str(exc)
    return {"role": "tool", "tool_call_id": call["id"], "content": out}
`;

const STUCK = [{ tool: 'search', args: { q: 'x' } }, { tool: 'search', args: { q: 'x' } }, { tool: 'search', args: { q: 'x' } }, { tool: 'search', args: { q: 'x' } }];
const HOPS = [{ tool: 'search', args: { q: 'capital of france' } }, { tool: 'search', args: { q: 'population of paris' } }, 'About 2.1 million.'];

const unit: Unit = {
  id: 'agent-react-loop',
  hook: 'Every agent is a while-loop around a model call. Interviewers want to hear you name the stop conditions: a final answer, a step limit, and a guard against repeating yourself.',
  predict: {
    prompt: 'An agent keeps calling search("best database") and always gets "no results". Without a step limit, what ends the run?',
    options: ['The model eventually realises and stops', 'The provider cuts the request off after a few calls', 'Nothing: the loop spends tokens until the context window or your budget is exhausted', 'The tool refuses after three identical calls'],
    answer: 2,
    explain: 'The model is only asked "what next?" each time. If its answer is always another tool call, the loop never returns. A max_steps cap (and ideally repeat detection) is your job.',
  },
  viz,
  deeper: {
    points: [
      'ReAct = reason, act, observe: the model writes a thought, requests a tool, then reads the observation on the next call.',
      'Stop conditions: a reply with no tool calls (done), a step limit, a token or time budget, and detecting an identical repeated call.',
      'Each iteration re-sends the whole history, so cost grows roughly quadratically with the number of steps.',
      'Tool errors should be returned as observations, not raised: the model can often correct a bad argument on the next step.',
      'When the limit is hit, return a clear "stopped" reason instead of a half-answer so callers can handle it.',
    ],
    complexity: { time: 'O(steps) model calls', space: 'O(steps) messages' },
    pitfalls: ['Loop without max_steps', 'Not appending the tool result before the next model call', 'Treating a max_steps stop as a successful answer'],
  },
  practice: {
    language: 'python',
    fnName: 'run_agent',
    harness: AGENT_HARNESS + RUN_AGENT_HARNESS,
    adapter: 'run_agent_script',
    statement: 'run_agent(llm, tools, question, max_steps) loops: call llm.chat(messages, specs). No tool_calls: return {"answer", "steps", "stopped": "final"}. Otherwise keep the reply, run each call (unknown name -> "error: unknown tool \'<n>\'", exception -> "error: <msg>", else str(result)) and append tool messages. After max_steps model calls return {"answer": None, "steps": max_steps, "stopped": "max_steps"}.',
    signature: 'def run_agent(llm, tools, question, max_steps=5):',
    solution: `import json

def run_agent(llm, tools, question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    for step in range(@@max_steps@@):
        reply = llm.chat(messages, [{"name": n} for n in tools])
        if @@not reply["tool_calls"]@@:
            return {"answer": reply["content"], "steps": step + 1, "stopped": "final"}
        messages.append(reply)
        for call in reply["tool_calls"]:
            if call["name"] not in tools:
                out = "error: unknown tool '" + call["name"] + "'"
            else:
                try:
                    out = str(tools[call["name"]](**json.loads(call["arguments"])))
                except Exception as exc:
                    out = "error: " + str(exc)
            messages.append(@@{"role": "tool", "tool_call_id": call["id"], "content": out}@@)
    return {"answer": None, "steps": max_steps, "stopped": "max_steps"}`,
    tests: [
      { args: [['Hello!'], 'hi', 5], expected: { out: { answer: 'Hello!', steps: 1, stopped: 'final' }, model_calls: 1, observations: [] }, name: 'direct answer' },
      { args: [HOPS, 'population of the capital of france?', 5], expected: { out: { answer: 'About 2.1 million.', steps: 3, stopped: 'final' }, model_calls: 3, observations: ['Paris', '2.1 million'] }, name: 'two tool hops' },
      { args: [STUCK, 'best database?', 3], expected: { out: { answer: null, steps: 3, stopped: 'max_steps' }, model_calls: 3, observations: ['no results', 'no results'] }, name: 'stops at max_steps' },
      { args: [[{ tool: 'boom', args: {} }, 'Sorry, the tool failed.'], 'try it', 5], expected: { out: { answer: 'Sorry, the tool failed.', steps: 2, stopped: 'final' }, model_calls: 2, observations: ['error: tool crashed'] }, name: 'tool error becomes an observation' },
      { args: [[{ tool: 'launch_missiles', args: {} }, 'I cannot.'], 'launch', 5], expected: { out: { answer: 'I cannot.', steps: 2, stopped: 'final' }, model_calls: 2, observations: ["error: unknown tool 'launch_missiles'"] }, name: 'hallucinated tool' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'run_agent',
    harness: AGENT_HARNESS + RUN_AGENT_HARNESS + RUNTOOL,
    adapter: 'run_agent_script',
    statement: 'run_agent should stop after max_steps model calls and report stopped="max_steps". With a model that never gives a final answer the run crashes instead (the script runs dry).',
    buggy: `def run_agent(llm, tools, question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    step = 0
    while True:
        reply = llm.chat(messages, [{"name": n} for n in tools])
        step += 1
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "steps": step, "stopped": "final"}
        messages.append(reply)
        for call in reply["tool_calls"]:
            messages.append(run_tool(tools, call))
    return {"answer": None, "steps": max_steps, "stopped": "max_steps"}`,
    fixed: `def run_agent(llm, tools, question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    step = 0
    while step < max_steps:
        reply = llm.chat(messages, [{"name": n} for n in tools])
        step += 1
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "steps": step, "stopped": "final"}
        messages.append(reply)
        for call in reply["tool_calls"]:
            messages.append(run_tool(tools, call))
    return {"answer": None, "steps": max_steps, "stopped": "max_steps"}`,
    tests: [
      { args: [['Hello!'], 'hi', 5], expected: { out: { answer: 'Hello!', steps: 1, stopped: 'final' }, model_calls: 1, observations: [] }, name: 'direct answer' },
      { args: [HOPS, 'population?', 5], expected: { out: { answer: 'About 2.1 million.', steps: 3, stopped: 'final' }, model_calls: 3, observations: ['Paris', '2.1 million'] }, name: 'tool hops' },
      { args: [STUCK, 'best database?', 3], expected: { out: { answer: null, steps: 3, stopped: 'max_steps' }, model_calls: 3, observations: ['no results', 'no results'] }, name: 'capped' },
      { args: [STUCK, 'best database?', 1], expected: { out: { answer: null, steps: 1, stopped: 'max_steps' }, model_calls: 1, observations: [] }, name: 'cap of one' },
    ],
    bugType: 'loop without max steps',
    hint: 'The code after the loop mentions max_steps, but can the loop ever finish on its own?',
    explanation: '"while True" never consults max_steps, so a model that keeps requesting tools runs forever (here: until the mock script is exhausted). Loop while step < max_steps so the final return is reachable.',
  },
  boss: {
    title: 'Agent loop with repeat detection',
    statement: 'Write run_agent(llm, tools, question, max_steps). Same loop as before (unknown tool -> "error: unknown tool \'<n>\'", exception -> "error: <msg>", else str(result)) but with three stops: no tool_calls -> stopped "final"; if ANY call in a reply repeats an earlier (name, arguments) pair, stop at once with stopped "repeat", answer None and execute nothing from that reply; after max_steps model calls -> stopped "max_steps", answer None. Return {"answer", "steps", "stopped", "tools_used"} where tools_used lists executed tool names in order.',
    language: 'python',
    fnName: 'run_agent',
    starter: `def run_agent(llm, tools, question, max_steps=5):
    # your code here
    pass
`,
    solution: `import json

def run_agent(llm, tools, question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    seen = set()
    used = []
    for step in range(max_steps):
        reply = llm.chat(messages, [{"name": n} for n in tools])
        if not reply["tool_calls"]:
            return {"answer": reply["content"], "steps": step + 1, "stopped": "final", "tools_used": used}
        if any((c["name"], c["arguments"]) in seen for c in reply["tool_calls"]):
            return {"answer": None, "steps": step + 1, "stopped": "repeat", "tools_used": used}
        messages.append(reply)
        for call in reply["tool_calls"]:
            seen.add((call["name"], call["arguments"]))
            if call["name"] not in tools:
                out = "error: unknown tool '" + call["name"] + "'"
            else:
                used.append(call["name"])
                try:
                    out = str(tools[call["name"]](**json.loads(call["arguments"])))
                except Exception as exc:
                    out = "error: " + str(exc)
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": out})
    return {"answer": None, "steps": max_steps, "stopped": "max_steps", "tools_used": used}`,
    harness: AGENT_HARNESS + RUN_AGENT_HARNESS,
    adapter: 'run_agent_script',
    tests: [
      { args: [['Hi'], 'hello', 5], expected: { out: { answer: 'Hi', steps: 1, stopped: 'final', tools_used: [] }, model_calls: 1, observations: [] }, name: 'direct answer' },
      { args: [HOPS, 'population?', 5], expected: { out: { answer: 'About 2.1 million.', steps: 3, stopped: 'final', tools_used: ['search', 'search'] }, model_calls: 3, observations: ['Paris', '2.1 million'] }, name: 'two hops' },
      { args: [STUCK, 'best database?', 5], expected: { out: { answer: null, steps: 2, stopped: 'repeat', tools_used: ['search'] }, model_calls: 2, observations: ['no results'] }, name: 'repeat is caught on step 2' },
      {
        args: [[{ tool: 'search', args: { q: 'a' } }, { tool: 'search', args: { q: 'b' } }, { tool: 'search', args: { q: 'c' } }, 'x'], 'q', 2],
        expected: { out: { answer: null, steps: 2, stopped: 'max_steps', tools_used: ['search', 'search'] }, model_calls: 2, observations: ['no results'] },
        name: 'different calls still hit max_steps',
      },
      { args: [[{ tool: 'launch_missiles', args: {} }, 'no'], 'launch', 5], expected: { out: { answer: 'no', steps: 2, stopped: 'final', tools_used: [] }, model_calls: 2, observations: ["error: unknown tool 'launch_missiles'"] }, name: 'unknown tools are not counted as used' },
    ],
    hints: ['Keep a set of (name, arguments) pairs. Check the whole reply against it before running anything.', 'Return from inside the loop for "final" and "repeat"; the line after the loop handles max_steps.'],
    combines: ['agent-tool-calling'],
  },
  quiz: [
    {
      prompt: 'Which is the best response when a tool call fails with a validation error?',
      options: ['Crash the run', 'Return the error text as the observation so the model can correct its arguments', 'Silently retry the identical call forever', 'Ignore the call and answer anyway'],
      answer: 1,
      explain: 'Errors are information. The model sees the message on its next step and can fix the argument, while the step limit protects you if it cannot.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
