import { Recorder } from '@/engine/recorder';
import type { Panel, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NEXT, clip, diffTrees, renderTreePanel, type HNode } from '@/content/lib/finish-m2m3';

const code = `
// 1. Server: renderToString(<App />) produces HTML                         //@server
// 2. Browser paints that HTML at once (links are not interactive yet)      //@html
// 3. Client: hydrateRoot(root, <App />) renders again and compares         //@client
function Clock() {
  const now = Date.now();                    // differs between the two runs   //@nondet
  return <p>Rendered at {now}</p>;
}
function SafeClock() {
  const [now, setNow] = useState(null);      // same on server and first client render
  useEffect(() => setNow(Date.now()), []);   // runs only in the browser     //@effect
  return <p>{now ?? 'Loading...'}</p>;
}
// match: React keeps the DOM and attaches event handlers                    //@attach
// mismatch: React warns and rebuilds that part from the client tree         //@mismatch
`;

const SCENARIOS = ['static page', 'Date.now() in render', 'Math.random() as id', 'window.innerWidth', '<div> inside <p>', 'useEffect after mount (fix)'] as const;
type Scenario = (typeof SCENARIOS)[number];

interface In {
  scenario: string;
  serverValue: number;
  clientValue: number;
}

const el = (tag: string, children: HNode[] = [], props?: Record<string, string>): HNode => ({ tag, children, props });

function trees(s: Scenario, sv: number, cv: number): { server: HNode; client: HNode; after?: HNode } {
  const page = (v: string | HNode[]): HNode => el('main', [el('h1', ['Dashboard']), el('p', Array.isArray(v) ? v : [v])]);
  switch (s) {
    case 'static page':
      return { server: page('Hello'), client: page('Hello') };
    case 'Date.now() in render':
      return { server: page('Rendered at ' + sv), client: page('Rendered at ' + cv) };
    case 'window.innerWidth':
      return { server: page('Width: ' + sv), client: page('Width: ' + cv) };
    case 'Math.random() as id': {
      const form = (v: number): HNode => el('form', [el('label', ['Name'], { for: 'f' + v }), el('input', [], { id: 'f' + v })]);
      return { server: form(sv), client: form(cv) };
    }
    case '<div> inside <p>':
      // the HTML parser closes <p> before a <div>, so the server DOM differs from React's tree
      return { server: el('section', [el('p', ['Intro']), el('div', ['Box'])]), client: el('section', [el('p', [el('div', ['Box'])])]) };
    case 'useEffect after mount (fix)':
      return { server: page('Loading...'), client: page('Loading...'), after: page('Rendered at ' + cv) };
  }
}

const label = (p: string): string => (p === '' ? 'root' : p);

