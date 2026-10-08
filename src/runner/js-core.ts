// Executes learner JavaScript against test cases. Runs inside a Web Worker in
// the browser (killable on timeout) and directly in Node for content validation.
import { toPlain } from './compare';

export interface RawTestResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  line?: number | null;
}

export interface RawRun {
  results: RawTestResult[];
  stdout: string;
  error: string | null;
  errorLine: number | null;
}

function makeConsole(buf: string[]) {
  const fmt = (args: unknown[]) => args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
  const push = (...args: unknown[]) => {
    if (buf.length < 400) buf.push(fmt(args));
  };
  return { log: push, info: push, warn: push, error: push, debug: push, table: push };
}

function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(toPlain(v));
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}

/** Best-effort line number of an error inside the learner's code. */
function errorLine(e: unknown, offset: number): number | null {
  const stack = e instanceof Error ? e.stack ?? '' : '';
  const m = stack.match(/<anonymous>:(\d+):\d+/) || stack.match(/eval[^:]*:(\d+):\d+/);
  if (!m) return null;
  // new Function adds 2 header lines before the body
  const line = Number(m[1]) - 2 - offset;
  return line > 0 ? line : null;
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return `Thrown: ${safeStringify(e)}`;
}

async function settle(v: unknown, ms: number): Promise<unknown> {
  if (v && typeof (v as any).then === 'function') {
    return await Promise.race([v as Promise<unknown>, new Promise((_, rej) => setTimeout(() => rej(new Error('Promise never settled (missing resolve/await?)')), ms))]);
  }
  return v;
}

export async function runJsTests(code: string, fnName: string, tests: { args: unknown[] }[], harness = '', adapter?: string): Promise<RawRun> {
  const stdout: string[] = [];
  const out: RawRun = { results: [], stdout: '', error: null, errorLine: null };
  const harnessLines = harness ? harness.split('\n').length + 1 : 0;
  const pick = (name: string) => `typeof ${name} !== 'undefined' ? ${name} : undefined`;
  const body = `${harness ? harness + '\n' : ''}${code}\n;return { fn: (${pick(fnName)}), ad: (${adapter ? pick(adapter) : 'undefined'}) };`;
  let fn: any;
  let ad: any;
  try {
    const factory = new Function('console', body);
    ({ fn, ad } = factory(makeConsole(stdout)));
  } catch (e) {
    out.error = describe(e);
    out.errorLine = errorLine(e, harnessLines);
    out.stdout = stdout.join('\n');
    return out;
  }
  if (fn === undefined) {
    out.error = `ReferenceError: define \`${fnName}\` so the tests can call it`;
    out.stdout = stdout.join('\n');
    return out;
  }
  for (const t of tests) {
    const args = structuredClone(t.args);
    try {
      const v = await settle(ad ? ad(fn, ...args) : fn(...args), 2000);
      out.results.push({ ok: true, value: toPlain(v) });
    } catch (e) {
      const msg = e instanceof RangeError && /call stack/i.test(e.message) ? 'RangeError: Maximum call stack size exceeded (missing base case?)' : describe(e);
      out.results.push({ ok: false, error: msg, line: errorLine(e, harnessLines) });
    }
  }
  out.stdout = stdout.join('\n').slice(-4000);
  return out;
}

export async function runJsPlain(code: string): Promise<{ stdout: string; error: string | null; errorLine: number | null }> {
  const stdout: string[] = [];
  try {
    const r = new Function('console', code)(makeConsole(stdout));
    await settle(r, 2000);
    // let queued microtasks/timers (event-loop demos) flush
    await new Promise((res) => setTimeout(res, 60));
    return { stdout: stdout.join('\n'), error: null, errorLine: null };
  } catch (e) {
    return { stdout: stdout.join('\n'), error: describe(e), errorLine: errorLine(e, 0) };
  }
}
