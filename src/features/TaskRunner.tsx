import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TaskBase } from '@/content/types';
import { onPyStatus, preloadPython, runTask, type PyStatus, type RunResult } from '@/runner';
import { CodeEditor } from '@/ui/CodeEditor';
import { Icon } from '@/ui/Icon';
import { useApp } from '@/store/store';
import { playSound } from '@/lib/sound';
import { blankMatches, fillBlanks, parseBlanks, type Segment } from '@/content/ladder';
import { highlightLine } from '@/player/highlight';
import './task.css';

export function usePyStatus(): PyStatus {
  const [s, setS] = useState<PyStatus>('idle');
  useEffect(() => onPyStatus(setS), []);
  return s;
}

export function PyBadge({ lang }: { lang: string }) {
  const s = usePyStatus();
  if (lang !== 'python') return <span className="chip">{lang === 'jsx' ? 'React (sandboxed)' : lang === 'typescript' ? 'TypeScript' : 'JavaScript'}</span>;
  if (s === 'loading')
    return (
      <span className="chip warn" role="status">
        <span className="spin" /> Python warming up…
      </span>
    );
  if (s === 'error') return <span className="chip bad">Python failed to load</span>;
  return <span className={`chip ${s === 'ready' ? 'good' : ''}`}>Python {s === 'ready' ? 'ready' : ''}</span>;
}

