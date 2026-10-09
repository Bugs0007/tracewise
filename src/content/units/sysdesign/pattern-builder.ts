import type { Unit } from '@/content/types';
import type { Scalar } from '@/engine/types';
import type { Design } from '@/content/lib/sysdesign-lld';
import { RUN_CHAIN, scenarioViz, splitEvent, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class RequestBuilder:
    def __init__(self, url):                         #@init
        self._url = url
        self._method = "GET"
        self._headers = {}
        self._params = []
        self._body = None
        self._timeout = 30

    def method(self, name):                          #@method
        self._method = name.upper()
        return self

    def header(self, key, value):                    #@header
        self._headers[key] = value
        return self

    def param(self, key, value):                     #@param
        self._params.append(key + "=" + value)
        return self

    def body(self, text):                            #@body
        self._body = text
        return self

    def timeout(self, seconds):                      #@timeout
        if seconds <= 0:
            raise ValueError("timeout must be positive")
        self._timeout = seconds
        return self

    def build(self):                                 #@build
        if self._method in ("POST", "PUT") and self._body is None:
            raise ValueError("body required")        #@need_body
        if self._method in ("GET", "DELETE") and self._body is not None:
            raise ValueError("body not allowed")     #@no_body
        url = self._url + ("?" + "&".join(self._params) if self._params else "")
        return {"method": self._method, "url": url, "headers": dict(self._headers),
                "body": self._body, "timeout": self._timeout}    #@done
`;

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const URL = 'https://api.shop.io/orders';

type Call = { op: 'method' | 'body' | 'timeout' | 'build'; arg?: string } | { op: 'header' | 'param'; key: string; value: string };

interface In {
  calls: string[];
}

function parse(list: string[]): Call[] {
  return list.map((raw) => {
    const [op, rest] = splitEvent(raw);
    if (op === 'build' && rest === undefined) return { op: 'build' };
    if ((op === 'method' || op === 'body' || op === 'timeout') && rest !== undefined && rest !== '') return { op, arg: rest };
    if ((op === 'header' || op === 'param') && rest && rest.includes('=')) {
      const i = rest.indexOf('=');
      return { op, key: rest.slice(0, i).trim(), value: rest.slice(i + 1).trim() };
    }
    throw new Error(`Cannot read "${raw}". Use method:POST, header:Accept=json, param:page=2, body:text, timeout:5 or build`);
  });
}

interface Product {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  timeout: number;
}
type Built = Product | { error: string };

const design = (product: boolean): Design => {
  const d: Design = {
    classes: [
      { id: 'client', name: 'Client', methods: ['chains calls'], x: 90, y: 60 },
      { id: 'builder', name: 'RequestBuilder', attrs: ['_method', '_headers', '_params', '_body'], methods: ['build()'], x: 400, y: 60 },
    ],
    rels: [{ from: 'client', to: 'builder', kind: 'uses', label: 'method().header()...' }],
  };
  if (product) {
    d.classes.push({ id: 'request', name: 'Request', attrs: ['method', 'url', 'headers', 'body', 'timeout'], methods: [], x: 400, y: 215 });
    d.rels.push({ from: 'builder', to: 'request', kind: 'depends', label: 'build() creates' });
  }
  return d;
};

function simulate(input: In) {
  const calls = parse(input.calls);
  const beats: Beat[] = [];
  const out: Built[] = [];
  let method = 'GET';
  const headers: Record<string, string> = {};
  const params: string[] = [];
  let body: string | null = null;
  let timeout = 30;
  const st = (): Record<string, Scalar> => ({ method, headers: JSON.stringify(headers), params: params.join('&') || '(none)', body: body ?? 'None', timeout });
  beats.push({ at: 'init', caption: 'Builder starts with defaults: GET, no headers, timeout 30', design: design(false), tones: { builder: 'active' }, state: st(), stateTitle: 'Builder fields' });
  for (const c of calls) {
    if (c.op === 'method') {
      method = (c.arg ?? '').toUpperCase();
      beats.push({ at: 'method', caption: `method("${c.arg}"): _method = ${method}, return self`, design: design(false), tones: { builder: 'active', client: 'compare' }, state: st(), stateTitle: 'Builder fields', log: { text: `method(${method})` } });
    } else if (c.op === 'header') {
      headers[c.key] = c.value;
      beats.push({ at: 'header', caption: `header("${c.key}", "${c.value}"): stored, return self`, design: design(false), tones: { builder: 'active', client: 'compare' }, state: st(), stateTitle: 'Builder fields', log: { text: `header ${c.key}=${c.value}` } });
    } else if (c.op === 'param') {
      params.push(`${c.key}=${c.value}`);
      beats.push({ at: 'param', caption: `param("${c.key}", "${c.value}"): query part added`, design: design(false), tones: { builder: 'active', client: 'compare' }, state: st(), stateTitle: 'Builder fields', log: { text: `param ${c.key}=${c.value}` } });
    } else if (c.op === 'body') {
      body = c.arg ?? '';
      beats.push({ at: 'body', caption: `body("${c.arg}"): payload stored`, design: design(false), tones: { builder: 'active', client: 'compare' }, state: st(), stateTitle: 'Builder fields', log: { text: `body ${c.arg}` } });
    } else if (c.op === 'timeout') {
      const secs = Number(c.arg);
      if (!(secs > 0)) {
        beats.push({ at: 'timeout', caption: `timeout(${c.arg}) raises ValueError: builder keeps ${timeout}`, design: design(false), tones: { builder: 'error' }, state: st(), stateTitle: 'Builder fields', log: { text: `timeout(${c.arg}) rejected`, tone: 'error' } });
      } else {
        timeout = secs;
        beats.push({ at: 'timeout', caption: `timeout(${secs}): valid, stored`, design: design(false), tones: { builder: 'active', client: 'compare' }, state: st(), stateTitle: 'Builder fields', log: { text: `timeout ${secs}` } });
      }
    } else {
      beats.push({ at: 'build', caption: 'build(): validate the whole combination before creating anything', design: design(false), tones: { builder: 'compare' }, state: st(), stateTitle: 'Builder fields' });
      if (!METHODS.includes(method)) {
        out.push({ error: 'bad method' });
        beats.push({ at: 'build', caption: `${method} is not a supported method: nothing is built`, design: design(false), tones: { builder: 'error' }, state: st(), stateTitle: 'Builder fields', log: { text: 'build failed: bad method', tone: 'error' } });
      } else if ((method === 'POST' || method === 'PUT') && body === null) {
        out.push({ error: 'body required' });
        beats.push({ at: 'need_body', caption: `${method} needs a body: ValueError, no half-built Request escapes`, design: design(false), tones: { builder: 'error' }, state: st(), stateTitle: 'Builder fields', log: { text: 'build failed: body required', tone: 'error' } });
      } else if ((method === 'GET' || method === 'DELETE') && body !== null) {
        out.push({ error: 'body not allowed' });
        beats.push({ at: 'no_body', caption: `${method} must not carry a body: ValueError`, design: design(false), tones: { builder: 'error' }, state: st(), stateTitle: 'Builder fields', log: { text: 'build failed: body not allowed', tone: 'error' } });
      } else {
        const prod: Product = { method, url: URL + (params.length ? '?' + params.join('&') : ''), headers: { ...headers }, body, timeout };
        out.push(prod);
        beats.push({ at: 'done', caption: `Valid: immutable Request for ${prod.method} ${prod.url.replace('https://api.shop.io', '')}`, design: design(true), tones: { builder: 'active', request: 'new' }, edgeTones: { 'builder>request': 'new' }, state: st(), stateTitle: 'Builder fields', log: { text: `built ${prod.method} (copy of headers)`, tone: 'found' } });
      }
    }
  }
  if (!calls.some((c) => c.op === 'build')) beats.push({ at: 'build', caption: 'build() was never called: nothing was created', design: design(false), tones: { builder: 'muted' }, state: st(), stateTitle: 'Builder fields', log: { text: 'no Request produced', tone: 'muted' } });
  return { beats, result: out };
}

function reference(input: In): Built[] {
  const s = { method: 'GET', headers: new Map<string, string>(), params: [] as string[], body: null as string | null, timeout: 30 };
  const results: Built[] = [];
  for (const c of parse(input.calls)) {
    switch (c.op) {
      case 'method':
        s.method = (c.arg ?? '').toUpperCase();
        break;
      case 'header':
        s.headers.set(c.key, c.value);
        break;
      case 'param':
        s.params.push(`${c.key}=${c.value}`);
        break;
      case 'body':
        s.body = c.arg ?? '';
        break;
      case 'timeout':
        if (Number(c.arg) > 0) s.timeout = Number(c.arg);
        break;
      case 'build': {
        const hasBody = s.body !== null;
        if (!METHODS.includes(s.method)) results.push({ error: 'bad method' });
        else if (['POST', 'PUT'].includes(s.method) && !hasBody) results.push({ error: 'body required' });
        else if (['GET', 'DELETE'].includes(s.method) && hasBody) results.push({ error: 'body not allowed' });
        else results.push({ method: s.method, url: s.params.length ? `${URL}?${s.params.join('&')}` : URL, headers: Object.fromEntries(s.headers), body: s.body, timeout: s.timeout });
      }
    }
  }
  return results;
}

const viz = scenarioViz<In, Built[]>({
  id: 'pattern-builder',
  title: 'Builder: assemble a request step by step',
  code,
  design: design(false),
  diagramTitle: 'Participants',
  size: { width: 700, height: 300 },
  logTitle: 'Builder calls',
  inputs: [{ key: 'calls', label: 'Calls', kind: 'strings', default: ['method:POST', 'header:Accept=json', 'param:page=2', 'body:name=ann', 'timeout:5', 'build'], maxItems: 9, help: 'method:POST|GET|PUT|DELETE, header:K=V, param:K=V, body:text, timeout:seconds, build' }],
  presets: [
    { label: 'Valid POST', input: { calls: ['method:POST', 'header:Accept=json', 'body:name=ann', 'build'] } },
    { label: 'POST without body', input: { calls: ['method:POST', 'param:dry=1', 'build'] } },
    { label: 'Bad timeout, then GET', input: { calls: ['timeout:0', 'param:page=2', 'param:size=10', 'build'] } },
  ],
  simulate,
  reference,
});

const unit: Unit = {
  id: 'pattern-builder',
  hook: 'Builders appear whenever an object has many optional parts: HTTP requests, SQL queries, test fixtures. Interviewers look for fluent chaining, validation in `build()`, and why not a 9-argument constructor.',
  predict: {
    prompt: 'A builder has `method("POST")` called but never `body(...)`. Where is the right place to reject that combination?',
    options: ['In `method()`, because it is called first', 'In `build()`, because only then are all the parts known', 'Nowhere: the server will return an error', 'In the Request constructor, after the builder returned'],
    answer: 1,
    explain: 'Rules that involve several fields can only be checked once the last step is done. Validating in `build()` guarantees a half-valid object never leaves the builder.',
  },
  viz,
  deeper: {
    points: [
      'Intent: separate **constructing** a complex object from its representation, so the same steps can make different results and each step is named.',
      'Fluent builders return `self` from every setter so calls chain. Forgetting a `return self` is the classic bug: the chain dies with `NoneType has no attribute ...`.',
      '`build()` validates cross-field rules and returns a **fresh** object. Copy mutable parts (`dict(self._headers)`) so later builder calls cannot change an already built product.',
      'Python often replaces builders with keyword arguments and dataclasses. Reach for a builder when steps are conditional, order-dependent, or when the product is immutable and must be valid at birth.',
      'A **Director** (optional) is a function that knows a common recipe, for example `json_post(url, body)`.',
    ],
    pitfalls: ['Returning the builder\'s internal dict so the product aliases it', 'Validating in each setter when the rule involves two fields', 'Reusing a builder and leaking state from the previous request'],
  },
  practice: {
    language: 'python',
    fnName: 'RequestBuilder',
    statement:
      'Implement `RequestBuilder(url)` with chainable `method(name)` (stored upper-case, default GET), `header(key, value)`, `param(key, value)`, `body(text)` and `timeout(seconds)` (default 30; `ValueError` if `seconds <= 0`). `build()` raises `ValueError` if POST/PUT has no body or GET/DELETE has one, otherwise returns `{"method", "url", "headers", "body", "timeout"}` where url gets `?k=v&k2=v2` for params in call order and headers is a copy.',
    signature: 'class RequestBuilder:',
    harness: RUN_CHAIN,
    adapter: 'run_chain',
    solution: `class RequestBuilder:
    def __init__(self, url):
        self._url = url
        self._method = 'GET'
        self._headers = {}
        self._params = []
        self._body = None
        self._timeout = 30

    def method(self, name):
        self._method = @@name.upper()@@
        return self

    def header(self, key, value):
        self._headers[key] = value
        return self

    def param(self, key, value):
        self._params.append(key + '=' + str(value))
        return self

    def body(self, text):
        self._body = text
        return self

    def timeout(self, seconds):
        if @@seconds <= 0@@:
            raise ValueError('timeout must be positive')
        self._timeout = seconds
        return @@self@@

    def build(self):
        if self._method in ('POST', 'PUT') and self._body is None:
            raise ValueError('body required')
        if self._method in ('GET', 'DELETE') and self._body is not None:
            raise ValueError('body not allowed')
        url = self._url + ('?' + '&'.join(self._params) if self._params else '')
        return {'method': self._method, 'url': url, 'headers': @@dict(self._headers)@@, 'body': self._body, 'timeout': self._timeout}`,
    tests: [
      { args: [['https://x.io/a'], [['method', 'post'], ['header', 'Accept', 'json'], ['body', 'hi'], ['timeout', 5], ['build']]], expected: [true, [{ method: 'POST', url: 'https://x.io/a', headers: { Accept: 'json' }, body: 'hi', timeout: 5 }]], name: 'full POST' },
      { args: [['https://x.io/a'], [['build']]], expected: [true, [{ method: 'GET', url: 'https://x.io/a', headers: {}, body: null, timeout: 30 }]], name: 'defaults' },
      { args: [['https://x.io/a'], [['param', 'page', 2], ['param', 'sort', 'asc'], ['build']]], expected: [true, [{ method: 'GET', url: 'https://x.io/a?page=2&sort=asc', headers: {}, body: null, timeout: 30 }]], name: 'query string in call order' },
      { args: [['u'], [['method', 'POST'], ['build']]], expected: [true, ['!ValueError']], name: 'POST needs a body' },
      { args: [['u'], [['body', 'x'], ['build']]], expected: [true, ['!ValueError']], name: 'GET must not have a body' },
      { args: [['u'], [['timeout', 0], ['build']]], expected: [true, ['!timeout:ValueError', { method: 'GET', url: 'u', headers: {}, body: null, timeout: 30 }]], name: 'invalid timeout is rejected' },
      { args: [['u'], [['header', 'A', '1'], ['build'], ['header', 'B', '2'], ['build']]], expected: [true, [{ method: 'GET', url: 'u', headers: { A: '1' }, body: null, timeout: 30 }, { method: 'GET', url: 'u', headers: { A: '1', B: '2' }, body: null, timeout: 30 }]], name: 'built requests are snapshots' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'RequestBuilder',
    statement: 'Calling `RequestBuilder(url).header("A", "1").body("x")` crashes with `AttributeError: NoneType has no attribute body`. Fix the builder so every setter can be chained.',
    harness: RUN_CHAIN,
    adapter: 'run_chain',
    buggy: `class RequestBuilder:
    def __init__(self, url):
        self._url = url
        self._method = 'GET'
        self._headers = {}
        self._body = None

    def method(self, name):
        self._method = name.upper()
        return self

    def header(self, key, value):
        self._headers[key] = value

    def body(self, text):
        self._body = text
        return self

    def build(self):
        return {'method': self._method, 'url': self._url, 'headers': dict(self._headers), 'body': self._body}`,
    fixed: `class RequestBuilder:
    def __init__(self, url):
        self._url = url
        self._method = 'GET'
        self._headers = {}
        self._body = None

    def method(self, name):
        self._method = name.upper()
        return self

    def header(self, key, value):
        self._headers[key] = value
        return self

    def body(self, text):
        self._body = text
        return self

    def build(self):
        return {'method': self._method, 'url': self._url, 'headers': dict(self._headers), 'body': self._body}`,
    tests: [
      { args: [['u'], [['method', 'post'], ['header', 'A', '1'], ['body', 'x'], ['build']]], expected: [true, [{ method: 'POST', url: 'u', headers: { A: '1' }, body: 'x' }]], name: 'chained setters' },
      { args: [['u'], [['header', 'A', '1'], ['header', 'B', '2'], ['build']]], expected: [true, [{ method: 'GET', url: 'u', headers: { A: '1', B: '2' }, body: null }]], name: 'two headers' },
    ],
    bugType: 'missing return self',
    hint: 'Compare `header` with `method` and `body`. What does a Python function return when it has no return statement?',
    explanation: '`header` forgets `return self`, so it returns None and the next call in the chain is made on None. Every fluent method must return the builder.',
  },
  boss: {
    title: 'Parameterised SQL query builder',
    statement:
      'Write `QueryBuilder(table)` with chainable `select(*cols)` (repeatable; no columns means `*`), `where(col, op, value)` (op must be one of `= != < > <= >=` else `ValueError`; conditions are joined with AND and values are collected as parameters), `order_by(col, desc=False)` (repeatable, comma-joined, `DESC` suffix only when desc) and `limit(n)` (`ValueError` if `n < 1`). `build()` returns `[sql, params]` such as `["SELECT id FROM users WHERE age > ? ORDER BY id DESC LIMIT 5", [30]]`; an empty table name raises `ValueError`. `params` must be a copy.',
    language: 'python',
    fnName: 'QueryBuilder',
    harness: RUN_CHAIN,
    adapter: 'run_chain',
    starter: `class QueryBuilder:
    def __init__(self, table):
        pass
`,
    solution: `class QueryBuilder:
    OPS = ('=', '!=', '<', '>', '<=', '>=')

    def __init__(self, table):
        self._table = table
        self._cols = []
        self._where = []
        self._params = []
        self._order = []
        self._limit = None

    def select(self, *cols):
        self._cols.extend(cols)
        return self

    def where(self, col, op, value):
        if op not in self.OPS:
            raise ValueError('bad operator')
        self._where.append(col + ' ' + op + ' ?')
        self._params.append(value)
        return self

    def order_by(self, col, desc=False):
        self._order.append(col + (' DESC' if desc else ''))
        return self

    def limit(self, n):
        if n < 1:
            raise ValueError('limit must be positive')
        self._limit = n
        return self

    def build(self):
        if not self._table:
            raise ValueError('table required')
        sql = 'SELECT ' + (', '.join(self._cols) if self._cols else '*') + ' FROM ' + self._table
        if self._where:
            sql += ' WHERE ' + ' AND '.join(self._where)
        if self._order:
            sql += ' ORDER BY ' + ', '.join(self._order)
        if self._limit is not None:
            sql += ' LIMIT ' + str(self._limit)
        return [sql, list(self._params)]`,
    tests: [
      { args: [['users'], [['build']]], expected: [true, [['SELECT * FROM users', []]]], name: 'defaults' },
      { args: [['users'], [['select', 'id', 'name'], ['where', 'age', '>', 30], ['where', 'city', '=', 'Oslo'], ['order_by', 'name', true], ['limit', 5], ['build']]], expected: [true, [['SELECT id, name FROM users WHERE age > ? AND city = ? ORDER BY name DESC LIMIT 5', [30, 'Oslo']]]], name: 'everything at once' },
      { args: [['t'], [['order_by', 'a'], ['order_by', 'b', true], ['build']]], expected: [true, [['SELECT * FROM t ORDER BY a, b DESC', []]]], name: 'multiple order columns' },
      { args: [['t'], [['where', 'a', 'LIKE', 'x'], ['build']]], expected: [true, ['!where:ValueError', ['SELECT * FROM t', []]]], name: 'bad operator is rejected' },
      { args: [['t'], [['limit', 0], ['build']]], expected: [true, ['!limit:ValueError', ['SELECT * FROM t', []]]], name: 'bad limit' },
      { args: [[''], [['build']]], expected: [true, ['!ValueError']], name: 'table required' },
      { args: [['t'], [['where', 'a', '=', 1], ['build'], ['where', 'b', '=', 2], ['build']]], expected: [true, [['SELECT * FROM t WHERE a = ?', [1]], ['SELECT * FROM t WHERE a = ? AND b = ?', [1, 2]]]], name: 'params are copied' },
      { args: [['t'], [['select', 'a'], ['select', 'b']]], expected: [true, []], name: 'select chains and returns self' },
    ],
    hints: ['Keep separate lists for columns, where-clauses, params and order terms; every setter appends and returns self. Placeholders are `?`; the values go to `params`.', 'build assembles the string piece by piece: SELECT cols FROM table, then WHERE ... AND ..., ORDER BY ..., LIMIT n, only for the parts that exist. Return `list(self._params)`.'],
    combines: ['pattern-factory'],
  },
  quiz: [
    {
      prompt: 'Why does `build()` copy the headers dict into the product?',
      options: ['Dicts cannot be returned in Python', 'So later builder calls cannot change a product that was already built', 'To make the builder thread-safe', 'Because dicts are immutable'],
      answer: 1,
      explain: 'Without the copy both objects share one dict, so reusing the builder silently rewrites old requests.',
    },
  ],
};

export default unit;
