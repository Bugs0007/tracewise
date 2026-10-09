import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { FLAKY_HARNESS, MOCK_NOTE, Seq, kvPanel, logPanel, short, step } from '@/content/lib/ai-finish-2';

const code = `
def validate(text, schema):
    try:
        data = json.loads(text)                                      #@parse
    except ValueError:
        return None, ["invalid JSON"]                                #@bad_json
    errors = []
    for key, kind in schema.items():
        if key not in data:
            errors.append("missing field: " + key)                   #@missing
        elif not isinstance(data[key], TYPES[kind]):
            errors.append(key + ": expected " + kind)                #@type
    return (data if not errors else None), errors

def get_structured(llm, prompt, schema, max_retries):
    errors = []
    for attempt in range(max_retries + 1):                           #@attempt
        ask = prompt + ("\\nPrevious errors: " + "; ".join(errors) if errors else "")   #@feedback
        text = llm.complete(ask)                                     #@ask
        data, errors = validate(text, schema)                        #@validate
        if not errors:
            return {"data": data, "attempts": attempt + 1}           #@ok
    return {"data": None, "attempts": max_retries + 1}               #@giveup
`;

const SCHEMA: Record<string, string> = { name: 'str', age: 'int', tags: 'list' };
const GOOD = '{"name": "Ada", "age": 36, "tags": ["math"]}';
const SCENARIOS: Record<string, string> = {
  'prose around the JSON': 'Sure! Here is the JSON: {"name": "Ada", "age": 36, "tags": ["math"]}',
  'wrong type': '{"name": "Ada", "age": "36", "tags": ["math"]}',
  'missing field': '{"name": "Ada", "tags": ["math"]}',
  'never valid': 'I am sorry, I cannot do that.',
};
const NAMES = Object.keys(SCENARIOS);
const FEEDBACK_MODES = ['send errors back', 'resend same prompt'];

function validate(text: string): { ok: boolean; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['invalid JSON'] };
  }
  const errors: string[] = [];
  const obj = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  for (const [key, kind] of Object.entries(SCHEMA)) {
    const v = obj[key];
    if (!(key in obj)) errors.push('missing field: ' + key);
    else if (kind === 'str' ? typeof v !== 'string' : kind === 'int' ? !(typeof v === 'number' && Number.isInteger(v)) : !Array.isArray(v)) errors.push(`${key}: expected ${kind}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Flaky model: broken output until it sees the validator's feedback in the prompt (unless the scenario never recovers). */
function model(scenario: string, prompt: string): string {
  if (scenario === 'never valid') return SCENARIOS[scenario];
  return prompt.includes('Previous errors') ? GOOD : SCENARIOS[scenario];
}

interface In {
  scenario: string;
  feedback: string;
  max_retries: number;
}

function clean(i: In) {
  if (!SCENARIOS[i.scenario]) throw new Error('Pick one of: ' + NAMES.join(', '));
  if (!FEEDBACK_MODES.includes(i.feedback)) throw new Error('feedback must be one of: ' + FEEDBACK_MODES.join(', '));
  const n = Math.round(Number(i.max_retries));
  if (!Number.isFinite(n) || n < 0 || n > 4) throw new Error('max_retries must be between 0 and 4.');
  return { scenario: i.scenario, withFeedback: i.feedback === FEEDBACK_MODES[0], retries: n };
}

const viz: VizDef<In> = {
  id: 'ai-structured-output',
  title: 'Validate and repair model JSON',
  code,
  language: 'python',
  inputs: [
    { key: 'scenario', label: 'What the model gets wrong', kind: 'select', options: NAMES, default: NAMES[1] },
    { key: 'feedback', label: 'On retry', kind: 'select', options: FEEDBACK_MODES, default: FEEDBACK_MODES[0] },
    { key: 'max_retries', label: 'max_retries', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Wrong type, repaired', input: { scenario: 'wrong type', feedback: 'send errors back' } },
    { label: 'Same prompt again (bug)', input: { scenario: 'wrong type', feedback: 'resend same prompt' } },
    { label: 'Missing field', input: { scenario: 'missing field' } },
    { label: 'Never valid: give up', input: { scenario: 'never valid', max_retries: 1 } },
  ],
  run(input) {
    const { scenario, withFeedback, retries } = clean(input);
    const r = new Recorder(code);
    const seq = new Seq(['App', 'Model', 'Validator'], 'Retry loop');
    const log: { text: string; tone?: Tone }[] = [];
    let errors: string[] = [];
    let attempt = 0;
    const view = (): Panel[] => [seq.panel(8), logPanel('Attempts', log, 6), kvPanel('Loop', { attempt: `${attempt}/${retries + 1}`, 'feedback sent': withFeedback && errors.length > 0, 'last errors': errors.join('; ') || '(none)' })];
    const base = 'Extract the person as JSON.';
    step(r, 'attempt', `Up to ${retries + 1} attempts (1 try + ${retries} retries); schema: name, age, tags`, view(), { max_retries: retries });
    for (let a = 0; a <= retries; a++) {
      attempt = a + 1;
      const useFb = withFeedback && errors.length > 0;
      const prompt = base + (useFb ? '\nPrevious errors: ' + errors.join('; ') : '');
      r.op();
      step(r, 'feedback', useFb ? `Attempt ${attempt}: prompt now includes "${short(errors.join('; '), 34)}"` : a === 0 ? `Attempt ${attempt}: send the plain prompt` : `Attempt ${attempt}: the SAME prompt as before (no feedback)`, view(), { attempt });
      seq.send('App', 'Model', useFb ? 'prompt + errors' : 'prompt');
      const text = model(scenario, prompt);
      seq.send('Model', 'App', short(text, 40), 'compare', true);
      step(r, 'ask', `Model replies: ${short(text, 52)}`, view(), { attempt });
      const v = validate(text);
      errors = v.errors;
      seq.send('App', 'Validator', 'validate(text, schema)');
      seq.send('Validator', 'App', v.ok ? 'ok' : v.errors.join('; '), v.ok ? 'found' : 'error', true);
      log.push({ text: `#${attempt}: ${v.ok ? 'valid' : v.errors.join('; ')}`, tone: v.ok ? 'found' : 'error' });
      step(r, 'validate', v.ok ? 'Parses and matches the schema' : `Rejected: ${short(v.errors.join('; '), 60)}`, view(), { ok: v.ok });
      if (v.ok) {
        step(r, 'ok', `Valid after ${attempt} attempt${attempt > 1 ? 's' : ''}: return the parsed object`, view(), { attempts: attempt });
        return { frames: r.frames, result: { ok: true, attempts: attempt } };
      }
    }
    step(r, 'giveup', `Still invalid after ${retries + 1} attempts: give up with an error, do not guess`, view(), { attempts: retries + 1 });
    return { frames: r.frames, result: { ok: false, attempts: retries + 1 } };
  },
  reference(input) {
    const { scenario, withFeedback, retries } = clean(input);
    let errors: string[] = [];
    for (let a = 0; a <= retries; a++) {
      const prompt = 'x' + (withFeedback && errors.length ? 'Previous errors' : '');
      const v = validate(model(scenario, prompt));
      if (v.ok) return { ok: true, attempts: a + 1 };
      errors = v.errors;
    }
    return { ok: false, attempts: retries + 1 };
  },
};

