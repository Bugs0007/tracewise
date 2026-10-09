// Offline content validator (Node only). Verifies, for every unit:
//   visualizer: runs on default + preset inputs, frames are well formed, result == reference
//   drills:     practice solution passes, blanks rebuild the solution, skeletons don't pass,
//               buggy debug code fails, fixed code passes
//   boss:       reference solution passes, starter does not
// Python is executed with the same harness the browser uses (src/runner/harness.py).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { CATALOG_BY_ID } from './catalog';
import { blankCount, cleanSolution, fillBlanks, levelStarter, parseBlanks } from './ladder';
import type { TaskBase, Unit } from './types';
import { matches, show } from '@/runner/compare';
import { runJsTests, type RawRun } from '@/runner/js-core';
import { toPlainJs } from '@/runner/transpile';
import { parseAnchors } from '@/engine/recorder';
import { defaultInput } from '@/engine/inputs';
import { compileForSandbox, sandboxSrcdoc } from '@/runner/reactSandbox';

export interface UnitReport {
  id: string;
  viz: string[];
  drills: string[];
  boss: string[];
  other: string[];
}

export const ok = (r: UnitReport) => !r.viz.length && !r.drills.length && !r.boss.length && !r.other.length;

export interface Job {
  unit: string;
  area: 'drills' | 'boss';
  label: string;
  task: TaskBase;
  code: string;
  expect: 'pass' | 'fail';
}

const PANEL_TYPES = new Set(['array', 'grid', 'graph', 'list', 'buckets', 'sequence', 'timeline', 'chart', 'log', 'kv', 'note']);

function checkViz(u: Unit, rep: UnitReport) {
  const v = u.viz;
  if (!v) return void rep.viz.push('missing viz');
  let lines: number;
  try {
    lines = parseAnchors(v.code).clean.split('\n').length;
  } catch (e) {
    return void rep.viz.push(`bad code: ${(e as Error).message}`);
  }
  const inputs = [{ label: 'default', input: { ...defaultInput(v.inputs), ...(u.vizInput ?? {}) } }, ...(v.presets ?? []).map((p) => ({ label: p.label, input: { ...defaultInput(v.inputs), ...p.input } }))];
  for (const { label, input } of inputs) {
    try {
      const res = v.run(structuredClone(input) as any);
      if (!res.frames.length) rep.viz.push(`[${label}] produced no frames`);
      if (res.frames.length < 3) rep.viz.push(`[${label}] only ${res.frames.length} frames (too few to step through)`);
      res.frames.forEach((f, i) => {
        if (f.line < 0 || f.line > lines) rep.viz.push(`[${label}] frame ${i} line ${f.line} out of range`);
        if (!f.caption) rep.viz.push(`[${label}] frame ${i} has no caption`);
        if (!f.panels.length) rep.viz.push(`[${label}] frame ${i} has no panels`);
        for (const p of f.panels) if (!PANEL_TYPES.has(p.type)) rep.viz.push(`[${label}] frame ${i} unknown panel ${(p as any).type}`);
        for (const p of f.panels)
          if (p.type === 'graph') {
            const ids = new Set(p.nodes.map((n) => n.id));
            for (const e of p.edges) if (!ids.has(e.from) || !ids.has(e.to)) rep.viz.push(`[${label}] frame ${i} edge ${e.from}->${e.to} references missing node`);
          }
      });
      if (v.reference) {
        const want = v.reference(structuredClone(input) as any);
        if (!matches(res.result as unknown, want, 'exact')) rep.viz.push(`[${label}] result ${show(res.result)} != reference ${show(want)}`);
      }
    } catch (e) {
      rep.viz.push(`[${label}] threw: ${(e as Error).message}`);
    }
  }
}

