import { Recorder, parseAnchors } from '@/engine/recorder';
import type { SequenceMessage, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
POST /api/orders HTTP/1.1            //@reqLine
Host: shop.example.com               //@host
Content-Type: application/json       //@ctype
Content-Length: 21                   //@clen
Connection: keep-alive               //@conn

{"sku":"A12","qty":2}                //@body
`;

interface In {
  protocol: string;
  requests: number;
  rtt: number;
}

interface Parsed {
  method: string;
  path: string;
  version: string;
  headers: Record<string, string>;
  body: string;
}

const PROTOCOLS = ['HTTP/1.1 close', 'HTTP/1.1 keep-alive', 'HTTP/2'];
/** deterministic server think time per resource, in ms */
const SERVE = [30, 90, 40, 60, 20, 50];

/** Reference parser (split based) used by `reference`. */
function refParse(raw: string): Parsed {
  const text = raw.replace(/\r\n/g, '\n');
  const cut = text.indexOf('\n\n');
  const head = cut < 0 ? text : text.slice(0, cut);
  const body = cut < 0 ? '' : text.slice(cut + 2);
  const [first, ...rest] = head.split('\n');
  const [method, path, version] = first.split(' ');
  const headers: Record<string, string> = {};
  for (const line of rest) {
    const at = line.indexOf(':');
    const name = line.slice(0, at).trim().toLowerCase();
    headers[name] = name in headers ? headers[name] + ', ' + line.slice(at + 1).trim() : line.slice(at + 1).trim();
  }
  return { method, path, version, headers, body };
}

function model(protocol: string, n: number, rtt: number) {
  const hs = 2 * rtt;
  const finish: number[] = [];
  let t = 0;
  if (protocol === 'HTTP/2') {
    for (let i = 0; i < n; i++) finish.push(hs + rtt + SERVE[i]);
  } else {
    if (protocol === 'HTTP/1.1 keep-alive') t = hs;
    for (let i = 0; i < n; i++) {
      if (protocol === 'HTTP/1.1 close') t += hs;
      t += rtt + SERVE[i];
      finish.push(t);
    }
  }
  return { finish, total: Math.max(...finish), handshakes: protocol === 'HTTP/1.1 close' ? n : 1 };
}

const viz: VizDef<In> = {
  id: 'web-http',
  title: 'HTTP message anatomy and connections',
  code,
  language: 'text',
  inputs: [
    { key: 'protocol', label: 'Protocol', kind: 'select', default: 'HTTP/1.1 keep-alive', options: PROTOCOLS },
    { key: 'requests', label: 'Resources to fetch (1-6)', kind: 'number', default: 3 },
    { key: 'rtt', label: 'Round-trip time (ms)', kind: 'number', default: 50 },
  ],
  presets: [
    { label: 'HTTP/1.1 close', input: { protocol: 'HTTP/1.1 close', requests: 3, rtt: 50 } },
    { label: 'HTTP/1.1 keep-alive', input: { protocol: 'HTTP/1.1 keep-alive', requests: 3, rtt: 50 } },
    { label: 'HTTP/2', input: { protocol: 'HTTP/2', requests: 3, rtt: 50 } },
    { label: 'HTTP/2, 5 resources', input: { protocol: 'HTTP/2', requests: 5, rtt: 80 } },
  ],
  run(input) {
    const r = new Recorder(code);
    if (!PROTOCOLS.includes(input.protocol)) throw new Error('Unknown protocol');
    const n = Math.round(input.requests);
    if (n < 1 || n > 6) throw new Error('Fetch between 1 and 6 resources');
    if (!(input.rtt > 0)) throw new Error('RTT must be positive');
    const rtt = input.rtt;
    const lines = parseAnchors(code).clean.split('\n');

    // Part 1: read the raw request one line at a time, exactly like a server would.
    const parsed: Parsed = { method: '', path: '', version: '', headers: {}, body: '' };
    const shown = () => ({ type: 'kv' as const, title: 'Parsed so far', entries: [{ k: 'method', v: parsed.method }, { k: 'path', v: parsed.path }, { k: 'version', v: parsed.version }, ...Object.entries(parsed.headers).map(([k, v]) => ({ k: `header ${k}`, v })), ...(parsed.body ? [{ k: 'body', v: parsed.body, tone: 'found' as Tone }] : [])] });
    const raw = (upTo: number, tone: Tone) => ({ type: 'array' as const, title: 'Raw lines received', values: lines.map((l) => l || '(blank line)'), tones: Object.fromEntries(lines.map((_, i) => [i, i === upTo ? tone : i < upTo ? ('done' as Tone) : ('default' as Tone)])), hideIndex: true });
    const anchors = ['reqLine', 'host', 'ctype', 'clen', 'conn'];
    [parsed.method, parsed.path, parsed.version] = lines[0].split(' ');
    r.step('reqLine', `Request line: method ${parsed.method}, target ${parsed.path}, version ${parsed.version}`, [raw(0, 'active'), shown()], { method: parsed.method });
    let i = 1;
    for (; i < lines.length && lines[i] !== ''; i++) {
      const at = lines[i].indexOf(':');
      const name = lines[i].slice(0, at).trim();
      parsed.headers[name.toLowerCase()] = lines[i].slice(at + 1).trim();
      r.op();
      r.step(anchors[i] ?? 'conn', `Header "${name}" is stored as ${name.toLowerCase()} (names are case-insensitive)`, [raw(i, 'compare'), shown()], { headers: Object.keys(parsed.headers).length });
    }
    r.step(i + 1, 'A blank line ends the headers: everything after it is the body', [raw(i, 'swap'), shown()], { headers: Object.keys(parsed.headers).length });
    parsed.body = lines.slice(i + 1).join('\n');
    const declared = Number(parsed.headers['content-length']);
    r.step('body', `Body has ${parsed.body.length} characters; Content-Length says ${declared}${declared === parsed.body.length ? ': they match' : ': mismatch!'}`, [raw(i + 1, 'found'), shown()], { bodyLength: parsed.body.length, contentLength: declared });

    // Part 2: fetch n resources over the chosen protocol.
    const m = model(input.protocol, n, rtt);
    const h2 = input.protocol === 'HTTP/2';
    const close = input.protocol === 'HTTP/1.1 close';
    const lanes: { label: string; events: { t: number; dur: number; label: string; tone: Tone }[] }[] = h2 ? [{ label: 'connection', events: [] }, ...Array.from({ length: n }, (_, k) => ({ label: `stream ${2 * k + 1}`, events: [] }))] : close ? Array.from({ length: n }, (_, k) => ({ label: `conn ${k + 1}`, events: [] })) : [{ label: 'conn 1', events: [] }];
    const msgs: SequenceMessage[] = [];
    interface Moment {
      anchor: string;
      caption: string;
      now: number;
      msg: SequenceMessage;
      lane?: number;
      ev?: { t: number; dur: number; label: string; tone: Tone };
    }
    const moments: Moment[] = [];
    const hsMsg = (label: string): SequenceMessage => ({ from: 'Browser', to: 'Server', label, tone: 'frontier' });
    if (h2) {
      moments.push({ anchor: 'conn', caption: `One TCP + TLS handshake (2 RTT = ${2 * rtt}ms) serves every request`, now: 2 * rtt, msg: hsMsg('TCP + TLS handshake'), lane: 0, ev: { t: 0, dur: 2 * rtt, label: 'handshake', tone: 'frontier' } });
      for (let k = 0; k < n; k++) moments.push({ anchor: 'reqLine', caption: `Request ${k + 1} goes out on stream ${2 * k + 1} immediately; no waiting for earlier responses`, now: 2 * rtt, msg: { from: 'Browser', to: 'Server', label: `HEADERS stream ${2 * k + 1}: GET /r${k + 1}`, tone: 'active' } });
      const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => m.finish[a] - m.finish[b] || a - b);
      for (const k of order) moments.push({ anchor: 'reqLine', caption: `Stream ${2 * k + 1} completes at ${m.finish[k]}ms (server took ${SERVE[k]}ms); streams interleave on one connection`, now: m.finish[k], msg: { from: 'Server', to: 'Browser', label: `200 stream ${2 * k + 1} (${SERVE[k]}ms)`, tone: 'found', dashed: true }, lane: 1 + k, ev: { t: 2 * rtt, dur: m.finish[k] - 2 * rtt, label: `r${k + 1}`, tone: 'active' } });
    } else {
      let t = 0;
      for (let k = 0; k < n; k++) {
        if (close || k === 0) {
          moments.push({ anchor: 'conn', caption: close ? `Request ${k + 1}: a new connection costs 2 RTT (${2 * rtt}ms) before any byte of HTTP` : `Open the connection once: 2 RTT (${2 * rtt}ms), then keep it alive`, now: t + 2 * rtt, msg: hsMsg('TCP + TLS handshake'), lane: close ? k : 0, ev: { t, dur: 2 * rtt, label: 'handshake', tone: 'frontier' } });
          t += 2 * rtt;
        }
        moments.push({ anchor: 'reqLine', caption: `GET /r${k + 1}: ${k > 0 && !close ? 'must wait: the previous response had to finish first' : 'sent on the connection'}`, now: t, msg: { from: 'Browser', to: 'Server', label: `GET /r${k + 1}`, tone: 'active' } });
        moments.push({ anchor: 'reqLine', caption: `Response ${k + 1} arrives at ${m.finish[k]}ms (RTT ${rtt} + server ${SERVE[k]}ms)`, now: m.finish[k], msg: { from: 'Server', to: 'Browser', label: `200 /r${k + 1} (${SERVE[k]}ms)${close ? ' Connection: close' : ''}`, tone: 'found', dashed: true }, lane: close ? k : 0, ev: { t, dur: m.finish[k] - t, label: `r${k + 1}`, tone: 'active' } });
        t = m.finish[k];
      }
    }
    for (const mo of moments) {
      msgs.push(mo.msg);
      if (mo.ev !== undefined && mo.lane !== undefined) lanes[mo.lane].events.push(mo.ev);
      r.op();
      r.step(mo.anchor, mo.caption, [{ type: 'sequence', title: input.protocol, actors: ['Browser', 'Server'], messages: [...msgs], active: msgs.length - 1 }, { type: 'timeline', title: 'Time on the wire', lanes, tMax: m.total, now: mo.now, unit: 'ms' }], { now: mo.now, handshakes: msgs.filter((x) => x.label.includes('handshake')).length });
    }
    r.step('conn', `${input.protocol}: all ${n} resources done at ${m.total}ms with ${m.handshakes} handshake${m.handshakes === 1 ? '' : 's'}`, [{ type: 'kv', entries: [{ k: 'protocol', v: input.protocol }, { k: 'total time (ms)', v: m.total, tone: 'found' }, { k: 'handshakes', v: m.handshakes }] }], { total: m.total });
    return { frames: r.frames, result: { parsed, total: m.total, handshakes: m.handshakes, finish: m.finish } };
  },
  reference(i) {
    const clean = parseAnchors(code).clean.replace(/\n/g, '\r\n');
    const m = model(i.protocol, Math.round(i.requests), i.rtt);
    return { parsed: refParse(clean), total: m.total, handshakes: m.handshakes, finish: m.finish };
  },
};

const REQ = 'GET /index.html HTTP/1.1\r\nHost: example.com\r\n\r\n';

const reqTests = [
  { args: [REQ], expected: { method: 'GET', path: '/index.html', version: 'HTTP/1.1', headers: { host: 'example.com' }, body: '' }, name: 'simple GET' },
  {
    args: ['POST /api HTTP/1.1\r\nHost: a.test\r\nContent-Type: application/json\r\nContent-Length: 7\r\n\r\n{"a":1}'],
    expected: { method: 'POST', path: '/api', version: 'HTTP/1.1', headers: { host: 'a.test', 'content-type': 'application/json', 'content-length': '7' }, body: '{"a":1}' },
    name: 'POST with a body',
  },
  { args: ['GET / HTTP/1.1\r\nHOST: a.test\r\ncontent-TYPE: text/plain\r\n\r\n'], expected: { method: 'GET', path: '/', version: 'HTTP/1.1', headers: { host: 'a.test', 'content-type': 'text/plain' }, body: '' }, name: 'header names are case-insensitive' },
  { args: ['GET / HTTP/1.1\r\nHost: localhost:3000\r\n\r\n'], expected: { method: 'GET', path: '/', version: 'HTTP/1.1', headers: { host: 'localhost:3000' }, body: '' }, name: 'colon inside a value' },
  { args: ['GET / HTTP/1.1\r\nX-Test:   spaced value  \r\n\r\n'], expected: { method: 'GET', path: '/', version: 'HTTP/1.1', headers: { 'x-test': 'spaced value' }, body: '' }, name: 'value is trimmed' },
  { args: ['GET /search?q=a%20b&page=2 HTTP/1.1\r\nHost: x\r\n\r\n'], expected: { method: 'GET', path: '/search?q=a%20b&page=2', version: 'HTTP/1.1', headers: { host: 'x' }, body: '' }, name: 'query string stays in the path' },
  { args: ['GET / HTTP/1.1\nHost: x\n\n'], expected: { method: 'GET', path: '/', version: 'HTTP/1.1', headers: { host: 'x' }, body: '' }, name: 'bare LF line endings' },
  { args: ['POST /p HTTP/1.1\r\nHost: x\r\n\r\nline1\r\n\r\nline2'], expected: { method: 'POST', path: '/p', version: 'HTTP/1.1', headers: { host: 'x' }, body: 'line1\r\n\r\nline2' }, name: 'blank lines inside the body' },
];

const unit: Unit = {
  id: 'web-http',
  hook: 'Every front-end and API interview eventually asks "what is actually sent over the wire?" Being able to read a raw request and explain keep-alive and HTTP/2 multiplexing shows you understand more than `fetch()`.',
  predict: {
    prompt: 'A page needs 3 small files from the same server. Over ONE HTTP/1.1 keep-alive connection (no pipelining) vs HTTP/2, what changes?',
    options: ['HTTP/1.1 keep-alive must send the requests one after another on that connection; HTTP/2 sends all three at once on streams', 'Nothing: keep-alive already multiplexes requests', 'HTTP/2 needs three connections, one per file', 'HTTP/1.1 keep-alive skips the TLS handshake but HTTP/2 does not'],
    answer: 0,
    explain: 'Keep-alive only saves the handshake: each request still waits for the previous response (head-of-line blocking). HTTP/2 frames many streams over the same connection, so a slow response does not delay the others.',
  },
  viz,
  simulationNote: 'A simple latency model: handshake = 2 RTT, request = 1 RTT + server time, one connection at a time for HTTP/1.1 (browsers really open up to six). Bandwidth, TCP slow start and TLS resumption are ignored.',
  deeper: {
    points: [
      'An HTTP/1.1 message is text: a start line, header lines, one blank line, then an optional body. The blank line is the only separator, so a body may contain blank lines itself.',
      'Header names are case-insensitive; values are not. Repeated headers can be combined as a comma-separated list (except Set-Cookie).',
      '`Content-Length` (or chunked encoding) tells the receiver where the body ends, which is what makes keep-alive possible.',
      'HTTP/1.1 keep-alive reuses the TCP/TLS connection but still handles one in-flight request at a time per connection.',
      'HTTP/2 splits each message into binary frames tagged with a stream id, so many requests share one connection without blocking each other (TCP-level loss can still stall all streams).',
    ],
    pitfalls: ['Splitting a header line on every `:` and losing the port in `Host: localhost:3000`', 'Treating header names as case-sensitive when reading them', 'Assuming HTTP/2 makes bundling and caching irrelevant'],
  },
  practice: {
    language: 'javascript',
    fnName: 'parseRequest',
    statement: 'Parse a raw HTTP/1.1 request string into {method, path, version, headers, body}. Header names become lowercase and values are trimmed. The first blank line separates headers from the body; accept CRLF or bare LF.',
    signature: 'function parseRequest(raw) {',
    solution: String.raw`function parseRequest(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(@@m.index + m[0].length@@) : '';
  const lines = head.split(/\r?\n/);
  const [method, path, version] = @@lines[0].split(' ')@@;
  const headers = {};
  for (const line of lines.slice(1)) {
    const i = @@line.indexOf(':')@@;
    headers[@@line.slice(0, i).trim().toLowerCase()@@] = line.slice(i + 1).trim();
  }
  return { method, path, version, headers, body };
}`,
    tests: reqTests,
  },
  debug: {
    language: 'javascript',
    fnName: 'parseRequest',
    statement: 'Code that reads `req.headers["content-type"]` gets undefined for requests sent by some clients. Find the bug in the parser.',
    buggy: String.raw`function parseRequest(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(m.index + m[0].length) : '';
  const lines = head.split(/\r?\n/);
  const [method, path, version] = lines[0].split(' ');
  const headers = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { method, path, version, headers, body };
}`,
    fixed: String.raw`function parseRequest(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(m.index + m[0].length) : '';
  const lines = head.split(/\r?\n/);
  const [method, path, version] = lines[0].split(' ');
  const headers = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { method, path, version, headers, body };
}`,
    tests: reqTests,
    bugType: 'case-sensitive header names',
    hint: 'One client sends `Content-Type`, another `content-type`. What key does each end up under?',
    explanation: 'HTTP header names are case-insensitive, and HTTP/2 even requires them lowercase. Normalise names once (toLowerCase) when parsing, otherwise lookups depend on how each client capitalises its headers.',
  },
  boss: {
    title: 'Parse a response and decide on keep-alive',
    language: 'javascript',
    fnName: 'parseResponse',
    statement:
      'Parse a raw HTTP response into {version, status, reason, headers, body, keepAlive}. status is a number; reason is the rest of the status line (may contain spaces, may be empty). Header names are lowercase and trimmed; repeated headers are joined with ", ". If Content-Length is present the body is cut to that many characters. keepAlive: HTTP/1.1 defaults to true unless "Connection: close"; HTTP/1.0 defaults to false unless "Connection: keep-alive" (compare case-insensitively).',
    starter: `function parseResponse(raw) {
  // your code here
}
`,
    solution: String.raw`function parseResponse(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  const head = m ? raw.slice(0, m.index) : raw;
  let body = m ? raw.slice(m.index + m[0].length) : '';
  const lines = head.split(/\r?\n/);
  const first = lines[0].split(' ');
  const version = first[0];
  const status = Number(first[1]);
  const reason = first.slice(2).join(' ');
  const headers = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    headers[name] = name in headers ? headers[name] + ', ' + value : value;
  }
  if (headers['content-length'] !== undefined) body = body.slice(0, Number(headers['content-length']));
  const conn = (headers.connection || '').toLowerCase();
  const keepAlive = version === 'HTTP/1.0' ? conn === 'keep-alive' : conn !== 'close';
  return { version, status, reason, headers, body, keepAlive };
}`,
    tests: [
      { args: ['HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nhello'], expected: { version: 'HTTP/1.1', status: 200, reason: 'OK', headers: { 'content-type': 'text/plain', 'content-length': '5' }, body: 'hello', keepAlive: true }, name: 'plain 200' },
      { args: ['HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n'], expected: { version: 'HTTP/1.1', status: 404, reason: 'Not Found', headers: { 'content-length': '0' }, body: '', keepAlive: true }, name: 'reason with a space' },
      { args: ['HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nbye'], expected: { version: 'HTTP/1.1', status: 200, reason: 'OK', headers: { connection: 'close' }, body: 'bye', keepAlive: false }, name: 'Connection: close' },
      { args: ['HTTP/1.0 200 OK\r\n\r\nx'], expected: { version: 'HTTP/1.0', status: 200, reason: 'OK', headers: {}, body: 'x', keepAlive: false }, name: 'HTTP/1.0 closes by default' },
      { args: ['HTTP/1.0 200 OK\r\nConnection: Keep-Alive\r\n\r\n'], expected: { version: 'HTTP/1.0', status: 200, reason: 'OK', headers: { connection: 'Keep-Alive' }, body: '', keepAlive: true }, name: 'HTTP/1.0 keep-alive opt-in' },
      { args: ['HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabcdef'], expected: { version: 'HTTP/1.1', status: 200, reason: 'OK', headers: { 'content-length': '3' }, body: 'abc', keepAlive: true }, name: 'body cut to Content-Length' },
      { args: ['HTTP/1.1 200 OK\r\nVary: Accept-Encoding\r\nVary: Origin\r\n\r\n'], expected: { version: 'HTTP/1.1', status: 200, reason: 'OK', headers: { vary: 'Accept-Encoding, Origin' }, body: '', keepAlive: true }, name: 'repeated headers are joined' },
      { args: ['HTTP/1.1 204 No Content\r\n\r\n'], expected: { version: 'HTTP/1.1', status: 204, reason: 'No Content', headers: {}, body: '', keepAlive: true }, name: '204 without a body' },
    ],
    hints: ['Reuse the request parser idea: split at the first blank line, then the start line, then headers. Only the start line differs.', 'The status line is "VERSION CODE REASON...": split on spaces and join everything after the second token. Default keep-alive depends on the HTTP version.'],
    combines: ['web-cache-headers'],
  },
  quiz: [
    {
      prompt: 'Which statement about HTTP header names is correct?',
      options: ['They are case-sensitive', 'They are case-insensitive', 'Only `Host` is case-insensitive', 'They must be uppercase'],
      answer: 1,
      explain: 'Header names are case-insensitive in HTTP/1.1 (and HTTP/2 sends them lowercase). Header values may be case-sensitive.',
    },
  ],
};

export default unit;
