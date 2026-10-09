import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, chartPanel, kvPanel, short, step, words } from '@/content/lib/ai-finish-2';

const code = `
def exact(expected, got):
    return got.strip().lower() == expected.strip().lower()           #@exact

def judge_score(judge, question, expected, got):
    prompt = f"Question: {question}\\nExpected: {expected}\\nCandidate: {got}\\nScore 1-5:"
    return int(judge.complete(prompt))                                #@judge

def pass_rate(cases, outputs, judge=None, threshold=4):
    passed = 0
    for case, got in zip(cases, outputs):                             #@case
        if judge is None:
            ok = exact(case["expected"], got)
        else:
            ok = judge_score(judge, case["q"], case["expected"], got) >= threshold
        passed += ok                                                  #@score
    return passed / len(cases)                                        #@rate

def gate(baseline, candidate, tolerance):
    return round(baseline - candidate, 6) <= tolerance                #@gate
`;

const CASES = [
  { q: 'Capital of France?', expected: 'Paris' },
  { q: '2 + 2?', expected: '4' },
  { q: 'Largest planet?', expected: 'Jupiter' },
  { q: 'Chemical formula of water?', expected: 'H2O' },
  { q: 'Who wrote Hamlet?', expected: 'Shakespeare' },
  { q: 'Boiling point of water (C)?', expected: '100' },
];
const BASELINE = ['Paris', '4', 'Jupiter', 'H2O', 'Shakespeare', '99'];
const CANDIDATES: Record<string, string[]> = {
  'candidate-good': ['Paris', '4', 'Jupiter', 'H2O', 'Shakespeare', '100'],
  'candidate-regressed': ['Paris', '5', 'Saturn', 'H2O', 'Shakespeare', '100'],
  'candidate-rephrased': ['The capital is Paris.', 'It is 4.', 'Jupiter, the gas giant', 'H2O', 'William Shakespeare', '100 degrees'],
};
const NAMES = Object.keys(CANDIDATES);
const METRICS = ['exact match', 'LLM judge'];
const THRESHOLD = 4;

const exact = (e: string, g: string) => g.trim().toLowerCase() === e.trim().toLowerCase();

/** Mock judge: 5 when every expected word appears in the answer, otherwise 1 plus partial credit. */
function judge(expected: string, got: string): number {
  const exp = words(expected);
  const have = new Set(words(got));
  const hit = exp.filter((w) => have.has(w)).length;
  return hit === exp.length ? 5 : 1 + Math.floor((4 * hit) / exp.length);
}

interface In {
  candidate: string;
  metric: string;
  tolerance: number;
}

function clean(i: In) {
  if (!CANDIDATES[i.candidate]) throw new Error('Pick one of: ' + NAMES.join(', '));
  if (!METRICS.includes(i.metric)) throw new Error('metric must be "exact match" or "LLM judge".');
  const tol = Number(i.tolerance);
  if (!Number.isFinite(tol) || tol < 0 || tol > 1) throw new Error('tolerance must be between 0 and 1 (a fraction, e.g. 0.05).');
  return { outputs: CANDIDATES[i.candidate], useJudge: i.metric === METRICS[1], tol };
}

const okFor = (useJudge: boolean, c: { expected: string }, got: string) => (useJudge ? judge(c.expected, got) >= THRESHOLD : exact(c.expected, got));
const rate = (outs: string[], useJudge: boolean) => Math.round((outs.filter((g, i) => okFor(useJudge, CASES[i], g)).length / CASES.length) * 10000) / 10000;

