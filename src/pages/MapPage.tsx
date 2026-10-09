import { MODULES, topicsOf, type ModuleId } from '@/content/catalog';
import { AVAILABLE_UNITS } from '@/content/loader';
import { href } from '@/router';
import { useApp } from '@/store/store';
import { STEP_ORDER } from '@/store/save';
import { moduleProgress } from './HomePage';
import './pages.css';

export default function MapPage({ module }: { module?: string }) {
  const units = useApp((s) => s.units);
  const mod = MODULES.find((m) => m.id === module) ?? MODULES[0];
  const topics = topicsOf(mod.id as ModuleId);
  const p = moduleProgress(units, mod.id);

  return (
    <div className="page">
      <nav className="mod-tabs" aria-label="Modules">
        {MODULES.map((m) => (
          <a key={m.id} href={href(`/map/${m.id}`)} aria-current={m.id === mod.id ? 'page' : undefined}>
            {m.title.split(' (')[0]}
          </a>
        ))}
      </nav>
      <div className="page-head">
        <div className="grow">
          <h1 style={{ margin: 0 }}>{mod.title}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {mod.blurb}
          </p>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          <b style={{ color: 'var(--ink)' }}>{p.done}</b> of {p.total} cleared
        </p>
      </div>

      <div className="index">
        {topics.map((t) => (
          <section key={t.topic} className="index-topic">
            <h2>{t.topic}</h2>
            <ul>
              {t.concepts.map((c) => {
                const u = units[c.id];
                const steps = u ? STEP_ORDER.filter((s) => u.steps[s]).length : 0;
                const avail = AVAILABLE_UNITS.has(c.id);
                const state = u?.completedAt ? 'done' : steps ? 'started' : avail ? 'open' : 'soon';
                return (
                  <li key={c.id}>
                    <a className={`unit-link ${state}`} href={href(`/unit/${c.id}`)} data-testid={`node-${c.id}`}>
                      <span className="steps" aria-hidden>
                        {STEP_ORDER.map((s) => (
                          <i key={s} className={u?.steps[s] ? 'on' : ''} />
                        ))}
                      </span>
                      <span className="unit-title">{c.title}</span>
                      <span className="unit-state">{state === 'done' ? 'Cleared' : state === 'started' ? `${steps} of 5` : state === 'soon' ? 'Soon' : ''}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
