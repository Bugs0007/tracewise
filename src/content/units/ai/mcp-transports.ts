import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, Seq, logPanel, step } from '@/content/lib/ai-mcp-agents';

const code = `
def stdio_send(proc, msg):
    proc.stdin.write(json.dumps(msg, separators=(",", ":")) + "\\n")   #@encode

def stdio_read(buffer):
    *lines, rest = buffer.split("\\n")                                  #@split
    return [json.loads(l) for l in lines if l], rest                   #@decode

def http_send(session_id, msg):
    resp = post("/mcp", json=msg, headers={"Mcp-Session-Id": session_id})   #@post
    if resp.content_type == "text/event-stream":
        return parse_sse(resp.text)                                    #@sse
    return [resp.json()]                                               #@json
`;

const TRANSPORTS = ['stdio', 'streamable HTTP'];

interface In {
  transport: string;
  calls: number;
}

const wireCount = (transport: string, n: number): number => (transport === 'stdio' ? 6 + 2 * n : 8 + 2 * n);
const framingOf = (transport: string): string => (transport === 'stdio' ? 'newline-delimited JSON' : 'HTTP POST + SSE');

const viz: VizDef<In> = {
  id: 'mcp-transports',
  title: 'MCP transports: stdio vs streamable HTTP',
  code,
  language: 'python',
  inputs: [
    { key: 'transport', label: 'Transport', kind: 'select', options: TRANSPORTS, default: 'stdio' },
    { key: 'calls', label: 'Tool calls', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'stdio', input: { transport: 'stdio', calls: 1 } },
    { label: 'Streamable HTTP', input: { transport: 'streamable HTTP', calls: 1 } },
    { label: 'HTTP, 3 calls', input: { transport: 'streamable HTTP', calls: 3 } },
  ],
  run({ transport, calls }) {
    if (!TRANSPORTS.includes(transport)) throw new Error('transport must be stdio or streamable HTTP');
    const n = Math.round(calls);
    if (!(n >= 1 && n <= 4)) throw new Error('Tool calls must be between 1 and 4');
    const r = new Recorder(code);
    const wire: { text: string; tone?: Tone }[] = [];
    const out: Record<string, unknown> = {};

    if (transport === 'stdio') {
      const seq = new Seq(['Host / client', 'Server process'], 'stdio');
      const view = () => [seq.panel(), logPanel('Bytes on the pipes', wire, 7)];
      const send = (label: string, bytes: string, at: string, caption: string) => {
        r.op();
        seq.send('Host / client', 'Server process', label);
        wire.push({ text: 'stdin  ' + bytes, tone: 'active' });
        step(r, at, caption, view(), { transport: 'stdio' });
      };
      const reply = (label: string, bytes: string, caption: string) => {
        r.op();
        seq.send('Server process', 'Host / client', label, 'done', true);
        wire.push({ text: 'stdout ' + bytes, tone: 'found' });
        step(r, 'decode', caption, view(), { transport: 'stdio' });
      };
      seq.send('Host / client', 'Server process', 'spawn subprocess');
      r.op();
      step(r, 'encode', 'The host launches the server as a child process; stdin/stdout are the channel', view(), { transport: 'stdio' });
      send('initialize', '{"jsonrpc":"2.0","id":1,"method":"initialize",…}\\n', 'encode', 'One JSON message per line, ended by a newline: that newline is the framing');
      reply('result (capabilities)', '{"jsonrpc":"2.0","id":1,"result":{…}}\\n', 'The server writes its reply as one line on stdout; the reader splits on newlines');
      send('notifications/initialized', '{"jsonrpc":"2.0","method":"notifications/initialized"}\\n', 'encode', 'A notification has no id and gets no reply');
      for (let i = 0; i < n; i++) {
        send(`tools/call #${i + 2}`, `{"jsonrpc":"2.0","id":${i + 2},"method":"tools/call",…}\\n`, 'encode', `Call ${i + 1}: encode to a single line, never pretty-printed`);
        if (i === 0) {
          seq.send('Server process', 'Host / client', 'stderr: "listening…" (logs)', 'muted', true);
          wire.push({ text: 'stderr listening… (not protocol)', tone: 'muted' });
          step(r, 'split', 'Logs go to stderr; anything extra on stdout would corrupt the stream', view(), { transport: 'stdio' });
        }
        reply(`result #${i + 2}`, `{"jsonrpc":"2.0","id":${i + 2},"result":{…}}\\n`, `A read can end mid-line, so the reader keeps the leftover and waits for more bytes`);
      }
      seq.send('Host / client', 'Server process', 'close stdin → exit');
      r.op();
      step(r, 'decode', 'Closing stdin ends the session; the process exits', view(), { transport: 'stdio' });
      out.wire = seq.messages.length;
    } else {
      const seq = new Seq(['Client', 'HTTP server'], 'streamable HTTP');
      const view = () => [seq.panel(), logPanel('HTTP exchange', wire, 7)];
      const post = (label: string, body: string, status: string, resp: string, at: string, caption: string, tone?: Tone) => {
        r.op();
        seq.send('Client', 'HTTP server', 'POST /mcp ' + label);
        wire.push({ text: 'POST /mcp ' + body, tone: 'active' });
        step(r, 'post', caption, view(), { transport: 'http' });
        seq.send('HTTP server', 'Client', status, tone ?? 'done', true);
        wire.push({ text: status + ' ' + resp, tone: 'found' });
        step(r, at, `Server replies ${status}`, view(), { transport: 'http', status });
      };
      post('initialize', '{"method":"initialize"}', '200 JSON', 'Mcp-Session-Id: s1', 'json', 'Each client message is its own HTTP POST; the server replies in the same request');
      post('notifications/initialized', '{"method":"notifications/initialized"}', '202 Accepted', '(no body)', 'json', 'Notifications have no reply, so the server answers 202 Accepted');
      for (let i = 0; i < n; i++) {
        post(`tools/call #${i + 2}`, `{"id":${i + 2},"method":"tools/call"} Mcp-Session-Id: s1`, '200 event-stream', 'data: {"id":' + (i + 2) + ',"result":…}', 'sse', `Call ${i + 1}: the session id header ties this POST to the session`);
      }
      r.op();
      seq.send('Client', 'HTTP server', 'GET /mcp (Accept: event-stream)');
      seq.send('HTTP server', 'Client', '200 stream stays open', 'done', true);
      wire.push({ text: 'GET /mcp → long-lived SSE for server-initiated messages', tone: 'compare' });
      step(r, 'sse', 'An optional GET opens a stream so the server can push notifications later', view(), { transport: 'http' });
      r.op();
      seq.send('Client', 'HTTP server', 'DELETE /mcp (end session)');
      seq.send('HTTP server', 'Client', '200 OK', 'done', true);
      step(r, 'json', 'DELETE with the session id ends the session explicitly', view(), { transport: 'http' });
      out.wire = seq.messages.length;
    }
    return { frames: r.frames, result: { framing: framingOf(transport), wire: out.wire as number } };
  },
  reference({ transport, calls }) {
    return { framing: framingOf(transport), wire: wireCount(transport, Math.round(calls)) };
  },
};

