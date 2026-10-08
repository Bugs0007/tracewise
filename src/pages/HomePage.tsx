import { CATALOG, MODULES } from '@/content/catalog';
import { AVAILABLE_UNITS } from '@/content/loader';
import { href } from '@/router';
import { dueReviews, unitProgress, useApp } from '@/store/store';
import { addDays, dayKey, levelInfo, STEP_ORDER } from '@/store/save';
import { Icon } from '@/ui/Icon';
import { ProgressRing } from '@/ui/common';
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

function Heatmap({ daily }: { daily: Record<string, number> }) {
  const today = dayKey();
  const weeks = 16;
  const start = addDays(today, -(weeks * 7 - 1));
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const max = Math.max(20, ...days.map((d) => daily[d] ?? 0));
  return (
    <div className="heat" role="img" aria-label="Activity over the last 16 weeks">
      {days.map((d) => {
        const v = daily[d] ?? 0;
        return <i key={d} title={`${d}: ${v} XP`} style={{ opacity: v ? 0.25 + 0.75 * (v / max) : 1, background: v ? 'var(--accent-2)' : undefined }} />;
      })}
    </div>
  );
}

export function HomePage() {
  const s = useApp();
  const { level, into, span } = levelInfo(s.xp);
  const due = dueReviews(s).length;
  const today = s.daily[dayKey()] ?? 0;
  const next = nextUnitId(s.units);
  const nextMeta = next ? CATALOG.find((c) => c.id === next) : null;
  const nextProg = next ? unitProgress(s, next) : null;
  const firstStep = nextProg ? (STEP_ORDER.find((st) => !nextProg.steps[st]) ?? 'predict') : 'predict';
  const cleared = Object.values(s.units).filter((u) => u.completedAt).length;

  return (
    <div className="page">
      <section className="hero card">
        <div className="grow">
          <div className="eyebrow">Interview prep, the hands-on way</div>
          <h1 className="hero-title">
            Watch it. Predict it. <span className="grad">Type it yourself.</span>
          </h1>
          <p className="muted" style={{ maxWidth: 560 }}>
            Bite-sized units: a step-through visualizer driven by real execution, then a typing ladder that fades the scaffolding until you can write it from a blank page.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            {nextMeta ? (
              <a className="btn primary lg" href={href(`/unit/${nextMeta.id}/${firstStep}`)} data-testid="continue">
                <Icon name="play" size={16} /> {nextProg && Object.keys(nextProg.steps).length ? 'Continue' : 'Start'}: {nextMeta.title}
              </a>
            ) : (
              <a className="btn primary lg" href={href('/map')}>
                Open the map
              </a>
            )}
            <a className="btn lg" href={href('/review?quick=1')}>
              <Icon name="bolt" size={16} /> Quick 10-min session
            </a>
          </div>
        </div>
        <div className="hero-stats">
          <ProgressRing value={Math.min(1, today / DAILY_GOAL)} size={96} stroke={8} color="var(--accent-2)">
            <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{today}</div>
              <div className="dim" style={{ fontSize: 11 }}>/ {DAILY_GOAL} XP</div>
            </div>
          </ProgressRing>
          <div className="dim" style={{ fontSize: 12, textAlign: 'center' }}>
            today's goal
          </div>
        </div>
      </section>

      <section className="stat-row">
        <div className="card stat">
          <span className="lvl">{level}</span>
          <div className="grow">
            <div className="stat-label">Level {level}</div>
            <div className="bar">
              <span style={{ width: `${(into / span) * 100}%` }} />
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              {span - into} XP to level {level + 1}
            </div>
          </div>
        </div>
        <div className="card stat">
          <Icon name="flame" size={28} />
          <div>
            <div className="stat-num">{s.streak.count}</div>
            <div className="stat-label">day streak · best {s.streak.best}</div>
          </div>
        </div>
        <a className="card stat hover" href={href('/review')}>
          <Icon name="review" size={28} />
          <div>
            <div className="stat-num">{due}</div>
            <div className="stat-label">reviews due</div>
          </div>
        </a>
        <a className="card stat hover" href={href('/interview')}>
          <Icon name="timer" size={28} />
          <div>
            <div className="stat-num">{s.interviews.length}</div>
            <div className="stat-label">mock interviews</div>
          </div>
        </a>
        <div className="card stat">
          <Icon name="crown" size={28} />
          <div>
            <div className="stat-num">{cleared}</div>
            <div className="stat-label">units cleared</div>
          </div>
        </div>
      </section>

      <h2 style={{ marginTop: 28 }}>Modules</h2>
      <div className="grid-cards">
        {MODULES.map((m) => {
          const p = moduleProgress(s.units, m.id);
          return (
            <a key={m.id} className="card hover module-card" href={href(`/map/${m.id}`)} style={{ ['--mc' as string]: m.accent }} data-testid={`module-${m.id}`}>
              <div className="row">
                <span className="mod-code">{m.code}</span>
                <span className="spacer" />
                <ProgressRing value={p.stepFrac} size={40} stroke={4} color={m.accent}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{Math.round(p.stepFrac * 100)}%</span>
                </ProgressRing>
              </div>
              <h3 style={{ margin: '10px 0 4px' }}>{m.title}</h3>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                {m.blurb}
              </p>
              <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
                {p.done}/{p.total} cleared · {p.available} playable
              </div>
            </a>
          );
        })}
      </div>

      <div className="grid-2" style={{ marginTop: 28 }}>
        <div className="card">
          <h3>Activity</h3>
          <Heatmap daily={s.daily} />
        </div>
        <div className="card">
          <h3>Badges</h3>
          {s.badges.length === 0 ? (
            <p className="dim">Clear your first unit to earn a badge.</p>
          ) : (
            <div className="row">
              {s.badges.map((b) => (
                <span key={b} className="chip accent">
                  <Icon name="star" size={12} /> {b.replace(/^.*:/, '').replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn sm" href={href('/gym')}>
              <Icon name="gym" size={14} /> Syntax Gym
            </a>
            <a className="btn sm" href={href('/lab')}>
              <Icon name="lab" size={14} /> Visualizer Lab
            </a>
            <a className="btn sm" href={href('/capstone')}>
              <Icon name="trophy" size={14} /> Capstone
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