const VALIDATE_PY = `import json

TYPES = {"str": str, "int": int, "list": list, "bool": bool}

def validate(text, schema):
    try:
        data = json.loads(text)
    except ValueError:
        return None, ["invalid JSON"]
    errors = []
    for key, kind in schema.items():
        if key not in data:
            errors.append("missing field: " + key)
        elif not isinstance(data[key], TYPES[kind]):
            errors.append(key + ": expected " + kind)
    return (data if not errors else None), errors
`;

const SCHEMA_PY = `
SCHEMA = {"name": "str", "age": "int", "tags": "list"}

def run_structured(fn, retries):
    llm = flaky_llm()
    out = fn(llm, "Extract the person as JSON.", SCHEMA, retries)
    return {"out": out, "calls": len(llm.calls)}

def run_boss(fn, outputs, retries):
    llm = MockLLM(outputs)
    out = fn(llm, "Extract.", SCHEMA, retries)
    return {"out": out, "calls": len(llm.calls), "prompts": [c["messages"][-1]["content"] for c in llm.calls]}
`;

const PERSON = { name: 'Ada', age: 36, tags: ['math'] };
const S = { name: 'str', age: 'int', tags: 'list' };

const unit: Unit = {
  id: 'ai-structured-output',
  hook: 'Anything downstream of a model needs parseable output, and models are flaky. Interviewers want validation against a schema, a bounded retry loop, and feedback that actually changes the next prompt.',
  predict: {
    prompt: 'The model returned JSON with age as the string "36". Your retry loop sends the exact same prompt again (temperature 0). What is the likely result?',
    options: ['It fixes itself on the second try', 'The same wrong output again, so retries are wasted', 'The provider auto-corrects the type', 'The JSON parser converts the string to an int'],
    answer: 1,
    explain: 'A deterministic model given an identical prompt repeats itself. Feed the validator errors back (or change the prompt, temperature or model) so the retry has new information.',
  },
  viz,
  deeper: {
    points: [
      'Prefer the provider\'s structured-output or JSON-schema mode when available, but still validate: schemas reduce errors, they do not remove them.',
      'Validate in two steps: does it parse, then does it match the schema (required fields, types, enums, ranges).',
      'Repair cheaply first: strip code fences and prose around the first "{" and last "}" before spending another model call.',
      'Retry with feedback: append the exact validation errors, and bound the number of attempts.',
      'On final failure return a typed error or fallback; never pass unvalidated model output downstream.',
    ],
    pitfalls: ['Retrying with an unchanged prompt', 'Treating True as a valid integer (bool is an int subclass in Python)', 'Unbounded retries that multiply cost'],
  },
  practice: {
    language: 'python',
    fnName: 'validate',
    statement: 'validate(text, schema) returns {"data", "errors"}. Invalid JSON -> data None, errors ["invalid JSON"]. A JSON value that is not an object -> ["not an object"]. Otherwise for each schema key in order: missing -> "missing field: <k>", wrong type -> "<k>: expected <kind>" (kinds: str, int, list, bool; a bool is NOT an int). data is the parsed object only when errors is empty.',
    signature: 'def validate(text, schema):',
    solution: `import json

TYPES = {"str": str, "int": int, "list": list, "bool": bool}

def validate(text, schema):
    try:
        data = @@json.loads(text)@@
    except ValueError:
        return {"data": None, "errors": ["invalid JSON"]}
    if not isinstance(data, dict):
        return {"data": None, "errors": ["not an object"]}
    errors = []
    for key, kind in schema.items():
        if @@key not in data@@:
            errors.append("missing field: " + key)
        elif not isinstance(data[key], TYPES[kind]) or (kind == "int" and @@isinstance(data[key], bool)@@):
            errors.append(key + ": expected " + kind)
    return {"data": data if not errors else None, "errors": errors}`,
    tests: [
      { args: [JSON.stringify(PERSON), S], expected: { data: PERSON, errors: [] }, name: 'valid' },
      { args: ['Sure! {"name": "Ada"}', S], expected: { data: null, errors: ['invalid JSON'] }, name: 'prose around the JSON' },
      { args: ['[1, 2]', S], expected: { data: null, errors: ['not an object'] }, name: 'array instead of object' },
      { args: ['{"name": "Ada", "tags": []}', S], expected: { data: null, errors: ['missing field: age'] }, name: 'missing field' },
      { args: ['{"name": 5, "age": "36", "tags": "x"}', S], expected: { data: null, errors: ['name: expected str', 'age: expected int', 'tags: expected list'] }, name: 'wrong types in schema order' },
      { args: ['{"name": "Ada", "age": true, "tags": []}', S], expected: { data: null, errors: ['age: expected int'] }, name: 'bool is not an int' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'get_structured',
    harness: FLAKY_HARNESS + SCHEMA_PY,
    adapter: 'run_structured',
    statement: 'get_structured(llm, prompt, schema, max_retries) asks the model, validates the reply and retries up to max_retries times. The model repairs its output when the prompt contains "Previous errors: ...", but the function never recovers and always gives up.',
    buggy: VALIDATE_PY + `
def get_structured(llm, prompt, schema, max_retries):
    errors = []
    for attempt in range(max_retries + 1):
        text = llm.complete(prompt)
        data, errors = validate(text, schema)
        if not errors:
            return {"data": data, "attempts": attempt + 1}
    return {"data": None, "attempts": max_retries + 1}`,
    fixed: VALIDATE_PY + `
def get_structured(llm, prompt, schema, max_retries):
    errors = []
    for attempt in range(max_retries + 1):
        ask = prompt + ("\\nPrevious errors: " + "; ".join(errors) if errors else "")
        text = llm.complete(ask)
        data, errors = validate(text, schema)
        if not errors:
            return {"data": data, "attempts": attempt + 1}
    return {"data": None, "attempts": max_retries + 1}`,
    tests: [
      { args: [2], expected: { out: { data: PERSON, attempts: 2 }, calls: 2 }, name: 'repaired on the first retry' },
      { args: [1], expected: { out: { data: PERSON, attempts: 2 }, calls: 2 }, name: 'one retry is enough' },
      { args: [0], expected: { out: { data: null, attempts: 1 }, calls: 1 }, name: 'no retries allowed' },
    ],
    bugType: 'retry re-sends the same prompt',
    hint: 'What is different about the prompt on attempt 2 compared with attempt 1?',
    explanation: 'The loop validated the reply but never used the errors. Each retry sent the identical prompt, so the model repeated its mistake. Append the validation errors to the next prompt.',
  },
  boss: {
    title: 'Self-repairing JSON extractor',
    statement: 'Write get_structured(llm, prompt, schema, max_retries). Each attempt: ask = prompt, plus "\\nPrevious errors: " + "; ".join(errors) when the last attempt had errors; text = llm.complete(ask). Repair: use only the slice from the first "{" to the last "}" (no braces -> errors ["invalid JSON"]). Parse it (invalid -> ["invalid JSON"]) and check each schema key in order: missing -> "missing field: <k>", wrong type -> "<k>: expected <kind>" (str, int, list; bool is not an int). No errors: return {"data", "attempts", "errors": []}. After max_retries + 1 attempts return {"data": None, "attempts": max_retries + 1, "errors": <last errors>}.',
    language: 'python',
    fnName: 'get_structured',
    harness: FLAKY_HARNESS + SCHEMA_PY,
    adapter: 'run_boss',
    starter: `import json

def get_structured(llm, prompt, schema, max_retries):
    # your code here
    pass
`,
    solution: `import json

TYPES = {"str": str, "int": int, "list": list}

def check(text, schema):
    lo, hi = text.find("{"), text.rfind("}")
    if lo < 0 or hi < lo:
        return None, ["invalid JSON"]
    try:
        data = json.loads(text[lo : hi + 1])
    except ValueError:
        return None, ["invalid JSON"]
    errors = []
    for key, kind in schema.items():
        if key not in data:
            errors.append("missing field: " + key)
        elif not isinstance(data[key], TYPES[kind]) or (kind == "int" and isinstance(data[key], bool)):
            errors.append(key + ": expected " + kind)
    return (data if not errors else None), errors

def get_structured(llm, prompt, schema, max_retries):
    errors = []
    for attempt in range(max_retries + 1):
        ask = prompt + ("\\nPrevious errors: " + "; ".join(errors) if errors else "")
        data, errors = check(llm.complete(ask), schema)
        if not errors:
            return {"data": data, "attempts": attempt + 1, "errors": []}
    return {"data": None, "attempts": max_retries + 1, "errors": errors}`,
    tests: [
      { args: [[JSON.stringify(PERSON)], 2], expected: { out: { data: PERSON, attempts: 1, errors: [] }, calls: 1, prompts: ['Extract.'] }, name: 'valid first time' },
      { args: [['Sure! ```json\n' + JSON.stringify(PERSON) + '\n``` Hope that helps'], 2], expected: { out: { data: PERSON, attempts: 1, errors: [] }, calls: 1, prompts: ['Extract.'] }, name: 'fences and prose are stripped' },
      {
        args: [['{"name": "Ada", "age": "36", "tags": []}', JSON.stringify(PERSON)], 2],
        expected: { out: { data: PERSON, attempts: 2, errors: [] }, calls: 2, prompts: ['Extract.', 'Extract.\nPrevious errors: age: expected int'] },
        name: 'wrong type, repaired with feedback',
      },
      {
        args: [['{"name": "Ada"}', JSON.stringify(PERSON)], 1],
        expected: { out: { data: PERSON, attempts: 2, errors: [] }, calls: 2, prompts: ['Extract.', 'Extract.\nPrevious errors: missing field: age; missing field: tags'] },
        name: 'several errors are joined',
      },
      { args: [['nope', 'nope', 'nope'], 2], expected: { out: { data: null, attempts: 3, errors: ['invalid JSON'] }, calls: 3, prompts: ['Extract.', 'Extract.\nPrevious errors: invalid JSON', 'Extract.\nPrevious errors: invalid JSON'] }, name: 'gives up after max_retries' },
      { args: [['{"name": "Ada", "age": true, "tags": []}'], 0], expected: { out: { data: null, attempts: 1, errors: ['age: expected int'] }, calls: 1, prompts: ['Extract.'] }, name: 'bool is not an int, no retries' },
    ],
    hints: ['Split the work: a helper that returns (data, errors) for one reply, and a loop that builds the prompt from the previous errors.', 'text.find("{") and text.rfind("}") give the slice to parse; json.loads raises ValueError when it is not valid.'],
    combines: ['ai-prompt-patterns'],
  },
  quiz: [
    {
      prompt: 'Which retry strategy is most likely to fix a schema violation?',
      options: ['Same prompt, same temperature 0', 'Same prompt but ask again louder', 'Prompt plus the validator\'s exact error messages, with a bounded number of attempts', 'Unlimited retries until it works'],
      answer: 2,
      explain: 'New information (the errors) changes the next completion, and a retry cap bounds cost and latency.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
