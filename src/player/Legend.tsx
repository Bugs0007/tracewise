// Ink key for the stage. The four inks mean the same thing in every visualizer.
const KEY: { cls: string; label: string; text: string }[] = [
  { cls: 'cobalt', label: 'Cobalt', text: 'the element being worked on now' },
  { cls: 'mustard', label: 'Mustard', text: 'queued, waiting its turn' },
  { cls: 'tomato', label: 'Tomato', text: 'being compared, or wrong' },
  { cls: 'mint', label: 'Mint', text: 'done, found, correct' },
];

export function Legend() {
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
      </ul>
    </details>
  );
}
