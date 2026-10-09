import { Recorder } from '@/engine/recorder';
import type { KVPanel, LogPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NEXT, clip } from '@/content/lib/finish-m2m3';

const code = `
// 1. Router Cache (browser): pages you already visited, kept in memory     //@router
// 2. Full Route Cache (server): the rendered output of a static route       //@route
async function getProducts() {
  const res = await fetch(API + '/products', { next: { tags: ['products'] } });   //@fetch
  return res.json();
}
// Header and Page both call getProducts() in ONE render:
// 3. Request memoization: the second identical call reuses the first         //@memo
// 4. Data Cache (server): the fetch result survives across requests          //@data
// 5. Origin: your API or database                                            //@origin

revalidateTag('products');       // drop tagged data AND the pages built from it   //@tag
revalidatePath('/products');     // drop that page's route and its data            //@path
`;

interface Page {
  keys: string[];
  label: string;
}

const PAGES: Record<string, Page> = {
  '/products': { keys: ['products', 'products'], label: 'products' },
  '/cart': { keys: ['cart'], label: 'cart' },
  '/about': { keys: [], label: 'about' },
};
const TAG_OF: Record<string, string> = { products: 'products', cart: 'cart' };

interface In {
  actions: string[];
}

interface Caches {
  router: Map<string, string>;
  route: Map<string, { html: string; keys: string[] }>;
  data: Map<string, number>;
  origin: Record<string, number>;
}

