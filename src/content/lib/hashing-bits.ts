// Shared helpers for the hashing, bit-manipulation and Big-O units.
import type { GridPanel, Tone } from '@/engine/types';

/** Keep captions within the 90 character budget. */
export function cap(s: string, max = 90): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** The deliberately simple hash used across the hashing units: sum of character codes. */
export function charSum(key: string): number {
  let s = 0;
  for (const c of key) s += c.charCodeAt(0);
  return s;
}

/** "cat" -> "99+97+116 = 312" (long keys are abbreviated so captions stay short). */
export function charSumText(key: string): string {
  const codes = [...key].map((c) => c.charCodeAt(0));
  const parts = codes.length > 5 ? [...codes.slice(0, 4).map(String), '…'] : codes.map(String);
  return `${parts.join('+')} = ${codes.reduce((a, b) => a + b, 0)}`;
}

/** Binary digits of n, most significant bit first, zero padded to `width`. */
export function bitsOf(n: number, width: number): number[] {
  const out: number[] = [];
  for (let i = width - 1; i >= 0; i--) out.push(Math.floor(n / 2 ** i) % 2);
  return out;
}

export function binStr(n: number, width: number): string {
  return bitsOf(n, width).join('');
}

/** Smallest width (>= minWidth) that can show every value. */
export function widthFor(values: number[], minWidth = 4): number {
  const max = Math.max(0, ...values);
  return Math.max(minWidth, max.toString(2).length);
}

export interface BitRow {
  label: string;
  value: number;
  tone?: Tone;
  /** per-bit tones, index 0 = most significant bit */
  bitTones?: Record<number, Tone>;
}

/** A compact grid with one row per number and one column per bit (MSB first). */
export function bitGrid(rows: BitRow[], width: number, title?: string): GridPanel {
  const tones: Record<string, Tone> = {};
  rows.forEach((row, r) => {
    for (let c = 0; c < width; c++) {
      const t = row.bitTones?.[c] ?? row.tone;
      if (t) tones[`${r},${c}`] = t;
    }
  });
  return {
    type: 'grid',
    title,
    compact: true,
    cells: rows.map((row) => bitsOf(row.value, width)),
    rowLabels: rows.map((row) => row.label),
    colLabels: Array.from({ length: width }, (_, i) => String(width - 1 - i)),
    tones,
  };
}

/**
 * Python harness for the Big-O unit. It builds large inputs INSIDE the test so a
 * quadratic solution cannot finish: every element is an int subclass whose Python-level
 * __eq__ counts comparisons and raises once the budget is spent. Hash lookups
 * (set / dict) almost never call __eq__, so linear solutions use a handful of comparisons.
 *
 * Adapters:
 *   run_dup(fn, nums, big=0, dup_at=-1)   fn(nums) -> value; if big > 0 nums is built as 0..big-1
 *                                          (with the last element replaced by a copy of dup_at when dup_at >= 0)
 *   run_pair(fn, a, b, big=0)             fn(a, b) -> value; if big > 0, a = the first `big` even numbers and
 *                                          b = the first `big` multiples of 3; returns len(result) for the big case
 */
export const BIG_HARNESS = `
_budget = [0]

class _Tracked(int):
    __hash__ = int.__hash__

    def __eq__(self, other):
        _budget[0] -= 1
        if _budget[0] < 0:
            raise RuntimeError("Too slow: the input has many elements and this code compares them pair by pair (O(n^2)). Use a set or dict for O(1) lookups.")
        return int.__eq__(self, other)

def run_dup(fn, nums, big=0, dup_at=-1):
    if big:
        _budget[0] = 5 * big
        nums = [_Tracked(i) for i in range(big)]
        if dup_at >= 0:
            nums[-1] = _Tracked(dup_at)
    return fn(nums)

def run_pair(fn, a, b, big=0):
    if big:
        _budget[0] = 8 * big
        a = [_Tracked(2 * i) for i in range(big)]
        b = [_Tracked(3 * i) for i in range(big)]
        return len(fn(a, b))
    return fn(a, b)
`;
