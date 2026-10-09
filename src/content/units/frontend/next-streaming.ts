import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/frontend-next';

const code = `
// Streaming ON: every slow part sits in its own Suspense boundary
export default function Page() {
  return (
    <main>
      <Header />                                              //@shell
      <Suspense fallback={<Skeleton />}><Feed /></Suspense>   //@suspense
      <Suspense fallback={<Skeleton />}><Recs /></Suspense>
      <Suspense fallback={<Skeleton />}><Stats /></Suspense>
    </main>
  );
}

// Streaming OFF: nothing is sent until every await is done
export default async function Page() {                        //@block
  const data = await Promise.all([getFeed(), getRecs(), getStats()]);   //@wait
  return <main>{/* ...all sections... */}</main>;             //@send
}
`;

const NAMES = ['Feed', 'Recs', 'Stats', 'Ads'];
type Streaming = 'on' | 'off';

interface In {
  delays: number[];
  streaming: Streaming;
}

const viz: VizDef<In> = {
  id: 'next-streaming',
  title: 'Suspense and streaming HTML',
  code,
  language: 'javascript',
  inputs: [
    { key: 'delays', label: 'Data time per section (Feed, Recs, Stats, Ads)', kind: 'numbers', default: [8, 3, 5], maxItems: 4 },
    { key: 'streaming', label: 'Streaming', kind: 'select', options: ['on', 'off'], default: 'on' },
  ],
  presets: [
    { label: 'Streaming on', input: { delays: [8, 3, 5], streaming: 'on' } },
    { label: 'Streaming off', input: { delays: [8, 3, 5], streaming: 'off' } },
    { label: 'One very slow part', input: { delays: [2, 12, 3, 2], streaming: 'on' } },
    { label: 'Same speed', input: { delays: [4, 4, 4], streaming: 'on' } },
  ],
  run({ delays, streaming }) {
    if (!delays.length) throw new Error('Enter at least one duration');
    const d = delays.map((x) => Math.max(1, Math.round(x)));
    const names = NAMES.slice(0, d.length);
    const slowest = Math.max(...d);
    const r = new Recorder(code);
    const arrive = (i: number) => (streaming === 'on' ? d[i] + 1 : slowest + 1);
    const state = (i: number, now: number): 'blank' | 'fallback' | 'content' => (streaming === 'on' ? (now < 1 ? 'blank' : now < d[i] + 1 ? 'fallback' : 'content') : now < slowest + 1 ? 'blank' : 'content');
    const tone: Record<string, Tone> = { blank: 'muted', fallback: 'frontier', content: 'done' };
    const order = [...d.keys()].sort((a, b) => arrive(a) - arrive(b) || a - b);
    const browser: TimelineEvent[] = [];
    const view = (now: number, dataUpTo: number): Panel[] => [
      {
        type: 'timeline',
        title: `Streaming ${streaming} (time units)`,
        lanes: [
          ...names.map((n, i) => ({ label: `${n} data`, events: [{ t: 0, dur: Math.min(d[i], dataUpTo), label: `fetch ${d[i]}`, tone: (dataUpTo >= d[i] ? 'done' : 'active') as Tone }] })),
          { label: 'Browser', events: browser },
        ],
        tMax: slowest + 3,
        now,
        unit: 't',
      },
      { type: 'list', title: 'What the user sees', orientation: 'vertical', items: names.map((n, i) => ({ id: n, label: n, sub: state(i, now), tone: tone[state(i, now)] })) },
    ];
    const vars = (t: number, extra: Record<string, unknown> = {}) => ({ t, ...extra });

    if (streaming === 'on') {
      r.step('shell', cap(`t=1: Header is ready, so the shell goes out with ${names.length} skeleton(s) at once`), (browser.push({ t: 1, dur: 1, label: 'shell', tone: 'frontier' }), view(1, 1)), vars(1));
      order.forEach((i) => {
        r.op();
        browser.push({ t: arrive(i), dur: 1, label: names[i], tone: 'done' });
        r.step('suspense', cap(`t=${arrive(i)}: ${names[i]} data is ready, its HTML chunk streams in and swaps the skeleton`), view(arrive(i), arrive(i)), vars(arrive(i), { chunk: names[i] }));
      });
    } else {
      r.step('block', 'The page awaits all data first, so the browser shows nothing yet', view(0, 0), vars(0));
      r.step('wait', cap(`t=${slowest}: the slowest fetch finally resolves`), view(slowest, slowest), vars(slowest));
      browser.push({ t: slowest + 1, dur: 1, label: 'full page', tone: 'done' });
      r.step('send', cap(`t=${slowest + 1}: the whole page arrives in one piece`), view(slowest + 1, slowest), vars(slowest + 1));
    }
    const result = streaming === 'on' ? order.map((i) => names[i]) : names;
    r.step(streaming === 'on' ? 'suspense' : 'send', cap(`Arrival order: ${streaming === 'on' ? ['shell', ...result].join(' > ') : 'everything together'}`), view(slowest + 1, slowest), vars(slowest + 1));
    return { frames: r.frames, result };
  },
  reference({ delays, streaming }) {
    const names = NAMES.slice(0, delays.length);
    if (streaming === 'off') return names;
    return names.map((n, i) => ({ n, at: Math.max(1, Math.round(delays[i])), i })).sort((a, b) => a.at - b.at || a.i - b.i).map((x) => x.n);
  },
};

