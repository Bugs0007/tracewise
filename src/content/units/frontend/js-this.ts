import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { sourcePanel } from '@/content/lib/frontend-js';

const code = `
function resolveThis(call, strict) {
  if (call.fn.isArrow) return call.fn.lexicalThis;          //@arrow
  if (call.isNew) return Object.create(call.fn.prototype);  //@new
  if (call.fn.boundThis) return call.fn.boundThis;          //@bound
  if (call.thisArg) return call.thisArg;                    //@explicit
  if (call.receiver) return call.receiver;                  //@method
  return strict ? undefined : globalThis;                   //@plain
}
`;

type Who = 'user' | 'other' | 'global';

interface Spec {
  src: string[];
  callLine: number;
  arrow?: boolean;
  lexical?: Who;
  isNew?: boolean;
  bound?: Who;
  explicit?: Who;
  receiver?: Who;
  reads: boolean;
}

const OBJ: Record<Who, { label: string; name: string | undefined }> = {
  user: { label: 'user', name: 'Ada' },
  other: { label: 'other', name: 'Grace' },
  global: { label: 'globalThis', name: undefined },
};

const GREET = 'const user = { name: "Ada", greet() { return this.name; } };';
const SPECS: Record<string, Spec> = {
  'method call': { src: [GREET, 'user.greet();'], callLine: 1, receiver: 'user', reads: true },
  'extracted method': { src: [GREET, 'const g = user.greet;', 'g();'], callLine: 2, reads: true },
  'setTimeout callback': { src: [GREET, 'setTimeout(user.greet, 0);'], callLine: 1, reads: true },
  'call / apply': { src: [GREET, 'const other = { name: "Grace" };', 'user.greet.call(other);'], callLine: 2, explicit: 'other', receiver: 'user', reads: true },
  bind: { src: [GREET, 'const other = { name: "Grace" };', 'const b = user.greet.bind(other);', 'b.call(user);'], callLine: 3, bound: 'other', explicit: 'user', reads: true },
  'arrow inside method': { src: ['const user = { name: "Ada", later() { return () => this.name; } };', 'user.later()();'], callLine: 1, arrow: true, lexical: 'user', reads: true },
  'arrow as method': { src: ['const user = { name: "Ada", greet: () => this.name };', 'user.greet();'], callLine: 1, arrow: true, lexical: 'global', receiver: 'user', reads: true },
  new: { src: ['function Person(n) { this.name = n; }', 'new Person("Zed");'], callLine: 1, isNew: true, reads: true },
};
const NAMES = Object.keys(SPECS);

interface In {
  scenario: string;
  mode: 'sloppy' | 'strict';
}

const RULES: { anchor: string; text: string }[] = [
  { anchor: 'arrow', text: '1. Arrow function? Use the this of the enclosing scope' },
  { anchor: 'new', text: '2. Called with new? A brand-new object' },
  { anchor: 'bound', text: '3. Made by bind? The bound object (call cannot change it)' },
  { anchor: 'explicit', text: '4. Called with call / apply? The first argument' },
  { anchor: 'method', text: '5. Called as obj.method()? The object left of the dot' },
  { anchor: 'plain', text: '6. Otherwise: undefined (strict) or globalThis (sloppy)' },
];

const TYPE_ERR = "TypeError: Cannot read properties of undefined (reading 'name')";