const viz: VizDef<In> = {
  id: 'ai-evaluation',
  title: 'Golden set, judge and regression gate',
  code,
  language: 'python',
  inputs: [
    { key: 'candidate', label: 'Candidate model', kind: 'select', options: NAMES, default: NAMES[1] },
    { key: 'metric', label: 'Metric', kind: 'select', options: METRICS, default: METRICS[0] },
    { key: 'tolerance', label: 'Allowed drop (fraction)', kind: 'number', default: 0.05 },
  ],
  presets: [
    { label: 'Regression is blocked', input: { candidate: 'candidate-regressed', metric: 'exact match' } },
    { label: 'Improvement ships', input: { candidate: 'candidate-good', metric: 'exact match' } },
    { label: 'Exact match is brittle', input: { candidate: 'candidate-rephrased', metric: 'exact match' } },
    { label: 'Judge accepts rephrasing', input: { candidate: 'candidate-rephrased', metric: 'LLM judge' } },
  ],
  run(input) {
    const { outputs, useJudge, tol } = clean(input);
    const r = new Recorder(code);
    const rows: string[][] = [];
    const tones: Record<string, Tone> = {};
    let passed = 0;
    const table = (): Panel => ({ type: 'grid', title: 'Golden set results', cells: rows.map((x) => [...x]), tones: { ...tones }, colLabels: ['expected', 'got', 'exact', 'judge'], rowLabels: rows.map((_, i) => `#${i + 1}`) });
    step(r, 'case', `Golden set: ${CASES.length} questions with known answers; run the candidate on each`, [{ type: 'grid', title: 'Golden set', cells: CASES.map((c) => [c.expected]), colLabels: ['expected'], rowLabels: CASES.map((_, i) => `#${i + 1}`) }], { cases: CASES.length });
    CASES.forEach((c, i) => {
      r.op();
      const got = outputs[i];
      const ex = exact(c.expected, got);
      const js = judge(c.expected, got);
      rows.push([c.expected, short(got, 22), ex ? 'pass' : 'fail', '…']);
      tones[`${i},2`] = ex ? 'found' : 'error';
      step(r, 'exact', `#${i + 1} ${short(c.q, 26)}: exact match ${ex ? 'passes' : 'fails'} ("${short(got, 24)}")`, [table()], { case: i + 1, exact: ex });
      rows[i][3] = `${js}/5`;
      tones[`${i},3`] = js >= THRESHOLD ? 'found' : 'error';
      const ok = okFor(useJudge, c, got);
      if (ok) passed++;
      step(r, 'judge', `#${i + 1} mock judge scores ${js}/5 (pass needs ${THRESHOLD}); counted with ${useJudge ? 'the judge' : 'exact match'}: ${ok ? 'pass' : 'fail'}`, [table()], { case: i + 1, judge: js, passed });
    });
    const cand = Math.round((passed / CASES.length) * 10000) / 10000;
    const base = rate(BASELINE, useJudge);
    step(r, 'rate', `Candidate pass rate (${useJudge ? 'judge' : 'exact'}): ${passed}/${CASES.length} = ${cand}`, [table(), kvPanel('Rates', { baseline: base, candidate: cand })], { candidate: cand });
    const gateOk = Math.round((base - cand) * 1e6) / 1e6 <= tol;
    step(
      r,
      'gate',
      gateOk ? `Gate: drop ${Math.max(0, Math.round((base - cand) * 100))} pts ≤ allowed ${Math.round(tol * 100)} pts, so ship` : `Gate: drop ${Math.round((base - cand) * 100)} pts > allowed ${Math.round(tol * 100)} pts: block the release`,
      [chartPanel('Pass rate', [{ label: 'baseline', points: [[0, base]], tone: 'visited' }, { label: 'candidate', points: [[1, cand]], tone: gateOk ? 'found' : 'error' }], 'model (0 = baseline, 1 = candidate)', 'pass rate', 'bar'), kvPanel('Release gate', { baseline: base, candidate: cand, tolerance: tol, decision: gateOk ? 'ship' : 'block' }, { decision: gateOk ? 'found' : 'error' })],
      { gate: gateOk },
    );
    return { frames: r.frames, result: { baseline: base, candidate: cand, ship: gateOk } };
  },
  reference(input) {
    const { outputs, useJudge, tol } = clean(input);
    const base = rate(BASELINE, useJudge);
    const cand = rate(outputs, useJudge);
    return { baseline: base, candidate: cand, ship: Math.round((base - cand) * 1e6) / 1e6 <= tol };
  },
};

const GC = [
  { q: 'Capital of France?', expected: 'Paris' },
  { q: '2+2?', expected: '4' },
  { q: 'Largest planet?', expected: 'Jupiter' },
];

