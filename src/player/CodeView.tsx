import { useEffect, useRef } from 'react';
import { highlightLine } from './highlight';

export function CodeView({ code, language, line, title = 'Code' }: { code: string; language: string; line?: number; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.ln.cur');
    const box = ref.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [line]);
  const lines = code.split('\n');
  return (
    <div>
      <div className="pnl-title">{title}</div>
      <div className="codeview" ref={ref} tabIndex={0} role="region" aria-label={`${title}, current line ${line ?? 'none'}`}>
        {lines.map((l, i) => (
          <div key={i} className={`ln${line === i + 1 ? ' cur' : ''}`} aria-current={line === i + 1 ? 'step' : undefined}>
            <span className="no">{i + 1}</span>
            <span>{highlightLine(l, language)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
