import { Recorder } from '@/engine/recorder';
import type { ListItem, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, folderTreePanel, layoutChainFor } from '@/content/lib/frontend-next';

const code = `
// Which layouts keep their state when you navigate?
function navigate(files, fromUrl, toUrl) {
  const from = layoutChain(files, fromUrl);   //@from
  const to = layoutChain(files, toUrl);       //@to
  let shared = 0;                             //@shared
  while (shared < Math.min(from.length, to.length) //@loop
         && from[shared].key === to[shared].key) { //@same
    shared++;                                 //@keep
  }
  return {                                    //@result
    persist: to.slice(0, shared).map((l) => l.file),
    remount: to.slice(shared).map((l) => l.file),
  };
}
`;

interface In {
  files: string[];
  from: string;
  to: string;
}

const DEFAULT_FILES = ['app/layout.tsx', 'app/page.tsx', 'app/dashboard/layout.tsx', 'app/dashboard/page.tsx', 'app/dashboard/settings/page.tsx', 'app/blog/layout.tsx', 'app/blog/[slug]/layout.tsx', 'app/blog/[slug]/page.tsx'];

const dirOf = (f: string) => f.split('/').slice(0, -1).join('/');

const viz: VizDef<In> = {
  id: 'next-layouts',
  title: 'Nested layouts and navigation',
  code,
  language: 'javascript',
  inputs: [
    { key: 'files', label: 'Files in app/ (comma separated)', kind: 'strings', default: DEFAULT_FILES, maxItems: 14 },
    { key: 'from', label: 'Current URL', kind: 'string', default: '/dashboard', maxItems: 40 },
    { key: 'to', label: 'Navigate to', kind: 'string', default: '/dashboard/settings', maxItems: 40 },
  ],
  presets: [
    { label: 'Sibling pages', input: { from: '/dashboard', to: '/dashboard/settings' } },
    { label: 'Across sections', input: { from: '/dashboard/settings', to: '/blog/intro' } },
    { label: 'Same layout, new param', input: { from: '/blog/intro', to: '/blog/outro' } },
    { label: 'Home to dashboard', input: { from: '/', to: '/dashboard' } },
  ],
  run({ files, from: fromUrl, to: toUrl }) {
    const r = new Recorder(code);
    const from = layoutChainFor(files, fromUrl);
    const to = layoutChainFor(files, toUrl);
    const tones: Record<string, Tone> = {};
    const chainList = (title: string, chain: { file: string; key: string }[], t: (i: number) => Tone) => ({
      type: 'list' as const,
      title,
      orientation: 'vertical' as const,
      items: chain.map((l, i): ListItem => ({ label: l.file.replace(/^app\//, ''), sub: l.key, tone: t(i) })),
      emptyText: 'no layouts',
      endLabel: 'inner',
      startLabel: 'outer',
    });
    const view = (shared: number, mode: 'from' | 'to' | 'compare' | 'done') => {
      const tt: Record<string, Tone> = { ...tones };
      return [
        folderTreePanel(files, { tones: tt, title: 'Layouts are the badges named "layout"' }),
        chainList(`Layouts for ${fromUrl || '/'}`, from, (i) => (mode === 'from' ? 'active' : i < shared ? 'done' : mode === 'done' ? 'error' : 'default')),
        chainList(`Layouts for ${toUrl || '/'}`, to, (i) => (mode === 'from' ? 'muted' : mode === 'to' ? 'active' : i < shared ? 'done' : mode === 'done' ? 'swap' : 'default')),
      ];
    };
    const vars = (shared?: number) => ({ from: from.length, to: to.length, ...(shared === undefined ? {} : { shared }) });

    for (const l of from) tones[dirOf(l.file)] = 'visited';
    r.step('from', cap(`${fromUrl || '/'} is wrapped by ${from.length} layout${from.length === 1 ? '' : 's'}`), view(0, 'from'), vars());
    for (const l of to) tones[dirOf(l.file)] = 'frontier';
    r.step('to', cap(`${toUrl || '/'} will be wrapped by ${to.length} layout${to.length === 1 ? '' : 's'}`), view(0, 'to'), vars());
    r.step('shared', 'Walk both chains from the outside in; stop at the first layout that differs', view(0, 'compare'), vars(0));
    let shared = 0;
    while (true) {
      r.op();
      if (!(shared < Math.min(from.length, to.length))) {
        r.step('loop', 'One chain ran out: everything deeper has to be mounted fresh', view(shared, 'compare'), vars(shared));
        break;
      }
      if (from[shared].key !== to[shared].key) {
        r.step('same', cap(`${from[shared].key} vs ${to[shared].key}: different instance, stop`), view(shared, 'compare'), vars(shared));
        break;
      }
      tones[dirOf(to[shared].file)] = 'done';
      shared++;
      r.step('keep', cap(`${to[shared - 1].file.replace(/^app\//, '')} is the same instance: state is kept`), view(shared, 'compare'), vars(shared));
    }
    for (const l of to.slice(shared)) tones[dirOf(l.file)] = 'swap';
    for (const l of from.slice(shared)) if (!to.slice(shared).some((t) => dirOf(t.file) === dirOf(l.file))) tones[dirOf(l.file)] = 'error';
    const result = { persist: to.slice(0, shared).map((l) => l.file), remount: to.slice(shared).map((l) => l.file) };
    r.step('result', cap(`${result.persist.length} layout(s) persist, ${result.remount.length} (re)mount; only the page below swaps`), view(shared, 'done'), vars(shared));
    return { frames: r.frames, result };
  },
  reference({ files, from, to }) {
    const a = layoutChainFor(files, from);
    const b = layoutChainFor(files, to);
    const keys = new Set(a.map((l) => l.key));
    return { persist: b.filter((l) => keys.has(l.key)).map((l) => l.file), remount: b.filter((l) => !keys.has(l.key)).map((l) => l.file) };
  },
};

const F2 = ['app/layout.tsx', 'app/dashboard/layout.tsx', 'app/dashboard/settings/layout.tsx', 'app/blog/layout.tsx', 'app/blog/[slug]/layout.tsx', 'app/(shop)/layout.tsx', 'app/about/page.tsx'];

const unit: Unit = {
  id: 'next-layouts',
  hook: 'Layouts are why a Next.js sidebar keeps its scroll position and open menus while the page next to it changes. Being able to say exactly which components mount, persist or remount on a navigation is a favourite follow-up question.',
  simulationNote: 'Next.js-style simulation: the exercises compute layout chains and remounts from file paths with plain JavaScript. They model the behaviour of the App Router, they are not Next.js itself.',
  predict: {
    prompt: 'app/dashboard/layout.tsx wraps both /dashboard and /dashboard/settings. A user types in a search box inside that layout, then clicks a link from /dashboard to /dashboard/settings. What happens to the search box?',
    options: ['It is remounted and the text is lost', 'It keeps its text, because the layout stays mounted and only the page swaps', 'It keeps its text only if the layout is a client component with useMemo', 'The whole route is reloaded from the server'],
    answer: 1,
    explain: 'Layouts do not re-render or remount when you navigate between the pages they share. Next.js only swaps the segment that changed, which is called partial rendering.',
  },
  viz,
  deeper: {
    points: [
      'Every folder from app/ down to the page can hold a layout.tsx. They nest outer to inner, each receiving the next one as children.',
      'Route groups can carry their own layout, so (shop) and (marketing) can wrap different pages at the same URL depth.',
      'On navigation Next.js fetches only the segments that changed. Shared parent layouts keep their DOM, state and scroll position.',
      'A dynamic segment folder is a new instance per value: going from /blog/a to /blog/b remounts app/blog/[slug]/layout.tsx but not app/blog/layout.tsx.',
      'The root layout is the only one that must render <html> and <body>.',
    ],
    pitfalls: ['Reading the pathname in a layout and expecting it to update (layouts do not re-render, use a client hook in a child)', 'Putting per-page state in a layout and being surprised that it survives navigation', 'Using template.tsx expecting persistence: templates remount on every navigation by design'],
  },
  practice: {
    language: 'javascript',
    fnName: 'layoutChain',
    statement: 'Given every file path under app/ and the folder of a page (like "app/dashboard/settings"), return the layout.tsx files that wrap it, outermost first. Folders without a layout are skipped.',
    signature: 'function layoutChain(files, dir) {',
    solution: `function layoutChain(files, dir) {
  const parts = dir.split('/');
  const chain = [];
  for (let i = 1; i <= @@parts.length@@; i++) {
    const layout = @@parts.slice(0, i).join('/') + '/layout.tsx'@@;
    if (@@files.includes(layout)@@) {
      @@chain.push(layout)@@;
    }
  }
  return chain;
}`,
    tests: [
      { args: [F2, 'app/dashboard/settings'], expected: ['app/layout.tsx', 'app/dashboard/layout.tsx', 'app/dashboard/settings/layout.tsx'], name: 'three levels' },
      { args: [F2, 'app'], expected: ['app/layout.tsx'], name: 'root only' },
      { args: [F2, 'app/blog/[slug]'], expected: ['app/layout.tsx', 'app/blog/layout.tsx', 'app/blog/[slug]/layout.tsx'], name: 'dynamic folder' },
      { args: [F2, 'app/(shop)/cart'], expected: ['app/layout.tsx', 'app/(shop)/layout.tsx'], name: 'route group layout, folder without one' },
      { args: [F2, 'app/about'], expected: ['app/layout.tsx'], name: 'page folder without a layout' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'remounts',
    statement: 'remounts(from, to) takes two layout chains (items have a file and the instance key) and returns the files of the layouts in `to` that must mount fresh. /blog/a to /blog/b should remount the [slug] layout, but this version says nothing changes.',
    buggy: `function remounts(from, to) {
  return to
    .filter((layout) => !from.some((old) => old.file === layout.file))
    .map((layout) => layout.file);
}`,
    fixed: `function remounts(from, to) {
  return to
    .filter((layout) => !from.some((old) => old.key === layout.key))
    .map((layout) => layout.file);
}`,
    tests: [
      {
        args: [
          [{ file: 'app/layout.tsx', key: 'app' }, { file: 'app/blog/[slug]/layout.tsx', key: 'app/blog/a' }],
          [{ file: 'app/layout.tsx', key: 'app' }, { file: 'app/blog/[slug]/layout.tsx', key: 'app/blog/b' }],
        ],
        expected: ['app/blog/[slug]/layout.tsx'],
        name: 'new param value',
      },
      {
        args: [
          [{ file: 'app/layout.tsx', key: 'app' }, { file: 'app/dashboard/layout.tsx', key: 'app/dashboard' }],
          [{ file: 'app/layout.tsx', key: 'app' }, { file: 'app/dashboard/layout.tsx', key: 'app/dashboard' }],
        ],
        expected: [],
        name: 'sibling pages',
      },
      {
        args: [
          [{ file: 'app/layout.tsx', key: 'app' }, { file: 'app/dashboard/layout.tsx', key: 'app/dashboard' }],
          [{ file: 'app/layout.tsx', key: 'app' }, { file: 'app/blog/layout.tsx', key: 'app/blog' }],
        ],
        expected: ['app/blog/layout.tsx'],
        name: 'different section',
      },
      { args: [[], [{ file: 'app/layout.tsx', key: 'app' }]], expected: ['app/layout.tsx'], name: 'first visit' },
    ],
    bugType: 'identity compared by file, not by instance',
    hint: 'Two layouts can come from the same file and still be different mounted instances. What tells them apart?',
    explanation: 'A dynamic folder like [slug] is the same file for every value but a different instance per value. Comparing file paths hides that. Compare the instance key (path with real param values) instead.',
  },
  boss: {
    title: 'Count layout mounts',
    statement: 'A user visits pages in order. Each visit is { dir, key }: dir is the page folder (with route group and [param] names, like "app/blog/[slug]") and key is the same path with real values ("app/blog/a"). Return how many layout mounts happen in total. A layout mounts when its key was not in the chain of the previous visit (the first visit mounts everything).',
    language: 'javascript',
    fnName: 'mountCount',
    starter: `function mountCount(files, visits) {
  // your code here
}
`,
    solution: `function mountCount(files, visits) {
  let prev = [];
  let mounts = 0;
  for (const { dir, key } of visits) {
    const dirs = dir.split('/');
    const keys = key.split('/');
    const chain = [];
    for (let i = 1; i <= dirs.length; i++) {
      if (files.includes(dirs.slice(0, i).join('/') + '/layout.tsx')) chain.push(keys.slice(0, i).join('/'));
    }
    mounts += chain.filter((k) => !prev.includes(k)).length;
    prev = chain;
  }
  return mounts;
}`,
    tests: [
      { args: [F2, [{ dir: 'app', key: 'app' }]], expected: 1, name: 'one visit' },
      { args: [F2, [{ dir: 'app/dashboard', key: 'app/dashboard' }, { dir: 'app/dashboard/settings', key: 'app/dashboard/settings' }]], expected: 3, name: 'going deeper' },
      { args: [F2, [{ dir: 'app/blog/[slug]', key: 'app/blog/a' }, { dir: 'app/blog/[slug]', key: 'app/blog/b' }]], expected: 4, name: 'new param remounts only the inner layout' },
      { args: [F2, [{ dir: 'app/dashboard', key: 'app/dashboard' }, { dir: 'app/blog', key: 'app/blog' }, { dir: 'app/dashboard', key: 'app/dashboard' }]], expected: 4, name: 'leave and come back' },
      { args: [F2, [{ dir: 'app/(shop)/cart', key: 'app/(shop)/cart' }]], expected: 2, name: 'route group layout' },
    ],
    hints: ['For each visit build the chain of instance keys (practice problem), then count the ones missing from the previous visit.', 'Build keys by slicing the key path as far as the dir path you are checking for a layout.tsx. Remember the previous chain only, not history.'],
    combines: ['next-routing'],
  },
  quiz: [
    {
      prompt: 'Which file remounts on every navigation instead of persisting like a layout?',
      options: ['layout.tsx', 'template.tsx', 'loading.tsx', 'page.tsx can never remount'],
      answer: 1,
      explain: 'template.tsx wraps children like a layout but creates a fresh instance on each navigation, which is useful for enter animations or resetting state.',
    },
  ],
};

export default unit;