const unit: Unit = {
  id: 'ai-evaluation',
  hook: 'Without an evaluation set you cannot tell whether a prompt or model change helped. Interviewers want golden sets, a metric that fits the task, and an automated gate before release.',
  predict: {
    prompt: 'A new model version answers "The capital is Paris." where the golden answer is "Paris". An exact-match check marks it as...',
    options: ['Correct', 'Wrong, even though the answer is right', 'Skipped', 'Partially correct'],
    answer: 1,
    explain: 'Exact match compares strings, not meaning. Free-form answers need normalisation, a contains-check, or an LLM judge with a clear rubric.',
  },
  viz,
  deeper: {
    points: [
      'A golden set is a fixed list of inputs with expected outputs (or expectations). Version it and grow it from real failures.',
      'Exact match suits short factual or structured outputs; for free text use rubric-based LLM-as-judge or human review.',
      'A judge is a model too: pin its prompt, ask for a bounded score, parse defensively and spot-check it against human labels.',
      'A regression gate compares the candidate with the current baseline on the same set and blocks a release that drops by more than a tolerance.',
      'Track failures per case, not only the average: one broken category can hide behind a good mean.',
    ],
    pitfalls: ['Gating on a metric that punishes harmless rephrasing', 'Comparing floats without rounding at the threshold', 'Tuning the prompt on the same cases you report'],
  },
  practice: {
    language: 'python',
    fnName: 'evaluate',
    compare: 'float',
    statement: 'evaluate(cases, outputs) compares each output with case["expected"] after lower-casing and collapsing whitespace. Return {"passed", "total", "rate" (passed/total rounded to 4 places, 0.0 when there are no cases), "failures": [case["q"] for each miss]}.',
    signature: 'def evaluate(cases, outputs):',
    solution: `def normalize(s):
    return " ".join(s.lower().split())

def evaluate(cases, outputs):
    failures = []
    for case, got in zip(cases, outputs):
        if @@normalize(got) != normalize(case["expected"])@@:
            failures.append(case["q"])
    total = len(cases)
    passed = @@total - len(failures)@@
    rate = @@round(passed / total, 4) if total else 0.0@@
    return {"passed": passed, "total": total, "rate": rate, "failures": failures}`,
    tests: [
      { args: [GC, ['Paris', '4', 'Jupiter']], expected: { passed: 3, total: 3, rate: 1, failures: [] }, name: 'all correct' },
      { args: [GC, ['Paris', '5', 'Saturn']], expected: { passed: 1, total: 3, rate: 0.3333, failures: ['2+2?', 'Largest planet?'] }, name: 'two misses' },
      { args: [GC, ['  paris ', '4', 'JUPITER']], expected: { passed: 3, total: 3, rate: 1, failures: [] }, name: 'case and spaces are ignored' },
      { args: [[{ q: 'Name?', expected: 'Ada  Lovelace' }], ['ada lovelace']], expected: { passed: 1, total: 1, rate: 1, failures: [] }, name: 'inner whitespace collapses' },
      { args: [[], []], expected: { passed: 0, total: 0, rate: 0, failures: [] }, name: 'empty golden set' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'gate',
    statement: 'gate(baseline, candidate, tolerance) returns True when the candidate pass rate has not dropped by more than tolerance. A candidate that is much better than the baseline is wrongly blocked.',
    buggy: `def gate(baseline, candidate, tolerance):
    return abs(round(candidate - baseline, 6)) <= tolerance`,
    fixed: `def gate(baseline, candidate, tolerance):
    return round(baseline - candidate, 6) <= tolerance`,
    tests: [
      { args: [0.8, 0.9, 0.05], expected: true, name: 'improvement ships' },
      { args: [0.8, 0.7, 0.05], expected: false, name: 'big drop blocked' },
      { args: [0.8, 0.75, 0.05], expected: true, name: 'drop equal to tolerance ships' },
      { args: [0.8, 0.8, 0], expected: true, name: 'no change with zero tolerance' },
      { args: [0.5, 0.96, 0.1], expected: true, name: 'huge improvement' },
    ],
    bugType: 'gate rejects improvements',
    hint: 'Which direction of change should be allowed to exceed the tolerance?',
    explanation: 'abs() treats a large improvement like a large regression. Only a drop (baseline minus candidate) should be compared with the tolerance; rounding avoids 0.05000000000000004 surprises.',
  },
  boss: {
    title: 'LLM-as-judge scorer',
    statement: 'Write judge_eval(judge, cases, outputs, threshold). For each case/output pair build the prompt "Question: <q>\\nExpected: <expected>\\nCandidate: <got>\\nScore 1-5:" and call judge.complete(prompt). The reply (stripped) must be one of "1".."5"; anything else counts as invalid and scores 1. Return {"scores": [...], "pass_rate": (scores >= threshold)/len(cases) rounded to 4 places (0.0 for no cases), "invalid": number of invalid replies}.',
    language: 'python',
    fnName: 'judge_eval',
    compare: 'float',
    harness: `
from minillm import MockLLM

def run_judge(fn, script, cases, outputs, threshold):
    judge = MockLLM(script)
    out = fn(judge, cases, outputs, threshold)
    return {"out": out, "judge_calls": len(judge.calls)}
`,
    adapter: 'run_judge',
    starter: `def judge_eval(judge, cases, outputs, threshold):
    # your code here
    pass
`,
    solution: `def judge_eval(judge, cases, outputs, threshold):
    scores = []
    invalid = 0
    for case, got in zip(cases, outputs):
        prompt = "Question: " + case["q"] + "\\nExpected: " + case["expected"] + "\\nCandidate: " + got + "\\nScore 1-5:"
        reply = judge.complete(prompt).strip()
        if reply in ("1", "2", "3", "4", "5"):
            scores.append(int(reply))
        else:
            scores.append(1)
            invalid += 1
    passed = sum(1 for s in scores if s >= threshold)
    rate = round(passed / len(cases), 4) if cases else 0.0
    return {"scores": scores, "pass_rate": rate, "invalid": invalid}`,
    tests: [
      { args: [{ 'Candidate: Paris\n': '5', 'Candidate: 4\n': '4', 'Candidate: Saturn\n': '2' }, GC, ['Paris', '4', 'Saturn'], 4], expected: { out: { scores: [5, 4, 2], pass_rate: 0.6667, invalid: 0 }, judge_calls: 3 }, name: 'three scored answers' },
      { args: [{ 'Candidate: Paris\n': 'five', '*': '3' }, GC, ['Paris', '4', 'Saturn'], 3], expected: { out: { scores: [1, 3, 3], pass_rate: 0.6667, invalid: 1 }, judge_calls: 3 }, name: 'non-numeric reply is invalid' },
      { args: [{ '*': '7' }, GC, ['a', 'b', 'c'], 1], expected: { out: { scores: [1, 1, 1], pass_rate: 1, invalid: 3 }, judge_calls: 3 }, name: 'out-of-range scores are invalid' },
      { args: [{ '*': ' 4\n' }, GC, ['a', 'b', 'c'], 4], expected: { out: { scores: [4, 4, 4], pass_rate: 1, invalid: 0 }, judge_calls: 3 }, name: 'reply is stripped' },
      { args: [{ '*': '5' }, [], [], 4], expected: { out: { scores: [], pass_rate: 0, invalid: 0 }, judge_calls: 0 }, name: 'no cases' },
    ],
    hints: ['Build the prompt exactly in the given format; the mock judge matches on the "Candidate: ...\\n" part.', 'Check reply.strip() against the strings "1".."5" instead of calling int() blindly: int("five") raises.'],
    combines: ['rag-evaluation', 'ai-structured-output'],
  },
  quiz: [
    {
      prompt: 'Why compare a candidate with a baseline on the same golden set instead of just reading its score?',
      options: ['Scores are meaningless', 'To detect regressions relative to what is already in production, with the same difficulty', 'Baselines are free', 'It avoids needing a metric'],
      answer: 1,
      explain: 'An absolute score depends on the set; a paired comparison tells you whether the change made things better or worse.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;
