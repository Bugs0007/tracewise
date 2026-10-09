import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, Seq, kvPanel, step } from '@/content/lib/ai-mcp-agents';

const code = `
def discover(client):
    caps = client.initialize()["capabilities"]               #@init
    found = {}
    for kind in ("tools", "resources", "prompts"):
        if kind not in caps:
            continue                                          #@skip
        items, cursor = [], None
        while True:
            page = client.request(kind + "/list", cursor)     #@list
            items += page[kind]
            cursor = page.get("nextCursor")                   #@cursor
            if cursor is None:
                break
        found[kind] = items                                   #@store
    return found
`;

const KINDS = ['tools', 'resources', 'prompts'] as const;
const CATALOG: Record<(typeof KINDS)[number], string[]> = {
  tools: ['read_file', 'list_dir', 'query'],
  resources: ['file:///notes.md', 'file:///todo.md'],
  prompts: ['summarize', 'review'],
};
const MODES = ['tools only', 'tools + resources', 'all three'];

interface In {
  mode: string;
  pageSize: number;
}

const declared = (mode: string): string[] => (mode === 'tools only' ? ['tools'] : mode === 'tools + resources' ? ['tools', 'resources'] : [...KINDS]);

function simulate(mode: string, pageSize: number) {
  const caps = declared(mode);
  const found: Record<string, string[]> = {};
  let requests = 1;
  for (const kind of KINDS) {
    if (!caps.includes(kind)) continue;
    const all = CATALOG[kind];
    const items: string[] = [];
    let at = 0;
    for (;;) {
      requests++;
      items.push(...all.slice(at, at + pageSize));
      at += pageSize;
      if (at >= all.length) break;
    }
    found[kind] = items;
  }
  return { found: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])), requests };
}

const viz: VizDef<In> = {
  id: 'mcp-discovery',
  title: 'MCP discovery: tools, resources, prompts',
  code,
  language: 'python',
  inputs: [
    { key: 'mode', label: 'Server capabilities', kind: 'select', options: MODES, default: 'all three' },
    { key: 'pageSize', label: 'Page size', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'All three, pages of 2', input: { mode: 'all three', pageSize: 2 } },
    { label: 'Tools only', input: { mode: 'tools only', pageSize: 5 } },
    { label: 'One item per page', input: { mode: 'tools + resources', pageSize: 1 } },
  ],
  run({ mode, pageSize }) {
    if (!MODES.includes(mode)) throw new Error('mode must be one of: ' + MODES.join(', '));
    const size = Math.round(pageSize);
    if (!(size >= 1 && size <= 10)) throw new Error('Page size must be between 1 and 10');
    const r = new Recorder(code);
    const seq = new Seq(['Client', 'Server'], 'MCP discovery');
    const caps = declared(mode);
    const found: Record<string, number> = {};
    let requests = 0;
    const state = (extra: Record<string, string> = {}) => kvPanel('Client state', { requests, ...Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v + ' found'])), ...extra }, Object.fromEntries(Object.keys(found).map((k) => [k, 'found' as Tone])));

    seq.send('Client', 'Server', 'initialize {protocolVersion}');
    requests++;
    r.op();
    step(r, 'init', 'Client opens the session with an initialize request', [seq.panel(), state()], { requests });
    seq.send('Server', 'Client', 'result {capabilities: ' + caps.join(', ') + '}', 'done', true);
    step(r, 'init', `Server answers with what it supports: ${caps.join(', ')}`, [seq.panel(), state()], { caps: caps.join(',') });
    seq.send('Client', 'Server', 'notifications/initialized');
    for (const kind of KINDS) {
      if (!caps.includes(kind)) {
        step(r, 'skip', `Server did not declare "${kind}", so the client never asks for it`, [seq.panel(), state()], { skipped: kind });
        continue;
      }
      const all = CATALOG[kind];
      const items: string[] = [];
      let at = 0;
      let cursor: string | null = null;
      for (;;) {
        requests++;
        r.op();
        seq.send('Client', 'Server', `${kind}/list` + (cursor ? ` {cursor: ${cursor}}` : ''));
        step(r, 'list', `Client asks for ${kind}${cursor ? ' (next page)' : ''}`, [seq.panel(), state()], { kind, cursor: cursor ?? 'none' });
        const page = all.slice(at, at + size);
        at += size;
        items.push(...page);
        cursor = at < all.length ? String(at) : null;
        seq.send('Server', 'Client', `${page.join(', ')}${cursor ? ' +nextCursor' : ''}`, 'done', true);
        found[kind] = items.length;
        step(r, 'cursor', cursor ? `Got ${page.length} ${kind}; nextCursor="${cursor}" means more pages` : `Got ${page.length} ${kind}; no nextCursor, the list is complete`, [seq.panel(), state()], { got: page.length, nextCursor: cursor ?? 'none' });
        if (cursor === null) break;
      }
      step(r, 'store', `${items.length} ${kind} discovered: ${items.join(', ')}`, [seq.panel(), state()], { kind, total: items.length });
    }
    return { frames: r.frames, result: { found: { ...found }, requests } };
  },
  reference({ mode, pageSize }) {
    return simulate(mode, Math.round(pageSize));
  },
};

