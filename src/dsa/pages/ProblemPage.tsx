import { useEffect, useMemo, useState } from 'react';
import { href } from '@/router';
import { useApp } from '@/store/store';
import { Player } from '@/player/Player';
import { TaskRunner } from '@/features/TaskRunner';
import { CodeBlock, Md } from '@/ui/common';
import { Icon } from '@/ui/Icon';
import { parseAnchors } from '@/engine/recorder';
import type { RunResult } from '@/runner';
import { PROBLEMS, PROBLEM_BY_ID, TOPIC_BY_ID } from '../catalog';
import { AVAILABLE_PROBLEMS, loadProblem } from '../loader';
import { PATTERNS } from '../patterns';
import { awardTopicBadgeIfDone, problemState } from '../progress';
import type { PatternId, ProblemContent } from '../types';
import '@/features/task.css';
import './dsa.css';

/** Deterministic shuffle so the right answer is not always first, and does not move between renders. */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function ProblemPage({ slug }: { slug: string }) {
  const meta = PROBLEM_BY_ID[slug];
  const topic = TOPIC_BY_ID[meta.topic];
  const [content, setContent] = useState<ProblemContent | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setContent(undefined);
    loadProblem(slug).then((c) => alive && setContent(c));
    return () => {
      alive = false;
    };
  }, [slug]);

  const idx = PROBLEMS.findIndex((p) => p.id === slug);
  const siblings = PROBLEMS.filter((p) => p.topic === meta.topic);
  const prev = idx > 0 && PROBLEMS[idx - 1].topic === meta.topic ? PROBLEMS[idx - 1] : null;
  const next = idx < PROBLEMS.length - 1 ? PROBLEMS[idx + 1] : null;

  return (
    <div className="page dsa-page">
      <div className="crumbs">
        <a href={href('/dsa')}>NeetCode 150</a>
        <span aria-hidden>/</span>
        <a href={href(`/dsa/${meta.topic}`)}>{topic.title}</a>
        <span aria-hidden>/</span>
        <span>
          {siblings.findIndex((p) => p.id === slug) + 1} of {siblings.length}
        </span>
      </div>
      <header className="dsa-head">
        <h1 data-testid="problem-title">{meta.title}</h1>
        <div className="row">
          <span className={`chip diff-${meta.difficulty.toLowerCase()}`}>{meta.difficulty}</span>
          {meta.patterns.map((p) => (
            <span key={p} className="chip">
              {PATTERNS[p]?.label ?? p}
            </span>
          ))}
        </div>
      </header>

      {content === undefined && <div className="dim" style={{ marginTop: 18 }}>Loading problem…</div>}
      {content === null && (
        <div className="callout warn" style={{ marginTop: 18 }}>
          This problem is on the track but its content has not been written yet. {AVAILABLE_PROBLEMS.size} of {PROBLEMS.length} problems are ready.
          <div className="row" style={{ marginTop: 8 }}>
            <a className="btn sm" href={meta.leetcode} target="_blank" rel="noopener noreferrer">
              Open on LeetCode
            </a>
            {meta.free && (
              <a className="btn sm" href={meta.free.url} target="_blank" rel="noopener noreferrer">
                {meta.free.label}
              </a>
            )}
          </div>
        </div>
      )}
      {content && <ProblemBody slug={slug} content={content} />}

      <nav className="dsa-pager" aria-label="Neighbouring problems">
        {prev ? (
          <a href={href(`/dsa/${prev.topic}/${prev.id}`)}>← {prev.title}</a>
        ) : (
          <span />
        )}
        {next && (
          <a href={href(`/dsa/${next.topic}/${next.id}`)} data-testid="next-problem">
            {next.title} →
          </a>
        )}
      </nav>
    </div>
  );
}