const viz: VizDef<In> = {
  id: 'next-caching',
  title: 'Four caches between a click and your database',
  code,
  language: 'javascript',
  inputs: [
    {
      key: 'actions',
      label: 'Actions, in order',
      kind: 'strings',
      default: ['visit /products', 'visit /products', 'revalidateTag products', 'visit /products'],
      maxItems: 6,
      help: 'visit /products | visit /cart | visit /about | revalidateTag products | revalidatePath /products',
    },
  ],
  presets: [
    { label: 'Visit, revisit, revalidate', input: { actions: ['visit /products', 'visit /products', 'revalidateTag products', 'visit /products'] } },
    { label: 'Path revalidation', input: { actions: ['visit /cart', 'revalidatePath /cart', 'visit /cart'] } },
    { label: 'Two pages, one tag', input: { actions: ['visit /products', 'visit /cart', 'revalidateTag cart', 'visit /products', 'visit /cart'] } },
    { label: 'Page with no data', input: { actions: ['visit /about', 'visit /about'] } },
  ],
  run({ actions }) {
    const c: Caches = { router: new Map(), route: new Map(), data: new Map(), origin: {} };
    const events: LogPanel['lines'] = [];
    const caches = (): Panel[] => {
      const kv = (title: string, rows: [string, string][]): KVPanel => ({ type: 'kv', title, entries: rows.length ? rows.map(([k, v]) => ({ k, v, tone: 'compare' as Tone })) : [{ k: '(empty)', v: '-', tone: 'muted' as Tone }] });
      return [
        kv('Router Cache (browser)', [...c.router].map(([p, h]) => [p, h])),
        kv('Full Route Cache (server)', [...c.route].map(([p, e]) => [p, e.html])),
        kv('Data Cache (server)', [...c.data].map(([k, v]) => [k, `v${v}  tag:${TAG_OF[k]}`])),
        { type: 'log', title: 'What happened', lines: events.slice(-4) },
      ];
    };
    const log: string[] = [];
    const note = (text: string, tone?: Tone): void => void events.push({ text, tone });

    validateActions(actions);
    const r = new Recorder(code);
    r.step(undefined, 'All caches start empty (a fresh deployment and a fresh browser tab)', caches(), {});
    for (const action of actions) {
      const [verb, arg] = action.trim().split(/\s+/);
      if (verb === 'visit') {
        const page = PAGES[arg];
        r.step('router', clip(`Navigate to ${arg}: the browser checks its Router Cache first`), caches(), { path: arg });
        r.op();
        const routed = c.router.get(arg);
        if (routed !== undefined) {
          note(`${arg}: Router Cache hit`, 'found');
          r.step('router', clip(`Router Cache hit: ${arg} shows instantly (${routed}); no server request`), caches(), { served: 'router' });
          log.push(`${arg} <- router: ${routed}`);
          continue;
        }
        note(`${arg}: Router Cache miss, ask the server`, 'muted');
        r.step('route', clip(`Router miss. Server checks the Full Route Cache for ${arg}`), caches(), { served: '?' });
        r.op();
        const cached = c.route.get(arg);
        if (cached) {
          note(`${arg}: Full Route Cache hit`, 'found');
          c.router.set(arg, cached.html);
          r.step('route', clip(`Full Route Cache hit: the stored page is sent, nothing re-rendered (${cached.html})`), caches(), { served: 'route' });
          log.push(`${arg} <- route: ${cached.html}`);
          continue;
        }
        const memo = new Set<string>();
        const versions: string[] = [];
        let layer = 'rendered';
        for (const key of page.keys) {
          if (memo.has(key)) {
            note(`${key}: request memoization (same render)`, 'swap');
            r.step('memo', clip(`The second getProducts() in this render is memoized: no second lookup`), caches(), { fetch: key });
            continue;
          }
          memo.add(key);
          r.op();
          if (c.data.has(key)) {
            if (layer !== 'origin') layer = 'data';
            note(`${key}: Data Cache hit v${c.data.get(key)}`, 'found');
            r.step('data', clip(`fetch(${key}) hits the Data Cache: v${c.data.get(key)}, origin untouched`), caches(), { fetch: key });
          } else {
            c.origin[key] = (c.origin[key] ?? 0) + 1;
            c.data.set(key, c.origin[key]);
            layer = 'origin';
            note(`${key}: miss, origin returns v${c.origin[key]}`, 'new');
            r.step('origin', clip(`Data Cache miss: ask the origin, get v${c.origin[key]}, store it with tag ${TAG_OF[key]}`), caches(), { fetch: key });
          }
          versions.push(`${key} v${c.data.get(key)}`);
        }
        const html = versions.length ? [...new Set(versions)].join(' + ') : page.label;
        c.route.set(arg, { html, keys: [...new Set(page.keys)] });
        c.router.set(arg, html);
        note(`${arg}: rendered and cached (${html})`, 'done');
        r.step('route', clip(`Page rendered from ${layer === 'origin' ? 'fresh origin data' : layer === 'data' ? 'cached data' : 'no data'}; stored in route and router caches`), caches(), { served: layer });
        log.push(`${arg} <- ${layer}: ${html}`);
      } else if (verb === 'revalidateTag') {
        if (!(arg in TAG_OF)) throw new Error('Tags: ' + Object.keys(TAG_OF).join(', '));
        r.op();
        for (const key of [...c.data.keys()]) if (TAG_OF[key] === arg) c.data.delete(key);
        for (const [p, e] of [...c.route]) if (e.keys.some((k) => TAG_OF[k] === arg)) c.route.delete(p);
        c.router.clear();
        note(`revalidateTag(${arg}): data, dependent pages and Router Cache cleared`, 'error');
        r.step('tag', clip(`revalidateTag('${arg}') drops tagged data and every page built from it`), caches(), { revalidated: arg });
        log.push(`revalidated tag ${arg}`);
      } else if (verb === 'revalidatePath') {
        if (!(arg in PAGES)) throw new Error('Paths: ' + Object.keys(PAGES).join(', '));
        r.op();
        const keys = c.route.get(arg)?.keys ?? PAGES[arg].keys;
        for (const k of keys) c.data.delete(k);
        c.route.delete(arg);
        c.router.clear();
        note(`revalidatePath(${arg}): route and its data cleared`, 'error');
        r.step('path', clip(`revalidatePath('${arg}') drops that page's route and the data it used`), caches(), { revalidated: arg });
        log.push(`revalidated path ${arg}`);
      } else {
        throw new Error(`Unknown action "${action}". Use visit <path>, revalidateTag <tag>, revalidatePath <path>.`);
      }
    }
    if (r.frames.length < 3) r.step(undefined, 'Nothing else happens', caches(), {});
    return { frames: r.frames, result: log };
  },
  reference({ actions }) {
    // independent re-implementation with plain objects
    const router: Record<string, string> = {};
    const route: Record<string, { html: string; keys: string[] }> = {};
    const data: Record<string, number> = {};
    const hits: Record<string, number> = {};
    const out: string[] = [];
    for (const a of actions) {
      const [verb, arg] = a.trim().split(/\s+/);
      if (verb === 'visit') {
        if (arg in router) {
          out.push(`${arg} <- router: ${router[arg]}`);
          continue;
        }
        if (arg in route) {
          router[arg] = route[arg].html;
          out.push(`${arg} <- route: ${route[arg].html}`);
          continue;
        }
        let layer = 'rendered';
        const seen: string[] = [];
        for (const k of PAGES[arg].keys) {
          if (seen.includes(k)) continue;
          seen.push(k);
          if (k in data) layer = layer === 'origin' ? 'origin' : 'data';
          else {
            hits[k] = (hits[k] ?? 0) + 1;
            data[k] = hits[k];
            layer = 'origin';
          }
        }
        const html = seen.length ? seen.map((k) => `${k} v${data[k]}`).join(' + ') : PAGES[arg].label;
        route[arg] = { html, keys: seen };
        router[arg] = html;
        out.push(`${arg} <- ${layer}: ${html}`);
      } else if (verb === 'revalidateTag') {
        for (const k of Object.keys(data)) if (TAG_OF[k] === arg) delete data[k];
        for (const p of Object.keys(route)) if (route[p].keys.some((k) => TAG_OF[k] === arg)) delete route[p];
        for (const p of Object.keys(router)) delete router[p];
        out.push(`revalidated tag ${arg}`);
      } else {
        for (const k of route[arg]?.keys ?? PAGES[arg].keys) delete data[k];
        delete route[arg];
        for (const p of Object.keys(router)) delete router[p];
        out.push(`revalidated path ${arg}`);
      }
    }
    return out;
  },
};

