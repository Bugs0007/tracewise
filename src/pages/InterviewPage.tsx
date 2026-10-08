import { useEffect, useRef, useState } from 'react';
import { CATALOG, CATALOG_BY_ID, MODULES } from '@/content/catalog';
import { AVAILABLE_UNITS, loadUnit } from '@/content/loader';
import type { TaskBase, Unit } from '@/content/types';
import { commentPrefix } from '@/content/ladder';
import { useApp } from '@/store/store';
import { TaskRunner } from '@/features/TaskRunner';
import { Icon } from '@/ui/Icon';
import { fmtTime, Md, useInterval } from '@/ui/common';
import { href } from '@/router';
import type { RunResult } from '@/runner';
import './pages.css';

interface Problem {
  unit: Unit;
  kind: 'boss' | 'practice';
  title: string;
  statement: string;
  task: TaskBase;
  starter: string;
}

function toProblem(unit: Unit, kind: 'boss' | 'practice'): Problem {
  if (kind === 'boss') return { unit, kind, title: unit.boss.title, statement: unit.boss.statement, task: unit.boss, starter: unit.boss.starter };
  const P = unit.practice;
  return {
    unit,
    kind,
    title: CATALOG_BY_ID[unit.id].title,
    statement: `${P.statement} Name your function \`${P.fnName}\`.`,
    task: P,
    starter: `${commentPrefix(P.language)} Write \`${P.fnName}\` from scratch.\n`,
  };
}