const unit: Unit = {
  id: 'mcp-discovery',
  hook: 'Before a model can use anything, the client has to find out what exists. Interviewers ask which of tools, resources and prompts a server declared and how long lists are paged.',
  predict: {
    prompt: 'A server declares only the "tools" capability. What should the client do about resources/list?',
    options: ['Call it anyway; an empty list is fine', 'Skip it: the server did not declare resources', 'Call it once at startup, then cache the error', 'Ask the model whether it needs resources'],
    answer: 1,
    explain: 'Capabilities are negotiated in initialize. A client only uses features the server declared, otherwise it risks "method not found" errors and wasted round trips.',
  },
  viz,
  deeper: {
    points: [
      'initialize exchanges protocol version and capabilities, then the client sends notifications/initialized. Only after that are list requests allowed.',
      'tools/list returns name, description and an inputSchema (JSON Schema). That schema is what the model sees and what arguments are validated against.',
      'resources are read-only data addressed by URI (files, rows, documents); prompts are reusable templates the user picks.',
      'List calls are paginated with an opaque cursor: keep requesting with nextCursor until it is absent. Never parse or build cursors yourself.',
      'Servers can notify list_changed, and the client then re-lists instead of trusting stale data.',
    ],
    pitfalls: ['Stopping when a page is empty instead of when nextCursor is missing', 'Treating booleans as integers when validating arguments against inputSchema', 'Listing capabilities the server never declared'],
  },
  practice: {
    language: 'python',
    fnName: 'collect_pages',
    harness: `
def run_pages(fn, pages):
    def fetch(cursor):
        i = 0 if cursor is None else int(cursor)
        items = pages[i] if i < len(pages) else []
        nxt = str(i + 1) if i + 1 < len(pages) else None
        return {"items": items, "nextCursor": nxt}
    return fn(fetch)
`,
    adapter: 'run_pages',
    statement: 'collect_pages(fetch) calls fetch(cursor) starting with cursor=None. Each reply is {"items": [...], "nextCursor": str or None}. Keep fetching with the returned cursor until it is None and return all items in order.',
    signature: 'def collect_pages(fetch):',
    solution: `def collect_pages(fetch):
    items = []
    cursor = None
    while True:
        page = @@fetch(cursor)@@
        items.extend(page["items"])
        cursor = @@page.get("nextCursor")@@
        if @@cursor is None@@:
            break
    return items`,
    tests: [
      { args: [[[1, 2], [3], [4, 5]]], expected: [1, 2, 3, 4, 5], name: 'three pages' },
      { args: [[['a']]], expected: ['a'], name: 'single page' },
      { args: [[[1], [], [2]]], expected: [1, 2], name: 'empty page in the middle' },
      { args: [[[]]], expected: [], name: 'nothing to list' },
      { args: [[[1, 2, 3, 4]]], expected: [1, 2, 3, 4], name: 'one large page' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'validate_args',
    statement: 'validate_args(schema, args) checks tool arguments against a small JSON Schema ({"properties": {name: {"type": ...}}, "required": [...]}) and returns a sorted list of errors: "missing: x" or "type: x expected integer". A model sent {"count": true} for an integer field and it was accepted.',
    buggy: `PY_TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool}

def validate_args(schema, args):
    errors = []
    for name in schema.get("required", []):
        if name not in args:
            errors.append("missing: " + name)
    for name, spec in schema.get("properties", {}).items():
        if name in args and not isinstance(args[name], PY_TYPES[spec["type"]]):
            errors.append("type: " + name + " expected " + spec["type"])
    return sorted(errors)`,
    fixed: `PY_TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool}

def is_type(value, kind):
    if kind != "boolean" and isinstance(value, bool):
        return False
    return isinstance(value, PY_TYPES[kind])

def validate_args(schema, args):
    errors = []
    for name in schema.get("required", []):
        if name not in args:
            errors.append("missing: " + name)
    for name, spec in schema.get("properties", {}).items():
        if name in args and not is_type(args[name], spec["type"]):
            errors.append("type: " + name + " expected " + spec["type"])
    return sorted(errors)`,
    tests: [
      { args: [{ properties: { n: { type: 'integer' } }, required: ['n'] }, { n: 3 }], expected: [], name: 'valid integer' },
      { args: [{ properties: { n: { type: 'integer' } }, required: ['n'] }, { n: true }], expected: ['type: n expected integer'], name: 'bool is not an integer' },
      { args: [{ properties: { x: { type: 'number' } } }, { x: false }], expected: ['type: x expected number'], name: 'bool is not a number' },
      { args: [{ properties: { a: { type: 'string' }, b: { type: 'boolean' } }, required: ['a', 'b'] }, { b: 1 }], expected: ['missing: a', 'type: b expected boolean'], name: 'missing plus wrong type' },
      { args: [{ properties: { f: { type: 'boolean' }, x: { type: 'number' } } }, { f: true, x: 2 }], expected: [], name: 'int allowed as number' },
    ],
    bugType: 'bool is an int',
    hint: 'In Python, isinstance(True, int) is True. What does that do to an "integer" check?',
    explanation: 'bool is a subclass of int, so a plain isinstance check lets true/false pass for integer and number fields. Reject booleans explicitly unless the schema type is boolean. JSON Schema treats them as different types.',
  },
  boss: {
    title: 'Discover everything',
    statement: 'Write discover(client). Call client.initialize() (returns {"capabilities": {...}}), then for each of "tools", "resources", "prompts" that the server declared, in that order, page through client.request(kind + "/list", cursor) (first cursor is None; each reply is {kind: [items], "nextCursor": optional}). Return {kind: all_items} for declared kinds only and never request a kind that was not declared.',
    language: 'python',
    fnName: 'discover',
    harness: `
class FakeClient:
    def __init__(self, caps, data, page_size):
        self.caps = caps
        self.data = data
        self.page_size = page_size
        self.log = []

    def initialize(self):
        self.log.append("initialize")
        return {"capabilities": {k: {} for k in self.caps}}

    def request(self, method, cursor=None):
        self.log.append(method)
        kind = method.split("/")[0]
        items = self.data.get(kind, [])
        i = int(cursor) if cursor is not None else 0
        out = {kind: items[i:i + self.page_size]}
        if i + self.page_size < len(items):
            out["nextCursor"] = str(i + self.page_size)
        return out

def run_discover(fn, caps, data, page_size):
    client = FakeClient(caps, data, page_size)
    found = fn(client)
    return {"found": found, "requests": client.log}
`,
    adapter: 'run_discover',
    starter: `def discover(client):
    # your code here
    pass
`,
    solution: `def discover(client):
    caps = client.initialize()["capabilities"]
    found = {}
    for kind in ("tools", "resources", "prompts"):
        if kind not in caps:
            continue
        items = []
        cursor = None
        while True:
            page = client.request(kind + "/list", cursor)
            items.extend(page[kind])
            cursor = page.get("nextCursor")
            if cursor is None:
                break
        found[kind] = items
    return found`,
    tests: [
      { args: [['tools', 'prompts'], { tools: ['a', 'b', 'c'], prompts: ['p'], resources: ['r'] }, 2], expected: { found: { tools: ['a', 'b', 'c'], prompts: ['p'] }, requests: ['initialize', 'tools/list', 'tools/list', 'prompts/list'] }, name: 'skips undeclared resources' },
      { args: [['resources'], { resources: ['x', 'y', 'z'] }, 1], expected: { found: { resources: ['x', 'y', 'z'] }, requests: ['initialize', 'resources/list', 'resources/list', 'resources/list'] }, name: 'one item per page' },
      { args: [[], { tools: ['a'] }, 5], expected: { found: {}, requests: ['initialize'] }, name: 'nothing declared' },
      { args: [['prompts', 'tools'], { tools: ['t1'], prompts: ['p1', 'p2'] }, 10], expected: { found: { tools: ['t1'], prompts: ['p1', 'p2'] }, requests: ['initialize', 'tools/list', 'prompts/list'] }, name: 'fixed order, one page each' },
      { args: [['tools'], {}, 3], expected: { found: { tools: [] }, requests: ['initialize', 'tools/list'] }, name: 'declared but empty' },
    ],
    hints: ['Read the capabilities once, then loop over the three kinds in a fixed order and skip the ones that are missing.', 'Inside each kind, keep requesting with the cursor from the previous reply until "nextCursor" is absent.'],
    combines: ['mcp-roles'],
  },
  quiz: [
    {
      prompt: 'How does a client know a paginated tools/list is finished?',
      options: ['A page comes back empty', 'The reply has no nextCursor', 'It has made 10 requests', 'The server closes the connection'],
      answer: 1,
      explain: 'The cursor is opaque. A reply without nextCursor is the last page; an empty page in the middle does not mean the end.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
