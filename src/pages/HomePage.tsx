import { CATALOG, MODULES } from '@/content/catalog';
import { AVAILABLE_UNITS } from '@/content/loader';
import { href } from '@/router';
import { dueReviews, unitProgress, useApp } from '@/store/store';
import { addDays, dayKey, STEP_ORDER } from '@/store/save';
import { HeroTrace } from '@/ui/HeroTrace';
import './pages.css';

const DAILY_GOAL = 60;

export function moduleProgress(units: Record<string, { completedAt?: string; steps: Record<string, boolean | undefined> }>, module: string) {
  const all = CATALOG.filter((c) => c.module === module);
  const avail = all.filter((c) => AVAILABLE_UNITS.has(c.id));
  const done = all.filter((c) => units[c.id]?.completedAt).length;
  const steps = avail.reduce((n, c) => n + STEP_ORDER.filter((s) => units[c.id]?.steps[s]).length, 0);
  return { total: all.length, available: avail.length, done, stepFrac: avail.length ? steps / (avail.length * STEP_ORDER.length) : 0 };
}

/** The unit to resume: the most recently touched unfinished unit, else the first untouched available one. */
export function nextUnitId(units: Record<string, { completedAt?: string; lastSeen?: string; steps: Record<string, boolean | undefined> }>): string | null {
  const started = CATALOG.filter((c) => AVAILABLE_UNITS.has(c.id) && units[c.id] && !units[c.id].completedAt).sort((a, b) => ((units[b.id].lastSeen ?? '') > (units[a.id].lastSeen ?? '') ? 1 : -1));
  if (started.length) return started[0].id;
  return CATALOG.find((c) => AVAILABLE_UNITS.has(c.id) && !units[c.id]?.completedAt)?.id ?? null;
}

function Heat({ daily }: { daily: Record<string, number> }) {
  const today = dayKey();
  const weeks = 16;
  const start = addDays(today, -(weeks * 7 - 1));
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <div className="heat" role="img" aria-label="XP earned per day over the last 16 weeks">
      {days.map((d) => (
        <i key={d} title={`${d}: ${daily[d] ?? 0} XP`} className={daily[d] ? 'on' : ''} />
      ))}
    </div>
  );
}

export function HomePage() {
  const s = useApp();
  const due = dueReviews(s).length;
  const today = s.daily[dayKey()] ?? 0;
  const cleared = Object.values(s.units).filter((u) => u.completedAt).length;
  const next = nextUnitId(s.units);
  const nextMeta = next ? CATALOG.find((c) => c.id === next) : null;
  const nextProg = next ? unitProgress(s, next) : null;
  const started = !!nextProg && Object.keys(nextProg.steps).length > 0;
  const firstStep = nextProg ? (STEP_ORDER.find((st) => !nextProg.steps[st]) ?? 'predict') : 'predict';
  const active = s.xp > 0 || cleared > 0 || s.streak.count > 0 || Object.keys(s.units).length > 0;
  const heroTitle = nextMeta?.id === 'array-two-index' ? 'binary search' : nextMeta?.title.toLowerCase();

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">Watch the code run. Then write it yourself.</h1>
          <p className="hero-lede">Each lesson steps through a real run of the algorithm, asks you to predict the next move, then takes the scaffolding away until you can type it from a blank page.</p>
          <div className="row">
            {started && nextMeta ? (
              <a className="btn primary lg" href={href(`/unit/${nextMeta.id}/${firstStep}`)} data-testid="continue">
                Continue {heroTitle}
              </a>
            ) : (
              <a className="btn primary lg" href={href('/unit/binary-search/predict')} data-testid="continue">
                Start with binary search
              </a>
            )}
            <a className="btn lg" href={href('/review?quick=1')}>
              Quick 10
            </a>
          </div>
        </div>
        <HeroTrace />
      </section>

      {active ? (
        <section className="stat-strip" aria-label="Your progress">
          <div>
            <b>{s.streak.count}</b>
            <span>day streak, best {s.streak.best}</span>
          </div>
          <a href={href('/review')}>
            <b>{due}</b>
            <span>{due === 1 ? 'review due' : 'reviews due'}</span>
          </a>
          <div>
            <b>{cleared}</b>
            <span>{cleared === 1 ? 'unit cleared' : 'units cleared'}</span>
          </div>
          <div className="goal">
            <b>
              {Math.min(today, DAILY_GOAL)}/{DAILY_GOAL}
            </b>
            <span>XP toward today's goal</span>
            <div className="bar">
              <span style={{ width: `${Math.min(1, today / DAILY_GOAL) * 100}%` }} />
            </div>
          </div>
        </section>
      ) : (
        <section className="first-ten">
          <h2>Your first 10 minutes</h2>
          <ol>
            <li>
              <b>Guess first.</b> Answer one prediction about binary search before you see anything run.
            </li>
            <li>
              <b>Watch it.</b> Step through the run, line by line, and change the input to see it behave differently.
            </li>
            <li>
              <b>Type it.</b> Fill in the blanks, then write the function from the signature alone.
            </li>
          </ol>
        </section>
      )}

      <section aria-labelledby="ledger-h">
        <h2 id="ledger-h" className="ledger-title">
          Six modules, {CATALOG.length} concepts
        </h2>
        <div className="ledger">
          {MODULES.map((m) => {
            const units = CATALOG.filter((c) => c.module === m.id);
            const p = moduleProgress(s.units, m.id);
            const nextHere = units.find((c) => AVAILABLE_UNITS.has(c.id) && !s.units[c.id]?.completedAt);
            return (
              <a key={m.id} className="ledger-row" href={href(`/map/${m.id}`)} data-testid={`module-${m.id}`} aria-label={`${m.title}: ${p.done} of ${p.total} concepts cleared`}>
                <div className="ledger-name">
                  <h3>{m.title}</h3>
                  <p>{m.blurb}</p>
                </div>
                <div className="ticks" aria-hidden>
                  {units.map((c) => (
                    <i key={c.id} title={c.title} className={`${s.units[c.id]?.completedAt ? 'done' : s.units[c.id] ? 'part' : ''}${nextHere && nextHere.id === c.id ? ' next' : ''}`} />
                  ))}
                </div>
                <div className="ledger-count">
                  <b>{p.done}</b> of {p.total}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {active && (
        <section className="activity">
          <h2>Recent activity</h2>
          <Heat daily={s.daily} />
          {s.badges.length > 0 && (
            <p className="muted">
              Badges earned: {s.badges.map((b) => b.replace(/^.*:/, '').replace(/-/g, ' ')).join(', ')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
