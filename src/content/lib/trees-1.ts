// Shared helpers for the binary-tree / BST units (batch "trees-1").
import { binaryTreePanel, buildTree, treeToLevel, type BTNode } from '@/engine/layout';
import type { ArrayPanel, GraphPanel, ListPanel, Tone } from '@/engine/types';

/** LeetCode-style level-order array: numbers, null = missing child. */
export type Level = (number | null)[];

export const MAX_NODES = 15;

/** Parse and sanity-check a level-order array. Node ids are "t0", "t1", ... in construction order. */
export function parseTree(level: Level): BTNode | null {
  if (!Array.isArray(level)) throw new Error('The tree must be a list of numbers (use null for a missing child)');
  if (level.length && level[0] === null) throw new Error('The first value is the root and cannot be null');
  if (level.filter((v) => v !== null).length > MAX_NODES) throw new Error(`Use at most ${MAX_NODES} nodes`);
  return buildTree(level);
}

export function levelOf(root: BTNode | null): Level {
  return treeToLevel(root) as Level;
}

export function mkNode(val: number, id: string): BTNode {
  return { id, val, left: null, right: null };
}

/** All nodes in preorder. */
export function nodesOf(root: BTNode | null): BTNode[] {
  const out: BTNode[] = [];
  const walk = (n: BTNode | null) => {
    if (!n) return;
    out.push(n);
    walk(n.left);
    walk(n.right);
  };
  walk(root);
  return out;
}

export function subtreeIds(n: BTNode | null): Set<string> {
  return new Set(nodesOf(n).map((x) => x.id));
}

/** Throws a clear error when the tree is not a valid binary search tree. */
export function checkBst(root: BTNode | null, allowDuplicatesRight = false): void {
  const walk = (n: BTNode | null, lo: number | null, hi: number | null) => {
    if (!n) return;
    const v = n.val as number;
    if (lo !== null && (allowDuplicatesRight ? v < lo : v <= lo)) throw new Error(`Not a valid BST: ${v} is in the right subtree of ${lo}, so it must be bigger`);
    if (hi !== null && v >= hi) throw new Error(`Not a valid BST: ${v} is in the left subtree of ${hi}, so it must be smaller`);
    walk(n.left, lo, v);
    walk(n.right, v, hi);
  };
  walk(root, null, null);
}

export function edgeKey(parent: BTNode | string, child: BTNode | string): string {
  return `${typeof parent === 'string' ? parent : parent.id}>${typeof child === 'string' ? child : child.id}`;
}

/** Tone the edges along a root-to-node path (list of nodes, each the child of the previous). */
export function pathEdges(path: BTNode[], tone: Tone, into: Record<string, Tone> = {}): Record<string, Tone> {
  for (let i = 1; i < path.length; i++) into[edgeKey(path[i - 1], path[i])] = tone;
  return into;
}

export interface NodeDecor {
  tone?: Tone;
  badge?: string;
  tags?: string[];
}

/** Build the tree panel, asking `f` for the decoration of every node. */
export function treePanel(root: BTNode | null, f: (n: BTNode) => NodeDecor | undefined, edgeTones: Record<string, Tone> = {}, title = 'Tree'): GraphPanel {
  const tones: Record<string, Tone> = {};
  const badges: Record<string, string> = {};
  const tags: Record<string, string[]> = {};
  for (const n of nodesOf(root)) {
    const d = f(n);
    if (!d) continue;
    if (d.tone) tones[n.id] = d.tone;
    if (d.badge !== undefined) badges[n.id] = d.badge;
    if (d.tags?.length) tags[n.id] = d.tags;
  }
  return binaryTreePanel(root, { tones, badges, tags, edgeTones, title });
}

/** Vertical stack: the last item in `nodes` is drawn on top. */
export function stackPanel(nodes: BTNode[], title = 'Stack', topTone: Tone = 'active', baseTone: Tone = 'frontier'): ListPanel {
  return {
    type: 'list',
    title,
    orientation: 'vertical',
    endLabel: 'top',
    emptyText: 'empty',
    items: nodes.map((n, i) => ({ id: n.id, label: String(n.val), tone: i === nodes.length - 1 ? topTone : baseTone })),
  };
}

export function outputPanel(values: (number | string)[], title = 'Output', tones: Record<number, Tone> = {}): ArrayPanel {
  return { type: 'array', title, values, hideIndex: true, tones };
}

export const fmtList = (a: unknown[]): string => `[${a.join(', ')}]`;

export function parentMap(root: BTNode | null): Map<string, BTNode | null> {
  const m = new Map<string, BTNode | null>();
  const walk = (n: BTNode | null, p: BTNode | null) => {
    if (!n) return;
    m.set(n.id, p);
    walk(n.left, n);
    walk(n.right, n);
  };
  walk(root, null);
  return m;
}

/** Independent recursive traversals used as visualizer references. */
export const ref = {
  inorder(level: Level): number[] {
    const out: number[] = [];
    const walk = (n: BTNode | null) => {
      if (!n) return;
      walk(n.left);
      out.push(n.val as number);
      walk(n.right);
    };
    walk(buildTree(level));
    return out;
  },
  preorder(level: Level): number[] {
    const out: number[] = [];
    const walk = (n: BTNode | null) => {
      if (!n) return;
      out.push(n.val as number);
      walk(n.left);
      walk(n.right);
    };
    walk(buildTree(level));
    return out;
  },
  postorder(level: Level): number[] {
    const out: number[] = [];
    const walk = (n: BTNode | null) => {
      if (!n) return;
      walk(n.left);
      walk(n.right);
      out.push(n.val as number);
    };
    walk(buildTree(level));
    return out;
  },
  levels(level: Level): number[][] {
    const root = buildTree(level);
    const out: number[][] = [];
    const walk = (n: BTNode | null, d: number) => {
      if (!n) return;
      (out[d] ??= []).push(n.val as number);
      walk(n.left, d + 1);
      walk(n.right, d + 1);
    };
    walk(root, 0);
    return out;
  },
};
