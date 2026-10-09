import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, flowGraph, kvPanel, step, type FlowDef, type FlowState } from '@/content/lib/ai-mcp-agents';

const code = `
class Host:
    def __init__(self, servers):
        self.clients = {n: Client(s) for n, s in servers.items()}   #@connect
        self.index = {}
        for name, client in self.clients.items():
            for tool in client.list_tools():
                self.index[tool] = name                              #@index

    def handle(self, user_message):
        call = self.llm.decide(user_message, list(self.index))       #@decide
        owner = self.index.get(call.tool)                            #@lookup
        if owner is None:
            return {"error": "unknown tool " + call.tool}            #@unknown
        return self.clients[owner].call_tool(call.tool, call.args)   #@forward
`;

const SERVERS: Record<string, string[]> = { files: ['read_file', 'list_dir'], db: ['query'], web: ['search_web'] };
const ASKS = ['read_file', 'query', 'search_web', 'send_email'];

const def: FlowDef = {
  title: 'Host, clients and servers',
  width: 640,
  height: 290,
  nodes: [
    { id: 'user', label: 'User', x: 50, y: 145, w: 64, shape: 'pill' },
    { id: 'host', label: 'Host (app + LLM)', x: 200, y: 145, w: 136, h: 44 },
    { id: 'cf', label: 'client A', x: 372, y: 45, w: 80 },
    { id: 'cd', label: 'client B', x: 372, y: 145, w: 80 },
    { id: 'cw', label: 'client C', x: 372, y: 245, w: 80 },
    { id: 'sf', label: 'files server', x: 550, y: 45, w: 100 },
    { id: 'sd', label: 'db server', x: 550, y: 145, w: 100 },
    { id: 'sw', label: 'web server', x: 550, y: 245, w: 100 },
  ],
  edges: [
    { from: 'user', to: 'host' },
    { from: 'host', to: 'cf' },
    { from: 'host', to: 'cd' },
    { from: 'host', to: 'cw' },
    { from: 'cf', to: 'sf', label: '1:1' },
    { from: 'cd', to: 'sd', label: '1:1' },
    { from: 'cw', to: 'sw', label: '1:1' },
  ],
};

const OWNER_NODES: Record<string, { c: string; s: string }> = { files: { c: 'cf', s: 'sf' }, db: { c: 'cd', s: 'sd' }, web: { c: 'cw', s: 'sw' } };

interface In {
  ask: string;
}

function ownerOf(tool: string): string | null {
  for (const [name, tools] of Object.entries(SERVERS)) if (tools.includes(tool)) return name;
  return null;
}

const viz: VizDef<In> = {
  id: 'mcp-roles',
  title: 'MCP roles: host, client, server',
  code,
  language: 'python',
  inputs: [{ key: 'ask', label: 'Tool the model picks', kind: 'select', options: ASKS, default: 'query' }],
  presets: ASKS.map((a) => ({ label: a === 'send_email' ? 'Unknown tool' : a, input: { ask: a } })),
  run({ ask }) {
    if (!ASKS.includes(ask)) throw new Error('Pick one of: ' + ASKS.join(', '));
    const r = new Recorder(code);
    const nodes: Record<string, Tone> = {};
    const view = (st: FlowState = {}) => flowGraph(def, { nodes: { ...nodes, ...st.nodes }, edges: st.edges, badges: st.badges, flow: st.flow });
    const index: Record<string, string> = {};
    const idx = () => kvPanel('Host tool index (tool → server)', Object.keys(index).length ? index : { '(empty)': '-' }, Object.fromEntries(Object.keys(index).map((k) => [k, 'new' as Tone])));

    step(r, 'connect', 'The host starts one client per server; each client holds one 1:1 session', [view({ nodes: { host: 'active', cf: 'new', cd: 'new', cw: 'new' } }), idx()], { clients: 3 });
    for (const [name, tools] of Object.entries(SERVERS)) {
      r.op();
      const o = OWNER_NODES[name];
      for (const t of tools) index[t] = name;
      step(r, 'index', `${name} server lists ${tools.join(', ')}; the host indexes them by tool name`, [view({ nodes: { [o.c]: 'active', [o.s]: 'active' }, edges: { [o.c + '>' + o.s]: 'active' }, flow: [o.c + '>' + o.s] }), idx()], { server: name, tools: tools.length });
    }
    step(r, 'decide', `User asks something; the model picks tool "${ask}" from the merged tool list`, [view({ nodes: { user: 'done', host: 'active' }, edges: { 'user>host': 'active' }, flow: ['user>host'] }), idx()], { tool: ask });
    const owner = ownerOf(ask);
    r.op();
    if (owner === null) {
      step(r, 'unknown', `No server owns "${ask}": the host returns an error instead of guessing`, [view({ nodes: { host: 'error' } }), idx()], { owner: 'none' });
      return { frames: r.frames, result: { owner: null, ok: false } };
    }
    const o = OWNER_NODES[owner];
    step(r, 'lookup', `Index says "${ask}" belongs to the ${owner} server, so use its client`, [view({ nodes: { host: 'active', [o.c]: 'compare' }, edges: { ['host>' + o.c]: 'active' } }), idx()], { owner });
    step(r, 'forward', `Client sends tools/call to the ${owner} server; other servers never see it`, [view({ nodes: { host: 'done', [o.c]: 'active', [o.s]: 'active' }, edges: { ['host>' + o.c]: 'path', [o.c + '>' + o.s]: 'active' }, flow: ['host>' + o.c, o.c + '>' + o.s] }), idx()], { owner });
    step(r, 'forward', 'The result travels back through the same client to the host and the model', [view({ nodes: { [o.s]: 'found', [o.c]: 'found', host: 'found', user: 'found' } }), idx()], { owner, ok: true });
    return { frames: r.frames, result: { owner, ok: true } };
  },
  reference({ ask }) {
    const owner = ownerOf(ask);
    return { owner, ok: owner !== null };
  },
};

