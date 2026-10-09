// Shared helpers for the HLD building-block units (replication, sharding, CAP, queues, resilience...).
import type { GraphEdge, GraphNode, GraphPanel, KVPanel, LogPanel, NotePanel, Scalar, Tone } from '@/engine/types';

/** Round to at most 2 decimals so floats stay readable in captions. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function kvPanel(title: string, entries: Record<string, Scalar>, tones: Record<string, Tone> = {}): KVPanel {
  return { type: 'kv', title, entries: Object.entries(entries).map(([k, v]) => ({ k, v, tone: tones[k] })) };
}

export function logPanel(title: string, lines: { text: string; tone?: Tone }[], keep = 8): LogPanel {
  return { type: 'log', title, lines: lines.slice(-keep) };
}

export function notePanel(text: string, tone?: Tone): NotePanel {
  return { type: 'note', text, tone };
}

/** Small deterministic PRNG (mulberry32). Same seed -> same sequence in every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1234567 -> "1.23M", 2500 -> "2.5K", 12 -> "12". */
export function fmtBig(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${trim(n / 1e12)}T`;
  if (a >= 1e9) return `${trim(n / 1e9)}B`;
  if (a >= 1e6) return `${trim(n / 1e6)}M`;
  if (a >= 1e3) return `${trim(n / 1e3)}K`;
  return String(trim(n));
}

function trim(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface NodeOpts {
  tone?: Tone;
  shape?: GraphNode['shape'];
  badge?: string;
  tags?: string[];
  sub?: string;
  w?: number;
  h?: number;
}

export function gnode(id: string, label: string, x: number, y: number, o: NodeOpts = {}): GraphNode {
  return { id, label, x, y, tone: o.tone, shape: o.shape ?? 'rect', badge: o.badge, tags: o.tags, sub: o.sub, w: o.w, h: o.h };
}

export interface EdgeOpts {
  label?: string;
  tone?: Tone;
  dashed?: boolean;
  curve?: number;
  flow?: boolean;
  directed?: boolean;
}

export function gedge(from: string, to: string, o: EdgeOpts = {}): GraphEdge {
  return { from, to, label: o.label, tone: o.tone, dashed: o.dashed, curve: o.curve, flow: o.flow, directed: o.directed ?? true };
}

export function graph(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number, title?: string): GraphPanel {
  return { type: 'graph', title, nodes, edges, directed: true, width, height };
}

/** Integer hash used by the sharding lessons (multiplicative, 32-bit). Mirrors the Python in the unit. */
export function hashKey(key: number): number {
  return (key * 2654435761) % 4294967296;
}

/** Validate an integer input, throwing a friendly error when it is out of range. */
export function needInt(name: string, v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.round(n) !== n) throw new Error(`${name} must be a whole number`);
  if (n < lo || n > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  return n;
}

/** Validate a number input (not necessarily an integer). */
export function needNum(name: string, v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < lo || n > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  return n;
}

export function needOneOf<T extends string>(name: string, v: unknown, options: readonly T[]): T {
  if (!options.includes(v as T)) throw new Error(`${name} must be one of: ${options.join(', ')}`);
  return v as T;
}
