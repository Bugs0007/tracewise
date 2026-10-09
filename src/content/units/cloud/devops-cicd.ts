import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kv, log, step } from '@/content/lib/cloud-devops';

const code = `
def run_pipeline(stages, failing, fail_fast=True):
    status = {}
    for st in stages:                                           #@loop
        name = st["name"]
        if fail_fast and "failed" in status.values():           #@failfast
            status[name] = "skipped"
            continue
        if any(status[n] != "passed" for n in st["needs"]):     #@needs
            status[name] = "skipped"                            #@skip
            continue
        ok = name not in failing                                #@run
        status[name] = "passed" if ok else "failed"             #@mark
    return status

def needs_rollback(status):
    return status["deploy-staging"] == "failed" or status["production"] == "failed"   #@rollback
`;

interface Stage {
  name: string;
  needs: string[];
  label: string;
  x: number;
  y: number;
  what: string;
}

const STAGES: Stage[] = [
  { name: 'commit', needs: [], label: 'commit', x: 50, y: 110, what: 'Push triggers the pipeline for v42' },
  { name: 'build', needs: ['commit'], label: 'build', x: 150, y: 110, what: 'Compile and package the artifact' },
  { name: 'test', needs: ['build'], label: 'test', x: 270, y: 55, what: 'Run unit and integration tests' },
  { name: 'scan', needs: ['build'], label: 'scan', x: 270, y: 165, what: 'Scan dependencies and image for CVEs' },
  { name: 'deploy-staging', needs: ['test', 'scan'], label: 'staging', x: 390, y: 110, what: 'Deploy v42 to the staging environment' },
  { name: 'approval', needs: ['deploy-staging'], label: 'approval', x: 495, y: 110, what: 'A reviewer approves the release' },
  { name: 'production', needs: ['approval'], label: 'prod', x: 600, y: 110, what: 'Roll v42 out to production' },
];

const FAILS = ['none', 'build', 'test', 'scan', 'deploy-staging', 'approval', 'production'];
const FF = ['yes', 'no'];

type St = 'queued' | 'running' | 'passed' | 'failed' | 'skipped';

const TONE: Record<St, Tone> = { queued: 'default', running: 'active', passed: 'done', failed: 'error', skipped: 'muted' };

interface In {
  fail: string;
  failFast: string;
}

/** Pure model of the runner, written as a fixpoint over reverse edges (used as the independent reference). */
function referenceRun(fail: string, failFast: boolean): { status: Record<string, string>; rollback: boolean } {
  const idx = STAGES.findIndex((s) => s.name === fail);
  const status: Record<string, string> = {};
  const poisoned = new Set<string>();
  if (idx >= 0) {
    const stack = [fail];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const s of STAGES) if (s.needs.includes(cur) && !poisoned.has(s.name)) {
        poisoned.add(s.name);
        stack.push(s.name);
      }
    }
  }
  STAGES.forEach((s, i) => {
    if (s.name === fail) status[s.name] = 'failed';
    else if (idx >= 0 && i > idx && (failFast || poisoned.has(s.name))) status[s.name] = 'skipped';
    else status[s.name] = 'passed';
  });
  return { status, rollback: status['deploy-staging'] === 'failed' || status['production'] === 'failed' };
}

function graph(status: Record<string, St>, title: string): GraphPanel {
  const nodes: GraphNode[] = STAGES.map((s) => {
    const st = status[s.name] ?? 'queued';
    return { id: s.name, label: s.label, x: s.x, y: s.y, shape: 'rect', w: 80, h: 34, tone: TONE[st], badge: st === 'queued' ? '' : st };
  });
  const edges: GraphEdge[] = [];
  for (const s of STAGES)
    for (const n of s.needs) {
      const from = status[n] ?? 'queued';
      const to = status[s.name] ?? 'queued';
      edges.push({ from: n, to: s.name, directed: true, tone: to === 'skipped' ? 'muted' : from === 'passed' ? 'done' : from === 'failed' ? 'error' : 'default', flow: to === 'running' });
    }
  return { type: 'graph', title, nodes, edges, directed: true, width: 660, height: 215 };
}

