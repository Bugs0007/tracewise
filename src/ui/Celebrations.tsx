import { useApp } from '@/store/store';

export function Celebrations() {
  const items = useApp((s) => s.celebrations);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((c) => (
        <div key={c.id} className={`toast ${c.kind}`}>
          {c.text}
        </div>
      ))}
    </div>
  );
}
