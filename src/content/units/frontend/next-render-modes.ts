import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/frontend-next';

const code = `
const built = render(0);                          //@build
let cache = { page: built, generatedAt: 0 };

function serve(mode, t) {
  if (mode === 'SSG') return built;               //@ssg
  if (mode === 'SSR') return render(t);           //@ssr
  if (mode === 'CSR') return render(t + JS_LOAD); //@csr
  const age = t - cache.generatedAt;              //@stale
  const served = cache.page;                      //@serve
  if (age >= revalidate) {                        //@check
    cache = { page: render(t), generatedAt: t };  //@regen
  }
  return served;
}
`;

type Mode = 'SSG' | 'SSR' | 'ISR' | 'CSR';

interface In {
  mode: Mode;
  requests: number[];
  dataChangedAt: number;
  revalidate: number;
}

const JS_LOAD = 4;

function reference(mode: Mode, times: number[], dataChangedAt: number, revalidate: number): string[] {
  const ver = (t: number) => (t >= dataChangedAt ? 'v2' : 'v1');
  if (mode === 'SSG') return times.map(() => ver(0));
  if (mode === 'SSR') return times.map((t) => ver(t));
  if (mode === 'CSR') return times.map((t) => ver(t + JS_LOAD));
  const out: string[] = [];
  let cached = ver(0);
  let at = 0;
  for (const t of times) {
    out.push(cached);
    if (t - at >= revalidate) [cached, at] = [ver(t), t];
  }
  return out;
}

