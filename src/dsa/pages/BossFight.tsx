// Topic boss fight: a timed pattern-recognition quiz, then one problem with hints, the visualizer and the
// reference solution turned off.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/store/store';
import { TaskRunner } from '@/features/TaskRunner';
import { CodeBlock, Md, fmtTime, useInterval } from '@/ui/common';
import { Icon } from '@/ui/Icon';
import { parseAnchors } from '@/engine/recorder';
import { PROBLEM_BY_ID } from '../catalog';
import { loadProblem } from '../loader';
import type { ProblemContent, TopicContent, TopicId } from '../types';

type Stage = 'intro' | 'quiz' | 'result' | 'problem';

function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function BossFight({ topic, content }: { topic: TopicId; content: TopicContent }) {
  const boss = useApp((s) => s.dsa.bosses[topic]);
  const dsaBoss = useApp((s) => s.dsaBoss);
  const [stage, setStage] = useState<Stage>('intro');
  const [order, setOrder] = useState(() => content.boss.quiz.map((_, i) => i));
  const [qi, setQi] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(content.boss.seconds);
  const scoreRef = useRef(0);

  const finish = () => {
    dsaBoss(topic, { quizScore: scoreRef.current });
    setStage('result');
  };

  useInterval(() => setLeft((s) => Math.max(0, s - 1)), stage === 'quiz' ? 1000 : null);
  // time ran out: score what was answered so far (kept out of the state updater so it runs once)
  useEffect(() => {
    if (stage === 'quiz' && left === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, stage]);

  const start = () => {
    setOrder(shuffled(content.boss.quiz.map((_, i) => i)));
    setQi(0);
    setChosen(null);
    setScore(0);
    scoreRef.current = 0;
    setLeft(content.boss.seconds);
    setStage('quiz');
  };

  const total = content.boss.quiz.length;
  const q = content.boss.quiz[order[qi]];
  const answer = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    if (i === q.answer) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }
  };
  const nextQ = () => {
    if (qi + 1 >= total) return finish();
    setQi(qi + 1);
    setChosen(null);
  };

  return (
    <section className="dsa-boss" aria-label="Boss fight" data-testid="boss">
      <h2>Boss fight</h2>
      {stage === 'intro' && (
        <div className="dsa-boss-box">
          <p>
            Two rounds. First a timed quiz of {total} pattern-recognition questions ({fmtTime(content.boss.seconds)}). Then one problem to solve with no hints, no visualizer and no reference solution.
          </p>
          <p className="dim">{content.boss.note}</p>
          <div className="row">
            <button className="btn primary" onClick={start} data-testid="boss-start">
              Start the quiz
            </button>
            {boss?.quizBest !== undefined && (
              <span className="chip">
                Best quiz score {boss.quizBest}/{total}
              </span>
            )}
            {boss?.solvedAt && (
              <span className="chip good">
                <Icon name="crown" size={13} /> Boss problem solved
              </span>
            )}
            <button className="btn ghost" onClick={() => setStage('problem')} data-testid="boss-skip-quiz">
              Go straight to the problem
            </button>
          </div>
        </div>
      )}

      {stage === 'quiz' && q && (
        <div className="dsa-boss-box" role="group" aria-label={`Question ${qi + 1} of ${total}`}>
          <div className="row">
            <b>
              Question {qi + 1} of {total}
            </b>
            <span className="spacer" />
            <span className={`chip ${left <= 20 ? 'bad' : ''} mono`} role="timer" aria-live="off" data-testid="boss-timer">
              {fmtTime(left)}
            </span>
          </div>
          <p className="dsa-q">
            <Md text={q.prompt} />
          </p>
          <div className="dsa-opts">
            {q.options.map((o, i) => (
              <button key={i} className={`opt${chosen !== null && i === q.answer ? ' right' : ''}${chosen === i && i !== q.answer ? ' wrong' : ''}`} disabled={chosen !== null} onClick={() => answer(i)} data-testid={`boss-option-${i}`}>
                <kbd>{i + 1}</kbd>
                <span>
                  <Md text={o} />
                </span>
              </button>
            ))}
          </div>
          {chosen !== null && (
            <div className={`callout ${chosen === q.answer ? 'good' : 'bad'} fade-up`}>
              <Md text={q.explain} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary sm" onClick={nextQ} autoFocus data-testid="boss-next">
                  {qi + 1 >= total ? 'See the result' : 'Next question'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === 'result' && (
        <div className="dsa-boss-box">
          <p data-testid="boss-score">
            <b>
              {score} of {total}
            </b>{' '}
            correct{left === 0 ? ' (time ran out)' : ''}.{' '}
            {score === total ? 'A clean sweep.' : score >= Math.ceil(total * 0.7) ? 'Solid. Review the ones you missed.' : 'Worth rereading the pattern and the checklist above, then trying again.'}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => setStage('problem')}>
              On to the problem
            </button>
            <button className="btn" onClick={start}>
              Retry the quiz
            </button>
          </div>
        </div>
      )}

      {stage === 'problem' && <BossProblem topic={topic} slug={content.boss.problem} onBack={() => setStage('intro')} />}
    </section>
  );
}

function BossProblem({ topic, slug, onBack }: { topic: TopicId; slug: string; onBack: () => void }) {
  const meta = PROBLEM_BY_ID[slug];
  const [c, setC] = useState<ProblemContent | null | undefined>(undefined);
  const [solved, setSolved] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const dsaBoss = useApp((s) => s.dsaBoss);
  useEffect(() => {
    let alive = true;
    loadProblem(slug).then((x) => alive && setC(x));
    return () => {
      alive = false;
    };
  }, [slug]);
  const clean = useMemo(() => (c ? parseAnchors(c.solution).clean : ''), [c]);
  if (c === undefined) return <div className="dim">Loading…</div>;
  if (c === null) return <div className="callout warn">The boss problem is not written yet.</div>;
  return (
    <div className="dsa-boss-box">
      <div className="row">
        <h3 style={{ margin: 0 }}>{meta.title}</h3>
        <span className={`chip diff-${meta.difficulty.toLowerCase()}`}>{meta.difficulty}</span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={onBack}>
          Back
        </button>
      </div>
      <p className="muted">
        <Md text={c.summary} />
      </p>
      <p className="dim">
        Example: <code>{c.example.input}</code> gives <code>{c.example.output}</code>. No hints, no visualizer.
      </p>
      <TaskRunner
        task={{ language: 'python', fnName: c.task.fnName, tests: c.task.tests, compare: c.task.compare, harness: c.task.harness, adapter: c.task.adapter }}
        starter={c.task.signature}
        draftKey={`dsa-boss:${slug}`}
        minHeight={240}
        onResult={(r) => {
          if (r.status === 'pass' && !gaveUp) {
            setSolved(true);
            dsaBoss(topic, { solved: true });
          }
        }}
        toolbar={
          !gaveUp && !solved ? (
            <button className="btn sm ghost" onClick={() => setGaveUp(true)} data-testid="boss-giveup">
              Give up and show the solution
            </button>
          ) : null
        }
      />
      {solved && (
        <div className="callout good pop">
          <strong>Boss defeated.</strong> You solved it without any help.
        </div>
      )}
      {gaveUp && (
        <div className="fade-up">
          <p className="muted">This attempt does not count. Read the solution, close it, and come back to try again.</p>
          <CodeBlock code={clean} lang="python" />
        </div>
      )}
    </div>
  );
}
