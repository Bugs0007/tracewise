// Runs learner React components inside a sandboxed iframe (opaque origin: no
// access to the app's storage or DOM). React is inlined from node_modules so
// it works offline. Loops are instrumented with a time guard, and the parent
// enforces a hard timeout by removing the iframe.
import reactUmd from '../../node_modules/react/umd/react.production.min.js?raw';
import reactDomUmd from '../../node_modules/react-dom/umd/react-dom.production.min.js?raw';
import type { ReactTest, TaskBase } from '@/content/types';
import type { RunResult, TestOutcome } from './index';
import { addLoopGuards } from './loopGuard';
import { jsxToJs } from './transpile';

const HARNESS = String.raw`
(function () {
  var last = performance.now(), n = 0;
  setInterval(function () { last = performance.now(); }, 50);
  window.__guard = function () {
    if ((++n & 1023) === 0 && performance.now() - last > 1500) throw new Error('A loop ran too long (infinite loop?)');
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var fetchWaiters = {}, fetchSeq = 0;
  window.fetch = function (url, init) {
    init = init || {};
    var id = ++fetchSeq;
    parent.postMessage({ type: 'fetch', id: id, url: String(url), method: (init.method || 'GET').toUpperCase(), headers: init.headers || {}, body: init.body == null ? null : String(init.body) }, '*');
    return new Promise(function (resolve) {
      fetchWaiters[id] = function (res) {
        resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, headers: { get: function (k) { return (res.headers || {})[String(k).toLowerCase()] || null; } },
          json: function () { return Promise.resolve(res.body == null || res.body === '' ? null : JSON.parse(res.body)); },
          text: function () { return Promise.resolve(res.body || ''); } });
      };
    });
  };
  function compile(code, fnName) {
    var f = new Function('React', 'ReactDOM', '__guard',
      'const {useState,useEffect,useRef,useMemo,useCallback,useReducer,useContext,createContext,Fragment,memo,forwardRef,useLayoutEffect,useId,Children,Component} = React;\n' +
      'return (function(){\n' + code + '\n;return typeof ' + fnName + ' !== "undefined" ? ' + fnName + ' : undefined;\n})();');
    return f(React, ReactDOM, window.__guard);
  }
  function Boundary(props) { React.Component.call(this, props); this.state = { err: null }; }
  Boundary.prototype = Object.create(React.Component.prototype);
  Boundary.getDerivedStateFromError = function (err) { return { err: err }; };
  Boundary.prototype.componentDidCatch = function (err) { if (this.props.onError) this.props.onError(err); };
  Boundary.prototype.render = function () {
    if (this.state.err) return React.createElement('pre', { style: { color: '#c0392b', whiteSpace: 'pre-wrap' } }, String(this.state.err && this.state.err.message || this.state.err));
    return this.props.children;
  };
  function q(host, sel) {
    if (sel.indexOf('text=') === 0) {
      var want = sel.slice(5), all = host.querySelectorAll('*'), hit = null;
      for (var i = 0; i < all.length; i++) if ((all[i].textContent || '').trim() === want) hit = all[i];
      return hit;
    }
    return host.querySelector(sel);
  }
  // Assertions retry for a short while so async work (effects, fetches) can settle.
  async function waitFor(fn) {
    var t0 = Date.now();
    while (true) {
      try { return fn(); } catch (e) { if (Date.now() - t0 > 1500) throw e; await sleep(30); }
    }
  }
  function need(host, sel) { var el = q(host, sel); if (!el) throw new Error('No element matches "' + sel + '"'); return el; }
  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }
  async function runTests(Comp, tests) {
    var results = [];
    for (var i = 0; i < tests.length; i++) {
      var t = tests[i], host = document.createElement('div'), renderErr = null;
      document.body.appendChild(host);
      var root = ReactDOM.createRoot(host);
      try {
        root.render(React.createElement(Boundary, { onError: function (e) { renderErr = e; } }, React.createElement(Comp)));
        await sleep(40);
        if (renderErr) throw renderErr;
        for (var j = 0; j < t.steps.length; j++) {
          var s = t.steps[j];
          if (s.click !== undefined) { (await waitFor(function () { return need(host, s.click); })).click(); await sleep(40); }
          else if (s.type !== undefined) { setValue(await waitFor(function () { return need(host, s.type); }), s.value); await sleep(40); }
          else if (s.expectText !== undefined) {
            await waitFor(function () {
              var scope = s.in ? need(host, s.in) : host;
              if ((scope.textContent || '').indexOf(s.expectText) < 0) throw new Error('Expected to see "' + s.expectText + '"' + (s.in ? ' in ' + s.in : '') + ' — saw "' + (scope.textContent || '').slice(0, 120) + '"');
            });
          } else if (s.expectNoText !== undefined) {
            var scope2 = s.in ? need(host, s.in) : host;
            if ((scope2.textContent || '').indexOf(s.expectNoText) >= 0) throw new Error('Did not expect to see "' + s.expectNoText + '"');
          } else if (s.expectCount !== undefined) {
            await waitFor(function () {
              var c = host.querySelectorAll(s.expectCount).length;
              if (c !== s.n) throw new Error('Expected ' + s.n + ' × "' + s.expectCount + '", found ' + c);
            });
          }
          if (renderErr) throw renderErr;
        }
        results.push({ ok: true });
      } catch (e) {
        results.push({ ok: false, error: String(e && e.message || e) });
      }
      try { root.unmount(); } catch (e) {}
      host.remove();
    }
    return results;
  }
  window.addEventListener('message', async function (ev) {
    var m = ev.data || {};
    if (m.type === 'fetch-response' && fetchWaiters[m.id]) { fetchWaiters[m.id](m); delete fetchWaiters[m.id]; return; }
    try {
      if (m.type === 'test') {
        var Comp = compile(m.code, m.fnName);
        if (typeof Comp !== 'function') throw new Error('Define a component named ' + m.fnName);
        var results = await runTests(Comp, m.tests);
        parent.postMessage({ type: 'result', results: results }, '*');
      } else if (m.type === 'preview') {
        var C = compile(m.code, m.fnName);
        if (typeof C !== 'function') throw new Error('Define a component named ' + m.fnName);
        var el = document.getElementById('root');
        window.__root = window.__root || ReactDOM.createRoot(el);
        window.__root.render(React.createElement(Boundary, null, React.createElement(C)));
        parent.postMessage({ type: 'previewed' }, '*');
      }
    } catch (e) {
      parent.postMessage({ type: 'result', error: String(e && e.message || e) }, '*');
    }
  });
  window.addEventListener('error', function (e) { parent.postMessage({ type: 'runtime-error', error: e.message }, '*'); });
  parent.postMessage({ type: 'ready' }, '*');
})();
`;

