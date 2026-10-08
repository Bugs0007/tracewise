// Layout helpers that turn data structures into positioned graph panels.
import type { GraphEdge, GraphNode, GraphPanel, Tone } from './types';

// ─── Binary trees ──────────────────────────────────────────────

export interface BTNode {
  id: string;
  val: number | string;
  left: BTNode | null;
  right: BTNode | null;
}

let uid = 0;
export function btNode(val: number | string, left: BTNode | null = null, right: BTNode | null = null): BTNode {
  return { id: `n${uid++}`, val, left, right };
}

/** Build a binary tree from a LeetCode-style level-order array (null = missing). Ids are "n0", "n1", ... by position. */
export function buildTree(level: (number | string | null)[]): BTNode | null {
  if (!level.length || level[0] === null || level[0] === undefined) return null;
  let k = 0;
  const mk = (v: number | string): BTNode => ({ id: `t${k++}`, val: v, left: null, right: null });
  const root = mk(level[0] as number);
  const q: BTNode[] = [root];
  let i = 1;
  while (q.length && i < level.length) {
    const cur = q.shift()!;
    const l = level[i++];
    if (l !== null && l !== undefined) q.push((cur.left = mk(l)));
    if (i >= level.length) break;
    const r = level[i++];
    if (r !== null && r !== undefined) q.push((cur.right = mk(r)));
  }
  return root;
}

export function treeToLevel(root: BTNode | null): (number | string | null)[] {
  const out: (number | string | null)[] = [];
  const q: (BTNode | null)[] = [root];
  while (q.length) {
    const n = q.shift()!;
    if (!n) {
      out.push(null);
      continue;
    }
    out.push(n.val);
    q.push(n.left, n.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export interface TreeDecor {
  tones?: Record<string, Tone>;
  badges?: Record<string, string>;
  tags?: Record<string, string[]>;
  edgeTones?: Record<string, Tone>; // key "parentId>childId"
  title?: string;
}

/** Inorder-x layout: every node gets its own column, depth gives the row. Never overlaps. */
export function binaryTreePanel(root: BTNode | null, decor: TreeDecor = {}): GraphPanel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let col = 0;
  let maxDepth = 0;
  const pos = new Map<string, { c: number; d: number }>();
  const walk = (n: BTNode | null, d: number) => {
    if (!n) return;
    walk(n.left, d + 1);
    pos.set(n.id, { c: col++, d });
    maxDepth = Math.max(maxDepth, d);
    walk(n.right, d + 1);
  };
  walk(root, 0);
  const gapX = 56;
  const gapY = 70;
  const width = Math.max(240, col * gapX + 40);
  const height = Math.max(140, (maxDepth + 1) * gapY + 30);
  const visit = (n: BTNode | null) => {
    if (!n) return;
    const p = pos.get(n.id)!;
    nodes.push({
      id: n.id,
      label: String(n.val),
      x: 20 + gapX / 2 + p.c * gapX,
      y: 36 + p.d * gapY,
      tone: decor.tones?.[n.id],
      badge: decor.badges?.[n.id],
      tags: decor.tags?.[n.id],
    });
    for (const ch of [n.left, n.right]) {
      if (ch) edges.push({ from: n.id, to: ch.id, tone: decor.edgeTones?.[`${n.id}>${ch.id}`] });
    }
    visit(n.left);
    visit(n.right);
  };
  visit(root);
  return { type: 'graph', title: decor.title, nodes, edges, width, height };
}

// ─── General (n-ary) trees: call trees, tries ───────────────────

export interface NTreeNode {
  id: string;
  label: string;
  children: string[];
  tone?: Tone;
  badge?: string;
  sub?: string;
}

/** Tidy layout: leaves are spread left to right, parents are centred over their children. */
export function nTreePanel(nodesById: Record<string, NTreeNode>, rootId: string, opts: { title?: string; gapX?: number; gapY?: number; edgeLabels?: Record<string, string>; edgeTones?: Record<string, Tone> } = {}): GraphPanel {
  const gapX = opts.gapX ?? 64;
  const gapY = opts.gapY ?? 66;
  let leaf = 0;
  let maxD = 0;
  const xs = new Map<string, number>();
  const ds = new Map<string, number>();
  const place = (id: string, d: number): number => {
    const n = nodesById[id];
    ds.set(id, d);
    maxD = Math.max(maxD, d);
    if (!n.children.length) {
      const x = leaf++;
      xs.set(id, x);
      return x;
    }
    const cx = n.children.map((c) => place(c, d + 1));
    const x = (cx[0] + cx[cx.length - 1]) / 2;
    xs.set(id, x);
    return x;
  };
  if (nodesById[rootId]) place(rootId, 0);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const [id, x] of xs) {
    const n = nodesById[id];
    nodes.push({ id, label: n.label, x: 30 + x * gapX, y: 30 + ds.get(id)! * gapY, tone: n.tone, badge: n.badge, sub: n.sub, shape: n.label.length > 3 ? 'pill' : 'circle', w: n.label.length > 3 ? Math.max(48, n.label.length * 8 + 16) : undefined });
    for (const c of n.children) edges.push({ from: id, to: c, label: opts.edgeLabels?.[`${id}>${c}`], tone: opts.edgeTones?.[`${id}>${c}`] });
  }
  return { type: 'graph', title: opts.title, nodes, edges, width: Math.max(200, leaf * gapX + 20), height: Math.max(120, (maxD + 1) * gapY + 20) };
}

// ─── Linked lists ──────────────────────────────────────────────

export interface LLNodeView {
  id: string;
  label: string;
  tone?: Tone;
  tags?: string[];
}

/**
 * Lay out linked-list nodes in a row (in the given order) and draw an arrow
 * for every pointer in `next` (and optional `prev`). Pointers that go
 * backwards curve above the row so cycles and rewiring are visible.
 */
export function linkedListPanel(order: LLNodeView[], next: Record<string, string | null>, opts: { prev?: Record<string, string | null>; title?: string; edgeTones?: Record<string, Tone>; showNull?: boolean } = {}): GraphPanel {
  const gap = 84;
  const y = 70;
  const idx = new Map(order.map((n, i) => [n.id, i]));
  const nodes: GraphNode[] = order.map((n, i) => ({ id: n.id, label: n.label, x: 44 + i * gap, y, tone: n.tone, tags: n.tags, shape: 'rect', w: 46, h: 34 }));
  const edges: GraphEdge[] = [];
  let needsNull = false;
  for (const n of order) {
    const to = next[n.id];
    if (to === undefined) continue;
    if (to === null) {
      needsNull = needsNull || idx.get(n.id) === order.length - 1;
      continue;
    }
    const a = idx.get(n.id)!;
    const b = idx.get(to);
    if (b === undefined) continue;
    const back = b <= a;
    edges.push({ from: n.id, to, directed: true, curve: back ? -40 - (a - b) * 6 : b - a > 1 ? -24 : 0, tone: opts.edgeTones?.[`${n.id}>${to}`] ?? (back ? 'error' : undefined) });
  }
  if (opts.prev) {
    for (const n of order) {
      const to = opts.prev[n.id];
      if (!to || !idx.has(to)) continue;
      edges.push({ from: n.id, to, directed: true, curve: 26, dashed: true, tone: opts.edgeTones?.[`${n.id}<${to}`] });
    }
  }
  if (opts.showNull !== false && order.length && needsNull) {
    nodes.push({ id: '__null', label: 'null', x: 44 + order.length * gap, y, shape: 'pill', w: 44, h: 26, tone: 'muted' });
    edges.push({ from: order[order.length - 1].id, to: '__null', directed: true });
  }
  return { type: 'graph', title: opts.title, nodes, edges, width: Math.max(260, 44 + (order.length + 1) * gap), height: 150 };
}

// ─── General graphs ────────────────────────────────────────────

export function circleLayout(ids: string[], width = 420, height = 300): Record<string, { x: number; y: number }> {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 36;
  const out: Record<string, { x: number; y: number }> = {};
  ids.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ids.length);
    out[id] = { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });
  return out;
}

