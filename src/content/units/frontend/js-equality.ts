import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
function looseEquals(a, b) {
  if (type(a) === type(b)) return a === b;                        //@same
  if (isNullish(a) && isNullish(b)) return true;                  //@nullish
  if (isNullish(a) || isNullish(b)) return false;                 //@nullish2
  if (typeof a === 'boolean') return looseEquals(Number(a), b);   //@boolA
  if (typeof b === 'boolean') return looseEquals(a, Number(b));   //@boolB
  if (typeof a === 'object') return looseEquals(String(a), b);    //@objA
  if (typeof b === 'object') return looseEquals(a, String(b));    //@objB
  return Number(a) === Number(b);                                  //@num
}
`;

const RULES: { anchor: string; text: string }[] = [
  { anchor: 'same', text: 'Same type? Then it is just ===' },
  { anchor: 'nullish', text: 'Both null / undefined? Equal' },
  { anchor: 'nullish2', text: 'Only one is null / undefined? Not equal' },
  { anchor: 'boolA', text: 'Boolean on the left? Convert it to a number' },
  { anchor: 'boolB', text: 'Boolean on the right? Convert it to a number' },
  { anchor: 'objA', text: 'Object on the left? Convert it to a string' },
  { anchor: 'objB', text: 'Object on the right? Convert it to a string' },
  { anchor: 'num', text: 'Number vs string? Compare as numbers' },
];

 
const loose = (a: any, b: any): boolean => a == b;
const strict = (a: any, b: any): boolean => a === b;

const typeName = (v: unknown): string => (v === null ? 'null' : typeof v);
const isNullish = (v: unknown) => v === null || v === undefined;

function show(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `'${v}'`;
  if (Array.isArray(v)) return `[${v.map(show).join(', ')}]`;
  if (v !== null && typeof v === 'object') return '{}';
  if (typeof v === 'number' && Object.is(v, -0)) return '-0';
  return String(v);
}

function parseLiteral(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('!')) return !parseLiteral(t.slice(1));
  if (t === 'undefined') return undefined;
  if (t === 'null') return null;
  if (t === 'NaN') return NaN;
  if (t === 'Infinity') return Infinity;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === '{}') return {};
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  let m = t.match(/^'(.*)'$/) || t.match(/^"(.*)"$/);
  if (m) return m[1];
  m = t.match(/^\[.*\]$/);
  if (m) {
    try {
      const arr = JSON.parse(t.replace(/'/g, '"'));
      if (Array.isArray(arr)) return arr;
    } catch {
      /* fall through */
    }
  }
  throw new Error(`Can't read "${t}". Use null, undefined, NaN, true, 0, 'text', [], [1,2], {} or !value`);
}

interface In {
  a: string;
  b: string;
}

const SAMPLE: unknown[] = [0, '', null, undefined, NaN, [], {}, '0', 'false', 'text'];

