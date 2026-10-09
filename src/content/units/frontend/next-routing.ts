import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, compareRank, folderTreePanel, isPageFile, matchPattern, patternLabel, patternSegments, urlParts, type Params } from '@/content/lib/frontend-next';

const code = `
// app/ folder -> routes (Next.js App Router, simplified)
function matchRoute(files, url) {
  const parts = url.split('/').filter(Boolean);          //@split
  let best = null;                                       //@init
  for (const file of files) {                            //@each
    if (!file.endsWith('/page.tsx')) continue;           //@skip
    const m = matchPattern(patternOf(file), parts);      //@try
    if (m && isBetter(m.rank, best)) best = { file, ...m }; //@better
  }
  return best && { file: best.file, params: best.params }; //@result
}
`;

interface In {
  files: string[];
  url: string;
}

const DEFAULT_FILES = ['app/layout.tsx', 'app/page.tsx', 'app/blog/page.tsx', 'app/blog/[slug]/page.tsx', 'app/blog/new/page.tsx', 'app/(marketing)/about/page.tsx', 'app/docs/[...parts]/page.tsx'];

const viz: VizDef<In> = {
  id: 'next-routing',
  title: 'File-based routing',
  code,
  language: 'javascript',
  inputs: [
    { key: 'files', label: 'Files in app/ (comma separated)', kind: 'strings', default: DEFAULT_FILES, maxItems: 12 },
    { key: 'url', label: 'Requested URL', kind: 'string', default: '/blog/new', maxItems: 40 },
  ],
  presets: [
    { label: 'Static beats dynamic', input: { url: '/blog/new' } },
    { label: 'Dynamic segment', input: { url: '/blog/hello-world' } },
    { label: 'Route group', input: { url: '/about' } },
    { label: 'Catch-all', input: { url: '/docs/a/b/c' } },
    { label: '404', input: { url: '/pricing' } },
  ],
  run({ files, url }) {
    const r = new Recorder(code);
    const parts = urlParts(url);
    const dirOf = (f: string) => f.split('/').slice(0, -1).join('/');
    const tones: Record<string, Tone> = {};
    const tree = (title = 'app/ folder (badge = special files inside)') => folderTreePanel(files, { tones: { ...tones }, title });
    const segs = () => tree();
    const urlPanel = (hit?: number) => ({ type: 'array' as const, title: 'URL segments', values: parts.length ? parts : ['(root)'], tones: hit === undefined ? {} : Object.fromEntries(parts.map((_, i) => [i, 'found' as Tone])), hideIndex: true });
    let best: { file: string; params: Params; rank: number[] } | null = null;
    const kv = (extra: Record<string, unknown> = {}) => ({ url, best: best ? best.file : 'none', ...extra });

    r.step('split', `URL ${url || '/'} splits into ${parts.length} segment${parts.length === 1 ? '' : 's'}`, [segs(), urlPanel()], kv());
    r.step('init', 'No candidate yet: best = null', [segs(), urlPanel()], kv());
    const skipped = files.filter((f) => !isPageFile(f));
    if (skipped.length) {
      r.step('skip', cap(`Only page.* files make a URL; skipping ${skipped.map((f) => f.split('/').pop()).join(', ')}`), [segs(), urlPanel()], kv());
    }
    for (const file of files) {
      if (!isPageFile(file)) continue;
      r.op();
      const label = patternLabel(file);
      tones[dirOf(file)] = 'compare';
      const m = matchPattern(patternSegments(file), parts);
      if (!m) {
        r.step('try', cap(`${label} does not fit ${url || '/'}`), [segs(), urlPanel()], kv({ pattern: label }));
        tones[dirOf(file)] = 'muted';
        continue;
      }
      r.step('try', cap(`${label} fits (specificity ${m.rank.join(',') || 'root'}; lower is stronger)`), [segs(), urlPanel()], kv({ pattern: label, rank: m.rank.join(',') }));
      if (!best || compareRank(m.rank, best.rank) < 0) {
        if (best) tones[dirOf(best.file)] = 'frontier';
        best = { file, ...m };
        tones[dirOf(file)] = 'found';
        r.step('better', cap(`${label} is now the best match`), [segs(), urlPanel()], kv({ pattern: label }));
      } else {
        tones[dirOf(file)] = 'frontier';
        r.step('better', cap(`${label} fits but ${patternLabel(best.file)} is more specific: keep it`), [segs(), urlPanel()], kv({ pattern: label }));
      }
    }
    const result = best ? { file: best.file, params: best.params } : null;
    r.step(
      'result',
      best ? cap(`Render ${best.file}  params ${JSON.stringify(best.params)}`) : `Nothing matched ${url || '/'}: Next.js renders not-found (404)`,
      [segs(), urlPanel(best ? 1 : undefined), { type: 'kv', title: 'Match', entries: [{ k: 'file', v: best ? best.file : 'none', tone: best ? 'found' : 'error' }, { k: 'params', v: JSON.stringify(best ? best.params : {}) }] }],
      kv(),
    );
    return { frames: r.frames, result };
  },
  reference({ files, url }) {
    const path = '/' + urlParts(url).join('/');
    const cands: { key: string; file: string; params: Params }[] = [];
    for (const file of files.filter(isPageFile)) {
      const segs = patternSegments(file);
      const names: { name: string; many: boolean }[] = [];
      let re = '^';
      let key = '';
      for (const s of segs) {
        if (s.startsWith('[[...')) {
          names.push({ name: s.slice(5, -2), many: true });
          re += '(?:/(.+))?';
          key += '3';
        } else if (s.startsWith('[...')) {
          names.push({ name: s.slice(4, -1), many: true });
          re += '/(.+)';
          key += '2';
        } else if (s.startsWith('[')) {
          names.push({ name: s.slice(1, -1), many: false });
          re += '/([^/]+)';
          key += '1';
        } else {
          re += '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          key += '0';
        }
      }
      const m = new RegExp(re + '/?$').exec(path === '/' ? '' : path);
      if (!m) continue;
      const params: Params = {};
      names.forEach((n, i) => {
        if (m[i + 1] !== undefined) params[n.name] = n.many ? m[i + 1].split('/') : m[i + 1];
      });
      cands.push({ key, file, params });
    }
    cands.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    return cands.length ? { file: cands[0].file, params: cands[0].params } : null;
  },
};

