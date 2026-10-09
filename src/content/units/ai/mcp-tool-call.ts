import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, Seq, kvPanel, logPanel, step } from '@/content/lib/ai-mcp-agents';

const code = `
def call_tool(client, tool_call):
    args = json.loads(tool_call["arguments"] or "{}")         #@args
    req = {"jsonrpc": "2.0", "id": client.next_id(), "method": "tools/call",
           "params": {"name": tool_call["name"], "arguments": args}}   #@build
    resp = client.send(req)                                    #@send
    if "error" in resp:
        return {"ok": False, "kind": "protocol", "text": resp["error"]["message"]}   #@protocol
    result = resp["result"]
    text = "\\n".join(c["text"] for c in result["content"] if c["type"] == "text")   #@content
    return {"ok": not result.get("isError"), "kind": "tool", "text": text}   #@ok
`;

const SCENARIOS = ['add (success)', 'divide by zero (tool error)', 'bad arguments (protocol error)', 'unknown tool'];

interface Call {
  name: string;
  args: Record<string, unknown>;
}

const CALLS: Record<string, Call> = {
  'add (success)': { name: 'add', args: { a: 2, b: 3 } },
  'divide by zero (tool error)': { name: 'divide', args: { a: 1, b: 0 } },
  'bad arguments (protocol error)': { name: 'add', args: { a: 'two', b: 3 } },
  'unknown tool': { name: 'subtract', args: { a: 5, b: 1 } },
};

interface In {
  scenario: string;
}

type Outcome = { kind: 'result'; text: string; isError: boolean } | { kind: 'protocol'; message: string };

/** What the server does with a tools/call request. */
function serve(call: Call): Outcome {
  if (!['add', 'divide'].includes(call.name)) return { kind: 'protocol', message: 'unknown tool: ' + call.name };
  const { a, b } = call.args;
  if (typeof a !== 'number' || typeof b !== 'number') return { kind: 'protocol', message: 'invalid arguments: type: a expected number' };
  if (call.name === 'add') return { kind: 'result', text: String(a + b), isError: false };
  if (b === 0) return { kind: 'result', text: 'division by zero', isError: true };
  return { kind: 'result', text: String(a / b), isError: false };
}

const viz: VizDef<In> = {
  id: 'mcp-tool-call',
  title: 'MCP tool-call lifecycle',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Scenario', kind: 'select', options: SCENARIOS, default: SCENARIOS[0] }],
  presets: SCENARIOS.map((s) => ({ label: s, input: { scenario: s } })),
  run({ scenario }) {
    const call = CALLS[scenario];
    if (!call) throw new Error('Pick one of: ' + SCENARIOS.join(', '));
    const r = new Recorder(code);
    const seq = new Seq(['User', 'Model', 'Client', 'Server'], 'tools/call');
    const log: { text: string; tone?: Tone }[] = [];
    const argJson = JSON.stringify(call.args);
    const view = (extra: Record<string, string | number> = {}) => [seq.panel(), kvPanel('Request / response', Object.keys(extra).length ? Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) : { state: 'idle' }), logPanel('Runtime log', log, 5)];

    seq.send('User', 'Model', 'What is the answer? (needs a tool)');
    step(r, undefined, 'The user asks something the model cannot do alone; tool schemas are in its context', view(), {});
    seq.send('Model', 'Client', `tool_call ${call.name}(${argJson})`, 'active');
    log.push({ text: `model → tool_call name=${call.name} arguments=${JSON.stringify(argJson)}`, tone: 'active' });
    step(r, 'args', 'The model decides to call a tool; its arguments arrive as a JSON string', view({ arguments: JSON.stringify(argJson) }), { tool: call.name });
    r.op();
    const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: call.name, arguments: call.args } };
    step(r, 'build', 'The client parses the string into an object and wraps it in a JSON-RPC request', view({ method: req.method, id: 1, name: call.name, arguments: argJson }), { id: 1 });
    seq.send('Client', 'Server', `tools/call id=1 ${call.name}`);
    r.op();
    step(r, 'send', 'The request goes to the server over the transport', view({ method: req.method, id: 1 }), { id: 1 });
    const out = serve(call);
    r.op();
    let result: Record<string, unknown>;
    if (out.kind === 'protocol') {
      seq.send('Server', 'Client', `error -32602 ${out.message}`, 'error', true);
      log.push({ text: 'server: ' + out.message, tone: 'error' });
      step(r, 'protocol', `Server rejects the call before running anything: ${out.message}`, view({ id: 1, error: out.message }), { id: 1, kind: 'protocol' });
      seq.send('Client', 'Model', `tool message: ${out.message}`, 'error', true);
      step(r, 'protocol', 'Client reports the failure to the model so it can fix the arguments or give up', view({ error: out.message }), { ok: false });
      result = { ok: false, kind: 'protocol', text: out.message };
    } else {
      log.push({ text: `server ran ${call.name}: ${out.text}`, tone: out.isError ? 'error' : 'found' });
      seq.send('Server', 'Client', `result isError=${out.isError} "${out.text}"`, out.isError ? 'error' : 'done', true);
      step(r, 'content', out.isError ? 'The tool ran but failed: isError=true travels in a normal result' : 'The tool ran; its output is returned as content items', view({ id: 1, text: out.text, isError: String(out.isError) }), { id: 1, isError: out.isError });
      seq.send('Client', 'Model', `tool message: ${out.text}`, out.isError ? 'error' : 'active', true);
      step(r, 'ok', 'The client turns the content into a tool message for the model', view({ text: out.text }), { ok: !out.isError });
      result = { ok: !out.isError, kind: 'tool', text: out.text };
    }
    seq.send('Model', 'User', result.ok ? `The answer is ${result.text}` : 'I could not complete that: ' + String(result.text), result.ok ? 'found' : 'error', true);
    step(r, 'ok', result.ok ? 'With the result in context, the model writes the final answer' : 'The model sees the error text and explains or retries', view({ final: String(result.text) }), { ok: result.ok as boolean });
    return { frames: r.frames, result };
  },
  reference({ scenario }) {
    const out = serve(CALLS[scenario]);
    return out.kind === 'protocol' ? { ok: false, kind: 'protocol', text: out.message } : { ok: !out.isError, kind: 'tool', text: out.text };
  },
};

