import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { sourcePanel } from '@/content/lib/frontend-js';

const code = `
for (const d of declarations) {                         //@scan
  if (d.kind === 'function') scope[d.name] = d.fn;       //@func
  else if (d.kind === 'var') scope[d.name] ??= undefined; //@var
  else scope[d.name] = TDZ;                              //@tdz
}
for (const stmt of program) run(stmt);                   //@run
`;

type Val = number | string | undefined;
type Kind = 'var' | 'let' | 'const';

type Stmt =
  | { t: 'fn'; name: string; ret: Val; raw: string }
  | { t: 'decl'; kind: Kind; name: string; init: boolean; value: Val; isFn: boolean; ret: Val; raw: string }
  | { t: 'log'; name: string; raw: string }
  | { t: 'logcall'; name: string; raw: string }
  | { t: 'call'; name: string; raw: string }
  | { t: 'set'; name: string; value: Val; raw: string };

function parseVal(s: string | undefined): Val {
  if (s === undefined) return undefined;
  const t = s.trim().replace(/;$/, '');
  if (t === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^'(.*)'$/) || t.match(/^"(.*)"$/);
  if (m) return m[1];
  throw new Error(`Values must be numbers or quoted text, got "${t}"`);
}

function parseLine(raw: string): Stmt {
  const s = raw.trim().replace(/;$/, '');
  let m = s.match(/^function\s+(\w+)\(\)\s*\{\s*(?:return\s+(.+?))?\s*;?\s*\}$/);
  if (m) return { t: 'fn', name: m[1], ret: parseVal(m[2]), raw: s };
  m = s.match(/^(var|let|const)\s+(\w+)\s*=\s*(?:function\s*\(\)\s*\{\s*(?:return\s+(.+?))?\s*;?\s*\}|\(\)\s*=>\s*(.+))$/);
  if (m) return { t: 'decl', kind: m[1] as Kind, name: m[2], init: true, value: undefined, isFn: true, ret: parseVal(m[3] ?? m[4]), raw: s };
  m = s.match(/^(var|let|const)\s+(\w+)(?:\s*=\s*(.+))?$/);
  if (m) {
    if (m[1] === 'const' && m[3] === undefined) throw new Error(`"${s}": const needs a value`);
    return { t: 'decl', kind: m[1] as Kind, name: m[2], init: m[3] !== undefined, value: parseVal(m[3]), isFn: false, ret: undefined, raw: s };
  }
  m = s.match(/^log\((\w+)\(\)\)$/);
  if (m) return { t: 'logcall', name: m[1], raw: s };
  m = s.match(/^log\((\w+)\)$/);
  if (m) return { t: 'log', name: m[1], raw: s };
  m = s.match(/^(\w+)\(\)$/);
  if (m) return { t: 'call', name: m[1], raw: s };
  m = s.match(/^(\w+)\s*=\s*(.+)$/);
  if (m) return { t: 'set', name: m[1], value: parseVal(m[2]), raw: s };
  throw new Error(`Can't read "${s}". Use var/let/const x = 1, function f() { return 1 }, log(x), f(), x = 2`);
}

type Binding = { st: 'tdz' } | { st: 'undef' } | { st: 'fn'; ret: Val; name: string } | { st: 'val'; v: Val };

const repr = (v: Val): string => (v === undefined ? 'undefined' : typeof v === 'string' ? JSON.stringify(v) : String(v));
const reprB = (b: Binding): string => (b.st === 'tdz' ? '<TDZ: unreachable>' : b.st === 'undef' ? 'undefined' : b.st === 'fn' ? `function ${b.name}()` : repr(b.v));
const toneB = (b: Binding): Tone => (b.st === 'tdz' ? 'error' : b.st === 'undef' ? 'compare' : b.st === 'fn' ? 'found' : 'default');
const before = (n: string) => `ReferenceError: Cannot access '${n}' before initialization`;
const missing = (n: string) => `ReferenceError: ${n} is not defined`;