const viz: VizDef<In> = {
  id: 'next-hydration',
  title: 'Hydration: server HTML meets client render',
  code,
  language: 'javascript',
  inputs: [
    { key: 'scenario', label: 'Component under test', kind: 'select', options: [...SCENARIOS], default: 'Date.now() in render' },
    { key: 'serverValue', label: 'Value the server computed', kind: 'number', default: 1000 },
    { key: 'clientValue', label: 'Value the browser computes', kind: 'number', default: 1003 },
  ],
  presets: SCENARIOS.map((s) => ({ label: s, input: { scenario: s } })),
  run({ scenario, serverValue, clientValue }) {
    if (!(SCENARIOS as readonly string[]).includes(scenario)) throw new Error('Pick one of: ' + SCENARIOS.join(' | '));
    const s = scenario as Scenario;
    const { server, client, after } = trees(s, serverValue, clientValue);
    const r = new Recorder(code);
    const none = new Set<string>();
    const panels = (a: HNode, b: HNode | null, badA: Set<string>, okB?: Set<string>): Panel[] => {
      const out: Panel[] = [renderTreePanel(a, 'Server HTML (parsed DOM)', badA, okB)];
      if (b) out.push(renderTreePanel(b, 'Client render (React tree)', badA, okB));
      return out;
    };
    r.step('server', clip(`Server renders "${s}" to HTML`), panels(server, null, none), { stage: 'server' });
    r.step('html', 'The browser paints this HTML immediately: visible, but nothing is clickable yet', panels(server, null, none), { stage: 'paint' });
    r.step('client', 'JavaScript loads. React renders the same component again in the browser', panels(server, client, none), { stage: 'client render' });
    const found = diffTrees(server, client);
    r.op(found.length);
    const bad = new Set(found.map((m) => m.path));
    if (found.length) {
      r.step('mismatch', clip(`Mismatch at ${found.map((m) => label(m.path) + ' (' + m.kind + ')').join(', ')}`), panels(server, client, bad), { mismatches: found.length });
      r.step('mismatch', 'React warns and discards the server DOM there; the client tree wins', panels(client, client, none, new Set()), { recovered: true });
    } else {
      const everything = new Set<string>();
      const collect = (n: HNode, p: string): void => {
        everything.add(p);
        if (typeof n !== 'string') (n.children ?? []).forEach((c, i) => collect(c, p ? `${p}.${i}` : String(i)));
      };
      collect(client, '');
      r.step('attach', 'Both trees are identical: React reuses the DOM and attaches event handlers', panels(server, client, none, everything), { mismatches: 0 });
    }
    if (after) {
      r.step('effect', 'useEffect runs after hydration and sets the real time: a normal second render', panels(client, after, none), { stage: 'effect' });
      r.step('effect', 'The page updates without any mismatch warning', panels(after, after, none, new Set()), { final: 'updated' });
    }
    return { frames: r.frames, result: found.map((m) => `${label(m.path)}:${m.kind}`) };
  },
  reference({ scenario, serverValue: sv, clientValue: cv }) {
    // independent: describe the expected mismatches by hand
    const differs = sv !== cv;
    switch (scenario) {
      case 'Date.now() in render':
      case 'window.innerWidth':
        return differs ? ['1.0:text'] : [];
      case 'Math.random() as id':
        return differs ? ['0:attr:for', '1:attr:id'] : [];
      case '<div> inside <p>':
        return ['0.0:type', '1:extra-server'];
      default:
        return [];
    }
  },
};

const FIND_HARNESS = `
function findMismatches(server, client, path) {
  path = path || '';
  const here = path === '' ? 'root' : path;
  if (server === undefined) return [here + ':extra-client'];
  if (client === undefined) return [here + ':extra-server'];
  if ((typeof server === 'string') !== (typeof client === 'string')) return [here + ':type'];
  if (typeof server === 'string') return server === client ? [] : [here + ':text'];
  if (server.tag !== client.tag) return [here + ':tag'];
  const out = [];
  const sp = server.props || {};
  const cp = client.props || {};
  for (const name of [...new Set([...Object.keys(sp), ...Object.keys(cp)])].sort()) {
    if (sp[name] !== cp[name]) out.push(here + ':attr:' + name);
  }
  const sk = server.children || [];
  const ck = client.children || [];
  for (let i = 0; i < Math.max(sk.length, ck.length); i++) {
    out.push(...findMismatches(sk[i], ck[i], path === '' ? String(i) : path + '.' + i));
  }
  return out;
}
`;

const RENDER_HARNESS = `
const RENDERS = {
  clock: (ctx) => ({ tag: 'p', children: ['Time: ' + ctx.now] }),
  safeClock: (ctx) => ({ tag: 'p', children: [ctx.mounted ? 'Time: ' + ctx.now : 'Time: --'] }),
  field: (ctx) => ({ tag: 'label', props: { for: 'f' + ctx.random }, children: ['Name'] }),
  layout: (ctx) => ({ tag: 'div', children: [ctx.width > 800 ? 'Desktop' : 'Mobile'] }),
};
${FIND_HARNESS}
function runHydrate(fn, name, serverCtx, clientCtx) {
  return fn(RENDERS[name], serverCtx, clientCtx);
}
`;