const unit: Unit = {
  id: 'mcp-tool-call',
  hook: 'One tool call crosses model, client, transport and server. Interviewers probe where each failure surfaces: a bad argument is a protocol error, a tool that fails is a normal result with isError set.',
  predict: {
    prompt: 'A tool raises "division by zero" while handling tools/call. How does the server report it?',
    options: ['A JSON-RPC error response with code -32603', 'A normal result whose isError flag is true and whose content holds the message', 'It closes the connection', 'It retries until it works'],
    answer: 1,
    explain: 'Failures inside tool execution are returned as results with isError: true so the model can read them and adapt. JSON-RPC errors are for protocol problems such as unknown tools or invalid arguments.',
  },
  viz,
  deeper: {
    points: [
      'A model emits a tool call (name plus arguments, often a JSON string). The client converts it into a JSON-RPC tools/call request with an id.',
      'The server validates arguments against the tool inputSchema, runs the tool and answers with content items (text, images, resources) and an optional isError flag.',
      'Two kinds of failure: protocol errors (unknown tool, invalid params) and tool execution errors (isError true). The model should see both, as text.',
      'The client matches the response to the request by id, wraps the content in a tool message and calls the model again so it can finish its answer.',
      'The host may ask the user to approve a call before it is sent; that happens between the model deciding and the client sending.',
    ],
    pitfalls: ['Sending the arguments as a JSON string instead of an object', 'Dropping isError so a failed tool looks successful', 'Never returning the tool message to the model'],
  },
  practice: {
    language: 'python',
    fnName: 'parse_result',
    statement: 'parse_result(response) reads a JSON-RPC reply. If it has an "error", return {"ok": False, "kind": "protocol", "text": error message}. Otherwise join the text of all content items with type "text" using a newline and return {"ok": not isError, "kind": "tool", "text": joined}.',
    signature: 'def parse_result(response):',
    solution: `def parse_result(response):
    if "error" in response:
        return {"ok": False, "kind": "protocol", "text": @@response["error"]["message"]@@}
    result = response["result"]
    parts = [c["text"] for c in result["content"] if @@c["type"] == "text"@@]
    return {"ok": @@not result.get("isError", False)@@, "kind": "tool", "text": "\\n".join(parts)}`,
    tests: [
      { args: [{ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '5' }] } }], expected: { ok: true, kind: 'tool', text: '5' }, name: 'success' },
      { args: [{ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'division by zero' }], isError: true } }], expected: { ok: false, kind: 'tool', text: 'division by zero' }, name: 'tool error' },
      { args: [{ jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'unknown tool: x' } }], expected: { ok: false, kind: 'protocol', text: 'unknown tool: x' }, name: 'protocol error' },
      { args: [{ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: 'a' }, { type: 'image', data: '..' }, { type: 'text', text: 'b' }] } }], expected: { ok: true, kind: 'tool', text: 'a\nb' }, name: 'only text items, joined' },
      { args: [{ jsonrpc: '2.0', id: 5, result: { content: [] } }], expected: { ok: true, kind: 'tool', text: '' }, name: 'empty content' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'build_call',
    statement: 'build_call(req_id, tool_call) converts a model tool call ({"name": ..., "arguments": "<JSON string>"}) into an MCP tools/call request. params.arguments must be an object, but the server rejects every request with "arguments must be an object".',
    buggy: `import json

def build_call(req_id, tool_call):
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {"name": tool_call["name"], "arguments": tool_call["arguments"]},
    }`,
    fixed: `import json

def build_call(req_id, tool_call):
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {"name": tool_call["name"], "arguments": json.loads(tool_call["arguments"] or "{}")},
    }`,
    tests: [
      { args: [1, { name: 'add', arguments: '{"a": 2, "b": 3}' }], expected: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add', arguments: { a: 2, b: 3 } } }, name: 'object arguments' },
      { args: [7, { name: 'ping', arguments: '' }], expected: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'ping', arguments: {} } }, name: 'empty string means no arguments' },
      { args: [2, { name: 'search', arguments: '{"q": "cats", "tags": ["a", "b"]}' }], expected: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search', arguments: { q: 'cats', tags: ['a', 'b'] } } }, name: 'nested values' },
    ],
    bugType: 'double-encoded arguments',
    hint: 'Look at the type of tool_call["arguments"] coming from the model. Is it already an object?',
    explanation: 'Model APIs hand back function arguments as a JSON string, but MCP params.arguments is a JSON object. Passing the string through produces a string inside JSON, which the server cannot validate. Decode it once with json.loads (treating an empty string as {}).',
  },
  boss: {
    title: 'Tiny tool server',
    statement: 'Write handle_request(registry, request) for a server. registry maps tool name to {"schema": {"properties": {name: {"type": "number"|"string"|"boolean"}}, "required": [...]}, "run": function(**arguments)}. For a tools/call request: an other method gives error code -32601 "method not found: <method>"; an unknown tool gives -32602 "unknown tool: <name>"; arguments that miss a required name or have the wrong type (a bool is never a number) give -32602 "invalid arguments: " + ", ".join(sorted errors) where an error is "missing: x" or "type: x expected number". Otherwise run the tool: return result {"content": [{"type": "text", "text": str(value)}], "isError": False}, or if the tool raises, text str(exception) with isError True. Every reply is {"jsonrpc": "2.0", "id": request id, ...}. The registry is provided; the tools are add(a, b), divide(a, b) and echo(text).',
    language: 'python',
    fnName: 'handle_request',
    harness: `
_NUM2 = {"properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]}
REGISTRY = {
    "add": {"schema": _NUM2, "run": lambda a, b: a + b},
    "divide": {"schema": _NUM2, "run": lambda a, b: a / b},
    "echo": {"schema": {"properties": {"text": {"type": "string"}}, "required": ["text"]}, "run": lambda text: text},
}

def run_server(fn, request):
    return fn(REGISTRY, request)
`,
    adapter: 'run_server',
    starter: `def handle_request(registry, request):
    # your code here
    pass
`,
    solution: `def handle_request(registry, request):
    rid = request["id"]

    def error(code, message):
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}

    if request["method"] != "tools/call":
        return error(-32601, "method not found: " + request["method"])
    name = request["params"]["name"]
    args = request["params"].get("arguments", {})
    if name not in registry:
        return error(-32602, "unknown tool: " + name)
    tool = registry[name]
    kinds = {"number": (int, float), "string": str, "boolean": bool}
    problems = []
    for key in tool["schema"].get("required", []):
        if key not in args:
            problems.append("missing: " + key)
    for key, spec in tool["schema"]["properties"].items():
        if key in args:
            value = args[key]
            good = isinstance(value, kinds[spec["type"]])
            if spec["type"] != "boolean" and isinstance(value, bool):
                good = False
            if not good:
                problems.append("type: " + key + " expected " + spec["type"])
    if problems:
        return error(-32602, "invalid arguments: " + ", ".join(sorted(problems)))
    try:
        value = tool["run"](**args)
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": str(exc)}], "isError": True}}
    return {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": str(value)}], "isError": False}}`,
    tests: [
      { args: [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add', arguments: { a: 2, b: 3 } } }], expected: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '5' }], isError: false } }, name: 'add' },
      { args: [{ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'divide', arguments: { a: 1, b: 0 } } }], expected: { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'division by zero' }], isError: true } }, name: 'tool raises' },
      { args: [{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'add', arguments: { a: 2 } } }], expected: { jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'invalid arguments: missing: b' } }, name: 'missing argument' },
      { args: [{ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add', arguments: { a: true, b: 'x' } } }], expected: { jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'invalid arguments: type: a expected number, type: b expected number' } }, name: 'wrong types' },
      { args: [{ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'rm_rf', arguments: {} } }], expected: { jsonrpc: '2.0', id: 5, error: { code: -32602, message: 'unknown tool: rm_rf' } }, name: 'unknown tool' },
      { args: [{ jsonrpc: '2.0', id: 6, method: 'tools/delete', params: {} }], expected: { jsonrpc: '2.0', id: 6, error: { code: -32601, message: 'method not found: tools/delete' } }, name: 'unknown method' },
      { args: [{ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hi' } } }], expected: { jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'hi' }], isError: false } }, name: 'echo' },
    ],
    hints: ['Check in order: method, tool name, arguments, then run the tool inside try/except.', 'Collect all argument problems into a list first; a bool must be rejected for "number" even though isinstance(True, int) is True.'],
    combines: ['mcp-discovery', 'mcp-roles'],
  },
  quiz: [
    {
      prompt: 'Why must the client copy the request id into its bookkeeping before sending tools/call?',
      options: ['The server needs a unique name', 'Responses can arrive out of order, and the id is how they are matched', 'IDs are required to be sorted', 'Without ids the model would not run'],
      answer: 1,
      explain: 'Several calls can be in flight at once; the id on the response is the only link back to the waiting request.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
