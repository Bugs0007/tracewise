import { useReducedMotion } from '@/lib/motion';

const STEPS = ['Predict', 'Watch', 'Type', 'Debug', 'Boss'];

/** The one reward moment: five ticks fill in order while the playhead dot travels to the end. */
export function CompletionTrace({ animate = true }: { animate?: boolean }) {
  const reduced = useReducedMotion();
  const instant = !animate || reduced;
  return (
    <div className={`completion${instant ? ' instant' : ''}`} role="img" aria-label="All five steps of this unit are complete">
      <div className="completion-track">
        <i className="playhead" />
        {STEPS.map((s, i) => (
          <i key={s} className="tick" style={{ ['--i' as string]: i } as React.CSSProperties} />
        ))}
      </div>
      <div className="completion-labels" aria-hidden>
        {STEPS.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  );
}
