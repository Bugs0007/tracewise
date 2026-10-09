import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function getProp(obj, key) {
  let o = obj;                                    //@start
  while (o !== null) {                            //@loop
    if (Object.hasOwn(o, key)) return o[key];     //@found
    o = Object.getPrototypeOf(o);                 //@up
  }
  return undefined;                               //@miss
}
`;

interface Link {
  name: string;
  props: string[];
}

interface In {
  chain: Link[];
  prop: string;
}

const CHAIN: Link[] = [
  { name: 'rex', props: ['name'] },
  { name: 'Dog.prototype', props: ['constructor', 'bark'] },
  { name: 'Animal.prototype', props: ['constructor', 'speak', 'eat'] },
  { name: 'Object.prototype', props: ['toString', 'hasOwnProperty'] },
];

const viz: VizDef<In> = {
  id: 'js-prototypes',
  title: 'Prototype chain lookup',
  code,
  language: 'javascript',
  inputs: [
    { key: 'chain', label: 'Chain, object first (JSON)', kind: 'json', default: CHAIN, help: 'Array of {"name": "...", "props": ["..."]} from the object up to the last prototype' },
    { key: 'prop', label: 'Property to read', kind: 'string', default: 'speak', maxItems: 20 },
  ],
  presets: [
    { label: 'Inherited method', input: { prop: 'speak' } },
    { label: 'Own property', input: { prop: 'name' } },
    { label: 'From Object.prototype', input: { prop: 'toString' } },
    { label: 'Missing', input: { prop: 'fly' } },
    {
      label: 'Shadowed',
      input: {
        prop: 'speak',
        chain: [
          { name: 'rex', props: ['name'] },
          { name: 'Dog.prototype', props: ['constructor', 'speak'] },
          { name: 'Animal.prototype', props: ['constructor', 'speak'] },
          { name: 'Object.prototype', props: ['toString'] },
        ],
      },
    },
  ],
  run({ chain, prop }) {
    if (!Array.isArray(chain) || chain.length < 1 || chain.length > 6) throw new Error('The chain needs 1 to 6 objects');
    const names = new Set<string>();
    for (const c of chain) {
      if (!c || typeof c.name !== 'string' || !c.name || !Array.isArray(c.props)) throw new Error('Each link needs a name and a props array');
      if (names.has(c.name)) throw new Error(`Duplicate name "${c.name}"`);
      names.add(c.name);
    }
    if (!prop) throw new Error('Enter a property name');
    const r = new Recorder(code);
    const n = chain.length;
    const panels = (at: number, tones: Record<number, Tone>, edgeHot: number): Panel[] => {
      const nodes: GraphNode[] = chain.map((c, i) => ({ id: `o${i}`, label: c.name, x: 130, y: 30 + i * 66, shape: 'pill', w: Math.max(70, c.name.length * 8 + 20), tone: tones[i], tags: i === at ? ['o'] : undefined }));
      nodes.push({ id: 'end', label: 'null', x: 130, y: 30 + n * 66, shape: 'pill', w: 50, tone: at === n ? 'error' : 'muted', tags: at === n ? ['o'] : undefined });
      const edges: GraphEdge[] = chain.map((_, i) => ({ from: `o${i}`, to: i === n - 1 ? 'end' : `o${i + 1}`, directed: true, label: '[[Prototype]]', tone: i === edgeHot ? ('active' as Tone) : undefined }));
      return [
        { type: 'graph', title: 'Prototype chain', nodes, edges, directed: true, width: 260, height: 70 + n * 66 },
        { type: 'kv', title: `Own properties (looking for "${prop}")`, entries: chain.map((c, i) => ({ k: c.name, v: c.props.join(', ') || '(none)', tone: tones[i] })) },
      ];
    };
    const tones: Record<number, Tone> = {};
    r.step('start', `Start at ${chain[0].name}: o = ${chain[0].name}`, panels(0, {}, -1), { key: prop, o: chain[0].name });
    for (let i = 0; i < n; i++) {
      r.op();
      r.step('loop', `o is not null: check ${chain[i].name}`, panels(i, { ...tones, [i]: 'compare' }, -1), { key: prop, o: chain[i].name });
      if (chain[i].props.includes(prop)) {
        r.step('found', `${chain[i].name} owns "${prop}" after ${i} hop${i === 1 ? '' : 's'}: return it`, panels(i, { ...tones, [i]: 'found' }, -1), { key: prop, o: chain[i].name, hops: i });
        return { frames: r.frames, result: { owner: chain[i].name, hops: i } };
      }
      tones[i] = 'muted';
      r.step('up', `No own "${prop}": o = ${i === n - 1 ? 'null' : chain[i + 1].name}`, panels(i + 1, tones, i), { key: prop, o: i === n - 1 ? 'null' : chain[i + 1].name });
    }
    r.step('miss', `End of the chain (null): "${prop}" is undefined`, panels(n, tones, -1), { key: prop, o: 'null', result: 'undefined' });
    return { frames: r.frames, result: { owner: null, hops: n } };
  },
  reference({ chain, prop }) {
    const idx = chain.findIndex((c) => c.props.includes(prop));
    return idx < 0 ? { owner: null, hops: chain.length } : { owner: chain[idx].name, hops: idx };
  },
};

const unit: Unit = {
  id: 'js-prototypes',
  hook: 'Every property read in JavaScript is a walk up a chain of prototypes. Understanding it explains inheritance, `instanceof`, shared-state bugs and what `class` really is.',
  predict: {
    prompt: 'What does this print?',
    code: `function Animal() {}
