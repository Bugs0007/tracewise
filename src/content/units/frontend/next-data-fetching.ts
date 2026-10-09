import { Recorder } from '@/engine/recorder';
import type { Panel, TimelineEvent, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, FETCH_HARNESS } from '@/content/lib/frontend-next';

const code = `
// app/dashboard/page.tsx (a server component)
async function DashboardWaterfall() {                 //@start
  const user = await getUser();                       //@w1
  const posts = await getPosts();                     //@w2
  const stats = await getStats();                     //@w3
  return <View user={user} posts={posts} stats={stats} />;   //@renderW
}

async function DashboardParallel() {
  const [user, posts, stats] = await Promise.all([    //@par
    getUser(), getPosts(), getStats(),
  ]);
  return <View user={user} posts={posts} stats={stats} />;   //@renderP
}
`;

interface In {
  delays: number[];
  strategy: 'waterfall' | 'parallel';
}

const NAMES = ['getUser', 'getPosts', 'getStats'];

interface Out {
  total: number;
  order: string[];
}

const viz: VizDef<In> = {
  id: 'next-data-fetching',
  title: 'Waterfall vs parallel fetching',
  code,
  language: 'javascript',
  inputs: [
    { key: 'delays', label: 'Fetch durations (getUser, getPosts, getStats)', kind: 'numbers', default: [4, 3, 5], maxItems: 3 },
    { key: 'strategy', label: 'Strategy', kind: 'select', options: ['waterfall', 'parallel'], default: 'waterfall' },
  ],
  presets: [
    { label: 'Waterfall', input: { delays: [4, 3, 5], strategy: 'waterfall' } },
    { label: 'Parallel', input: { delays: [4, 3, 5], strategy: 'parallel' } },
    { label: 'One slow fetch', input: { delays: [2, 9, 2], strategy: 'parallel' } },
    { label: 'One slow, waterfall', input: { delays: [2, 9, 2], strategy: 'waterfall' } },
  ],
  run({ delays, strategy }) {
    if (!delays.length) throw new Error('Enter at least one duration');
    const d = delays.map((x) => Math.max(1, Math.round(x)));
    const names = NAMES.slice(0, d.length);
    const r = new Recorder(code);
    const events: TimelineEvent[][] = names.map(() => []);
    const starts = strategy === 'waterfall' ? d.map((_, i) => d.slice(0, i).reduce((a, b) => a + b, 0)) : d.map(() => 0);
    const total = strategy === 'waterfall' ? d.reduce((a, b) => a + b, 0) : Math.max(...d);
    const tl = (now: number): Panel[] => [
      { type: 'timeline', title: `${strategy === 'waterfall' ? 'Waterfall: one await after another' : 'Parallel: Promise.all'} (time units)`, lanes: names.map((n, i) => ({ label: n, events: events[i] })), tMax: Math.max(total, 6) + 1, now, unit: 't' },
      { type: 'kv', title: 'Server render', entries: [{ k: 'elapsed', v: now }, { k: 'started', v: starts.filter((s) => s <= now).length }, { k: 'finished', v: d.filter((x, i) => starts[i] + x <= now).length }] },
    ];
    const vars = (t: number, extra: Record<string, unknown> = {}) => ({ t, ...extra });
    const anchors = strategy === 'waterfall' ? ['w1', 'w2', 'w3'] : ['par', 'par', 'par'];

    r.step(strategy === 'waterfall' ? 'start' : 'par', strategy === 'waterfall' ? 'Server component begins rendering; nothing is fetched yet' : 'Promise.all starts every fetch at the same moment', tl(0), vars(0));
    if (strategy === 'waterfall') {
      d.forEach((dur, i) => {
        r.op();
        events[i].push({ t: starts[i], dur, label: `${names[i]} ${dur}`, tone: 'active' });
        r.step(anchors[i], cap(`${names[i]} starts at t=${starts[i]}${i ? ` (had to wait for ${names[i - 1]})` : ''}`), tl(starts[i]), vars(starts[i], { running: names[i] }));
        events[i][0].tone = 'done';
        r.step(anchors[i], cap(`${names[i]} resolves at t=${starts[i] + dur}; only now can the next await begin`), tl(starts[i] + dur), vars(starts[i] + dur));
      });
    } else {
      d.forEach((dur, i) => events[i].push({ t: 0, dur, label: `${names[i]} ${dur}`, tone: 'active' }));
      r.step('par', cap(`All ${names.length} requests are in flight at t=0`), tl(0), vars(0));
      [...d.keys()].sort((a, b) => d[a] - d[b] || a - b).forEach((i) => {
        r.op();
        events[i][0].tone = 'done';
        r.step('par', cap(`${names[i]} finishes at t=${d[i]}${d[i] < total ? ', still waiting on the others' : ': the slowest one'}`), tl(d[i]), vars(d[i]));
      });
    }
    r.step(strategy === 'waterfall' ? 'renderW' : 'renderP', cap(`Page renders at t=${total}: ${strategy === 'waterfall' ? 'sum' : 'max'} of the durations`), tl(total), vars(total, { total }));
    const order = strategy === 'waterfall' ? names : [...d.keys()].sort((a, b) => d[a] - d[b] || a - b).map((i) => names[i]);
    const out: Out = { total, order };
    return { frames: r.frames, result: out };
  },
  reference({ delays, strategy }) {
    const d = delays.map((x) => Math.max(1, Math.round(x)));
    const names = NAMES.slice(0, d.length);
    if (strategy === 'waterfall') return { total: d.reduce((a, b) => a + b, 0), order: names };
    const idx = d.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return { total: Math.max(...d), order: idx.map(([, i]) => names[i]) };
  },
};