function checkDecls(stmts: Stmt[]): void {
  const lexical = new Set<string>();
  const others = new Set<string>();
  for (const s of stmts) {
    if (s.t === 'decl' && s.kind !== 'var') {
      if (lexical.has(s.name) || others.has(s.name)) throw new Error(`SyntaxError: '${s.name}' has already been declared`);
      lexical.add(s.name);
    } else if (s.t === 'decl' || s.t === 'fn') {
      if (lexical.has(s.name)) throw new Error(`SyntaxError: '${s.name}' has already been declared`);
      others.add(s.name);
    }
  }
}

interface In {
  lines: string[];
}

const DEFAULT = ['log(a)', 'var a = 5', 'log(a)', 'log(hi())', "function hi() { return 'hello' }"];

const viz: VizDef<In> = {
  id: 'js-hoisting',
  title: 'Hoisting: creation phase vs execution',
  code,
  language: 'javascript',
  inputs: [{ key: 'lines', label: 'Statements (comma separated)', kind: 'strings', default: DEFAULT, maxItems: 12, help: 'var/let/const x = 1 | function f() { return 1 } | var g = function() { return 1 } | log(x) | log(f()) | f() | x = 2' }],
  presets: [
    { label: 'var and function', input: { lines: DEFAULT } },
    { label: 'let in the TDZ', input: { lines: ['log(b)', 'let b = 2', 'log(b)'] } },
    { label: 'Function expression', input: { lines: ['greet()', "var greet = function() { return 'hi' }"] } },
    { label: 'Function beats var', input: { lines: ['log(x)', 'var x = 1', 'function x() { return 2 }', 'log(x)'] } },
    { label: 'Undeclared name', input: { lines: ['var a = 1', 'log(b)'] } },
  ],
  run({ lines }) {
    if (!lines.length) throw new Error('Add at least one statement');
    const stmts = lines.map(parseLine);
    checkDecls(stmts);
    const r = new Recorder(code);
    const scope = new Map<string, Binding>();
    const out: { text: string; tone?: Tone }[] = [];
    const src = stmts.map((s) => s.raw);
    const done = new Set<number>();
    let phase = 'creation';
    const panels = (active: number, hot?: string): Panel[] => [
      sourcePanel(src, active, done, 'Program'),
      { type: 'kv', title: `Scope (${phase} phase)`, entries: [...scope].map(([k, b]) => ({ k, v: reprB(b), tone: k === hot ? ('swap' as Tone) : toneB(b) })) },
      { type: 'log', title: 'Console', lines: out },
    ];
    const step = (anchor: string, caption: string, active: number, hot?: string) => r.step(anchor, caption, panels(active, hot), { phase, bindings: scope.size });

    step('scan', 'Before any code runs, the engine scans for declarations', -1);
    stmts.forEach((s, i) => {
      if (s.t === 'fn') {
        scope.set(s.name, { st: 'fn', ret: s.ret, name: s.name });
        step('func', `function ${s.name}: created WITH its body, callable from the top`, i, s.name);
      } else if (s.t === 'decl' && s.kind === 'var') {
        if (!scope.has(s.name)) scope.set(s.name, { st: 'undef' });
        step('var', `var ${s.name}: declared and set to undefined (the assignment stays put)`, i, s.name);
      } else if (s.t === 'decl') {
        scope.set(s.name, { st: 'tdz' });
        step('tdz', `${s.kind} ${s.name}: exists but in the temporal dead zone until its line runs`, i, s.name);
      }
    });
    phase = 'execution';
    const result: string[] = [];
    const print = (text: string, tone: Tone = 'found') => {
      out.push({ text, tone });
      result.push(text);
    };
    const fail = (msg: string, i: number) => {
      print(msg, 'error');
      done.add(i);
      step('run', `${msg}. Execution stops here`, i);
    };
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (s.t === 'fn') {
        done.add(i);
        step('run', `function ${s.name} was already created: nothing to do`, i);
      } else if (s.t === 'decl') {
        if (s.isFn) scope.set(s.name, { st: 'fn', ret: s.ret, name: s.name });
        else if (s.init) scope.set(s.name, { st: 'val', v: s.value });
        else if (s.kind !== 'var') scope.set(s.name, { st: 'undef' });
        done.add(i);
        step('run', s.isFn ? `${s.name} now holds a function` : s.init ? `${s.name} = ${repr(s.value)} assigned (${s.kind === 'var' ? 'binding already existed' : 'leaves the TDZ'})` : `${s.name} stays undefined`, i, s.name);
      } else if (s.t === 'set') {
        const b = scope.get(s.name);
        if (b?.st === 'tdz') return finish(fail(before(s.name), i));
        const isConst = stmts.some((d) => d.t === 'decl' && d.kind === 'const' && d.name === s.name);
        if (isConst) return finish(fail('TypeError: Assignment to constant variable.', i));
        scope.set(s.name, { st: 'val', v: s.value });
        done.add(i);
        step('run', b ? `${s.name} = ${repr(s.value)}` : `${s.name} was never declared: sloppy mode creates a global`, i, s.name);
      } else {
        const b = scope.get(s.name);
        if (!b) return finish(fail(missing(s.name), i));
        if (b.st === 'tdz') return finish(fail(before(s.name), i));
        if (s.t === 'log') {
          print(b.st === 'undef' ? 'undefined' : b.st === 'fn' ? `[Function: ${b.name}]` : repr((b as { v: Val }).v));
          done.add(i);
          step('run', `log(${s.name}) prints ${out[out.length - 1].text}`, i);
        } else {
          if (b.st !== 'fn') return finish(fail(`TypeError: ${s.name} is not a function`, i));
          done.add(i);
          if (s.t === 'logcall') print(repr(b.ret));
          step('run', s.t === 'logcall' ? `${s.name}() returns ${repr(b.ret)}, which is printed` : `${s.name}() runs fine: it was hoisted with its body`, i);
        }
      }
    }
    return finish(undefined);

    function finish(_: unknown) {
      step('run', result.length ? `Done. Printed: ${result.join(' | ')}` : 'Done. Nothing was printed', -1);
      return { frames: r.frames, result };
    }
  },
  reference({ lines }) {
    const stmts = lines.map(parseLine);
    const st = new Map<string, { k: 'tdz' | 'undef' | 'fn' | 'val'; v?: Val; ret?: Val }>();
    const consts = new Set(stmts.flatMap((s) => (s.t === 'decl' && s.kind === 'const' ? [s.name] : [])));
    for (const s of stmts) {
      if (s.t === 'fn') st.set(s.name, { k: 'fn', ret: s.ret });
      else if (s.t === 'decl' && s.kind === 'var' && !st.has(s.name)) st.set(s.name, { k: 'undef' });
      else if (s.t === 'decl') st.set(s.name, { k: 'tdz' });
    }
    const out: string[] = [];
    for (const s of stmts) {
      if (s.t === 'decl') {
        if (s.isFn) st.set(s.name, { k: 'fn', ret: s.ret });
        else if (s.init) st.set(s.name, { k: 'val', v: s.value });
        else if (s.kind !== 'var') st.set(s.name, { k: 'undef' });
        continue;
      }
      if (s.t === 'fn') continue;
      const b = st.get(s.name);
      if (s.t === 'set') {
        if (b?.k === 'tdz') return [...out, before(s.name)];
        if (consts.has(s.name)) return [...out, 'TypeError: Assignment to constant variable.'];
        st.set(s.name, { k: 'val', v: s.value });
        continue;
      }
      if (!b) return [...out, missing(s.name)];
      if (b.k === 'tdz') return [...out, before(s.name)];
      if (s.t === 'log') out.push(b.k === 'fn' ? `[Function: ${s.name}]` : b.k === 'undef' ? 'undefined' : repr(b.v));
      else if (b.k !== 'fn') return [...out, `TypeError: ${s.name} is not a function`];
      else if (s.t === 'logcall') out.push(repr(b.ret));
    }
    return out;
  },
};