const unit: Unit = {
  id: 'next-streaming',
  hook: 'Streaming is how Next.js turns one slow database call from "blank page for three seconds" into "instant shell, content as it arrives". Interviewers use it to see whether you understand what loading.js and Suspense really change.',
  simulationNote: 'Next.js-style simulation: no real HTML stream or React Suspense is used. The exercises compute when each part of a page would arrive with plain JavaScript, not Next.js itself.',
  predict: {
    prompt: 'A page has a fast header and three Suspense-wrapped sections whose data takes 8, 3 and 5 seconds. In what order does the browser receive the sections?',
    options: ['In source order: 8, 3, 5', 'In order of readiness: the 3 s one, the 5 s one, then the 8 s one', 'All at once after 8 seconds', 'Only the header; sections need a client fetch'],
    answer: 1,
    explain: 'React streams each boundary as soon as its data resolves, regardless of where it sits in the tree. The shell with skeletons goes first, then chunks arrive in readiness order.',
  },
  viz,
  deeper: {
    points: [
      'The server sends the HTML shell as soon as the non-suspended parts are ready, then keeps the response open and streams the remaining boundaries.',
      'A loading.js file is sugar: Next.js wraps that segment\'s page in a Suspense boundary using it as the fallback.',
      'Each Suspense boundary resolves independently. A tiny inline script swaps the skeleton for the real HTML when the chunk lands, with no client-side fetch.',
      'Nested boundaries respect the tree: an inner section cannot appear before the boundary that contains it.',
      'Streaming improves perceived performance (first paint, TTFB) more than total time. Slow data is still slow, it just stops blocking everything else.',
    ],
    pitfalls: ['Awaiting slow data in the page above the Suspense boundary, which blocks the shell again', 'Wrapping everything in one boundary so only a single chunk ever streams', 'Skeletons with different dimensions than the content, causing layout shift'],
  },
  practice: {
    language: 'javascript',
    fnName: 'streamArrivals',
    statement: 'sections is a list of { name, delay }: the time its data takes. The shell goes out at t=1, and a section\'s chunk arrives at delay + 1. Return [{ name: "shell", at: 1 }, ...chunks] with chunks sorted by arrival time (ties keep the original order), each as { name, at }.',
    signature: 'function streamArrivals(sections) {',
    solution: `function streamArrivals(sections) {
  const chunks = sections.map((s, i) => ({ name: s.name, at: @@s.delay + 1@@, i }));
  chunks.sort((a, b) => @@a.at - b.at || a.i - b.i@@);
  return [{ name: 'shell', at: 1 }, ...chunks.map(@@({ name, at }) => ({ name, at })@@)];
}`,
    tests: [
      { args: [[{ name: 'Feed', delay: 8 }, { name: 'Recs', delay: 3 }, { name: 'Stats', delay: 5 }]], expected: [{ name: 'shell', at: 1 }, { name: 'Recs', at: 4 }, { name: 'Stats', at: 6 }, { name: 'Feed', at: 9 }], name: 'readiness order' },
      { args: [[{ name: 'A', delay: 2 }, { name: 'B', delay: 2 }]], expected: [{ name: 'shell', at: 1 }, { name: 'A', at: 3 }, { name: 'B', at: 3 }], name: 'ties keep source order' },
      { args: [[]], expected: [{ name: 'shell', at: 1 }], name: 'no slow sections' },
      { args: [[{ name: 'Only', delay: 6 }]], expected: [{ name: 'shell', at: 1 }, { name: 'Only', at: 7 }], name: 'single section' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'paintAt',
    statement: 'paintAt(sections, t) says what each section shows at time t: "blank" before the shell, "fallback" while its data is pending, "content" afterwards. Fix this version: the page shows nothing until the slowest section is ready.',
    buggy: `function paintAt(sections, t) {
  const shellAt = Math.max(...sections.map((s) => s.delay)) + 1;
  const out = {};
  for (const s of sections) {
    if (t < shellAt) out[s.name] = 'blank';
    else if (t < s.delay + 1) out[s.name] = 'fallback';
    else out[s.name] = 'content';
  }
  return out;
}`,
    fixed: `function paintAt(sections, t) {
  const shellAt = 1;
  const out = {};
  for (const s of sections) {
    if (t < shellAt) out[s.name] = 'blank';
    else if (t < s.delay + 1) out[s.name] = 'fallback';
    else out[s.name] = 'content';
  }
  return out;
}`,
    tests: [
      { args: [[{ name: 'Feed', delay: 8 }, { name: 'Recs', delay: 3 }], 0], expected: { Feed: 'blank', Recs: 'blank' }, name: 'before anything' },
      { args: [[{ name: 'Feed', delay: 8 }, { name: 'Recs', delay: 3 }], 2], expected: { Feed: 'fallback', Recs: 'fallback' }, name: 'shell with skeletons' },
      { args: [[{ name: 'Feed', delay: 8 }, { name: 'Recs', delay: 3 }], 4], expected: { Feed: 'fallback', Recs: 'content' }, name: 'first chunk arrived' },
      { args: [[{ name: 'Feed', delay: 8 }, { name: 'Recs', delay: 3 }], 9], expected: { Feed: 'content', Recs: 'content' }, name: 'everything loaded' },
    ],
    bugType: 'shell blocked by the slowest data',
    hint: 'When can the shell be sent? Does it depend on any section\'s data?',
    explanation: 'The shell only needs the parts outside Suspense boundaries, so it is ready at t=1. Tying it to the slowest section is what happens when a slow await sits above the boundary (or there is no loading.js): the whole page blocks.',
  },
  boss: {
    title: 'Nested Suspense order',
    statement: 'sections now may have a parent: { name, delay, parent? } where parent names an earlier section whose boundary contains this one. A section arrives at max(delay + 1, its parent\'s arrival). Return the section names in arrival order, ties keeping the original order (parents are listed before children).',
    language: 'javascript',
    fnName: 'chunkOrder',
    starter: `function chunkOrder(sections) {
  // your code here
}
`,
    solution: `function chunkOrder(sections) {
  const arrival = {};
  const rows = sections.map((s, i) => {
    const own = s.delay + 1;
    const parentAt = s.parent ? arrival[s.parent] : 0;
    arrival[s.name] = Math.max(own, parentAt);
    return { name: s.name, at: arrival[s.name], i };
  });
  return rows.sort((a, b) => a.at - b.at || a.i - b.i).map((r) => r.name);
}`,
    tests: [
      { args: [[{ name: 'A', delay: 5 }, { name: 'B', delay: 2 }]], expected: ['B', 'A'], name: 'flat' },
      { args: [[{ name: 'Page', delay: 6 }, { name: 'Comments', delay: 1, parent: 'Page' }, { name: 'Ads', delay: 3 }]], expected: ['Ads', 'Page', 'Comments'], name: 'child waits for parent' },
      { args: [[{ name: 'A', delay: 2 }, { name: 'B', delay: 9, parent: 'A' }, { name: 'C', delay: 1, parent: 'B' }]], expected: ['A', 'B', 'C'], name: 'three levels' },
      { args: [[{ name: 'P', delay: 4 }, { name: 'X', delay: 1, parent: 'P' }, { name: 'Y', delay: 2 }]], expected: ['Y', 'P', 'X'], name: 'fast sibling overtakes' },
      { args: [[]], expected: [], name: 'empty' },
    ],
    hints: ['Compute each section\'s arrival time first. A child can never beat its parent.', 'Keep an arrival map as you walk the list: arrival[name] = max(delay + 1, arrival[parent] or 0). Then sort by (arrival, original index).'],
    combines: ['next-data-fetching'],
  },
  quiz: [
    {
      prompt: 'What does adding a loading.js file next to page.js do?',
      options: ['Preloads the JavaScript bundle', 'Wraps the page in a Suspense boundary that shows loading.js while it loads', 'Disables server rendering for that route', 'Caches the page forever'],
      answer: 1,
      explain: 'loading.js becomes the fallback of an automatic Suspense boundary around the segment, so the layout can render and stream immediately.',
    },
  ],
};

export default unit;