const unit: Unit = {
  id: 'next-data-fetching',
  hook: 'Server components make it effortless to write `await` three times in a row and quietly triple your page latency. Spotting a request waterfall, and knowing which fetches really depend on each other, is a classic Next.js performance question.',
  simulationNote: 'Next.js-style simulation: the exercises use fake fetchers that resolve after a few milliseconds with plain JavaScript promises. They model fetch timing, not real Next.js data fetching.',
  predict: {
    prompt: 'A server component awaits getUser() (200 ms), then getPosts() (300 ms), then getStats() (100 ms), none depending on another. Roughly how long until it can render?',
    options: ['About 100 ms', 'About 300 ms', 'About 600 ms', 'About 200 ms'],
    answer: 2,
    explain: 'Each await blocks the next line, so the delays add up: 200 + 300 + 100 = 600 ms. With Promise.all the three run together and the page waits for the slowest, about 300 ms.',
  },
  viz,
  deeper: {
    points: [
      'A waterfall happens when a later request waits for an earlier await it does not actually need. Total time is the sum of all requests.',
      'Promise.all starts every promise first and awaits them together: total time is the slowest request. Use Promise.allSettled when one failure should not discard the others.',
      'Truly dependent data (posts need user.id) is a legitimate waterfall. Start the independent fetches before you await the first one.',
      'Parallel routes and Suspense let slow parts stream in later instead of blocking the whole page.',
      'Identical fetch calls in one render are deduplicated automatically (request memoization), so several components can fetch the same data without prop drilling.',
    ],
    complexity: { time: 'waterfall: sum of latencies; parallel: max of latencies', space: 'one in-flight promise per request' },
    pitfalls: ['Awaiting inside a loop when the iterations are independent', 'Creating the promise after an unrelated await instead of before it', 'Using Promise.all on requests where one failure should not block the page'],
  },
  practice: {
    language: 'javascript',
    fnName: 'loadAll',
    harness: FETCH_HARNESS,
    adapter: 'runPlain',
    statement: 'fetchers maps a name to a function returning a promise. Start every fetch at once, wait for all of them, and return { results, order }: results maps each name to its value and order lists the names in the order their fetches finished.',
    signature: 'async function loadAll(fetchers) {',
    solution: `async function loadAll(fetchers) {
  const names = Object.keys(fetchers);
  const order = [];
  const values = await @@Promise.all@@(
    names.map(async (name) => {
      const value = await @@fetchers[name]()@@;
      @@order.push(name)@@;
      return value;
    })
  );
  const results = {};
  names.forEach((name, i) => {
    @@results[name] = values[i]@@;
  });
  return { results, order };
}`,
    tests: [
      { args: [{ a: [12, 'A'], b: [4, 'B'], c: [8, 'C'] }], expected: { results: { a: 'A', b: 'B', c: 'C' }, order: ['b', 'c', 'a'] }, name: 'finishes in order of speed' },
      { args: [{ x: [2, 'X'] }], expected: { results: { x: 'X' }, order: ['x'] }, name: 'single fetch' },
      { args: [{}], expected: { results: {}, order: [] }, name: 'nothing to fetch' },
      { args: [{ slow: [10, 1], fast: [2, 2] }], expected: { results: { slow: 1, fast: 2 }, order: ['fast', 'slow'] }, name: 'slow declared first' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'fetchDashboard',
    harness: FETCH_HARNESS,
    adapter: 'runMeasured',
    statement: 'The three fetches are independent, but the dashboard is slow: the measured order shows they finish one after the other. Make them run together.',
    buggy: `async function fetchDashboard(fetchers) {
  const user = await fetchers.user();
  const posts = await fetchers.posts();
  const stats = await fetchers.stats();
  return { user, posts, stats };
}`,
    fixed: `async function fetchDashboard(fetchers) {
  const [user, posts, stats] = await Promise.all([fetchers.user(), fetchers.posts(), fetchers.stats()]);
  return { user, posts, stats };
}`,
    tests: [
      { args: [{ user: [12, 'U'], posts: [4, 'P'], stats: [8, 'S'] }], expected: { result: { user: 'U', posts: 'P', stats: 'S' }, order: ['posts', 'stats', 'user'] }, name: 'user is slowest' },
      { args: [{ user: [4, 'U'], posts: [12, 'P'], stats: [8, 'S'] }], expected: { result: { user: 'U', posts: 'P', stats: 'S' }, order: ['user', 'stats', 'posts'] }, name: 'posts is slowest' },
      { args: [{ user: [4, 'U'], posts: [8, 'P'], stats: [12, 'S'] }], expected: { result: { user: 'U', posts: 'P', stats: 'S' }, order: ['user', 'posts', 'stats'] }, name: 'already in order' },
      { args: [{ user: [8, 'U'], posts: [12, 'P'], stats: [4, 'S'] }], expected: { result: { user: 'U', posts: 'P', stats: 'S' }, order: ['stats', 'user', 'posts'] }, name: 'stats is fastest' },
    ],
    bugType: 'sequential awaits (waterfall)',
    hint: 'Each await pauses the function before the next fetch is even started. Start all three promises before waiting for any of them.',
    explanation: 'Awaiting each call in turn means fetch 2 starts only after fetch 1 resolves. Total time becomes the sum. Starting all three and awaiting them together with Promise.all makes it the maximum.',
  },
  boss: {
    title: 'Dependent plus parallel fetching',
    statement: 'loadProfile(fetchers): settings is independent. user must come first, and posts and followers both need the user value as their argument, but they do not depend on each other. Return { user, settings, posts, followers } as fast as possible: settings must already be running while user loads, and posts and followers must run together after it.',
    language: 'javascript',
    fnName: 'loadProfile',
    harness: FETCH_HARNESS,
    adapter: 'runMeasured',
    starter: `async function loadProfile(fetchers) {
  // your code here
}
`,
    solution: `async function loadProfile(fetchers) {
  const settingsPromise = fetchers.settings();
  const user = await fetchers.user();
  const [posts, followers] = await Promise.all([fetchers.posts(user), fetchers.followers(user)]);
  const settings = await settingsPromise;
  return { user, settings, posts, followers };
}`,
    tests: [
      { args: [{ user: [6, 'u1'], settings: [24, 'S'], posts: [4, 'P'], followers: [10, 'F'] }], expected: { result: { user: 'u1', settings: 'S', posts: 'P:u1', followers: 'F:u1' }, order: ['user', 'posts', 'followers', 'settings'] }, name: 'settings is the slowest' },
      { args: [{ user: [10, 'u2'], settings: [2, 'S'], posts: [6, 'P'], followers: [2, 'F'] }], expected: { result: { user: 'u2', settings: 'S', posts: 'P:u2', followers: 'F:u2' }, order: ['settings', 'user', 'followers', 'posts'] }, name: 'settings finishes first' },
      { args: [{ user: [4, 'u3'], settings: [8, 'S'], posts: [12, 'P'], followers: [16, 'F'] }], expected: { result: { user: 'u3', settings: 'S', posts: 'P:u3', followers: 'F:u3' }, order: ['user', 'settings', 'posts', 'followers'] }, name: 'followers is the slowest' },
    ],
    hints: ['Create the independent promise first, but await it last. Only user truly blocks the other two.', 'Call fetchers.settings() without await, await user, then Promise.all([posts(user), followers(user)]), then await the settings promise.'],
    combines: ['next-render-modes'],
  },
  quiz: [
    {
      prompt: 'Two components in the same render both call fetch("/api/user/1"). With Next.js request memoization, how many network requests happen?',
      options: ['Two', 'One', 'Zero, it is always cached forever', 'It depends on the component order'],
      answer: 1,
      explain: 'Identical GET fetches within one server render are deduplicated, so both components share a single request.',
    },
  ],
};

export default unit;
