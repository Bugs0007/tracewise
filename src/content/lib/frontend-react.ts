// Shared helpers for the frontend (DOM + React fundamentals) units:
// a tiny component/DOM tree model that turns into an nTreePanel.
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { GraphPanel, Tone } from '@/engine/types';

export interface CNode {
  id: string;
  name: string;
  children?: CNode[];
}

/** Preorder list of ids. */
export function ids(root: CNode): string[] {
  return [root.id, ...(root.children ?? []).flatMap(ids)];
}

/** Map id -> parent id (root maps to null). */
export function parentMap(root: CNode, parent: string | null = null, out: Record<string, string | null> = {}): Record<string, string | null> {
  out[root.id] = parent;
  for (const c of root.children ?? []) parentMap(c, root.id, out);
  return out;
}

export interface TreeDecor {
  tones?: Record<string, Tone>;
  badges?: Record<string, string>;
  subs?: Record<string, string>;
  edgeTones?: Record<string, Tone>;
  edgeLabels?: Record<string, string>;
  title?: string;
}

export function treePanel(root: CNode, d: TreeDecor = {}, opts: { gapX?: number; gapY?: number } = {}): GraphPanel {
  const byId: Record<string, NTreeNode> = {};
  const visit = (n: CNode) => {
    byId[n.id] = { id: n.id, label: n.name, children: (n.children ?? []).map((c) => c.id), tone: d.tones?.[n.id], badge: d.badges?.[n.id], sub: d.subs?.[n.id] };
    (n.children ?? []).forEach(visit);
  };
  visit(root);
  return nTreePanel(byId, root.id, { title: d.title, gapX: opts.gapX ?? 84, gapY: opts.gapY ?? 64, edgeLabels: d.edgeLabels, edgeTones: d.edgeTones });
}