/** Validate the whole action list up front so errors appear before any frame. */
function validateActions(actions: string[]): void {
  if (!actions.length) throw new Error('Give at least one action.');
  for (const a of actions) {
    const [verb, arg] = a.trim().split(/\s+/);
    if (verb === 'visit' && !(arg in PAGES)) throw new Error('Pages: ' + Object.keys(PAGES).join(', '));
  }
}

const OPS_HARNESS = `
function runOps(factory, ops) {
  const cache = factory();
  const out = [];
  for (const op of ops) {
    if (op[0] === 'fetch') {
      let called = false;
      const value = cache.fetch(op[1], op[2], () => {
        called = true;
        return op[3];
      });
      out.push(value + ':' + (called ? 'MISS' : 'HIT'));
    } else {
      cache.revalidateTag(op[1]);
      out.push('ok');
    }
  }
  return out;
}
`;

const TIMED_HARNESS = `
function runTimed(factory, ops) {
  const cache = factory();
  const out = [];
  for (const op of ops) {
    if (op[0] === 'fetch') {
      let called = false;
      const value = cache.fetch(op[1], { revalidate: op[2], tags: op[3] }, () => {
        called = true;
        return op[4];
      });
      out.push(value + ':' + (called ? 'MISS' : 'HIT'));
    } else if (op[0] === 'tick') {
      cache.tick(op[1]);
      out.push('ok');
    } else {
      cache.revalidateTag(op[1]);
      out.push('ok');
    }
  }
  return out;
}
`;

