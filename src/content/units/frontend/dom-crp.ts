import { Recorder } from '@/engine/recorder';
import type { GraphPanel, Tone, TimelineEvent, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function firstPaint(resources) {
  fetchAll(resources);                                  //@fetch
  let cssReady = 0, t = HTML_ARRIVES;
  for (const r of resources) {                          //@parse
    t += PARSE_TAG;
    if (r.type === 'css') {
      cssReady = Math.max(cssReady, r.done);            //@css
    } else if (r.type === 'js') {
      t = Math.max(t, r.done, cssReady) + EXEC;         //@js
    }
  }
  const domReady = t;                                   //@dom
  const renderTree = Math.max(domReady, cssReady);      //@render
  return renderTree + LAYOUT + PAINT;                   //@paint
}
`;

type Kind = 'css' | 'js' | 'async' | 'defer' | 'img';
interface Res {
  name: string;
  type: Kind;
  ms: number;
}
interface In {
  resources: Res[];
}

const HTML_ARRIVES = 40;
const PARSE_TAG = 5;
const EXEC = 5;
const LAYOUT = 8;
const PAINT = 6;

const KIND_LABEL: Record<Kind, string> = { css: '<link rel=stylesheet>', js: '<script>', async: '<script async>', defer: '<script defer>', img: '<img>' };

function blocks(t: Kind): boolean {
  return t === 'css' || t === 'js';
}

/** Independent closed-form model (no recording): used as the reference. */
function model(resources: Res[]): { blocking: string[]; firstPaint: number } {
  let t = HTML_ARRIVES;
  let css = 0;
  for (const r of resources) {
    const done = HTML_ARRIVES + r.ms;
    t += PARSE_TAG;
    if (r.type === 'css') css = Math.max(css, done);
    if (r.type === 'js') t = Math.max(t, done, css) + EXEC;
  }
  return { blocking: resources.filter((r) => blocks(r.type)).map((r) => r.name), firstPaint: Math.max(t, css) + LAYOUT + PAINT };
}

const STAGES = ['HTML', 'DOM', 'CSS', 'CSSOM', 'Render tree', 'Layout', 'Paint', 'Composite'];

function pipeline(done: Set<string>, active: string | null): GraphPanel {
  const pos: Record<string, [number, number]> = { HTML: [50, 30], DOM: [150, 30], CSS: [50, 100], CSSOM: [150, 100], 'Render tree': [260, 65], Layout: [360, 65], Paint: [460, 65], Composite: [560, 65] };
  const tone = (s: string): Tone => (s === active ? 'active' : done.has(s) ? 'done' : 'default');
  const edges: [string, string][] = [['HTML', 'DOM'], ['CSS', 'CSSOM'], ['DOM', 'Render tree'], ['CSSOM', 'Render tree'], ['Render tree', 'Layout'], ['Layout', 'Paint'], ['Paint', 'Composite']];
  return {
    type: 'graph',
    title: 'Rendering pipeline',
    directed: true,
    width: 620,
    height: 130,
    nodes: STAGES.map((s) => ({ id: s, label: s, x: pos[s][0], y: pos[s][1], shape: 'pill', w: s.length > 6 ? 84 : 56, h: 28, tone: tone(s) })),
    edges: edges.map(([from, to]) => ({ from, to, directed: true, tone: done.has(from) && done.has(to) ? ('done' as Tone) : undefined })),
  };
}

const viz: VizDef<In> = {
  id: 'dom-crp',
  title: 'Critical rendering path',
  code,
  language: 'javascript',
  inputs: [
    {
      key: 'resources',
      label: 'Resources in document order',
      kind: 'json',
      default: [
        { name: 'app.css', type: 'css', ms: 90 },
        { name: 'vendor.js', type: 'js', ms: 60 },
        { name: 'hero.jpg', type: 'img', ms: 150 },
        { name: 'analytics.js', type: 'async', ms: 120 },
      ],
      help: 'type: css | js | async | defer | img, ms = download time',
      maxItems: 8,
    },
  ],
  presets: [
    { label: 'Everything non-blocking', input: { resources: [{ name: 'app.css', type: 'css', ms: 30 }, { name: 'main.js', type: 'defer', ms: 80 }, { name: 'ads.js', type: 'async', ms: 100 }] } },
    { label: 'Slow sync script', input: { resources: [{ name: 'app.css', type: 'css', ms: 40 }, { name: 'widgets.js', type: 'js', ms: 200 }, { name: 'logo.png', type: 'img', ms: 20 }] } },
    { label: 'Script waits on CSS', input: { resources: [{ name: 'big.css', type: 'css', ms: 180 }, { name: 'init.js', type: 'js', ms: 20 }] } },
  ],
  run({ resources }) {
    const r = new Recorder(code);
    const list = resources.slice(0, 8);
    const fin = list.map((x) => HTML_ARRIVES + x.ms);
    // Build the whole schedule first, then reveal it step by step.
    const parse: { res: Res; at: number; waitUntil: number; end: number }[] = [];
    let t = HTML_ARRIVES;
    let css = 0;
    const cssAt: number[] = [];
    list.forEach((x, i) => {
      t += PARSE_TAG;
      const at = t - PARSE_TAG;
      let waitUntil = t;
      if (x.type === 'css') css = Math.max(css, fin[i]);
      if (x.type === 'js') {
        waitUntil = Math.max(t, fin[i], css);
        t = waitUntil + EXEC;
      }
      cssAt.push(css);
      parse.push({ res: x, at, waitUntil, end: t });
    });
    const domReady = t;
    const renderAt = Math.max(domReady, css);
    const paintAt = renderAt + LAYOUT + PAINT;
    const tMax = Math.max(paintAt, ...fin) + 10;
    const done = new Set<string>();
    let now = 0;
    const timeline = () => {
      const net: TimelineEvent[] = [{ t: 0, dur: HTML_ARRIVES, label: 'HTML', tone: 'done' }];
      const par: TimelineEvent[] = [];
      const main: TimelineEvent[] = [];
      list.forEach((x) => {
        if (now >= HTML_ARRIVES) net.push({ t: HTML_ARRIVES, dur: Math.min(x.ms, Math.max(0, now - HTML_ARRIVES)), label: x.name, tone: blocks(x.type) ? 'error' : 'muted' });
      });
      for (const p of parse) {
        if (now > p.at) {
          par.push({ t: p.at, dur: Math.min(PARSE_TAG, now - p.at), label: p.res.type === 'css' ? 'tag' : 'parse', tone: 'active' });
          if (p.res.type === 'js' && p.waitUntil > p.at + PARSE_TAG && now > p.at + PARSE_TAG) par.push({ t: p.at + PARSE_TAG, dur: Math.min(p.waitUntil - p.at - PARSE_TAG, now - p.at - PARSE_TAG), label: 'blocked', tone: 'error' });
          if (p.res.type === 'js' && now > p.waitUntil) par.push({ t: p.waitUntil, dur: Math.min(EXEC, now - p.waitUntil), label: 'run js', tone: 'swap' });
        }
      }
      if (now > renderAt) main.push({ t: renderAt, dur: Math.min(LAYOUT, now - renderAt), label: 'layout', tone: 'compare' });
      if (now > renderAt + LAYOUT) main.push({ t: renderAt + LAYOUT, dur: Math.min(PAINT, now - renderAt - LAYOUT), label: 'paint', tone: 'found' });
      return { type: 'timeline' as const, title: 'Timeline (ms)', lanes: [{ label: 'Network', events: net }, { label: 'Parser', events: par }, { label: 'Render', events: main }], tMax, now, unit: 'ms' };
    };
    const show = (active: string | null) => [pipeline(done, active), timeline()];
    const vars = (extra: Record<string, unknown> = {}) => ({ now, ...extra });

    now = HTML_ARRIVES;
    done.add('HTML');
    r.step('fetch', `HTML arrives at ${now}ms. The preload scanner starts every download in parallel.`, show('HTML'), vars());
    list.forEach((x, i) => {
      const p = parse[i];
      now = p.end;
      if (x.type === 'css') {
        done.add('CSS');
        r.step('css', `${x.name}: CSS does not stop the parser, but it blocks first paint (ready at ${fin[i]}ms)`, show('CSS'), vars({ cssReady: cssAt[i] }));
      } else if (x.type === 'js') {
        const wait = p.waitUntil - (p.at + PARSE_TAG);
        r.step('js', wait > 0 ? `${x.name} is a sync script: parser stalls ${wait}ms until it is fetched${cssAt[i] > fin[i] ? ' and the CSS before it is ready' : ''}, then runs` : `${x.name} is a sync script: parser pauses to run it (already downloaded)`, show('DOM'), vars({ parsedUntil: p.end }));
      } else {
        const why = x.type === 'async' ? 'async: downloads in parallel, runs when ready' : x.type === 'defer' ? 'defer: runs after parsing, order kept' : 'images never block first paint';
        r.step('parse', `${x.name} (${KIND_LABEL[x.type]}) does not block — ${why}`, show('DOM'), vars({ parsedUntil: p.end }));
      }
    });
    now = domReady;
    done.add('DOM');
    r.step('dom', `Parser reached the end: DOM is complete at ${domReady}ms`, show('DOM'), vars());
    if (css > domReady) {
      now = css;
      done.add('CSSOM');
      r.step('render', `Still waiting for the last stylesheet: CSSOM completes at ${css}ms`, show('CSSOM'), vars());
    } else {
      done.add('CSSOM');
    }
    now = renderAt;
    done.add('Render tree');
    r.step('render', `DOM + CSSOM combine into the render tree at ${renderAt}ms`, show('Render tree'), vars());
    now = renderAt + LAYOUT;
    done.add('Layout');
    r.step('paint', `Layout computes sizes and positions (${LAYOUT}ms)`, show('Layout'), vars());
    now = paintAt;
    done.add('Paint');
    done.add('Composite');
    r.step('paint', `First paint at ${paintAt}ms. Blocking: ${list.filter((x) => blocks(x.type)).map((x) => x.name).join(', ') || 'nothing'}`, show('Paint'), vars({ firstPaint: paintAt }));
    return { frames: r.frames, result: { blocking: list.filter((x) => blocks(x.type)).map((x) => x.name), firstPaint: paintAt } };
  },
  reference({ resources }) {
    return model(resources.slice(0, 8));
  },
};

const blockedBuggy = `function blockingTime(resources) {
  const blockers = resources.filter(
    (r) => r.type === 'css' || (r.type === 'script' && !r.async && !r.defer)
  );
  return blockers.reduce((total, r) => total + r.ms, 0);
}`;

const unit: Unit = {
  id: 'dom-crp',
  hook: '"What happens between the HTML arriving and pixels on screen?" is a classic frontend question. The answer — which resources block first paint, and why — drives every real performance recommendation about CSS, scripts and fonts.',
  predict: {
    prompt: 'A page has `<link rel="stylesheet" href="app.css">` (200 ms), then `<script src="main.js"></script>` (50 ms) with no attributes, then 2 KB of visible HTML. Roughly when can the browser run `main.js`?',
    options: ['After about 50 ms; the script does not care about CSS', 'After about 250 ms; downloads queue one after the other', 'After about 200 ms; a script waits for pending stylesheets that come before it', 'Only after the page has finished painting'],
    answer: 2,
    explain: 'Scripts might read computed styles, so the browser will not run a sync script until earlier stylesheets have loaded (CSSOM ready). Downloads happen in parallel, so the wait is the slowest of them (~200 ms), not the sum. The parser is stalled all that time, which delays the DOM and first paint.',
  },
  viz,
  simulationNote: 'Timings come from a small deterministic model (40 ms for HTML, 5 ms per tag, 5 ms script run, 8 ms layout, 6 ms paint, all downloads in parallel). Real browsers add speculative work, but the blocking rules shown are the real ones.',
  deeper: {
    points: [
      'HTML becomes the DOM, CSS becomes the CSSOM. Neither is useful alone: the render tree is built from both, and only visible nodes (not `display: none`) enter it.',
      'CSS is render-blocking: nothing paints until the CSSOM is ready, so large or late stylesheets directly delay first paint. `media="print"` stylesheets are not render-blocking.',
      'A plain `<script>` is parser-blocking: HTML parsing stops while it downloads and runs, and it also waits for earlier stylesheets.',
      '`async` scripts download in parallel and run as soon as they arrive (order not guaranteed); `defer` scripts run after parsing, in document order. Neither blocks the parser.',
      'Layout works out geometry, paint draws layers, composite stitches the layers (often on the GPU). Later changes may skip some stages — see the reflow unit.',
    ],
    pitfalls: ['Putting render-blocking scripts in `<head>` without `defer`', 'Believing `async` and `defer` are the same', 'Counting downloads as sequential and summing them instead of taking the slowest blocker'],
  },
  practice: {
    language: 'javascript',
    fnName: 'firstPaintBlockers',
    statement: 'Each resource is `{ name, type, async, defer, media }` where `type` is `"css"`, `"script"` or `"img"`. Return the names that block first paint: stylesheets whose `media` is missing, `"all"` or `"screen"`, and scripts that are neither `async` nor `defer`.',
    signature: 'function firstPaintBlockers(resources) {',
    solution: `function firstPaintBlockers(resources) {
  return resources
    .filter((r) => {
      if (r.type === 'css') {
        return @@!r.media || r.media === 'all' || r.media === 'screen'@@;
      }
      if (r.type === 'script') {
        return @@!r.async && !r.defer@@;
      }
      return false;
    })
    .@@map((r) => r.name)@@;
}`,
    tests: [
      { args: [[{ name: 'app.css', type: 'css' }, { name: 'logo.png', type: 'img' }]], expected: ['app.css'], name: 'css blocks, image does not' },
      { args: [[{ name: 'a.js', type: 'script' }, { name: 'b.js', type: 'script', defer: true }, { name: 'c.js', type: 'script', async: true }]], expected: ['a.js'], name: 'only plain scripts block' },
      { args: [[{ name: 'print.css', type: 'css', media: 'print' }, { name: 'wide.css', type: 'css', media: 'screen' }]], expected: ['wide.css'], name: 'print css is not blocking' },
      { args: [[]], expected: [], name: 'empty page' },
      { args: [[{ name: 'x.css', type: 'css', media: 'all' }, { name: 'y.js', type: 'script' }, { name: 'z.jpg', type: 'img' }]], expected: ['x.css', 'y.js'], name: 'keeps document order' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'blockingTime',
    statement: 'Render-blocking resources download in parallel. `blockingTime` should return how long the page waits for them (each resource has `ms`), but it reports far too much when there are several blockers.',
    buggy: blockedBuggy,
    fixed: `function blockingTime(resources) {
  const blockers = resources.filter(
    (r) => r.type === 'css' || (r.type === 'script' && !r.async && !r.defer)
  );
  return Math.max(0, ...blockers.map((r) => r.ms));
}`,
    tests: [
      { args: [[{ type: 'css', ms: 120 }, { type: 'script', ms: 80 }]], expected: 120, name: 'parallel blockers' },
      { args: [[{ type: 'css', ms: 30 }, { type: 'img', ms: 500 }, { type: 'script', ms: 10, defer: true }]], expected: 30, name: 'non-blockers ignored' },
      { args: [[{ type: 'css', ms: 70 }]], expected: 70, name: 'single blocker' },
      { args: [[{ type: 'img', ms: 70 }]], expected: 0, name: 'nothing blocks' },
    ],
    bugType: 'sequential vs parallel',
    hint: 'If two files each take 100 ms and are fetched at the same time, how long do you wait for both?',
    explanation: 'The browser fetches blockers concurrently, so the delay is the slowest one (`Math.max`), not the total. Summing would suggest that merging files always helps by that amount.',
  },
  boss: {
    title: 'Predict first paint',
    statement:
      'Write `firstPaintMs(resources)` for resources `{ name, type, ms }` in document order, `type` being `"css"`, `"js"` (plain script), `"async"`, `"defer"` or `"img"`. Model: the HTML arrives at 40 ms and every download starts then (so resource i is ready at `40 + ms`). The parser spends 5 ms per tag; a `"js"` tag also waits until its file AND all earlier stylesheets are ready, then runs for 5 ms. Render tree = max(DOM done, last stylesheet ready); first paint = render tree + 8 ms layout + 6 ms paint.',
    language: 'javascript',
    fnName: 'firstPaintMs',
    starter: `function firstPaintMs(resources) {
  return 0;
}`,
    solution: `function firstPaintMs(resources) {
  let t = 40;
  let cssReady = 0;
  for (const r of resources) {
    const ready = 40 + r.ms;
    t += 5;
    if (r.type === 'css') cssReady = Math.max(cssReady, ready);
    if (r.type === 'js') t = Math.max(t, ready, cssReady) + 5;
  }
  return Math.max(t, cssReady) + 8 + 6;
}`,
    tests: [
      { args: [[]], expected: 54, name: 'empty body' },
      { args: [[{ name: 'a', type: 'css', ms: 30 }]], expected: 40 + 30 + 14, name: 'one fast stylesheet' },
      { args: [[{ name: 'a', type: 'css', ms: 200 }, { name: 'b', type: 'js', ms: 20 }]], expected: 240 + 5 + 14, name: 'script waits for css' },
      { args: [[{ name: 'a', type: 'js', ms: 100 }, { name: 'b', type: 'img', ms: 900 }]], expected: 140 + 5 + 5 + 14, name: 'image is ignored' },
      { args: [[{ name: 'a', type: 'async', ms: 500 }, { name: 'b', type: 'defer', ms: 500 }, { name: 'c', type: 'css', ms: 10 }]], expected: 40 + 15 + 14, name: 'async and defer do not block' },
    ],
    hints: ['Keep two clocks: `t` for the parser and `cssReady` for the latest stylesheet. Every tag costs 5 ms of parsing.', 'For a `"js"` tag: `t = Math.max(t, ready, cssReady) + 5`. At the end: `Math.max(t, cssReady) + 8 + 6`.'],
    combines: ['dom-crp'],
  },
};

export default unit;
