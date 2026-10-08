import type { CompareMode } from '@/content/types';

function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
}

function deepEqual(a: unknown, b: unknown, float: boolean): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return float ? Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b;
  }
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i], float));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as any)[k], (b as any)[k], float));
}

function sortCanon(arr: unknown[]): unknown[] {
  return [...arr].sort((x, y) => (canon(x) < canon(y) ? -1 : canon(x) > canon(y) ? 1 : 0));
}

/** Normalise JS-only values (undefined, Infinity, Set, Map) into JSON-like values. */
export function toPlain(v: unknown, depth = 0): unknown {
  if (depth > 40) return '...';
  if (v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
  if (v instanceof Set) return sortCanon([...v].map((x) => toPlain(x, depth + 1)));
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), toPlain(x, depth + 1)]));
  if (Array.isArray(v)) return v.map((x) => toPlain(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x, depth + 1)]));
  return v;
}

export function matches(got: unknown, expected: unknown, mode: CompareMode = 'exact'): boolean {
  switch (mode) {
    case 'exact':
      return deepEqual(got, expected, false);
    case 'float':
      return deepEqual(got, expected, true);
    case 'unordered':
      if (!Array.isArray(got) || !Array.isArray(expected)) return deepEqual(got, expected, false);
      return deepEqual(sortCanon(got), sortCanon(expected), false);
    case 'nested': {
      if (!Array.isArray(got) || !Array.isArray(expected)) return deepEqual(got, expected, false);
      const norm = (a: unknown[]) => sortCanon(a.map((x) => (Array.isArray(x) ? sortCanon(x) : x)));
      return deepEqual(norm(got), norm(expected), false);
    }
  }
}

export function show(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 160 ? s.slice(0, 157) + '…' : s;
  } catch {
    return String(v);
  }
}
