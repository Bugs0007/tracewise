// Shared helpers for the M4 "LLD problems" and "HLD building blocks" units (batch lld-hld-1).
import type { ListItem, ListPanel, Tone } from '@/engine/types';

/** Replay-style test helper: ops('Cls', 'put', 'get') */
export const ops = (...names: string[]): string[] => names;

export const RING_SIZE = 360;

/** Deterministic polynomial string hash (mirrored in HASH_HARNESS below). */
export function strHash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

/** Position of a string on a 0..359 ring. 97 is coprime with 360, so similar names spread out. */
export function ringHash(s: string): number {
  return (strHash(s) * 97) % RING_SIZE;
}

/** Python twin of strHash / ringHash for tasks (hidden helper code). */
export const HASH_HARNESS = `
RING_SIZE = 360

def str_hash(s):
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) % 1000003
    return h

def ring_hash(s):
    return (str_hash(s) * 97) % RING_SIZE
`;

/** A horizontal list panel used for cache contents (oldest/next victim on the left). */
export function cacheRow(title: string, items: (string | ListItem)[], tones: Record<string, Tone> = {}, endLabel?: string): ListPanel {
  return {
    type: 'list',
    title,
    orientation: 'horizontal',
    endLabel,
    emptyText: '(empty)',
    items: items.map((it) => (typeof it === 'string' ? { id: it, label: it, tone: tones[it] } : it)),
  };
}

export type EvictPolicy = 'LRU' | 'LFU' | 'FIFO';

/**
 * Timestamp-based eviction simulator (independent of the list-based walk in the visualizer).
 * LFU breaks ties by least recently used; frequency restarts at 1 when a key is re-inserted.
 * Returns one boolean per access: true = hit.
 */
export function simulateEviction(seq: string[], cap: number, policy: EvictPolicy): boolean[] {
  const meta = new Map<string, { born: number; used: number; count: number }>();
  const hits: boolean[] = [];
  seq.forEach((k, t) => {
    const m = meta.get(k);
    if (m) {
      hits.push(true);
      m.used = t;
      m.count += 1;
      return;
    }
    hits.push(false);
    if (meta.size >= cap) {
      let victim = '';
      let best: number[] | null = null;
      for (const [key, v] of meta) {
        const score = policy === 'FIFO' ? [v.born] : policy === 'LRU' ? [v.used] : [v.count, v.used];
        if (best === null || score[0] < best[0] || (score[0] === best[0] && (score[1] ?? 0) < (best[1] ?? 0))) {
          best = score;
          victim = key;
        }
      }
      meta.delete(victim);
    }
    meta.set(k, { born: t, used: t, count: 1 });
  });
  return hits;
}