const viz: VizDef<In> = {
  id: 'devops-cicd',
  title: 'CI/CD pipeline',
  code,
  language: 'python',
  inputs: [
    { key: 'fail', label: 'Inject a failure at', kind: 'select', options: FAILS, default: 'none' },
    { key: 'failFast', label: 'Fail fast', kind: 'select', options: FF, default: 'yes', help: 'yes: after any failure, stop starting new stages. no: only stages that depend on the failure are skipped.' },
  ],
  presets: [
    { label: 'Happy path', input: { fail: 'none', failFast: 'yes' } },
    { label: 'Tests fail (fail fast)', input: { fail: 'test', failFast: 'yes' } },
    { label: 'Tests fail (no fail fast)', input: { fail: 'test', failFast: 'no' } },
    { label: 'Prod fails, rollback', input: { fail: 'production', failFast: 'yes' } },
  ],
  run({ fail, failFast }) {
    if (!FAILS.includes(fail)) throw new Error(`fail must be one of ${FAILS.join(', ')}`);
    const ff = failFast !== 'no';
    const r = new Recorder(code);
    const status: Record<string, St> = {};
    const env: Record<string, string> = { staging: 'v41', production: 'v41' };
    const envTones: Record<string, Tone> = {};
    const lines: { text: string; tone?: Tone }[] = [];
    const view = (title: string): Panel[] => [graph(status, title), kv('Environments', env, envTones), log('Pipeline log', lines)];

    step(r, 'loop', `Commit pushed: pipeline for v42 starts (fail fast: ${ff ? 'on' : 'off'}, failure at: ${fail})`, view('Pipeline'), { fail, fail_fast: ff });
    for (const s of STAGES) {
      r.op();
      const anyFailed = Object.values(status).includes('failed');
      if (ff && anyFailed) {
        status[s.name] = 'skipped';
        lines.push({ text: `${s.name}: skipped (fail fast)`, tone: 'muted' });
        step(r, 'failfast', `${s.name} skipped: a stage already failed and fail fast is on`, view('Pipeline'), { stage: s.name });
        continue;
      }
      const blocked = s.needs.find((n) => status[n] !== 'passed');
      if (blocked) {
        status[s.name] = 'skipped';
        lines.push({ text: `${s.name}: skipped (${blocked} did not pass)`, tone: 'muted' });
        step(r, 'skip', `${s.name} skipped: its dependency ${blocked} is ${status[blocked]}`, view('Pipeline'), { stage: s.name });
        continue;
      }
      status[s.name] = 'running';
      step(r, 'run', `${s.name}: ${s.what}`, view('Pipeline'), { stage: s.name });
      const ok = s.name !== fail;
      status[s.name] = ok ? 'passed' : 'failed';
      if (s.name === 'deploy-staging') {
        env.staging = 'v42';
        envTones.staging = ok ? 'found' : 'error';
      }
      if (s.name === 'production') {
        env.production = 'v42';
        envTones.production = ok ? 'found' : 'error';
      }
      lines.push({ text: `${s.name}: ${ok ? 'passed' : s.name === 'approval' ? 'rejected by reviewer' : 'FAILED'}`, tone: ok ? 'found' : 'error' });
      step(r, 'mark', ok ? `${s.name} passed` : `${s.name} FAILED: the pipeline is red`, view('Pipeline'), { stage: s.name, ok });
    }
    const rb = status['deploy-staging'] === 'failed' || status['production'] === 'failed';
    if (rb) {
      const target = status['production'] === 'failed' ? 'production' : 'staging';
      env[target] = 'v41';
      envTones[target] = 'swap';
      lines.push({ text: `rollback: ${target} back to v41`, tone: 'swap' });
      step(r, 'rollback', `Rollback: ${target} returns to v41, the last good release`, view('Pipeline'), { rollback: true });
    } else {
      step(r, 'rollback', 'No deploy failed, so nothing needs rolling back', view('Pipeline'), { rollback: false });
    }
    const counts = Object.values(status).reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {});
    step(r, 'loop', `Done: ${counts.passed ?? 0} passed, ${counts.failed ?? 0} failed, ${counts.skipped ?? 0} skipped`, view('Pipeline result'), counts);
    return { frames: r.frames, result: { status: { ...status }, rollback: rb } };
  },
  reference({ fail, failFast }) {
    return referenceRun(fail, failFast !== 'no');
  },
};

const S4 = [
  { name: 'build', needs: [] },
  { name: 'test', needs: ['build'] },
  { name: 'lint', needs: [] },
  { name: 'deploy', needs: ['test', 'lint'] },
];

