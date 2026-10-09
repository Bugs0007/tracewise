// Helpers for the HLD "scaling & resilience" units (load balancing, hashing, caching, gateways, breakers...).
import type { ChartPanel, Tone } from '@/engine/types';

/** 32-bit FNV-1a with a final fold, reduced to `mod`. Mirrors the Python `h()` shown in the hashing units. */
export function fnvHash(s: string, mod: number): number {
  let v = 2166136261;
  for (let i = 0; i < s.length; i++) v = Math.imul(v ^ s.charCodeAt(i), 16777619) >>> 0;
  v = ((v >>> 16) ^ v) >>> 0;
  return v % mod;
}

/** Point on a circle for a position on a ring of `size` slots (slot 0 at the top, clockwise). */
export function ringXY(pos: number, size: number, cx: number, cy: number, rad: number): { x: number; y: number } {
  const a = (pos / size) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round(cx + rad * Math.cos(a)), y: Math.round(cy + rad * Math.sin(a)) };
}

/** Colour a load/utilisation figure: over capacity is an error, getting hot is a warning. */
export function utilTone(u: number): Tone {
  if (u > 1) return 'error';
  if (u > 0.7) return 'compare';
  return 'done';
}

export function barChart(title: string, labels: string[], values: number[], opts: { xLabel?: string; yLabel?: string; tone?: Tone } = {}): ChartPanel {
  return {
    type: 'chart',
    title,
    kind: 'bar',
    xLabel: opts.xLabel,
    yLabel: opts.yLabel,
    series: [{ label: labels.join(' / '), points: values.map((v, i) => [i, v] as [number, number]), tone: opts.tone ?? 'active' }],
  };
}

/** Split "left:right" tokens (e.g. "alice:/orders"); throws a friendly error when the colon is missing. */
export function splitToken(tok: string, what: string): [string, string] {
  const i = tok.indexOf(':');
  if (i < 1 || i === tok.length - 1) throw new Error(`${what}: "${tok}" should look like left:right`);
  return [tok.slice(0, i).trim(), tok.slice(i + 1).trim()];
}