const viz: VizDef<In> = {
  id: 'js-this',
  title: 'How `this` gets bound',
  code,
  language: 'javascript',
  inputs: [
    { key: 'scenario', label: 'Call site', kind: 'select', default: 'method call', options: NAMES },
    { key: 'mode', label: 'Mode', kind: 'select', default: 'sloppy', options: ['sloppy', 'strict'] },
  ],
  presets: [
    { label: 'Method call', input: { scenario: 'method call', mode: 'sloppy' } },
    { label: 'Lost this (strict)', input: { scenario: 'extracted method', mode: 'strict' } },
    { label: 'bind beats call', input: { scenario: 'bind', mode: 'sloppy' } },
    { label: 'Arrow in method', input: { scenario: 'arrow inside method', mode: 'sloppy' } },
    { label: 'new', input: { scenario: 'new', mode: 'sloppy' } },
  ],
  run({ scenario, mode }) {
    const spec = SPECS[scenario];
    if (!spec) throw new Error(`Pick one of: ${NAMES.join(', ')}`);
    const strict = mode === 'strict';
    const r = new Recorder(code);
    let matched = -1;
    let thisLabel = '';
    let name: string | undefined;
    const rulePanel = (upTo: number, hit: number) => ({
      type: 'list' as const,
      title: 'Binding rules, checked in order',
      orientation: 'vertical' as const,
      items: RULES.map((rule, i) => ({ id: rule.anchor, label: rule.text, tone: (i === hit ? 'found' : i < upTo ? 'muted' : i === upTo ? 'compare' : 'default') as Tone })),
    });
    const thisPanel = (shown: boolean) => ({
      type: 'kv' as const,
      title: 'Result',
      entries: shown
        ? [
            { k: 'this', v: thisLabel, tone: 'found' as Tone },
            { k: 'this.name', v: thisLabel === 'undefined' ? 'TypeError' : name === undefined ? 'undefined' : name, tone: (thisLabel === 'undefined' ? 'error' : 'default') as Tone },
          ]
        : [{ k: 'this', v: '?', tone: 'compare' as Tone }],
    });
    const callText = spec.src[spec.callLine];
    r.step('arrow', `Call site: ${callText} Which object is this?`, [sourcePanel(spec.src, spec.callLine), rulePanel(0, -1), thisPanel(false)], { mode });
    const checks = [!!spec.arrow, !!spec.isNew, !!spec.bound, !!spec.explicit, !!spec.receiver && !spec.arrow, true];
    for (let i = 0; i < RULES.length; i++) {
      if (checks[i] && matched < 0) matched = i;
      if (matched >= 0) break;
    }
    for (let i = 0; i <= matched; i++) {
      const yes = i === matched;
      if (yes) {
        if (i === 0) thisLabel = OBJ[spec.lexical!].label;
        else if (i === 1) thisLabel = 'new Person';
        else if (i === 2) thisLabel = OBJ[spec.bound!].label;
        else if (i === 3) thisLabel = OBJ[spec.explicit!].label;
        else if (i === 4) thisLabel = OBJ[spec.receiver!].label;
        else thisLabel = strict ? 'undefined' : 'globalThis';
        name = i === 1 ? 'Zed' : i === 0 ? OBJ[spec.lexical!].name : i === 2 ? OBJ[spec.bound!].name : i === 3 ? OBJ[spec.explicit!].name : i === 4 ? OBJ[spec.receiver!].name : strict ? undefined : OBJ.global.name;
      }
      const base = RULES[i].text.slice(3);
      r.step(RULES[i].anchor, yes ? `Rule matches: this = ${thisLabel}` : `${base.split('?')[0]}? No, keep looking`, [sourcePanel(spec.src, spec.callLine), rulePanel(i, yes ? i : -1), thisPanel(yes)], { mode, this: yes ? thisLabel : '?' });
    }
    const out = thisLabel === 'undefined' ? TYPE_ERR : name === undefined ? 'undefined' : name;
    r.step(RULES[matched].anchor, thisLabel === 'undefined' ? 'Reading this.name throws: this is undefined' : `this.name is ${out}`, [sourcePanel(spec.src, spec.callLine), rulePanel(matched, matched), thisPanel(true)], { mode, 'this.name': thisLabel === 'undefined' ? 'TypeError' : out });
    return { frames: r.frames, result: [thisLabel, out] };
  },
  reference({ scenario, mode }) {
    const strict = mode === 'strict';
    const table: Record<string, [string, string]> = {
      'method call': ['user', 'Ada'],
      'extracted method': strict ? ['undefined', TYPE_ERR] : ['globalThis', 'undefined'],
      'setTimeout callback': strict ? ['undefined', TYPE_ERR] : ['globalThis', 'undefined'],
      'call / apply': ['other', 'Grace'],
      bind: ['other', 'Grace'],
      'arrow inside method': ['user', 'Ada'],
      'arrow as method': ['globalThis', 'undefined'],
      new: ['new Person', 'Zed'],
    };
    return table[scenario];
  },
};