function Section({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="dsa-sec" aria-labelledby={`sec-${n}`} id={id}>
      <h2 id={`sec-${n}`}>
        <span className="sec-n" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ProblemBody({ slug, content: c }: { slug: string; content: ProblemContent }) {
  const meta = PROBLEM_BY_ID[slug];
  const prog = useApp((s) => s.dsa.problems[slug]);
  const dsaProblem = useApp((s) => s.dsaProblem);
  const dsaMark = useApp((s) => s.dsaMark);
  const awardXp = useApp((s) => s.awardXp);

  // "Spot the pattern" gate: answering (or skipping) unlocks the rest
  const [picked, setPicked] = useState<PatternId | null>(null);
  const [skipped, setSkipped] = useState(false);
  // answering or skipping unlocks; so does having engaged with the problem before (a skipped visit must not lock you out next time)
  const engaged = !!prog && (prog.pattern !== undefined || !!prog.status || prog.hints > 0 || !!prog.typed || !!prog.revealed || prog.predictTotal > 0);
  const unlocked = picked !== null || skipped || engaged;
  const options = useMemo(() => seededOrder(c.pattern.options, slug), [c.pattern.options, slug]);

  const pick = (id: PatternId) => {
    if (picked) return;
    setPicked(id);
    // only the first answer counts towards "got the pattern on the first try"
    if (prog?.pattern === undefined) {
      dsaProblem(slug, { pattern: id === c.pattern.answer });
      if (id === c.pattern.answer) awardXp(3);
    }
  };

  const [hintsShown, setHintsShown] = useState(Math.min(prog?.hints ?? 0, c.hints.length));
  const showHint = () => {
    const n = hintsShown + 1;
    setHintsShown(n);
    dsaProblem(slug, { hints: Math.max(prog?.hints ?? 0, n) });
  };

  const [revealed, setRevealed] = useState(false);
  const clean = useMemo(() => parseAnchors(c.solution).clean, [c.solution]);

  const onTests = (r: RunResult) => {
    if (r.status !== 'pass') return;
    const st = useApp.getState().dsa.problems[slug];
    if (!st?.typed) {
      dsaProblem(slug, { typed: true });
      awardXp(st?.revealed ? 5 : 15);
    }
  };

  const state = problemState(prog);
  const mark = (s: 'solved' | 'review') => {
    dsaMark(slug, state === s ? null : s);
    if (s === 'solved' && state !== 'solved') awardTopicBadgeIfDone(meta.topic);
  };

  return (
    <div className="dsa-flow">
      <Section n={1} title="The problem">
        <p className="dsa-lede">
          <Md text={c.summary} />
        </p>
        <div className="dsa-example" aria-label="Example">
          <div>
            <span className="k">Input</span> <code>{c.example.input}</code>
          </div>
          <div>
            <span className="k">Output</span> <code>{c.example.output}</code>
          </div>
          {c.example.note && <p className="dim">{c.example.note}</p>}
        </div>
        <div className="row dsa-links">
          <a className="btn sm" href={meta.leetcode} target="_blank" rel="noopener noreferrer">
            Original on LeetCode
          </a>
          {meta.free && (
            <a className="btn sm" href={meta.free.url} target="_blank" rel="noopener noreferrer">
              {meta.free.label}
            </a>
          )}
          {meta.free && <span className="dim">The LeetCode version is premium.</span>}
        </div>
      </Section>

      <Section n={2} title="Spot the pattern">
        <p className="muted">Before any hints: which idea fits this problem best?</p>
        <div className="dsa-opts" role="group" aria-label="Pattern choices">
          {options.map((id, i) => {
            const right = id === c.pattern.answer;
            const chosen = picked === id;
            return (
              <button key={id} className={`opt${picked && right ? ' right' : ''}${chosen && !right ? ' wrong' : ''}`} disabled={!!picked || (prog?.pattern !== undefined && !skipped && !picked)} onClick={() => pick(id)} data-testid={`pattern-${id}`}>
                <kbd>{i + 1}</kbd>
                <span>
                  <strong>{PATTERNS[id]?.label ?? id}</strong>
                  {(picked || prog?.pattern !== undefined) && <small>{PATTERNS[id]?.blurb}</small>}
                </span>
              </button>
            );
          })}
        </div>
        {picked && (
          <div className={`callout ${picked === c.pattern.answer ? 'good' : 'bad'} fade-up`} data-testid="pattern-feedback">
            <strong>{picked === c.pattern.answer ? 'Yes. ' : `Not quite: the pattern here is ${PATTERNS[c.pattern.answer]?.label ?? c.pattern.answer}. `}</strong>
            {picked !== c.pattern.answer && c.pattern.notes?.[picked] && <Md text={c.pattern.notes[picked] + ' '} />}
            <Md text={c.pattern.why} />
          </div>
        )}
        {!picked && prog?.pattern !== undefined && (
          <div className="callout info">
            You already answered this ({prog.pattern ? 'correctly on the first try' : 'not on the first try'}). The pattern is <strong>{PATTERNS[c.pattern.answer]?.label}</strong>. <Md text={c.pattern.why} />
          </div>
        )}
        {!unlocked && (
          <button className="btn ghost sm" onClick={() => setSkipped(true)} data-testid="skip-pattern">
            Skip and show me everything
          </button>
        )}
      </Section>

      {!unlocked ? (
        <div className="dsa-locked" data-testid="locked">
          <Icon name="lock" size={16} /> Hints, the explanation, the visualizer and the editor unlock once you pick a pattern.
        </div>
      ) : (
        <>
          <Section n={3} title="Hints">
            <p className="muted">Open them one at a time. Each one gives away a little more.</p>
            <ol className="dsa-hints">
              {c.hints.slice(0, hintsShown).map((h, i) => (
                <li key={i} className="fade-up">
                  <Md text={h} />
                </li>
              ))}
            </ol>
            {hintsShown < c.hints.length ? (
              <button className="btn sm" onClick={showHint} data-testid="show-hint">
                <Icon name="bulb" size={14} /> Show hint {hintsShown + 1} of {c.hints.length}
              </button>
            ) : (
              <span className="dim">That was the last hint.</span>
            )}
          </Section>

          <Section n={4} title="Explanation">
            <div className="dsa-insight">
              <Md text={c.explanation.insight} />
            </div>
            <dl className="dsa-compare">
              <div>
                <dt>Brute force</dt>
                <dd>
                  <Md text={c.explanation.brute} />
                </dd>
              </div>
              <div>
                <dt>Better</dt>
                <dd>
                  <Md text={c.explanation.optimal} />
                </dd>
              </div>
            </dl>
            <details className="dsa-more">
              <summary>Full walkthrough</summary>
              {c.explanation.walkthrough.map((p, i) => (
                <p key={i}>
                  <Md text={p} />
                </p>
              ))}
            </details>
            <details className="dsa-more">
              <summary>Edge cases</summary>
              <ul>
                {c.explanation.edgeCases.map((p, i) => (
                  <li key={i}>
                    <Md text={p} />
                  </li>
                ))}
              </ul>
            </details>
            <details className="dsa-more">
              <summary>Why it works</summary>
              {c.explanation.whyItWorks.map((p, i) => (
                <p key={i}>
                  <Md text={p} />
                </p>
              ))}
            </details>
          </Section>

          <Section n={5} title="Watch it run" id="visualizer">
            <p className="muted">
              Step through the real algorithm. Predict mode pauses at a few key moments and asks what happens next. Change the input to try your own cases.
            </p>
            <Player
              key={slug}
              viz={c.viz}
              quizDefault
              predictMode="authored"
              onQuizAnswer={(ok) => {
                const st = useApp.getState().dsa.problems[slug];
                dsaProblem(slug, { predictTotal: (st?.predictTotal ?? 0) + 1, predictRight: (st?.predictRight ?? 0) + (ok ? 1 : 0) });
              }}
            />
          </Section>

          <Section n={6} title="Type it yourself">
            <p className="muted">Write the solution from memory in Python. The tests run in your browser. The reference solution stays hidden until you ask.</p>
            <TaskRunner
              task={{ language: 'python', fnName: c.task.fnName, tests: c.task.tests, compare: c.task.compare, harness: c.task.harness, adapter: c.task.adapter }}
              starter={c.task.signature}
              draftKey={`dsa:${slug}`}
              minHeight={220}
              onResult={onTests}
              toolbar={
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    if (!revealed) dsaProblem(slug, { revealed: true });
                    setRevealed((v) => !v);
                  }}
                  aria-expanded={revealed}
                  data-testid="reveal"
                >
                  <Icon name="eye" size={14} /> {revealed ? 'Hide the solution' : 'Reveal the solution'}
                </button>
              }
            />
            {revealed && (
              <div className="fade-up">
                <p className="muted">Read it, close it, then type it again from memory.</p>
                <CodeBlock code={clean} lang="python" />
              </div>
            )}
          </Section>

          <Section n={7} title="Complexity">
            <dl className="dsa-cx">
              <div>
                <dt>Time</dt>
                <dd>
                  <code>{c.complexity.time.big}</code> <Md text={c.complexity.time.why} />
                </dd>
              </div>
              <div>
                <dt>Space</dt>
                <dd>
                  <code>{c.complexity.space.big}</code> <Md text={c.complexity.space.why} />
                </dd>
              </div>
            </dl>
          </Section>

          <Section n={8} title="How did it go?">
            <div className="row">
              <button className={`btn${state === 'solved' ? ' primary' : ''}`} onClick={() => mark('solved')} aria-pressed={state === 'solved'} data-testid="mark-solved">
                <Icon name="check" size={15} /> {state === 'solved' ? 'Solved' : 'Mark solved'}
              </button>
              <button className={`btn${state === 'review' ? ' primary' : ''}`} onClick={() => mark('review')} aria-pressed={state === 'review'} data-testid="mark-review">
                <Icon name="reset" size={15} /> {state === 'review' ? 'In your review queue' : 'Needs review'}
              </button>
              <span className="dim">{state === 'review' ? 'It comes back after 1, 2, 4, 7, 15 and 30 days.' : prog?.typed ? 'Your code passed every test.' : ''}</span>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
