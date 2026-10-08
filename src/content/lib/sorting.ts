// Shared helpers for the sorting visualizers (bar panels, call stacks, validation).
import type { ArrayPanel, ListPanel, Scalar, Tone } from '@/engine/types';

/** An array element that keeps its identity (original index) while it moves around. */
export interface Item {
  v: number;
  id: number;
}

/** Validate and copy the visualizer input. Throws a friendly error for unusable input. */
export function numbersInput(nums: unknown, opts: { nonNegative?: boolean; maxValue?: number; max?: number } = {}): number[] {
  if (!Array.isArray(nums)) throw new Error('Enter a list of numbers, e.g. 5, 2, 9, 1');
  const out = nums.map((x) => Number(x));
  if (out.some((x) => !Number.isFinite(x))) throw new Error('Every item must be a number');
  if (out.some((x) => !Number.isInteger(x))) throw new Error('Use whole numbers only');
  const cap = opts.max ?? 12;
  if (out.length > cap) throw new Error(`Use at most ${cap} numbers so the animation stays readable`);
  if (opts.nonNegative && out.some((x) => x < 0)) throw new Error('Counting sort needs non-negative whole numbers (0, 1, 2, ...)');
  if (opts.maxValue !== undefined && out.some((x) => x > opts.maxValue!)) throw new Error(`Counting sort keeps the counts array small: use values up to ${opts.maxValue}`);
  return out;
}

/** Plain ascending sort (never mutates). Used by every `reference`. */
export function sortedCopy(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b);
}

export const items = (nums: number[]): Item[] => nums.map((v, i) => ({ v, id: i }));

export interface BarOpts {
  title?: string;
  tones?: Record<number, Tone>;
  pointers?: Record<string, number>;
  hideIndex?: boolean;
  indexLabels?: string[];
}

/** A bar-chart array panel whose cells carry stable ids so moves animate. */
export function bars(cells: { v: number | null; id: string | number }[], o: BarOpts = {}): ArrayPanel {
  return {
    type: 'array',
    title: o.title,
    values: cells.map((c) => c.v as Scalar),
    ids: cells.map((c) => c.id),
    tones: o.tones,
    pointers: o.pointers,
    hideIndex: o.hideIndex,
    indexLabels: o.indexLabels,
    bars: true,
  };
}

/** Call stack / recursion panel (top of the stack on the right). */
export function stackPanel(frames: string[], title = 'Call stack', tone: Tone = 'frontier'): ListPanel {
  return {
    type: 'list',
    title,
    orientation: 'horizontal',
    items: frames.map((label, i) => ({ id: `s${i}`, label, tone: i === frames.length - 1 ? 'active' : tone })),
    startLabel: 'bottom',
    endLabel: 'top',
    emptyText: 'empty',
  };
}

export const show = (vals: (number | null)[]): string => `[${vals.map((v) => (v === null ? '_' : v)).join(', ')}]`;

export const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;
