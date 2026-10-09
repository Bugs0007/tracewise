import { Recorder } from '@/engine/recorder';
import type { SequenceMessage, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, HANDLER_HARNESS } from '@/content/lib/frontend-next';

const code = `
// app/api/posts/route.ts
export async function GET(request) {                                          //@get
  return Response.json({ posts: ['a', 'b'] });                                //@getOk
}

export async function POST(request) {                                         //@post
  const { title } = await request.json();                                     //@parse
  if (!title) return Response.json({ error: 'title required' }, { status: 400 });   //@bad
  return Response.json({ created: title }, { status: 201 });                  //@created
}

// Any other method has no export: Next.js answers 405 (or 204 for OPTIONS) itself   //@none
`;

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

interface In {
  exports: string[];
  method: string;
  title: string;
}

function statusFor(exported: string[], method: string, title: string): number {
  if (exported.includes(method)) return method === 'POST' ? (title ? 201 : 400) : 200;
  return method === 'OPTIONS' ? 204 : 405;
}

const viz: VizDef<In> = {
  id: 'next-route-handlers',
  title: 'Route handlers (app/api/.../route.ts)',
  code,
  language: 'javascript',
  inputs: [
    { key: 'exports', label: 'Exported handlers in route.ts', kind: 'strings', default: ['GET', 'POST'], maxItems: 5 },
    { key: 'method', label: 'Request method', kind: 'select', options: METHODS, default: 'POST' },
    { key: 'title', label: 'POST body title (empty = missing)', kind: 'string', default: 'Hello', maxItems: 30 },
  ],
  presets: [
    { label: 'GET works', input: { method: 'GET' } },
    { label: 'POST creates', input: { method: 'POST', title: 'Hello' } },
    { label: 'POST without title', input: { method: 'POST', title: '' } },
    { label: 'DELETE is not exported', input: { method: 'DELETE' } },
    { label: 'OPTIONS (automatic)', input: { method: 'OPTIONS' } },
  ],
  run({ exports: raw, method, title }) {
    const r = new Recorder(code);
    const exported = raw.map((x) => x.toUpperCase()).filter((x) => METHODS.includes(x));
    const msgs: SequenceMessage[] = [];
    const actors = ['Browser', 'Next.js router', 'route.ts'];
    const view = () => [
      { type: 'sequence' as const, title: 'Request flow', actors, messages: [...msgs], active: msgs.length - 1 },
      { type: 'kv' as const, title: 'route.ts exports', entries: METHODS.map((m) => ({ k: m, v: exported.includes(m) ? 'exported' : '-', tone: (exported.includes(m) ? (m === method ? 'found' : 'done') : 'muted') as Tone })) },
    ];
    const vars = (extra: Record<string, unknown> = {}) => ({ method, ...extra });
    const path = '/api/posts';

    msgs.push({ from: 'Browser', to: 'Next.js router', label: `${method} ${path}` });
    r.step('get', cap(`Browser sends ${method} ${path}`), view(), vars());
    msgs.push({ from: 'Next.js router', to: 'route.ts', label: `look for export ${method}`, dashed: true });
    r.step('get', cap(`Router finds app${path}/route.ts and looks for an export named ${method}`), view(), vars({ exports: exported.join(',') || 'none' }));
    r.op();
    const status = statusFor(exported, method, title);
    if (exported.includes(method)) {
      if (method === 'POST') {
        r.step('post', 'The exported POST function is called with the Request', view(), vars());
        r.step('parse', cap(`await request.json() gives title = ${title ? JSON.stringify(title) : 'undefined'}`), view(), vars({ title }));
        if (!title) {
          msgs.push({ from: 'route.ts', to: 'Browser', label: '400 { error }', tone: 'error' });
          r.step('bad', 'No title: return a 400 JSON error', view(), vars({ status }));
        } else {
          msgs.push({ from: 'route.ts', to: 'Browser', label: '201 { created }', tone: 'found' });
          r.step('created', cap(`Return 201 with { created: "${title}" }`), view(), vars({ status }));
        }
      } else {
        r.step('get', cap(`The exported ${method} function runs`), view(), vars());
        msgs.push({ from: 'route.ts', to: 'Browser', label: '200 JSON', tone: 'found' });
        r.step('getOk', 'Return Response.json(...) with status 200', view(), vars({ status }));
      }
    } else if (method === 'OPTIONS') {
      msgs.push({ from: 'Next.js router', to: 'Browser', label: '204 Allow: ' + [...new Set([...exported, 'OPTIONS'])].sort().join(', '), tone: 'found' });
      r.step('none', 'No OPTIONS export: Next.js answers 204 with an Allow header itself', view(), vars({ status }));
    } else {
      msgs.push({ from: 'Next.js router', to: 'Browser', label: '405 Method Not Allowed', tone: 'error' });
      r.step('none', cap(`${method} is not exported: Next.js replies 405 without calling route.ts`), view(), vars({ status }));
    }
    r.step('none', cap(`Final status: ${status}`), view(), vars({ status }));
    return { frames: r.frames, result: status };
  },
  reference({ exports: raw, method, title }) {
    const set = new Set(raw.map((x) => x.toUpperCase()));
    if (!set.has(method)) return method === 'OPTIONS' ? 204 : 405;
    return method === 'POST' && !title ? 400 : method === 'POST' ? 201 : 200;
  },
};