const unit: Unit = {
  id: 'js-this',
  hook: '`this` is decided by HOW a function is called, not where it is written. Losing it in a callback is one of the most common real-world JavaScript bugs and a favourite interview probe.',
  predict: {
    prompt: 'What does this print (non-strict script)?',
    code: `const user = {
  name: 'Ada',
  greet() { return this.name; },
};
const greet = user.greet;
console.log(user.greet(), greet());`,
    codeLang: 'javascript',
    options: ["'Ada' undefined", "'Ada' 'Ada'", "undefined undefined", "'Ada' then a TypeError"],
    answer: 0,
    explain: "`user.greet()` has a receiver (user) so this = user. `greet()` is a plain call: this is globalThis (sloppy mode), which has no `name` here, so undefined. In strict mode the second call would throw a TypeError instead.",
  },
  viz,
  deeper: {
    points: [
      'Look at the call site, not the definition: `obj.fn()` binds obj, `fn()` binds nothing (undefined in strict mode, globalThis in sloppy).',
      '`fn.call(a, x)` / `fn.apply(a, [x])` call immediately with this = a; `fn.bind(a)` returns a new function with this fixed forever.',
      'Arrow functions have no `this` of their own: they use the enclosing scope\'s, which is why they fix callbacks inside methods. They also ignore call/apply/bind.',
      '`new F()` creates an object inheriting from F.prototype and binds it as this; returning a different object from F replaces the result.',
      'Class methods are not auto-bound: passing `obj.method` as a callback loses this just like an object method does.',
    ],
    pitfalls: ['Passing `obj.method` to setTimeout / addEventListener / array callbacks', 'Using an arrow function as an object method and expecting this to be the object', 'Using `function` callbacks inside methods (own this) instead of arrows'],
  },
  practice: {
    language: 'javascript',
    fnName: 'myBind',
    statement: 'Implement `myBind(fn, ctx, ...preset)`: return a function that calls `fn` with this = ctx and the preset arguments first, then its own arguments. The bound this must not be overridable by call().',
    signature: 'function myBind(fn, ctx, ...preset) {',
    solution: `function myBind(fn, ctx, ...preset) {
  return function (@@...rest@@) {
    return fn.@@apply@@(@@ctx@@, [...preset, ...rest]);
  };
}`,
    harness: `function runBind(myBind, name, preset, rest) {
  function greet(greeting, punct) { return greeting + ', ' + this.name + punct; }
  const bound = myBind.apply(null, [greet, { name: name }].concat(preset));
  return [bound.apply(null, rest), bound.apply({ name: 'Intruder' }, rest)];
}`,
    adapter: 'runBind',
    tests: [
      { args: ['Ada', ['Hi'], ['!']], expected: ['Hi, Ada!', 'Hi, Ada!'], name: 'preset first arg' },
      { args: ['Bo', [], ['Hey', '?']], expected: ['Hey, Bo?', 'Hey, Bo?'], name: 'no preset' },
      { args: ['Cy', ['Yo', '.'], []], expected: ['Yo, Cy.', 'Yo, Cy.'], name: 'all args preset' },
      { args: ['Di', ['A'], ['B']], expected: ['A, DiB', 'A, DiB'], name: 'preset + call args in order' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'makeCart',
    statement: '`cart.addAll(prices)` should add every price to `cart.total` and return the total. It returns 0 (or throws).',
    buggy: `function makeCart() {
  return {
    total: 0,
    addAll(prices) {
      prices.forEach(function (p) {
        this.total += p;
      });
      return this.total;
    },
  };
}`,
    fixed: `function makeCart() {
  return {
    total: 0,
    addAll(prices) {
      prices.forEach((p) => {
        this.total += p;
      });
      return this.total;
    },
  };
}`,
    harness: `function addAll(makeCart, prices) {
  const cart = makeCart();
  return cart.addAll(prices);
}`,
    adapter: 'addAll',
    tests: [
      { args: [[1, 2, 3]], expected: 6 },
      { args: [[5]], expected: 5 },
      { args: [[10, 20]], expected: 30 },
      { args: [[]], expected: 0 },
    ],
    bugType: 'lost this in a callback',
    hint: 'A `function` callback passed to forEach gets its own this. Which object is it when forEach calls it?',
    explanation: 'forEach calls the callback as a plain function, so inside it this is globalThis (or undefined in strict mode), not the cart. An arrow function has no this of its own and uses addAll\'s, which is the cart.',
  },
  boss: {
    title: 'EventEmitter',
    language: 'javascript',
    fnName: 'EventEmitter',
    statement:
      'Implement `class EventEmitter` with `on(event, fn, ctx?)`, `once(event, fn, ctx?)`, `off(event, fn)` (all return `this` so calls chain) and `emit(event, ...args)`. Listeners run in registration order with `this` = ctx if given, else the emitter. `once` listeners run only once. `emit` returns true if at least one listener ran.',
    starter: `class EventEmitter {
  // your code here
}
`,
    solution: `class EventEmitter {
  constructor() {
    this.handlers = {};
  }
  on(event, fn, ctx) {
    (this.handlers[event] = this.handlers[event] || []).push({ fn, ctx, once: false });
    return this;
  }
  once(event, fn, ctx) {
    this.on(event, fn, ctx);
    const list = this.handlers[event];
    list[list.length - 1].once = true;
    return this;
  }
  off(event, fn) {
    this.handlers[event] = (this.handlers[event] || []).filter((h) => h.fn !== fn);
    return this;
  }
  emit(event, ...args) {
    const list = (this.handlers[event] || []).slice();
    this.handlers[event] = (this.handlers[event] || []).filter((h) => !h.once);
    list.forEach((h) => h.fn.apply(h.ctx || this, args));
    return list.length > 0;
  }
}`,
    harness: `function runEmitter(Emitter, ops) {
  const em = new Emitter();
  const log = [];
  const ctxs = { A: { tag: 'A' }, B: { tag: 'B' } };
  const fns = {};
  const get = function (name) {
    if (!fns[name]) {
      fns[name] = function () {
        const who = this === em ? 'emitter' : this && this.tag ? this.tag : 'other';
        log.push([name, who].concat(Array.prototype.slice.call(arguments)));
      };
    }
    return fns[name];
  };
  const results = [];
  ops.forEach(function (op) {
    const kind = op[0];
    if (kind === 'on') results.push(em.on(op[1], get(op[2]), ctxs[op[3]]) === em);
    else if (kind === 'once') results.push(em.once(op[1], get(op[2]), ctxs[op[3]]) === em);
    else if (kind === 'off') results.push(em.off(op[1], get(op[2])) === em);
    else results.push(em.emit.apply(em, op.slice(1)));
  });
  return { log: log, results: results };
}`,
    adapter: 'runEmitter',
    tests: [
      { args: [[['on', 'hi', 'L1'], ['emit', 'hi', 1, 2]]], expected: { log: [['L1', 'emitter', 1, 2]], results: [true, true] }, name: 'this defaults to the emitter' },
      { args: [[['on', 'x', 'L1', 'A'], ['emit', 'x']]], expected: { log: [['L1', 'A']], results: [true, true] }, name: 'custom context' },
      { args: [[['once', 'x', 'L1'], ['emit', 'x', 'a'], ['emit', 'x', 'b']]], expected: { log: [['L1', 'emitter', 'a']], results: [true, true, false] }, name: 'once' },
      { args: [[['on', 'x', 'L1'], ['on', 'x', 'L2'], ['off', 'x', 'L1'], ['emit', 'x']]], expected: { log: [['L2', 'emitter']], results: [true, true, true, true] }, name: 'off removes one listener' },
      { args: [[['emit', 'nothing']]], expected: { log: [], results: [false] }, name: 'no listeners' },
      { args: [[['on', 'x', 'L1'], ['on', 'x', 'L2', 'B'], ['emit', 'x', 9]]], expected: { log: [['L1', 'emitter', 9], ['L2', 'B', 9]], results: [true, true, true] }, name: 'registration order' },
    ],
    hints: ['Store listeners per event as objects { fn, ctx, once }. Every mutator returns `this`.', 'In emit, copy the list first, drop the once-listeners from the stored list, then call each with `h.fn.apply(h.ctx || this, args)`.'],
    combines: ['js-closures'],
  },
};

export default unit;