let srcdocCache: string | null = null;
export function sandboxSrcdoc(css = ''): string {
  srcdocCache ??= `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px/1.45 system-ui,sans-serif;margin:12px;color:#14171f;background:#fff}button{font:inherit;padding:4px 10px;margin:2px}input,textarea,select{font:inherit;padding:4px}/*CSS*/</style></head><body><div id="root"></div><script>${reactUmd}</script><script>${reactDomUmd}</script><script>${HARNESS}</script></body></html>`;
  return css ? srcdocCache.replace('/*CSS*/', css.replace(/<\/style/gi, '')) : srcdocCache;
}

export function compileForSandbox(code: string): { js?: string; error?: string; line?: number } {
  try {
    return { js: addLoopGuards(jsxToJs(code)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /\((\d+):\d+\)/.exec(msg);
    return { error: `SyntaxError: ${msg.replace(/\s*\(\d+:\d+\)$/, '')}`, line: m ? Number(m[1]) : undefined };
  }
}

export type FetchHandler = (req: { url: string; method: string; headers: Record<string, string>; body: string | null }) => Promise<{ status: number; headers?: Record<string, string>; body: string }>;

export async function runReactTests(task: TaskBase, code: string, timeoutMs: number, onFetch?: FetchHandler): Promise<RunResult> {
  const t0 = performance.now();
  const tests: ReactTest[] = task.reactTests ?? [];
  const compiled = compileForSandbox(code);
  const base = (t: ReactTest): Omit<TestOutcome, 'ok'> => ({ name: t.name, expected: 'pass', args: '' });
  if (compiled.error) return { status: 'error', outcomes: [], stdout: '', error: compiled.error, errorLine: compiled.line, ms: 0 };
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;height:400px;border:0;';
  iframe.srcdoc = sandboxSrcdoc();
  const done = new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => finish({ status: 'timeout', outcomes: [], stdout: '', error: `Stopped after ${timeoutMs / 1000}s — the component never finished (infinite loop or endless re-render?).`, ms: timeoutMs }), timeoutMs);
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const m = ev.data ?? {};
      if (m.type === 'ready') iframe.contentWindow?.postMessage({ type: 'test', code: compiled.js, fnName: task.fnName, tests }, '*');
      else if (m.type === 'fetch') answerFetch(iframe, m, onFetch);
      else if (m.type === 'result') {
        if (m.error) finish({ status: 'error', outcomes: [], stdout: '', error: m.error, ms: performance.now() - t0 });
        else {
          const outcomes: TestOutcome[] = tests.map((t, i) => ({ ...base(t), ok: !!m.results[i]?.ok, error: m.results[i]?.error, got: m.results[i]?.ok ? 'pass' : 'fail' }));
          finish({ status: outcomes.every((o) => o.ok) ? 'pass' : 'fail', outcomes, stdout: '', ms: performance.now() - t0 });
        }
      }
    };
    function finish(r: RunResult) {
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      iframe.remove();
      resolve(r);
    }
    window.addEventListener('message', onMsg);
  });
  document.body.appendChild(iframe);
  return done;
}

/** Reply to a fetch() the sandboxed component made (bridged over postMessage). */
export async function answerFetch(iframe: HTMLIFrameElement, m: { id: number; url: string; method: string; headers: Record<string, string>; body: string | null }, onFetch?: FetchHandler): Promise<void> {
  let res: { status: number; headers?: Record<string, string>; body: string };
  try {
    res = onFetch ? await onFetch({ url: m.url, method: m.method, headers: m.headers, body: m.body }) : { status: 503, body: JSON.stringify({ detail: 'No backend is connected in this exercise' }) };
  } catch (e) {
    res = { status: 500, body: JSON.stringify({ detail: String(e) }) };
  }
  iframe.contentWindow?.postMessage({ type: 'fetch-response', id: m.id, status: res.status, headers: res.headers ?? {}, body: res.body }, '*');
}
