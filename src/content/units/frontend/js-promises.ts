import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function combine(mode, promises) {
  return new Promise((resolve, reject) => {
    const out = [];
    let pending = promises.length;
    promises.forEach((p, i) => {
      p.then(
        (v) => {                                                          //@ok
          if (mode === 'race' || mode === 'any') return resolve(v);       //@first
          out[i] = mode === 'all' ? v : { status: 'fulfilled', value: v };  //@store
          if (--pending === 0) resolve(out);                              //@done
        },
        (e) => {                                                          //@err
          if (mode === 'all' || mode === 'race') return reject(e);        //@fail
          out[i] = mode === 'any' ? e : { status: 'rejected', reason: e };  //@store2
          if (--pending === 0) mode === 'any' ? reject(out) : resolve(out);  //@done2
        }
      );
    });
  });
}
`;

type Mode = 'all' | 'allSettled' | 'race' | 'any';
const MODES: Mode[] = ['all', 'allSettled', 'race', 'any'];

interface Task {
  name: string;
  ms: number;
  ok: boolean;
}

interface In {
  mode: Mode;
  tasks: Task[];
}

interface Outcome {
  state: 'fulfilled' | 'rejected';
  value: unknown;
}

const TASKS: Task[] = [
  { name: 'A', ms: 30, ok: true },
  { name: 'B', ms: 10, ok: true },
  { name: 'C', ms: 20, ok: false },
];

const rej = (name: string) => `${name}!`;

const viz: VizDef<In> = {
  id: 'js-promises',
  title: 'Promise combinators on a timeline',
  code,
  language: 'javascript',
  inputs: [
    { key: 'mode', label: 'Combinator', kind: 'select', default: 'all', options: MODES },
    { key: 'tasks', label: 'Promises (JSON)', kind: 'json', default: TASKS, help: 'Each: {"name":"A","ms":30,"ok":true}. ok:false rejects with "A!"' },
  ],
  presets: [
    { label: 'Promise.all (one fails)', input: { mode: 'all' } },
    { label: 'Promise.allSettled', input: { mode: 'allSettled' } },
    { label: 'Promise.race', input: { mode: 'race' } },
    { label: 'Promise.any', input: { mode: 'any' } },
    { label: 'any: all reject', input: { mode: 'any', tasks: [{ name: 'A', ms: 15, ok: false }, { name: 'B', ms: 5, ok: false }] } },
    { label: 'all: all succeed', input: { mode: 'all', tasks: [{ name: 'A', ms: 30, ok: true }, { name: 'B', ms: 10, ok: true }, { name: 'C', ms: 20, ok: true }] } },
  ],
  run({ mode, tasks }) {
    if (!MODES.includes(mode)) throw new Error(`Pick one of ${MODES.join(', ')}`);
    if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 5) throw new Error('Use 1 to 5 promises');
    const seen = new Set<string>();
    for (const t of tasks) {
      if (!t || typeof t.name !== 'string' || !t.name || seen.has(t.name)) throw new Error('Each promise needs a unique name');
      if (!Number.isInteger(t.ms) || t.ms < 0 || t.ms > 200) throw new Error('ms must be a whole number from 0 to 200');
      seen.add(t.name);
    }
    const r = new Recorder(code);
    const order = tasks.map((t, i) => ({ ...t, i })).sort((a, b) => a.ms - b.ms || a.i - b.i);
    const tMax = Math.max(...tasks.map((t) => t.ms)) + 10;
    const out: unknown[] = [];
    let pending = tasks.length;
    let outcome: (Outcome & { at: number }) | null = null;
    let now = 0;
    const show = (v: unknown) => JSON.stringify(v);
    const timeline = (): Panel => ({
      type: 'timeline',
      title: `Promise.${mode}([${tasks.map((t) => t.name).join(', ')}])`,
      unit: 'ms',
      tMax,
      now,
      lanes: [
        ...tasks.map((t) => ({
          label: t.name,
          events: [
            { t: 0, dur: Math.min(t.ms, now), label: 'pending', tone: 'frontier' as Tone },
            ...(t.ms <= now ? [{ t: t.ms, label: t.ok ? 'fulfilled' : 'rejected', tone: (t.ok ? 'found' : 'error') as Tone }] : []),
          ],
        })),
        { label: 'result', events: outcome ? [{ t: outcome.at, label: outcome.state, tone: (outcome.state === 'fulfilled' ? 'done' : 'error') as Tone }] : [{ t: 0, dur: now, label: 'pending', tone: 'frontier' as Tone }] },
      ],
    });
    const state = (): Panel => ({
      type: 'kv',
      title: 'Inside the combinator',
      entries: [
        { k: 'out', v: show(Array.from(out, (x) => (x === undefined ? null : x))), tone: 'default' },
        { k: 'pending', v: pending },
        { k: 'combined promise', v: outcome ? `${outcome.state}: ${show(outcome.value)}` : 'pending', tone: outcome ? (outcome.state === 'fulfilled' ? 'found' : 'error') : 'compare' },
      ],
    });
    const step = (anchor: string | undefined, caption: string) => r.step(anchor, caption, [timeline(), state()], { time: `${now}ms`, pending });
    step(undefined, `Start ${tasks.length} promises at once; the earliest to settle is ${order[0].name} (${order[0].ms}ms)`);
    for (const t of order) {
      now = t.ms;
      const value = t.ok ? t.name : rej(t.name);
      if (outcome) {
        step(t.ok ? 'ok' : 'err', `${t.name} ${t.ok ? 'fulfills' : 'rejects'} at ${now}ms, but the result is already ${outcome.state}: ignored`);
        pending--;
        continue;
      }
      if (t.ok) {
        step('ok', `${t.name} fulfills at ${now}ms with "${value}"`);
        if (mode === 'race' || mode === 'any') {
          outcome = { state: 'fulfilled', value, at: now };
          step('first', `First ${mode === 'race' ? 'to settle' : 'to fulfill'} wins: result fulfilled with "${value}"`);
        } else {
          out[t.i] = mode === 'all' ? value : { status: 'fulfilled', value };
          pending--;
          step('store', `Store the value at index ${t.i} (order is by position, not by time)`);
          if (pending === 0) {
            outcome = { state: 'fulfilled', value: [...out], at: now };
            step('done', 'Nothing pending: resolve with the collected array');
          }
        }
      } else {
        step('err', `${t.name} rejects at ${now}ms with "${value}"`);
        if (mode === 'all' || mode === 'race') {
          outcome = { state: 'rejected', value, at: now };
          step('fail', `${mode === 'all' ? 'One rejection fails Promise.all' : 'First to settle wins'}: rejected with "${value}"`);
        } else {
          out[t.i] = mode === 'any' ? value : { status: 'rejected', reason: value };
          pending--;
          step('store2', mode === 'any' ? `Remember the reason at index ${t.i} and keep waiting for a success` : `allSettled records the rejection at index ${t.i} and keeps going`);
          if (pending === 0) {
            outcome = { state: mode === 'any' ? 'rejected' : 'fulfilled', value: [...out], at: now };
            step('done2', mode === 'any' ? 'Every promise rejected: reject with all reasons (AggregateError)' : 'Nothing pending: resolve with every result');
          }
        }
      }
    }
    return { frames: r.frames, result: { state: outcome!.state, value: outcome!.value } };
  },
  reference({ mode, tasks }) {
    const ev = tasks.map((t, i) => ({ ...t, i, v: t.ok ? t.name : rej(t.name) })).sort((a, b) => a.ms - b.ms || a.i - b.i);
    if (mode === 'race') return { state: ev[0].ok ? 'fulfilled' : 'rejected', value: ev[0].v };
    if (mode === 'allSettled') return { state: 'fulfilled', value: tasks.map((t) => (t.ok ? { status: 'fulfilled', value: t.name } : { status: 'rejected', reason: rej(t.name) })) };
    if (mode === 'all') {
      const bad = ev.find((e) => !e.ok);
      return bad ? { state: 'rejected', value: bad.v } : { state: 'fulfilled', value: tasks.map((t) => t.name) };
    }
    const good = ev.find((e) => e.ok);
    return good ? { state: 'fulfilled', value: good.v } : { state: 'rejected', value: tasks.map((t) => rej(t.name)) };
  },
};

const unit: Unit = {
  id: 'js-promises',
  hook: 'Promise ordering puzzles and the `all`/`allSettled`/`race`/`any` differences are staple async questions. They show whether you understand microtasks, not just the syntax.',
  predict: {
    prompt: 'What is logged, in order?',
    code: `async function a() {
  console.log('a1');
  await b();
  console.log('a2');
}
async function b() { console.log('b'); }
console.log('start');
a();
Promise.resolve().then(() => console.log('p'));
console.log('end');`,
    codeLang: 'javascript',
    options: ['start a1 b end a2 p', 'start a1 b a2 end p', 'start a1 b end p a2', 'start a1 end b a2 p'],
    answer: 0,
    explain: 'a() runs synchronously until its first await; b() logs synchronously, so we see start, a1, b. The awaited promise is already resolved, so a2 is queued as a microtask BEFORE the then callback p. After the sync `end`, microtasks run in queue order: a2, then p.',
  },
  viz,
  deeper: {
    points: [
      'A promise is pending, then fulfilled or rejected exactly once. `.then` callbacks always run as microtasks, never synchronously.',
      '`await x` is roughly `Promise.resolve(x).then(rest of the function)`: the code after it is a microtask, even if x is a plain value.',
      '`.then` returns a NEW promise: if the callback returns a value it fulfills that promise; if it returns nothing, the next link receives undefined (the classic missing `return`).',
      '`Promise.all` fails fast on the first rejection; `allSettled` never rejects; `race` copies the first settlement; `any` waits for the first fulfilment and only rejects (AggregateError) if all reject.',
      'Results from `all` / `allSettled` keep input order, regardless of which promise finishes first.',
    ],
    pitfalls: ['Forgetting `return` (or `await`) on an inner promise inside a then callback', 'Using await in a loop when the calls could run in parallel with Promise.all', 'An unhandled rejection in one branch of Promise.all that has already lost the race'],
  },
  practice: {
    language: 'javascript',
    fnName: 'settleAll',
    statement: 'Without using `Promise.allSettled`, return a promise for an array of `{ status: "fulfilled", value }` or `{ status: "rejected", reason }` objects, one per input, in input order.',
    signature: 'function settleAll(promises) {',
    solution: `function settleAll(promises) {
  return @@Promise.all@@(
    promises.map((p) =>
      Promise.resolve(p)@@.then@@(
        (value) => ({ status: '@@fulfilled@@', value }),
        (reason) => ({ status: '@@rejected@@', reason })
      )
    )
  );
}`,
    harness: `function runSettle(fn, specs) {
  const ps = specs.map(function (s) {
    const p = new Promise(function (resolve, reject) {
      setTimeout(function () { return s.ok ? resolve(s.v) : reject(s.v); }, s.ms);
    });
    p.catch(function () {});
    return p;
  });
  return fn(ps);
}`,
    adapter: 'runSettle',
    tests: [
      { args: [[{ ok: true, v: 1, ms: 5 }, { ok: false, v: 'boom', ms: 1 }]], expected: [{ status: 'fulfilled', value: 1 }, { status: 'rejected', reason: 'boom' }], name: 'mixed, input order kept' },
      { args: [[{ ok: true, v: 'a', ms: 3 }, { ok: true, v: 'b', ms: 1 }]], expected: [{ status: 'fulfilled', value: 'a' }, { status: 'fulfilled', value: 'b' }], name: 'all fulfilled' },
      { args: [[{ ok: false, v: 'x', ms: 2 }]], expected: [{ status: 'rejected', reason: 'x' }], name: 'single rejection does not reject the result' },
      { args: [[]], expected: [], name: 'empty input' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'loadUser',
    statement: '`loadUser(id)` should resolve to the user object with a `posts` array added. (`getUser(id)` and `getPosts(userId)` are provided and return promises.) It resolves to undefined.',
    buggy: `function loadUser(id) {
  return getUser(id).then((user) => {
    getPosts(user.id).then((posts) => ({ ...user, posts }));
  });
}`,
    fixed: `function loadUser(id) {
  return getUser(id).then((user) => {
    return getPosts(user.id).then((posts) => ({ ...user, posts }));
  });
}`,
    harness: `function getUser(id) { return Promise.resolve({ id: id, name: 'user' + id }); }
