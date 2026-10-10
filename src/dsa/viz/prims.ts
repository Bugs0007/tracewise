// Visualizer primitives for the DSA track.
//
// Each primitive is a pure builder that returns panels the shared engine already
// renders (array, grid, graph, list, kv, intervals), so the Player, the tone
// semantics and the theming are all shared. Trace generators compose these and
// never touch layout or colours themselves.
//
// Tone meanings (the four inks): active = being worked on now, compare = being
// compared / wrong, frontier = queued / pending, done/found = settled / correct.
import {
  binaryTreePanel,
  circleLayout,
  graphPanel,
  layeredLayout,
  linkedListPanel,
  nTreePanel,
  type BTNode,
  type EdgeSpec,
  type GraphDecor,
  type LLNodeView,
  type NTreeNode,
  type TreeDecor,
} from '@/engine/layout';
import type { ArrayPanel, BucketsPanel, GraphPanel, GridPanel, IntervalsPanel, KVPanel, ListItem, ListPanel, Scalar, Tone } from '@/engine/types';

export type { BTNode, EdgeSpec, LLNodeView, NTreeNode };

// ─── array / string ───────────────────────────────────────

export interface ArrayOpts {
  title?: string;
  tones?: Record<number, Tone>;
  /** pointer name -> index */
  pointers?: Record<string, number>;
  /** a bracket drawn around cells from..to (inclusive): a sliding window or search range */
  window?: { from: number; to: number; label?: string; tone?: Tone };
  indexLabels?: string[];
  hideIndex?: boolean;
  /** stable identities so moved cells animate */
  ids?: (string | number)[];
  bars?: boolean;
  /** wrap onto several rows (long strings); the window bracket is not drawn in this mode */
  wrap?: boolean;
}

/** An array of values with pointers and an optional window bracket. */
export function arrayView(values: readonly Scalar[], o: ArrayOpts = {}): ArrayPanel {
  return {
    type: 'array',
    title: o.title,
    values: [...values],
    tones: o.tones,
    pointers: o.pointers,
    range: o.window ? { from: o.window.from, to: o.window.to, label: o.window.label, tone: o.window.tone } : undefined,
    indexLabels: o.indexLabels,
    hideIndex: o.hideIndex,
    ids: o.ids,
    bars: o.bars,
    wrap: o.wrap,
  };
}

/** A string shown one character per cell. */
export function stringView(s: string, o: ArrayOpts = {}): ArrayPanel {
  return arrayView([...s], o);
}

/** An integer shown as bits, most significant first, with bit positions as the index row. */
export function bitsView(n: number, width = 8, o: Omit<ArrayOpts, 'indexLabels' | 'values'> = {}): ArrayPanel {
  const bits: number[] = [];
  for (let i = width - 1; i >= 0; i--) bits.push(Number((BigInt(n) >> BigInt(i)) & 1n));
  return arrayView(bits, { ...o, indexLabels: bits.map((_, k) => String(width - 1 - k)) });
}

// ─── hash map / set ───────────────────────────────────────

