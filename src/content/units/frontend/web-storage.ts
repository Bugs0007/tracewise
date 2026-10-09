import { Recorder } from '@/engine/recorder';
import type { GridPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { clip } from '@/content/lib/finish-m2m3';

const code = `
document.cookie = 'theme=dark; Max-Age=604800; Secure; SameSite=Lax';     //@cookie
localStorage.setItem('theme', 'dark');                                    //@local
sessionStorage.setItem('theme', 'dark');                                  //@session
idb.transaction('prefs', 'readwrite').objectStore('prefs').put('dark', 'theme');   //@idb
fetch('/api/me');   // only the cookie travels with the request            //@request
// reload keeps everything; closing the TAB drops its sessionStorage       //@tab
// restarting the browser keeps cookie (it has Max-Age), local, IndexedDB  //@restart
// after 8 days the cookie has expired and is deleted by the browser       //@expire
`;

const ACTIONS = ['save', 'request', 'reload', 'new tab', 'close tab', 'restart browser', 'wait 8 days'];
const INFO: Record<string, [string, string, string]> = {
  cookie: ['yes, on every request', '~4 KB each', 'until Max-Age / session'],
  localStorage: ['never', '~5 MB', 'until cleared'],
  sessionStorage: ['never', '~5 MB', 'until the tab closes'],
  indexedDB: ['never', 'hundreds of MB', 'until cleared'],
};

interface In {
  actions: string[];
}

interface Out {
  present: string[];
  carried: string[];
}

const viz: VizDef<In> = {
  id: 'web-storage',
  title: 'Where does the data live, and who sees it?',
  code,
  language: 'javascript',
  inputs: [{ key: 'actions', label: 'Actions, in order', kind: 'strings', default: ['save', 'request', 'new tab', 'close tab', 'restart browser'], maxItems: 7, help: 'save | request | reload | new tab | close tab | restart browser | wait 8 days' }],
  presets: [
    { label: 'Tab lifecycle', input: { actions: ['save', 'new tab', 'close tab', 'restart browser'] } },
    { label: 'What a request carries', input: { actions: ['save', 'request', 'wait 8 days', 'request'] } },
    { label: 'Reload is harmless', input: { actions: ['save', 'reload', 'request'] } },
    { label: 'Nothing saved yet', input: { actions: ['request', 'new tab'] } },
  ],
  run({ actions }) {
    for (const a of actions) if (!ACTIONS.includes(a)) throw new Error(`Unknown action "${a}". Use: ${ACTIONS.join(' | ')}`);
    const r = new Recorder(code);
    let cookie = false;
    let local = false;
    let idb = false;
    const sessions: Record<number, boolean> = { 1: false };
    let open = [1];
    let current = 1;
    let nextTab = 2;
    let carried: string[] = [];

    const table = (): GridPanel => {
      const rowsList: string[] = ['cookie', 'localStorage', ...open.map((t) => `sessionStorage (tab ${t}${t === current ? ', here' : ''})`), 'indexedDB'];
      const cells = rowsList.map((name) => {
        const key = name.startsWith('session') ? 'sessionStorage' : name;
        const has = key === 'cookie' ? cookie : key === 'localStorage' ? local : key === 'indexedDB' ? idb : sessions[Number(name.match(/tab (\d)/)?.[1])];
        return [has ? 'theme=dark' : '(empty)', INFO[key][0], INFO[key][1], INFO[key][2]];
      });
      const tones: Record<string, Tone> = {};
      rowsList.forEach((name, i) => {
        tones[`${i},0`] = cells[i][0] === '(empty)' ? 'muted' : 'found';
        if (carried.length && name === 'cookie') tones[`${i},1`] = 'swap';
      });
      return { type: 'grid', title: 'Browser storage', cells, tones, rowLabels: rowsList, colLabels: ['holds data', 'sent with requests', 'size limit', 'lifetime'] };
    };
    const view = () => [table()];

    r.step(undefined, 'A fresh browser: one tab, nothing stored yet', view(), { tab: current });
    for (const a of actions) {
      r.op();
      if (a === 'save') {
        cookie = local = idb = true;
        sessions[current] = true;
        r.step('cookie', clip(`theme=dark saved in all four places (sessionStorage only for tab ${current})`), view(), { action: a });
      } else if (a === 'request') {
        carried = cookie ? ['cookie'] : [];
        r.step('request', clip(carried.length ? 'The request carries Cookie: theme=dark; the three web-storage APIs are invisible to the server' : 'The request carries no cookie; the server learns nothing about the user'), view(), { carried: carried.join(',') || 'none' });
        carried = carried.slice();
      } else if (a === 'reload') {
        r.step('tab', 'Reload: the page restarts but every storage keeps its data', view(), { action: a });
      } else if (a === 'new tab') {
        const t = nextTab++;
        sessions[t] = false;
        open = [...open, t];
        current = t;
        r.step('session', clip(`Tab ${t} shares cookie, localStorage and IndexedDB but gets an EMPTY sessionStorage`), view(), { tab: t });
      } else if (a === 'close tab') {
        const gone = current;
        delete sessions[gone];
        open = open.filter((t) => t !== gone);
        if (open.length === 0) {
          const t = nextTab++;
          sessions[t] = false;
          open = [t];
        }
        current = open[0];
        r.step('tab', clip(`Tab ${gone} closed: its sessionStorage is gone. Now on tab ${current}`), view(), { tab: current });
      } else if (a === 'restart browser') {
        for (const t of open) delete sessions[t];
        const t = nextTab++;
        sessions[t] = false;
        open = [t];
        current = t;
        r.step('restart', clip(cookie ? 'Restart: sessionStorage is wiped; the cookie survives because it has Max-Age' : 'Restart: sessionStorage is wiped; persistent storage keeps what it had'), view(), { tab: t });
      } else {
        cookie = false;
        r.step('expire', 'Eight days later the 7-day cookie is expired; localStorage and IndexedDB never expire by themselves', view(), { action: a });
      }
    }
    if (actions.length === 0) r.step(undefined, 'No actions: nothing happens', view(), {});
    const present = ['cookie', local ? 'localStorage' : '', sessions[current] ? 'sessionStorage' : '', idb ? 'indexedDB' : ''].filter((x) => x && (x !== 'cookie' || cookie));
    const out: Out = { present, carried };
    r.step(undefined, clip(`Left in the current tab: ${present.join(', ') || 'nothing'}`), view(), { present: present.length });
    return { frames: r.frames, result: out };
  },
  reference({ actions }) {
    // independent: track which places hold data as a set of labels
    let alive = new Set<string>();
    const tabsWithData = new Set<number>();
    let tabs = [1];
    let cur = 1;
    let next = 2;
    let carried: string[] = [];
    for (const a of actions) {
      if (a === 'save') {
        ['cookie', 'localStorage', 'indexedDB'].forEach((x) => alive.add(x));
        tabsWithData.add(cur);
      } else if (a === 'request') carried = alive.has('cookie') ? ['cookie'] : [];
      else if (a === 'new tab') {
        tabs.push(next);
        cur = next++;
      } else if (a === 'close tab') {
        tabsWithData.delete(cur);
        tabs = tabs.filter((t) => t !== cur);
        if (!tabs.length) tabs.push(next++);
        cur = tabs[0];
      } else if (a === 'restart browser') {
        tabsWithData.clear();
        tabs = [next];
        cur = next++;
      } else if (a === 'wait 8 days') alive = new Set([...alive].filter((x) => x !== 'cookie'));
    }
    const present = ['cookie', 'localStorage', 'sessionStorage', 'indexedDB'].filter((x) => (x === 'sessionStorage' ? tabsWithData.has(cur) : alive.has(x)));
    return { present, carried };
  },
};

const COOKIE_FN = (pathCheck: string): string => `function cookieHeader(jar, url, now, ctx) {
  const u = new URL(url);
  const matches = jar.filter((c) => {
    if (c.expires !== null && c.expires <= now) return false;
    const domainOk = c.hostOnly
      ? u.hostname === c.domain
      : u.hostname === c.domain || u.hostname.endsWith('.' + c.domain);
    if (!domainOk) return false;
    const pathOk = ${pathCheck};
    if (!pathOk) return false;
    if (c.secure && u.protocol !== 'https:') return false;
    const mode = c.sameSite || 'Lax';
    if (ctx.crossSite && mode !== 'None') {
      if (mode === 'Strict') return false;
      if (!(ctx.topLevelNav && (ctx.method === 'GET' || ctx.method === 'HEAD'))) return false;
    }
    return true;
  });
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches.map((c) => c.name + '=' + c.value).join('; ');
}`;

const GOOD_PATH = "u.pathname === c.path || u.pathname.startsWith(c.path.endsWith('/') ? c.path : c.path + '/')";

const ck = (name: string, value: string, o: Record<string, unknown> = {}): Record<string, unknown> => ({ name, value, domain: 'shop.example', hostOnly: true, path: '/', secure: false, httpOnly: false, sameSite: 'Lax', expires: null, ...o });
const JAR = [
  ck('sid', '1', { secure: true, httpOnly: true }),
  ck('theme', 'dark', { domain: 'example', hostOnly: false, sameSite: undefined, expires: 5000 }),
  ck('cart', '9', { path: '/cart', sameSite: 'Strict' }),
];
const SAME = { crossSite: false, topLevelNav: false, method: 'GET' };

const STORE_HARNESS = `
function runStorage(factory, limit, ops) {
  const s = factory(limit);
  const out = [];
  for (const op of ops) {
    if (op[0] === 'set') {
      try {
        s.setItem(op[1], op[2]);
        out.push('ok');
      } catch (e) {
        out.push(e.name);
      }
    } else if (op[0] === 'get') out.push(s.getItem(op[1]));
    else if (op[0] === 'remove') {
      s.removeItem(op[1]);
      out.push('ok');
    } else if (op[0] === 'key') out.push(s.key(op[1]));
    else if (op[0] === 'length') out.push(s.length);
    else {
      s.clear();
      out.push('ok');
    }
  }
  return out;
}
`;

const unit: Unit = {
  id: 'web-storage',
  hook: '"Cookies vs localStorage vs sessionStorage" is a classic front-end screen. The strong answer is a table of scope, lifetime, size and whether the server sees it, plus when each one is the right (or dangerous) place for a token.',
  predict: {
    prompt: 'You store `theme=dark` with localStorage.setItem and call fetch("/api/me") on the same origin. What does the server receive about the theme?',
    options: ['A Cookie header containing theme=dark', 'Nothing: localStorage is never attached to requests', 'An X-Storage header added by the browser', 'It depends on the HTTP method'],
    answer: 1,
    explain: 'Only cookies are added to requests automatically. localStorage, sessionStorage and IndexedDB are readable by JavaScript on the page and are never sent unless your code puts the value into a header or body.',
  },
  simulationNote: 'Limits and lifetimes are typical browser values. Exact quotas differ between browsers and privacy modes.',
  viz,
  deeper: {
    points: [
      'Cookies are sent to the server with every matching request (domain, path, Secure and SameSite rules decide which). Size is about 4 KB each, so keep them small.',
      'localStorage is per origin, synchronous, string-only, ~5 MB, and persists until cleared. sessionStorage is the same API but isolated per tab and gone when the tab closes.',
      'IndexedDB is asynchronous, stores structured data and blobs, and has much larger quotas: the choice for offline apps and big caches.',
      'Cookie flags: HttpOnly hides it from JavaScript (limits XSS damage), Secure keeps it to HTTPS, SameSite limits cross-site sending (CSRF), Max-Age/Expires decide persistence.',
      'Anything readable by JavaScript can be stolen by an XSS attack. Never keep long-lived secrets in localStorage if an HttpOnly cookie will do.',
      'None of these are private from the user, and none are a database: treat them as caches that can be evicted.',
    ],
    pitfalls: ['Storing sensitive tokens in localStorage', 'Assuming sessionStorage is shared between tabs', 'Setting a cookie without Secure/SameSite and being surprised by cross-site behaviour', 'Putting large JSON in cookies (every request pays for it)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'cookieHeader',
    statement: 'Write `cookieHeader(jar, url, now, ctx)` returning the `Cookie` header value for a request. A cookie is sent when: not expired (`expires` is null or greater than `now`); domain matches (`hostOnly` needs equality, otherwise equality or a subdomain); the URL path equals the cookie path or sits below it (`/app` matches `/app/x`, not `/apple`); `secure` cookies only on https; and SameSite allows it. For a cross-site request (`ctx.crossSite`): `Strict` never, `Lax` (the default) only for a top-level navigation with GET or HEAD, `None` always. Order by longer path first (stable), format `name=value; name=value`, empty string if none.',
    signature: 'function cookieHeader(jar, url, now, ctx) {',
    solution: COOKIE_FN(GOOD_PATH)
      .replace('c.expires <= now', '@@c.expires <= now@@')
      .replace("u.hostname.endsWith('.' + c.domain)", "@@u.hostname.endsWith('.' + c.domain)@@")
      .replace("c.path + '/')", "@@c.path + '/'@@)")
      .replace("mode === 'Strict'", "@@mode === 'Strict'@@")
      .replace('b.path.length - a.path.length', '@@b.path.length - a.path.length@@'),
    tests: [
      { args: [JAR, 'https://shop.example/cart/items', 1000, SAME], expected: 'cart=9; sid=1; theme=dark', name: 'longest path first' },
      { args: [JAR, 'http://shop.example/', 1000, SAME], expected: 'theme=dark', name: 'Secure cookie stays off http' },
      { args: [JAR, 'https://shop.example/', 6000, SAME], expected: 'sid=1', name: 'expired cookie dropped' },
      { args: [JAR, 'https://www.example/', 1000, SAME], expected: 'theme=dark', name: 'domain cookie reaches subdomains' },
      { args: [JAR, 'https://shop.example/cart', 1000, { crossSite: true, topLevelNav: false, method: 'POST' }], expected: '', name: 'cross-site POST carries nothing' },
      { args: [JAR, 'https://shop.example/cart', 1000, { crossSite: true, topLevelNav: true, method: 'GET' }], expected: 'sid=1; theme=dark', name: 'cross-site link click: Lax yes, Strict no' },
      { args: [[ck('a', '1', { path: '/app' })], 'https://shop.example/apple', 0, SAME], expected: '', name: '/app does not match /apple' },
      { args: [[ck('a', '1', { path: '/app' })], 'https://shop.example/app/x', 0, SAME], expected: 'a=1', name: '/app matches /app/x' },
      { args: [[ck('t', 'x', { sameSite: 'None', secure: true })], 'https://shop.example/', 0, { crossSite: true, topLevelNav: false, method: 'POST' }], expected: 't=x', name: 'SameSite=None goes everywhere' },
      { args: [[ck('d', '1', { domain: 'example', hostOnly: false })], 'https://badexample/', 0, SAME], expected: '', name: 'suffix without a dot is not a subdomain' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'cookieHeader',
    statement: 'A cookie for path `/app` is also being sent to `/apple` and `/application`. Fix the path check.',
    buggy: COOKIE_FN('u.pathname.startsWith(c.path)'),
    fixed: COOKIE_FN(GOOD_PATH),
    tests: [
      { args: [[ck('a', '1', { path: '/app' })], 'https://shop.example/apple', 0, SAME], expected: '', name: '/apple is another path' },
      { args: [[ck('a', '1', { path: '/app' })], 'https://shop.example/app/x', 0, SAME], expected: 'a=1', name: 'below the path' },
      { args: [[ck('a', '1', { path: '/app' })], 'https://shop.example/app', 0, SAME], expected: 'a=1', name: 'exactly the path' },
      { args: [JAR, 'https://shop.example/cart/items', 1000, SAME], expected: 'cart=9; sid=1; theme=dark', name: 'root cookies still match' },
    ],
    bugType: 'string prefix is not a path prefix',
    hint: 'Does "/apple" start with "/app"? What should come right after the cookie path?',
    explanation: 'Plain startsWith treats "/application" as inside "/app". A path matches only when it is equal or continues at a "/" boundary, so compare with the path plus a trailing slash.',
  },
  boss: {
    title: 'Build localStorage',
    statement: 'Write `createStorage(limit)` returning an object with `setItem(key, value)`, `getItem(key)`, `removeItem(key)`, `key(index)`, `clear()` and a `length` getter. Values are converted to strings (`setItem("n", 5)` stores `"5"`). `getItem` of a missing key is `null`; `key(i)` is the i-th key in first-insertion order or `null`. The size of the store is the sum of `key.length + value.length` over all entries. If a `setItem` would push the size above `limit`, throw an Error whose `name` is `"QuotaExceededError"` and leave the store unchanged. Overwriting a key keeps its position.',
    language: 'javascript',
    fnName: 'createStorage',
    harness: STORE_HARNESS,
    adapter: 'runStorage',
    starter: `function createStorage(limit) {
  // your code here
}
`,
    solution: `function createStorage(limit) {
  const data = new Map();
  const size = () => {
    let total = 0;
    for (const [k, v] of data) total += k.length + v.length;
    return total;
  };
  return {
    setItem(key, value) {
      key = String(key);
      value = String(value);
      const before = data.get(key);
      const next = size() - (before === undefined ? 0 : key.length + before.length) + key.length + value.length;
      if (next > limit) {
        const err = new Error('Storage quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      data.set(key, value);
    },
    getItem(key) {
      key = String(key);
      return data.has(key) ? data.get(key) : null;
    },
    removeItem(key) {
      data.delete(String(key));
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    clear() {
      data.clear();
    },
    get length() {
      return data.size;
    },
  };
}`,
    tests: [
      { args: [100, [['set', 'a', '1'], ['get', 'a'], ['get', 'zzz'], ['length']]], expected: ['ok', '1', null, 1], name: 'basic set and get' },
      { args: [100, [['set', 'n', 5], ['get', 'n']]], expected: ['ok', '5'], name: 'values become strings' },
      { args: [10, [['set', 'ab', '123456'], ['set', 'c', '12345'], ['get', 'c'], ['length']]], expected: ['ok', 'QuotaExceededError', null, 1], name: 'quota blocks the write, store unchanged' },
      { args: [10, [['set', 'ab', '123456'], ['set', 'ab', '12345678'], ['get', 'ab']]], expected: ['ok', 'ok', '12345678'], name: 'overwrite only counts the difference' },
      { args: [10, [['set', 'ab', '12345678'], ['set', 'ab', '123456789'], ['get', 'ab']]], expected: ['ok', 'QuotaExceededError', '12345678'], name: 'failed overwrite keeps the old value' },
      { args: [100, [['set', 'x', '1'], ['set', 'y', '2'], ['set', 'x', '3'], ['key', 0], ['key', 1], ['key', 2]]], expected: ['ok', 'ok', 'ok', 'x', 'y', null], name: 'key order is first insertion' },
      { args: [100, [['set', 'x', '1'], ['remove', 'x'], ['length'], ['set', 'a', '1'], ['clear'], ['length']]], expected: ['ok', 'ok', 0, 'ok', 'ok', 0], name: 'remove and clear' },
      { args: [3, [['set', 'ab', '1'], ['remove', 'ab'], ['set', 'cd', '9']]], expected: ['ok', 'ok', 'ok'], name: 'removing frees space' },
    ],
    hints: ['Use a Map so insertion order and lookup come for free. Compute the size on demand as the sum of key.length + value.length.', 'In setItem, first compute the size AFTER the write (subtract the old entry if the key exists, add the new one). Throw before touching the Map if it is over the limit; set err.name = "QuotaExceededError".'],
    combines: ['js-closures'],
  },
  quiz: [
    {
      prompt: 'Which flag stops JavaScript on the page from reading a cookie?',
      options: ['Secure', 'SameSite=Strict', 'HttpOnly', 'Path=/'],
      answer: 2,
      explain: 'HttpOnly hides the cookie from document.cookie, which limits what an XSS attack can steal. Secure only restricts it to HTTPS and SameSite controls cross-site sending.',
    },
  ],
};

export default unit;
