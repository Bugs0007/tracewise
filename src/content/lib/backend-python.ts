// Shared helpers for the Python Essentials units (module M2 Backend).
import type { LogPanel, Tone } from '@/engine/types';

/** Python repr() of a JSON-like JS value (strings single-quoted, None/True/False, dict braces). */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    return `{${entries.map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(', ')}}`;
  }
  return String(v);
}

/** Python repr() of a tuple: (1, 2) and (4,) for one element. */
export function pyTuple(items: unknown[]): string {
  if (items.length === 1) return `(${pyRepr(items[0])},)`;
  return `(${items.map(pyRepr).join(', ')})`;
}

/** Keep captions within the 90 character budget. */
export function cap(s: string, max = 90): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/** A console-style log panel; the last line is highlighted when `hot` is set. */
export function logPanel(lines: string[], title = 'Output', hot = true): LogPanel {
  return { type: 'log', title, lines: lines.map((text, i) => ({ text, tone: (hot && i === lines.length - 1 ? 'new' : 'default') as Tone })) };
}