const unit: Unit = {
  id: 'js-hoisting',
  hook: 'Hoisting questions ("why does this print undefined?") test whether you know JavaScript runs in two phases. It is also the root of the `let` vs `var` and function declaration vs expression distinctions.',
  predict: {
    prompt: 'What happens when this runs?',
    code: `console.log(typeof hello);
console.log(count);
var count = 3;
function hello() {}
console.log(limit);
let limit = 10;`,
    codeLang: 'javascript',
    options: ["Prints 'function', undefined, then throws ReferenceError on `limit`", "Prints 'undefined', undefined, undefined", "Throws ReferenceError on the very first line", "Prints 'function', 3, then 10"],
    answer: 0,
    explain: "In the creation phase `hello` is fully defined, `count` exists as undefined, and `limit` is in the temporal dead zone. So typeof hello is 'function', count is undefined, and reading `limit` before its line throws.",
  },
  viz,
  deeper: {
    points: [
      'Nothing is physically moved. Before executing a scope, the engine registers its declarations; that is what "hoisting" describes.',
      '`function f() {}` declarations are hoisted with their body. `var f = function () {}` only hoists the name (as undefined).',
      '`let`, `const` and `class` are hoisted too, but stay uninitialised (the TDZ) until their line runs, so early reads throw a ReferenceError.',
      'When a function and a `var` share a name, the function wins at creation; a later assignment can still overwrite it at runtime.',
      '`typeof undeclared` is "undefined", but `typeof tdzVariable` throws.',
    ],
    pitfalls: ['Calling a function expression stored in a `var` before its line: TypeError, not ReferenceError', 'Assuming `let` is not hoisted and so can be shadowed safely above its declaration', 'Declaring the same name twice with let/const (SyntaxError)'],
  },
  practice: {
    language: 'javascript',
    fnName: 'creationPhase',
    statement: 'Given declarations in source order (`{kind, name}` with kind "var", "let", "const" or "function"), return what the creation phase stores for each name: "function", "undefined" (var) or "TDZ" (let/const). A function always wins over a var of the same name.',
    signature: 'function creationPhase(decls) {',
    solution: `function creationPhase(decls) {
  const scope = {};
  for (const d of decls) {
    if (d.kind === 'function') scope[d.name] = @@'function'@@;
    else if (d.kind === 'var') {
      if (@@!(d.name in scope)@@) scope[d.name] = @@'undefined'@@;
    } else scope[d.name] = @@'TDZ'@@;
  }
  return scope;
}`,
    tests: [
      { args: [[{ kind: 'var', name: 'a' }, { kind: 'let', name: 'b' }, { kind: 'function', name: 'f' }]], expected: { a: 'undefined', b: 'TDZ', f: 'function' }, name: 'one of each' },
      { args: [[{ kind: 'function', name: 'f' }, { kind: 'var', name: 'f' }]], expected: { f: 'function' }, name: 'var after function keeps the function' },
      { args: [[{ kind: 'var', name: 'f' }, { kind: 'function', name: 'f' }]], expected: { f: 'function' }, name: 'function after var wins' },
      { args: [[{ kind: 'const', name: 'c' }]], expected: { c: 'TDZ' }, name: 'const is in the TDZ' },
      { args: [[]], expected: {}, name: 'empty scope' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'summarize',
    statement: '`summarize(prices)` should return `{ total, average }` (average is 0 for an empty list). It throws instead of returning.',
    buggy: `function summarize(prices) {
  const total = sum(prices);
  const average = prices.length ? total / prices.length : 0;
  const sum = (xs) => xs.reduce((acc, x) => acc + x, 0);
  return { total, average };
}`,
    fixed: `function summarize(prices) {
  const total = sum(prices);
  const average = prices.length ? total / prices.length : 0;
  function sum(xs) {
    return xs.reduce((acc, x) => acc + x, 0);
  }
  return { total, average };
}`,
    tests: [
      { args: [[1, 2, 3]], expected: { total: 6, average: 2 } },
      { args: [[]], expected: { total: 0, average: 0 } },
      { args: [[10]], expected: { total: 10, average: 10 } },
    ],
    bugType: 'TDZ: const used before it runs',
    hint: '`sum` is a const arrow function declared below the line that calls it. What state is `sum` in when line 2 runs?',
    explanation: 'A `const` binding exists from the start of the scope but is uninitialised until its declaration executes, so calling it earlier throws a ReferenceError. A function declaration is hoisted with its body, so it can be used above its definition (or move the const above its first use).',
  },
  boss: {
    title: 'Hoisting checker',
    language: 'javascript',
    fnName: 'firstError',
    statement:
      'Implement `firstError(program)` for a tiny language. Statements: `{decl: "var"|"let"|"const", name, init?: true, fn?: true}` (fn means it is assigned a function), `{decl: "function", name}`, `{read: name}`, `{call: name}`. Return the first runtime error, or "ok". Errors: `ReferenceError: x is not defined`, `ReferenceError: Cannot access \'x\' before initialization` (TDZ), `TypeError: x is not a function`. Remember: the creation phase runs first.',
    starter: `function firstError(program) {
  // your code here
}
`,
    solution: `function firstError(program) {
  const scope = {};
  for (const s of program) {
    if (s.decl === 'function') scope[s.name] = 'fn';
    else if (s.decl === 'var') {
      if (!(s.name in scope)) scope[s.name] = 'undef';
    } else if (s.decl) scope[s.name] = 'tdz';
  }
  for (const s of program) {
    if (s.decl && s.decl !== 'function') {
      if (s.fn) scope[s.name] = 'fn';
      else if (s.init) scope[s.name] = 'val';
      else if (s.decl !== 'var') scope[s.name] = 'undef';
    } else if (s.read || s.call) {
      const name = s.read || s.call;
      if (!(name in scope)) return 'ReferenceError: ' + name + ' is not defined';
      if (scope[name] === 'tdz') return "ReferenceError: Cannot access '" + name + "' before initialization";
      if (s.call && scope[name] !== 'fn') return 'TypeError: ' + name + ' is not a function';
    }
  }
  return 'ok';
}`,
    tests: [
      { args: [[{ read: 'a' }, { decl: 'var', name: 'a', init: true }]], expected: 'ok', name: 'var read early is undefined' },
      { args: [[{ read: 'b' }, { decl: 'let', name: 'b', init: true }]], expected: "ReferenceError: Cannot access 'b' before initialization", name: 'let TDZ' },
      { args: [[{ call: 'f' }, { decl: 'function', name: 'f' }]], expected: 'ok', name: 'function declaration is hoisted' },
      { args: [[{ call: 'g' }, { decl: 'var', name: 'g', fn: true }]], expected: 'TypeError: g is not a function', name: 'function expression in var' },
      { args: [[{ read: 'zzz' }]], expected: 'ReferenceError: zzz is not defined', name: 'never declared' },
      { args: [[{ decl: 'const', name: 'c', init: true }, { call: 'c' }]], expected: 'TypeError: c is not a function', name: 'calling a number' },
      { args: [[{ decl: 'var', name: 'h', fn: true }, { call: 'h' }]], expected: 'ok', name: 'expression after its line' },
      { args: [[]], expected: 'ok', name: 'empty program' },
    ],
    hints: ['Do two passes over the program: first register every declaration (function -> fn, var -> undef, let/const -> tdz), then execute the statements in order.', 'While executing, a declaration with `fn`/`init` updates the binding. A read or call looks the name up: missing -> not defined, tdz -> before initialization, and a call on a non-fn -> TypeError.'],
    combines: ['js-closures'],
  },
};

export default unit;
