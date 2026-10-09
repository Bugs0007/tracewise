import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, Seq, kvPanel, logPanel, short, step, timelinePanel } from '@/content/lib/ai-finish-2';

const code = `
def validate_args(schema, args):
    errors = [f"missing: {k}" for k in schema["required"] if k not in args]    #@missing
    for key, value in args.items():
        spec = schema["properties"].get(key)
        if spec is None:
            errors.append(f"unknown: {key}")                                   #@unknown
        elif not type_ok(value, spec["type"]):
            errors.append(f"type: {key} must be {spec['type']}")               #@type
        elif "enum" in spec and value not in spec["enum"]:
            errors.append(f"enum: {key} must be one of " + ", ".join(spec["enum"]))   #@enum
    return errors

def run_calls(calls, tools, schemas):
    messages = []
    for call in calls:                                                         #@each
        errors = validate_args(schemas[call["name"]], call["args"])
        if errors:
            messages.append(tool_msg(call, "error: " + "; ".join(errors)))     #@reject
        else:
            messages.append(tool_msg(call, tools[call["name"]](**call["args"])))   #@exec
    return messages
`;

interface Spec {
  type: string;
  enum?: string[];
}
interface Schema {
  properties: Record<string, Spec>;
  required: string[];
}
interface Call {
  name: string;
  args: Record<string, unknown>;
}

const WEATHER_SCHEMA: Schema = {
  properties: { city: { type: 'string' }, unit: { type: 'string', enum: ['celsius', 'fahrenheit'] } },
  required: ['city'],
};