const unit: Unit = {
  id: 'mcp-roles',
  hook: 'MCP is the "USB-C for tools" story, and interviewers want the vocabulary right: the host app owns the model and the user, a client lives inside the host, and each client talks to exactly one server.',
  predict: {
    prompt: 'A chat app connects to three MCP servers (files, database, web search). How many MCP clients does the host create?',
    options: ['One shared client for all three servers', 'One client per server, each with its own 1:1 session', 'One client per tool', 'None: the model talks to servers directly'],
    answer: 1,
    explain: 'The host runs one client per server connection. The model never speaks MCP itself; the host decides which tools it sees and routes its tool calls through the owning client.',
  },
  viz,
  deeper: {
    points: [
      'Host: the application the user runs (an IDE, a chat app). It owns the LLM, user consent and the list of connected servers.',
      'Client: a connector inside the host that keeps a 1:1 stateful session with one server and speaks JSON-RPC to it.',
      'Server: exposes tools, resources and prompts. It knows nothing about the model or about other servers, which keeps trust boundaries clear.',
      "The host merges every server's tools into one list for the model, so name collisions have to be handled (namespace as server.tool).",
      'Because routing is a plain lookup on a name, an unknown or hallucinated tool name must become an error, never a guess.',
    ],
    pitfalls: ['Giving the model a direct connection to a server', 'Letting two servers expose the same tool name without namespacing', 'Reusing one session across users'],
  },
  practice: {
    language: 'python',
    fnName: 'build_tool_index',
    statement: 'servers maps a server name to the list of tool names it exposes. Return {exposed_name: server}. A tool name that appears on more than one server is exposed as "server.tool" for every server that has it; unique names stay as they are.',
    signature: 'def build_tool_index(servers):',
    solution: `def build_tool_index(servers):
    counts = {}
    for tools in servers.values():
        for tool in tools:
            counts[tool] = @@counts.get(tool, 0) + 1@@
    index = {}
    for server, tools in servers.items():
        for tool in tools:
            name = @@server + "." + tool if counts[tool] > 1 else tool@@
            index[name] = server
    return index`,
    tests: [
      { args: [{ files: ['read_file', 'list_dir'], db: ['query'] }], expected: { read_file: 'files', list_dir: 'files', query: 'db' }, name: 'no collisions' },
      { args: [{ a: ['search', 'fetch'], b: ['search'] }], expected: { 'a.search': 'a', fetch: 'a', 'b.search': 'b' }, name: 'search collides' },
      { args: [{}], expected: {}, name: 'no servers' },
      { args: [{ x: ['t'], y: ['t'], z: ['t', 'u'] }], expected: { 'x.t': 'x', 'y.t': 'y', 'z.t': 'z', u: 'z' }, name: 'three-way collision' },
      { args: [{ solo: [] }], expected: {}, name: 'server with no tools' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'handle_call',
    statement: 'handle_call(index, message) answers a JSON-RPC tools/call request such as {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "query"}}. It returns a result naming the server, or an error with code -32602 for an unknown tool. Clients match replies to requests by id, but every reply currently carries id 1.',
    buggy: `def handle_call(index, message):
    name = message["params"]["name"]
    if name not in index:
        return {"jsonrpc": "2.0", "id": 1, "error": {"code": -32602, "message": "unknown tool: " + name}}
    return {"jsonrpc": "2.0", "id": 1, "result": {"server": index[name]}}`,
    fixed: `def handle_call(index, message):
    name = message["params"]["name"]
    if name not in index:
        return {"jsonrpc": "2.0", "id": message["id"], "error": {"code": -32602, "message": "unknown tool: " + name}}
    return {"jsonrpc": "2.0", "id": message["id"], "result": {"server": index[name]}}`,
    tests: [
      { args: [{ query: 'db' }, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'query' } }], expected: { jsonrpc: '2.0', id: 7, result: { server: 'db' } }, name: 'known tool' },
      { args: [{ query: 'db' }, { jsonrpc: '2.0', id: 'abc', method: 'tools/call', params: { name: 'nope' } }], expected: { jsonrpc: '2.0', id: 'abc', error: { code: -32602, message: 'unknown tool: nope' } }, name: 'unknown tool keeps the id' },
      { args: [{ read_file: 'files' }, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_file' } }], expected: { jsonrpc: '2.0', id: 1, result: { server: 'files' } }, name: 'id 1 still works' },
      { args: [{ a: 'x' }, { jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'a' } }], expected: { jsonrpc: '2.0', id: 42, result: { server: 'x' } }, name: 'another id' },
    ],
    bugType: 'response id not echoed',
    hint: 'What does a client do when two requests are in flight and both replies say id 1?',
    explanation: 'JSON-RPC correlates a response with its request purely by id. A hard-coded id makes concurrent calls indistinguishable, so the client delivers results to the wrong waiter. Always copy message["id"] into the reply, success or error.',
  },
  boss: {
    title: 'Host dispatcher',
    statement: 'Write dispatch(servers, request). servers maps a server name to {tool_name: output_text}. request is a JSON-RPC tools/call message whose params.name may be a plain tool name or a namespaced "server.tool". Expose names like a host would: a tool that exists on several servers is only reachable as "server.tool"; unique tools keep their plain name. Reply {"jsonrpc": "2.0", "id": <request id>, "result": {"content": [{"type": "text", "text": output}]}}, or {"jsonrpc": "2.0", "id": <request id>, "error": {"code": -32602, "message": "unknown tool: <name>"}} when the name is not exposed (an ambiguous plain name counts as unknown).',
    language: 'python',
    fnName: 'dispatch',
    starter: `def dispatch(servers, request):
    # your code here
    pass
`,
    solution: `def dispatch(servers, request):
    counts = {}
    for tools in servers.values():
        for tool in tools:
            counts[tool] = counts.get(tool, 0) + 1
    exposed = {}
    for server, tools in servers.items():
        for tool, output in tools.items():
            name = server + "." + tool if counts[tool] > 1 else tool
            exposed[name] = output
    name = request["params"]["name"]
    if name not in exposed:
        return {"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32602, "message": "unknown tool: " + name}}
    return {"jsonrpc": "2.0", "id": request["id"], "result": {"content": [{"type": "text", "text": exposed[name]}]}}`,
    tests: [
      { args: [{ files: { read_file: 'hello' }, db: { query: '3 rows' } }, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query' } }], expected: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '3 rows' }] } }, name: 'plain name' },
      { args: [{ a: { search: 'from a' }, b: { search: 'from b' } }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'b.search' } }], expected: { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'from b' }] } }, name: 'namespaced name' },
      { args: [{ a: { search: 'from a' }, b: { search: 'from b' } }, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search' } }], expected: { jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'unknown tool: search' } }, name: 'ambiguous plain name' },
      { args: [{ a: { x: '1' } }, { jsonrpc: '2.0', id: 'r9', method: 'tools/call', params: { name: 'zzz' } }], expected: { jsonrpc: '2.0', id: 'r9', error: { code: -32602, message: 'unknown tool: zzz' } }, name: 'unknown tool' },
      { args: [{}, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'a' } }], expected: { jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'unknown tool: a' } }, name: 'no servers' },
    ],
    hints: ['Count how many servers expose each tool first, then build the {exposed name: output} table.', 'Look the requested name up in that table; copy request["id"] into whichever reply you return.'],
    combines: ['mcp-discovery'],
  },
  quiz: [
    {
      prompt: 'Which component decides which tools the model is allowed to see?',
      options: ['The MCP server', 'The host application', 'The transport', 'The model provider'],
      answer: 1,
      explain: 'The host owns the model, user consent and the connected servers, so it filters and merges tool lists before the model sees them.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