Animal.prototype.legs = 4;
const dog = new Animal();
dog.legs = 2;
delete dog.legs;
console.log(dog.legs);`,
    codeLang: 'javascript',
    options: ['4', '2', 'undefined', '0'],
    answer: 0,
    explain: '`dog.legs = 2` creates an OWN property that shadows the prototype\'s. `delete` removes only the own property, so the next read walks up to Animal.prototype and finds 4.',
  },
  viz,
  deeper: {
    points: [
      'Reading `obj.x` checks obj, then obj\'s [[Prototype]], and so on up to null. The first object that owns `x` wins (shadowing).',
      'Writing `obj.x = v` creates or updates an OWN property on obj and never touches the prototype (unless a setter exists).',
      '`new F()` makes an object whose [[Prototype]] is `F.prototype`. `class` is syntax over exactly this: methods live on the prototype, fields live on each instance.',
      '`Object.create(p)` makes an object with prototype p; `Object.getPrototypeOf(o)` reads it. Avoid `__proto__` in new code.',
      '`a instanceof F` asks "is F.prototype somewhere in a\'s chain?". `hasOwnProperty` / `Object.hasOwn` ignore the chain.',
    ],
    pitfalls: ['Putting arrays/objects on a prototype: every instance shares and mutates the same one', 'Using `for...in` and picking up inherited properties', 'Mutating built-in prototypes (Array.prototype, Object.prototype) in application code'],
  },
  practice: {
    language: 'javascript',
    fnName: 'protoDepth',
    statement: 'Return how many [[Prototype]] hops it takes to reach the object that OWNS `key` (0 means `obj` itself), or -1 if nothing in the chain owns it.',
    signature: 'function protoDepth(obj, key) {',
    solution: `function protoDepth(obj, key) {
  let depth = 0;
  let cur = obj;
  while (cur !== @@null@@) {
    if (Object.prototype.hasOwnProperty.call(cur, key)) return depth;
    cur = @@Object.getPrototypeOf(cur)@@;
    @@depth++@@;
  }
  return @@-1@@;
}`,
    harness: `function runDepth(fn, chain, key) {
  let proto = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const o = Object.create(proto);
    chain[i].forEach(function (k) { o[k] = i; });
    proto = o;
  }
  return fn(proto, key);
}`,
    adapter: 'runDepth',
    tests: [
      { args: [[['a'], ['b'], ['c']], 'a'], expected: 0, name: 'own property' },
      { args: [[['a'], ['b'], ['c']], 'c'], expected: 2, name: 'two hops up' },
      { args: [[['x'], ['x'], ['x']], 'x'], expected: 0, name: 'shadowing: nearest wins' },
      { args: [[['a'], ['b']], 'zzz'], expected: -1, name: 'missing' },
      { args: [[['a'], [], ['b']], 'b'], expected: 2, name: 'empty link in the chain' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'Cart',
    statement: 'Two carts should have independent items. After `a.add(...)` calls on one cart, the other cart\'s items must not change. Right now they share items.',
    buggy: `function Cart() {}
