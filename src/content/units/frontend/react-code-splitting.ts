import type { GraphPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { HookRecorder, LaneTimeline } from '@/content/lib/frontend-hooks';

const code = `
const Dashboard = lazy(() => import('./Dashboard'));   //@lazy
const Settings = lazy(() => import('./Settings'));

function App({ route }) {
  return (
    <Suspense fallback={<Spinner />}>                    //@suspense
      {route === 'home' && <Home />}                     //@home
      {route === 'dashboard' && <Dashboard />}           //@dashboard
      {route === 'settings' && <Settings />}             //@settings
    </Suspense>
  );
}
`;

interface In {
  split: string;
  visits: string[];
  net: string;
}

const CHUNKS: Record<string, { kb: number; x: number; y: number; label: string }> = {
  main: { kb: 120, x: 70, y: 90, label: 'main' },
  dashboard: { kb: 180, x: 250, y: 40, label: 'dashboard' },
  charts: { kb: 90, x: 430, y: 40, label: 'charts-lib' },
  settings: { kb: 60, x: 250, y: 140, label: 'settings' },
};
const ALL = ['main', 'dashboard', 'charts', 'settings'];
const NEEDS: Record<string, string[]> = { home: [], dashboard: ['dashboard', 'charts'], settings: ['settings'] };
const TOTAL_KB = ALL.reduce((s, id) => s + CHUNKS[id].kb, 0);

const parseVisits = (raw: string[]) => raw.map((v) => v.trim().toLowerCase()).filter((v) => v in NEEDS);

interface Outcome {
  initialKB: number;
  fallbacks: number;
  totalKB: number;
}

/** Runs the whole navigation. With a recorder it also emits frames; without one it only measures the end time. */
function simulate(input: In, rec: HookRecorder | null, tMax: number): { out: Outcome; tEnd: number } {
  const split = input.split !== 'single bundle';
  const perKB = input.net === 'slow' ? 4 : 1;
  const visits = parseVisits(input.visits);
  const loaded = new Set<string>();
  let loadingIds: string[] = [];
  let t = 0;
  let totalKB = 0;
  let fallbacks = 0;
  const initialKB = split ? CHUNKS.main.kb : TOTAL_KB;
  const tl = new LaneTimeline(['Network', 'Screen']);

  const graph = (): GraphPanel => ({
    type: 'graph',
    title: 'Bundle graph (dashed = import())',
    width: 520,
    height: 180,
    directed: true,
    nodes: ALL.map((id) => ({
      id,
      label: CHUNKS[id].label,
      x: CHUNKS[id].x,
      y: CHUNKS[id].y,
      shape: 'pill' as const,
      w: 88,
      badge: `${CHUNKS[id].kb} KB`,
      tone: (loaded.has(id) ? 'done' : loadingIds.includes(id) ? 'frontier' : 'muted') as Tone,
    })),
    edges: [
      { from: 'main', to: 'dashboard', directed: true, dashed: true, label: 'import()' },
      { from: 'main', to: 'settings', directed: true, dashed: true, label: 'import()' },
      { from: 'dashboard', to: 'charts', directed: true },
    ],
  });
  const snap = (at: string, caption: string) => {
    if (!rec) return;
    const kb = [...loaded].reduce((s, id) => s + CHUNKS[id].kb, 0);
    rec.step(
      at,
      caption,
      [
        graph(),
        tl.panel(tMax, t, 'Network and screen', 'ms'),
        {
          type: 'kv',
          title: 'Cost so far',
          entries: [
            { k: 'needed before first paint', v: `${initialKB} KB` },
            { k: 'downloaded so far', v: `${kb} KB` },
            { k: 'fallbacks shown', v: fallbacks },
          ],
        },
      ],
      { t, kb },
    );
  };
  const download = (ids: string[], label: string) => {
    loadingIds = ids;
    const kb = ids.reduce((s, id) => s + CHUNKS[id].kb, 0);
    const dur = kb * perKB;
    snap('lazy', `Downloading ${label}: ${kb} KB takes ${dur} ms`);
    tl.add(0, t, label, 'swap', dur);
    t += dur;
    ids.forEach((id) => loaded.add(id));
    totalKB += kb;
    loadingIds = [];
    snap('lazy', `${label} arrived and is cached`);
  };

  snap('lazy', split ? 'Page load: only the entry chunk is needed for the first screen' : 'Page load: one bundle contains every route');
  if (split) download(['main'], 'main');
  else download(ALL, 'bundle');
  tl.add(1, t, 'home', 'done', 15);
  t += 25;

  for (const v of visits) {
    const missing = NEEDS[v].filter((id) => !loaded.has(id));
    if (v === 'home') {
      snap('home', 'Visit home: it lives in the entry chunk, shown at once');
    } else if (!missing.length) {
      snap(v, `Visit ${v}: its code is already here, shown at once`);
    } else {
      fallbacks += 1;
      snap('suspense', `Visit ${v}: code missing, <Suspense> shows the fallback`);
      const start = t;
      for (const id of missing) download([id], CHUNKS[id].label);
      tl.add(1, start, 'fallback', 'frontier', t - start);
      snap(v, `${v} code arrived: the fallback is replaced by the page`);
    }
    tl.add(1, t, v, 'done', 15);
    t += 25;
  }
  snap('home', `Done: ${initialKB} KB before first paint, ${totalKB} KB in total, ${fallbacks} fallback${fallbacks === 1 ? '' : 's'}`);
  return { out: { initialKB, fallbacks, totalKB }, tEnd: t };
}

const viz: VizDef<In> = {
  id: 'react-code-splitting',
  title: 'One bundle vs lazy chunks',
  code,
  language: 'javascript',
  inputs: [
    { key: 'split', label: 'Bundling', kind: 'select', default: 'route splitting', options: ['route splitting', 'single bundle'] },
    { key: 'visits', label: 'Routes visited', kind: 'strings', default: ['home', 'dashboard', 'settings', 'dashboard'], maxItems: 8, help: 'home, dashboard, settings' },
    { key: 'net', label: 'Network', kind: 'select', default: 'fast', options: ['fast', 'slow'] },
  ],
  presets: [
    { label: 'Route splitting', input: { split: 'route splitting', visits: ['home', 'dashboard', 'settings', 'dashboard'], net: 'fast' } },
    { label: 'Single bundle', input: { split: 'single bundle', visits: ['home', 'dashboard', 'settings', 'dashboard'], net: 'fast' } },
    { label: 'Slow network', input: { split: 'route splitting', visits: ['dashboard', 'dashboard'], net: 'slow' } },
    { label: 'Never leaves home', input: { split: 'route splitting', visits: ['home'], net: 'slow' } },
  ],
  run(input) {
    const { tEnd } = simulate(input, null, 1);
    const rec = new HookRecorder(code);
    const { out } = simulate(input, rec, tEnd + 10);
    return { frames: rec.frames, result: out };
  },
  reference({ split, visits }) {
    const seen = new Set(parseVisits(visits));
    if (split === 'single bundle') return { initialKB: TOTAL_KB, fallbacks: 0, totalKB: TOTAL_KB };
    let total = CHUNKS.main.kb;
    let fallbacks = 0;
    if (seen.has('dashboard')) {
      total += CHUNKS.dashboard.kb + CHUNKS.charts.kb;
      fallbacks += 1;
    }
    if (seen.has('settings')) {
      total += CHUNKS.settings.kb;
      fallbacks += 1;
    }
    return { initialKB: CHUNKS.main.kb, fallbacks, totalKB: total };
  },
};

const unit: Unit = {
  id: 'react-code-splitting',
  hook: 'Bundle size is a favourite performance topic. Interviewers want the full chain: dynamic import() makes a chunk, React.lazy renders it, Suspense covers the wait.',
  predict: {
    prompt: 'When does the browser start downloading the Admin chunk?',
    code: `const Admin = lazy(() => import('./Admin'));

function App({ user }) {
  return (
    <Suspense fallback={<Spinner />}>
      {user.isAdmin && <Admin />}
    </Suspense>
  );
}`,
    codeLang: 'jsx',
    options: ['When the page loads, in the main bundle', 'When lazy() runs at module load', 'The first time <Admin /> is rendered', 'When Suspense mounts'],
    answer: 2,
    explain: 'lazy() only stores the loader function. React calls it, triggering import(), the first time the component is rendered. A non-admin never downloads that code.',
  },
  viz,
  deeper: {
    points: [
      'import("./x") returns a promise and tells the bundler to put x (and what only it uses) in a separate chunk, fetched on demand.',
      'React.lazy(() => import(...)) wraps that promise as a component. Rendering it before it has loaded suspends to the nearest <Suspense fallback>.',
      'Split along routes first (users rarely visit every page), then heavy widgets such as charts, editors and modals.',
      'Chunks are cached after the first load. Prefetch on hover or when idle to hide the wait for likely next pages.',
      'lazy needs a default export. Without Suspense above it, a suspended component throws; an error boundary handles failed downloads.',
    ],
    pitfalls: ['Splitting tiny components (extra requests cost more than they save)', 'Forgetting the Suspense boundary or an error boundary for failed chunks', 'Importing a lazy module statically elsewhere, which pulls it back into the main bundle'],
  },
  practice: {
    language: 'jsx',
    fnName: 'ChartPanel',
    statement: 'Load the chart code on demand without Suspense. "Show chart" downloads it once (loading state while it comes in), shows the chart, and later shows reuse the cached component without downloading again.',
    signature: `function loadChart(downloads) {
  downloads.current += 1;
  return new Promise((resolve) => setTimeout(() => resolve({ default: () => <p>Chart ready</p> }), 10));
}

function ChartPanel() {`,
    solution: `function loadChart(downloads) {
  downloads.current += 1;
  return new Promise((resolve) => setTimeout(() => resolve({ default: () => <p>Chart ready</p> }), 10));
}

function ChartPanel() {
  const [Chart, setChart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);
  const downloads = useRef(0);
  const show = () => {
    setShown(true);
    if (@@Chart || loading@@) return;
    setLoading(@@true@@);
    loadChart(downloads).then((mod) => {
      setChart(@@() => mod.default@@);
      setLoading(false);
    });
  };
  return (
    <div>
      <p>Downloads: {downloads.current}</p>
      <button onClick={show}>Show chart</button>
      <button onClick={() => setShown(false)}>Hide chart</button>
      {shown && loading && <p>Loading chart...</p>}
      {shown && Chart && <Chart />}
    </div>
  );
}`,
    reactTests: [
      { name: 'nothing downloaded at first', steps: [{ expectText: 'Downloads: 0' }, { expectNoText: 'Chart ready' }] },
      { name: 'show downloads and renders the chart', steps: [{ click: 'text=Show chart' }, { expectText: 'Chart ready' }, { expectText: 'Downloads: 1' }, { expectNoText: 'Loading' }] },
      { name: 'hide removes it', steps: [{ click: 'text=Show chart' }, { click: 'text=Hide chart' }, { expectNoText: 'Chart ready' }] },
      { name: 'second show uses the cache', steps: [{ click: 'text=Show chart' }, { click: 'text=Hide chart' }, { click: 'text=Show chart' }, { expectText: 'Chart ready' }, { expectText: 'Downloads: 1' }] },
    ],
  },
  debug: {
    language: 'jsx',
    fnName: 'ReportViewer',
    statement: 'Opening the report crashes with "Element type is invalid" instead of showing "Report ready". The lazily loaded component is stored in state. Fix how it is stored.',
    buggy: `function loadReport() {
  return new Promise((resolve) => setTimeout(() => resolve({ default: () => <p>Report ready</p> }), 10));
}

function ReportViewer() {
  const [View, setView] = useState(null);
  const open = () => {
    loadReport().then((mod) => setView(mod.default));
  };
  return (
    <div>
      <button onClick={open}>Open report</button>
      {View && <View />}
    </div>
  );
}`,
    fixed: `function loadReport() {
  return new Promise((resolve) => setTimeout(() => resolve({ default: () => <p>Report ready</p> }), 10));
}

function ReportViewer() {
  const [View, setView] = useState(null);
  const open = () => {
    loadReport().then((mod) => setView(() => mod.default));
  };
  return (
    <div>
      <button onClick={open}>Open report</button>
      {View && <View />}
    </div>
  );
}`,
    reactTests: [
      { name: 'closed at first', steps: [{ expectText: 'Open report' }, { expectNoText: 'Report ready' }] },
      { name: 'opens the loaded component', steps: [{ click: 'text=Open report' }, { expectText: 'Report ready' }] },
      { name: 'opening twice is fine', steps: [{ click: 'text=Open report' }, { click: 'text=Open report' }, { expectText: 'Report ready' }] },
    ],
    bugType: 'function stored in state',
    hint: 'What does React do when you pass a function to a state setter?',
    explanation: 'A function passed to setView is treated as an updater, so React called the component itself with the old state and stored the element it returned. Wrap it: setView(() => mod.default) stores the function as the value.',
  },
  boss: {
    title: 'Lazy tabs with a cache',
    statement:
      'The fake importer `loadTab(name, downloads)` is given. Build `TabbedApp` with buttons "Overview", "Reports" and "Settings". Overview ("Overview content") is part of the main bundle. Reports and Settings are loaded on first open: show `Loading <name>...` while the chunk comes in, then the component it exports ("<name> content"). Re-opening a tab must reuse the loaded component. Show `Downloads: n` from the `downloads` ref passed to loadTab.',
    language: 'jsx',
    fnName: 'TabbedApp',
    starter: `function loadTab(name, downloads) {
  downloads.current += 1;
  return new Promise((resolve) => setTimeout(() => resolve({ default: () => <p>{name} content</p> }), 8));
}

function TabbedApp() {
  // your code here
  return null;
}
`,
    solution: `function loadTab(name, downloads) {
  downloads.current += 1;
  return new Promise((resolve) => setTimeout(() => resolve({ default: () => <p>{name} content</p> }), 8));
}

function TabbedApp() {
  const [tab, setTab] = useState('Overview');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(null);
  const downloads = useRef(0);
  const open = (name) => {
    setTab(name);
    if (name === 'Overview' || cache[name] || loading === name) return;
    setLoading(name);
    loadTab(name, downloads).then((mod) => {
      setCache((c) => ({ ...c, [name]: mod.default }));
      setLoading((l) => (l === name ? null : l));
    });
  };
  const Active = cache[tab];
  return (
    <div>
      {['Overview', 'Reports', 'Settings'].map((name) => (
        <button key={name} onClick={() => open(name)}>{name}</button>
      ))}
      <p>Downloads: {downloads.current}</p>
      {tab === 'Overview' && <p>Overview content</p>}
      {tab !== 'Overview' && !Active && <p>Loading {tab}...</p>}
      {Active && <Active />}
    </div>
  );
}`,
    reactTests: [
      { name: 'overview needs no download', steps: [{ expectText: 'Overview content' }, { expectText: 'Downloads: 0' }] },
      { name: 'opening a tab loads it once', steps: [{ click: 'text=Reports' }, { expectText: 'Reports content' }, { expectText: 'Downloads: 1' }, { expectNoText: 'Loading' }] },
      { name: 'revisiting uses the cache', steps: [{ click: 'text=Reports' }, { click: 'text=Overview' }, { expectText: 'Overview content' }, { expectNoText: 'Reports content' }, { click: 'text=Reports' }, { expectText: 'Reports content' }, { expectText: 'Downloads: 1' }] },
      { name: 'each tab is its own chunk', steps: [{ click: 'text=Reports' }, { click: 'text=Settings' }, { expectText: 'Settings content' }, { expectNoText: 'Reports content' }, { expectText: 'Downloads: 2' }] },
    ],
    hints: ['You need to remember which tabs are already loaded. What state holds that, and what do you check before calling loadTab?', 'Keep cache = { name: Component } in state (storing it inside an object avoids the function-in-state trap). On open: setTab(name); if it is Overview or already cached, stop; otherwise set a loading name, call loadTab(name, downloads).then(mod => setCache(c => ({ ...c, [name]: mod.default }))).'],
    combines: ['hook-useref', 'hook-useeffect'],
  },
  quiz: [
    {
      prompt: 'What does <Suspense fallback={...}> render while a lazy component is still downloading?',
      options: ['Nothing, the page freezes', 'The fallback', 'The previous route forever', 'An error'],
      answer: 1,
      explain: 'A lazy component that has not loaded suspends; the nearest Suspense boundary shows its fallback until the chunk arrives.',
    },
  ],
};

export default unit;