const unit: Unit = {
  id: 'next-route-handlers',
  hook: 'Route handlers are the App Router answer to "where does my API live?". Interviewers probe the details: one function per HTTP method, automatic 405s, and how they differ from pages that render UI.',
  simulationNote: 'Next.js-style simulation: no real HTTP requests or Next.js server run here. The exercises dispatch fake request objects to handler functions in plain JavaScript, not Next.js itself.',
  predict: {
    prompt: 'app/api/posts/route.ts exports GET and POST only. A client sends DELETE /api/posts. What happens?',
    options: ['Next.js calls GET as a fallback', 'The request hangs until it times out', 'Next.js answers 405 Method Not Allowed without running your code', 'A 404 is returned because the route does not exist'],
    answer: 2,
    explain: 'A route handler file is matched by path, then by exported method name. A method with no export gets a 405 from Next.js. The route itself exists, so it is not a 404.',
  },
  viz,
  deeper: {
    points: [
      'A route.ts file exports one function per HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS). The export name is the method.',
      'Handlers receive a standard Request and return a standard Response (Response.json is the shortcut for JSON).',
      'A folder cannot have both page.tsx and route.ts for the same URL, since both would claim it.',
      'Dynamic segments work the same as for pages: app/api/posts/[id]/route.ts receives the params.',
      'Unsupported methods get a 405 with an Allow header and OPTIONS is implemented automatically, but you can export your own.',
    ],
    pitfalls: ['Forgetting await request.json() and destructuring a Promise', 'Returning a plain object instead of a Response', 'Assuming GET handlers are never cached (static GET handlers can be)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'dispatch',
    harness: HANDLER_HARNESS,
    adapter: 'runHandler',
    statement: 'mod is a route module like { GET, POST }. Call the function named after req.method (upper-cased, awaiting it) and return its response. If the handler throws, return a 500. If there is no handler: OPTIONS gets 204 with an allow header, any other method gets 405. allow lists the exported methods plus OPTIONS, sorted and joined by ", ". Responses look like { status, headers, body }.',
    signature: 'async function dispatch(mod, req) {',
    solution: `async function dispatch(mod, req) {
  const method = req.method.toUpperCase();
  const handler = @@mod[method]@@;
  const exported = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
  const allowed = [...new Set([...exported, 'OPTIONS'])].sort().join(', ');
  if (@@typeof handler === 'function'@@) {
    try {
      return await @@handler(req)@@;
    } catch (err) {
      return { status: @@500@@, headers: { 'content-type': 'application/json' }, body: { error: 'Internal Server Error' } };
    }
  }
  if (method === 'OPTIONS') return { status: @@204@@, headers: { allow: allowed }, body: null };
  return { status: @@405@@, headers: { 'content-type': 'application/json', allow: allowed }, body: { error: 'Method Not Allowed' } };
}`,
    tests: [
      { args: ['posts', { method: 'GET', url: '/api/posts?limit=2' }], expected: { status: 200, headers: { 'content-type': 'application/json' }, body: { posts: ['a', 'b'] } }, name: 'GET works' },
      { args: ['posts', { method: 'POST', url: '/api/posts', body: { title: 'Hi' } }], expected: { status: 201, headers: { 'content-type': 'application/json' }, body: { created: 'Hi' } }, name: 'POST creates' },
      { args: ['posts', { method: 'POST', url: '/api/posts', body: {} }], expected: { status: 400, headers: { 'content-type': 'application/json' }, body: { error: 'title required' } }, name: 'handler validation' },
      { args: ['posts', { method: 'DELETE', url: '/api/posts' }], expected: { status: 405, headers: { 'content-type': 'application/json', allow: 'GET, OPTIONS, POST' }, body: { error: 'Method Not Allowed' } }, name: 'no DELETE export' },
      { args: ['posts', { method: 'OPTIONS', url: '/api/posts' }], expected: { status: 204, headers: { allow: 'GET, OPTIONS, POST' }, body: null }, name: 'automatic OPTIONS' },
      { args: ['boom', { method: 'GET', url: '/api/boom' }], expected: { status: 500, headers: { 'content-type': 'application/json' }, body: { error: 'Internal Server Error' } }, name: 'handler throws' },
      { args: ['empty', { method: 'get', url: '/' }], expected: { status: 405, headers: { 'content-type': 'application/json', allow: 'OPTIONS' }, body: { error: 'Method Not Allowed' } }, name: 'lowercase method, empty module' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'POST',
    harness: `const json = (body, status = 200) => ({ status, headers: { 'content-type': 'application/json' }, body });
function runPost(fn, body) {
  return fn({ method: 'POST', json: () => Promise.resolve(body) });
}`,
    adapter: 'runPost',
    statement: 'This POST handler (json() is a Response.json-style helper, request.json() returns a Promise) answers 400 "title required" even when the client sends a title. Fix it.',
    buggy: `async function POST(request) {
  const { title } = request.json();
  if (!title) return json({ error: 'title required' }, 400);
  return json({ created: title }, 201);
}`,
    fixed: `async function POST(request) {
  const { title } = await request.json();
  if (!title) return json({ error: 'title required' }, 400);
  return json({ created: title }, 201);
}`,
    tests: [
      { args: [{ title: 'Hello' }], expected: { status: 201, headers: { 'content-type': 'application/json' }, body: { created: 'Hello' } }, name: 'valid body' },
      { args: [{}], expected: { status: 400, headers: { 'content-type': 'application/json' }, body: { error: 'title required' } }, name: 'missing title' },
      { args: [{ title: '' }], expected: { status: 400, headers: { 'content-type': 'application/json' }, body: { error: 'title required' } }, name: 'empty title' },
      { args: [{ title: 'x', extra: 1 }], expected: { status: 201, headers: { 'content-type': 'application/json' }, body: { created: 'x' } }, name: 'extra fields ignored' },
    ],
    bugType: 'missing await on request.json()',
    hint: 'What does request.json() return, and what do you get when you destructure it?',
    explanation: 'request.json() returns a Promise. Destructuring a Promise gives undefined for title, so every request looks invalid. Await it before destructuring.',
  },
  boss: {
    title: 'Method router',
    statement: 'table maps route patterns to exported methods, e.g. { "/api/posts": ["GET","POST"], "/api/posts/[id]": ["GET","DELETE"] }. route(table, method, path) picks the matching pattern (a [name] segment matches any one segment; more static segments win). No pattern: { status: 404 }. Pattern found but method not exported: { status: 405, allow } where allow is the exported methods plus OPTIONS, sorted, joined by ", ". Otherwise { status: 200, handler: "METHOD pattern", params }.',
    language: 'javascript',
    fnName: 'route',
    starter: `function route(table, method, path) {
  // your code here
}
`,
    solution: `function route(table, method, path) {
  const parts = path.split('/').filter(Boolean);
  let best = null;
  for (const pattern of Object.keys(table)) {
    const segs = pattern.split('/').filter(Boolean);
    if (segs.length !== parts.length) continue;
    const params = {};
    let statics = 0;
    const ok = segs.every((s, i) => {
      if (s.startsWith('[')) {
        params[s.slice(1, -1)] = parts[i];
        return true;
      }
      if (s === parts[i]) {
        statics++;
        return true;
      }
      return false;
    });
    if (ok && (!best || statics > best.statics)) best = { pattern, params, statics };
  }
  if (!best) return { status: 404 };
  const methods = table[best.pattern];
  if (!methods.includes(method)) {
    return { status: 405, allow: [...new Set([...methods, 'OPTIONS'])].sort().join(', ') };
  }
  return { status: 200, handler: method + ' ' + best.pattern, params: best.params };
}`,
    tests: [
      { args: [{ '/api/posts': ['GET', 'POST'], '/api/posts/[id]': ['GET', 'DELETE'], '/api/posts/latest': ['GET'] }, 'GET', '/api/posts/7'], expected: { status: 200, handler: 'GET /api/posts/[id]', params: { id: '7' } }, name: 'dynamic route' },
      { args: [{ '/api/posts': ['GET', 'POST'], '/api/posts/[id]': ['GET', 'DELETE'], '/api/posts/latest': ['GET'] }, 'GET', '/api/posts/latest'], expected: { status: 200, handler: 'GET /api/posts/latest', params: {} }, name: 'static beats dynamic' },
      { args: [{ '/api/posts': ['GET', 'POST'], '/api/posts/[id]': ['GET', 'DELETE'] }, 'POST', '/api/posts/7'], expected: { status: 405, allow: 'DELETE, GET, OPTIONS' }, name: 'method not exported' },
      { args: [{ '/api/posts': ['GET', 'POST'] }, 'GET', '/api/users'], expected: { status: 404 }, name: 'unknown path' },
      { args: [{ '/api/posts': ['GET', 'POST'] }, 'POST', '/api/posts'], expected: { status: 200, handler: 'POST /api/posts', params: {} }, name: 'plain POST' },
    ],
    hints: ['Two questions in order: which pattern fits the path, then is the method exported for it?', 'Match segment by segment, counting static matches so the more specific pattern wins. 404 if none fit, 405 (with allow) if the method is missing.'],
    combines: ['next-routing'],
  },
  quiz: [
    {
      prompt: 'What is the correct way to send JSON with a 201 status from a route handler?',
      options: ['return { created: true }', "return Response.json({ created: true }, { status: 201 })", 'res.status(201).json({ created: true })', 'throw 201'],
      answer: 1,
      explain: 'App Router handlers return a Web Response. Response.json builds one, and the init object carries the status. The res.status(...) style belongs to the old pages/api routes.',
    },
  ],
};

export default unit;
