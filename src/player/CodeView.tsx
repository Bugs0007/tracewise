import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/ui/Icon';
import { useCodeWrap } from '@/ui/codeWrap';
import { highlightLine } from './highlight';

/** The numbered lines. With wrapping on, a wrapped line continues indented under its own indentation. */
export function CodeLines({ code, language, line }: { code: string; language: string; line?: number }) {
  return (
    <>
      {code.split('\n').map((l, i) => (
        <div key={i} className={`ln${line === i + 1 ? ' cur' : ''}`} aria-current={line === i + 1 ? 'step' : undefined} style={{ ['--ind' as string]: l.length - l.trimStart().length } as CSSProperties}>
          <span className="no">{i + 1}</span>
          <span className="ln-t">{highlightLine(l, language)}</span>
        </div>
      ))}
    </>
  );
}

/** Keep the executing line in view inside a scrollable code box. */
function useFollowLine(line: number | undefined, active = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current?.querySelector<HTMLElement>('.ln.cur');
    const box = ref.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [line, active]);
  return ref;
}

export function WrapToggle({ className = 'code-tool' }: { className?: string }) {
  const [wrap, setWrap] = useCodeWrap();
  return (
    <button type="button" className={className} aria-label="Wrap long lines" aria-pressed={wrap} onClick={() => setWrap(!wrap)} title="Wrap long lines instead of scrolling sideways" data-testid="wrap-toggle">
      <Icon name="wrap" size={15} />
      <span>Wrap</span>
    </button>
  );
}

export interface CodeViewProps {
  code: string;
  language: string;
  line?: number;
  title?: string;
  /** controlled "expanded" state, so a parent can close the sheet (the player does this when a prediction needs answering) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** rendered at the bottom of the expanded sheet, for example step buttons and the caption */
  sheetFooter?: ReactNode;
}

/**
 * Read-only code panel. Long lines wrap (toggle in the header) so nothing scrolls sideways, and
 * "Expand" opens the same code in a full-size sheet with room to read it.
 */
export function CodeView({ code, language, line, title = 'Code', open = false, onOpenChange, sheetFooter }: CodeViewProps) {
  const [wrap] = useCodeWrap();
  const ref = useFollowLine(line, !open);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <div className="code-head">
        <div className="pnl-title">{title}</div>
        <span className="spacer" />
        {onOpenChange && <WrapToggle />}
        {onOpenChange && (
          <button type="button" ref={opener} className="code-tool" onClick={() => onOpenChange(true)} aria-label="Expand the code to full size" title="Expand" data-testid="code-expand">
            <Icon name="expand" size={15} />
            <span>Expand</span>
          </button>
        )}
      </div>
      <div className={`codeview${wrap ? ' wrap' : ''}`} ref={ref} tabIndex={0} role="region" aria-label={`${title}, current line ${line ?? 'none'}`}>
        <CodeLines code={code} language={language} line={line} />
      </div>
      {open && onOpenChange && (
        <CodeSheet
          title={title}
          code={code}
          language={language}
          line={line}
          footer={sheetFooter}
          onClose={() => {
            onOpenChange(false);
            // hand focus back to the button that opened the sheet
            setTimeout(() => opener.current?.focus(), 0);
          }}
        />
      )}
    </div>
  );
}

function CodeSheet({ title, code, language, line, footer, onClose }: { title: string; code: string; language: string; line?: number; footer?: ReactNode; onClose: () => void }) {
  const [wrap] = useCodeWrap();
  const ref = useFollowLine(line);
  const close = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return createPortal(
    <div className="code-sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="code-sheet pop" role="dialog" aria-modal="true" aria-label={`${title}, expanded`} data-testid="code-sheet">
        <header>
          <h2>{title}</h2>
          <span className="spacer" />
          <WrapToggle />
          <button type="button" ref={close} className="code-tool" onClick={onClose} aria-label="Close the expanded code" data-testid="code-collapse">
            <Icon name="collapse" size={15} />
            <span>Close</span>
          </button>
        </header>
        <div className={`codeview sheet${wrap ? ' wrap' : ''}`} ref={ref} tabIndex={0} role="region" aria-label={`${title}, current line ${line ?? 'none'}`}>
          <CodeLines code={code} language={language} line={line} />
        </div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
