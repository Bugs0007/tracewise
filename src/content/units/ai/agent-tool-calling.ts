import { Recorder } from '@/engine/recorder';
import type { ListItem, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { AGENT_HARNESS, ECHO_LLM_HARNESS, MOCK_NOTE, Seq, short, step } from '@/content/lib/ai-mcp-agents';

const code = `
def run_turn(llm, tools, question):
    messages = [{"role": "user", "content": question}]
    reply = llm.chat(messages, tool_specs(tools))         #@ask
    if not reply["tool_calls"]:
        return reply["content"]                               #@direct
    messages.append(reply)                                    #@keep
    for call in reply["tool_calls"]:
        messages.append(execute_call(tools, call))            #@exec
    final = llm.chat(messages, tool_specs(tools))         #@again
    return final["content"]                                   #@final
`;

const SCENARIOS = ['one tool call', 'two parallel calls', 'hallucinated tool', 'no tool needed'];

interface Call {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface Scenario {
  question: string;
  calls: Call[];
  answer: (results: string[]) => string;
}

const WEATHER: Record<string, string> = { Paris: 'sunny, 21C', Oslo: 'snow, -3C' };
const IMPLS: Record<string, (a: Record<string, unknown>) => string> = {
  get_weather: (a) => WEATHER[String(a.city)] ?? 'unknown city',
  add: (a) => String(Number(a.a) + Number(a.b)),
};

const PLANS: Record<string, Scenario> = {
  'one tool call': { question: 'What is the weather in Paris?', calls: [{ id: 'call_1', name: 'get_weather', args: { city: 'Paris' } }], answer: (r) => `It is ${r[0]} in Paris.` },
  'two parallel calls': {
    question: 'Weather in Paris and Oslo?',
    calls: [
      { id: 'call_1', name: 'get_weather', args: { city: 'Paris' } },
      { id: 'call_2', name: 'get_weather', args: { city: 'Oslo' } },
    ],
    answer: (r) => `Paris: ${r[0]}. Oslo: ${r[1]}.`,
  },
  'hallucinated tool': { question: 'Launch the rockets.', calls: [{ id: 'call_1', name: 'launch_missiles', args: { target: 'moon' } }], answer: () => 'Sorry, I have no tool that can do that.' },
  'no tool needed': { question: 'Say hello.', calls: [], answer: () => 'Hello!' },
};

interface In {
  scenario: string;
}

function execute(call: Call): { content: string; ok: boolean } {
  const fn = IMPLS[call.name];
  if (!fn) return { content: `error: unknown tool '${call.name}'`, ok: false };
  return { content: fn(call.args), ok: true };
}

const viz: VizDef<In> = {
  id: 'agent-tool-calling',
  title: 'Tool calling: model emits, runtime executes',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Scenario', kind: 'select', options: SCENARIOS, default: SCENARIOS[0] }],
  presets: SCENARIOS.map((s) => ({ label: s, input: { scenario: s } })),
  run({ scenario }) {
    const plan = PLANS[scenario];
    if (!plan) throw new Error('Pick one of: ' + SCENARIOS.join(', '));
    const r = new Recorder(code);
    const seq = new Seq(['User', 'Runtime', 'Model', 'Tools'], 'One turn');
    const msgs: ListItem[] = [];
    const view = () => [seq.panel(), { type: 'list' as const, title: 'messages sent to the model', orientation: 'vertical' as const, items: msgs.map((m) => ({ ...m })), emptyText: '(none)' }];

    seq.send('User', 'Runtime', short(plan.question, 40));
    msgs.push({ id: 'm0', label: 'user: ' + short(plan.question, 34), tone: 'default' });
    r.op();
    step(r, 'ask', 'The runtime starts a message list with the question and calls the model', view(), { messages: msgs.length });
    seq.send('Runtime', 'Model', `chat(${msgs.length} message, tools)`);
    if (plan.calls.length === 0) {
      step(r, 'ask', 'The model sees the question and the available tool schemas, and decides whether it needs any', view(), { tools_offered: 3 });
      seq.send('Model', 'Runtime', plan.answer([]), 'found', true);
      msgs.push({ id: 'm1', label: 'assistant: ' + plan.answer([]), tone: 'found' });
      step(r, 'direct', 'No tool_calls in the reply, so its content is the final answer', view(), { tool_calls: 0 });
      return { frames: r.frames, result: { answer: plan.answer([]), executed: [] as string[], errors: 0 } };
    }
    seq.send('Model', 'Runtime', plan.calls.map((c) => c.name).join(' + ') + ' (tool_calls)', 'active', true);
    msgs.push({ id: 'm1', label: 'assistant: tool_calls=[' + plan.calls.map((c) => c.name).join(', ') + ']', tone: 'active' });
    step(r, 'keep', 'The model does not run anything; it only asks. The assistant message is kept in history', view(), { tool_calls: plan.calls.length });
    const results: string[] = [];
    const executed: string[] = [];
    let errors = 0;
    plan.calls.forEach((c, i) => {
      r.op();
      const out = execute(c);
      seq.send('Runtime', 'Tools', out.ok ? `${c.name}(${JSON.stringify(c.args)})` : `lookup "${c.name}"`, out.ok ? 'default' : 'error');
      if (out.ok) {
        executed.push(c.name);
        seq.send('Tools', 'Runtime', out.content, 'done', true);
      } else {
        errors++;
        seq.send('Tools', 'Runtime', `not found: ${c.name} (not executed)`, 'error', true);
      }
      results.push(out.content);
      msgs.push({ id: 'm' + (2 + i), label: `tool(${c.id}): ${short(out.content, 30)}`, tone: out.ok ? ('new' as Tone) : 'error' });
      step(r, 'exec', out.ok ? `Runtime runs ${c.name} and stores the result as a tool message` : `"${c.name}" is not in the registry: report an error, do not execute`, view(), { call: c.name, ok: out.ok });
    });
    seq.send('Runtime', 'Model', `chat(${msgs.length} messages)`);
    step(r, 'again', 'Tool messages are sent back; without them the model could not know the results', view(), { messages: msgs.length });
    const answer = plan.answer(results);
    seq.send('Model', 'User', answer, 'found', true);
    msgs.push({ id: 'mf', label: 'assistant: ' + short(answer, 32), tone: 'found' });
    step(r, 'final', 'The model reads the tool results and writes the final answer', view(), { answer: short(answer, 40) });
    return { frames: r.frames, result: { answer, executed, errors } };
  },
  reference({ scenario }) {
    const plan = PLANS[scenario];
    const outs = plan.calls.map(execute);
    return { answer: plan.answer(outs.map((o) => o.content)), executed: plan.calls.filter((_, i) => outs[i].ok).map((c) => c.name), errors: outs.filter((o) => !o.ok).length };
  },
};

const unit: Unit = {
  id: 'agent-tool-calling',
  hook: 'Tool calling is the loop every agent is built on. Interviewers check that you know the model only requests tools; your runtime runs them, validates names and feeds the results back.',
  predict: {
    prompt: 'A model replies with tool_calls=[get_weather(city="Paris")]. What has happened to the weather so far?',
    options: ['It was fetched by the model', 'Nothing: the runtime must execute the tool and send the result back', 'The provider ran it automatically', 'It is cached in the model weights'],
    answer: 1,
    explain: 'The model only produces text that describes a call. Your code looks the tool up, runs it, appends a tool message and calls the model again.',
  },
  viz,
  deeper: {
    points: [
      'The runtime sends messages plus tool schemas; the model replies with either content or tool_calls (name, JSON-string arguments, id).',
      'Keep the assistant message with its tool_calls in the history, then append one tool message per call with the matching tool_call_id.',
      'Several calls in one reply are independent and may run in parallel; return results keyed by id.',
      'Model output is untrusted input: look the name up in your registry, parse the arguments, and answer unknown tools with an error message rather than executing anything.',
      'Errors are information: put the error text in the tool message so the model can retry or apologise.',
    ],
    pitfalls: ['Forgetting to append the tool result before calling the model again', 'Executing whatever name the model produced', 'Letting a crashing tool take down the whole turn'],
  },
  practice: {
    language: 'python',
    fnName: 'execute_call',
    harness: AGENT_HARNESS + `
def run_exec(fn, call):
    return fn(TOOLS, call)
`,
    adapter: 'run_exec',
    statement: 'execute_call(tools, call) runs one tool call. call is {"id", "name", "arguments": JSON string}; tools maps names to Python functions. Return {"role": "tool", "tool_call_id": id, "content": text}. Unknown names give content "error: unknown tool \'<name>\'" (nothing is executed); an exception gives "error: <message>"; otherwise content is str(result).',
    signature: 'def execute_call(tools, call):',
    solution: `import json

def execute_call(tools, call):
    name = call["name"]
    if @@name not in tools@@:
        content = "error: unknown tool '" + name + "'"
    else:
        try:
            content = str(@@tools[name](**json.loads(call["arguments"]))@@)
        except Exception as exc:
            content = @@"error: " + str(exc)@@
    return {"role": "tool", "tool_call_id": call["id"], "content": content}`,
    tests: [
      { args: [{ id: 'c1', name: 'get_weather', arguments: '{"city": "Paris"}' }], expected: { role: 'tool', tool_call_id: 'c1', content: 'sunny, 21C' }, name: 'known tool' },
      { args: [{ id: 'c2', name: 'add', arguments: '{"a": 2, "b": 3}' }], expected: { role: 'tool', tool_call_id: 'c2', content: '5' }, name: 'result is stringified' },
      { args: [{ id: 'c3', name: 'launch_missiles', arguments: '{}' }], expected: { role: 'tool', tool_call_id: 'c3', content: "error: unknown tool 'launch_missiles'" }, name: 'hallucinated tool' },
      { args: [{ id: 'c4', name: 'boom', arguments: '{}' }], expected: { role: 'tool', tool_call_id: 'c4', content: 'error: tool crashed' }, name: 'tool raises' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'run_once',
    harness: AGENT_HARNESS + ECHO_LLM_HARNESS + `
def run_echo(fn, question):
    llm = MockLLM(echo_model)
    return fn(llm, TOOLS, question)
`,
    adapter: 'run_echo',
    statement: 'run_once(llm, tools, question) does one tool-calling turn and returns the final text. The model answers "Answer: <tool result>" once it can see a tool message, but for tool questions it returns None.',
    buggy: `import json

def execute_call(tools, call):
    name = call["name"]
    if name not in tools:
        content = "error: unknown tool '" + name + "'"
    else:
        content = str(tools[name](**json.loads(call["arguments"])))
    return {"role": "tool", "tool_call_id": call["id"], "content": content}

def run_once(llm, tools, question):
    messages = [{"role": "user", "content": question}]
    specs = [{"name": n} for n in tools]
    reply = llm.chat(messages, specs)
    if not reply["tool_calls"]:
        return reply["content"]
    messages.append(reply)
    for call in reply["tool_calls"]:
        execute_call(tools, call)
    final = llm.chat(messages, specs)
    return final["content"]`,
    fixed: `import json

def execute_call(tools, call):
    name = call["name"]
    if name not in tools:
        content = "error: unknown tool '" + name + "'"
    else:
        content = str(tools[name](**json.loads(call["arguments"])))
    return {"role": "tool", "tool_call_id": call["id"], "content": content}

def run_once(llm, tools, question):
    messages = [{"role": "user", "content": question}]
    specs = [{"name": n} for n in tools]
    reply = llm.chat(messages, specs)
    if not reply["tool_calls"]:
        return reply["content"]
    messages.append(reply)
    for call in reply["tool_calls"]:
        messages.append(execute_call(tools, call))
    final = llm.chat(messages, specs)
    return final["content"]`,
    tests: [
      { args: ['what is the weather?'], expected: 'Answer: sunny, 21C', name: 'weather tool' },
      { args: ['please add them'], expected: 'Answer: 5', name: 'add tool' },
      { args: ['hello there'], expected: 'I can answer that directly.', name: 'no tool needed' },
      { args: ['launch it'], expected: "Answer: error: unknown tool 'launch_missiles'", name: 'hallucinated tool is reported back' },
    ],
    bugType: 'tool result not passed back',
    hint: 'What does the second llm.chat call actually receive? Does it contain the tool output?',
    explanation: 'execute_call computed the result but nothing stored it, so the second model call saw the same messages as the first and asked for the tool again. Append each tool message to the history before calling the model again.',
  },
  boss: {
    title: 'Parallel-safe tool turn',
    statement: 'Write run_turn(llm, tools, question). Send [user message] to llm.chat(messages, tool_list). With no tool_calls return {"answer": content, "tool_messages": []}. Otherwise append the assistant reply, run EVERY call (arguments are JSON strings; unknown name -> content "error: unknown tool \'<name>\'"; exception -> "error: <message>"; else str(result)), build one {"role": "tool", "tool_call_id", "content"} message per call in order, append them all, call the model once more and return {"answer": final content, "tool_messages": [...]}. A failing call must not stop the others.',
    language: 'python',
    fnName: 'run_turn',
    harness: AGENT_HARNESS + `
def run_script(fn, script, question):
    llm = mk_llm(script)
    out = fn(llm, TOOLS, question)
    return {"out": out, "model_calls": len(llm.calls), "last_roles": [m["role"] for m in llm.calls[-1]["messages"]]}
`,
    adapter: 'run_script',
    starter: `import json

def run_turn(llm, tools, question):
    # your code here
    pass
`,
    solution: `import json

def run_turn(llm, tools, question):
    messages = [{"role": "user", "content": question}]
    reply = llm.chat(messages, [{"name": n} for n in tools])
    if not reply["tool_calls"]:
        return {"answer": reply["content"], "tool_messages": []}
    messages.append(reply)
    tool_messages = []
    for call in reply["tool_calls"]:
        name = call["name"]
        if name not in tools:
            content = "error: unknown tool '" + name + "'"
        else:
            try:
                content = str(tools[name](**json.loads(call["arguments"])))
            except Exception as exc:
                content = "error: " + str(exc)
        tool_messages.append({"role": "tool", "tool_call_id": call["id"], "content": content})
    messages.extend(tool_messages)
    final = llm.chat(messages, [{"name": n} for n in tools])
    return {"answer": final["content"], "tool_messages": tool_messages}`,
    tests: [
      { args: [['Hi!'], 'hello'], expected: { out: { answer: 'Hi!', tool_messages: [] }, model_calls: 1, last_roles: ['user'] }, name: 'no tool needed' },
      {
        args: [[{ calls: [{ id: 'c1', name: 'get_weather', args: { city: 'Paris' } }, { id: 'c2', name: 'add', args: { a: 2, b: 3 } }] }, 'Paris is sunny and 2+3=5'], 'weather and sum'],
        expected: { out: { answer: 'Paris is sunny and 2+3=5', tool_messages: [{ role: 'tool', tool_call_id: 'c1', content: 'sunny, 21C' }, { role: 'tool', tool_call_id: 'c2', content: '5' }] }, model_calls: 2, last_roles: ['user', 'assistant', 'tool', 'tool'] },
        name: 'parallel calls',
      },
      {
        args: [[{ calls: [{ id: 'x', name: 'hack', args: {} }, { id: 'y', name: 'boom', args: {} }, { id: 'z', name: 'add', args: { a: 1, b: 1 } }] }, 'Sorry'], 'do things'],
        expected: { out: { answer: 'Sorry', tool_messages: [{ role: 'tool', tool_call_id: 'x', content: "error: unknown tool 'hack'" }, { role: 'tool', tool_call_id: 'y', content: 'error: tool crashed' }, { role: 'tool', tool_call_id: 'z', content: '2' }] }, model_calls: 2, last_roles: ['user', 'assistant', 'tool', 'tool', 'tool'] },
        name: 'failures do not stop other calls',
      },
      { args: [[{ tool: 'search', args: { q: 'capital of france' } }, 'Paris'], 'capital?'], expected: { out: { answer: 'Paris', tool_messages: [{ role: 'tool', tool_call_id: 'call_search', content: 'Paris' }] }, model_calls: 2, last_roles: ['user', 'assistant', 'tool'] }, name: 'single call' },
    ],
    hints: ['Keep one messages list: user, then the assistant reply, then one tool message per call, then call the model again.', 'Wrap each call in its own try/except so one failure only produces an error message for that call.'],
    combines: ['mcp-tool-call'],
  },
  quiz: [
    {
      prompt: 'The model returns two tool calls with ids c1 and c2. How must the results be returned?',
      options: ['One merged string in a user message', 'Two tool messages, each carrying the matching tool_call_id', 'Only the first one, the second is ignored', 'As a system prompt'],
      answer: 1,
      explain: 'Each tool message references the id of the call it answers, which lets the model pair results with requests even when they finish in a different order.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
