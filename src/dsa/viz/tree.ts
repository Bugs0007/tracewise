// Binary-tree helpers for trace generators. Trees come in as LeetCode-style level-order lists (null = missing child).
import { buildTree, treeToLevel, type BTNode } from '@/engine/layout';
import type { GraphPanel, Tone } from '@/engine/types';
import { treeView } from './prims';

export type { BTNode };
export type Level = (number | null)[];

export const treeOf = (level: Level): BTNode | null => buildTree(level as (number | string | null)[]);
export const levelOf = (root: BTNode | null): Level => treeToLevel(root) as Level;

/** nodes in preorder */
export function preorder(root: BTNode | null): BTNode[] {
  return root ? [root, ...preorder(root.left), ...preorder(root.right)] : [];
}

export function inorder(root: BTNode | null): BTNode[] {
  return root ? [...inorder(root.left), root, ...inorder(root.right)] : [];
}

/** a panel showing the tree with optional per-node tones, badges (values returned so far) and tags (cursor names) */
export function treePanel(root: BTNode | null, o: { title?: string; tones?: Record<string, Tone>; badges?: Record<string, string>; tags?: Record<string, string[]> } = {}): GraphPanel {
  return treeView(root, { title: o.title, tones: o.tones, badges: o.badges, tags: o.tags });
}

/** readable check for an edited level list: a missing parent cannot have children */
export function levelProblem(level: Level): string | null {
  if (level.length && level[0] === null) return 'The first value is the root, so it cannot be null';
  let slots = level.length ? 1 : 0;
  let i = 1;
  while (i < level.length && slots > 0) {
    slots--;
    for (let c = 0; c < 2 && i < level.length; c++, i++) if (level[i] !== null) slots++;
  }
  return i < level.length ? 'A missing (null) node cannot have children: check the nulls' : null;
}