const viz: VizDef<In> = {
  id: 'next-render-modes',
  title: 'SSR vs SSG vs ISR vs CSR',
  code,
  language: 'javascript',
  inputs: [
    { key: 'mode', label: 'Rendering mode', kind: 'select', options: ['SSG', 'SSR', 'ISR', 'CSR'], default: 'ISR' },
    { key: 'requests', label: 'Request times (ticks)', kind: 'numbers', default: [4, 14, 16], maxItems: 4 },
    { key: 'dataChangedAt', label: 'Data changes at t =', kind: 'number', default: 8 },
    { key: 'revalidate', label: 'ISR revalidate window', kind: 'number', default: 10 },
  ],
  presets: [
    { label: 'SSG: frozen at build', input: { mode: 'SSG' } },
    { label: 'SSR: always fresh', input: { mode: 'SSR' } },
    { label: 'ISR: stale once, then fresh', input: { mode: 'ISR' } },
    { label: 'ISR: long window', input: { mode: 'ISR', revalidate: 30 } },
    { label: 'CSR: shell then fetch', input: { mode: 'CSR' } },
  ],
  run({ mode, requests, dataChangedAt, revalidate }) {
    const r = new Recorder(code);
    const times = [...requests].sort((a, b) => a - b).slice(0, 4);
    const ver = (t: number) => (t >= dataChangedAt ? 'v2' : 'v1');
    const hasBuild = mode === 'SSG' || mode === 'ISR';
    const lanes: { label: string; events: TimelineEvent[] }[] = [
      { label: 'Build', events: [hasBuild ? { t: 0, dur: 2, label: `render ${ver(0)}`, tone: 'done' } : { t: 0, dur: 2, label: 'bundle JS', tone: 'muted' }] },
      { label: 'Data source', events: [{ t: dataChangedAt, dur: 1, label: 'data: v2', tone: 'new' }] },
    ];
    const tMax = Math.max(...times, dataChangedAt) + 12;
    const versions: string[] = [];
    let cache = { ver: ver(0), generatedAt: 0 };
    const view = (now: number, saw?: string): Panel[] => [
      { type: 'timeline', title: `${mode} timeline (1 tick = 1 time unit)`, lanes, tMax, now, unit: 't' },
      { type: 'kv', title: 'State', entries: [{ k: 'data now', v: ver(now) }, ...(mode === 'ISR' ? [{ k: 'cached page', v: `${cache.ver} (made at t=${cache.generatedAt})` }] : []), ...(saw ? [{ k: 'visitor sees', v: saw, tone: (saw === ver(now) ? 'found' : 'error') as Tone }] : [])] },
    ];
    const vars = (t: number, extra: Record<string, unknown> = {}) => ({ t, mode, ...extra });

    r.step(
      'build',
      hasBuild ? cap(`Build time: the page is rendered once with data ${ver(0)}`) : `${mode} does not render the page at build time`,
      view(0),
      vars(0),
    );
    times.forEach((t, idx) => {
      r.op();
      const events: TimelineEvent[] = [];
      lanes.push({ label: `Request ${idx + 1} @${t}`, events });
      if (mode === 'SSG') {
        const v = ver(0);
        events.push({ t, dur: 1, label: `CDN: ${v}`, tone: v === ver(t) ? 'found' : 'error' }, { t: t + 1, dur: 2, label: 'hydrate', tone: 'active' });
        versions.push(v);
        r.step('ssg', cap(`t=${t}: CDN returns the HTML built at t=0 (${v}); no server work`), view(t, v), vars(t, { served: v }));
      } else if (mode === 'SSR') {
        const v = ver(t);
        events.push({ t, dur: 4, label: `fetch+render ${v}`, tone: 'swap' }, { t: t + 4, dur: 2, label: 'hydrate', tone: 'active' });
        versions.push(v);
        r.step('ssr', cap(`t=${t}: server fetches and renders on this request, so the page is ${v}`), view(t, v), vars(t, { served: v }));
      } else if (mode === 'CSR') {
        const v = ver(t + JS_LOAD);
        events.push({ t, dur: 1, label: 'empty shell', tone: 'muted' }, { t: t + 1, dur: 3, label: 'download JS', tone: 'compare' }, { t: t + JS_LOAD, dur: 2, label: `fetch ${v}`, tone: 'swap' });
        versions.push(v);
        r.step('csr', cap(`t=${t}: shell now, JS loads, data fetched at t=${t + JS_LOAD}: user sees ${v}`), view(t, v), vars(t, { served: v }));
      } else {
        const age = t - cache.generatedAt;
        const stale = age >= revalidate;
        r.step('stale', cap(`t=${t}: cached page is ${age} old, window is ${revalidate}: ${stale ? 'STALE' : 'fresh'}`), view(t), vars(t, { age, revalidate }));
        const served = cache.ver;
        versions.push(served);
        events.push({ t, dur: 1, label: `CDN: ${served}`, tone: served === ver(t) ? 'found' : 'error' }, { t: t + 1, dur: 2, label: 'hydrate', tone: 'active' });
        r.step('serve', cap(`Serve the cached ${served} right away${served !== ver(t) ? ' (data has moved on)' : ''}`), view(t, served), vars(t, { served }));
        r.step('check', stale ? 'Stale: this visit also triggers a background regeneration' : 'Still inside the window: no work for the server', view(t, served), vars(t, { age }));
        if (stale) {
          events.push({ t: t + 1, dur: 2, label: `regen ${ver(t)}`, tone: 'swap' });
          cache = { ver: ver(t), generatedAt: t };
          r.step('regen', cap(`New page ${cache.ver} replaces the cache; the next visitor gets it`), view(t, served), vars(t, { cached: cache.ver }));
        }
      }
    });
    r.step(mode.toLowerCase() === 'isr' ? 'serve' : mode.toLowerCase(), cap(`Versions seen by visitors: ${versions.join(', ') || 'none'}`), view(times[times.length - 1] ?? 0), vars(times[times.length - 1] ?? 0));
    return { frames: r.frames, result: versions };
  },
  reference({ mode, requests, dataChangedAt, revalidate }) {
    return reference(mode, [...requests].sort((a, b) => a - b).slice(0, 4), dataChangedAt, revalidate);
  },
};

