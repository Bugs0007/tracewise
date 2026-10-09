import { Recorder } from '@/engine/recorder';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { Seq } from '@/content/lib/backend-db-auth';
import { SIM_NEXT, clip } from '@/content/lib/finish-m2m3';

const code = `
// middleware.ts (runs before routing, on every matched request)
export function middleware(req) {                                          //@fn
  const { pathname } = req.nextUrl;
  const session = req.cookies.get('session');                              //@cookie
  if (pathname.startsWith('/dashboard') && !session)                       //@guard
    return NextResponse.redirect(new URL('/login?from=' + pathname, req.url));   //@redirect
  if (pathname === '/login' && session)
    return NextResponse.redirect(new URL('/dashboard', req.url));          //@back
  if (pathname.startsWith('/blog/'))
    return NextResponse.rewrite(new URL('/posts/' + pathname.slice(6), req.url));   //@rewrite
  return NextResponse.next();                                              //@next
}

export const config = { matcher: ['/((?!api|_next|favicon).*)'] };         //@matcher
`;

type Decision = { type: 'next' | 'redirect' | 'rewrite'; url: string };

const skipped = (p: string): boolean => p.startsWith('/api') || p.startsWith('/_next') || p.startsWith('/favicon');

function decide(pathname: string, session: boolean): Decision {
  if (pathname.startsWith('/dashboard') && !session) return { type: 'redirect', url: '/login?from=' + pathname };
  if (pathname === '/login' && session) return { type: 'redirect', url: '/dashboard' };
  if (pathname.startsWith('/blog/')) return { type: 'rewrite', url: '/posts/' + pathname.slice(6) };
  return { type: 'next', url: pathname };
}

interface In {
  pathname: string;
  session: string;
}

interface Out {
  first: string;
  urlBar: string;
  rendered: string;
}

