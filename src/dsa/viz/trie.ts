// A tiny trie used by trace generators. Children keep insertion order, like the Python dicts they mirror.
export interface TNode {
  /** the prefix that leads here; also the id the trie panel uses */
  id: string;
  kids: Map<string, TNode>;
  end: boolean;
}

export const trieRoot = (): TNode => ({ id: '', kids: new Map(), end: false });

/** Insert a word; returns how many new nodes it created. */
export function trieInsert(root: TNode, word: string): number {
  let node = root;
  let made = 0;
  for (const ch of word) {
    let next = node.kids.get(ch);
    if (!next) {
      next = { id: node.id + ch, kids: new Map(), end: false };
      node.kids.set(ch, next);
      made++;
    }
    node = next;
  }
  node.end = true;
  return made;
}

/** Follow `text` from the root; null if the path breaks. */
export function trieWalk(root: TNode, text: string): TNode | null {
  let node: TNode | null = root;
  for (const ch of text) {
    node = node.kids.get(ch) ?? null;
    if (!node) return null;
  }
  return node;
}
