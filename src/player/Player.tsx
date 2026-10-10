import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Frame, InputField, Scalar, VizDef } from '@/engine/types';
import { defaultInput, formatInput, InputError, parseInput } from '@/engine/inputs';
import { parseAnchors } from '@/engine/recorder';
import { CodeView } from './CodeView';
import { Legend } from './Legend';
import { tickKinds } from './ticks';
import { isWide, PanelView } from './panels';
import { Icon } from '@/ui/Icon';
import { playSound } from '@/lib/sound';
import { useApp } from '@/store/store';
import './player.css';

export interface PlayerProps {
  viz: VizDef;
  initialInput?: Record<string, unknown>;
  /** pre-computed frames (trace mode); when given, inputs are hidden */
  frames?: Frame[];
  /** called once when the learner reaches the final frame */
  onComplete?: () => void;
  /** predict-the-next-step quiz on by default */
  quizDefault?: boolean;
  onQuizAnswer?: (correct: boolean) => void;
  compact?: boolean;
  hideInputs?: boolean;
  /** 'authored': ask only the checkpoints a trace generator attached to its frames (Frame.predict) */
  predictMode?: 'generic' | 'authored';
}

const SPEEDS = [0.5, 1, 2, 4];

interface QuizState {
  at: number;
  options: string[];
  answer: number;
  chosen: number | null;
  question?: string;
  explain?: string;
}