Cart.prototype.items = [];
Cart.prototype.add = function (item) {
  this.items.push(item);
  return this.items.length;
};`,
    fixed: `function Cart() {
  this.items = [];
}
Cart.prototype.add = function (item) {
  this.items.push(item);
  return this.items.length;
};`,
    harness: `function twoCarts(Cart, aItems, bItems) {
  const a = new Cart();
  const b = new Cart();
  aItems.forEach(function (x) { a.add(x); });
  bItems.forEach(function (x) { b.add(x); });
  return [a.items.length, b.items.length];
}`,
    adapter: 'twoCarts',
    tests: [
      { args: [['x', 'y'], ['z']], expected: [2, 1] },
      { args: [['x'], []], expected: [1, 0] },
      { args: [[], ['q', 'r', 's']], expected: [0, 3] },
    ],
    bugType: 'shared mutable state on the prototype',
    hint: 'Where does `this.items` come from when an instance has no own `items`? Who else sees that array?',
    explanation: 'The array lives on Cart.prototype, so every instance finds and mutates the same one (push never creates an own property). Create per-instance state in the constructor; keep only methods on the prototype.',
  },
  boss: {
    title: 'Build `new`',
    language: 'javascript',
    fnName: 'myNew',
    statement: 'Implement `myNew(Ctor, ...args)` without the `new` keyword: create an object inheriting from `Ctor.prototype`, run the constructor with that object as `this`, and return the object - unless the constructor itself returns an object (or function), which then wins.',
    starter: `function myNew(Ctor, ...args) {
  // your code here
}
`,
    solution: `function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype);
  const result = Ctor.apply(obj, args);
  const isObject = result !== null && (typeof result === 'object' || typeof result === 'function');
  return isObject ? result : obj;
}`,
    harness: `function Person(name, age) { this.name = name; this.age = age; }
Person.prototype.hello = function () { return 'hi ' + this.name; };
function Weird() { return { custom: true }; }
function Prim() { this.x = 1; return 5; }
function runNew(myNew, kind, args) {
  const C = { Person: Person, Weird: Weird, Prim: Prim }[kind];
  const o = myNew.apply(null, [C].concat(args));
  return { own: Object.keys(o), isInstance: o instanceof C, hello: typeof o.hello === 'function' ? o.hello() : null };
}`,
    adapter: 'runNew',
    tests: [
      { args: ['Person', ['Ada', 36]], expected: { own: ['name', 'age'], isInstance: true, hello: 'hi Ada' }, name: 'sets own props, inherits methods' },
      { args: ['Person', ['Bo', 1]], expected: { own: ['name', 'age'], isInstance: true, hello: 'hi Bo' }, name: 'another instance' },
      { args: ['Weird', []], expected: { own: ['custom'], isInstance: false, hello: null }, name: 'constructor returns an object' },
      { args: ['Prim', []], expected: { own: ['x'], isInstance: true, hello: null }, name: 'returned primitive is ignored' },
    ],
    hints: ['`Object.create(Ctor.prototype)` gives you an object with the right [[Prototype]]. Then call the constructor with it as this.', 'Use `Ctor.apply(obj, args)`. If the return value is an object or function, return it; otherwise return `obj`.'],
    combines: ['js-this'],
  },
  quiz: [
    {
      prompt: 'Where do methods defined in a `class` body live?',
      options: ['On the class\'s prototype, shared by all instances', 'As own properties on every instance', 'On Object.prototype', 'On the constructor function only'],
      answer: 0,
      explain: 'Class methods go on `Class.prototype`; only fields and assignments in the constructor are per instance.',
    },
  ],
};

export default unit;
