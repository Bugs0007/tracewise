/// <reference lib="webworker" />
// Sandboxed JavaScript/TypeScript runner. Lives in a dedicated worker so the
// main thread can terminate it on timeout (infinite loops can't freeze the UI).
import { runJsPlain, runJsTests } from './js-core';
import { toPlainJs } from './transpile';

// Remove ambient capabilities learner code has no business using.
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches'] as const) {
  try {
    (self as any)[k] = undefined;
  } catch {}
}

self.onmessage = async (e: MessageEvent) => {
  const { id, kind, lang, code, fnName, tests, harness, adapter } = e.data;
  try {
    const js = toPlainJs(code, lang);
    const h = harness ? toPlainJs(harness, lang) : '';
    const result = kind === 'plain' ? await runJsPlain(js) : await runJsTests(js, fnName, tests, h, adapter);
    (self as any).postMessage({ id, result });
  } catch (err) {
    // transpile (syntax) errors land here
    const msg = err instanceof Error ? err.message : String(err);
    const line = /\((\d+):\d+\)/.exec(msg)?.[1];
    (self as any).postMessage({ id, result: { results: [], stdout: '', error: `SyntaxError: ${msg.replace(/\s*\(\d+:\d+\)$/, '')}`, errorLine: line ? Number(line) : null } });
  }
};