const FILES = ['app/layout.tsx', 'app/page.tsx', 'app/blog/page.tsx', 'app/blog/new/page.tsx', 'app/blog/[slug]/page.tsx', 'app/(marketing)/about/page.tsx', 'app/docs/[...parts]/page.tsx'];

const unit: Unit = {
  id: 'next-routing',
  hook: 'In the App Router the folder tree is the router, and interviewers love asking what happens when two folders could both answer a URL. Knowing the priority rules (static, then dynamic, then catch-all) is the quick tell.',
  simulationNote: 'Next.js-style simulation: real Next.js cannot run in the browser. The exercises model the matching rules with plain JavaScript over a list of file paths, not Next.js itself.',
  predict: {
    prompt: 'You have app/blog/[slug]/page.tsx and app/blog/new/page.tsx. Which file renders the URL /blog/new?',
    options: ['app/blog/[slug]/page.tsx, because it was created first', 'app/blog/new/page.tsx, because static segments beat dynamic ones', 'Neither: Next.js reports a routing conflict', 'Both render, nested inside each other'],
    answer: 1,
    explain: 'Next.js ranks routes by specificity: a static segment wins over a dynamic [slug], which wins over a catch-all. Folder or file creation order never matters.',
  },
  viz,
  deeper: {
    points: [
      'Only a folder containing page.tsx (or route.ts) becomes a URL. layout.tsx, loading.tsx and friends are special files that never create routes on their own.',
      'Dynamic segments: [slug] matches exactly one segment, [...parts] matches one or more, and [[...parts]] also matches zero.',
      'Route groups such as (marketing) are just folders for organisation: they vanish from the URL and can hold their own layout.',
      'Specificity is compared segment by segment from the left: static, then dynamic, then catch-all, then optional catch-all.',
      'Two pages that resolve to the same URL (for example /about in two different groups) is a build error.',
    ],
    pitfalls: ['Expecting [slug] to match nested paths like /blog/a/b (use [...slug])', 'Putting page.tsx in a route group and forgetting the group name is not part of the URL', 'Assuming query strings take part in routing (they arrive as searchParams)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'matchRoute',
    statement: 'Given the list of file paths under app/ and a URL, return { file, params } for the page that renders it, or null. Ignore route groups in the URL, let static beat dynamic beat catch-all, and ignore the query string.',
    signature: 'function matchRoute(files, url) {',
    solution: `function matchRoute(files, url) {
  const parts = url.split('?')[0].split('/').filter(Boolean);
  let best = null;
  for (const file of files) {
    if (!file.endsWith('/page.tsx')) continue;
    const segs = file.split('/').slice(1, -1).filter((s) => @@!s.startsWith('(')@@);
    const params = {};
    const rank = [];
    let catchAll = false;
    let ok = true;
    for (let i = 0; i < segs.length && ok; i++) {
      const s = segs[i];
      if (s.startsWith('[...')) {
        ok = parts.length > i;
        params[s.slice(4, -1)] = @@parts.slice(i)@@;
        rank.push(2);
        catchAll = true;
        break;
      } else if (s.startsWith('[')) {
        ok = i < parts.length;
        params[s.slice(1, -1)] = parts[i];
        rank.push(1);
      } else {
        ok = @@parts[i] === s@@;
        rank.push(0);
      }
    }
    if (!ok || (!catchAll && segs.length !== parts.length)) continue;
    if (!best || @@isBetter(rank, best.rank)@@) best = { file, params, rank };
  }
  return best && { file: best.file, params: best.params };
}

function isBetter(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return @@a[i] < b[i]@@;
  }
  return false;
}`,
    tests: [
      { args: [FILES, '/'], expected: { file: 'app/page.tsx', params: {} }, name: 'home' },
      { args: [FILES, '/blog/new'], expected: { file: 'app/blog/new/page.tsx', params: {} }, name: 'static beats dynamic' },
      { args: [FILES, '/blog/hello'], expected: { file: 'app/blog/[slug]/page.tsx', params: { slug: 'hello' } }, name: 'dynamic segment' },
      { args: [FILES, '/about'], expected: { file: 'app/(marketing)/about/page.tsx', params: {} }, name: 'route group is not in the URL' },
      { args: [FILES, '/docs/a/b/c'], expected: { file: 'app/docs/[...parts]/page.tsx', params: { parts: ['a', 'b', 'c'] } }, name: 'catch-all' },
      { args: [FILES, '/docs'], expected: null, name: 'catch-all needs at least one segment' },
      { args: [FILES, '/blog/hello?ref=x'], expected: { file: 'app/blog/[slug]/page.tsx', params: { slug: 'hello' } }, name: 'query string ignored' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'matchRoute',
    statement: 'The dynamic page [slug] is listed before the static page /blog/new, and now /blog/new renders the wrong file. Fix the matcher.',
    buggy: `function matchRoute(files, url) {
  const parts = url.split('/').filter(Boolean);
  let found = null;
  for (const file of files) {
    if (!file.endsWith('/page.tsx')) continue;
    const segs = file.split('/').slice(1, -1);
    if (segs.length !== parts.length) continue;
    const params = {};
    let statics = 0;
    const ok = segs.every((s, i) => {
      if (s.startsWith('[')) {
        params[s.slice(1, -1)] = parts[i];
        return true;
      }
      if (s === parts[i]) {
        statics++;
        return true;
      }
      return false;
    });
    if (!ok) continue;
    if (!found) found = { file, params, statics };
  }
  return found && { file: found.file, params: found.params };
}`,
    fixed: `function matchRoute(files, url) {
  const parts = url.split('/').filter(Boolean);
  let found = null;
  for (const file of files) {
    if (!file.endsWith('/page.tsx')) continue;
    const segs = file.split('/').slice(1, -1);
    if (segs.length !== parts.length) continue;
    const params = {};
    let statics = 0;
    const ok = segs.every((s, i) => {
      if (s.startsWith('[')) {
        params[s.slice(1, -1)] = parts[i];
        return true;
      }
      if (s === parts[i]) {
        statics++;
        return true;
      }
      return false;
    });
    if (!ok) continue;
    if (!found || statics > found.statics) found = { file, params, statics };
  }
  return found && { file: found.file, params: found.params };
}`,
    tests: [
      { args: [['app/blog/[slug]/page.tsx', 'app/blog/new/page.tsx', 'app/page.tsx'], '/blog/new'], expected: { file: 'app/blog/new/page.tsx', params: {} }, name: 'static listed second' },
      { args: [['app/blog/[slug]/page.tsx', 'app/blog/new/page.tsx', 'app/page.tsx'], '/blog/other'], expected: { file: 'app/blog/[slug]/page.tsx', params: { slug: 'other' } } },
      { args: [['app/[team]/settings/page.tsx', 'app/acme/settings/page.tsx'], '/acme/settings'], expected: { file: 'app/acme/settings/page.tsx', params: {} }, name: 'two static parts win' },
      { args: [['app/page.tsx', 'app/about/page.tsx'], '/'], expected: { file: 'app/page.tsx', params: {} } },
    ],
    bugType: 'dynamic matched before static',
    hint: 'Look at which candidate is kept when a second file also matches the URL.',
    explanation: 'The loop keeps the first file that matches, so whichever folder happens to be listed first wins. Routing must rank matches by specificity: replace the candidate only when it has more static segments (`!found || statics > found.statics`).',
  },
  boss: {
    title: 'Spot conflicting routes',
    statement: 'Two page files that serve the same URL make the build fail. Write findConflicts(files): ignore route groups, treat any [name] as the same shape ([]) and any [...name] as [...], and return the sorted, de-duplicated URL shapes (like "/about" or "/blog/[]") that more than one page.tsx claims. Non-page files are ignored.',
    language: 'javascript',
    fnName: 'findConflicts',
    starter: `function findConflicts(files) {
  // your code here
}
`,
    solution: `function findConflicts(files) {
  const seen = {};
  for (const file of files) {
    if (!file.endsWith('/page.tsx')) continue;
    const shape = file
      .split('/')
      .slice(1, -1)
      .filter((s) => !s.startsWith('('))
      .map((s) => (s.startsWith('[...') ? '[...]' : s.startsWith('[') ? '[]' : s));
    const key = '/' + shape.join('/');
    seen[key] = (seen[key] || 0) + 1;
  }
  return Object.keys(seen).filter((k) => seen[k] > 1).sort();
}`,
    tests: [
      { args: [['app/(a)/about/page.tsx', 'app/(b)/about/page.tsx', 'app/page.tsx']], expected: ['/about'], name: 'two groups, same URL' },
      { args: [['app/blog/[slug]/page.tsx', 'app/blog/[id]/page.tsx']], expected: ['/blog/[]'], name: 'param names do not matter' },
      { args: [['app/page.tsx', 'app/about/page.tsx', 'app/about/layout.tsx']], expected: [], name: 'no conflict' },
      { args: [['app/page.tsx', 'app/(home)/page.tsx', 'app/docs/[...a]/page.tsx', 'app/(x)/docs/[...b]/page.tsx']], expected: ['/', '/docs/[...]'], name: 'root and catch-all' },
      { args: [['app/blog/[slug]/page.tsx', 'app/blog/new/page.tsx']], expected: [], name: 'static and dynamic can coexist' },
    ],
    hints: ['Reduce every page to a normalised "shape" string, count how many pages share each shape.', 'Strip segments that start with "(", map "[...x]" to "[...]" and "[x]" to "[]", join with "/", then keep shapes seen more than once and sort them.'],
    combines: [],
  },
  quiz: [
    {
      prompt: 'Which URL does app/(shop)/cart/page.tsx serve?',
      options: ['/(shop)/cart', '/shop/cart', '/cart', '/cart/page'],
      answer: 2,
      explain: 'Parenthesised folders are route groups. They organise files (and layouts) but never appear in the URL.',
    },
  ],
};

export default unit;
