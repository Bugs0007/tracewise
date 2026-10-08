import { MODULES, topicsOf, type ModuleId } from '@/content/catalog';
import { AVAILABLE_UNITS } from '@/content/loader';
import { href } from '@/router';
import { useApp } from '@/store/store';
import { STEP_ORDER } from '@/store/save';
import { Icon } from '@/ui/Icon';
import { ProgressRing } from '@/ui/common';
import { moduleProgress } from './HomePage';
import './pages.css';

export default function MapPage({ module }: { module?: string }) {
  const units = useApp((s) => s.units);
  const mod = MODULES.find((m) => m.id === module) ?? MODULES[0];
  const topics = topicsOf(mod.id as ModuleId);
  const p = moduleProgress(units, mod.id);

  return (
    <div className="page">
      <div className="mod-tabs" role="tablist" aria-label="Modules">
        {MODULES.map((m) => (
          <a key={m.id} role="tab" aria-selected={m.id === mod.id} href={href(`/map/${m.id}`)} style={{ ['--mc' as string]: m.accent }}>
            <span className="mod-code">{m.code}</span>
            <span className="hide-sm">{m.title.split(' (')[0]}</span>
          </a>
        ))}
      </div>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">{mod.code} world map</div>
          <h1 style={{ margin: 0 }}>{mod.title}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {mod.blurb}
          </p>
        </div>
        <div className="row">
          <span className="chip good">{p.done} cleared</span>
          <span className="chip">{p.available} playable</span>
          <span className="chip">{p.total} total</span>
        </div>
      </div>

      <div className="world" style={{ ['--mc' as string]: mod.accent }}>
        {topics.map((t, ti) => (
          <section key={t.topic} className="island fade-up" style={{ animationDelay: `${ti * 40}ms` }}>
            <div className="island-head">
              <span className="island-no">{ti + 1}</span>
              <h3 style={{ margin: 0 }}>{t.topic}</h3>
            </div>
            <div className="path">
              {t.concepts.map((c) => {
                const u = units[c.id];
                const steps = u ? STEP_ORDER.filter((s) => u.steps[s]).length : 0;
                const avail = AVAILABLE_UNITS.has(c.id);
                const state = u?.completedAt ? 'done' : steps ? 'started' : avail ? 'open' : 'soon';
                return (
                  <a key={c.id} className={`node ${state}`} href={href(`/unit/${c.id}`)} aria-label={`${c.title}: ${state === 'soon' ? 'coming soon' : `${steps} of 5 steps`}`} data-testid={`node-${c.id}`}>
                    <ProgressRing value={steps / 5} size={54} stroke={4} color={state === 'done' ? 'var(--good)' : 'var(--mc)'}>
                      <span className="node-icon">{state === 'done' ? <Icon name="crown" size={20} /> : state === 'soon' ? <Icon name="lock" size={16} /> : <Icon name="play" size={14} />}</span>
                    </ProgressRing>
                    <span className="node-label">{c.title}</span>
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
