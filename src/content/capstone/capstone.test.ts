// Validates every capstone milestone end to end:
//   backend:  reference passes the milestone's request scripts; the previous reference fails them
//   frontend: reference App passes its DOM steps in jsdom, with fetch() answered by the real
//             Python backend (same harness as the browser); the previous App fails them
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { judge, python, runPythonJobs, type Job } from '../validate.node';
import { compileForSandbox, sandboxSrcdoc } from '@/runner/reactSandbox';
import { CAPSTONE_HARNESS, type CapstoneProject, type Milestone, type MockReq } from './types';
import { PROJECTS } from './index';

function serve(code: string, history: MockReq[], req: MockReq): { status: number; body: string; headers?: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'tw-serve-'));
  try {
    writeFileSync(join(dir, 'code.py'), code);
    writeFileSync(join(dir, 'h.json'), JSON.stringify(history));
    writeFileSync(join(dir, 'r.json'), JSON.stringify(req));
    const root = process.cwd();
    const out = execFileSync(python(), [join(root, 'src/runner/harness.py'), '--serve', join(dir, 'code.py'), join(dir, 'h.json'), join(dir, 'r.json')], {
      env: { ...process.env, PYTHONPATH: join(root, 'src/py'), PYTHONIOENCODING: 'utf-8' },
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runFrontend(m: Milestone, appCode: string, backend: string): Promise<string | null> {
  const compiled = compileForSandbox(appCode);
  if (compiled.error) return compiled.error;
  const history: MockReq[] = [...(m.seed ?? [])];
  const dom = new JSDOM(sandboxSrcdoc(), { runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window as any;
  try {
    return await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 60_000);
      win.addEventListener('message', (ev: any) => {
        const msg = ev.data ?? {};
        if (msg.type === 'fetch') {
          const r: MockReq = { method: msg.method, url: msg.url, headers: msg.headers, body: msg.body };
          const res = serve(backend, history, r);
          if (r.method !== 'GET' && res.status < 400) history.push(r);
          win.postMessage({ type: 'fetch-response', id: msg.id, status: res.status, headers: res.headers ?? {}, body: res.body }, '*');
        } else if (msg.type === 'result') {
          clearTimeout(timer);
          if (msg.error) resolve(msg.error);
          else {
            const bad = msg.results.findIndex((x: any) => !x.ok);
            resolve(bad < 0 ? null : `${m.reactTests![bad].name}: ${msg.results[bad].error}`);
          }
        }
      });
      win.postMessage({ type: 'test', code: compiled.js, fnName: 'App', tests: m.reactTests }, '*');
    });
  } finally {
    win.close();
  }
}

function backendJob(p: CapstoneProject, m: Milestone, code: string, expect: 'pass' | 'fail'): Job {
  return { unit: p.id, area: 'boss', label: `${m.id} ${expect === 'pass' ? 'reference' : 'previous code'}`, expect, code, task: { language: 'python', fnName: 'app', harness: CAPSTONE_HARNESS, adapter: 'run_requests', tests: m.tests } };
}

describe.each(PROJECTS.map((p) => [p.id, p] as const))('capstone %s', (_id, p) => {
  it('backend milestones: reference passes, previous code fails', async () => {
    const jobs: Job[] = [];
    let prev = p.backendStarter;
    for (const m of p.milestones) {
      if (m.part !== 'backend') continue;
      expect(m.tests?.length, `${m.id} needs tests`).toBeGreaterThan(0);
      jobs.push(backendJob(p, m, m.reveal, 'pass'), backendJob(p, m, prev, 'fail'));
      prev = m.reveal;
    }
    const results = await runPythonJobs(jobs);
    const problems = jobs.map((j, i) => judge(j, results[i])).filter(Boolean);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('frontend milestones work against the backend of that stage', async () => {
    let backend = p.backendStarter;
    let prevApp = p.frontendStarter;
    const problems: string[] = [];
    for (const m of p.milestones) {
      if (m.part === 'backend') {
        backend = m.reveal;
        continue;
      }
      expect(m.reactTests?.length, `${m.id} needs reactTests`).toBeGreaterThan(0);
      const good = await runFrontend(m, m.reveal, backend);
      if (good) problems.push(`${m.id} reference should pass: ${good}`);
      const bad = await runFrontend(m, prevApp, backend);
      if (!bad) problems.push(`${m.id} previous App should fail but passes`);
      prevApp = m.reveal;
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every milestone has two hints and a reveal', () => {
    for (const m of p.milestones) {
      expect(m.hints).toHaveLength(2);
      expect(m.reveal.length).toBeGreaterThan(20);
    }
  });
});