const viz: VizDef<In> = {
  id: 'next-middleware',
  title: 'Middleware runs before routing',
  code,
  language: 'javascript',
  inputs: [
    { key: 'pathname', label: 'Requested path', kind: 'string', default: '/dashboard/settings', maxItems: 40 },
    { key: 'session', label: 'Session cookie', kind: 'select', options: ['none', 'valid'], default: 'none' },
  ],
  presets: [
    { label: 'Guest opens dashboard', input: { pathname: '/dashboard/settings', session: 'none' } },
    { label: 'Logged in, opens login', input: { pathname: '/login', session: 'valid' } },
    { label: 'Rewrite a pretty URL', input: { pathname: '/blog/hello', session: 'none' } },
    { label: 'Static asset skips middleware', input: { pathname: '/_next/chunk.js', session: 'none' } },
  ],
  run({ pathname, session }) {
    if (!pathname.startsWith('/')) throw new Error('The path must start with "/".');
    if (session !== 'none' && session !== 'valid') throw new Error('session must be none or valid');
    const has = session === 'valid';
    const r = new Recorder(code);
    const seq = new Seq(['Browser', 'Middleware', 'Router / page'], 'Request lifecycle');
    let urlBar = pathname;
    let rendered = '';
    let verdict = '-';
    const kv = (): KVPanel => ({
      type: 'kv',
      title: 'State',
      entries: [
        { k: 'URL bar', v: urlBar, tone: 'active' as Tone },
        { k: 'last decision', v: verdict, tone: (verdict === '-' ? 'muted' : verdict.startsWith('redirect') ? 'swap' : verdict.startsWith('rewrite') ? 'compare' : 'done') as Tone },
        { k: 'page rendered', v: rendered || '(not yet)', tone: (rendered ? 'found' : 'muted') as Tone },
      ],
    });
    const view = (): Panel[] => [seq.panel(), kv()];

    seq.send('Browser', 'Middleware', `GET ${pathname}${has ? '  Cookie: session' : ''}`);
    r.step('fn', clip(`Browser requests ${pathname} ${has ? 'with' : 'without'} a session cookie`), view(), { pathname, session });
    let current = pathname;
    let first = '';
    for (let hop = 0; hop < 4; hop++) {
      r.op();
      if (skipped(current)) {
        verdict = 'matcher: skipped';
        seq.send('Middleware', 'Router / page', `${current} (not matched, middleware skipped)`, 'done');
        rendered = current;
        first ||= 'next';
        r.step('matcher', clip(`The matcher excludes ${current}: middleware does not run at all`), view(), { matched: false });
        break;
      }
      r.step('matcher', clip(`${current} matches the matcher, so middleware runs`), view(), { matched: true });
      r.step('cookie', clip(`req.cookies.get('session') is ${has ? 'set' : 'missing'}`), view(), { session: has });
      const d = decide(current, has);
      first ||= d.type;
      verdict = `${d.type} ${d.url}`;
      if (d.type === 'redirect') {
        seq.send('Middleware', 'Browser', `307 Location: ${d.url}`, 'swap', true);
        r.step(d.url.startsWith('/login') ? 'redirect' : 'back', clip(`redirect: the browser is told to go to ${d.url}`), view(), { decision: d.type });
        urlBar = d.url;
        seq.send('Browser', 'Middleware', `GET ${d.url} (new request, URL bar changed)`);
        current = d.url;
        r.step('fn', clip(`Browser follows the redirect: the URL bar now shows ${d.url}`), view(), { urlBar });
        continue;
      }
      if (d.type === 'rewrite') {
        rendered = d.url;
        seq.send('Middleware', 'Router / page', `rewrite to ${d.url} (browser never knows)`, 'compare');
        r.step('rewrite', clip(`rewrite: router renders ${d.url} but the URL bar still shows ${urlBar}`), view(), { decision: d.type });
        break;
      }
      rendered = d.url;
      seq.send('Middleware', 'Router / page', `NextResponse.next() for ${d.url}`, 'done');
      r.step('next', clip(`next(): the request continues to the router unchanged: ${d.url}`), view(), { decision: d.type });
      break;
    }
    seq.send('Router / page', 'Browser', `200 page for ${rendered}`, 'found', true);
    r.step(undefined, clip(`Final: URL bar ${urlBar}, page rendered ${rendered}`), view(), { urlBar, rendered });
    const out: Out = { first, urlBar, rendered };
    return { frames: r.frames, result: out };
  },
  reference({ pathname, session }) {
    const logged = session === 'valid';
    const settle = (p: string, depth: number): Out & { depth: number } => {
      if (skipped(p)) return { first: 'next', urlBar: p, rendered: p, depth };
      if (p.startsWith('/dashboard') && !logged) {
        const to = '/login?from=' + p;
        const rest = settle(to, depth + 1);
        return { first: 'redirect', urlBar: rest.urlBar, rendered: rest.rendered, depth: rest.depth };
      }
      if (p === '/login' && logged) {
        const rest = settle('/dashboard', depth + 1);
        return { first: 'redirect', urlBar: rest.urlBar, rendered: rest.rendered, depth: rest.depth };
      }
      if (p.startsWith('/blog/')) return { first: 'rewrite', urlBar: p, rendered: '/posts/' + p.slice(6), depth };
      return { first: 'next', urlBar: p, rendered: p, depth };
    };
    const { first, urlBar, rendered } = settle(pathname, 0);
    return { first, urlBar, rendered };
  },
};


