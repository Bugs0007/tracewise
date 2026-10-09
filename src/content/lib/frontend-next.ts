// Shared helpers for the Next.js-style units: App Router file-tree matching,
// folder-tree panels and hidden test harnesses (plain JS strings).
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { GraphPanel, Tone } from '@/engine/types';

// ─── App Router files ──────────────────────────────────────────

export const isGroup = (seg: string): boolean => /^\(.+\)$/.test(seg);
export const isPageFile = (file: string): boolean => /\/page\.(tsx|jsx|ts|js)$/.test(file);
export const isLayoutFile = (file: string): boolean => /\/layout\.(tsx|jsx|ts|js)$/.test(file);

/** Folder segments below `app/` (route groups included, file name excluded). */
export function folderSegments(file: string): string[] {
  const parts = file.split('/');
  return parts.slice(1, -1);
}

/** URL pattern segments of a page file: route groups removed. */
export function patternSegments(file: string): string[] {
  return folderSegments(file).filter((s) => !isGroup(s));
}

export function patternLabel(file: string): string {
  const segs = patternSegments(file).map((s) => {
    if (s.startsWith('[[...')) return '*?';
    if (s.startsWith('[...')) return '*';
    if (s.startsWith('[')) return ':' + s.slice(1, -1);
    return s;
  });
  return '/' + segs.join('/');
}

export function urlParts(url: string): string[] {
  return url.split(/[?#]/)[0].split('/').filter(Boolean);
}

export type Params = Record<string, string | string[]>;

/**
 * Match one pattern against URL parts. `rank` has one number per pattern
 * segment: 0 static, 1 dynamic, 2 catch-all, 3 optional catch-all (lower wins).
 */
export function matchPattern(segs: string[], parts: string[]): { params: Params; rank: number[] } | null {
  const params: Params = {};
  const rank: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.startsWith('[[...')) {
      if (parts.length > i) params[s.slice(5, -2)] = parts.slice(i);
      rank.push(3);
      return { params, rank };
    }
    if (s.startsWith('[...')) {
      if (parts.length <= i) return null;
      params[s.slice(4, -1)] = parts.slice(i);
      rank.push(2);
      return { params, rank };
    }
    if (i >= parts.length) return null;
    if (s.startsWith('[')) {
      params[s.slice(1, -1)] = parts[i];
      rank.push(1);
    } else if (s === parts[i]) rank.push(0);
    else return null;
  }
  return segs.length === parts.length ? { params, rank } : null;
}

/** negative when a is more specific than b */
export function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function resolveRoute(files: string[], url: string): { file: string; params: Params } | null {
  const parts = urlParts(url);
  let best: { file: string; params: Params; rank: number[] } | null = null;
  for (const file of files) {
    if (!isPageFile(file)) continue;
    const m = matchPattern(patternSegments(file), parts);
    if (m && (!best || compareRank(m.rank, best.rank) < 0)) best = { file, ...m };
  }
  return best ? { file: best.file, params: best.params } : null;
}

/** Identity of every folder instance on the way to a page: dynamic segments contribute their value. */
export function folderKeys(file: string, parts: string[]): { dir: string; key: string }[] {
  const segs = folderSegments(file);
  const out: { dir: string; key: string }[] = [{ dir: 'app', key: 'app' }];
  let u = 0;
  let dir = 'app';
  let key = 'app';
  for (const s of segs) {
    dir += '/' + s;
    if (isGroup(s)) key += '/' + s;
    else if (s.startsWith('[...') || s.startsWith('[[...')) {
      key += '/' + parts.slice(u).join('+');
      u = parts.length;
    } else if (s.startsWith('[')) key += '/' + parts[u++];
    else {
      key += '/' + s;
      u++;
    }
    out.push({ dir, key });
  }
  return out;
}

