import { useEffect, useMemo, useState } from 'react';
import { CATALOG, CATALOG_BY_ID } from '@/content/catalog';
import { AVAILABLE_UNITS, loadUnit } from '@/content/loader';
import type { Unit } from '@/content/types';
import { href, navigate, useRoute } from '@/router';
import { dueReviews, useApp } from '@/store/store';
import { dayKey, type ReviewItem } from '@/store/save';
import { ItemRunner, KIND_LABEL, questionsOf, type SessionItem } from '@/features/ItemRunner';
import { Icon } from '@/ui/Icon';
import { fmtTime, useInterval } from '@/ui/common';
import './pages.css';

const QUICK_SECONDS = 600;

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Quick 10: due reviews first, then quick questions from units you've touched (or the next ones), then one bug to fix. */
export function buildQuickSession(due: ReviewItem[], units: Record<string, { completedAt?: string; steps: Record<string, boolean | undefined> }>): SessionItem[] {
  const items: SessionItem[] = due.slice(0, 4).map((r) => ({ unitId: r.unitId, kind: r.kind, fromQueue: true }));
  const avail = CATALOG.filter((c) => AVAILABLE_UNITS.has(c.id));
  const touched = avail.filter((c) => units[c.id]);
  const pool = touched.length >= 3 ? touched : avail.slice(0, Math.max(3, touched.length + 3));
  for (const c of shuffle(pool).slice(0, 7 - items.length)) items.push({ unitId: c.id, kind: 'quiz', q: Math.floor(Math.random() * 3) });
  const bugPool = touched.length ? touched : avail.slice(0, 3);
  const bug = shuffle(bugPool)[0];
  if (bug && !items.some((i) => i.unitId === bug.id && i.kind === 'debug')) items.push({ unitId: bug.id, kind: 'debug' });
  return items;
}

export default function ReviewPage() {
  const { query } = useRoute();
  const quick = query.get('quick') === '1';
  const state = useApp();
  const due = useMemo(() => dueReviews(state), [state]);
  const [session, setSession] = useState<SessionItem[] | null>(null);

  useEffect(() => {
    if (quick) setSession(buildQuickSession(dueReviews(useApp.getState()), useApp.getState().units));
    else setSession(null);
  }, [quick]);

  if (session) return <Session items={session} quick={quick} onExit={() => (quick ? navigate('/') : setSession(null))} />;

  const upcoming = Object.values(state.review)
    .filter((r) => r.due > dayKey())
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div className="grow">
          <h1 style={{ margin: 0 }}>Review queue</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Things you struggled with come back on a schedule — tomorrow, then in 2, 4, 7, 15 and 30 days — until they stick.
          </p>
        </div>
        <a className="btn" href={href('/review?quick=1')}>
          <Icon name="bolt" size={16} /> Quick 10
        </a>
        <button className="btn primary" disabled={!due.length} onClick={() => setSession(due.map((r) => ({ unitId: r.unitId, kind: r.kind, fromQueue: true })))} data-testid="start-review">
          <Icon name="play" size={14} /> Review {due.length} due
        </button>
      </div>
      {due.length === 0 && (
        <div className="callout good">
          <strong>Nothing due today.</strong> Wrong predictions, bugs you needed hints for and bosses you had to peek at will show up here.
        </div>
      )}
      {due.length > 0 && <ReviewList items={due} title="Due now" />}
      {upcoming.length > 0 && <ReviewList items={upcoming} title="Coming up" />}
    </div>
  );
}

function ReviewList({ items, title }: { items: ReviewItem[]; title: string }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3>{title}</h3>
      <div className="col" style={{ gap: 6 }}>
        {items.map((r) => (
          <div key={r.key} className="card flat row" style={{ padding: '10px 14px' }}>
            <span className="chip accent">{KIND_LABEL[r.kind]}</span>
            <a href={href(`/unit/${r.unitId}`)}>{CATALOG_BY_ID[r.unitId]?.title ?? r.unitId}</a>
            <span className="spacer" />
            <span className="dim mono" style={{ fontSize: 13 }}>
              box {r.box}, due {r.due}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Session({ items, quick, onExit }: { items: SessionItem[]; quick: boolean; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [results, setResults] = useState<(boolean | null)[]>(() => items.map(() => null));
  const [left, setLeft] = useState(QUICK_SECONDS);
  const reviewResult = useApp((s) => s.reviewResult);
  const awardXp = useApp((s) => s.awardXp);
  const done = i >= items.length || (quick && left <= 0);
  const item = items[i];

  useInterval(() => setLeft((l) => l - 1), quick && !done ? 1000 : null);

  useEffect(() => {
    if (!item) return;
    setUnit(null);
    loadUnit(item.unitId).then(setUnit);
  }, [item]);

  const onDone = (ok: boolean) => {
    setResults((r) => r.map((x, k) => (k === i ? ok : x)));
    if (item.fromQueue && item.kind !== 'quiz') reviewResult(item.unitId, item.kind, ok);
    else if (!ok && item.kind === 'debug') reviewResult(item.unitId, 'debug', false);
    if (ok) awardXp(item.kind === 'quiz' || item.kind === 'predict' ? 5 : 15);
  };

  if (done) {
    const right = results.filter(Boolean).length;
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="card pop" style={{ textAlign: 'center', padding: 32 }} data-testid="session-done">
          <Icon name="trophy" size={40} />
          <h1>{quick ? 'Quick session done' : 'Review done'}</h1>
          <p className="muted">
            {right} of {results.filter((r) => r !== null).length} answered correctly{quick ? ` in ${fmtTime(QUICK_SECONDS - Math.max(0, left))}` : ''}.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="chip accent">{KIND_LABEL[item.kind]}</span>
        <strong>{CATALOG_BY_ID[item.unitId]?.title}</strong>
        <span className="spacer" />
        {quick && (
          <span className={`chip ${left < 60 ? 'bad' : ''} mono`} aria-label="Time left">
            <Icon name="timer" size={13} /> {fmtTime(left)}
          </span>
        )}
        <span className="dim mono">
          {i + 1}/{items.length}
        </span>
        <button className="btn sm ghost" onClick={onExit}>
          Exit
        </button>
      </div>
      <div className="bar" style={{ marginBottom: 16 }}>
        <span style={{ width: `${(i / items.length) * 100}%` }} />
      </div>
      {unit ? (
        <div key={i} className="fade-up">
          <ItemRunner unit={unit} item={item.kind === 'quiz' ? { ...item, q: (item.q ?? 0) % questionsOf(unit).length } : item} onDone={onDone} />
        </div>
      ) : (
        <div className="dim">Loading…</div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <span className="spacer" />
        {results[i] === null ? (
          <button className="btn ghost" onClick={() => setI(i + 1)}>
            Skip
          </button>
        ) : (
          <button className="btn primary pop" onClick={() => setI(i + 1)} autoFocus data-testid="next-item">
            Next
          </button>
        )}
      </div>
    </div>
  );
}