export interface EdgeSpec {
  from: string;
  to: string;
  w?: number;
}

/** Deterministic layered layout (BFS levels from the first node); falls back gracefully for disconnected graphs. */
export function layeredLayout(ids: string[], edges: EdgeSpec[], width = 460, height = 300): Record<string, { x: number; y: number }> {
  const adj = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const level = new Map<string, number>();
  let base = 0;
  for (const start of ids) {
    if (level.has(start)) continue;
    level.set(start, base);
    const q = [start];
    while (q.length) {
      const u = q.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (!level.has(v)) {
          level.set(v, level.get(u)! + 1);
          q.push(v);
        }
      }
    }
    base = Math.max(...[...level.values()]) + 1;
  }
  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const l = level.get(id)!;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(id);
  }
  const L = Math.max(...byLevel.keys()) + 1;
  const out: Record<string, { x: number; y: number }> = {};
  for (const [l, row] of byLevel) {
    row.forEach((id, i) => {
      out[id] = {
        x: Math.round(40 + (L === 1 ? (width - 80) / 2 : (l * (width - 80)) / (L - 1))),
        y: Math.round(((i + 1) * height) / (row.length + 1)),
      };
    });
  }
  return out;
}

export interface GraphDecor {
  tones?: Record<string, Tone>;
  badges?: Record<string, string>;
  tags?: Record<string, string[]>;
  edgeTones?: Record<string, Tone>; // "a>b" (directed) or "a-b" (undirected; both orders checked)
  title?: string;
}

export function edgeKey(a: string, b: string, directed: boolean): string {
  return directed ? `${a}>${b}` : a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function graphPanel(ids: string[], edges: EdgeSpec[], pos: Record<string, { x: number; y: number }>, directed: boolean, decor: GraphDecor = {}, size = { width: 460, height: 300 }): GraphPanel {
  return {
    type: 'graph',
    title: decor.title,
    directed,
    width: size.width,
    height: size.height,
    nodes: ids.map((id) => ({ id, label: id, x: pos[id].x, y: pos[id].y, tone: decor.tones?.[id], badge: decor.badges?.[id], tags: decor.tags?.[id] })),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      directed,
      // bend antiparallel directed edges (A→B and B→A) so both stay visible
      curve: directed && edges.some((o) => o.from === e.to && o.to === e.from) ? 18 : undefined,
      label: e.w !== undefined ? String(e.w) : undefined,
      tone: decor.edgeTones?.[edgeKey(e.from, e.to, directed)],
    })),
  };
}