function collectJobs(u: Unit, rep: UnitReport): Job[] {
  const jobs: Job[] = [];
  const P = u.practice;
  const D = u.debug;
  const B = u.boss;
  if (!P || !D || !B) {
    rep.other.push('missing practice/debug/boss');
    return jobs;
  }
  const isReact = (t: TaskBase) => t.language === 'jsx';
  for (const [name, t] of [['practice', P], ['debug', D], ['boss', B]] as const) {
    const n = isReact(t) ? t.reactTests?.length ?? 0 : t.tests?.length ?? 0;
    if (n < 2) (name === 'boss' ? rep.boss : rep.drills).push(`${name} needs at least 2 tests (has ${n})`);
  }
  if (blankCount(P.solution) < 2) rep.drills.push('practice needs at least 2 @@blanks@@');
  const segs = parseBlanks(P.solution);
  const answers = segs.flatMap((s) => (s.kind === 'blank' ? [s.answer] : []));
  if (fillBlanks(segs, answers) !== cleanSolution(P.solution)) rep.drills.push('blank fill does not rebuild solution');
  jobs.push({ unit: u.id, area: 'drills', label: 'practice solution', task: P, code: cleanSolution(P.solution), expect: 'pass' });
  jobs.push({ unit: u.id, area: 'drills', label: 'practice L2 skeleton', task: P, code: levelStarter(P, 2), expect: 'fail' });
  jobs.push({ unit: u.id, area: 'drills', label: 'practice L3 starter', task: P, code: levelStarter(P, 3), expect: 'fail' });
  jobs.push({ unit: u.id, area: 'drills', label: 'debug buggy', task: D, code: D.buggy, expect: 'fail' });
  jobs.push({ unit: u.id, area: 'drills', label: 'debug fixed', task: D, code: D.fixed, expect: 'pass' });
  if (D.buggy.trim() === D.fixed.trim()) rep.drills.push('debug buggy == fixed');
  jobs.push({ unit: u.id, area: 'boss', label: 'boss solution', task: B, code: B.solution, expect: 'pass' });
  jobs.push({ unit: u.id, area: 'boss', label: 'boss starter', task: B, code: B.starter, expect: 'fail' });
  if (!B.hints || B.hints.length !== 2) rep.boss.push('boss needs exactly 2 hints');
  return jobs;
}

export function judge(job: Job, raw: RawRun): string | null {
  const tests = job.task.tests ?? [];
  const passed = !raw.error && tests.length > 0 && tests.every((t, i) => raw.results[i]?.ok && matches(raw.results[i].value, t.expected, job.task.compare));
  if (job.expect === 'pass' && !passed) {
    if (raw.error) return `${job.label} should pass but errored: ${raw.error}`;
    const i = tests.findIndex((t, k) => !(raw.results[k]?.ok && matches(raw.results[k].value, t.expected, job.task.compare)));
    const r = raw.results[i];
    return `${job.label} should pass; test ${i + 1} args=${show(tests[i]?.args)} expected ${show(tests[i]?.expected)} got ${r?.ok ? show(r.value) : r?.error}`;
  }
  if (job.expect === 'fail' && passed) return `${job.label} should fail at least one test but passes`;
  return null;
}

let pythonCmd: string | null = null;
export function python(): string {
  if (pythonCmd) return pythonCmd;
  for (const c of ['python3', 'python']) {
    try {
      const v = execFileSync(c, ['--version'], { encoding: 'utf8' });
      if (/Python 3\.(1[1-9]|[2-9]\d)/.test(v)) return (pythonCmd = c);
    } catch {}
  }
  throw new Error('Python 3.11+ is required to validate content');
}