const viz: VizDef<In> = {
  id: 'js-equality',
  title: '== coercion, step by step',
  code,
  language: 'javascript',
  inputs: [
    { key: 'a', label: 'Left (a)', kind: 'string', default: '[]', maxItems: 20, help: "null, undefined, NaN, true, 0, 'text', [], [1,2], {} or !value" },
    { key: 'b', label: 'Right (b)', kind: 'string', default: '![]', maxItems: 20 },
  ],
  presets: [
    { label: '[] == ![]', input: { a: '[]', b: '![]' } },
    { label: "null == 0", input: { a: 'null', b: '0' } },
    { label: 'null == undefined', input: { a: 'null', b: 'undefined' } },
    { label: "'' == 0", input: { a: "''", b: '0' } },
    { label: "'1' == true", input: { a: "'1'", b: 'true' } },
    { label: 'NaN == NaN', input: { a: 'NaN', b: 'NaN' } },
  ],
  run({ a: ta, b: tb }) {
    const r = new Recorder(code);
    const history: { text: string; tone?: Tone }[] = [];
    const A = parseLiteral(ta);
    const B = parseLiteral(tb);
    let current = -1;
    const view = (a: unknown, b: unknown, hit: number, upTo: number): Panel[] => [
      {
        type: 'kv',
        title: 'Comparing a == b',
        entries: [
          { k: 'a', v: `${show(a)}  (${typeName(a)})`, tone: 'compare' },
          { k: 'b', v: `${show(b)}  (${typeName(b)})`, tone: 'compare' },
        ],
      },
      {
        type: 'list',
        title: 'Rules, checked in order',
        orientation: 'vertical',
        items: RULES.map((rule, i) => ({ id: rule.anchor, label: `${i + 1}. ${rule.text}`, tone: (i === hit ? 'found' : i < upTo ? 'muted' : 'default') as Tone })),
      },
      { type: 'log', title: 'Conversions so far', lines: history },
    ];
    const fire = (i: number, a: unknown, b: unknown, caption: string) => {
      current = i;
      r.step(RULES[i].anchor, caption, view(a, b, i, i), { a: show(a), b: show(b) });
    };
    r.step('same', `Evaluate ${ta} == ${tb}. First question: do the types match?`, view(A, B, -1, 0), { a: show(A), b: show(B) });
    const eq = (a: unknown, b: unknown, depth: number): boolean => {
      if (depth > 6) throw new Error('Too many conversions');
      r.op();
      if (typeName(a) === typeName(b)) {
        fire(0, a, b, `Both are ${typeName(a)}: same as ===, so ${strict(a, b)}`);
        return strict(a, b);
      }
      if (isNullish(a) && isNullish(b)) {
        fire(1, a, b, 'null and undefined are loosely equal to each other: true');
        return true;
      }
      if (isNullish(a) || isNullish(b)) {
        fire(2, a, b, `${isNullish(a) ? show(a) : show(b)} only equals null / undefined: false`);
        return false;
      }
      if (typeof a === 'boolean') {
        history.push({ text: `Number(${show(a)}) -> ${Number(a)}` });
        fire(3, a, b, `Boolean ${show(a)} becomes the number ${Number(a)}`);
        return eq(Number(a), b, depth + 1);
      }
      if (typeof b === 'boolean') {
        history.push({ text: `Number(${show(b)}) -> ${Number(b)}` });
        fire(4, a, b, `Boolean ${show(b)} becomes the number ${Number(b)}`);
        return eq(a, Number(b), depth + 1);
      }
      if (typeof a === 'object') {
        history.push({ text: `String(${show(a)}) -> ${show(String(a))}` });
        fire(5, a, b, `Object ${show(a)} becomes the string ${show(String(a))}`);
        return eq(String(a), b, depth + 1);
      }
      if (typeof b === 'object') {
        history.push({ text: `String(${show(b)}) -> ${show(String(b))}` });
        fire(6, a, b, `Object ${show(b)} becomes the string ${show(String(b))}`);
        return eq(a, String(b), depth + 1);
      }
      const res = Number(a) === Number(b);
      history.push({ text: `Number(${show(a)}) === Number(${show(b)}) -> ${res}`, tone: res ? 'found' : 'error' });
      fire(7, a, b, `Compare as numbers: ${show(Number(a))} vs ${show(Number(b))} is ${res}`);
      return res;
    };
    const result = eq(A, B, 0);
    const grid: Panel = {
      type: 'grid',
      title: 'Truthiness vs == false / == null',
      cells: SAMPLE.map((v) => [String(Boolean(v)), String(loose(v, false)), String(loose(v, null))]),
      rowLabels: SAMPLE.map(show),
      colLabels: ['Boolean(v)', 'v == false', 'v == null'],
      tones: Object.fromEntries(SAMPLE.flatMap((v, i) => (Boolean(v) && loose(v, false) ? [[`${i},0`, 'error' as Tone], [`${i},1`, 'error' as Tone]] : []))),
    };
    r.step(RULES[current].anchor, `Result: ${ta} == ${tb} is ${result}`, [
      {
        type: 'kv',
        title: `${ta} vs ${tb}`,
        entries: [
          { k: '==', v: result, tone: result ? 'found' : 'error' },
          { k: '===', v: strict(A, B), tone: strict(A, B) ? 'found' : 'default' },
          { k: 'Object.is', v: Object.is(A, B), tone: Object.is(A, B) ? 'found' : 'default' },
        ],
      },
      { type: 'log', title: 'Conversions', lines: history },
      grid,
    ], { result });
    return { frames: r.frames, result };
  },
  reference: ({ a, b }) => loose(parseLiteral(a), parseLiteral(b)),
};