function typeOk(v: unknown, kind: string): boolean {
  if (kind === 'string') return typeof v === 'string';
  if (kind === 'boolean') return typeof v === 'boolean';
  if (kind === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if (kind === 'number') return typeof v === 'number';
  return false;
}

function validateArgs(schema: Schema, args: Record<string, unknown>): string[] {
  const errors = schema.required.filter((k) => !(k in args)).map((k) => `missing: ${k}`);
  for (const [key, value] of Object.entries(args)) {
    const spec = schema.properties[key];
    if (!spec) errors.push(`unknown: ${key}`);
    else if (!typeOk(value, spec.type)) errors.push(`type: ${key} must be ${spec.type}`);
    else if (spec.enum && !spec.enum.includes(value as string)) errors.push(`enum: ${key} must be one of ${spec.enum.join(', ')}`);
  }
  return errors;
}

const WEATHER: Record<string, { text: string; ms: number }> = {
  Paris: { text: 'sunny, 21C', ms: 300 },
  Oslo: { text: 'snow, -3C', ms: 500 },
  Berlin: { text: 'cloudy, 14C', ms: 200 },
};

const SCENARIOS: Record<string, { first: Call[]; repaired?: Call[] }> = {
  'valid call': { first: [{ name: 'get_weather', args: { city: 'Paris', unit: 'celsius' } }] },
  'missing argument': { first: [{ name: 'get_weather', args: { unit: 'celsius' } }], repaired: [{ name: 'get_weather', args: { city: 'Paris', unit: 'celsius' } }] },
  'wrong type': { first: [{ name: 'get_weather', args: { city: 42 } }], repaired: [{ name: 'get_weather', args: { city: 'Oslo' } }] },
  'bad enum value': { first: [{ name: 'get_weather', args: { city: 'Paris', unit: 'kelvin' } }], repaired: [{ name: 'get_weather', args: { city: 'Paris', unit: 'celsius' } }] },
  'three parallel calls': { first: [{ name: 'get_weather', args: { city: 'Paris' } }, { name: 'get_weather', args: { city: 'Oslo' } }, { name: 'get_weather', args: { city: 'Berlin' } }] },
};
const NAMES = Object.keys(SCENARIOS);

interface In {
  scenario: string;
}

const viz: VizDef<In> = {
  id: 'ai-function-calling',
  title: 'Function calling: validate before you run',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Scenario', kind: 'select', options: NAMES, default: NAMES[1] }],
  presets: NAMES.map((n) => ({ label: n, input: { scenario: n } })),
  run({ scenario }) {
    const sc = SCENARIOS[scenario];
    if (!sc) throw new Error('Pick one of: ' + NAMES.join(', '));
    const r = new Recorder(code);
    const seq = new Seq(['Model', 'Runtime', 'Tool'], 'Tool call lifecycle');
    const log: { text: string; tone?: Tone }[] = [];
    let ran = 0;
    let rejected = 0;
    const fmt = (c: Call) => `${c.name}(${Object.entries(c.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})`;
    const view = (extra: Panel[] = []): Panel[] => [seq.panel(8), logPanel('Tool messages', log, 5), ...extra];
    const exec = (c: Call): { text: string; ms: number } => WEATHER[String(c.args.city)] ?? { text: 'unknown city', ms: 100 };
    const handle = (calls: Call[]): number[] => {
      const durations: number[] = [];
      calls.forEach((c, i) => {
        r.op();
        const errors = validateArgs(WEATHER_SCHEMA, c.args);
        seq.send('Model', 'Runtime', short(fmt(c), 42));
        step(r, 'each', `Runtime checks call ${i + 1} of ${calls.length}: ${short(fmt(c), 44)}`, view(), { call: i + 1 });
        if (errors.length) {
          rejected++;
          const msg = 'error: ' + errors.join('; ');
          seq.send('Runtime', 'Model', short(msg, 44), 'error', true);
          log.push({ text: short(msg, 56), tone: 'error' });
          step(r, 'reject', `Invalid arguments (${short(errors[0], 40)}): the tool is not run`, view(), { errors: errors.length });
          return;
        }
        const out = exec(c);
        ran++;
        durations.push(out.ms);
        seq.send('Runtime', 'Tool', short(fmt(c), 40));
        seq.send('Tool', 'Runtime', out.text, 'done', true);
        log.push({ text: `${c.args.city}: ${out.text}`, tone: 'found' });
        step(r, 'exec', `Valid: ${c.name} runs and returns "${out.text}"`, view(), { ran });
      });
      return durations;
    };
    step(r, 'each', `Model replies with ${sc.first.length} tool call${sc.first.length > 1 ? 's' : ''}; nothing has run yet`, view(), { calls: sc.first.length });
    const first = handle(sc.first);
    let parallel = 0;
    let sequential = 0;
    if (sc.repaired) {
      seq.send('Model', 'Runtime', 'retry with corrected args', 'active');
      step(r, 'each', 'The error text goes back as the tool message; the model corrects its call', view(), { rejected });
      handle(sc.repaired);
    }
    if (first.length > 1) {
      sequential = first.reduce((a, b) => a + b, 0);
      parallel = Math.max(...first);
      let t = 0;
      const seqLanes = first.map((ms, i) => {
        const lane = { label: `call ${i + 1}`, events: [{ t, dur: ms, label: `${ms}ms`, tone: 'visited' as Tone }] };
        t += ms;
        return lane;
      });
      step(r, 'each', `One after another the three calls take ${sequential} ms`, view([timelinePanel('Sequential', seqLanes, sequential, sequential)]), { sequential_ms: sequential });
      const parLanes = first.map((ms, i) => ({ label: `call ${i + 1}`, events: [{ t: 0, dur: ms, label: `${ms}ms`, tone: 'found' as Tone }] }));
      step(r, 'exec', `The calls are independent, so run them in parallel: ${parallel} ms`, view([timelinePanel('Parallel', parLanes, sequential, parallel), kvPanel('Latency', { sequential: sequential + ' ms', parallel: parallel + ' ms' }, { parallel: 'found' })]), { parallel_ms: parallel });
    }
    step(r, ran ? 'exec' : 'reject', `Tool messages go back to the model: ${ran} ran, ${rejected} rejected`, view([kvPanel('Summary', { ran, rejected })]), { ran, rejected });
    return { frames: r.frames, result: { ran, rejected, parallel_ms: parallel, sequential_ms: sequential } };
  },
  reference({ scenario }) {
    const sc = SCENARIOS[scenario];
    const all = [...sc.first, ...(sc.repaired ?? [])];
    const valid = all.filter((c) => validateArgs(WEATHER_SCHEMA, c.args).length === 0);
    const ms = sc.first.filter((c) => validateArgs(WEATHER_SCHEMA, c.args).length === 0).map((c) => WEATHER[String(c.args.city)]?.ms ?? 100);
    return {
      ran: valid.length,
      rejected: all.length - valid.length,
      parallel_ms: sc.first.length > 1 ? Math.max(...ms) : 0,
      sequential_ms: sc.first.length > 1 ? ms.reduce((a, b) => a + b, 0) : 0,
    };
  },
};

const VALIDATE_SOLUTION = `def type_ok(value, kind):
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return False

def validate_args(schema, args):
    errors = ["missing: " + k for k in schema["required"] if k not in args]
    for key, value in args.items():
        spec = schema["properties"].get(key)
        if spec is None:
            errors.append("unknown: " + key)
        elif not type_ok(value, spec["type"]):
            errors.append("type: " + key + " must be " + spec["type"])
        elif "enum" in spec and value not in spec["enum"]:
            errors.append("enum: " + key + " must be one of " + ", ".join(spec["enum"]))
    return errors
`;

const SCHEMAS_PY = `
SCHEMAS = {
    "get_weather": {"properties": {"city": {"type": "string"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}}, "required": ["city"]},
    "add": {"properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
    "boom": {"properties": {}, "required": []},
}

def _boom():
    raise RuntimeError("tool crashed")

TOOLS3 = {
    "get_weather": lambda city, unit="celsius": {"Paris": "sunny, 21C", "Oslo": "snow, -3C"}.get(city, "unknown city"),
    "add": lambda a, b: a + b,
    "boom": _boom,
}
DURATIONS = {"get_weather": 300, "add": 50, "boom": 100}
`;

const W = { properties: { city: { type: 'string' }, unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }, days: { type: 'integer' }, hourly: { type: 'boolean' }, temp: { type: 'number' } }, required: ['city'] };