/** Deterministic pseudo-random so quiz options don't reshuffle between renders. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function buildQuiz(frames: Frame[], at: number): QuizState | null {
  const next = frames[at + 1];
  if (!next) return null;
  const correct = next.caption;
  const pool: string[] = [];
  const seen = new Set([correct, frames[at].caption]);
  const order = [...frames.keys()].sort((a, b) => Math.abs(a - at - 1) - Math.abs(b - at - 1));
  for (const i of order) {
    const c = frames[i].caption;
    if (!seen.has(c)) {
      seen.add(c);
      pool.push(c);
    }
    if (pool.length >= 3) break;
  }
  if (pool.length < 2) return null;
  const options = [correct, ...pool];
  const r = rng(at * 7919 + frames.length);
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { at, options, answer: options.indexOf(correct), chosen: null };
}

function checkpoints(n: number): Set<number> {
  const out = new Set<number>();
  if (n < 5) return out;
  const k = Math.max(3, Math.floor(n / 6));
  for (let i = 2; i < n - 1; i += k) out.add(i);
  return out;
}

export function Player({ viz, initialInput, frames: given, onComplete, quizDefault = false, onQuizAnswer, compact, hideInputs, predictMode = 'generic' }: PlayerProps) {
  const sound = useApp((s) => s.settings.sound);
  const speedPref = useApp((s) => s.settings.speed);
  const setSettings = useApp((s) => s.setSettings);
  const [input, setInput] = useState<Record<string, unknown>>(() => ({ ...defaultInput(viz.inputs), ...(initialInput ?? {}) }));
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(viz.inputs.map((f) => [f.key, formatInput(f, { ...defaultInput(viz.inputs), ...(initialInput ?? {}) }[f.key])])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [quizOn, setQuizOn] = useState(quizDefault);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const completed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { frames, error } = useMemo(() => {
    if (given) return { frames: given, error: null as string | null };
    try {
      const bad = viz.validate?.(structuredClone(input) as any);
      if (bad) return { frames: [] as Frame[], error: bad };
      const r = viz.run(structuredClone(input) as any);
      return { frames: r.frames, error: r.frames.length ? null : 'This input produced no steps.' };
    } catch (e) {
      return { frames: [] as Frame[], error: (e as Error).message };
    }
  }, [viz, input, given]);

  const code = useMemo(() => parseAnchors(viz.code).clean, [viz.code]);
  const cps = useMemo(() => checkpoints(frames.length), [frames.length]);
  const last = frames.length - 1;
  const frame = frames[Math.min(idx, Math.max(0, last))];
  const prevFrame = idx > 0 ? frames[idx - 1] : undefined;
  const speed = SPEEDS.includes(speedPref) ? speedPref : 1;

  // reset playback whenever the frames change
  useEffect(() => {
    setIdx(0);
    setPlaying(false);
    setQuiz(null);
    setAsked(new Set());
  }, [frames]);

  useEffect(() => {
    if (idx >= last && last > 0 && !completed.current) {
      completed.current = true;
      onComplete?.();
    }
  }, [idx, last, onComplete]);

  /** Advance one frame, unless a quiz checkpoint intercepts. */
  const forward = useCallback(() => {
    if (quiz) return;
    if (idx >= last) {
      setPlaying(false);
      return;
    }
    const cp = predictMode === 'authored' ? frames[idx]?.predict : undefined;
    if (quizOn && !asked.has(idx) && (predictMode === 'authored' ? !!cp : cps.has(idx))) {
      const q: QuizState | null = cp ? { at: idx, options: cp.options, answer: cp.answer, chosen: null, question: cp.question, explain: cp.explain } : buildQuiz(frames, idx);
      if (q) {
        setQuiz(q);
        setPlaying(false);
        setAsked((a) => new Set(a).add(idx));
        return;
      }
    }
    setIdx((i) => Math.min(i + 1, last));
    if (sound) playSound('tick');
  }, [quiz, idx, last, quizOn, cps, asked, frames, sound, predictMode]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(forward, 900 / speed);
    return () => clearTimeout(t);
  }, [playing, forward, speed, idx]);

  const answerQuiz = (i: number) => {
    if (!quiz || quiz.chosen !== null) return;
    const correct = i === quiz.answer;
    setQuiz({ ...quiz, chosen: i });
    if (sound) playSound(correct ? 'correct' : 'fail');
    onQuizAnswer?.(correct);
  };
  const continueQuiz = () => {
    setQuiz(null);
    setIdx((i) => Math.min(i + 1, last));
  };

  // keyboard shortcuts (ignored while typing in a field/editor)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, .cm-editor, [contenteditable]')) return;
      if (!rootRef.current || !rootRef.current.isConnected) return;
      if (quiz) {
        if (quiz.chosen === null && /^[1-4]$/.test(e.key)) answerQuiz(Number(e.key) - 1);
        else if (quiz.chosen !== null && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
          e.preventDefault();
          continueQuiz();
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => (idx >= last ? false : !p));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(last);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const applyField = (f: InputField, text: string) => {
    try {
      const v = parseInput(f, text);
      setErrors((e) => ({ ...e, [f.key]: '' }));
      setInput((cur) => ({ ...cur, [f.key]: v }));
      completed.current = false;
    } catch (err) {
      setErrors((e) => ({ ...e, [f.key]: err instanceof InputError ? err.message : 'Invalid input' }));
    }
  };

  const loadPreset = (p: Record<string, unknown>) => {
    const next = { ...defaultInput(viz.inputs), ...p };
    setInput(next);
    setTexts(Object.fromEntries(viz.inputs.map((f) => [f.key, formatInput(f, next[f.key])])));
    setErrors({});
  };

  const randomize = () => {
    const f = viz.inputs.find((x) => x.kind === 'numbers');
    if (!f) return;
    const n = Math.min(f.maxItems ?? 10, Math.max(5, (input[f.key] as unknown[])?.length ?? 8));
    const vals = Array.from({ length: n }, () => Math.floor(Math.random() * 99) + 1);
    loadPreset({ ...input, [f.key]: vals });
  };

  const hasOps = frames.some((f) => (f.ops ?? 0) > 0);
  const kinds = useMemo(() => tickKinds(frames), [frames]);

  return (
    <div className={`player${compact ? ' compact' : ''}`} ref={rootRef} data-testid="player">
      {!hideInputs && !given && viz.inputs.length > 0 && (
        <div className="inputs-bar">
          {viz.inputs.map((f) => (
            <label key={f.key} className={`field${f.kind === 'numbers' || f.kind === 'edges' || f.kind === 'grid' || f.kind === 'json' || f.kind === 'strings' ? ' wide' : ''}`}>
              {f.label}
              {f.kind === 'select' ? (
                <select
                  className="input"
                  value={texts[f.key]}
                  onChange={(e) => {
                    setTexts((t) => ({ ...t, [f.key]: e.target.value }));
                    applyField(f, e.target.value);
                  }}
                >
                  {f.options!.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : f.kind === 'grid' ? (
                <textarea
                  className={`input${errors[f.key] ? ' error' : ''}`}
                  rows={Math.min(6, (texts[f.key] ?? '').split('\n').length)}
                  value={texts[f.key]}
                  onChange={(e) => setTexts((t) => ({ ...t, [f.key]: e.target.value }))}
                  onBlur={(e) => applyField(f, e.target.value)}
                  aria-invalid={!!errors[f.key]}
                />
              ) : (
                <input
                  className={`input${errors[f.key] ? ' error' : ''}`}
                  value={texts[f.key]}
                  onChange={(e) => setTexts((t) => ({ ...t, [f.key]: e.target.value }))}
                  onBlur={(e) => applyField(f, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyField(f, (e.target as HTMLInputElement).value)}
                  aria-invalid={!!errors[f.key]}
                  spellCheck={false}
                />
              )}
              {errors[f.key] && <span style={{ color: 'var(--bad)', textTransform: 'none', letterSpacing: 0 }}>{errors[f.key]}</span>}
            </label>
          ))}
          <div className="row" style={{ gap: 6 }}>
            {viz.presets?.map((p) => (
              <button key={p.label} className="btn sm" onClick={() => loadPreset(p.input)}>
                {p.label}
              </button>
            ))}
            {viz.inputs.some((f) => f.kind === 'numbers') && (
              <button className="btn sm ghost" onClick={randomize} title="Random input">
                <Icon name="shuffle" size={15} /> Random
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-main">
        <div className="stage" aria-live="polite">
          {error ? (
            <div className="callout bad">{error}</div>
          ) : frame ? (
            <div className="panels">
              {frame.panels.map((p, i) => (
                <div key={i} className={`pnl${isWide(p) ? ' wide' : ''}`}>
                  <PanelView panel={p} />
                </div>
              ))}
            </div>
          ) : null}
          <Legend />
          {quiz && !quiz.question && (
            <div className="predict" role="dialog" aria-label="Predict the next step">
              <div className="predict-box pop">
                <h3>{quiz.question ?? 'What happens next?'}</h3>
                {quiz.options.map((o, i) => (
                  <button key={i} className={`opt${quiz.chosen !== null && i === quiz.answer ? ' right' : ''}${quiz.chosen === i && i !== quiz.answer ? ' wrong' : ''}`} disabled={quiz.chosen !== null} onClick={() => answerQuiz(i)}>
                    <kbd>{i + 1}</kbd>
                    {o}
                  </button>
                ))}
                {quiz.chosen !== null && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <span className={`chip ${quiz.chosen === quiz.answer ? 'good' : 'bad'}`}>{quiz.chosen === quiz.answer ? 'Correct' : 'Not quite. Watch what happens.'}</span>
                    {quiz.explain && <span className="predict-why">{quiz.explain}</span>}
                    <span className="spacer" />
                    <button className="btn primary" onClick={continueQuiz} autoFocus>
                      Continue
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {frame && (
          <p className="caption" key={idx} data-testid="caption">
            {frame.caption}
          </p>
        )}

        {quiz?.question && (
          <div className="predict docked" role="dialog" aria-label="Predict the next step">
              <div className="predict-box pop">
                <h3>{quiz.question ?? 'What happens next?'}</h3>
                {quiz.options.map((o, i) => (
                  <button key={i} className={`opt${quiz.chosen !== null && i === quiz.answer ? ' right' : ''}${quiz.chosen === i && i !== quiz.answer ? ' wrong' : ''}`} disabled={quiz.chosen !== null} onClick={() => answerQuiz(i)}>
                    <kbd>{i + 1}</kbd>
                    {o}
                  </button>
                ))}
                {quiz.chosen !== null && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <span className={`chip ${quiz.chosen === quiz.answer ? 'good' : 'bad'}`}>{quiz.chosen === quiz.answer ? 'Correct' : 'Not quite. Watch what happens.'}</span>
                    {quiz.explain && <span className="predict-why">{quiz.explain}</span>}
                    <span className="spacer" />
                    <button className="btn primary" onClick={continueQuiz} autoFocus>
                      Continue
                    </button>
                  </div>
                )}
              </div>
          </div>
        )}

        <div className="timeline" aria-label="Timeline">
          <div className="ticks-strip" aria-hidden>
            {frames.map((_, i) => (
              <i key={i} className={`k-${kinds[i]}${i === idx ? ' now' : ''}${i < idx ? ' past' : ''}`} onClick={() => setIdx(i)} />
            ))}
          </div>
          <input className="scrub" type="range" min={0} max={Math.max(0, last)} value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Timeline" aria-valuetext={`Step ${idx + 1} of ${frames.length}`} />
        </div>

        <div className="controls" role="toolbar" aria-label="Playback controls">
          <div className="btn-group">
            <button className="btn icon" onClick={() => setIdx(0)} aria-label="Reset to start" title="Reset (Home)">
              <Icon name="reset" />
              <kbd className="hint">Home</kbd>
            </button>
            <button className="btn icon" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Step back" title="Step back (left arrow)">
              <Icon name="prev" />
              <kbd className="hint">←</kbd>
            </button>
            <button
              className="btn primary icon"
              onClick={() => {
                if (idx >= last) {
                  setIdx(0);
                  setPlaying(true);
                } else setPlaying((p) => !p);
              }}
              aria-label={playing ? 'Pause' : 'Play'}
              title="Play or pause (Space)"
              data-testid="play"
            >
              <Icon name={playing ? 'pause' : 'play'} />
              <kbd className="hint">Space</kbd>
            </button>
            <button className="btn icon" onClick={forward} disabled={idx >= last} aria-label="Step forward" title="Step forward (right arrow)" data-testid="step">
              <Icon name="next" />
              <kbd className="hint">→</kbd>
            </button>
            <button className="btn icon" onClick={() => setIdx(last)} aria-label="Jump to end" title="Jump to end (End)" data-testid="end">
              <Icon name="end" />
              <kbd className="hint">End</kbd>
            </button>
          </div>
          <span className="stepno mono" aria-hidden>
            {frames.length ? idx + 1 : 0} of {frames.length}
          </span>
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((sp) => (
              <button key={sp} aria-pressed={speed === sp} onClick={() => setSettings({ speed: sp })}>
                {sp}×
              </button>
            ))}
          </div>
          <label className="row predict-switch">
            <button className="toggle" role="switch" aria-checked={quizOn} onClick={() => setQuizOn((q) => !q)} aria-label="Predict mode" data-testid="predict-toggle" />
            Predict mode
          </label>
        </div>
      </div>

      {!compact && (
        <div className="side">
          <CodeView code={code} language={viz.language} line={frame?.line} />
          <VarsView vars={frame?.vars ?? {}} prev={prevFrame?.vars} />
          {hasOps && (
            <div className="vars opcount">
              Operations so far <b>{frame?.ops ?? 0}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VarsView({ vars, prev }: { vars: Record<string, Scalar>; prev?: Record<string, Scalar> }) {
  const entries = Object.entries(vars);
  return (
    <div className="vars">
      <div className="pnl-title">Variables</div>
      {entries.length === 0 ? (
        <span className="dim" style={{ fontSize: 13 }}>
          —
        </span>
      ) : (
        <table>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k + String(v)} className={prev && prev[k] !== v ? 'changed' : undefined}>
                <td>{k}</td>
                <td>{v === null ? 'None' : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
