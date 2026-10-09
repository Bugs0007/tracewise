import { Recorder } from '@/engine/recorder';
import type { ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';

const code = `
HANDLERS = {1: user_v1, 2: user_v2}
DEPRECATED = {1}

def get_version(path, headers, query, style):
    if style == "url":
        first = path.strip("/").split("/")[0]                #@url
        return int(first[1:])
    if style == "header":
        return int(headers.get("x-api-version", 1))          #@header
    return int(query.get("version", 1))                      #@query

def route(path, headers, query, style):
    version = get_version(path, headers, query, style)       #@pick
    handler = HANDLERS.get(version)                          #@lookup
    if handler is None:
        return 400, {"error": "unsupported version"}         #@unsupported
    body = handler(1)                                        #@call
    extra = {"Deprecation": "true"} if version in DEPRECATED else {}   #@deprecate
    return 200, body, extra                                  #@done
`;

const STYLES = ['url', 'header', 'query'];

interface In {
  style: string;
  versions: number[];
}

const V1 = { id: 1, name: 'Ada Lovelace' };
const V2 = { id: 1, first_name: 'Ada', last_name: 'Lovelace' };

function request(style: string, v: number): { path: string; headers: Record<string, string>; query: Record<string, string> } {
  if (style === 'url') return { path: `/v${v}/users/1`, headers: {}, query: {} };
  if (style === 'header') return { path: '/users/1', headers: { 'x-api-version': String(v) }, query: {} };
  return { path: '/users/1', headers: {}, query: { version: String(v) } };
}

const viz: VizDef<In> = {
  id: 'be-versioning',
  title: 'Routing a request to v1 or v2',
  code,
  language: 'python',
  inputs: [
    { key: 'style', label: 'Where the version lives', kind: 'select', default: 'url', options: STYLES },
    { key: 'versions', label: 'Versions the clients ask for', kind: 'numbers', default: [1, 2, 3, 1], maxItems: 6 },
  ],
  presets: [
    { label: 'URL path', input: { style: 'url', versions: [1, 2, 3, 1] } },
    { label: 'Header', input: { style: 'header', versions: [2, 1, 9] } },
    { label: 'Query param', input: { style: 'query', versions: [1, 2, 2] } },
  ],
  run({ style, versions }) {
    const r = new Recorder(code);
    const st = STYLES.includes(style) ? style : 'url';
    const out: [number, number][] = [];
    const lines: { text: string; tone?: Tone }[] = [];
    const handlers = (active?: number): ListPanel => ({
      type: 'list',
      title: 'Registered handlers',
      orientation: 'horizontal',
      items: [
        { id: 'h1', label: 'user_v1', sub: 'deprecated', tone: active === 1 ? 'active' : 'muted' },
        { id: 'h2', label: 'user_v2', sub: 'current', tone: active === 2 ? 'active' : 'default' },
      ],
    });
    const panels = (q: ReturnType<typeof request>, active?: number): Panel[] => [
      kvPanel('Incoming request', { path: q.path, headers: JSON.stringify(q.headers), query: JSON.stringify(q.query), style: st }),
      handlers(active),
      logPanel('Responses', lines),
    ];
    for (const v of versions) {
      const q = request(st, v);
      r.op();
      const anchor = st === 'url' ? 'url' : st === 'header' ? 'header' : 'query';
      const where = st === 'url' ? `the first path segment is "v${v}"` : st === 'header' ? `header x-api-version = ${v}` : `query param version = ${v}`;
      r.step(anchor, `Read the version from ${where}`, panels(q), { requested: v });
      r.step('pick', `The request asks for version ${v}`, panels(q), { version: v });
      const ok = v === 1 || v === 2;
      r.step('lookup', ok ? `HANDLERS[${v}] exists: use user_v${v}` : `HANDLERS has no entry for ${v}`, panels(q, ok ? v : undefined), { version: v });
      if (!ok) {
        lines.push({ text: `v${v} -> 400 unsupported version`, tone: 'error' });
        r.step('unsupported', `400: version ${v} is unknown, so say so instead of guessing`, panels(q), { status: 400 });
        out.push([v, 400]);
        continue;
      }
      r.step('call', v === 1 ? 'user_v1 returns {"name": "Ada Lovelace"}' : 'user_v2 returns first_name and last_name', panels(q, v), { status: 200 });
      if (v === 1) r.step('deprecate', 'v1 is deprecated: add a Deprecation header so clients can migrate', panels(q, v), { Deprecation: 'true' });
      lines.push({ text: `v${v} -> 200 ${JSON.stringify(v === 1 ? V1 : V2)}${v === 1 ? ' + Deprecation: true' : ''}`, tone: v === 1 ? 'compare' : 'found' });
      r.step('done', `200 from v${v}`, panels(q, v), { status: 200 });
      out.push([v, 200]);
    }
    return { frames: r.frames, result: out };
  },
  reference({ versions }) {
    return versions.map((v): [number, number] => [v, [1, 2].includes(v) ? 200 : 400]);
  },
};

const unit: Unit = {
  id: 'be-versioning',
  hook: 'Public APIs cannot change shape under their clients. Knowing where the version lives, and how to retire an old one politely, is a standard API-design talking point.',
  predict: {
    prompt: 'A CDN caches responses by URL only. Clients call `GET /users/1` with header `X-API-Version: 1` or `2`. What goes wrong if the server sends no `Vary` header?',
    options: ['Nothing, headers are part of the cache key', 'A client can receive the other version\'s cached body', 'The CDN rejects both requests', 'Version 2 requests become 404'],
    answer: 1,
    explain: 'The cache sees one URL, stores the first response, and serves it to everyone. Header-based versioning needs `Vary: X-API-Version` (or a URL that contains the version) so each version is cached separately.',
  },
  viz,
  deeper: {
    points: [
      '**URL path** (`/v2/users`): explicit, easy to log, cache and try in a browser; the most common choice.',
      '**Header** (`X-API-Version` or a media type): clean URLs, but invisible in links and needs `Vary` for caches.',
      '**Query param** (`?version=2`): easy to add, easy to forget; often used for opt-in previews.',
      'Pick a default for requests with no version (usually the oldest, so existing clients never break) and return 400 for versions you do not know.',
      'Retire a version with `Deprecation` / `Sunset` headers and docs first, metrics second (who still calls v1?), removal last.',
    ],
    pitfalls: ['Silently falling back to some version for unknown values', 'Bumping the version for additive changes (new optional fields do not need v3)', 'Letting two sources disagree without a documented precedence'],
  },
  practice: {
    language: 'python',
    fnName: 'handle',
    statement:
      'Pick the API version for a request. A leading `/vN/` path segment wins (and is removed from the resource); otherwise use header `x-api-version`; otherwise query param `version`; default 1. Supported versions are 1 and 2 (1 is deprecated). Return `{"status", "version", "deprecated", "resource"}`; an unsupported or non-numeric version gives `{"status": 400, "version": None, "deprecated": False, "resource": None}`. `resource` is the remaining path without slashes at the ends.',
    signature: 'def handle(path, headers, query):',
    solution: `SUPPORTED = {1, 2}
DEPRECATED = {1}

def handle(path, headers, query):
    parts = path.strip("/").split("/")
    raw = None
    if parts[0][:1] == "v" and @@parts[0][1:].isdigit()@@:
        raw = parts[0][1:]
        parts = @@parts[1:]@@
    elif @@"x-api-version" in headers@@:
        raw = headers["x-api-version"]
    elif "version" in query:
        raw = query["version"]
    version = 1 if raw is None else (int(raw) if str(raw).isdigit() else None)
    if @@version not in SUPPORTED@@:
        return {"status": 400, "version": None, "deprecated": False, "resource": None}
    return {"status": 200, "version": version, "deprecated": @@version in DEPRECATED@@, "resource": "/".join(parts)}`,
    tests: [
      { args: ['/v2/users/1', {}, {}], expected: { status: 200, version: 2, deprecated: false, resource: 'users/1' }, name: 'URL v2' },
      { args: ['/v1/users/1', {}, {}], expected: { status: 200, version: 1, deprecated: true, resource: 'users/1' }, name: 'URL v1 is deprecated' },
      { args: ['/users/1', { 'x-api-version': '2' }, {}], expected: { status: 200, version: 2, deprecated: false, resource: 'users/1' }, name: 'header' },
      { args: ['/users/1', {}, { version: '2' }], expected: { status: 200, version: 2, deprecated: false, resource: 'users/1' }, name: 'query param' },
      { args: ['/users/1', {}, {}], expected: { status: 200, version: 1, deprecated: true, resource: 'users/1' }, name: 'default is v1' },
      { args: ['/v3/users/1', {}, {}], expected: { status: 400, version: null, deprecated: false, resource: null }, name: 'unknown version' },
      { args: ['/users/1', { 'x-api-version': 'beta' }, {}], expected: { status: 400, version: null, deprecated: false, resource: null }, name: 'non-numeric version' },
      { args: ['/v2/users/1', { 'x-api-version': '1' }, {}], expected: { status: 200, version: 2, deprecated: false, resource: 'users/1' }, name: 'URL beats header' },
      { args: ['/vault/keys', {}, {}], expected: { status: 200, version: 1, deprecated: true, resource: 'vault/keys' }, name: 'vault is not a version' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'handle',
    statement: 'A client typo (`/v7/users/1`) returns 200 with the v1 payload, so nobody notices the integration is calling the wrong thing. Fix the router.',
    buggy: `SUPPORTED = {1, 2}
DEPRECATED = {1}

def handle(path, headers, query):
    parts = path.strip("/").split("/")
    raw = None
    if parts[0][:1] == "v" and parts[0][1:].isdigit():
        raw = parts[0][1:]
        parts = parts[1:]
    elif "x-api-version" in headers:
        raw = headers["x-api-version"]
    elif "version" in query:
        raw = query["version"]
    version = 1 if raw is None else (int(raw) if str(raw).isdigit() else None)
    if version not in SUPPORTED:
        version = 1
    return {"status": 200, "version": version, "deprecated": version in DEPRECATED, "resource": "/".join(parts)}`,
    fixed: `SUPPORTED = {1, 2}
DEPRECATED = {1}

def handle(path, headers, query):
    parts = path.strip("/").split("/")
    raw = None
    if parts[0][:1] == "v" and parts[0][1:].isdigit():
        raw = parts[0][1:]
        parts = parts[1:]
    elif "x-api-version" in headers:
        raw = headers["x-api-version"]
    elif "version" in query:
        raw = query["version"]
    version = 1 if raw is None else (int(raw) if str(raw).isdigit() else None)
    if version not in SUPPORTED:
        return {"status": 400, "version": None, "deprecated": False, "resource": None}
    return {"status": 200, "version": version, "deprecated": version in DEPRECATED, "resource": "/".join(parts)}`,
    tests: [
      { args: ['/v2/users/1', {}, {}], expected: { status: 200, version: 2, deprecated: false, resource: 'users/1' }, name: 'v2' },
      { args: ['/users/1', {}, {}], expected: { status: 200, version: 1, deprecated: true, resource: 'users/1' }, name: 'default' },
      { args: ['/v7/users/1', {}, {}], expected: { status: 400, version: null, deprecated: false, resource: null }, name: 'unknown version' },
      { args: ['/users/1', { 'x-api-version': 'beta' }, {}], expected: { status: 400, version: null, deprecated: false, resource: null }, name: 'garbage header' },
    ],
    bugType: 'silent fallback',
    hint: 'What should the server do with a version it has never heard of?',
    explanation: 'Falling back to v1 hides client bugs and ties unknown callers to the oldest contract. An unknown version is a client error: respond 400 and list the supported versions.',
  },
  boss: {
    title: 'Two-version users endpoint',
    statement:
      'The harness defines `USERS = {1: {"first": "Ada", "last": "Lovelace"}, 2: {"first": "Alan", "last": "Turing"}}`. Implement `get_user(path, headers, query)` returning `{"status", "headers", "body"}`. Pick the version like before (URL `/vN/`, then header `x-api-version`, then query `version`, default 1; unsupported or non-numeric -> 400 body `{"error": "unsupported version"}`, headers `{}`). The remaining path must be `users/<id>` for a known user, else 404 body `{"error": "not found"}`. v1 body: `{"id", "name": "First Last"}` with headers `{"Deprecation": "true", "Sunset": "2027-01-01"}`. v2 body: `{"id", "first_name", "last_name"}` with headers `{}`. Error responses have headers `{}`.',
    language: 'python',
    fnName: 'get_user',
    harness: `USERS = {1: {"first": "Ada", "last": "Lovelace"}, 2: {"first": "Alan", "last": "Turing"}}
`,
    starter: `def get_user(path, headers, query):
    # your code here
    pass
`,
    solution: `def get_user(path, headers, query):
    parts = path.strip("/").split("/")
    raw = None
    if parts[0][:1] == "v" and parts[0][1:].isdigit():
        raw = parts[0][1:]
        parts = parts[1:]
    elif "x-api-version" in headers:
        raw = headers["x-api-version"]
    elif "version" in query:
        raw = query["version"]
    version = 1 if raw is None else (int(raw) if str(raw).isdigit() else None)
    if version not in (1, 2):
        return {"status": 400, "headers": {}, "body": {"error": "unsupported version"}}
    if len(parts) != 2 or parts[0] != "users" or not parts[1].isdigit() or int(parts[1]) not in USERS:
        return {"status": 404, "headers": {}, "body": {"error": "not found"}}
    uid = int(parts[1])
    user = USERS[uid]
    if version == 1:
        return {"status": 200, "headers": {"Deprecation": "true", "Sunset": "2027-01-01"}, "body": {"id": uid, "name": user["first"] + " " + user["last"]}}
    return {"status": 200, "headers": {}, "body": {"id": uid, "first_name": user["first"], "last_name": user["last"]}}`,
    tests: [
      { args: ['/v1/users/1', {}, {}], expected: { status: 200, headers: { Deprecation: 'true', Sunset: '2027-01-01' }, body: { id: 1, name: 'Ada Lovelace' } }, name: 'v1 shape and deprecation' },
      { args: ['/v2/users/2', {}, {}], expected: { status: 200, headers: {}, body: { id: 2, first_name: 'Alan', last_name: 'Turing' } }, name: 'v2 shape' },
      { args: ['/users/1', { 'x-api-version': '2' }, {}], expected: { status: 200, headers: {}, body: { id: 1, first_name: 'Ada', last_name: 'Lovelace' } }, name: 'header selects v2' },
      { args: ['/users/2', {}, { version: '1' }], expected: { status: 200, headers: { Deprecation: 'true', Sunset: '2027-01-01' }, body: { id: 2, name: 'Alan Turing' } }, name: 'query selects v1' },
      { args: ['/v3/users/1', {}, {}], expected: { status: 400, headers: {}, body: { error: 'unsupported version' } }, name: 'unknown version' },
      { args: ['/v2/users/9', {}, {}], expected: { status: 404, headers: {}, body: { error: 'not found' } }, name: 'unknown user' },
      { args: ['/v2/orders/1', {}, {}], expected: { status: 404, headers: {}, body: { error: 'not found' } }, name: 'unknown resource' },
      { args: ['/v9/orders/1', {}, {}], expected: { status: 400, headers: {}, body: { error: 'unsupported version' } }, name: 'version is checked first' },
    ],
    hints: ['Resolve the version first (reuse the practice logic), return 400 if unsupported, then validate the remaining path and user.', 'After stripping the prefix, `parts` must be exactly `["users", "<digits>"]` and the int must be a key of USERS. Build each body from `USERS[uid]`.'],
    combines: ['be-rest-methods'],
  },
  quiz: [
    {
      prompt: 'You add an optional `nickname` field to the user response. Do you need API v3?',
      options: ['Yes, any response change needs a new version', 'No, adding optional fields is backwards compatible', 'Only if the field is a string', 'Yes, but only in the URL'],
      answer: 1,
      explain: 'Well-behaved clients ignore unknown fields. Version only for breaking changes: removed or renamed fields, changed types or meanings.',
    },
  ],
};

export default unit;