const unit: Unit = {
  id: 'mcp-transports',
  hook: 'stdio and streamable HTTP carry the same JSON-RPC messages, but framing, sessions and failure modes differ. Interviewers ask which one fits a local tool versus a hosted service.',
  predict: {
    prompt: 'On the stdio transport, what marks the end of one JSON-RPC message?',
    options: ['A Content-Length header, like HTTP', 'A newline character; each message is a single line', 'A closing brace }', 'The process exiting'],
    answer: 1,
    explain: 'stdio uses newline-delimited JSON. That is why messages must not contain raw newlines (no pretty-printing) and why the server must never print logs to stdout.',
  },
  viz,
  deeper: {
    points: [
      'stdio: the host spawns the server as a subprocess and talks over stdin/stdout. Ideal for local tools; lifetime is tied to the process; one client per process.',
      'Streamable HTTP: every client message is an HTTP POST to a single endpoint. The reply is either plain JSON or a text/event-stream (SSE) that can carry progress and the final result.',
      'HTTP sessions are identified by an Mcp-Session-Id header returned by initialize; a GET can open a stream for server-initiated messages, and DELETE ends the session.',
      'Framing differs: stdio relies on newlines, SSE relies on blank lines between events and "data:" prefixes, so each needs its own incremental parser.',
      'Remote servers need authentication and origin checks that a local subprocess does not; stdio inherits the permissions of the user who launched it.',
    ],
    pitfalls: ['Printing logs to stdout on a stdio server', 'Pretty-printing JSON on stdio', 'Parsing a partial read as a complete message'],
  },
  practice: {
    language: 'python',
    fnName: 'split_messages',
    statement: 'split_messages(buffer) reads the text received so far on a stdio pipe. Return [messages, rest]: every complete line (ending in a newline) parsed as JSON, skipping empty lines, and the unfinished tail after the last newline as rest.',
    signature: 'def split_messages(buffer):',
    solution: `import json

def split_messages(buffer):
    *lines, rest = @@buffer.split("\\n")@@
    messages = []
    for line in lines:
        if @@line.strip()@@:
            messages.append(@@json.loads(line)@@)
    return [messages, rest]`,
    tests: [
      { args: ['{"id":1}\n{"id":2}\n'], expected: [[{ id: 1 }, { id: 2 }], ''], name: 'two complete lines' },
      { args: ['{"id":1}\n{"id":'], expected: [[{ id: 1 }], '{"id":'], name: 'partial tail is kept' },
      { args: [''], expected: [[], ''], name: 'empty buffer' },
      { args: ['{"a":1}\n\n{"b":2}\n'], expected: [[{ a: 1 }, { b: 2 }], ''], name: 'blank line skipped' },
      { args: ['{"x":"a b"}'], expected: [[], '{"x":"a b"}'], name: 'no newline yet' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'encode_message',
    statement: 'encode_message(msg) serializes a JSON-RPC message for a stdio pipe: compact separators (",", ":"), a single line, terminated by one "\\n". The server reports "invalid JSON" for every request because the reader splits on newlines.',
    buggy: `import json

def encode_message(msg):
    return json.dumps(msg, indent=2, separators=(",", ":")) + "\\n"`,
    fixed: `import json

def encode_message(msg):
    return json.dumps(msg, separators=(",", ":")) + "\\n"`,
    tests: [
      { args: [{ jsonrpc: '2.0', id: 1, method: 'ping' }], expected: '{"jsonrpc":"2.0","id":1,"method":"ping"}\n', name: 'simple request' },
      { args: [{ id: 2, result: { content: [{ type: 'text', text: 'line1\nline2' }] } }], expected: '{"id":2,"result":{"content":[{"type":"text","text":"line1\\nline2"}]}}\n', name: 'newline inside a string is escaped' },
      { args: [{ id: 3, params: {} }], expected: '{"id":3,"params":{}}\n', name: 'empty object' },
    ],
    bugType: 'pretty-printed framing',
    hint: 'How many newline characters does json.dumps(..., indent=2) put inside one message?',
    explanation: 'On stdio the newline is the message delimiter. indent=2 inserts newlines between fields, so the reader sees many broken fragments. Emit compact JSON on one line; newlines inside string values are already escaped as \\n.',
  },
  boss: {
    title: 'Parse a server-sent event stream',
    statement: 'Write parse_sse(text) for the streamable HTTP transport. Only lines ending in "\\n" count (an unterminated last line is ignored). Fields are "name: value" (one optional space after the colon); lines starting with ":" are comments. An event ends at a blank line. "data" lines of one event are joined with "\\n". Events whose "event" field is missing or "message" are parsed with json.loads and collected; other event types are skipped. Treat "\\r\\n" like "\\n". Return {"messages": [...], "last_event_id": the id of the last dispatched event that had an id field, or None}. An event that never got its blank line is not dispatched.',
    language: 'python',
    fnName: 'parse_sse',
    starter: `import json

def parse_sse(text):
    # your code here
    pass
`,
    solution: `import json

def parse_sse(text):
    messages = []
    last_id = None
    event, data, event_id = "message", [], None
    lines = text.replace("\\r\\n", "\\n").split("\\n")[:-1]
    for line in lines:
        if line == "":
            if data:
                if event == "message":
                    messages.append(json.loads("\\n".join(data)))
                if event_id is not None:
                    last_id = event_id
            event, data, event_id = "message", [], None
            continue
        if line.startswith(":"):
            continue
        field, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if field == "event":
            event = value
        elif field == "data":
            data.append(value)
        elif field == "id":
            event_id = value
    return {"messages": messages, "last_event_id": last_id}`,
    tests: [
      { args: ['event: message\ndata: {"id":1}\nid: 1\n\ndata: {"id":2}\nid: 2\n\n'], expected: { messages: [{ id: 1 }, { id: 2 }], last_event_id: '2' }, name: 'two events with ids' },
      { args: ['data: {"a":\ndata: 1}\n\n'], expected: { messages: [{ a: 1 }], last_event_id: null }, name: 'multi-line data' },
      { args: [': keepalive\n\nevent: ping\ndata: {}\n\ndata: {"x":1}\n\n'], expected: { messages: [{ x: 1 }], last_event_id: null }, name: 'comments and other event types' },
      { args: ['data: {"a":1}\n\ndata: {"b":2}\n'], expected: { messages: [{ a: 1 }], last_event_id: null }, name: 'incomplete last event' },
      { args: ['data: {"a":1}\r\nid: 7\r\n\r\n'], expected: { messages: [{ a: 1 }], last_event_id: '7' }, name: 'CRLF line endings' },
      { args: [''], expected: { messages: [], last_event_id: null }, name: 'empty stream' },
    ],
    hints: ['Walk the lines once, keeping the current event type, data lines and id; a blank line dispatches the event and resets them.', 'Split the text on newlines and drop the last element: it is either empty or an unterminated line that must not count.'],
    combines: ['mcp-tool-call'],
  },
  quiz: [
    {
      prompt: 'A remote MCP server must serve many users at once. Which transport is the natural fit?',
      options: ['stdio, one subprocess per user on the server', 'Streamable HTTP with a session id per client', 'Shared stdin', 'Email'],
      answer: 1,
      explain: 'HTTP is request/response and horizontally scalable, with sessions and auth headers. stdio is for local child processes.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
