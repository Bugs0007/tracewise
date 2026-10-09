import { Recorder } from '@/engine/recorder';
import { graphPanel, layeredLayout, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { adjacency } from '@/content/lib/graph';
import { cap } from '@/content/lib/frontend-next';

const code = `
// Walk the import graph from the page. Server is the default;
// 'use client' starts a boundary and everything below it ships to the browser.
function classify(graph, entry) {
  const shipped = new Set();                         //@init
  const reached = new Set();
  const seen = new Set();
  function visit(name, inClient) {
    const client = inClient || graph[name].client;   //@client
    const key = name + '|' + client;
    if (seen.has(key)) return;                       //@seen
    seen.add(key);
    reached.add(name);                               //@reach
    if (client) shipped.add(name);                   //@ship
    for (const dep of graph[name].imports) {         //@deps
      visit(dep, client);
    }
  }
  visit(entry, false);                               //@start
  return { shipped, serverOnly: reached - shipped }; //@result
}
`;

interface In {
  edges: EdgeSpec[];
  clients: string[];
  entry: string;
}

const E = (pairs: string[]): EdgeSpec[] => pairs.map((p) => ({ from: p.split('-')[0], to: p.split('-')[1] }));

interface Analysis {
  shipped: string[];
  serverOnly: string[];
}

const viz: VizDef<In> = {
  id: 'next-server-client',
  title: 'Server vs client components',
  code,
  language: 'javascript',
  inputs: [
    { key: 'edges', label: 'Imports (A-B means A imports B)', kind: 'edges', default: E(['Page-Header', 'Page-ProductList', 'Page-AddToCart', 'Header-Logo', 'ProductList-ProductCard', 'AddToCart-Button', 'AddToCart-Toast', 'ProductCard-PriceTag']), maxItems: 14 },
    { key: 'clients', label: "Files with 'use client'", kind: 'strings', default: ['AddToCart'], maxItems: 6 },
    { key: 'entry', label: 'Entry (page)', kind: 'string', default: 'Page', maxItems: 12 },
  ],
  presets: [
    { label: 'One small island', input: { clients: ['AddToCart'] } },
    { label: 'Directive too high', input: { clients: ['ProductList'] } },
    { label: 'Everything server', input: { clients: [] } },
    { label: 'Shared module', input: { edges: E(['Page-Format', 'Page-Counter', 'Counter-Format']), clients: ['Counter'] } },
  ],
  run({ edges, clients, entry }) {
    const r = new Recorder(code);
    const { ids: allIds, adj } = adjacency(edges, true);
    if (!allIds.includes(entry)) throw new Error(`Entry "${entry}" is not in the import graph`);
    const ids = [entry, ...allIds.filter((i) => i !== entry)];
    const pos = layeredLayout(ids, edges);
    const isClientFile = (n: string) => clients.includes(n);
    const shipped = new Set<string>();
    const reached = new Set<string>();
    const seen = new Set<string>();
    const side = new Map<string, 'client' | 'server'>();
    const panels = (cur?: string): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        const s = side.get(id);
        tones[id] = s === 'client' ? 'swap' : s === 'server' ? 'done' : 'default';
        if (s) badges[id] = s;
      }
      if (cur) tones[cur] = 'active';
      return [
        graphPanel(ids, edges, pos, true, { tones, badges, title: 'Import graph (green = stays on server, orange = shipped)' }),
        { type: 'list', title: 'JS sent to the browser', orientation: 'horizontal', items: [...shipped].map((n) => ({ id: n, label: n, tone: 'swap' as Tone })), emptyText: 'nothing yet' },
        { type: 'list', title: 'Server only (never downloaded)', orientation: 'horizontal', items: [...reached].filter((n) => !shipped.has(n)).map((n) => ({ id: n, label: n, tone: 'done' as Tone })), emptyText: 'nothing yet' },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ shipped: shipped.size, ...extra });

    r.step('init', `${entry} is a server component by default; no JS shipped yet`, panels(entry), vars());
    const visit = (name: string, parent: string | null, inClient: boolean) => {
      const client = inClient || isClientFile(name);
      const key = `${name}|${client}`;
      r.op();
      if (seen.has(key)) {
        r.step('seen', cap(`${name} was already visited as ${client ? 'client' : 'server'}: skip`), panels(name), vars({ name }));
        return;
      }
      seen.add(key);
      if (!side.has(name) || client) side.set(name, client ? 'client' : 'server');
      const why = !parent ? 'the entry' : isClientFile(name) ? "has 'use client'" : inClient ? `sits below the client boundary (via ${parent})` : `imported by server component ${parent}`;
      r.step('client', cap(`${name}: ${client ? 'CLIENT' : 'server'}, ${why}`), panels(name), vars({ name, client }));
      reached.add(name);
      r.step('reach', cap(`${name} runs during the server render`), panels(name), vars({ name }));
      if (client) {
        shipped.add(name);
        r.step('ship', cap(`${name} is added to the browser bundle`), panels(name), vars({ name }));
      }
      for (const dep of adj[name] ?? []) {
        r.step('deps', cap(`${name} imports ${dep}`), panels(name), vars({ name, dep }));
        visit(dep, name, client);
      }
    };
    r.step('start', `Start the walk at ${entry}`, panels(entry), vars());
    visit(entry, null, false);
    const result: Analysis = { shipped: [...shipped].sort(), serverOnly: [...reached].filter((n) => !shipped.has(n)).sort() };
    r.step('result', cap(`Browser gets ${result.shipped.length} file(s): ${result.shipped.join(', ') || 'none'}`), panels(), vars());
    return { frames: r.frames, result };
  },
  reference({ edges, clients, entry }) {
    const { adj } = adjacency(edges, true);
    const closure = (start: string) => {
      const out = new Set<string>([start]);
      const stack = [start];
      while (stack.length) {
        const n = stack.pop()!;
        for (const d of adj[n] ?? []) {
          if (out.has(d)) continue;
          out.add(d);
          stack.push(d);
        }
      }
      return out;
    };
    const all = closure(entry);
    const shipped = new Set<string>();
    for (const c of clients) if (all.has(c)) closure(c).forEach((n) => shipped.add(n));
    return { shipped: [...shipped].sort(), serverOnly: [...all].filter((n) => !shipped.has(n)).sort() };
  },
};

