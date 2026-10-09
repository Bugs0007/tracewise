import { lazy, Suspense, useEffect, useState } from 'react';
import { CATALOG, CATALOG_BY_ID, MODULES } from '@/content/catalog';
import { AVAILABLE_UNITS, loadUnit } from '@/content/loader';
import type { Question, Unit } from '@/content/types';
import { cleanSolution, LEVEL_NAMES, levelStarter, type LadderLevel } from '@/content/ladder';
import { href, navigate } from '@/router';
import { unitProgress, useApp } from '@/store/store';
import { STEP_ORDER, type StepId } from '@/store/save';
import { Player } from '@/player/Player';
import { BlanksRunner, TaskRunner } from '@/features/TaskRunner';
import { CodeBlock, Collapsible, Md } from '@/ui/common';
import { Icon } from '@/ui/Icon';
import { CompletionTrace } from '@/ui/CompletionTrace';
import { playSound } from '@/lib/sound';
import type { RunResult } from '@/runner';
import '@/features/task.css';

const STEP_META: Record<StepId, { label: string; icon: string }> = {
  predict: { label: 'Hook and predict', icon: 'target' },
  watch: { label: 'Watch', icon: 'eye' },
  type: { label: 'Type it', icon: 'code' },
  debug: { label: 'Debug', icon: 'bug' },
  boss: { label: 'Boss', icon: 'crown' },
};

const Architect = lazy(() => import('@/features/Architect').then((m) => ({ default: m.Architect })));

export const XP = { predictRight: 10, predictWrong: 4, watch: 10, quiz: 3, typePerLevel: 15, debug: 25, boss: 50 };

