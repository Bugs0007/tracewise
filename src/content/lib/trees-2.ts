// Shared helpers for the heap / Fenwick units: an array-backed binary heap drawn
// as a tree AND as an array, with stable element ids so swaps animate in both views.
import { binaryTreePanel, type BTNode } from '@/engine/layout';
import type { ArrayPanel, GraphPanel, Panel, Tone } from '@/engine/types';

/** One heap element. The id follows the element around, so a swap moves its node and its array cell. */
export interface HeapItem {
  id: string;
  val: number;
}

export function makeItems(vals: number[], prefix = 'e'): HeapItem[] {
  return vals.map((val, i) => ({ id: `${prefix}${i}`, val }));
}

/** Returns a human-readable complaint if `vals` is not a valid min-heap, else null. */
export function minHeapViolation(vals: number[]): string | null {
  for (let i = 1; i < vals.length; i++) {
    const p = (i - 1) >> 1;
    if (vals[i] < vals[p]) return `Not a min-heap: index ${i} (${vals[i]}) is smaller than its parent at index ${p} (${vals[p]})`;
  }
  return null;
}

export function assertMinHeap(vals: number[], what = 'Heap'): void {
  const bad = minHeapViolation(vals);
  if (bad) throw new Error(`${what}: ${bad}. Enter an array where every parent is <= its children.`);
}

export interface HeapDecor {
  /** array index -> tone */
  tones?: Record<number, Tone>;
  /** pointer name -> array index; drawn under the array cells and as tags above tree nodes */
  pointers?: Record<string, number>;
  /** child index -> tone of the edge from its parent */
  edgeTones?: Record<number, Tone>;
  /** array index -> small text under the node */
  badges?: Record<number, string>;
  treeTitle?: string;
  arrayTitle?: string;
}

function toTree(items: HeapItem[], i: number): BTNode | null {
  if (i >= items.length) return null;
  return { id: items[i].id, val: items[i].val, left: toTree(items, 2 * i + 1), right: toTree(items, 2 * i + 2) };
}

/** The heap as a binary tree (level order = array order). */
export function heapTree(items: HeapItem[], d: HeapDecor = {}): GraphPanel {
  const tones: Record<string, Tone> = {};
  const badges: Record<string, string> = {};
  const tags: Record<string, string[]> = {};
  const edgeTones: Record<string, Tone> = {};
  items.forEach((it, i) => {
    if (d.tones?.[i]) tones[it.id] = d.tones[i];
    if (d.badges?.[i]) badges[it.id] = d.badges[i];
    if (i > 0 && d.edgeTones?.[i]) edgeTones[`${items[(i - 1) >> 1].id}>${it.id}`] = d.edgeTones[i];
  });
  for (const [name, idx] of Object.entries(d.pointers ?? {})) {
    if (idx >= 0 && idx < items.length) (tags[items[idx].id] ??= []).push(name);
  }
  return binaryTreePanel(toTree(items, 0), { tones, badges, tags, edgeTones, title: d.treeTitle ?? 'Heap as a tree' });
}

/** The heap as its backing array, with pointers and animated moves. */
export function heapArray(items: HeapItem[], d: HeapDecor = {}): ArrayPanel {
  return {
    type: 'array',
    title: d.arrayTitle ?? 'Heap as an array',
    values: items.map((it) => it.val),
    ids: items.map((it) => it.id),
    tones: d.tones,
    pointers: d.pointers,
  };
}

/** Both views, tree first. An empty heap shows a note instead of an empty drawing. */
export function heapViews(items: HeapItem[], d: HeapDecor = {}): Panel[] {
  if (!items.length) return [{ type: 'note', text: 'The heap is empty.', tone: 'muted' }];
  return [heapTree(items, d), heapArray(items, d)];
}

/** Binary form of n, zero-padded to `width` bits (Fenwick tree walkthroughs). */
export function bits(n: number, width: number): string {
  return n.toString(2).padStart(width, '0');
}

/** Number of bits needed to write n. */
export function bitWidth(n: number): number {
  return Math.max(1, n.toString(2).length);
}
