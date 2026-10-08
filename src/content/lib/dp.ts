// Shared helpers for the dynamic-programming units (tables as grid panels).
import type { GridPanel, Scalar, Tone } from '@/engine/types';

/** A table cell as the algorithm sees it: a number (Infinity allowed), text, or null for "not computed yet". */
export type DpCell = number | string | null;

export type Arrow = NonNullable<GridPanel['arrows']>[number];

/** Key into GridPanel.tones. */
export const tk = (r: number, c: number): string => `${r},${c}`;

/** Convert a table value to what the grid draws: null stays empty, Infinity becomes the infinity sign. */
export function cellText(v: DpCell | undefined): Scalar {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : v > 0 ? '∞' : '-∞';
  return v;
}

export interface DpGridOpts {
  title?: string;
  tones?: Record<string, Tone>;
  arrows?: Arrow[];
  rowLabels?: string[];
  colLabels?: string[];
}

/** Build a grid panel for a DP table. Pass `null` for cells that are not filled yet. */
export function dpGrid(cells: DpCell[][], opts: DpGridOpts = {}): GridPanel {
  return {
    type: 'grid',
    title: opts.title,
    cells: cells.map((row) => row.map(cellText)),
    tones: opts.tones,
    arrows: opts.arrows,
    rowLabels: opts.rowLabels,
    colLabels: opts.colLabels,
  };
}

/** A 1-D DP array drawn as a one-row grid with index labels. */
export function dpRow(values: DpCell[], opts: DpGridOpts = {}): GridPanel {
  const tones: Record<string, Tone> = {};
  for (const [k, t] of Object.entries(opts.tones ?? {})) tones[k.includes(',') ? k : tk(0, Number(k))] = t;
  return dpGrid([values], { ...opts, tones, colLabels: opts.colLabels ?? values.map((_, i) => String(i)) });
}

/** Arrows from every dependency cell to the cell being computed. */
export function arrowsTo(to: [number, number], deps: [number, number][], tone?: Tone): Arrow[] {
  return deps.map((from) => ({ from, to, tone }));
}

// ─── Input validation helpers (throw readable errors for the input box) ───

export function assertInt(label: string, v: unknown, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new Error(`${label} must be a whole number from ${lo} to ${hi}`);
  return v;
}

export function assertString(label: string, v: unknown, maxLen: number): string {
  if (typeof v !== 'string') throw new Error(`${label} must be text`);
  if (v.length > maxLen) throw new Error(`${label} can have at most ${maxLen} characters`);
  return v;
}

export function assertIntList(label: string, v: unknown, opts: { max: number; lo: number; hi: number }): number[] {
  if (!Array.isArray(v)) throw new Error(`${label} must be a list of numbers`);
  if (v.length > opts.max) throw new Error(`${label}: use at most ${opts.max} values`);
  for (const x of v) assertInt(`Each value in ${label}`, x, opts.lo, opts.hi);
  return v as number[];
}
