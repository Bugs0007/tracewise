/// <reference lib="webworker" />
// Pyodide runner. Loaded lazily the first time Python is needed; the main
// thread terminates and recreates this worker when a run exceeds its timeout.
import harnessSrc from './harness.py?raw';

const pyFiles = import.meta.glob(['../py/**/*.py', '!../py/tests/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

let pyodide: any = null;
let ready: Promise<void> | null = null;
let harness: any = null;

async function init(indexURL: string) {
  const mod = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
  pyodide = await mod.loadPyodide({ indexURL });
  // Teaching libraries (mini-Django, mock LLM) are plain Python packages in src/py.
  for (const [path, src] of Object.entries(pyFiles)) {
    const rel = path.replace(/^\.\.\/py\//, '');
    const parts = rel.split('/');
    let dir = '/home/pyodide';
    for (const p of parts.slice(0, -1)) {
      dir += '/' + p;
      try {
        pyodide.FS.mkdir(dir);
      } catch {}
    }
    pyodide.FS.writeFile(`/home/pyodide/${rel}`, src);
  }
  pyodide.FS.writeFile('/home/pyodide/_tw_harness.py', harnessSrc);
  await pyodide.runPythonAsync('import sys\nsys.path.insert(0, "/home/pyodide")\nimport _tw_harness');
}

self.onmessage = async (e: MessageEvent) => {
  const { id, kind, indexURL } = e.data;
  try {
    if (!ready) ready = init(indexURL);
    await ready;
    if (kind === 'init') {
      (self as any).postMessage({ id, result: { ok: true } });
      return;
    }
    harness ??= pyodide.pyimport('_tw_harness');
    const h = harness;
    let raw: string;
    if (kind === 'plain') {
      raw = h.run_plain(e.data.code);
    } else if (kind === 'trace') {
      raw = h.trace_call(e.data.code, e.data.fnName, JSON.stringify(e.data.args), e.data.maxSteps ?? 600);
    } else {
      raw = h.run_tests(e.data.code, e.data.fnName, JSON.stringify(e.data.tests), e.data.harness ?? '', e.data.adapter ?? null);
    }
    (self as any).postMessage({ id, result: JSON.parse(raw) });
  } catch (err) {
    ready = null;
    (self as any).postMessage({ id, fatal: true, error: err instanceof Error ? err.message : String(err) });
  }
};