/** Layouts wrapping the page that serves `url`, outermost first. */
export function layoutChainFor(files: string[], url: string): { file: string; key: string }[] {
  const hit = resolveRoute(files, url);
  if (!hit) return [];
  const have = new Set(files);
  return folderKeys(hit.file, urlParts(url))
    .map((f) => ({ file: `${f.dir}/layout.tsx`, key: f.key }))
    .filter((f) => have.has(f.file));
}

// ─── Folder tree panel ─────────────────────────────────────────

const fileTag = (name: string): string => name.replace(/\.(tsx|jsx|ts|js)$/, '');

/** Tree of app/ folders; each folder shows the special files it contains as a badge. */
export function folderTreePanel(files: string[], opts: { tones?: Record<string, Tone>; title?: string; gapX?: number } = {}): GraphPanel {
  const nodes: Record<string, NTreeNode> = {};
  const ensure = (dir: string): NTreeNode => {
    if (!nodes[dir]) nodes[dir] = { id: dir, label: dir.split('/').pop()!, children: [], tone: opts.tones?.[dir] };
    return nodes[dir];
  };
  ensure('app');
  const tags: Record<string, string[]> = {};
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      ensure(dir);
      if (i > 1) {
        const parent = ensure(parts.slice(0, i - 1).join('/'));
        if (!parent.children.includes(dir)) parent.children.push(dir);
      }
    }
    const dir = parts.slice(0, -1).join('/');
    (tags[dir] ??= []).push(fileTag(parts[parts.length - 1]));
  }
  for (const [dir, t] of Object.entries(tags)) ensure(dir).badge = t.join(' · ');
  return nTreePanel(nodes, 'app', { title: opts.title, gapX: opts.gapX ?? 112 });
}

// ─── Hidden test harnesses (plain JS) ──────────────────────────

/**
 * Fake fetchers on a virtual clock (deterministic, no real waiting).
 * spec: { name: [delay, value] }. A fetcher called with an argument resolves to value + ':' + arg.
 */
export const FETCH_HARNESS = `
function makeFetchers(spec, log) {
  const sim = { now: 0, queue: [], pumping: false, seq: 0 };
  const schedule = () => {
    if (!sim.pumping && sim.queue.length) {
      sim.pumping = true;
      setTimeout(pump, 0);
    }
  };
  const pump = () => {
    sim.pumping = false;
    if (!sim.queue.length) return;
    sim.queue.sort((a, b) => a.due - b.due || a.seq - b.seq);
    const next = sim.queue.shift();
    sim.now = next.due;
    next.fire();
    schedule();
  };
  const out = {};
  for (const name of Object.keys(spec)) {
    const [delay, value] = spec[name];
    out[name] = (arg) =>
      new Promise((resolve) => {
        sim.queue.push({
          due: sim.now + delay,
          seq: sim.seq++,
          fire: () => {
            if (log) log.push(name);
            resolve(arg === undefined ? value : value + ':' + arg);
          },
        });
        schedule();
      });
  }
  return out;
}
function runPlain(fn, spec) {
  return fn(makeFetchers(spec));
}
async function runMeasured(fn, spec) {
  const log = [];
  const result = await fn(makeFetchers(spec, log));
  return { result, order: log };
}
`;

/** Route-handler modules plus a Response-like helper. */
export const HANDLER_HARNESS = `
const json = (body, status = 200, headers = {}) => ({ status, headers: { 'content-type': 'application/json', ...headers }, body });
const MODULES = {
  posts: {
    GET: (req) => json({ posts: ['a', 'b', 'c'].slice(0, Number((req.url.split('limit=')[1]) || 3)) }),
    POST: async (req) => {
      if (!req.body || !req.body.title) return json({ error: 'title required' }, 400);
      return json({ created: req.body.title }, 201);
    },
  },
  health: { GET: () => json({ ok: true }) },
  boom: { GET: () => { throw new Error('db down'); } },
  empty: {},
};
function runHandler(fn, name, req) {
  return fn(MODULES[name], req);
}
`;

/** Keep captions within the 90 character budget. */
export const cap = (s: string, n = 90): string => (s.length <= n ? s : s.slice(0, n - 1) + '…');