export function Results({ result }: { result: RunResult | null }) {
  if (!result) return null;
  const passed = result.outcomes.filter((o) => o.ok).length;
  const tone = result.status === 'pass' ? 'good' : result.status === 'fail' ? 'warn' : 'bad';
  const head =
    result.status === 'pass'
      ? `All ${result.outcomes.length} tests passed`
      : result.status === 'fail'
        ? `${passed} of ${result.outcomes.length} tests passed`
        : result.status === 'timeout'
          ? 'Timed out'
          : 'Error';
  return (
    <div className={`results callout ${tone} ${result.status === 'pass' ? 'pop' : 'shake'}`} data-testid="results" data-status={result.status}>
      <div className="row" style={{ marginBottom: result.outcomes.length || result.error ? 8 : 0 }}>
        <Icon name={result.status === 'pass' ? 'check' : 'x'} size={18} />
        <strong>{head}</strong>
        <span className="spacer" />
        <span className="dim mono" style={{ fontSize: 13 }}>
          {Math.round(result.ms)} ms
        </span>
      </div>
      {result.error && (
        <pre className="err">
          {result.error}
          {result.errorLine ? `  (line ${result.errorLine})` : ''}
        </pre>
      )}
      {result.outcomes.length > 0 && (
        <ul className="tests">
          {result.outcomes.map((o, i) => (
            <li key={i} className={o.ok ? 'ok' : 'no'}>
              <span className="mark">{o.ok ? '✓' : '✗'}</span>
              <div className="grow">
                <div className="t-name">{o.name}</div>
                {!o.ok && (
                  <div className="t-detail mono">
                    {o.args && <div>input: {o.args}</div>}
                    <div>expected: {o.expected}</div>
                    {o.error ? <div className="bad">{o.error + (o.line ? ` (line ${o.line})` : '')}</div> : <div>got: {o.got}</div>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {result.stdout && (
        <details>
          <summary className="dim" style={{ cursor: 'pointer', fontSize: 13 }}>
            printed output
          </summary>
          <pre className="stdout">{result.stdout}</pre>
        </details>
      )}
    </div>
  );
}

export interface TaskRunnerProps {
  task: TaskBase;
  starter: string;
  draftKey?: string;
  onResult?: (r: RunResult, code: string) => void;
  toolbar?: ReactNode;
  minHeight?: number;
  runLabel?: string;
  disabled?: boolean;
}

export function TaskRunner({ task, starter, draftKey, onResult, toolbar, minHeight = 220, runLabel = 'Run tests', disabled }: TaskRunnerProps) {
  const drafts = useApp((s) => s.drafts);
  const saveDraft = useApp((s) => s.saveDraft);
  const sound = useApp((s) => s.settings.sound);
  const [code, setCode] = useState(() => (draftKey && drafts[draftKey]) || starter);
  const codeRef = useRef(code);
  codeRef.current = code;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (task.language === 'python') void preloadPython().catch(() => undefined);
  }, [task.language]);

  // when the task/starter changes (new level), reset the editor
  useEffect(() => {
    setCode((draftKey && useApp.getState().drafts[draftKey]) || starter);
    setResult(null);
  }, [starter, draftKey]);

  const onChange = (v: string) => {
    codeRef.current = v;
    setCode(v);
    if (draftKey) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveDraft(draftKey, v), 400);
    }
  };

  const run = async () => {
    if (running || disabled) return;
    setRunning(true);
    const src = codeRef.current;
    const r = await runTask(task, src);
    setRunning(false);
    setResult(r);
    if (sound) playSound(r.status === 'pass' ? 'correct' : 'fail');
    onResult?.(r, src);
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row">
        <PyBadge lang={task.language} />
        <span className="dim" style={{ fontSize: 13 }}>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs the tests. <kbd>Esc</kbd> then <kbd>Tab</kbd> leaves the editor.
        </span>
        <span className="spacer" />
        {toolbar}
        <button className="btn sm ghost" onClick={() => onChange(starter)} title="Reset to the starting code">
          <Icon name="reset" size={14} /> Reset
        </button>
        <button className="btn primary" onClick={run} disabled={running || disabled} data-testid="run">
          {running ? <span className="spin" /> : <Icon name="run" size={14} />} {running ? 'Running…' : runLabel}
        </button>
      </div>
      <CodeEditor value={code} onChange={onChange} language={task.language} errorLine={result?.errorLine ?? result?.outcomes.find((o) => o.line)?.line} onRun={run} minHeight={minHeight} />
      <Results result={result} />
    </div>
  );
}

/** Level 1: fill-in-the-blank. Exact (whitespace-insensitive) matches pass instantly; otherwise the filled code is run against the tests, so equivalent answers count. */
export function BlanksRunner({ task, solution, onResult }: { task: TaskBase; solution: string; onResult?: (r: RunResult, code: string) => void }) {
  const segs = useMemo(() => parseBlanks(solution), [solution]);
  const blanks = segs.filter((s): s is Extract<Segment, { kind: 'blank' }> => s.kind === 'blank');
  const [answers, setAnswers] = useState<string[]>(() => blanks.map(() => ''));
  const [marks, setMarks] = useState<(boolean | null)[]>(() => blanks.map(() => null));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const sound = useApp((s) => s.settings.sound);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setAnswers(blanks.map(() => ''));
    setMarks(blanks.map(() => null));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solution]);

  useEffect(() => {
    if (task.language === 'python') void preloadPython().catch(() => undefined);
  }, [task.language]);

  const check = async () => {
    if (running) return;
    const exact = blanks.map((b, i) => blankMatches(b.answer, answers[i]));
    if (exact.every(Boolean)) {
      setMarks(exact);
      const r: RunResult = { status: 'pass', outcomes: [], stdout: '', ms: 0 };
      setResult(r);
      if (sound) playSound('correct');
      onResult?.(r, fillBlanks(segs, answers));
      return;
    }
    setRunning(true);
    const code = fillBlanks(segs, answers);
    const r = await runTask(task, code);
    setRunning(false);
    setMarks(r.status === 'pass' ? blanks.map(() => true) : exact);
    setResult(r);
    if (sound) playSound(r.status === 'pass' ? 'correct' : 'fail');
    onResult?.(r, code);
  };

  // render code line by line with inline inputs
  let blankIdx = -1;
  const lines: React.ReactNode[][] = [[]];
  segs.forEach((s, si) => {
    if (s.kind === 'text') {
      s.text.split('\n').forEach((part, pi) => {
        if (pi > 0) lines.push([]);
        if (part) lines[lines.length - 1].push(<span key={`${si}-${pi}`}>{highlightLine(part, task.language === 'python' ? 'python' : 'javascript')}</span>);
      });
    } else {
      const i = ++blankIdx;
      const idx = i;
      lines[lines.length - 1].push(
        <input
          key={`b${i}`}
          ref={(el) => {
            inputs.current[idx] = el;
          }}
          className={`blank${marks[idx] === true ? ' right' : marks[idx] === false ? ' wrong' : ''}`}
          style={{ width: `${Math.max(3, s.answer.length + 1)}ch` }}
          value={answers[idx]}
          aria-label={`Blank ${idx + 1}`}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          data-testid={`blank-${idx}`}
          onChange={(e) => {
            const v = e.target.value;
            setAnswers((a) => a.map((x, k) => (k === idx ? v : x)));
            setMarks((m) => m.map((x, k) => (k === idx ? null : x)));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || idx === blanks.length - 1)) {
              e.preventDefault();
              void check();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              inputs.current[idx + 1]?.focus();
            }
          }}
        />,
      );
    }
  });

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row">
        <PyBadge lang={task.language} />
        <span className="dim" style={{ fontSize: 13 }}>
          Type each missing piece. <kbd>Enter</kbd> jumps to the next blank.
        </span>
        <span className="spacer" />
        <button className="btn primary" onClick={check} disabled={running} data-testid="check-blanks">
          {running ? <span className="spin" /> : <Icon name="check" size={14} />} Check
        </button>
      </div>
      <div className="codeview blanks" role="group" aria-label="Code with blanks">
        {lines.map((l, i) => (
          <div key={i} className="ln">
            <span className="no">{i + 1}</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <Results result={result && (result.outcomes.length || result.error) ? result : result?.status === 'pass' ? { ...result, outcomes: [] } : result} />
    </div>
  );
}