const unit: Unit = {
  id: 'next-hydration',
  hook: '"Text content does not match server-rendered HTML" is the error everyone googles. Explaining that hydration expects the first client render to equal the server output, and why Date.now, Math.random and window break that, shows you understand SSR.',
  predict: {
    prompt: 'A server component-style page renders `<p>{new Date().toLocaleTimeString()}</p>` on the server and on the first client render. The two renders happen one second apart. What does React report on hydration?',
    options: ['Nothing: React always trusts the server HTML', 'A text mismatch warning, because the two outputs differ', 'The page crashes before it is painted', 'The clock updates itself every second'],
    answer: 1,
    explain: 'Hydration compares the HTML that was sent with what the client renders for the first time. A time value computed during render differs between the two runs, so React reports a mismatch and patches the DOM.',
  },
  simulationNote: SIM_NEXT + ' Hydration is modelled as a comparison of two small trees; real React is more forgiving in some cases and stricter in others.',
  viz,
  deeper: {
    points: [
      'SSR sends ready-made HTML so users see content fast. Hydration then makes it interactive: React renders again in the browser and attaches handlers to the existing DOM instead of rebuilding it.',
      'For that to work, the FIRST client render must produce the same tree as the server. Anything that differs between server and browser during render breaks it.',
      'Typical culprits: `Date.now()` / `new Date()`, `Math.random()`, `window` / `localStorage` checks, locale or timezone formatting, and browser-only extensions that modify the DOM.',
      'The fix is to render the same neutral output first and show the real value after mount (`useEffect` + state), or mark the unavoidable difference with `suppressHydrationWarning` on that one element.',
      'Invalid HTML nesting (`<div>` inside `<p>`, `<a>` inside `<a>`) is repaired by the browser parser, so the server DOM no longer matches React\'s tree.',
      'Generate stable ids with `useId`, which is identical on both sides, rather than random numbers.',
    ],
    pitfalls: ['Reading `window` during render and branching the markup on it', 'Formatting dates in the server\'s timezone and the user\'s timezone', 'Silencing the warning with suppressHydrationWarning on large subtrees'],
  },
  practice: {
    language: 'javascript',
    fnName: 'findMismatches',
    statement: 'Write `findMismatches(server, client, path = "")` for render trees: a string (text) or `{ tag, props?, children? }`. Return strings `<path>:<kind>` in depth-first order, where path is child indexes joined by dots (`root` for the top node): `text` (both strings, different), `type` (one string, one element), `tag` (different tags; do not look deeper), `attr:<name>` for each differing attribute (alphabetical), `extra-client` / `extra-server` for a child only one side has.',
    signature: 'function findMismatches(server, client, path = \'\') {',
    solution: `function findMismatches(server, client, path = '') {
  const here = path === '' ? 'root' : path;
  if (server === undefined) return [here + ':extra-client'];
  if (client === undefined) return [here + ':extra-server'];
  const serverText = typeof server === 'string';
  const clientText = typeof client === 'string';
  if (@@serverText !== clientText@@) return [here + ':type'];
  if (serverText) return @@server === client@@ ? [] : [here + ':text'];
  if (@@server.tag !== client.tag@@) return [here + ':tag'];
  const out = [];
  const sp = server.props || {};
  const cp = client.props || {};
  const names = [...new Set([...Object.keys(sp), ...Object.keys(cp)])].sort();
  for (const name of names) {
    if (sp[name] !== cp[name]) out.push(here + ':attr:' + name);
  }
  const sk = server.children || [];
  const ck = client.children || [];
  for (let i = 0; i < @@Math.max(sk.length, ck.length)@@; i++) {
    out.push(...findMismatches(sk[i], ck[i], path === '' ? String(i) : path + '.' + i));
  }
  return out;
}`,
    tests: [
      { args: [{ tag: 'p', children: ['Hi'] }, { tag: 'p', children: ['Hi'] }], expected: [], name: 'identical trees' },
      { args: [{ tag: 'p', children: ['10:00:01'] }, { tag: 'p', children: ['10:00:02'] }], expected: ['0:text'], name: 'text differs' },
      { args: [{ tag: 'input', props: { id: 'a1' } }, { tag: 'input', props: { id: 'b2' } }], expected: ['root:attr:id'], name: 'attribute differs' },
      { args: [{ tag: 'div', children: ['x'] }, { tag: 'section', children: ['y'] }], expected: ['root:tag'], name: 'tag differs, do not descend' },
      { args: [{ tag: 'ul', children: [{ tag: 'li', children: ['a'] }] }, { tag: 'ul', children: [{ tag: 'li', children: ['a'] }, { tag: 'li', children: ['b'] }] }], expected: ['1:extra-client'], name: 'client renders an extra child' },
      { args: [{ tag: 'ul', children: [{ tag: 'li', children: ['a'] }, { tag: 'li', children: ['b'] }] }, { tag: 'ul', children: [{ tag: 'li', children: ['a'] }] }], expected: ['1:extra-server'], name: 'server has an extra child' },
      { args: [{ tag: 'p', children: ['Intro'] }, { tag: 'p', children: [{ tag: 'b', children: ['Intro'] }] }], expected: ['0:type'], name: 'text vs element' },
      { args: [{ tag: 'main', children: [{ tag: 'p', children: ['x'] }, { tag: 'ul', children: [{ tag: 'li', children: ['a'] }, { tag: 'li', children: ['b'] }] }] }, { tag: 'main', children: [{ tag: 'p', children: ['x'] }, { tag: 'ul', children: [{ tag: 'li', children: ['a'] }, { tag: 'li', children: ['c'] }] }] }], expected: ['1.1.0:text'], name: 'deep path' },
      { args: [{ tag: 'a', props: { id: 'x', class: 'big' } }, { tag: 'a', props: { id: 'y' } }], expected: ['root:attr:class', 'root:attr:id'], name: 'missing and changed attributes, alphabetical' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'findMismatches',
    statement: 'When the client renders one more list item than the server, `findMismatches` reports nothing and the bug ships. Fix the child comparison.',
    buggy: `function findMismatches(server, client, path = '') {
  const here = path === '' ? 'root' : path;
  if (server === undefined) return [here + ':extra-client'];
  if (client === undefined) return [here + ':extra-server'];
  if (typeof server === 'string' || typeof client === 'string') {
    if (typeof server !== typeof client) return [here + ':type'];
    return server === client ? [] : [here + ':text'];
  }
  if (server.tag !== client.tag) return [here + ':tag'];
  const sk = server.children || [];
  const ck = client.children || [];
  const out = [];
  for (let i = 0; i < Math.min(sk.length, ck.length); i++) {
    out.push(...findMismatches(sk[i], ck[i], path === '' ? String(i) : path + '.' + i));
  }
  return out;
}`,
    fixed: `function findMismatches(server, client, path = '') {
  const here = path === '' ? 'root' : path;
  if (server === undefined) return [here + ':extra-client'];
  if (client === undefined) return [here + ':extra-server'];
  if (typeof server === 'string' || typeof client === 'string') {
    if (typeof server !== typeof client) return [here + ':type'];
    return server === client ? [] : [here + ':text'];
  }
  if (server.tag !== client.tag) return [here + ':tag'];
  const sk = server.children || [];
  const ck = client.children || [];
  const out = [];
  for (let i = 0; i < Math.max(sk.length, ck.length); i++) {
    out.push(...findMismatches(sk[i], ck[i], path === '' ? String(i) : path + '.' + i));
  }
  return out;
}`,
    tests: [
      { args: [{ tag: 'ul', children: [{ tag: 'li', children: ['a'] }] }, { tag: 'ul', children: [{ tag: 'li', children: ['a'] }, { tag: 'li', children: ['b'] }] }], expected: ['1:extra-client'], name: 'extra client child' },
      { args: [{ tag: 'ul', children: [{ tag: 'li', children: ['a'] }, { tag: 'li', children: ['b'] }] }, { tag: 'ul', children: [{ tag: 'li', children: ['a'] }] }], expected: ['1:extra-server'], name: 'extra server child' },
      { args: [{ tag: 'p', children: ['a'] }, { tag: 'p', children: ['b'] }], expected: ['0:text'], name: 'text still compared' },
      { args: [{ tag: 'p', children: ['a'] }, { tag: 'p', children: ['a'] }], expected: [], name: 'equal trees' },
    ],
    bugType: 'loop bound uses the shorter list',
    hint: 'If one side has more children than the other, which loop bound never reaches the extra ones?',
    explanation: 'Looping to Math.min of the two lengths silently skips children that exist on only one side. Loop to the longer length and let the undefined side report extra-client or extra-server.',
  },
  boss: {
    title: 'Simulate a hydration',
    statement: 'Write `hydrate(render, serverCtx, clientCtx)`. `render(ctx)` returns a render tree. The server renders with `{ ...serverCtx, mounted: false }`; the browser\'s FIRST render uses `{ ...clientCtx, mounted: false }`; after mount it renders again with `{ ...clientCtx, mounted: true }`. Return `{ mismatches, final }` where `mismatches` is the list from `findMismatches(serverTree, firstClientTree)` (already available) and `final` is the tree after mount.',
    language: 'javascript',
    fnName: 'hydrate',
    harness: RENDER_HARNESS,
    adapter: 'runHydrate',
    starter: `function hydrate(render, serverCtx, clientCtx) {
  // your code here
}
`,
    solution: `function hydrate(render, serverCtx, clientCtx) {
  const serverTree = render({ ...serverCtx, mounted: false });
  const firstClient = render({ ...clientCtx, mounted: false });
  const mismatches = findMismatches(serverTree, firstClient);
  const final = render({ ...clientCtx, mounted: true });
  return { mismatches, final };
}`,
    tests: [
      { args: ['clock', { now: 100 }, { now: 105 }], expected: { mismatches: ['0:text'], final: { tag: 'p', children: ['Time: 105'] } }, name: 'time read during render' },
      { args: ['clock', { now: 100 }, { now: 100 }], expected: { mismatches: [], final: { tag: 'p', children: ['Time: 100'] } }, name: 'same instant, no mismatch' },
      { args: ['safeClock', { now: 100 }, { now: 105 }], expected: { mismatches: [], final: { tag: 'p', children: ['Time: 105'] } }, name: 'effect-based clock is safe' },
      { args: ['field', { random: 3 }, { random: 8 }], expected: { mismatches: ['root:attr:for'], final: { tag: 'label', props: { for: 'f8' }, children: ['Name'] } }, name: 'random id' },
      { args: ['layout', { width: 0 }, { width: 1200 }], expected: { mismatches: ['0:text'], final: { tag: 'div', children: ['Desktop'] } }, name: 'window width during render' },
    ],
    hints: ['Three renders of the same function with three different contexts: server, first client render (mounted false), post-mount client render (mounted true).', 'Spread the context and override `mounted`: render({ ...serverCtx, mounted: false }). Compare the first two with the supplied findMismatches and return the third as `final`.'],
    combines: ['next-render-modes', 'next-server-client'],
  },
  quiz: [
    {
      prompt: 'Which is the safest way to show the browser window width in a server-rendered component?',
      options: ['Read window.innerWidth directly during render', 'Render a neutral default first, then set the real width in useEffect', 'Wrap the read in typeof window !== "undefined" and render different markup', 'Store the width on the server'],
      answer: 1,
      explain: 'Branching on window still gives different output on the server and in the browser. Rendering the same default first and updating after mount keeps hydration consistent.',
    },
  ],
};

export default unit;
