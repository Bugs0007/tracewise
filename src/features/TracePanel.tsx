// "Trace your own code": run the learner's Python under sys.settrace in Pyodide
// and turn every line event into a frame for the standard player.
import { useEffect, useMemo, useState } from 'react';
import type { Frame, Panel, Scalar, VizDef } from '@/engine/types';
import { preloadPython, tracePython, type TraceEvent, type TraceResult } from '@/runner';
import { CodeEditor } from '@/ui/CodeEditor';
import { Player } from '@/player/Player';
import { Icon } from '@/ui/Icon';
import { PyBadge } from './TaskRunner';

const SAMPLES: { label: string; code: string; fn: string; args: string }[] = [
  {
    label: 'Two sum',
    fn: 'two_sum',
    args: '[[2, 7, 11, 15], 9]',
    code: `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []`,
  },
  {
    label: 'Bubble sort',
    fn: 'bubble',
    args: '[[5, 1, 4, 2, 8]]',
    code: `def bubble(a):
    n = len(a)
    for i in range(n):
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
    return a`,
  },
  {
    label: 'Recursive factorial',
    fn: 'fact',
    args: '[4]',
    code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)`,
  },
];

const POINTER_NAMES = /^(i|j|k|l|r|lo|hi|mid|left|right|start|end|slow|fast|p|q|idx|index|pos|ptr|curr?|low|high|top|front|back|write|read|w|a_idx|b_idx)$/;

function isScalar(v: unknown): v is Scalar {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function short(v: unknown): Scalar {
  if (isScalar(v)) return v;
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

/** Convert raw trace events into player frames. Exported for tests. */
export function traceToFrames(code: string, events: TraceEvent[], result: TraceResult): Frame[] {
  const lines = code.split('\n');
  const frames: Frame[] = events.map((ev, n) => {
    const panels: Panel[] = [];
    const locals = ev.locals;
    const ints = Object.entries(locals).filter(([k, v]) => typeof v === 'number' && Number.isInteger(v) && POINTER_NAMES.test(k)) as [string, number][];
    for (const [k, v] of Object.entries(locals)) {
      if (Array.isArray(v) && v.length && v.length <= 40 && v.every(isScalar)) {
        const pointers: Record<string, number> = {};
        for (const [pk, pv] of ints) if (pv >= 0 && pv <= v.length) pointers[pk] = pv;
        panels.push({ type: 'array', title: k, values: v as Scalar[], pointers });
      } else if (Array.isArray(v) && v.length && v.length <= 12 && v.every((row) => Array.isArray(row) && row.length <= 16 && row.every(isScalar))) {
        panels.push({ type: 'grid', title: k, cells: v as Scalar[][] });
      } else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 20) {
        panels.push({ type: 'kv', title: k, entries: Object.entries(v as Record<string, unknown>).map(([kk, vv]) => ({ k: kk, v: short(vv) })) });
      }
    }
    panels.push({ type: 'list', title: 'Call stack', orientation: 'vertical', endLabel: 'top', items: ev.stack.map((f, i) => ({ id: `${i}:${f}`, label: `${f}()`, tone: i === ev.stack.length - 1 ? 'active' : 'visited' })) });
    const src = (lines[ev.line - 1] ?? '').trim();
    const caption =
      ev.event === 'call' ? `Call ${ev.func}(${Object.entries(locals).map(([k, v]) => `${k}=${short(v)}`).join(', ')})` : ev.event === 'return' ? `${ev.func} returns ${short(ev.ret)}` : `Line ${ev.line}: ${src}`;
    const vars: Record<string, Scalar> = {};
    for (const [k, v] of Object.entries(locals)) vars[k] = short(v);
    return { line: ev.line, caption, panels, vars, ops: n };
  });
  if (result.error) frames.push({ line: result.errorLine ?? 0, caption: `Error: ${result.error}`, panels: [{ type: 'note', text: result.error, tone: 'error' }], vars: {} });
  else if (result.truncated) frames.push({ line: 0, caption: 'Stopped after 600 steps (try a smaller input)', panels: [{ type: 'note', text: 'Trace truncated', tone: 'muted' }], vars: {} });
  if (result.stdout) frames.push({ line: 0, caption: 'Printed output', panels: [{ type: 'log', title: 'stdout', lines: result.stdout.split('\n').filter(Boolean).map((t) => ({ text: t })) }], vars: {} });
  return frames;
}

export default function TracePanel() {
  const [code, setCode] = useState(SAMPLES[0].code);
  const [fn, setFn] = useState(SAMPLES[0].fn);
  const [args, setArgs] = useState(SAMPLES[0].args);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ code: string; frames: Frame[] } | null>(null);

  useEffect(() => {
    void preloadPython().catch(() => undefined);
  }, []);

  const run = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      setErr('Arguments must be a JSON array, e.g. [[1, 2, 3], 2]');
      return;
    }
    setErr(null);
    setBusy(true);
    const res = await tracePython(code, fn, parsed as unknown[]);
    setBusy(false);
    if (!res.events.length && res.error) {
      setErr(res.error + (res.errorLine ? ` (line ${res.errorLine})` : ''));
      setTrace(null);
      return;
    }
    setTrace({ code, frames: traceToFrames(code, res.events, res) });
  };

  const viz: VizDef | null = useMemo(() => (trace ? { id: 'trace', title: 'Your code', code: trace.code, language: 'python', inputs: [], run: () => ({ frames: trace.frames }) } : null), [trace]);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            className="btn sm"
            onClick={() => {
              setCode(s.code);
              setFn(s.fn);
              setArgs(s.args);
              setTrace(null);
            }}
          >
            {s.label}
          </button>
        ))}
        <span className="spacer" />
        <PyBadge lang="python" />
      </div>
      <CodeEditor value={code} onChange={setCode} language="python" onRun={run} minHeight={160} ariaLabel="Your Python code" />
      <div className="inputs-bar row" style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Function
          <input className="input" value={fn} onChange={(e) => setFn(e.target.value)} spellCheck={false} data-testid="trace-fn" />
        </label>
        <label className="field grow">
          Arguments (JSON array)
          <input className="input" value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} data-testid="trace-args" />
        </label>
        <button className="btn primary" onClick={run} disabled={busy} data-testid="trace-run">
          {busy ? <span className="spin" /> : <Icon name="eye" size={15} />} Trace it
        </button>
      </div>
      {err && <div className="callout bad">{err}</div>}
      {viz && trace && <Player key={trace.frames.length + trace.code} viz={viz} frames={trace.frames} />}
    </div>
  );
}
