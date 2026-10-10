import { href } from '@/router';
import { useApp } from '@/store/store';
import { PROBLEMS, TOPICS, problemsOf } from '../catalog';
import { AVAILABLE_PROBLEMS } from '../loader';
import { nextProblem, problemState, topicProgress, trackProgress } from '../progress';
import '@/pages/pages.css';
import '@/features/task.css';
import './dsa.css';

export default function DsaIndexPage() {
  const dsa = useApp((s) => s.dsa);
  const total = trackProgress(dsa);
  const next = nextProblem(dsa);
  const written = PROBLEMS.filter((p) => AVAILABLE_PROBLEMS.has(p.id)).length;
  return (
    <div className="page">
      <div className="crumbs">
        <a href={href('/map/dsa')}>Data Structures &amp; Algorithms</a>
        <span aria-hidden>/</span>
        <span>NeetCode 150</span>
      </div>
      <div className="page-head" style={{ marginTop: 6 }}>
        <div className="grow">
          <h1 style={{ margin: 0 }}>NeetCode 150</h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: '60ch' }}>
            The classic interview list, grouped by pattern. Each problem is a short session: spot the pattern, step through the algorithm, then write it yourself.
          </p>
        </div>
        <p className="muted" style={{ margin: 0 }} data-testid="dsa-total">
          <b style={{ color: 'var(--ink)' }}>{total.solved}</b> of {total.total} solved
          {total.review > 0 && <> · {total.review} to review</>}
        </p>
      </div>
      {next && AVAILABLE_PROBLEMS.has(next.id) && (
        <div className="row" style={{ margin: '14px 0 4px' }}>
          <a className="btn primary" href={href(`/dsa/${next.topic}/${next.id}`)} data-testid="dsa-continue">
            {dsa.problems[next.id] ? 'Continue' : 'Start'}: {next.title}
          </a>
          {written < PROBLEMS.length && <span className="dim">{written} of {PROBLEMS.length} problems are written so far.</span>}
        </div>
      )}
      <div className="ledger" style={{ marginTop: 22 }}>
        {TOPICS.map((t) => {
          const list = problemsOf(t.id);
          const p = topicProgress(dsa, t.id);
          const avail = list.filter((x) => AVAILABLE_PROBLEMS.has(x.id)).length;
          const nextHere = list.find((x) => AVAILABLE_PROBLEMS.has(x.id) && problemState(dsa.problems[x.id]) !== 'solved');
          return (
            <a key={t.id} className={`ledger-row${avail ? '' : ' soon'}`} href={href(`/dsa/${t.id}`)} data-testid={`dsa-topic-${t.id}`} aria-label={`${t.title}: ${p.solved} of ${p.total} solved`}>
              <div className="ledger-name">
                <h3>{t.title}</h3>
                <p>{t.blurb}</p>
              </div>
              <div className="ticks" aria-hidden>
                {list.map((x) => {
                  const s = problemState(dsa.problems[x.id]);
                  return <i key={x.id} title={x.title} className={`${s === 'solved' ? 'done' : s === 'review' || s === 'started' ? 'part' : ''}${nextHere?.id === x.id ? ' next' : ''}`} />;
                })}
              </div>
              <div className="ledger-count">
                <b>{p.solved}</b>/{p.total}
                {!avail && <div className="dim">soon</div>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
