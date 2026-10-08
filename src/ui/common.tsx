import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { highlightLine } from '@/player/highlight';

export function ProgressRing({ value, size = 44, stroke = 4, children, color = 'var(--accent)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: 'stroke-dashoffset 700ms var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false, icon = 'book' }: { title: string; children: ReactNode; defaultOpen?: boolean; icon?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card flat" style={{ padding: 0 }}>
      <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', height: 46, borderRadius: 12 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name={icon} size={16} />
        {title}
        <span className="spacer" />
        <span style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 200ms', display: 'inline-flex' }}>
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      {open && (
        <div className="fade-up" style={{ padding: '0 18px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function CodeBlock({ code, lang = 'python' }: { code: string; lang?: string }) {
  return (
    <pre className="codeview" style={{ margin: '8px 0', padding: '10px 0', maxHeight: 360 }}>
      {code.split('\n').map((l, i) => (
        <div key={i} className="ln">
          <span className="no">{i + 1}</span>
          <span>{highlightLine(l, lang)}</span>
        </div>
      ))}
    </pre>
  );
}

/** Renders a tiny subset of markdown: `code`, **bold**. Content stays data-only (no HTML injection). */
export function Md({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pop" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <span className="spacer" />
          <button className="btn icon ghost sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useInterval(cb: () => void, ms: number | null) {
  const saved = useRef(cb);
  saved.current = cb;
  useEffect(() => {
    if (ms === null) return;
    const t = setInterval(() => saved.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