export async function runPythonJobs(jobs: Job[]): Promise<RawRun[]> {
  if (!jobs.length) return [];
  const dir = mkdtempSync(join(tmpdir(), 'tw-validate-'));
  try {
    const inFile = join(dir, 'jobs.json');
    const outFile = join(dir, 'out.json');
    writeFileSync(inFile, JSON.stringify(jobs.map((j) => ({ code: j.code, fnName: j.task.fnName, tests: j.task.tests ?? [], harness: j.task.harness, adapter: j.task.adapter }))));
    const root = process.cwd();
    execFileSync(python(), [join(root, 'src/runner/harness.py'), inFile, outFile], {
      env: { ...process.env, PYTHONPATH: join(root, 'src/py'), PYTHONIOENCODING: 'utf-8' },
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(readFileSync(outFile, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runJsJob(job: Job): Promise<RawRun> {
  try {
    const js = toPlainJs(job.code, job.task.language);
    const h = job.task.harness ? toPlainJs(job.task.harness, job.task.language) : '';
    const guarded = withTimeout(runJsTests(js, job.task.fnName, job.task.tests ?? [], h, job.task.adapter), 5000);
    return await guarded;
  } catch (e) {
    return { results: [], stdout: '', error: (e as Error).message, errorLine: null };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Run a JSX task inside jsdom using the exact same harness the browser iframe uses. */
async function runReactJob(job: Job): Promise<string | null> {
  const compiled = compileForSandbox(job.code);
  const tests = job.task.reactTests ?? [];
  let outcome: { ok: boolean; why?: string };
  if (compiled.error) outcome = { ok: false, why: compiled.error };
  else {
    const dom = new JSDOM(sandboxSrcdoc(), { runScripts: 'dangerously', pretendToBeVisual: true });
    const win = dom.window as any;
    try {
      outcome = await withTimeout(
        new Promise((resolve) => {
          win.addEventListener('message', (ev: any) => {
            const m = ev.data ?? {};
            if (m.type === 'result') {
              if (m.error) resolve({ ok: false, why: m.error });
              else {
                const bad = m.results.findIndex((r: any) => !r.ok);
                resolve(bad < 0 ? { ok: true } : { ok: false, why: `${tests[bad].name}: ${m.results[bad].error}` });
              }
            }
          });
          // scripts ran synchronously during construction, so the harness is already listening
          win.postMessage({ type: 'test', code: compiled.js, fnName: job.task.fnName, tests }, '*');
        }),
        20000,
      );
    } catch {
      outcome = { ok: false, why: 'timeout' };
    } finally {
      win.close();
    }
  }
  if (job.expect === 'pass' && !outcome.ok) return `${job.label} should pass: ${outcome.why}`;
  if (job.expect === 'fail' && outcome.ok) return `${job.label} should fail at least one test but passes`;
  return null;
}

export async function validateUnits(units: Unit[]): Promise<Record<string, UnitReport>> {
  const reports: Record<string, UnitReport> = {};
  const all: Job[] = [];
  for (const u of units) {
    const rep: UnitReport = { id: u.id, viz: [], drills: [], boss: [], other: [] };
    reports[u.id] = rep;
    if (!CATALOG_BY_ID[u.id]) rep.other.push('id not in catalog');
    if (!u.hook) rep.other.push('missing hook');
    const q = u.predict;
    if (!q || q.answer < 0 || q.answer >= q.options.length) rep.other.push('predict answer index out of range');
    for (const qq of u.quiz ?? []) if (qq.answer < 0 || qq.answer >= qq.options.length) rep.other.push('quiz answer index out of range');
    checkViz(u, rep);
    all.push(...collectJobs(u, rep));
  }
  const py = all.filter((j) => j.task.language === 'python');
  const pyResults = await runPythonJobs(py);
  py.forEach((j, i) => {
    const err = judge(j, pyResults[i]);
    if (err) reports[j.unit][j.area].push(err);
  });
  for (const j of all.filter((x) => x.task.language === 'javascript' || x.task.language === 'typescript')) {
    const err = judge(j, await runJsJob(j));
    if (err) reports[j.unit][j.area].push(err);
  }
  for (const j of all.filter((x) => x.task.language === 'jsx')) {
    const err = await runReactJob(j);
    if (err) reports[j.unit][j.area].push(err);
  }
  return reports;
}