const unit: Unit = {
  id: 'js-equality',
  hook: '`==` versus `===` is a classic screening question, and the follow-ups (null, NaN, [] == ![]) show whether you know the coercion rules or just the folklore.',
  predict: {
    prompt: 'Which of these comparisons are true?',
    code: `1) null == 0
2) null == undefined
3) '' == 0
4) NaN == NaN`,
    codeLang: 'javascript',
    options: ['Only 2 and 3', 'Only 2', '2, 3 and 4', '1, 2 and 3'],
    answer: 0,
    explain: 'null only loosely equals undefined (and itself), so 1 is false even though null is "falsy" like 0. In 3 the empty string becomes the number 0, so it is true. NaN is never equal to anything, including itself.',
  },
  viz,
  deeper: {
    points: [
      '`===` never converts: different types are never equal. `==` first tries to make the types match using a fixed algorithm.',
      '`null == undefined` is true and neither equals anything else under `==`, so `x == null` is a handy check for "null or undefined".',
      'Booleans are converted to numbers first (true -> 1), then the comparison continues: `true == "1"` is true, but `"true" == true` is false.',
      'Objects (including arrays) are converted to primitives: `[] == ""` and `[1] == 1` are true. Two different objects are never equal.',
      '`NaN` is not equal to itself. Use `Number.isNaN(x)` or `Object.is(x, NaN)`. `Object.is` also tells `+0` from `-0`.',
    ],
    pitfalls: ['`if (x == "")` treating 0 and false as empty', 'Assuming falsy values are equal to each other (null == false is false)', 'Using `x !== x` style tricks without a comment explaining the NaN check'],
  },
  practice: {
    language: 'javascript',
    fnName: 'sameValue',
    statement: 'Implement `Object.is` without calling it: like `===`, except that `NaN` is the same as `NaN` and `0` is NOT the same as `-0`.',
    signature: 'function sameValue(a, b) {',
    solution: `function sameValue(a, b) {
  if (@@a === b@@) return a !== 0 || @@1 / a === 1 / b@@;
  return @@a !== a && b !== b@@;
}`,
    harness: `function decode(v) {
  if (v === '<undefined>') return undefined;
  if (v === '<NaN>') return NaN;
  if (v === '<-0>') return -0;
  return v;
}
function runEq(fn, a, b) { return fn(decode(a), decode(b)); }`,
    adapter: 'runEq',
    tests: [
      { args: [0, '<-0>'], expected: false, name: '+0 and -0 differ' },
      { args: ['<-0>', '<-0>'], expected: true, name: '-0 is -0' },
      { args: ['<NaN>', '<NaN>'], expected: true, name: 'NaN is NaN' },
      { args: [1, 1], expected: true },
      { args: ['a', 'b'], expected: false },
      { args: [null, '<undefined>'], expected: false, name: 'null is not undefined' },
      { args: ['<undefined>', '<undefined>'], expected: true },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'withDefaults',
    statement: '`withDefaults(values, fallback)` replaces missing values (null, undefined or an empty string) with `fallback`, but must keep `0` and `false`. It currently also replaces those.',
    buggy: `function withDefaults(values, fallback) {
  return values.map((v) => (v == null || v == '' ? fallback : v));
}`,
    fixed: `function withDefaults(values, fallback) {
  return values.map((v) => (v == null || v === '' ? fallback : v));
}`,
    tests: [
      { args: [[1, null, 0, '', false, 'x'], 'N/A'], expected: [1, 'N/A', 0, 'N/A', false, 'x'] },
      { args: [[0], 'd'], expected: [0] },
      { args: [[false, ''], 'd'], expected: [false, 'd'] },
      { args: [[null, null], 0], expected: [0, 0] },
      { args: [[], 'd'], expected: [] },
    ],
    bugType: 'loose equality coerces 0 and false',
    hint: 'Evaluate `0 == ""` and `false == ""` in your head using the coercion rules.',
    explanation: 'With `==`, the empty string is converted to the number 0, so `0 == ""` and `false == ""` are both true and those valid values were replaced. `== null` is the one safe loose comparison (null/undefined only); compare the empty string strictly.',
  },
  boss: {
    title: 'Implement ==',
    language: 'javascript',
    fnName: 'looseEquals',
    statement:
      'Implement `looseEquals(a, b)` for primitives and arrays WITHOUT using `==` or `!=`: same type -> `===`; null/undefined only equal each other; booleans become numbers; arrays become strings (`String(arr)`) when compared with a primitive; number vs string compares as numbers.',
    starter: `function looseEquals(a, b) {
  // your code here
}
`,
    solution: `function looseEquals(a, b) {
  const type = (v) => (v === null ? 'null' : typeof v);
  const nullish = (v) => v === null || v === undefined;
  if (type(a) === type(b)) return a === b;
  if (nullish(a) && nullish(b)) return true;
  if (nullish(a) || nullish(b)) return false;
  if (typeof a === 'boolean') return looseEquals(Number(a), b);
  if (typeof b === 'boolean') return looseEquals(a, Number(b));
  if (typeof a === 'object') return looseEquals(String(a), b);
  if (typeof b === 'object') return looseEquals(a, String(b));
  return Number(a) === Number(b);
}`,
    harness: `function decode(v) {
  if (v === '<undefined>') return undefined;
  if (v === '<NaN>') return NaN;
  return v;
}
function runEq(fn, a, b) { return fn(decode(a), decode(b)); }`,
    adapter: 'runEq',
    tests: [
      { args: [null, '<undefined>'], expected: true, name: 'null == undefined' },
      { args: [null, 0], expected: false, name: 'null == 0' },
      { args: ['1', 1], expected: true, name: 'string vs number' },
      { args: [true, '1'], expected: true, name: 'boolean vs string' },
      { args: [true, 2], expected: false, name: 'true is 1, not 2' },
      { args: ['', 0], expected: true, name: "'' == 0" },
      { args: ['<NaN>', '<NaN>'], expected: false, name: 'NaN == NaN' },
      { args: [[], ''], expected: true, name: '[] == empty string' },
      { args: [[1], 1], expected: true, name: '[1] == 1' },
      { args: [[], false], expected: true, name: '[] == false' },
      { args: [[], []], expected: false, name: 'two different arrays' },
      { args: ['abc', 0], expected: false, name: "'abc' becomes NaN" },
    ],
    hints: ['Handle the cases in the spec order: same type, nullish pair, one nullish, boolean, array, then number vs string. Recursion makes the multi-step coercions easy.', 'Check types with a helper: `v === null ? "null" : typeof v` (arrays count as "object"). Convert with Number(bool) or String(array) and call looseEquals again; finish with Number(a) === Number(b).'],
    combines: ['js-hoisting'],
  },
  quiz: [
    {
      prompt: 'What does `Boolean([])` return?',
      options: ['true', 'false', 'undefined', 'It throws'],
      answer: 0,
      explain: 'Every object is truthy, including empty arrays and objects. (Yet `[] == false` is true, because == converts differently from truthiness.)',
    },
  ],
};

export default unit;
