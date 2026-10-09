import type { Unit } from '@/content/types';
import type { Tone } from '@/engine/types';
import type { Design } from '@/content/lib/sysdesign-lld';
import { RUN_SAFE_FN, scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class Parser:
    def parse(self, text): raise NotImplementedError

class CsvParser(Parser):
    def parse(self, text): ...                       # rows

class JsonParser(Parser):
    def parse(self, text): ...                       # dict

class EnvParser(Parser):
    def parse(self, text): ...                       # KEY=VALUE pairs

def make_parser(filename):
    ext = filename.rsplit(".", 1)[-1].lower()        #@ext
    if ext == "csv":
        return CsvParser()                           #@csv
    if ext == "json":
        return JsonParser()                          #@json
    if ext == "env":
        return EnvParser()                           #@env
    raise ValueError("unsupported file type: " + ext)    #@unknown

def load(filename, text):
    parser = make_parser(filename)                   #@call
    return parser.parse(text)                        #@parse
`;

const SUPPORTED: Record<string, { cls: string; id: string; anchor: string; summary: string }> = {
  csv: { cls: 'CsvParser', id: 'csv', anchor: 'csv', summary: '3 rows' },
  json: { cls: 'JsonParser', id: 'json', anchor: 'json', summary: '2 keys' },
  env: { cls: 'EnvParser', id: 'env', anchor: 'env', summary: '3 pairs' },
};

const design: Design = {
  classes: [
    { id: 'client', name: 'load()', methods: ['client code'], x: 110, y: 55 },
    { id: 'factory', name: 'make_parser()', methods: ['picks by extension'], x: 110, y: 175 },
    { id: 'parser', name: 'Parser', kind: 'interface', methods: ['parse(text)'], x: 470, y: 55 },
    { id: 'csv', name: 'CsvParser', methods: ['parse()'], x: 300, y: 275 },
    { id: 'json', name: 'JsonParser', methods: ['parse()'], x: 470, y: 275 },
    { id: 'env', name: 'EnvParser', methods: ['parse()'], x: 635, y: 275 },
  ],
  rels: [
    { from: 'client', to: 'factory', kind: 'uses', label: 'make_parser(name)' },
    { from: 'factory', to: 'parser', kind: 'depends', label: 'returns a' },
    { from: 'csv', to: 'parser', kind: 'inherits' },
    { from: 'json', to: 'parser', kind: 'inherits' },
    { from: 'env', to: 'parser', kind: 'inherits' },
  ],
};

interface In {
  files: string[];
}

const extOf = (name: string): string => (name.split('.').pop() ?? '').toLowerCase();

function check(input: In): string[] {
  for (const f of input.files) if (!f.trim() || /\s/.test(f.trim())) throw new Error(`File name "${f}" must be one word, for example users.csv`);
  return input.files.map((f) => f.trim());
}

function simulate(input: In) {
  const files = check(input);
  const beats: Beat[] = [];
  const results: string[] = [];
  beats.push({ at: 'call', caption: 'The client only knows Parser; the factory decides which class to build', state: { requests: 0, errors: 0 } });
  let errors = 0;
  files.forEach((file, i) => {
    const ext = extOf(file);
    beats.push({ at: 'call', caption: `load("${file}"): ask the factory for a parser`, tones: { client: 'active', factory: 'compare' }, edgeTones: { 'client>factory': 'path' }, msg: { from: 'load()', to: 'make_parser()', label: `make_parser("${file}")` }, state: { requests: i + 1, errors } });
    beats.push({ at: 'ext', caption: `Extension of "${file}" is "${ext}"`, tones: { factory: 'active' }, state: { requests: i + 1, errors }, log: { text: `${file} -> ext "${ext}"` } });
    const hit = SUPPORTED[ext];
    if (!hit) {
      errors += 1;
      results.push(`error: unsupported .${ext}`);
      beats.push({ at: 'unknown', caption: `No class registered for "${ext}": ValueError instead of a guess`, tones: { factory: 'error' }, msg: { from: 'make_parser()', to: 'load()', label: 'ValueError', tone: 'error', dashed: true }, state: { requests: i + 1, errors }, log: { text: `${file}: unsupported`, tone: 'error' } });
      return;
    }
    const tones: Record<string, Tone> = { factory: 'active', [hit.id]: 'new' };
    beats.push({ at: hit.anchor, caption: `"${ext}" maps to ${hit.cls}: build it and return it as a Parser`, tones, edgeTones: { [`${hit.id}>parser`]: 'new', 'factory>parser': 'path' }, msg: { from: 'make_parser()', to: 'Parser', label: `${hit.cls}()` }, state: { requests: i + 1, errors }, log: { text: `${file} -> ${hit.cls}`, tone: 'found' } });
    results.push(`${hit.cls}:${hit.summary}`);
    beats.push({ at: 'parse', caption: `parser.parse(text) runs ${hit.cls}: ${hit.summary}`, tones: { client: 'active', [hit.id]: 'found' }, msg: { from: 'load()', to: 'Parser', label: `parse(text) -> ${hit.summary}` }, state: { requests: i + 1, errors }, vars: { parser: hit.cls } });
  });
  return { beats, result: results };
}

function reference(input: In): string[] {
  const table = new Map(Object.entries(SUPPORTED).map(([k, v]) => [k, `${v.cls}:${v.summary}`]));
  return check(input).map((f) => table.get(extOf(f)) ?? `error: unsupported .${extOf(f)}`);
}

const viz = scenarioViz<In, string[]>({
  id: 'pattern-factory',
  title: 'Factory: pick the parser by file type',
  code,
  design,
  diagramTitle: 'Participants',
  size: { width: 700, height: 320 },
  actors: ['load()', 'make_parser()', 'Parser'],
  stateTitle: 'Counters',
  logTitle: 'Factory decisions',
  inputs: [{ key: 'files', label: 'File names', kind: 'strings', default: ['users.csv', 'app.env', 'notes.txt', 'data.JSON'], maxItems: 5, help: 'Supported extensions: csv, json, env (any case). Anything else is rejected.' }],
  presets: [
    { label: 'All supported', input: { files: ['a.csv', 'b.json', 'c.env'] } },
    { label: 'Unknown type', input: { files: ['report.pdf', 'README'] } },
    { label: 'Case-insensitive', input: { files: ['DATA.CSV', 'cfg.Env'] } },
  ],
  simulate,
  reference,
});

const PARSERS_HARNESS =
  `
class CsvParser:
    def parse(self, text):
        return [line.split(',') for line in text.split('\\n') if line]

class JsonParser:
    def parse(self, text):
        import json
        return json.loads(text)

class EnvParser:
    def parse(self, text):
        out = {}
        for line in text.split('\\n'):
            if '=' in line:
                key, value = line.split('=', 1)
                out[key.strip()] = value.strip()
        return out
` + RUN_SAFE_FN;

const unit: Unit = {
  id: 'pattern-factory',
  hook: 'Factories answer "how do I add a new file type, payment method or notifier without touching every caller?". Interviewers also check that you fail loudly on unknown input instead of returning a default.',
  predict: {
    prompt: 'A new `.xml` format is added with a new `XmlParser`. With the factory above, which code must change besides the new class?',
    options: ['Every caller of `load`', '`make_parser` only: one new branch (or one registry entry)', 'The `Parser` interface and all existing parsers', 'Nothing: Python discovers the class by name'],
    answer: 1,
    explain: 'Callers depend on `Parser`, and only the factory knows concrete classes. Keeping creation in one place means one edit for one new type.',
  },
  viz,
  deeper: {
    points: [
      'Intent: **move object creation behind a function or class** so callers depend on an interface, not on concrete classes. "Simple factory" (a function) is enough in most Python code.',
      '**Factory Method** lets subclasses decide what to create; **Abstract Factory** builds whole families of related objects (a light and a dark widget set). Mention them, but do not over-engineer.',
      'A dict registry (`{"csv": CsvParser}`) makes the factory open for extension: adding a type is data, not another `elif`.',
      'Fail loudly on unknown keys (`ValueError`) so a typo cannot silently route to the wrong class.',
      'Normalise the key first (case, whitespace), or ".CSV" files will break in production.',
    ],
    pitfalls: ['Returning a default class for unknown input (hides bugs)', 'Callers using `isinstance` on the result, which re-couples them to concrete types', 'A factory that grows into a god class with business logic'],
  },
  practice: {
    language: 'python',
    fnName: 'load',
    statement:
      'The harness provides `CsvParser`, `JsonParser` and `EnvParser`, each with `parse(text)`. Write `load(filename, text)` that picks the parser from the extension (case-insensitive: `.csv`, `.json`, `.env`) and returns `parser.parse(text)`. For anything else raise `ValueError`.',
    signature: 'def load(filename, text):',
    harness: PARSERS_HARNESS,
    adapter: 'run_safe_fn',
    solution: `PARSERS = {'csv': CsvParser, 'json': JsonParser, 'env': EnvParser}

def load(filename, text):
    ext = filename.rsplit('.', 1)[-1]@@.lower()@@
    if ext @@not in PARSERS@@:
        raise @@ValueError('unsupported file type: ' + ext)@@
    return @@PARSERS[ext]().parse(text)@@`,
    tests: [
      { args: ['users.csv', 'id,name\n1,ann'], expected: [['id', 'name'], ['1', 'ann']], name: 'csv' },
      { args: ['cfg.json', '{"a": 1}'], expected: { a: 1 }, name: 'json' },
      { args: ['app.env', 'A=1\nB = two'], expected: { A: '1', B: 'two' }, name: 'env' },
      { args: ['DATA.CSV', 'x,y'], expected: [['x', 'y']], name: 'extension is case-insensitive' },
      { args: ['notes.txt', 'hi'], expected: '!ValueError', name: 'unknown extension' },
      { args: ['README', 'hi'], expected: '!ValueError', name: 'no extension' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'load',
    statement: 'Uploading a `.pdf` file produces garbage rows and no error. The factory should reject unsupported types instead of guessing.',
    harness: PARSERS_HARNESS,
    adapter: 'run_safe_fn',
    buggy: `PARSERS = {'csv': CsvParser, 'json': JsonParser, 'env': EnvParser}

def load(filename, text):
    ext = filename.rsplit('.', 1)[-1].lower()
    parser_cls = PARSERS.get(ext, CsvParser)
    return parser_cls().parse(text)`,
    fixed: `PARSERS = {'csv': CsvParser, 'json': JsonParser, 'env': EnvParser}

def load(filename, text):
    ext = filename.rsplit('.', 1)[-1].lower()
    if ext not in PARSERS:
        raise ValueError('unsupported file type: ' + ext)
    return PARSERS[ext]().parse(text)`,
    tests: [
      { args: ['a.csv', 'x,y'], expected: [['x', 'y']], name: 'csv still works' },
      { args: ['a.pdf', 'x,y'], expected: '!ValueError', name: 'pdf is rejected' },
      { args: ['a.env', 'K=V'], expected: { K: 'V' }, name: 'env still works' },
      { args: ['noext', 'x'], expected: '!ValueError', name: 'no extension is rejected' },
    ],
    bugType: 'silent default',
    hint: 'What does `dict.get(key, default)` do for a key that is not registered?',
    explanation: 'The `.get(ext, CsvParser)` fallback quietly treats every unknown type as CSV. A factory should treat an unknown key as an error so the caller learns immediately.',
  },
  boss: {
    title: 'RPN calculator with an operator factory',
    statement:
      'Write `evaluate(expr)` for a space-separated reverse Polish expression such as `"3 4 + 2 *"`. Numbers are integers; operators are `+ - * /` where `/` is floor division. Use a factory that maps an operator symbol to a small class with `apply(a, b)`. Raise `ValueError` for an unknown token, for too few operands, for leftover operands (not exactly one value at the end) and for an empty expression; division by zero raises `ZeroDivisionError`.',
    language: 'python',
    fnName: 'evaluate',
    harness: RUN_SAFE_FN,
    adapter: 'run_safe_fn',
    starter: `def evaluate(expr):
    pass
`,
    solution: `class Add:
    def apply(self, a, b): return a + b

class Sub:
    def apply(self, a, b): return a - b

class Mul:
    def apply(self, a, b): return a * b

class Div:
    def apply(self, a, b): return a // b

OPERATORS = {'+': Add, '-': Sub, '*': Mul, '/': Div}

def make_operator(symbol):
    if symbol not in OPERATORS:
        raise ValueError('unknown token: ' + symbol)
    return OPERATORS[symbol]()

def evaluate(expr):
    stack = []
    for tok in expr.split():
        if tok.lstrip('-').isdigit():
            stack.append(int(tok))
            continue
        op = make_operator(tok)
        if len(stack) < 2:
            raise ValueError('not enough operands')
        b = stack.pop()
        a = stack.pop()
        stack.append(op.apply(a, b))
    if len(stack) != 1:
        raise ValueError('malformed expression')
    return stack[0]`,
    tests: [
      { args: ['3 4 +'], expected: 7, name: 'addition' },
      { args: ['5 1 2 + 4 * + 3 -'], expected: 14, name: 'classic example' },
      { args: ['7 2 /'], expected: 3, name: 'floor division' },
      { args: ['1 +'], expected: '!ValueError', name: 'too few operands' },
      { args: ['2 3 ^'], expected: '!ValueError', name: 'unknown operator' },
      { args: ['4 0 /'], expected: '!ZeroDivisionError', name: 'divide by zero' },
      { args: ['1 2'], expected: '!ValueError', name: 'leftover operands' },
      { args: [''], expected: '!ValueError', name: 'empty' },
      { args: ['-3 2 *'], expected: -6, name: 'negative number' },
    ],
    hints: ['Scan tokens left to right with a stack: a number is pushed, an operator pops b then a (order matters for - and /) and pushes the result.', 'Let a factory function turn the symbol into an operator object (raise ValueError for unknown symbols). After the loop the stack must hold exactly one value.'],
    combines: ['stack-basics'],
  },
  quiz: [
    {
      prompt: 'What is the main benefit of a dict registry over a growing if/elif factory?',
      options: ['It is always faster', 'New types can be added without editing the factory logic', 'It removes the need for a common interface', 'It makes the classes immutable'],
      answer: 1,
      explain: 'A registry turns "add a type" into "add an entry", which is open/closed in practice.',
    },
  ],
};

export default unit;
