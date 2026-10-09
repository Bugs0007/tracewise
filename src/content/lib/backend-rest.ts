// Shared helpers for the REST / rate-limiting / async-work backend units.
import type { KVPanel, LogPanel, Scalar, Tone } from '@/engine/types';

/** Tone for an HTTP status code: 2xx found, 3xx compare, 4xx error, 5xx error. */
export function statusTone(code: number): Tone {
  if (code >= 200 && code < 300) return 'found';
  if (code >= 300 && code < 400) return 'compare';
  return 'error';
}

/** Round to at most 2 decimals so floats stay readable in captions. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function logPanel(title: string, lines: { text: string; tone?: Tone }[]): LogPanel {
  return { type: 'log', title, lines: lines.slice(-8) };
}

export function kvPanel(title: string, entries: Record<string, Scalar>, tones: Record<string, Tone> = {}): KVPanel {
  return { type: 'kv', title, entries: Object.entries(entries).map(([k, v]) => ({ k, v, tone: tones[k] })) };
}

/** Parse "a=1&b=2" into an ordered list of [key, value] pairs (no URL decoding needed for the lessons). */
export function parseQuery(qs: string): [string, string][] {
  return qs
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=');
      return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
    });
}

/** Sum helper that tolerates empty arrays. */
export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