const unit: Unit = {
  id: 'next-caching',
  hook: '"Why is my Next.js page showing old data?" is the most common production question. Naming the four caches (request memoization, Data Cache, Full Route Cache, Router Cache) and how revalidation reaches each one is a senior-level answer.',
  predict: {
    prompt: 'A product page was built from fetch data tagged "products" and is served from the Full Route Cache. A server action runs revalidateTag("products"). What happens on the next request for the page?',
    options: ['Nothing: the cached page is served until the next deployment', 'The tagged data and the page built from it are dropped, so the next request renders fresh data', 'Only the visitor\'s browser cache is cleared', 'The page is deleted and returns a 404'],
    answer: 1,
    explain: 'Revalidating a tag drops the Data Cache entries carrying the tag and also invalidates the Full Route Cache entries that used them. The next request renders again and stores the new result.',
  },
  simulationNote: SIM_NEXT + ' Cache rules are simplified: real Next.js versions differ in defaults and timing.',
  viz,
  deeper: {
    points: [
      'Request memoization: identical fetch() calls inside ONE render pass run once, so components can fetch their own data without prop drilling. It lives only for that request.',
      'Data Cache (server): fetch results persist across requests and deployments. You control freshness with `revalidate: seconds` or tags.',
      'Full Route Cache (server): the rendered HTML and RSC payload of static routes. It is rebuilt when the data it depends on is revalidated.',
      'Router Cache (browser): visited and prefetched segments kept in memory so back/forward and repeat visits feel instant, without asking the server.',
      '`revalidateTag` is precise (everything labelled with the tag); `revalidatePath` targets a page. Time-based `revalidate` is the gentle option for content that may be a little stale.',
      'Routes that read cookies, headers or search params render per request (dynamic) and skip the Full Route Cache.',
    ],
    pitfalls: ['Expecting a mutation to update the page without revalidating anything', 'Forgetting the Router Cache: a user can still see an old page client-side', 'Using the same tag for unrelated data so one revalidation flushes too much'],
  },
  practice: {
    language: 'javascript',
    fnName: 'createCache',
    harness: OPS_HARNESS,
    adapter: 'runOps',
    statement: 'Write `createCache()` returning `{ fetch(key, tags, loader), revalidateTag(tag) }`. `fetch` returns the cached value for `key` without calling `loader`; on a miss it calls `loader()`, stores `{ value, tags }` and returns it. `revalidateTag(tag)` removes every entry whose tags include `tag`.',
    signature: 'function createCache() {',
    solution: `function createCache() {
  const entries = new Map();
  return {
    fetch(key, tags, loader) {
      if (@@entries.has(key)@@) return entries.get(key).value;
      const value = @@loader()@@;
      entries.set(key, { value, tags });
      return value;
    },
    revalidateTag(tag) {
      for (const [key, entry] of entries) {
        if (@@entry.tags.includes(tag)@@) entries.delete(key);
      }
    },
  };
}`,
    tests: [
      { args: [[['fetch', 'posts', ['posts'], 'v1'], ['fetch', 'posts', ['posts'], 'v2']]], expected: ['v1:MISS', 'v1:HIT'], name: 'second fetch is a hit' },
      { args: [[['fetch', 'a', ['x'], '1'], ['fetch', 'b', ['y'], '2'], ['fetch', 'a', ['x'], '9']]], expected: ['1:MISS', '2:MISS', '1:HIT'], name: 'keys are independent' },
      { args: [[['fetch', 'posts', ['posts'], 'v1'], ['revalidateTag', 'posts'], ['fetch', 'posts', ['posts'], 'v2']]], expected: ['v1:MISS', 'ok', 'v2:MISS'], name: 'revalidation forces a refetch' },
      { args: [[['fetch', 'a', ['x'], '1'], ['fetch', 'b', ['y'], '2'], ['revalidateTag', 'x'], ['fetch', 'a', ['x'], '3'], ['fetch', 'b', ['y'], '4']]], expected: ['1:MISS', '2:MISS', 'ok', '3:MISS', '2:HIT'], name: 'only the tagged entry goes' },
      { args: [[['fetch', 'a', ['t'], '1'], ['fetch', 'b', ['t', 'u'], '2'], ['revalidateTag', 't'], ['fetch', 'a', ['t'], '3'], ['fetch', 'b', ['t'], '4']]], expected: ['1:MISS', '2:MISS', 'ok', '3:MISS', '4:MISS'], name: 'one tag, several entries' },
      { args: [[['fetch', 'count', [], 0], ['fetch', 'count', [], 5]]], expected: ['0:MISS', '0:HIT'], name: 'falsy values are cached too' },
      { args: [[['revalidateTag', 'nothing'], ['fetch', 'a', [], 'v']]], expected: ['ok', 'v:MISS'], name: 'unknown tag is harmless' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'createCache',
    harness: OPS_HARNESS,
    adapter: 'runOps',
    statement: 'A product count of 0 is fetched from the origin on every call even though it was cached. Fix the cache lookup.',
    buggy: `function createCache() {
  const entries = new Map();
  return {
    fetch(key, tags, loader) {
      const hit = entries.get(key);
      if (hit && hit.value) return hit.value;
      const value = loader();
      entries.set(key, { value, tags });
      return value;
    },
    revalidateTag(tag) {
      for (const [key, entry] of entries) {
        if (entry.tags.includes(tag)) entries.delete(key);
      }
    },
  };
}`,
    fixed: `function createCache() {
  const entries = new Map();
  return {
    fetch(key, tags, loader) {
      const hit = entries.get(key);
      if (hit) return hit.value;
      const value = loader();
      entries.set(key, { value, tags });
      return value;
    },
    revalidateTag(tag) {
      for (const [key, entry] of entries) {
        if (entry.tags.includes(tag)) entries.delete(key);
      }
    },
  };
}`,
    tests: [
      { args: [[['fetch', 'count', [], 0], ['fetch', 'count', [], 5]]], expected: ['0:MISS', '0:HIT'], name: 'zero is cached' },
      { args: [[['fetch', 'name', [], ''], ['fetch', 'name', [], 'x']]], expected: [':MISS', ':HIT'], name: 'empty string is cached' },
      { args: [[['fetch', 'a', ['t'], 1], ['revalidateTag', 't'], ['fetch', 'a', ['t'], 2]]], expected: ['1:MISS', 'ok', '2:MISS'], name: 'revalidation still works' },
      { args: [[['fetch', 'a', [], 'v'], ['fetch', 'a', [], 'w']]], expected: ['v:MISS', 'v:HIT'], name: 'plain hit' },
    ],
    bugType: 'falsy check instead of presence check',
    hint: 'Which stored values make `hit.value` falsy even though the entry exists?',
    explanation: 'Testing the VALUE for truthiness treats 0, an empty string and false as "not cached". Check whether the entry exists (the wrapper object, or Map.has) instead of inspecting what is inside it.',
  },
  boss: {
    title: 'Cache with time-based revalidation',
    statement: 'Write `createTimedCache()` returning `{ fetch(key, { revalidate, tags }, loader), tick(seconds), revalidateTag(tag) }`. The cache has its own clock starting at 0 that only `tick` advances. A stored entry is fresh while `now - storedAt < revalidate`; `revalidate: false` means fresh forever and `revalidate: 0` means never fresh. A stale or missing entry calls `loader()` and stores the new value with the current time. `revalidateTag` drops every entry carrying the tag.',
    language: 'javascript',
    fnName: 'createTimedCache',
    harness: TIMED_HARNESS,
    adapter: 'runTimed',
    starter: `function createTimedCache() {
  // your code here
}
`,
    solution: `function createTimedCache() {
  let now = 0;
  const entries = new Map();
  return {
    tick(seconds) {
      now += seconds;
    },
    fetch(key, opts, loader) {
      const entry = entries.get(key);
      if (entry && (entry.revalidate === false || now - entry.at < entry.revalidate)) return entry.value;
      const value = loader();
      entries.set(key, { value, at: now, revalidate: opts.revalidate, tags: opts.tags || [] });
      return value;
    },
    revalidateTag(tag) {
      for (const [key, entry] of entries) {
        if (entry.tags.includes(tag)) entries.delete(key);
      }
    },
  };
}`,
    tests: [
      { args: [[['fetch', 'a', 60, [], 'v1'], ['tick', 59], ['fetch', 'a', 60, [], 'v2'], ['tick', 1], ['fetch', 'a', 60, [], 'v3']]], expected: ['v1:MISS', 'ok', 'v1:HIT', 'ok', 'v3:MISS'], name: 'stale exactly at the limit' },
      { args: [[['fetch', 'a', false, [], 'v1'], ['tick', 99999], ['fetch', 'a', false, [], 'v2']]], expected: ['v1:MISS', 'ok', 'v1:HIT'], name: 'false means forever' },
      { args: [[['fetch', 'a', 0, [], 'v1'], ['fetch', 'a', 0, [], 'v2']]], expected: ['v1:MISS', 'v2:MISS'], name: 'zero means never cached' },
      { args: [[['fetch', 'a', 60, ['x'], 'v1'], ['fetch', 'b', 60, ['y'], 'w1'], ['revalidateTag', 'x'], ['fetch', 'a', 60, ['x'], 'v2'], ['fetch', 'b', 60, ['y'], 'w2']]], expected: ['v1:MISS', 'w1:MISS', 'ok', 'v2:MISS', 'w1:HIT'], name: 'tags and time together' },
      { args: [[['fetch', 'a', 10, [], 'v1'], ['tick', 10], ['fetch', 'a', 10, [], 'v2'], ['tick', 9], ['fetch', 'a', 10, [], 'v3']]], expected: ['v1:MISS', 'ok', 'v2:MISS', 'ok', 'v2:HIT'], name: 'refetch restarts the clock' },
      { args: [[['fetch', 'a', 60, ['t'], '1'], ['fetch', 'b', 60, ['t', 'u'], '2'], ['revalidateTag', 't'], ['fetch', 'a', 60, ['t'], '3'], ['fetch', 'b', 60, ['t'], '4']]], expected: ['1:MISS', '2:MISS', 'ok', '3:MISS', '4:MISS'], name: 'one tag drops several keys' },
    ],
    hints: ['Store each entry as { value, at, revalidate, tags } so the freshness check can use the age: now - at.', 'Fresh means revalidate === false OR now - at < revalidate. Everything else calls the loader and overwrites the entry with the current time.'],
    combines: ['next-data-fetching', 'be-caching'],
  },
  quiz: [
    {
      prompt: 'Two components render in the same request and both call fetch("/api/user") with identical options. How many network requests does the first render make?',
      options: ['Two, one per component', 'One: request memoization shares the result within the render', 'Zero, the browser always caches it', 'One per user session'],
      answer: 1,
      explain: 'Request memoization deduplicates identical fetch calls inside a single server render, which lets each component fetch what it needs.',
    },
  ],
};

export default unit;