export interface MapOpts {
  title?: string;
  /** key (as text) -> tone */
  tones?: Record<string, Tone>;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

/** A hash map as key -> value rows, in insertion order. */
export function hashMapView(entries: Iterable<[unknown, unknown]> | Map<unknown, unknown> | Record<string, unknown>, o: MapOpts = {}): KVPanel {
  const list = entries instanceof Map ? [...entries] : Symbol.iterator in Object(entries) ? [...(entries as Iterable<[unknown, unknown]>)] : Object.entries(entries as Record<string, unknown>);
  return { type: 'kv', title: o.title, entries: list.map(([k, v]) => ({ k: text(k), v: text(v), tone: o.tones?.[text(k)] })) };
}

/** A hash set as a row of chips inside braces. */
export function hashSetView(items: Iterable<unknown>, o: MapOpts = {}): ListPanel {
  return {
    type: 'list',
    title: o.title,
    orientation: 'horizontal',
    emptyText: 'empty',
    items: [...items].map((v) => ({ id: `s:${text(v)}`, label: text(v), tone: o.tones?.[text(v)] })),
  };
}

/** Buckets indexed 0..n (bucket sort, hash chains). `tones[i]` colours the index cell; `itemTones[i][j]` an item. */
export function bucketsView(chains: readonly (readonly unknown[])[], o: { title?: string; tones?: Record<number, Tone>; itemTones?: Record<string, Tone> } = {}): BucketsPanel {
  return {
    type: 'buckets',
    title: o.title,
    tones: o.tones,
    buckets: chains.map((chain, i) => chain.map((v, j) => ({ id: `${i}:${j}:${text(v)}`, label: text(v), tone: o.itemTones?.[`${i}:${j}`] }))),
  };
}

// ─── stack / queue / deque ────────────────────────────────

export interface SeqOpts {
  title?: string;
  tones?: Record<number, Tone>;
  /** small text under each item */
  subs?: string[];
  emptyText?: string;
}

const seqItems = (items: readonly unknown[], o: SeqOpts, defaultTone?: Tone): ListItem[] => items.map((v, i) => ({ id: `${i}:${text(v)}`, label: text(v), tone: o.tones?.[i] ?? defaultTone, sub: o.subs?.[i] }));

/** A stack, bottom to top; the open end is labelled "top". */
export function stackView(items: readonly unknown[], o: SeqOpts = {}): ListPanel {
  return { type: 'list', title: o.title, orientation: 'vertical', endLabel: 'top', emptyText: o.emptyText ?? 'empty', items: seqItems(items, o) };
}

/** A plain row of chips with custom end labels: output being assembled, a result list, a path. */
export function chipsView(items: readonly unknown[], o: SeqOpts & { startLabel?: string; endLabel?: string } = {}): ListPanel {
  return { type: 'list', title: o.title, orientation: 'horizontal', startLabel: o.startLabel, endLabel: o.endLabel, emptyText: o.emptyText ?? 'empty', items: seqItems(items, o) };
}

/** A queue (or deque), front to back. */
export function queueView(items: readonly unknown[], o: SeqOpts = {}): ListPanel {
  return { type: 'list', title: o.title, orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: o.emptyText ?? 'empty', items: seqItems(items, o) };
}

// ─── linked list ──────────────────────────────────────────

/**
 * A singly (or doubly) linked list laid out in the given order. `next` holds every
 * pointer, so rewiring a link between frames changes an arrow; links that point
 * backwards curve over the row and are drawn in the error ink so cycles show.
 * Put cursor names in `tags` (prev, curr, next, slow, fast).
 */
export function linkedListView(order: LLNodeView[], next: Record<string, string | null>, o: { title?: string; prev?: Record<string, string | null>; edgeTones?: Record<string, Tone>; showNull?: boolean } = {}): GraphPanel {
  return linkedListPanel(order, next, o);
}

// ─── trees ────────────────────────────────────────────────

/** A binary tree. Decorate with tones / badges / tags keyed by node id. */
export function treeView(root: BTNode | null, decor: TreeDecor = {}): GraphPanel {
  return binaryTreePanel(root, decor);
}

/** A trie built from `words`. `walk` highlights the nodes along a prefix; words that end at a node get a check badge. */
export function trieView(words: readonly string[], o: { title?: string; walk?: string; walkTone?: Tone; failedAt?: number } = {}): GraphPanel {
  const nodes: Record<string, NTreeNode> = { '': { id: '', label: '·', children: [] } };
  for (const w of words) {
    for (let i = 1; i <= w.length; i++) {
      const id = w.slice(0, i);
      if (!nodes[id]) {
        nodes[id] = { id, label: w[i - 1], children: [] };
        nodes[w.slice(0, i - 1)].children.push(id);
      }
      if (i === w.length) nodes[id].badge = 'end';
    }
  }
  for (const n of Object.values(nodes)) n.children.sort();
  if (o.walk !== undefined) {
    for (let i = 0; i <= o.walk.length; i++) {
      const id = o.walk.slice(0, i);
      if (nodes[id]) nodes[id].tone = o.failedAt !== undefined && i >= o.failedAt ? 'compare' : (o.walkTone ?? 'active');
    }
  }
  return nTreePanel(nodes, '', { title: o.title ?? 'Trie' });
}

/** A call / decision tree for recursion and backtracking. */
export function recursionTree(nodes: Record<string, NTreeNode>, rootId: string, o: { title?: string; edgeLabels?: Record<string, string>; edgeTones?: Record<string, Tone> } = {}): GraphPanel {
  return nTreePanel(nodes, rootId, { title: o.title ?? 'Recursion tree', edgeLabels: o.edgeLabels, edgeTones: o.edgeTones });
}

// ─── heap ─────────────────────────────────────────────────

/** A binary heap shown twice, as the tree it represents and as the array that stores it. */
export function heapView(values: readonly number[], o: { title?: string; tones?: Record<number, Tone>; pointers?: Record<string, number>; max?: boolean } = {}): [GraphPanel, ArrayPanel] {
  const at = (i: number): BTNode | null => (i < values.length ? { id: `h${i}`, val: values[i], left: at(2 * i + 1), right: at(2 * i + 2) } : null);
  const tones: Record<string, Tone> = {};
  for (const [i, t] of Object.entries(o.tones ?? {})) tones[`h${i}`] = t;
  const tree = binaryTreePanel(at(0), { tones, title: o.title ?? (o.max ? 'Max-heap as a tree' : 'Min-heap as a tree') });
  return [tree, arrayView(values, { title: 'Stored as an array', tones: o.tones, pointers: o.pointers })];
}

// ─── graph ────────────────────────────────────────────────

export interface GraphViewOpts extends GraphDecor {
  directed?: boolean;
  /** custom node positions; defaults to a layered layout */
  pos?: Record<string, { x: number; y: number }>;
  layout?: 'layered' | 'circle';
  size?: { width: number; height: number };
}

/** A graph with visited / frontier tones on nodes and edges. */
export function graphView(ids: string[], edges: EdgeSpec[], o: GraphViewOpts = {}): GraphPanel {
  const size = o.size ?? { width: 460, height: 300 };
  const pos = o.pos ?? (o.layout === 'circle' ? circleLayout(ids, size.width, size.height) : layeredLayout(ids, edges, size.width, size.height));
  return graphPanel(ids, edges, pos, !!o.directed, o, size);
}

/** The BFS queue or DFS stack that goes with a graph traversal. */
export function frontierView(kind: 'queue' | 'stack', items: readonly unknown[], o: SeqOpts = {}): ListPanel {
  const title = o.title ?? (kind === 'queue' ? 'BFS queue' : 'DFS stack');
  return kind === 'queue' ? queueView(items, { ...o, title }) : stackView(items, { ...o, title });
}

// ─── grid / matrix / DP table ─────────────────────────────

export interface GridOpts {
  title?: string;
  /** "r,c" -> tone */
  tones?: Record<string, Tone>;
  rowLabels?: string[];
  colLabels?: string[];
  compact?: boolean;
  heat?: boolean;
}

/** A matrix, board or image. */
export function gridView(cells: readonly (readonly Scalar[])[], o: GridOpts = {}): GridPanel {
  return { type: 'grid', title: o.title, cells: cells.map((r) => [...r]), tones: o.tones, rowLabels: o.rowLabels, colLabels: o.colLabels, compact: o.compact, heat: o.heat };
}

export interface DpOpts extends GridOpts {
  /** the cell being filled */
  filling?: [number, number];
  /** cells it depends on; an arrow is drawn from each into `filling` */
  deps?: [number, number][];
}

/** A 2-D DP table: the cell being filled is active, its dependencies are compared and get arrows into it. */
export function dpTable2D(cells: readonly (readonly Scalar[])[], o: DpOpts = {}): GridPanel {
  const tones: Record<string, Tone> = { ...(o.tones ?? {}) };
  if (o.filling) tones[`${o.filling[0]},${o.filling[1]}`] = 'active';
  for (const [r, c] of o.deps ?? []) tones[`${r},${c}`] = 'compare';
  const panel = gridView(cells, { ...o, tones });
  if (o.filling && o.deps?.length) panel.arrows = o.deps.map((d) => ({ from: d, to: o.filling!, tone: 'compare' as Tone }));
  return panel;
}

/** A 1-D DP table laid out as a single row; dependencies on earlier indices get arrows. */
export function dpTable1D(values: readonly Scalar[], o: { title?: string; filling?: number; deps?: number[]; tones?: Record<number, Tone>; labels?: string[] } = {}): GridPanel {
  const tones: Record<string, Tone> = {};
  for (const [i, t] of Object.entries(o.tones ?? {})) tones[`0,${i}`] = t;
  return dpTable2D([values], {
    title: o.title,
    tones,
    colLabels: o.labels ?? values.map((_, i) => String(i)),
    filling: o.filling !== undefined ? [0, o.filling] : undefined,
    deps: (o.deps ?? []).map((d) => [0, d] as [number, number]),
  });
}

// ─── intervals ────────────────────────────────────────────

/** Intervals as bars on a number line, with optional vertical markers (a sweep position, a query). */
export function intervalsView(items: readonly { start: number; end: number; label?: string; tone?: Tone }[], o: { title?: string; min?: number; max?: number; marks?: IntervalsPanel['marks'] } = {}): IntervalsPanel {
  return { type: 'intervals', title: o.title, items: items.map((i) => ({ ...i })), min: o.min, max: o.max, marks: o.marks };
}