const unit: Unit = {
  id: 'devops-cicd',
  hook: 'Every team has a pipeline, and interviewers ask what happens when a stage breaks. Know fail-fast, stage dependencies, manual approvals and how a bad release is rolled back.',
  predict: {
    prompt: 'Stages: build, then test and scan in parallel, then deploy (needs both). Fail fast is OFF and test fails. What happens to scan and deploy?',
    options: ['Both are skipped', 'scan still runs; deploy is skipped', 'scan still runs; deploy runs with the old artifact', 'The pipeline retries test until it passes'],
    answer: 1,
    explain: 'Without fail fast only stages that depend on the failure are skipped. scan only needs build, so it runs. deploy needs test, which did not pass, so it is skipped.',
  },
  viz,
  deeper: {
    points: [
      '**CI** merges and verifies every change (build, test, scan). **CD** ships what passed: continuous *delivery* stops at an approval gate, continuous *deployment* goes straight to production.',
      '`needs` turns the stage list into a graph: independent stages run in parallel, and a stage runs only if every dependency passed.',
      '**Fail fast** stops starting new work after the first failure to save time and money. Turn it off when you want a full report (all failing tests and scans at once).',
      'Promote the **same artifact** through staging and production. Rebuilding per environment means you ship something you never tested.',
      'Rollback means redeploying the previous known-good artifact (or shifting traffic back), automated on a failed health check. Prefer it to "fix forward" under pressure.',
    ],
    pitfalls: ['A pipeline that keeps deploying after a failed test', 'Rebuilding the image for production instead of promoting the tested one', 'No health check, so a broken deploy looks green', 'Secrets printed in build logs'],
  },
  practice: {
    language: 'python',
    fnName: 'run_pipeline',
    statement: 'Implement `run_pipeline(stages, failing, fail_fast)`. `stages` is an ordered list of `{"name", "needs"}`; stages named in `failing` fail when they run. Return a dict name -> "passed" | "failed" | "skipped". A stage is skipped if any stage it needs did not pass, or if `fail_fast` is true and some stage has already failed.',
    signature: 'def run_pipeline(stages, failing, fail_fast=True):',
    solution: `def run_pipeline(stages, failing, fail_fast=True):
    status = {}
    for st in stages:
        name = st["name"]
        if fail_fast and @@"failed" in status.values()@@:
            status[name] = "skipped"
            continue
        if any(@@status[n] != "passed"@@ for n in st["needs"]):
            status[name] = "skipped"
            continue
        status[name] = @@"failed" if name in failing else "passed"@@
    return status`,
    tests: [
      { args: [S4, [], true], expected: { build: 'passed', test: 'passed', lint: 'passed', deploy: 'passed' }, name: 'everything passes' },
      { args: [S4, ['test'], false], expected: { build: 'passed', test: 'failed', lint: 'passed', deploy: 'skipped' }, name: 'no fail fast: independent lint still runs' },
      { args: [S4, ['test'], true], expected: { build: 'passed', test: 'failed', lint: 'skipped', deploy: 'skipped' }, name: 'fail fast skips lint too' },
      { args: [S4, ['build'], false], expected: { build: 'failed', test: 'skipped', lint: 'passed', deploy: 'skipped' }, name: 'dependents of build are skipped' },
      { args: [S4, ['deploy'], true], expected: { build: 'passed', test: 'passed', lint: 'passed', deploy: 'failed' }, name: 'last stage fails' },
      { args: [S4, ['nope'], true], expected: { build: 'passed', test: 'passed', lint: 'passed', deploy: 'passed' }, name: 'unknown failing name is ignored' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'run_pipeline',
    statement: 'With fail fast on, the pipeline keeps running independent stages after a failure. Find out why the check never triggers.',
    buggy: `def run_pipeline(stages, failing, fail_fast=True):
    status = {}
    for st in stages:
        name = st["name"]
        if fail_fast and "failed" in status:
            status[name] = "skipped"
            continue
        if any(status[n] != "passed" for n in st["needs"]):
            status[name] = "skipped"
            continue
        status[name] = "failed" if name in failing else "passed"
    return status`,
    fixed: `def run_pipeline(stages, failing, fail_fast=True):
    status = {}
    for st in stages:
        name = st["name"]
        if fail_fast and "failed" in status.values():
            status[name] = "skipped"
            continue
        if any(status[n] != "passed" for n in st["needs"]):
            status[name] = "skipped"
            continue
        status[name] = "failed" if name in failing else "passed"
    return status`,
    tests: [
      { args: [S4, ['test'], true], expected: { build: 'passed', test: 'failed', lint: 'skipped', deploy: 'skipped' }, name: 'fail fast after test' },
      { args: [S4, ['build'], true], expected: { build: 'failed', test: 'skipped', lint: 'skipped', deploy: 'skipped' }, name: 'fail fast after build' },
      { args: [S4, ['test'], false], expected: { build: 'passed', test: 'failed', lint: 'passed', deploy: 'skipped' }, name: 'fail fast off' },
      { args: [S4, [], true], expected: { build: 'passed', test: 'passed', lint: 'passed', deploy: 'passed' }, name: 'green run' },
    ],
    bugType: 'checking dict keys instead of values',
    hint: 'What does `"failed" in status` compare against: the keys or the values of the dict?',
    explanation: '`x in dict` tests the keys (stage names), so "failed" is never found and the guard never fires. Use `"failed" in status.values()` to look at the results.',
  },
  boss: {
    title: 'Plan a pipeline from unordered stages',
    statement:
      'Implement `plan_pipeline(stages, failing)`. `stages` is a list of `{"name", "needs"}` in ANY order. Schedule them: repeatedly take the first stage in the input list whose needs have all been scheduled. Return `{"order": [...], "status": {...}}` where status is "passed", "failed" (name in `failing`, and every need passed) or "skipped" (some need did not pass). Independent stages still run after a failure. If stages remain but none can be scheduled (a cycle or an unknown dependency), return `{"error": "cycle"}`.',
    language: 'python',
    fnName: 'plan_pipeline',
    starter: `def plan_pipeline(stages, failing):
    pass
`,
    solution: `def plan_pipeline(stages, failing):
    by_name = {s["name"]: s for s in stages}
    order, status = [], {}
    remaining = [s["name"] for s in stages]
    while remaining:
        chosen = None
        for name in remaining:
            if all(n in status for n in by_name[name]["needs"]):
                chosen = name
                break
        if chosen is None:
            return {"error": "cycle"}
        remaining.remove(chosen)
        order.append(chosen)
        if any(status[n] != "passed" for n in by_name[chosen]["needs"]):
            status[chosen] = "skipped"
        else:
            status[chosen] = "failed" if chosen in failing else "passed"
    return {"order": order, "status": status}`,
    tests: [
      {
        args: [[{ name: 'deploy', needs: ['test'] }, { name: 'test', needs: ['build'] }, { name: 'build', needs: [] }], []],
        expected: { order: ['build', 'test', 'deploy'], status: { build: 'passed', test: 'passed', deploy: 'passed' } },
        name: 'reverse order input',
      },
      {
        args: [[{ name: 'a', needs: [] }, { name: 'b', needs: ['a'] }, { name: 'c', needs: ['a'] }, { name: 'd', needs: ['b', 'c'] }], ['b']],
        expected: { order: ['a', 'b', 'c', 'd'], status: { a: 'passed', b: 'failed', c: 'passed', d: 'skipped' } },
        name: 'diamond with one failure',
      },
      { args: [[{ name: 'a', needs: ['b'] }, { name: 'b', needs: ['a'] }], []], expected: { error: 'cycle' }, name: 'cycle' },
      { args: [[{ name: 'a', needs: ['ghost'] }], []], expected: { error: 'cycle' }, name: 'unknown dependency' },
      {
        args: [[{ name: 'z', needs: ['x'] }, { name: 'y', needs: [] }, { name: 'x', needs: [] }], []],
        expected: { order: ['y', 'x', 'z'], status: { z: 'passed', y: 'passed', x: 'passed' } },
        name: 'ties follow input order',
      },
      {
        args: [[{ name: 'a', needs: [] }, { name: 'b', needs: ['a'] }, { name: 'c', needs: ['b'] }], ['b']],
        expected: { order: ['a', 'b', 'c'], status: { a: 'passed', b: 'failed', c: 'skipped' } },
        name: 'skip propagates down a chain',
      },
    ],
    hints: ['Keep a `status` dict as you schedule. A stage is ready when all its needs are already keys of `status`.', 'Pick the FIRST ready stage in the remaining list each round (not sorted). If none is ready, return the cycle error. Skip a stage when any need is not "passed".'],
    combines: ['devops-cicd'],
  },
  quiz: [
    {
      prompt: 'Why promote the same built artifact from staging to production instead of rebuilding for production?',
      options: ['It is cheaper', 'What you tested is exactly what you ship; a rebuild could differ', 'Production cannot run builds', 'It avoids the approval step'],
      answer: 1,
      explain: 'A rebuild can pull different dependency versions or base images. Promoting one immutable artifact keeps staging results meaningful.',
    },
  ],
  simulationNote: 'A teaching model of a pipeline runner: stages succeed or fail instantly and environments are two version labels. Real systems add runners, caches, retries and approvals with timeouts.',
};

export default unit;