export default function InterviewPage() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [report, setReport] = useState<{ solved: boolean[]; seconds: number; modules: string[] } | null>(null);
  const [cfg, setCfg] = useState({ modules: ['dsa'], count: 3, minutes: 30 });
  const [loading, setLoading] = useState(false);
  const history = useApp((s) => s.interviews);

  const modulesWithContent = MODULES.filter((m) => CATALOG.some((c) => c.module === m.id && AVAILABLE_UNITS.has(c.id)));

  const start = async () => {
    setLoading(true);
    const pool = CATALOG.filter((c) => cfg.modules.includes(c.module) && AVAILABLE_UNITS.has(c.id));
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, cfg.count);
    const units = (await Promise.all(picked.map((c) => loadUnit(c.id)))).filter((u): u is Unit => !!u);
    setProblems(units.map((u, i) => toProblem(u, i % 2 === 0 ? 'boss' : 'practice')));
    setReport(null);
    setLoading(false);
  };

  if (report && problems) return <Report problems={problems} report={report} onAgain={() => (setProblems(null), setReport(null))} />;
  if (problems) return <Session problems={problems} minutes={cfg.minutes} onFinish={(solved, seconds) => setReport({ solved, seconds, modules: cfg.modules })} />;

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="eyebrow">No hints. Timed. Random.</div>
      <h1>Interview Mode</h1>
      <p className="muted">A mock coding round: problems drawn at random from the modules you pick, a countdown, no hints and no peeking. You can run the visible tests. A score report at the end feeds weak spots into your review queue.</p>
      <div className="card col" style={{ gap: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Modules
          </div>
          <div className="row">
            {modulesWithContent.map((m) => {
              const on = cfg.modules.includes(m.id);
              return (
                <button key={m.id} className={`btn sm ${on ? 'primary' : ''}`} aria-pressed={on} onClick={() => setCfg((c) => ({ ...c, modules: on ? c.modules.filter((x) => x !== m.id) : [...c.modules, m.id] }))}>
                  {m.code} {m.title.split(' (')[0]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="row" style={{ gap: 28 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Problems
            </div>
            <div className="seg" role="group" aria-label="Number of problems">
              {[2, 3, 5].map((n) => (
                <button key={n} aria-pressed={cfg.count === n} onClick={() => setCfg((c) => ({ ...c, count: n }))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Time
            </div>
            <div className="seg" role="group" aria-label="Duration">
              {[20, 30, 45].map((n) => (
                <button key={n} aria-pressed={cfg.minutes === n} onClick={() => setCfg((c) => ({ ...c, minutes: n }))}>
                  {n} min
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="row">
          <span className="spacer" />
          <button className="btn primary lg" disabled={!cfg.modules.length || loading} onClick={start} data-testid="start-interview">
            <Icon name="timer" size={16} /> Start interview
          </button>
        </div>
      </div>
      {history.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>Past rounds</h3>
          <div className="col" style={{ gap: 6 }}>
            {[...history].reverse().slice(0, 8).map((h, i) => (
              <div key={i} className="card flat row" style={{ padding: '8px 14px' }}>
                <span className="mono">{h.at.slice(0, 10)}</span>
                <span className="chip">{h.modules.join(', ')}</span>
                <span className="spacer" />
                <strong>
                  {h.score}/{h.total}
                </strong>
                <span className="dim mono">{fmtTime(h.seconds)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Session({ problems, minutes, onFinish }: { problems: Problem[]; minutes: number; onFinish: (solved: boolean[], seconds: number) => void }) {
  const [idx, setIdx] = useState(0);
  const [solved, setSolved] = useState<boolean[]>(() => problems.map(() => false));
  const [left, setLeft] = useState(minutes * 60);
  const started = useRef(Date.now());
  const finish = () => onFinish(solved, Math.round((Date.now() - started.current) / 1000));
  useInterval(() => setLeft((l) => l - 1), 1000);
  useEffect(() => {
    if (left <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  const p = problems[idx];
  return (
    <div className="page wide">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="row" role="tablist" aria-label="Problems">
          {problems.map((q, i) => (
            <button key={i} role="tab" aria-selected={i === idx} className={`btn sm ${i === idx ? 'primary' : ''}`} onClick={() => setIdx(i)}>
              {solved[i] ? <Icon name="check" size={13} /> : i + 1}
              <span className="hide-sm">{q.title}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className={`chip mono ${left < 120 ? 'bad' : 'accent'}`} style={{ fontSize: 14, height: 30 }} aria-label="Time left" data-testid="interview-timer">
          <Icon name="timer" size={14} /> {fmtTime(left)}
        </span>
        <button className="btn" onClick={finish} data-testid="finish-interview">
          Finish
        </button>
      </div>
      <div className="card flat" style={{ marginBottom: 12 }}>
        <div className="row">
          <h2 style={{ margin: 0 }}>{p.title}</h2>
          <span className="spacer" />
          {solved[idx] && <span className="chip good">Solved</span>}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 16 }}>
          <Md text={p.statement} />
        </p>
      </div>
      <TaskRunner
        key={idx}
        task={p.task}
        starter={p.starter}
        draftKey={`interview:${p.unit.id}:${p.kind}`}
        minHeight={300}
        onResult={(r: RunResult) => {
          if (r.status === 'pass') setSolved((s) => s.map((x, i) => (i === idx ? true : x)));
        }}
      />
    </div>
  );
}

function Report({ problems, report, onAgain }: { problems: Problem[]; report: { solved: boolean[]; seconds: number; modules: string[] }; onAgain: () => void }) {
  const recordInterview = useApp((s) => s.recordInterview);
  const reviewResult = useApp((s) => s.reviewResult);
  const awardXp = useApp((s) => s.awardXp);
  const saveDraft = useApp((s) => s.saveDraft);
  const recorded = useRef(false);
  const score = report.solved.filter(Boolean).length;
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    recordInterview({ at: new Date().toISOString(), modules: report.modules, score, total: problems.length, seconds: report.seconds });
    problems.forEach((p, i) => {
      if (!report.solved[i]) reviewResult(p.unit.id, p.kind, false);
      // interview drafts are one-shot
      saveDraft(`interview:${p.unit.id}:${p.kind}`, '');
    });
    if (score) awardXp(score * 25);
  }, [problems, report, score, recordInterview, reviewResult, awardXp, saveDraft]);
  const pct = Math.round((score / problems.length) * 100);
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="card pop" style={{ textAlign: 'center', padding: 32 }} data-testid="interview-report">
        <div className="eyebrow">Score report</div>
        <div className="big-num" style={{ fontSize: 56, margin: '10px 0' }}>
          {score}/{problems.length}
        </div>
        <p className="muted">
          {pct >= 80 ? 'Strong round.' : pct >= 50 ? 'Solid — tighten the misses below.' : 'Good practice. The misses are now in your review queue.'} Time used {fmtTime(report.seconds)}.
        </p>
      </div>
      <div className="col" style={{ gap: 8, marginTop: 16 }}>
        {problems.map((p, i) => (
          <div key={i} className="card flat row">
            <span className={`chip ${report.solved[i] ? 'good' : 'bad'}`}>{report.solved[i] ? 'Solved' : 'Missed'}</span>
            <strong>{p.title}</strong>
            <span className="dim">{CATALOG_BY_ID[p.unit.id].topic}</span>
            <span className="spacer" />
            <a className="btn sm" href={href(`/unit/${p.unit.id}/watch`)}>
              Revisit unit
            </a>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <span className="spacer" />
        <button className="btn primary" onClick={onAgain}>
          New round
        </button>
      </div>
    </div>
  );
}