const unit: Unit = {
  id: 'next-middleware',
  hook: 'Middleware is where Next.js apps do auth gates, locale redirects and A/B rewrites. Interviewers ask what runs when: before the cache, before routing, at the edge, and why it must be fast and stateless.',
  predict: {
    prompt: 'Middleware answers a request for /blog/hello with NextResponse.rewrite(new URL("/posts/hello", req.url)). What does the browser address bar show afterwards?',
    options: ['/posts/hello, because the server redirected', '/blog/hello: the rewrite is invisible to the browser', 'An error page, since /blog/hello has no file', '/blog/hello/posts/hello'],
    answer: 1,
    explain: 'A redirect sends the browser a 307 with a new Location and the URL bar changes. A rewrite stays on the server: the router simply renders another route for the same URL.',
  },
  simulationNote: SIM_NEXT,
  viz,
  deeper: {
    points: [
      'Middleware (`middleware.ts` at the project root) runs for each request that matches `config.matcher`, before the router and before cached pages are served.',
      'It can do three things: `NextResponse.next()` (continue), `redirect(url)` (the browser gets a 307/308 and the URL changes) and `rewrite(url)` (render a different route under the same URL).',
      'It can also set or read headers and cookies, which makes it a good place for auth gates, locale detection and feature flags.',
      'Use `config.matcher` to skip static files, `_next` assets and API routes; otherwise every asset request pays the middleware cost.',
      'It runs on the Edge runtime in many setups: small and fast, with no full Node.js API and no direct database drivers.',
      'A redirect to a path that itself matches the middleware can loop. Always make sure the target is allowed through.',
    ],
    pitfalls: ['Redirecting unauthenticated users to /login without excluding /login itself (infinite loop)', 'Doing slow work such as database queries on every request', 'Relying on middleware as the only auth check; protect data access too'],
  },
  practice: {
    language: 'javascript',
    fnName: 'middleware',
    statement: 'Write `middleware(req)` for `req = { pathname, cookies }` returning `{ type, url }`. Paths starting with `/api/`, `/_next/` or equal to `/favicon.ico` are skipped by the matcher: return `{ type: "next", url: pathname }`. A path equal to `/dashboard` or under `/dashboard/` without `cookies.session` redirects to `/login?from=<pathname>`. `/login` WITH a session redirects to `/dashboard`. `/blog/<slug>` rewrites to `/posts/<slug>`. Anything else is `next`.',
    signature: 'function middleware(req) {',
    solution: `function middleware(req) {
  const { pathname, cookies } = req;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return { type: 'next', url: pathname };
  }
  const session = cookies.session;
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (@@!session@@) return { type: @@'redirect'@@, url: '/login?from=' + pathname };
  }
  if (pathname === '/login' && session) return { type: 'redirect', url: '/dashboard' };
  if (pathname.startsWith('/blog/')) {
    return { type: @@'rewrite'@@, url: '/posts/' + @@pathname.slice('/blog/'.length)@@ };
  }
  return { type: 'next', url: pathname };
}`,
    tests: [
      { args: [{ pathname: '/dashboard', cookies: {} }], expected: { type: 'redirect', url: '/login?from=/dashboard' }, name: 'guest at /dashboard' },
      { args: [{ pathname: '/dashboard/settings', cookies: {} }], expected: { type: 'redirect', url: '/login?from=/dashboard/settings' }, name: 'guest deep in dashboard' },
      { args: [{ pathname: '/dashboard/settings', cookies: { session: 'abc' } }], expected: { type: 'next', url: '/dashboard/settings' }, name: 'logged in passes' },
      { args: [{ pathname: '/dashboardx', cookies: {} }], expected: { type: 'next', url: '/dashboardx' }, name: '/dashboardx is not the dashboard' },
      { args: [{ pathname: '/login', cookies: { session: 'abc' } }], expected: { type: 'redirect', url: '/dashboard' }, name: 'logged in leaves login' },
      { args: [{ pathname: '/login', cookies: {} }], expected: { type: 'next', url: '/login' }, name: 'guest may see login' },
      { args: [{ pathname: '/blog/hello-world', cookies: {} }], expected: { type: 'rewrite', url: '/posts/hello-world' }, name: 'blog rewrite' },
      { args: [{ pathname: '/api/dashboard', cookies: {} }], expected: { type: 'next', url: '/api/dashboard' }, name: 'API skipped by matcher' },
      { args: [{ pathname: '/_next/static/app.js', cookies: {} }], expected: { type: 'next', url: '/_next/static/app.js' }, name: 'assets skipped' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'middleware',
    statement: 'Visiting /login without a session makes the browser bounce forever between /login and /login?from=... ("too many redirects"). Fix the guard.',
    buggy: `function middleware(req) {
  const { pathname, cookies } = req;
  if (!cookies.session) {
    return { type: 'redirect', url: '/login?from=' + pathname };
  }
  return { type: 'next', url: pathname };
}`,
    fixed: `function middleware(req) {
  const { pathname, cookies } = req;
  if (!cookies.session && pathname !== '/login') {
    return { type: 'redirect', url: '/login?from=' + pathname };
  }
  return { type: 'next', url: pathname };
}`,
    tests: [
      { args: [{ pathname: '/login', cookies: {} }], expected: { type: 'next', url: '/login' }, name: 'login page is reachable' },
      { args: [{ pathname: '/account', cookies: {} }], expected: { type: 'redirect', url: '/login?from=/account' }, name: 'guest redirected' },
      { args: [{ pathname: '/account', cookies: { session: 's' } }], expected: { type: 'next', url: '/account' }, name: 'logged in passes' },
    ],
    bugType: 'redirect loop',
    hint: 'Where does the redirect send the guest, and does that destination go through the same guard?',
    explanation: 'The redirect target /login also matches the middleware, and it still has no session, so it redirects again, forever. The guard must let the login page through (or exclude it in the matcher).',
  },
  boss: {
    title: 'Matcher patterns',
    statement: 'Write `matchesMatcher(patterns, pathname)` returning true when any pattern matches the whole path. Patterns are segments separated by `/`: a plain segment must be equal; `:name` matches exactly one non-empty segment; `:name*` matches zero or more segments; `:name+` matches one or more. Only the LAST segment of a pattern may use `*` or `+`. A trailing slash on the path is ignored; `/` matches only the pattern `/`.',
    language: 'javascript',
    fnName: 'matchesMatcher',
    starter: `function matchesMatcher(patterns, pathname) {
  // your code here
}
`,
    solution: `function matchesMatcher(patterns, pathname) {
  const split = (s) => s.split('/').filter(Boolean);
  const parts = split(pathname);
  return patterns.some((pattern) => {
    const segs = split(pattern);
    const last = segs[segs.length - 1] || '';
    const rest = last.endsWith('*') || last.endsWith('+') ? last.slice(-1) : '';
    const fixed = rest ? segs.slice(0, -1) : segs;
    if (rest === '') {
      if (fixed.length !== parts.length) return false;
    } else if (parts.length < fixed.length + (rest === '+' ? 1 : 0)) {
      return false;
    }
    return fixed.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
  });
}`,
    tests: [
      { args: [['/about'], '/about'], expected: true, name: 'exact' },
      { args: [['/about'], '/about/team'], expected: false, name: 'exact is not a prefix' },
      { args: [['/dashboard/:path*'], '/dashboard'], expected: true, name: ':path* matches zero segments' },
      { args: [['/dashboard/:path*'], '/dashboard/a/b/c'], expected: true, name: ':path* matches many' },
      { args: [['/dashboard/:path+'], '/dashboard'], expected: false, name: ':path+ needs one' },
      { args: [['/dashboard/:path+'], '/dashboard/x'], expected: true, name: ':path+ with one' },
      { args: [['/user/:id'], '/user/42'], expected: true, name: 'one dynamic segment' },
      { args: [['/user/:id'], '/user/42/edit'], expected: false, name: 'dynamic segment is only one' },
      { args: [['/user/:id'], '/user'], expected: false, name: 'dynamic segment needs a value' },
      { args: [['/a', '/b/:x'], '/b/9/'], expected: true, name: 'any pattern, trailing slash ignored' },
      { args: [['/'], '/'], expected: true, name: 'root' },
      { args: [['/'], '/x'], expected: false, name: 'root only matches root' },
    ],
    hints: ['Split the pattern and the path into segments. Decide first whether the last pattern segment is a "rest" segment (ends with * or +); all earlier segments must align one to one.', 'Fixed part: same length rules (exact length without a rest segment; at least fixed.length, plus one for +). Then every fixed segment is either a :param or equal to the path segment at that index.'],
    combines: ['next-routing'],
  },
  quiz: [
    {
      prompt: 'Which statement about Next.js middleware is true?',
      options: ['It runs after the page component renders', 'It runs before the request reaches the router and can redirect, rewrite or continue', 'It runs only on the client', 'It is the right place for heavy database queries'],
      answer: 1,
      explain: 'Middleware sits in front of routing. It must stay quick because it is on the path of every matched request.',
    },
  ],
};

export default unit;
