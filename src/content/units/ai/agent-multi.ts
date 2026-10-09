import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, Seq, kvPanel, logPanel, short, step } from '@/content/lib/ai-finish-2';

const code = `
def route(subtask, workers):
    text = set(re.findall(r"[a-z0-9]+", subtask.lower()))
    for name, keywords in workers.items():
        if any(k in text for k in keywords):                     #@match
            return name
    return None                                                  #@none

def supervise(task, workers, run_worker):
    results = []
    for subtask in task.split(";"):                              #@split
        name = route(subtask.strip(), workers)                   #@route
        if name is None:
            results.append(("unrouted", subtask))                #@skip
            continue
        results.append((name, run_worker(name, subtask)))        #@call
    return results                                               #@done

def pipeline(stages, text):
    for stage in stages:                                         #@stage
        text = stage(text)                                       #@pass
    return text
`;

const WORKERS: Record<string, string[]> = {
  researcher: ['find', 'search', 'capital', 'population'],
  calculator: ['add', 'sum', 'calculate', 'total'],
  writer: ['write', 'summary', 'summarise', 'draft'],
};
const LABEL: Record<string, string> = { researcher: 'Researcher', calculator: 'Calculator', writer: 'Writer' };

function routeOf(sub: string): { name: string | null; key?: string } {
  const text = new Set(sub.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  for (const [name, kws] of Object.entries(WORKERS)) {
    const key = kws.find((k) => text.has(k));
    if (key) return { name, key };
  }
  return { name: null };
}

function work(name: string, sub: string, prior: string[]): string {
  const s = sub.toLowerCase();
  if (name === 'researcher') {
    const out = [s.includes('capital') ? 'Paris' : '', s.includes('population') ? '2.1 million' : ''].filter(Boolean);
    return out.length ? out.join(', ') : 'no results';
  }
  if (name === 'calculator') return String((sub.match(/\d+/g) ?? []).reduce((a, n) => a + Number(n), 0));
  return 'Summary: ' + (prior.length ? prior.join(' / ') : sub);
}

const PATTERNS = ['supervisor', 'pipeline'];

interface In {
  pattern: string;
  request: string;
}

function parts(request: string): string[] {
  const subs = request.split(';').map((s) => s.trim()).filter(Boolean);
  if (!subs.length) throw new Error('Write at least one subtask, separated by ";".');
  return subs;
}

const viz: VizDef<In> = {
  id: 'agent-multi',
  title: 'Supervisor/worker and pipeline agents',
  code,
  language: 'python',
  inputs: [
    { key: 'pattern', label: 'Pattern', kind: 'select', options: PATTERNS, default: 'supervisor' },
    { key: 'request', label: 'Request (subtasks split by ;)', kind: 'string', default: 'find the capital of France; add 2 and 3; write a summary' },
  ],
  presets: [
    { label: 'Supervisor routes', input: { pattern: 'supervisor' } },
    { label: 'Unroutable subtask', input: { pattern: 'supervisor', request: 'find the capital of France; book a flight; add 4 and 4' } },
    { label: 'Pipeline', input: { pattern: 'pipeline' } },
  ],
  run({ pattern, request }) {
    if (!PATTERNS.includes(pattern)) throw new Error('Pattern must be supervisor or pipeline.');
    const subs = parts(request);
    const r = new Recorder(code);
    const results: [string, string][] = [];
    const log: { text: string; tone?: Tone }[] = [];
    if (pattern === 'supervisor') {
      const seq = new Seq(['User', 'Supervisor', 'Researcher', 'Calculator', 'Writer'], 'Message flow');
      const view = (): Panel[] => [seq.panel(8), logPanel('Results', log, 6)];
      seq.send('User', 'Supervisor', short(request, 40));
      step(r, 'split', `Supervisor splits the request into ${subs.length} subtasks`, view(), { subtasks: subs.length });
      const prior: string[] = [];
      for (const sub of subs) {
        r.op();
        const { name, key } = routeOf(sub);
        if (!name) {
          log.push({ text: `unrouted: ${short(sub, 30)}`, tone: 'error' });
          results.push(['unrouted', sub]);
          seq.send('Supervisor', 'User', `no worker for "${short(sub, 20)}"`, 'error', true);
          step(r, 'none', `"${short(sub, 32)}" matches no worker keyword, so it is not routed`, view(), { routed: 'none' });
          step(r, 'skip', 'Record it as unrouted instead of guessing a worker', view(), { results: results.length });
          continue;
        }
        seq.send('Supervisor', LABEL[name], short(sub, 38));
        step(r, 'route', `"${short(sub, 28)}" has the word "${key}", so route to ${name}`, view(), { routed: name });
        const out = work(name, sub, name === 'writer' ? prior : []);
        prior.push(out);
        results.push([name, out]);
        log.push({ text: `${name}: ${short(out, 34)}`, tone: 'found' });
        seq.send(LABEL[name], 'Supervisor', short(out, 38), 'found', true);
        step(r, 'call', `${LABEL[name]} returns "${short(out, 34)}" to the supervisor`, view(), { results: results.length });
      }
      seq.send('Supervisor', 'User', `${results.length} results`, 'done', true);
      step(r, 'done', `Supervisor collects ${results.length} results and replies to the user`, view(), { results: results.length });
    } else {
      const names = ['researcher', 'calculator', 'writer'];
      const seq = new Seq(['User', 'Researcher', 'Calculator', 'Writer'], 'Message flow');
      const view = (): Panel[] => [seq.panel(8), logPanel('Stage outputs', log, 6), kvPanel('Pipeline', { stages: names.length, done: results.length })];
      seq.send('User', 'Researcher', short(request, 40));
      step(r, 'stage', 'A pipeline has a fixed order: each stage passes its output to the next', view(), { stage: 0 });
      let text = request;
      const prior: string[] = [];
      names.forEach((name, i) => {
        r.op();
        const out = work(name, text, name === 'writer' ? prior : []);
        prior.push(out);
        results.push([name, out]);
        log.push({ text: `${name}: ${short(out, 34)}`, tone: 'found' });
        const next = names[i + 1];
        seq.send(LABEL[name], next ? LABEL[next] : 'User', short(out, 38), next ? 'active' : 'done', true);
        step(r, 'pass', `${LABEL[name]} outputs "${short(out, 30)}" and ${next ? 'hands it to ' + LABEL[next] : 'the pipeline ends'}`, view(), { stage: i + 1 });
        text = out + ' | ' + text;
      });
    }
    return { frames: r.frames, result: { results } };
  },
  reference({ pattern, request }) {
    const subs = parts(request);
    if (pattern === 'pipeline') {
      const a = work('researcher', request, []);
      const b = work('calculator', a + ' | ' + request, []);
      return { results: [['researcher', a], ['calculator', b], ['writer', work('writer', b, [a, b])]] };
    }
    const results: [string, string][] = [];
    const prior: string[] = [];
    for (const s of subs) {
      const { name } = routeOf(s);
      if (!name) results.push(['unrouted', s]);
      else {
        const o = work(name, s, name === 'writer' ? prior : []);
        prior.push(o);
        results.push([name, o]);
      }
    }
    return { results };
  },
};

const MULTI_HARNESS = `
import re
from minillm import MockLLM

WORKERS = {
    "researcher": ["find", "search", "capital", "population"],
    "calculator": ["add", "sum", "calculate", "total"],
    "writer": ["write", "summary", "draft"],
}

HANDLERS = {
    "researcher": lambda s: "Paris" if "capital" in s.lower() else "no results",
    "calculator": lambda s: str(sum(int(n) for n in re.findall(r"\\d+", s))),
    "writer": lambda s: "Summary: " + s,
}
`;

const ROUTE_WORKERS = { researcher: ['find', 'search', 'capital'], calculator: ['add', 'sum'], writer: ['write', 'summary'] };

const SUPERVISE_OK = `import re

def route(subtask, workers):
    text = set(re.findall(r"[a-z0-9]+", subtask.lower()))
    for name, keywords in workers.items():
        if any(k in text for k in keywords):
            return name
    return None

def supervise(task, workers, handlers):
    results = []
    for subtask in task.split(";"):
        subtask = subtask.strip()
        name = route(subtask, workers)
        if name is None:
            results.append(("unrouted", subtask))
        else:
            results.append((name, handlers[name](subtask)))
    return results`;

const unit: Unit = {
  id: 'agent-multi',
  hook: 'Multi-agent systems are usually just routing plus message passing. Interviewers ask when a supervisor beats a fixed pipeline and what happens when the router picks nothing, or something that does not exist.',
  predict: {
    prompt: 'A supervisor receives a subtask that none of its workers can handle. What should it do?',
    options: ['Pick the first worker anyway', 'Send it to every worker and hope', 'Report it as unrouted (or ask for clarification) instead of guessing', 'Retry routing forever'],
    answer: 2,
    explain: 'Guessing sends the subtask to a worker with the wrong tools, and endless retries burn budget. An explicit "no route" outcome keeps the failure visible and handleable.',
  },
  viz,
  deeper: {
    points: [
      'Supervisor/worker: one agent decides who acts next, workers are specialists with small tool sets. Good when the path depends on the input.',
      'Pipeline: a fixed chain (plan, research, write). Cheap, predictable and easy to test, but it cannot skip or repeat stages.',
      'Message flow matters: workers should return concise results, not their whole reasoning, or the supervisor context balloons.',
      'Treat the router like any model output: validate that the chosen worker exists, and cap the number of hops.',
      'Start with one agent and one good prompt; split into several only when tools or prompts genuinely conflict.',
    ],
    pitfalls: ['Router names a worker that does not exist', 'No hop limit, so supervisor and worker ping-pong', 'Overwriting the accumulated results instead of appending'],
  },
  practice: {
    language: 'python',
    fnName: 'route',
    statement: 'route(subtask, workers) returns the name of the first worker (in dict order) one of whose keywords is a whole word of the lower-cased subtask (so "sum" does not match "summary"), or None if no worker matches.',
    signature: 'def route(subtask, workers):',
    solution: `import re

def route(subtask, workers):
    text = @@set(re.findall(r"[a-z0-9]+", subtask.lower()))@@
    for name, keywords in workers.items():
        if any(@@k in text@@ for k in keywords):
            return @@name@@
    return None`,
    tests: [
      { args: ['Find the capital of France', ROUTE_WORKERS], expected: 'researcher', name: 'keyword match' },
      { args: ['ADD 2 and 3', ROUTE_WORKERS], expected: 'calculator', name: 'case-insensitive' },
      { args: ['write a summary', ROUTE_WORKERS], expected: 'writer', name: 'third worker' },
      { args: ['book a flight', ROUTE_WORKERS], expected: null, name: 'no worker matches' },
      { args: ['address the summary', ROUTE_WORKERS], expected: 'writer', name: 'whole words only' },
      { args: ['sum 2 and 3, please', ROUTE_WORKERS], expected: 'calculator', name: 'punctuation is not part of a word' },
      { args: ['find the sum', ROUTE_WORKERS], expected: 'researcher', name: 'first worker in dict order wins' },
      { args: ['hello', {}], expected: null, name: 'no workers' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'supervise',
    harness: MULTI_HARNESS + `
def run_supervise(fn, task):
    return fn(task, WORKERS, HANDLERS)
`,
    adapter: 'run_supervise',
    statement: 'supervise(task, workers, handlers) must return one (name, output) pair per subtask, with ("unrouted", subtask) for subtasks no worker handles. After an unroutable subtask the earlier results vanish.',
    buggy: SUPERVISE_OK.replace('results.append(("unrouted", subtask))', 'results = [("unrouted", subtask)]'),
    fixed: SUPERVISE_OK,
    tests: [
      { args: ['find the capital; add 2 and 3'], expected: [['researcher', 'Paris'], ['calculator', '5']], name: 'two routed' },
      { args: ['book a flight'], expected: [['unrouted', 'book a flight']], name: 'only unrouted' },
      { args: ['add 1 and 1; book a flight; add 2 and 2'], expected: [['calculator', '2'], ['unrouted', 'book a flight'], ['calculator', '4']], name: 'unrouted in the middle keeps the rest' },
      { args: ['find the capital; teleport me'], expected: [['researcher', 'Paris'], ['unrouted', 'teleport me']], name: 'unrouted last keeps earlier results' },
    ],
    bugType: 'overwritten accumulator',
    hint: 'Compare the two branches of the if: one adds to results, what does the other do to it?',
    explanation: 'results = [...] rebinds the list, dropping everything gathered so far. Every branch must append to the same accumulator.',
  },
  boss: {
    title: 'Supervisor with an LLM router',
    statement: 'Write supervise(llm, workers, task, max_hops). Split task on ";", strip each part and drop empty ones. Handle at most max_hops subtasks in order. For each, name = llm.complete("Route this subtask: " + subtask).strip(). If name is a key of workers (a dict of callables) record [name, workers[name](subtask)], otherwise record ["unrouted", subtask] and never call anything. Return {"results": [...], "skipped": number of subtasks left unhandled}.',
    language: 'python',
    fnName: 'supervise',
    harness: MULTI_HARNESS + `
def run_boss(fn, script, task, max_hops):
    llm = MockLLM(script)
    out = fn(llm, HANDLERS, task, max_hops)
    return {"out": out, "llm_calls": len(llm.calls)}
`,
    adapter: 'run_boss',
    starter: `def supervise(llm, workers, task, max_hops):
    # your code here
    pass
`,
    solution: `def supervise(llm, workers, task, max_hops):
    subtasks = [s.strip() for s in task.split(";") if s.strip()]
    results = []
    for subtask in subtasks[:max_hops]:
        name = llm.complete("Route this subtask: " + subtask).strip()
        if name in workers:
            results.append([name, workers[name](subtask)])
        else:
            results.append(["unrouted", subtask])
    return {"results": results, "skipped": max(0, len(subtasks) - max_hops)}`,
    tests: [
      { args: [{ capital: 'researcher\n', add: 'calculator', '*': 'wizard' }, 'find the capital; add 2 and 3', 5], expected: { out: { results: [['researcher', 'Paris'], ['calculator', '5']], skipped: 0 }, llm_calls: 2 }, name: 'two routed (router output is stripped)' },
      { args: [{ capital: 'researcher', add: 'calculator', '*': 'wizard' }, 'book a flight; add 4 and 4', 5], expected: { out: { results: [['unrouted', 'book a flight'], ['calculator', '8']], skipped: 0 }, llm_calls: 2 }, name: 'hallucinated worker is not executed' },
      { args: [{ add: 'calculator' }, 'add 1 and 1; add 2 and 2; add 3 and 3', 2], expected: { out: { results: [['calculator', '2'], ['calculator', '4']], skipped: 1 }, llm_calls: 2 }, name: 'max_hops limits the work' },
      { args: [{ add: 'calculator' }, ' add 1 and 2 ;; ', 3], expected: { out: { results: [['calculator', '3']], skipped: 0 }, llm_calls: 1 }, name: 'empty parts ignored' },
      { args: [{ '*': 'writer' }, 'tidy this up', 0], expected: { out: { results: [], skipped: 1 }, llm_calls: 0 }, name: 'zero hops' },
    ],
    hints: ['Build the cleaned list of subtasks first; slice it with [:max_hops] for the work and compare lengths for skipped.', 'Check "name in workers" before calling anything: the router is a model and can invent worker names.'],
    combines: ['agent-react-loop', 'agent-tool-calling'],
  },
  quiz: [
    {
      prompt: 'Which problem is a fixed pipeline better suited to than a supervisor?',
      options: ['Tasks where the next step depends on what was found', 'A predictable sequence such as extract, then validate, then summarise', 'Open-ended exploration', 'Choosing between many tools at run time'],
      answer: 1,
      explain: 'When the steps never change a pipeline is cheaper, faster and trivially testable. Use a supervisor only when routing really depends on the data.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
