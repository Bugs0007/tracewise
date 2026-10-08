// Shared helpers for the recursion / backtracking / greedy units.
//
// Call trees grow while a recursive algorithm runs. To keep nodes from jumping
// around, visualizers run the algorithm twice: a dry run that only builds the
// complete tree (so the layout is known), then a recording run (`replay()`)
// that hands out the same node ids in the same order and reveals nodes one by
// one. `callTreePanel` lays out the full tree but draws only the revealed part.
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { GraphPanel, ListPanel, Tone } from '@/engine/types';

export interface NodeView {
  tone?: Tone;
  badge?: string;
}

export class CallTree {
  nodes: Record<string, NTreeNode> = {};
  rootId = '';
  edgeLabels: Record<string, string> = {};
  private seq = 0;
  private frozen = false;

  /** Register a call (dry run) or fetch the id of the next call (replay). Ids are c0, c1, ... in call order. */
  add(label: string, parent?: string, edgeLabel?: string): string {
    const id = `c${this.seq++}`;
    if (this.frozen) return id;
    this.nodes[id] = { id, label, children: [] };
    if (parent === undefined) this.rootId = id;
    else {
      this.nodes[parent].children.push(id);
      if (edgeLabel) this.edgeLabels[`${parent}>${id}`] = edgeLabel;
    }
    return id;
  }

  /** Call after the dry run: further `add` calls only return ids. */
  replay(): void {
    this.frozen = true;
    this.seq = 0;
  }

  get size(): number {
    return Object.keys(this.nodes).length;
  }
}

/**
 * Draw the call tree. Only ids present in `view` are drawn (so the tree
 * expands as calls happen); positions come from the complete tree.
 */
export function callTreePanel(tree: CallTree, view: Record<string, NodeView>, opts: { title?: string; gapX?: number; gapY?: number; edgeTones?: Record<string, Tone> } = {}): GraphPanel {
  const full = nTreePanel(tree.nodes, tree.rootId, { title: opts.title, gapX: opts.gapX ?? 72, gapY: opts.gapY ?? 66, edgeLabels: tree.edgeLabels, edgeTones: opts.edgeTones });
  const shown = new Set(Object.keys(view));
  return {
    ...full,
    nodes: full.nodes.filter((n) => shown.has(n.id)).map((n) => ({ ...n, tone: view[n.id].tone, badge: view[n.id].badge })),
    edges: full.edges.filter((e) => shown.has(e.from) && shown.has(e.to)),
  };
}

/** Vertical stack, first item at the bottom. The top frame is `active`, frames below it are waiting. */
export function stackPanel(labels: string[], title = 'Call stack', topTone: Tone = 'active'): ListPanel {
  return {
    type: 'list',
    title,
    orientation: 'vertical',
    endLabel: 'top',
    emptyText: 'empty',
    items: labels.map((label, i) => ({ id: `${i}:${label}`, label, tone: i === labels.length - 1 ? topTone : 'frontier' })),
  };
}

/** `[1,2,3]` — compact path label */
export function pathLabel(path: (number | string)[]): string {
  return `[${path.join(',')}]`;
}

/** `[1, 2, 3]` — python-style list for captions */
export function pyList(path: unknown[]): string {
  return `[${path.map((p) => (Array.isArray(p) ? pyList(p) : String(p))).join(', ')}]`;
}
