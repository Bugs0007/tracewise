// Public runner API used by the UI. Python runs in a Pyodide worker, JS/TS in a
// plain worker, JSX in a sandboxed iframe. Every run has a hard timeout; on
// timeout the worker is terminated and transparently recreated.
import type { TaskBase, TestCase } from '@/content/types';
import { matches, show } from './compare';
import type { RawRun } from './js-core';
import type { FetchHandler } from './reactSandbox';

export interface TestOutcome {
  name: string;
  ok: boolean;
  expected: string;
  got?: string;
  error?: string;
  line?: number | null;
  args: string;
}

export interface RunResult {
  status: 'pass' | 'fail' | 'error' | 'timeout';
  outcomes: TestOutcome[];
  stdout: string;
  error?: string;
  errorLine?: number | null;
  ms: number;
}

type Listener = (s: PyStatus) => void;
export type PyStatus = 'idle' | 'loading' | 'ready' | 'error';

class ManagedWorker {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private make: () => Worker) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.make();
    w.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.fatal) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    };
    w.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Worker crashed'));
      this.pending.clear();
      this.kill();
    };
    this.worker = w;
    return w;
  }

  kill(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  get alive(): boolean {
    return this.worker !== null;
  }

  /** Serialised request with timeout. Rejects with 'timeout' and kills the worker. */
  call<T>(msg: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const run = () =>
      new Promise<T>((resolve, reject) => {
        const w = this.ensure();
        const id = ++this.seq;
        const timer = setTimeout(() => {
          this.pending.delete(id);
          this.kill();
          reject(new Error('timeout'));
        }, timeoutMs);
        this.pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        w.postMessage({ id, ...msg });
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

const jsWorker = new ManagedWorker(() => new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' }));
const pyWorker = new ManagedWorker(() => new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' }));

let pyStatus: PyStatus = 'idle';
const listeners = new Set<Listener>();
function setPyStatus(s: PyStatus) {
  pyStatus = s;
  listeners.forEach((l) => l(s));
}
export function onPyStatus(l: Listener): () => void {
  listeners.add(l);
  l(pyStatus);
  return () => listeners.delete(l);
}
export function getPyStatus(): PyStatus {
  return pyStatus;
}

function pyIndexURL(): string {
  return new URL('pyodide/', document.baseURI).href;
}

/** First load downloads ~11 MB (cached afterwards), so allow a generous budget. */
export async function preloadPython(): Promise<void> {
  if (pyStatus === 'ready' && pyWorker.alive) return;
  setPyStatus('loading');
  try {
    await pyWorker.call({ kind: 'init', indexURL: pyIndexURL() }, 120_000);
    setPyStatus('ready');
  } catch (e) {
    setPyStatus('error');
    throw e;
  }
}

async function pyCall<T>(msg: Record<string, unknown>, timeoutMs: number): Promise<T> {
  await preloadPython();
  try {
    return await pyWorker.call<T>({ ...msg, indexURL: pyIndexURL() }, timeoutMs);
  } catch (e) {
    if ((e as Error).message === 'timeout') {
      setPyStatus('idle');
      // warm a fresh interpreter in the background for the next run
      void preloadPython().catch(() => undefined);
    }
    throw e;
  }
}

function buildOutcomes(task: TaskBase, raw: RawRun): TestOutcome[] {
  const tests: TestCase[] = task.tests ?? [];
  return tests.map((t, i) => {
    const r = raw.results[i];
    const base = { name: t.name ?? `Test ${i + 1}`, expected: show(t.expected), args: t.args.map(show).join(', ') };
    if (!r) return { ...base, ok: false, error: raw.error ?? 'Not run' };
    if (!r.ok) return { ...base, ok: false, error: r.error, line: r.line };
    return { ...base, ok: matches(r.value, t.expected, task.compare), got: show(r.value) };
  });
}

export async function runTask(task: TaskBase, code: string, opts: { timeoutMs?: number; onFetch?: FetchHandler } = {}): Promise<RunResult> {
  const t0 = performance.now();
  const timeoutMs = opts.timeoutMs ?? 6000;
  if (task.language === 'jsx') {
    const { runReactTests } = await import('./reactSandbox');
    return runReactTests(task, code, Math.max(timeoutMs, 15000), opts.onFetch);
  }
  let raw: RawRun;
  try {
    const msg = { kind: 'tests', lang: task.language, code, fnName: task.fnName, tests: task.tests ?? [], harness: task.harness ?? '', adapter: task.adapter };
    raw = task.language === 'python' ? await pyCall<RawRun>(msg, timeoutMs) : await jsWorker.call<RawRun>(msg, timeoutMs);
  } catch (e) {
    const timeout = (e as Error).message === 'timeout';
    return {
      status: timeout ? 'timeout' : 'error',
      outcomes: [],
      stdout: '',
      error: timeout ? `Stopped after ${timeoutMs / 1000}s — likely an infinite loop or very slow code.` : (e as Error).message,
      ms: performance.now() - t0,
    };
  }
  // a load-time error (syntax error, missing function) means no test actually ran
  const outcomes = raw.error ? [] : buildOutcomes(task, raw);
  const status = raw.error ? 'error' : outcomes.length && outcomes.every((o) => o.ok) ? 'pass' : 'fail';
  return { status, outcomes, stdout: raw.stdout, error: raw.error ?? undefined, errorLine: raw.errorLine, ms: performance.now() - t0 };
}

export interface PlainResult {
  stdout: string;
  error: string | null;
  errorLine: number | null;
  timeout?: boolean;
}

export async function runPlain(lang: 'python' | 'javascript' | 'typescript', code: string, timeoutMs = 6000): Promise<PlainResult> {
  try {
    const msg = { kind: 'plain', lang, code };
    return lang === 'python' ? await pyCall<PlainResult>(msg, timeoutMs) : await jsWorker.call<PlainResult>(msg, timeoutMs);
  } catch (e) {
    const timeout = (e as Error).message === 'timeout';
    return { stdout: '', error: timeout ? 'Stopped: ran too long (infinite loop?)' : (e as Error).message, errorLine: null, timeout };
  }
}

export interface TraceEvent {
  event: 'call' | 'line' | 'return';
  line: number;
  func: string;
  locals: Record<string, unknown>;
  stack: string[];
  ret?: unknown;
}

export interface TraceResult {
  events: TraceEvent[];
  error: string | null;
  errorLine: number | null;
  returned: unknown;
  truncated: boolean;
  stdout: string;
}

export async function tracePython(code: string, fnName: string, args: unknown[], timeoutMs = 8000): Promise<TraceResult> {
  try {
    return await pyCall<TraceResult>({ kind: 'trace', code, fnName, args }, timeoutMs);
  } catch (e) {
    return { events: [], error: (e as Error).message === 'timeout' ? 'Stopped: ran too long' : (e as Error).message, errorLine: null, returned: null, truncated: false, stdout: '' };
  }
}

export interface MockRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}

export interface MockResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

/** Capstone mock network: answer one request with the learner's minidjango app (earlier writes are replayed). */
export async function serveRequest(code: string, history: MockRequest[], req: MockRequest, timeoutMs = 8000): Promise<MockResponse> {
  try {
    return await pyCall<MockResponse>({ kind: 'serve', code, history, req }, timeoutMs);
  } catch (e) {
    const msg = (e as Error).message === 'timeout' ? 'Backend timed out (infinite loop?)' : (e as Error).message;
    return { status: 500, body: JSON.stringify({ detail: msg }) };
  }
}

/** A fetch handler bound to a backend source; non-GET requests are appended to `history` so state persists. */
export function backendFetcher(getCode: () => string, history: MockRequest[]): FetchHandler {
  return async (req) => {
    const path = req.url.replace(/^https?:\/\/[^/]+/, '');
    const r: MockRequest = { method: req.method, url: path, headers: req.headers, body: req.body };
    const res = await serveRequest(getCode(), history, r);
    if (r.method !== 'GET' && res.status < 400) history.push(r);
    return { status: res.status, headers: res.headers, body: res.body };
  };
}