function getPosts(userId) {
  return new Promise(function (resolve) { setTimeout(function () { resolve(['p' + userId + 'a', 'p' + userId + 'b']); }, 2); });
}`,
    tests: [
      { args: [1], expected: { id: 1, name: 'user1', posts: ['p1a', 'p1b'] } },
      { args: [7], expected: { id: 7, name: 'user7', posts: ['p7a', 'p7b'] } },
      { args: [0], expected: { id: 0, name: 'user0', posts: ['p0a', 'p0b'] } },
    ],
    bugType: 'missing return in a then chain',
    hint: 'What does the outer `.then` callback return? And what does the resulting promise resolve to?',
    explanation: 'The callback started the inner promise but did not return it, so the outer promise fulfils immediately with undefined and does not wait for the posts. Returning (or awaiting) the inner promise chains them.',
  },
  boss: {
    title: 'Implement Promise.all',
    language: 'javascript',
    fnName: 'promiseAll',
    statement: 'Implement `promiseAll(promises)` without `Promise.all`: resolve with the values in input order once all fulfil (plain values allowed), reject with the first rejection reason, and resolve `[]` for empty input.',
    starter: `function promiseAll(promises) {
  // your code here
}
`,
    solution: `function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let remaining = promises.length;
    if (remaining === 0) return resolve(results);
    promises.forEach((p, i) => {
      Promise.resolve(p).then((value) => {
        results[i] = value;
        if (--remaining === 0) resolve(results);
      }, reject);
    });
  });
}`,
    harness: `function runAll(fn, specs) {
  const ps = specs.map(function (s) {
    if (s.ms === undefined) return s.v;
    const p = new Promise(function (resolve, reject) {
      setTimeout(function () { return s.ok === false ? reject(s.v) : resolve(s.v); }, s.ms);
    });
    p.catch(function () {});
    return p;
  });
  return fn(ps).then(
    function (v) { return { state: 'fulfilled', value: v }; },
    function (e) { return { state: 'rejected', reason: e }; }
  );
}`,
    adapter: 'runAll',
    tests: [
      { args: [[{ v: 1, ms: 20 }, { v: 2, ms: 5 }]], expected: { state: 'fulfilled', value: [1, 2] }, name: 'order by position, not by time' },
      { args: [[{ v: 1, ms: 10 }, { v: 'bad', ms: 5, ok: false }, { v: 3, ms: 1 }]], expected: { state: 'rejected', reason: 'bad' }, name: 'first rejection wins' },
      { args: [[{ v: 1 }, { v: 2, ms: 3 }]], expected: { state: 'fulfilled', value: [1, 2] }, name: 'plain values mixed with promises' },
      { args: [[]], expected: { state: 'fulfilled', value: [] }, name: 'empty input resolves []' },
      { args: [[{ v: 'x', ms: 1, ok: false }, { v: 'y', ms: 2, ok: false }]], expected: { state: 'rejected', reason: 'x' }, name: 'later rejections are ignored' },
    ],
    hints: ['Create the result with `new Promise`; keep an array of results and a counter of how many are still pending.', 'For each input use `Promise.resolve(p).then(...)`: write `results[i] = value` (index, not push), decrement the counter, resolve at 0. Pass `reject` as the second argument. Handle empty input up front.'],
    combines: ['js-event-loop', 'js-closures'],
  },
};

export default unit;
