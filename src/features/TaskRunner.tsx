import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TaskBase } from '@/content/types';
import { onPyStatus, preloadPython, runTask, type PyStatus, type RunResult } from '@/runner';
import { show } from '@/runner/compare';
import { CodeEditor } from '@/ui/CodeEditor';
import { Icon } from '@/ui/Icon';
import { useCodeWrap } from '@/ui/codeWrap';
import { WrapToggle } from '@/player/CodeView';
import { useMedia, useStoredFlag } from '@/ui/hooks';
import { AiAssistPanel, AiSheet, type AssistRequest } from '@/ai/AiAssist';
import type { AssistAction, ProblemFacts } from '@/ai/prompt';
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


/** Example calls with their expected output, taken from the task's own tests, so every task shows what a correct answer looks like. */
export function Examples({ task, max = 3 }: { task: TaskBase; max?: number }) {
  const tests = task.tests ?? [];
  if (!tests.length) return null;
  const shown = tests.slice(0, max);
  return (
    <section className="examples" aria-label="Examples">
      <h3>Examples</h3>
      <ul>
        {shown.map((t, i) => (
          <li key={i}>
            <div className="ex-call mono">
              {task.fnName}({t.args.map(show).join(', ')})
            </div>
            <div className="ex-out mono">
              <span className="ex-label">returns</span> {show(t.expected)}
            </div>
            {t.name && <div className="ex-name">{t.name}</div>}
          </li>
        ))}
      </ul>
      {tests.length > shown.length && <p className="ex-more">{tests.length - shown.length} more cases run when you press Run tests.</p>}
    </section>
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
  /** turn on the AI help beside the editor for this task (not offered for boss attempts) */
  assist?: { chatId: string; problem: ProblemFacts };
}

export function TaskRunner({ task, starter, draftKey, onResult, toolbar, minHeight = 220, runLabel = 'Run tests', disabled, assist }: TaskRunnerProps) {
  const drafts = useApp((s) => s.drafts);
  const saveDraft = useApp((s) => s.saveDraft);
  const sound = useApp((s) => s.settings.sound);
  const [code, setCode] = useState(() => (draftKey && drafts[draftKey]) || starter);
  const codeRef = useRef(code);
  codeRef.current = code;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [wrap] = useCodeWrap();
  const [full, setFull] = useState(false);
  // AI help: docked beside the editor on wide screens, a full-screen sheet otherwise
  const wide = useMedia('(min-width: 1100px)');
  const [dock, setDock] = useStoredFlag('tracewise:ai-dock', true);
  const [sheet, setSheet] = useState(false);
  const [aiRequest, setAiRequest] = useState<AssistRequest | null>(null);
  const requestN = useRef(0);
  const resultRef = useRef<RunResult | null>(null);
  resultRef.current = result;
  const aiOpen = wide ? dock : sheet;
  const toggleAi = () => (wide ? setDock(!dock) : setSheet(!sheet));
  const askAi = (action: AssistAction) => {
    setAiRequest({ id: ++requestN.current, action });
    if (wide) setDock(true);
    else setSheet(true);
  };
  const getContext = () => ({ problem: assist!.problem, code: codeRef.current, result: resultRef.current });
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

  // full screen: Escape leaves it (except while typing, where Escape belongs to the editor)
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.cm-editor')) setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

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
    <div className={`col task-runner${full ? ' task-full' : ''}`} style={{ gap: 12 }}>
      <div className="row task-bar">
        <PyBadge lang={task.language} />
        <span className="dim hide-sm" style={{ fontSize: 13 }}>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs the tests. <kbd>Esc</kbd> then <kbd>Tab</kbd> leaves the editor.
        </span>
        <span className="spacer" />
        {toolbar}
        {assist && (
          <button className={`btn sm${aiOpen ? '' : ' ghost'}`} onClick={toggleAi} aria-pressed={aiOpen} aria-label="AI help" title="Ask the AI tutor" data-testid="ai-toggle">
            <Icon name="sparkle" size={14} /> <span className="hide-xs">AI help</span>
          </button>
        )}
        <WrapToggle className="btn sm ghost" />
        <button className="btn sm ghost" onClick={() => setFull((f) => !f)} aria-pressed={full} aria-label={full ? 'Exit full screen' : 'Full screen editor'} title={full ? 'Exit full screen (Esc)' : 'Give the editor the whole screen'} data-testid="editor-full">
          <Icon name={full ? 'collapse' : 'expand'} size={14} /> <span className="hide-xs">{full ? 'Exit' : 'Full screen'}</span>
        </button>
        <button className="btn sm ghost" onClick={() => onChange(starter)} title="Reset to the starting code">
          <Icon name="reset" size={14} /> <span className="hide-xs">Reset</span>
        </button>
        <button className="btn primary" onClick={run} disabled={running || disabled} data-testid="run">
          {running ? <span className="spin" /> : <Icon name="run" size={14} />} {running ? 'Running…' : runLabel}
        </button>
      </div>
      <div className={`task-split${assist && wide && dock ? ' has-dock' : ''}`}>
        <div className="task-main">
          {full ? (
            <details className="task-examples">
              <summary>Examples</summary>
              <Examples task={task} />
            </details>
          ) : (
            <Examples task={task} />
          )}
          <CodeEditor value={code} onChange={onChange} language={task.language} errorLine={result?.errorLine ?? result?.outcomes.find((o) => o.line)?.line} onRun={run} minHeight={minHeight} wrap={wrap} />
          <Results result={result} />
          {assist && result && result.status !== 'pass' && (
            <div className="ai-nudge">
              <span>Stuck on this?</span>
              <button className="btn sm" onClick={() => askAi('why-failed')} data-testid="ai-nudge">
                <Icon name="sparkle" size={14} /> Ask AI why it failed
              </button>
            </div>
          )}
        </div>
        {assist && wide && dock && (
          <aside className="task-ai" aria-label="AI help">
            <AiAssistPanel chatId={assist.chatId} getContext={getContext} request={aiRequest} onRequestConsumed={() => setAiRequest(null)} onClose={() => setDock(false)} hasResult={!!result} />
          </aside>
        )}
      </div>
      {assist && !wide && sheet && <AiSheet chatId={assist.chatId} getContext={getContext} request={aiRequest} onRequestConsumed={() => setAiRequest(null)} hasResult={!!result} onClose={() => setSheet(false)} />}
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