const unit: Unit = {
  id: 'next-render-modes',
  hook: '"When does the HTML get generated, and how fresh is it?" is the question behind SSR, SSG, ISR and CSR. Being able to trace one request through each mode, including who sees stale data, is core Next.js interview material.',
  simulationNote: 'Next.js-style simulation: no real server, build or CDN runs here. The exercises model when content is produced and which version a visitor gets using plain JavaScript, not Next.js itself.',
  predict: {
    prompt: 'A page uses ISR with revalidate = 10 seconds. It was generated at t=0 and the data changed at t=5. The first request after that arrives at t=14. What does that visitor see?',
    options: ['The new data, because the window passed', 'The old page, and a regeneration starts in the background', 'A loading state while the server regenerates', 'An error until the cache is cleared'],
    answer: 1,
    explain: 'ISR is stale-while-revalidate. The expired page is still served immediately and the request triggers a background regeneration. The next visitor sees the new page.',
  },
  viz,
  deeper: {
    points: [
      'SSG renders at build time: fastest and cheapest, but frozen until the next deploy.',
      'SSR renders on every request: always fresh and can use cookies and headers, but each hit costs server time.',
      'ISR is SSG plus a timer: serve the cached page, and once it is older than the revalidate window regenerate it in the background.',
      'CSR ships an empty shell and fetches in the browser: simple hosting, but the user waits for JS and then the data, and crawlers see little.',
      'In the App Router the mode is inferred: no dynamic functions means static, export const revalidate adds ISR, using cookies() or dynamic = "force-dynamic" means SSR.',
    ],
    pitfalls: ['Believing ISR guarantees fresh data after the window (the first visitor after expiry still gets the stale page)', 'Calling cookies() or headers() in a page and silently turning a static route into SSR', 'Forgetting that SSG data is a build-time snapshot'],
  },
  practice: {
    language: 'javascript',
    fnName: 'isrServe',
    statement: 'Simulate ISR. The page is generated at t=0 with the data version at that time ("v1" before dataChangedAt, "v2" from then on). For each request time (ascending) return the version the visitor gets. A request that finds the cache older than or equal to `revalidate` still gets the cached page, but regenerates the cache with the current version.',
    signature: 'function isrServe(times, revalidate, dataChangedAt) {',
    solution: `function isrServe(times, revalidate, dataChangedAt) {
  const version = (t) => (t >= dataChangedAt ? 'v2' : 'v1');
  let cached = version(0);
  let generatedAt = 0;
  return times.map((t) => {
    const served = @@cached@@;
    if (@@t - generatedAt >= revalidate@@) {
      cached = @@version(t)@@;
      generatedAt = @@t@@;
    }
    return served;
  });
}`,
    tests: [
      { args: [[4, 14, 16], 10, 8], expected: ['v1', 'v1', 'v2'], name: 'stale once, then fresh' },
      { args: [[4, 14, 16], 10, 1000], expected: ['v1', 'v1', 'v1'], name: 'data never changes' },
      { args: [[1, 2, 3], 10, 0], expected: ['v2', 'v2', 'v2'], name: 'built after the change' },
      { args: [[5, 25, 26, 40], 20, 10], expected: ['v1', 'v1', 'v2', 'v2'], name: 'long window' },
      { args: [[30, 31], 10, 5], expected: ['v1', 'v2'], name: 'first visit after expiry' },
      { args: [[], 10, 5], expected: [], name: 'no requests' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'isrServe',
    statement: 'This ISR cache never refreshes: visitors keep getting the first page long after the window passed. Find the bug.',
    buggy: `function isrServe(times, revalidate, dataChangedAt) {
  const version = (t) => (t >= dataChangedAt ? 'v2' : 'v1');
  let cached = version(0);
  let generatedAt = 0;
  return times.map((t) => {
    const served = cached;
    if (generatedAt - t >= revalidate) {
      cached = version(t);
      generatedAt = t;
    }
    return served;
  });
}`,
    fixed: `function isrServe(times, revalidate, dataChangedAt) {
  const version = (t) => (t >= dataChangedAt ? 'v2' : 'v1');
  let cached = version(0);
  let generatedAt = 0;
  return times.map((t) => {
    const served = cached;
    if (t - generatedAt >= revalidate) {
      cached = version(t);
      generatedAt = t;
    }
    return served;
  });
}`,
    tests: [
      { args: [[4, 14, 16], 10, 8], expected: ['v1', 'v1', 'v2'] },
      { args: [[5, 25, 26, 40], 20, 10], expected: ['v1', 'v1', 'v2', 'v2'] },
      { args: [[30, 31], 10, 5], expected: ['v1', 'v2'] },
      { args: [[1, 2, 3], 10, 0], expected: ['v2', 'v2', 'v2'] },
    ],
    bugType: 'comparison in the wrong direction',
    hint: 'What is the sign of generatedAt - t for a request that arrives after the page was generated?',
    explanation: 'The age of the cached page is now minus generatedAt. Writing generatedAt - t gives a negative number, so the stale check is never true and the page is never regenerated.',
  },
  boss: {
    title: 'Render-mode simulator',
    statement: 'Write servePlan(mode, times, dataChangedAt, revalidate) for mode "SSG", "SSR", "ISR" or "CSR". The data is "v1" before dataChangedAt and "v2" from then on. SSG serves the t=0 build. SSR renders at request time t. CSR reads data 4 ticks after the request (the JS has to load first). ISR behaves like the practice problem. Return { versions, renders } where renders counts renders done by the server because of requests (SSG and CSR: 0, SSR: one per request, ISR: one per regeneration).',
    language: 'javascript',
    fnName: 'servePlan',
    starter: `function servePlan(mode, times, dataChangedAt, revalidate) {
  // your code here
}
`,
    solution: `function servePlan(mode, times, dataChangedAt, revalidate) {
  const version = (t) => (t >= dataChangedAt ? 'v2' : 'v1');
  if (mode === 'SSG') return { versions: times.map(() => version(0)), renders: 0 };
  if (mode === 'SSR') return { versions: times.map((t) => version(t)), renders: times.length };
  if (mode === 'CSR') return { versions: times.map((t) => version(t + 4)), renders: 0 };
  let cached = version(0);
  let generatedAt = 0;
  let renders = 0;
  const versions = times.map((t) => {
    const served = cached;
    if (t - generatedAt >= revalidate) {
      cached = version(t);
      generatedAt = t;
      renders++;
    }
    return served;
  });
  return { versions, renders };
}`,
    tests: [
      { args: ['SSG', [1, 20], 10, 5], expected: { versions: ['v1', 'v1'], renders: 0 }, name: 'SSG frozen' },
      { args: ['SSR', [1, 20, 30], 10, 5], expected: { versions: ['v1', 'v2', 'v2'], renders: 3 }, name: 'SSR every request' },
      { args: ['CSR', [4, 8], 10, 5], expected: { versions: ['v1', 'v2'], renders: 0 }, name: 'CSR reads data later' },
      { args: ['ISR', [4, 14, 16], 8, 10], expected: { versions: ['v1', 'v1', 'v2'], renders: 1 }, name: 'ISR with one regeneration' },
      { args: ['ISR', [2, 3, 4], 100, 50], expected: { versions: ['v1', 'v1', 'v1'], renders: 0 }, name: 'ISR no change inside the window' },
    ],
    hints: ['Compute version(t) once, then handle each mode in its own branch. ISR is the practice function plus a counter.', 'SSG ignores request time (always version(0)), SSR uses version(t), CSR uses version(t + 4), ISR serves the old cache then regenerates when t - generatedAt >= revalidate.'],
    combines: ['next-data-fetching'],
  },
  quiz: [
    {
      prompt: 'Which choice makes a page rendered on every request in the App Router?',
      options: ['export const revalidate = 60', 'Reading cookies() in the page', 'Adding generateStaticParams', "Marking the page 'use client'"],
      answer: 1,
      explain: 'Using a dynamic function such as cookies() or headers() opts the route into per-request rendering. revalidate gives ISR; generateStaticParams pre-renders at build.',
    },
  ],
};

export default unit;