export default function UnitPage({ id, step }: { id?: string; step?: string }) {
  const [unit, setUnit] = useState<Unit | null | undefined>(undefined);
  const meta = id ? CATALOG_BY_ID[id] : undefined;
  const progress = useApp((s) => (id ? unitProgress(s, id) : null));
  const cur: StepId = (STEP_ORDER as string[]).includes(step ?? '') ? (step as StepId) : 'predict';

  useEffect(() => {
    let alive = true;
    setUnit(undefined);
    if (id) loadUnit(id).then((u) => alive && setUnit(u));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!meta) return <div className="page">Unknown unit.</div>;
  const mod = MODULES.find((m) => m.id === meta.module)!;
  if (unit === undefined) return <div className="page dim">Loading unit…</div>;
  if (unit === null)
    return (
      <div className="page">
        <a href={href(`/map/${mod.id}`)} className="dim">
          ← {mod.title}
        </a>
        <h1 style={{ marginTop: 10 }}>{meta.title}</h1>
        <div className="callout warn">This unit is on the roadmap but its content hasn't been written yet. See docs/COVERAGE.md.</div>
      </div>
    );

  const go = (s: StepId) => navigate(`/unit/${unit.id}/${s}`);
  const nextStep = STEP_ORDER[STEP_ORDER.indexOf(cur) + 1];
  const siblings = CATALOG.filter((c) => c.module === meta.module && AVAILABLE_UNITS.has(c.id));
  const nextUnit = siblings[siblings.findIndex((c) => c.id === unit.id) + 1];

  return (
    <div className="page wide">
      <div className="crumbs">
        <a href={href(`/map/${mod.id}`)}>{mod.title}</a>
        <span aria-hidden>/</span>
        <span>{meta.topic}</span>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <h1 style={{ margin: 0 }}>{meta.title}</h1>
        {progress?.completedAt && (
          <span className="chip good">
            <Icon name="crown" size={13} /> Cleared
          </span>
        )}
      </div>
      <nav aria-label="Unit steps">
        <ol className="stepper">
          {STEP_ORDER.map((s, i) => (
            <li key={s}>
              <button className={`step-tab${progress?.steps[s] ? ' done' : ''}`} aria-current={cur === s ? 'step' : undefined} onClick={() => go(s)} data-testid={`step-${s}`}>
                <span className="num">{progress?.steps[s] ? <Icon name="check" size={13} stroke={3} /> : i + 1}</span>
                {STEP_META[s].label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {unit.simulationNote && (
        <div className="callout info" style={{ marginBottom: 14 }}>
          <strong>Simulation:</strong> <Md text={unit.simulationNote} />
        </div>
      )}
      <div key={unit.id + cur} className="fade-up">
        {cur === 'predict' && <PredictStep unit={unit} onNext={() => go('watch')} />}
        {cur === 'watch' && <WatchStep unit={unit} onNext={() => go('type')} />}
        {cur === 'type' && <TypeStep unit={unit} onNext={() => go('debug')} />}
        {cur === 'debug' && <DebugStep unit={unit} onNext={() => go('boss')} />}
        {cur === 'boss' && <BossStep unit={unit} onNext={() => (nextUnit ? navigate(`/unit/${nextUnit.id}/predict`) : navigate(`/map/${mod.id}`))} nextLabel={nextUnit ? `Next: ${nextUnit.title}` : 'Back to map'} />}
      </div>
      {nextStep && progress?.steps[cur] && (
        <div className="row" style={{ marginTop: 18 }}>
          <span className="spacer" />
          <button className="btn primary lg" onClick={() => go(nextStep)}>
            {STEP_META[nextStep].label}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 1. Hook + Predict ─────────────────────────────────

export function QuestionCard({ q, onAnswer, compact }: { q: Question; onAnswer: (correct: boolean) => void; compact?: boolean }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const sound = useApp((s) => s.settings.sound);
  useEffect(() => setChosen(null), [q]);
  const pick = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    if (sound) playSound(i === q.answer ? 'correct' : 'fail');
    onAnswer(i === q.answer);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, .cm-editor')) return;
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= q.options.length) pick(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className={compact ? '' : 'card'} data-testid="question">
      <div style={{ fontWeight: 600, fontSize: 16 }}>
        <Md text={q.prompt} />
      </div>
      {q.code && <CodeBlock code={q.code} lang={q.codeLang === 'python' ? 'python' : 'javascript'} />}
      <div style={{ marginTop: 8 }}>
        {q.options.map((o, i) => (
          <button key={i} className={`opt${chosen !== null && i === q.answer ? ' right' : ''}${chosen === i && i !== q.answer ? ' wrong' : ''}`} disabled={chosen !== null} onClick={() => pick(i)} data-testid={`option-${i}`}>
            <kbd>{i + 1}</kbd>
            <Md text={o} />
          </button>
        ))}
      </div>
      {chosen !== null && (
        <div className={`callout ${chosen === q.answer ? 'good' : 'bad'} fade-up`} style={{ marginTop: 10 }}>
          <strong>{chosen === q.answer ? 'Correct. ' : 'Not quite. '}</strong>
          <Md text={q.explain} />
        </div>
      )}
    </div>
  );
}

function PredictStep({ unit, onNext }: { unit: Unit; onNext: () => void }) {
  const completeStep = useApp((s) => s.completeStep);
  const reviewResult = useApp((s) => s.reviewResult);
  const [answered, setAnswered] = useState(false);
  return (
    <div className="col" style={{ gap: 18, maxWidth: 860 }}>
      <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
        <div className="eyebrow">Why it matters</div>
        <p className="hook" style={{ margin: '6px 0 0' }}>
          <Md text={unit.hook} />
        </p>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Predict first — guess before you watch
        </div>
        <QuestionCard
          q={unit.predict}
          onAnswer={(ok) => {
            setAnswered(true);
            completeStep(unit.id, 'predict', ok ? XP.predictRight : XP.predictWrong);
            if (!ok) reviewResult(unit.id, 'predict', false);
          }}
        />
      </div>
      {answered && (
        <div className="row">
          <span className="spacer" />
          <button className="btn primary lg pop" onClick={onNext} autoFocus>
            Watch it run
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 2. Watch ─────────────────────────────────────────

function WatchStep({ unit, onNext }: { unit: Unit; onNext: () => void }) {
  const completeStep = useApp((s) => s.completeStep);
  const awardXp = useApp((s) => s.awardXp);
  const done = useApp((s) => !!unitProgress(s, unit.id).steps.watch);
  return (
    <div className="col" style={{ gap: 16 }}>
      <Player key={unit.id} viz={unit.viz} initialInput={unit.vizInput} onComplete={() => completeStep(unit.id, 'watch', XP.watch)} onQuizAnswer={(ok) => ok && awardXp(XP.quiz)} />
      {unit.interactive === 'architect' && (
        <div className="card">
          <h3>Build it: architecture lab</h3>
          <Suspense fallback={<div className="dim">Loading…</div>}>
            <Architect />
          </Suspense>
        </div>
      )}
      {!done && <div className="dim" style={{ fontSize: 13 }}>Step through to the end to complete this step. Edit the input and re-run as often as you like. Turn on Predict mode for bonus XP.</div>}
      {unit.deeper && (
        <Collapsible title="Go deeper: theory, complexity, pitfalls">
          {unit.deeper.complexity && (
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="chip accent">Time {unit.deeper.complexity.time}</span>
              <span className="chip accent">Space {unit.deeper.complexity.space}</span>
            </div>
          )}
          <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
            {unit.deeper.points.map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <Md text={p} />
              </li>
            ))}
          </ul>
          {unit.deeper.pitfalls?.length ? (
            <>
              <div className="eyebrow">Pitfalls</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {unit.deeper.pitfalls.map((p, i) => (
                  <li key={i}>
                    <Md text={p} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Collapsible>
      )}
      {done && (
        <div className="row">
          <span className="spacer" />
          <button className="btn primary lg" onClick={onNext}>
            Now type it
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 3. Type it (scaffold-fading ladder) ───────────────

function TypeStep({ unit }: { unit: Unit; onNext: () => void }) {
  const P = unit.practice;
  const prog = useApp((s) => unitProgress(s, unit.id));
  const ladderResult = useApp((s) => s.ladderResult);
  const completeStep = useApp((s) => s.completeStep);
  const awardXp = useApp((s) => s.awardXp);
  const spendHint = useApp((s) => s.spendHint);
  const [level, setLevel] = useState<LadderLevel>(prog.ladder);
  const [peek, setPeek] = useState(false);
  const [justPassed, setJustPassed] = useState(false);
  const maxOpen = prog.ladder;

  useEffect(() => {
    setPeek(false);
    setJustPassed(false);
  }, [level]);

  const onResult = (r: RunResult) => {
    const passed = r.status === 'pass';
    const changed = ladderResult(unit.id, passed, level);
    if (passed) {
      setJustPassed(true);
      if (level === prog.ladder) awardXp(XP.typePerLevel * level);
      if (level >= 2) completeStep(unit.id, 'type', 0);
      if (changed === 'up') setTimeout(() => setLevel((l) => Math.min(4, l + 1) as LadderLevel), 900);
    } else if (changed === 'down') {
      setLevel((l) => Math.max(1, l - 1) as LadderLevel);
    }
  };

  const statement = (
    <div className="card flat">
      <div className="row">
        <div className="eyebrow">Your task</div>
        <span className="spacer" />
        <span className="chip accent">Level {level}: {LEVEL_NAMES[level]}</span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 16 }}>
        <Md text={P.statement} />
      </p>
      {level === 4 && (
        <p className="dim" style={{ margin: '6px 0 0' }}>
          Name your function <code>{P.fnName}</code> — the tests call it.
        </p>
      )}
    </div>
  );

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <div className="ladder" role="group" aria-label="Typing ladder level">
          {([1, 2, 3, 4] as LadderLevel[]).map((l) => (
            <button key={l} className={`rung${l === level ? ' cur' : ''}${prog.bestLevel >= l ? ' passed' : ''}`} disabled={l > maxOpen} onClick={() => setLevel(l)} title={l > maxOpen ? 'Pass the level below to unlock' : LEVEL_NAMES[l]} data-testid={`rung-${l}`}>
              {prog.bestLevel >= l ? <Icon name="check" size={12} /> : l > maxOpen ? <Icon name="lock" size={12} /> : <span>{l}</span>}
              <span className="hide-sm">{LEVEL_NAMES[l]}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        {prog.ladderFails > 0 && <span className="chip warn">{3 - prog.ladderFails} tries before dropping a level</span>}
      </div>
      {statement}
      {level === 1 ? (
        <BlanksRunner task={P} solution={P.solution} onResult={onResult} />
      ) : (
        <TaskRunner
          task={P}
          starter={levelStarter(P, level)}
          draftKey={`${unit.id}:type:${level}`}
          onResult={onResult}
          toolbar={
            <button
              className="btn sm ghost"
              onClick={() => {
                if (!peek) spendHint(unit.id, 5);
                setPeek((p) => !p);
              }}
              title="Show the reference solution (costs 5 XP)"
            >
              <Icon name="eye" size={14} /> {peek ? 'Hide' : 'Peek (−5 XP)'}
            </button>
          }
        />
      )}
      {peek && level > 1 && (
        <div className="fade-up">
          <div className="eyebrow">Reference solution — read it, close it, then type it from memory</div>
          <CodeBlock code={cleanSolution(P.solution)} lang={P.language === 'python' ? 'python' : 'javascript'} />
        </div>
      )}
      {justPassed && (
        <div className="callout good pop">
          {level === 1 ? (
            <>
              <strong>Blanks nailed.</strong> Next: complete the body from a skeleton — that's what counts.
            </>
          ) : level < 4 ? (
            <>
              <strong>Level {level} cleared!</strong> Promoted to {LEVEL_NAMES[(level + 1) as LadderLevel]}. Less scaffolding, same idea.
            </>
          ) : (
            <>
              <strong>Blank page, solved from memory.</strong> That's interview-ready.
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 4. Debug ─────────────────────────────────────────

function DebugStep({ unit }: { unit: Unit; onNext: () => void }) {
  const D = unit.debug;
  const completeStep = useApp((s) => s.completeStep);
  const reviewResult = useApp((s) => s.reviewResult);
  const spendHint = useApp((s) => s.spendHint);
  const [hint, setHint] = useState(false);
  const [fails, setFails] = useState(0);
  const [solved, setSolved] = useState(false);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card flat">
        <div className="row">
          <div className="eyebrow">Find the bug</div>
          <span className="spacer" />
          {solved && <span className="chip">{D.bugType}</span>}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 16 }}>
          <Md text={D.statement} />
        </p>
      </div>
      <TaskRunner
        task={D}
        starter={D.buggy}
        draftKey={`${unit.id}:debug`}
        runLabel="Run tests"
        onResult={(r) => {
          if (r.status === 'pass') {
            setSolved(true);
            completeStep(unit.id, 'debug', hint ? Math.round(XP.debug / 2) : XP.debug);
            if (hint || fails >= 3) reviewResult(unit.id, 'debug', false);
          } else setFails((f) => f + 1);
        }}
        toolbar={
          !hint && (
            <button
              className="btn sm ghost"
              onClick={() => {
                setHint(true);
                spendHint(unit.id, 5);
              }}
            >
              <Icon name="bulb" size={14} /> Hint (−5 XP)
            </button>
          )
        }
      />
      {hint && !solved && (
        <div className="callout warn hint">
          <strong>Hint:</strong> <Md text={D.hint} />
        </div>
      )}
      {solved && (
        <div className="callout good pop">
          <strong>Fixed — {D.bugType}.</strong> <Md text={D.explanation} />
        </div>
      )}
    </div>
  );
}

// ─── 5. Mini-boss ─────────────────────────────────────

const HINT_COST = [5, 10, 20];

function BossStep({ unit, onNext, nextLabel }: { unit: Unit; onNext: () => void; nextLabel: string }) {
  const B = unit.boss;
  const completeStep = useApp((s) => s.completeStep);
  const spendHint = useApp((s) => s.spendHint);
  const reviewResult = useApp((s) => s.reviewResult);
  const done = useApp((s) => !!unitProgress(s, unit.id).steps.boss);
  const [tier, setTier] = useState(0);
  const [won, setWon] = useState(false);
  const reveal = () => {
    spendHint(unit.id, HINT_COST[tier]);
    setTier((t) => t + 1);
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card boss-card">
        <div className="row">
          <div className="eyebrow">Boss</div>
          <span className="spacer" />
          <span className="chip">+{XP.boss} XP</span>
        </div>
        <h2 style={{ margin: '8px 0 4px' }}>{B.title}</h2>
        <p style={{ margin: 0, fontSize: 16 }}>
          <Md text={B.statement} />
        </p>
      </div>
      <TaskRunner
        task={B}
        starter={B.starter}
        draftKey={`${unit.id}:boss`}
        minHeight={260}
        onResult={(r) => {
          if (r.status === 'pass') {
            setWon(true);
            completeStep(unit.id, 'boss', tier >= 3 ? 10 : XP.boss);
            if (tier >= 2) reviewResult(unit.id, 'boss', false);
          }
        }}
        toolbar={
          tier < 3 && (
            <button className="btn sm ghost" onClick={reveal} data-testid="boss-hint">
              <Icon name="bulb" size={14} /> {tier === 0 ? 'Nudge' : tier === 1 ? 'Bigger hint' : 'Reveal solution'} (−{HINT_COST[tier]} XP)
            </button>
          )
        }
      />
      <div className="hints">
        {tier >= 1 && (
          <div className="callout warn hint">
            <strong>Nudge:</strong> <Md text={B.hints[0]} />
          </div>
        )}
        {tier >= 2 && (
          <div className="callout warn hint">
            <strong>Bigger hint:</strong> <Md text={B.hints[1]} />
          </div>
        )}
        {tier >= 3 && (
          <div className="hint">
            <div className="eyebrow">Solution — now close it and type it yourself to finish</div>
            <CodeBlock code={B.solution} lang={B.language === 'python' ? 'python' : 'javascript'} />
          </div>
        )}
      </div>
      {(won || done) && (
        <div className="callout good">
          <div className="row">
            <strong>Boss cleared.</strong>
            <span className="muted">That finishes the unit.</span>
            <span className="spacer" />
            <button className="btn primary" onClick={onNext}>
              {nextLabel}
            </button>
          </div>
          <CompletionTrace animate={won} />
        </div>
      )}
    </div>
  );
}