const G = {
  Page: { client: false, imports: ['Header', 'Cart'] },
  Header: { client: false, imports: [] },
  Cart: { client: true, imports: ['Button', 'Toast'] },
  Button: { client: false, imports: [] },
  Toast: { client: false, imports: [] },
  Unused: { client: false, imports: [] },
};

const unit: Unit = {
  id: 'next-server-client',
  hook: 'Server vs client components is the headline idea of the App Router, and "what ends up in the browser bundle?" is how interviewers check whether you really get it. The answer is about imports, not about where a component is used.',
  simulationNote: 'Next.js-style simulation: real React Server Components cannot run in the browser. The exercises classify an import graph with plain JavaScript to model the boundary rules, not Next.js itself.',
  predict: {
    prompt: "Page (a server component) imports Counter, which starts with 'use client'. Counter imports Badge, a plain component with no directive. Which of these files are sent to the browser as JavaScript?",
    options: ['Only Counter', 'Counter and Badge', 'Page, Counter and Badge', 'Nothing: all three render on the server'],
    answer: 1,
    explain: "'use client' marks a boundary in the module graph, not a single component. Everything Counter imports is pulled into the client bundle, including Badge. Page stays on the server.",
  },
  viz,
  deeper: {
    points: [
      "Every component in app/ is a server component by default. 'use client' at the top of a file turns that module, and everything it imports, into client code.",
      'Client components are still pre-rendered to HTML on the server. The difference is that their JavaScript is also shipped so they can hydrate and use state, effects and event handlers.',
      'Server components can be async, read databases and secrets directly, and add zero JavaScript to the bundle.',
      'A server component can be passed to a client component as children or another prop. It stays a server component, because it is composed in a server file rather than imported by the client one.',
      "Props that cross the boundary must be serialisable: strings, numbers, plain objects, arrays, Dates. Functions (except Server Actions), class instances and symbols are not.",
    ],
    pitfalls: ["Putting 'use client' on a big layout or page for one onClick, which drags the whole subtree into the bundle", "Passing an inline function prop from a server component to a client component", "Importing a server-only module (database client, secrets) from a client file"],
  },
  practice: {
    language: 'javascript',
    fnName: 'classify',
    statement: "graph maps each module to { client, imports }. Starting from entry (a server component), return { shipped, serverOnly }: shipped = modules whose JS goes to the browser (the 'use client' modules and everything they import), serverOnly = reachable modules that are not shipped. Both sorted.",
    signature: 'function classify(graph, entry) {',
    solution: `function classify(graph, entry) {
  const shipped = new Set();
  const reached = new Set();
  const seen = new Set();
  function visit(name, inClient) {
    const client = @@inClient || graph[name].client@@;
    const key = name + '|' + client;
    if (seen.has(key)) return;
    seen.add(key);
    reached.add(name);
    if (client) @@shipped.add(name)@@;
    for (const dep of graph[name].imports) visit(dep, @@client@@);
  }
  visit(entry, false);
  const serverOnly = [...reached].filter((n) => @@!shipped.has(n)@@);
  return { shipped: [...shipped].sort(), serverOnly: serverOnly.sort() };
}`,
    tests: [
      { args: [G, 'Page'], expected: { shipped: ['Button', 'Cart', 'Toast'], serverOnly: ['Header', 'Page'] }, name: 'one client island' },
      { args: [{ A: { client: false, imports: ['B'] }, B: { client: false, imports: [] } }, 'A'], expected: { shipped: [], serverOnly: ['A', 'B'] }, name: 'all server' },
      { args: [{ A: { client: true, imports: ['B'] }, B: { client: false, imports: [] } }, 'A'], expected: { shipped: ['A', 'B'], serverOnly: [] }, name: 'client entry' },
      { args: [{ Page: { client: false, imports: ['Util', 'Cart'] }, Util: { client: false, imports: [] }, Cart: { client: true, imports: ['Util'] } }, 'Page'], expected: { shipped: ['Cart', 'Util'], serverOnly: ['Page'] }, name: 'shared module is shipped' },
      { args: [{ Page: { client: false, imports: ['A'] }, A: { client: true, imports: ['B'] }, B: { client: false, imports: ['A'] } }, 'Page'], expected: { shipped: ['A', 'B'], serverOnly: ['Page'] }, name: 'import cycle' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'findUnserializable',
    harness: `function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (v.$fn) return function () {};
    if (v.$class) return new (class Store {})();
    if (v.$date !== undefined) return new Date(v.$date);
    const o = {};
    for (const k of Object.keys(v)) o[k] = revive(v[k]);
    return o;
  }
  return v;
}
function runProps(fn, spec) {
  return fn(revive(spec));
}`,
    adapter: 'runProps',
    statement: "findUnserializable(props) lists the dotted paths of props that cannot cross from a server component into a client component (functions and class instances; plain objects, arrays, Dates and primitives are fine). It misses a callback nested inside a config object. Fix it.",
    buggy: `function findUnserializable(props, path = '') {
  const bad = [];
  for (const [key, value] of Object.entries(props)) {
    const here = path ? path + '.' + key : key;
    if (typeof value === 'function') bad.push(here);
    else if (value && typeof value === 'object' && !(value instanceof Date)) {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && !Array.isArray(value)) bad.push(here);
    }
  }
  return bad;
}`,
    fixed: `function findUnserializable(props, path = '') {
  const bad = [];
  for (const [key, value] of Object.entries(props)) {
    const here = path ? path + '.' + key : key;
    if (typeof value === 'function') bad.push(here);
    else if (value && typeof value === 'object' && !(value instanceof Date)) {
      const proto = Object.getPrototypeOf(value);
      if (proto === Object.prototype || Array.isArray(value)) bad.push(...findUnserializable(value, here));
      else bad.push(here);
    }
  }
  return bad;
}`,
    tests: [
      { args: [{ title: 'Shoes', onAdd: { $fn: true } }], expected: ['onAdd'], name: 'top-level callback' },
      { args: [{ config: { theme: 'dark', onSave: { $fn: true } } }], expected: ['config.onSave'], name: 'nested callback' },
      { args: [{ items: [1, { $fn: true }] }], expected: ['items.1'], name: 'function inside an array' },
      { args: [{ store: { $class: true }, when: { $date: 0 } }], expected: ['store'], name: 'class instance bad, Date fine' },
      { args: [{ a: 1, b: [1, 2], c: { d: null } }], expected: [], name: 'all serialisable' },
    ],
    bugType: 'boundary check not recursive',
    hint: 'Which prop values does the function look inside? What happens to a plain object?',
    explanation: "The check only looks at top-level values, so a callback hidden inside a plain object or array reaches the client boundary and React throws at runtime. Recurse into plain objects and arrays and report the full path.",
  },
  boss: {
    title: 'Find wasted client JS',
    statement: "Each module in graph is { client, interactive, imports }. Starting from entry, return the sorted names of modules that ship to the browser (a 'use client' module and everything it imports) but are not interactive: they use no state or events, so they only cost bundle size.",
    language: 'javascript',
    fnName: 'wastedClientJs',
    starter: `function wastedClientJs(graph, entry) {
  // your code here
}
`,
    solution: `function wastedClientJs(graph, entry) {
  const shipped = new Set();
  const seen = new Set();
  function visit(name, inClient) {
    const client = inClient || graph[name].client;
    const key = name + '|' + client;
    if (seen.has(key)) return;
    seen.add(key);
    if (client) shipped.add(name);
    for (const dep of graph[name].imports) visit(dep, client);
  }
  visit(entry, false);
  return [...shipped].filter((n) => !graph[n].interactive).sort();
}`,
    tests: [
      {
        args: [
          {
            Page: { client: false, interactive: false, imports: ['Form', 'Hero'] },
            Form: { client: true, interactive: true, imports: ['Field', 'Icon'] },
            Field: { client: false, interactive: true, imports: [] },
            Icon: { client: false, interactive: false, imports: [] },
            Hero: { client: false, interactive: false, imports: [] },
          },
          'Page',
        ],
        expected: ['Icon'],
        name: 'icon rides along',
      },
      {
        args: [
          {
            Page: { client: true, interactive: false, imports: ['Hero', 'Menu'] },
            Hero: { client: false, interactive: false, imports: [] },
            Menu: { client: false, interactive: true, imports: [] },
          },
          'Page',
        ],
        expected: ['Hero', 'Page'],
        name: 'directive on the page',
      },
      {
        args: [
          {
            Page: { client: false, interactive: false, imports: ['Modal', 'Gallery'] },
            Modal: { client: true, interactive: true, imports: [] },
            Gallery: { client: false, interactive: false, imports: [] },
          },
          'Page',
        ],
        expected: [],
        name: 'server page passes the gallery as children',
      },
      {
        args: [{ Page: { client: false, interactive: false, imports: ['A'] }, A: { client: false, interactive: false, imports: [] } }, 'Page'],
        expected: [],
        name: 'no client code at all',
      },
    ],
    hints: ['First work out which modules ship (the same walk as classify), then filter that set.', "Track an inClient flag while walking imports. A module ships when the flag is set or it has the directive; keep the ones with interactive === false and sort."],
    combines: ['next-routing'],
  },
  quiz: [
    {
      prompt: 'Which of these can a server component do that a client component cannot?',
      options: ['Use useState', 'Attach an onClick handler', 'Be an async function that awaits a database call', 'Render other components'],
      answer: 2,
      explain: 'Server components can be async and talk to data sources directly. State, effects and event handlers need the client.',
    },
  ],
};

export default unit;