const unit: Unit = {
  id: 'ai-function-calling',
  hook: 'Function calling is where LLM apps meet real systems. Interviewers expect schemas, strict argument validation, errors fed back to the model, and parallel execution of independent calls.',
  predict: {
    prompt: 'The model calls get_weather with {"city": 42}. The schema says city is a string. What should the runtime do?',
    options: ['Run the tool anyway; Python will cope', 'Reject it with a clear error message and return that as the tool result so the model can retry', 'Silently convert 42 to "42"', 'Crash the whole conversation'],
    answer: 1,
    explain: 'Arguments are model output and therefore untrusted. Validating against the schema and returning the error text lets the model correct itself without running anything.',
  },
  viz,
  deeper: {
    points: [
      'A tool is a name, a description and a JSON Schema for its arguments; the schema is part of the prompt the model reads.',
      'Validate required fields, types, enums and unknown keys before executing, and return all errors in one message.',
      'Independent calls in one model reply can run concurrently; total latency is the slowest call, not the sum.',
      'Look tools up in an explicit registry. Never dispatch through globals(), eval or getattr on model-provided names.',
      'Return errors as tool messages, tagged with the call id, so the model can fix its arguments.',
    ],
    pitfalls: ['Executing before validating', 'Dispatching a hallucinated name through globals()', 'Treating True as an integer or a number'],
  },
  practice: {
    language: 'python',
    fnName: 'validate_args',
    statement: 'validate_args(schema, args) returns a list of error strings. First "missing: <k>" for each required key absent from args (in required order). Then for each arg in order: not in schema["properties"] -> "unknown: <k>"; wrong type (string, boolean, integer, number; a bool is neither integer nor number) -> "type: <k> must be <type>"; value not in its enum -> "enum: <k> must be one of a, b".',
    signature: 'def validate_args(schema, args):',
    solution: `def type_ok(value, kind):
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "integer":
        return @@isinstance(value, int) and not isinstance(value, bool)@@
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return False

def validate_args(schema, args):
    errors = ["missing: " + k for k in @@schema["required"]@@ if k not in args]
    for key, value in args.items():
        spec = schema["properties"].get(key)
        if spec is None:
            errors.append("unknown: " + key)
        elif not type_ok(value, spec["type"]):
            errors.append("type: " + key + " must be " + spec["type"])
        elif "enum" in spec and @@value not in spec["enum"]@@:
            errors.append("enum: " + key + " must be one of " + ", ".join(spec["enum"]))
    return errors`,
    tests: [
      { args: [W, { city: 'Paris', unit: 'celsius', days: 3, hourly: false, temp: 1.5 }], expected: [], name: 'all valid' },
      { args: [W, { unit: 'celsius' }], expected: ['missing: city'], name: 'missing required' },
      { args: [W, { city: 42 }], expected: ['type: city must be string'], name: 'wrong type' },
      { args: [W, { city: 'Paris', unit: 'kelvin' }], expected: ['enum: unit must be one of celsius, fahrenheit'], name: 'bad enum' },
      { args: [W, { city: 'Paris', mood: 'happy' }], expected: ['unknown: mood'], name: 'unknown argument' },
      { args: [W, { city: 'Paris', days: true, hourly: 'yes' }], expected: ['type: days must be integer', 'type: hourly must be boolean'], name: 'bool is not an integer' },
      { args: [W, { days: 2.5, temp: 'warm' }], expected: ['missing: city', 'type: days must be integer', 'type: temp must be number'], name: 'missing first, then in arg order' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'execute_call',
    harness: `
DANGER = []

def delete_all():
    DANGER.append("deleted")
    return "deleted"

TOOLS2 = {"get_weather": lambda city: {"Paris": "sunny, 21C"}.get(city, "unknown city")}

def run_dispatch(fn, call):
    DANGER.clear()
    out = fn(call, TOOLS2)
    return {"out": out, "danger": list(DANGER)}
`,
    adapter: 'run_dispatch',
    statement: 'execute_call(call, tools) runs call {"name", "args"} and returns str(result), or "error: unknown tool \'<name>\'" if the name is not in tools. A model-invented name like "delete_all" actually gets executed.',
    buggy: `def execute_call(call, tools):
    fn = tools.get(call["name"]) or globals().get(call["name"])
    if fn is None:
        return "error: unknown tool '" + call["name"] + "'"
    return str(fn(**call["args"]))`,
    fixed: `def execute_call(call, tools):
    fn = tools.get(call["name"])
    if fn is None:
        return "error: unknown tool '" + call["name"] + "'"
    return str(fn(**call["args"]))`,
    tests: [
      { args: [{ name: 'get_weather', args: { city: 'Paris' } }], expected: { out: 'sunny, 21C', danger: [] }, name: 'registered tool' },
      { args: [{ name: 'delete_all', args: {} }], expected: { out: "error: unknown tool 'delete_all'", danger: [] }, name: 'hallucinated name must not run' },
      { args: [{ name: 'rm_rf', args: {} }], expected: { out: "error: unknown tool 'rm_rf'", danger: [] }, name: 'unknown name' },
    ],
    bugType: 'executing a hallucinated tool name',
    hint: 'Where else does the lookup search besides the tools registry?',
    explanation: 'Falling back to globals() makes every function in the module callable by the model. Only names in the explicit registry may run; anything else is an error message.',
  },
  boss: {
    title: 'Batch tool runner with validation',
    statement: 'Write run_calls(calls, tools, schemas, durations). Each call is {"id", "name", "args"}. For each call in order build {"role": "tool", "tool_call_id": id, "content": text}: unknown tool name -> "error: unknown tool \'<name>\'"; otherwise errors = validate_args(schemas[name], args) (provided) -> if any, "error: " + "; ".join(errors) and do not run; otherwise str(tools[name](**args)), or "error: <message>" if it raises. Return {"messages": [...], "parallel_ms": max duration (durations[name]) of the calls that were actually run (0 if none), "sequential_ms": their sum}.',
    language: 'python',
    fnName: 'run_calls',
    harness: VALIDATE_SOLUTION + SCHEMAS_PY + `
def run_batch(fn, calls):
    return fn(calls, TOOLS3, SCHEMAS, DURATIONS)
`,
    adapter: 'run_batch',
    starter: `def run_calls(calls, tools, schemas, durations):
    # validate_args(schema, args) is available
    pass
`,
    solution: `def run_calls(calls, tools, schemas, durations):
    messages = []
    ran = []
    for call in calls:
        name = call["name"]
        if name not in tools:
            content = "error: unknown tool '" + name + "'"
        else:
            errors = validate_args(schemas[name], call["args"])
            if errors:
                content = "error: " + "; ".join(errors)
            else:
                ran.append(durations[name])
                try:
                    content = str(tools[name](**call["args"]))
                except Exception as exc:
                    content = "error: " + str(exc)
        messages.append({"role": "tool", "tool_call_id": call["id"], "content": content})
    return {"messages": messages, "parallel_ms": max(ran) if ran else 0, "sequential_ms": sum(ran)}`,
    tests: [
      {
        args: [[{ id: 'c1', name: 'get_weather', args: { city: 'Paris' } }, { id: 'c2', name: 'add', args: { a: 1, b: 2 } }]],
        expected: { messages: [{ role: 'tool', tool_call_id: 'c1', content: 'sunny, 21C' }, { role: 'tool', tool_call_id: 'c2', content: '3' }], parallel_ms: 300, sequential_ms: 350 },
        name: 'two valid calls run in parallel',
      },
      { args: [[{ id: 'c1', name: 'add', args: { a: 1 } }]], expected: { messages: [{ role: 'tool', tool_call_id: 'c1', content: 'error: missing: b' }], parallel_ms: 0, sequential_ms: 0 }, name: 'invalid arguments are not run' },
      {
        args: [[{ id: 'x', name: 'hack', args: {} }, { id: 'y', name: 'add', args: { a: 1, b: 1 } }]],
        expected: { messages: [{ role: 'tool', tool_call_id: 'x', content: "error: unknown tool 'hack'" }, { role: 'tool', tool_call_id: 'y', content: '2' }], parallel_ms: 50, sequential_ms: 50 },
        name: 'unknown tool does not stop the others',
      },
      { args: [[{ id: 'b', name: 'boom', args: {} }]], expected: { messages: [{ role: 'tool', tool_call_id: 'b', content: 'error: tool crashed' }], parallel_ms: 100, sequential_ms: 100 }, name: 'a crash is reported and still counts as run' },
      { args: [[{ id: 'w', name: 'get_weather', args: { city: 'Paris', unit: 'kelvin' } }]], expected: { messages: [{ role: 'tool', tool_call_id: 'w', content: 'error: enum: unit must be one of celsius, fahrenheit' }], parallel_ms: 0, sequential_ms: 0 }, name: 'enum error text' },
      { args: [[]], expected: { messages: [], parallel_ms: 0, sequential_ms: 0 }, name: 'no calls' },
    ],
    hints: ['Check "name in tools" first, then call validate_args(schemas[name], args); only a call that passes both is executed and timed.', 'Collect durations of executed calls in a list; parallel is max(list) and sequential is sum(list), with 0 for an empty list.'],
    combines: ['agent-tool-calling', 'mcp-tool-call'],
  },
  quiz: [
    {
      prompt: 'Two tool calls in one reply do not depend on each other and take 300 ms and 500 ms. What is the best-case latency for both?',
      options: ['800 ms, always', '500 ms, by running them concurrently', '300 ms', 'Calls can never run at the same time'],
      answer: 1,
      explain: 'Concurrent execution costs the slowest call (500 ms); sequential execution costs the sum (800 ms).',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
