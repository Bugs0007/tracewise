// Ink key for the stage. The four inks mean the same thing in every visualizer.
const KEY: { cls: string; label: string; text: string }[] = [
  { cls: 'cobalt', label: 'Cobalt', text: 'the element being worked on now' },
  { cls: 'mustard', label: 'Mustard', text: 'queued, waiting its turn' },
  { cls: 'tomato', label: 'Tomato', text: 'being compared, or wrong' },
  { cls: 'mint', label: 'Mint', text: 'done, found, correct' },
];

// Shown only for visualizers that draw a decision (a test, then a keep/discard choice).
// Three different looks on purpose: the thing used as a yardstick is never the thing chosen.
const ROLES: { cls: string; label: string; text: string }[] = [
  { cls: 'ruler', label: 'Dashed outline', text: 'the ruler: a reference used only to run a test, not a choice' },
  { cls: 'keep', label: 'Solid fill', text: 'keep: still in the search space' },
  { cls: 'discard', label: 'Faded, struck through', text: 'discard: ruled out by this decision' },
];

export function Legend({ roles }: { roles?: boolean }) {
  return (
    <details className="legend">
      <summary>Colour key</summary>
      <ul>
        {KEY.map((k) => (
          <li key={k.cls}>
            <i className={`sw ${k.cls}`} aria-hidden />
            <b>{k.label}</b> {k.text}
          </li>
        ))}
        <li>
          <i className="sw idle" aria-hidden />
          <b>Outline</b> not touched yet
        </li>
        {roles &&
          ROLES.map((k) => (
            <li key={k.cls}>
              <i className={`sw ${k.cls}`} aria-hidden />
              <b>{k.label}</b> {k.text}
            </li>
          ))}
      </ul>
    </details>
  );
}
