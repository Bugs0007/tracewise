import { useMemo } from 'react';
import { useApp } from '@/store/store';
import { useReducedMotion } from '@/lib/motion';

const COLORS = ['var(--t-active)', 'var(--t-compare)', 'var(--t-swap)', 'var(--t-done)', 'var(--t-frontier)', 'var(--t-path)'];

function Burst({ seed }: { seed: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2 + (seed % 7) * 0.1;
        const d = 140 + ((i * 37 + seed) % 120);
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 40, r: (i * 47) % 360, c: COLORS[i % COLORS.length] };
      }),
    [seed],
  );
  return (
    <div className="burst" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ background: b.c, ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--r' as string]: `${b.r}deg` } as React.CSSProperties} />
      ))}
    </div>
  );
}

export function Celebrations() {
  const items = useApp((s) => s.celebrations);
  const reduced = useReducedMotion();
  const big = items.filter((c) => c.kind === 'level' || c.kind === 'unit' || c.kind === 'badge').at(-1);
  return (
    <>
      {big && !reduced && <Burst key={big.id} seed={big.id} />}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((c) => (
          <div key={c.id} className={`toast ${c.kind}`}>
            {c.text}
          </div>
        ))}
      </div>
    </>
  );
}
