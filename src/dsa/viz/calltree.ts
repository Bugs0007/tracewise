// The call / decision tree drawn while a backtracking trace runs. Every recursive call adds a child; tones show
// which call is active, which finished, and which recorded an answer.
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { GraphPanel, Tone } from '@/engine/types';

export class CallTree {
  nodes: Record<string, NTreeNode> = {};
  edges: Record<string, string> = {};
  readonly root = 'c0';
  private n = 1;

  constructor(label: string) {
    this.nodes.c0 = { id: 'c0', label, children: [] };
  }

  add(parent: string, label: string, edge?: string): string {
    const id = `c${this.n++}`;
    this.nodes[id] = { id, label, children: [] };
    this.nodes[parent].children.push(id);
    if (edge !== undefined) this.edges[`${parent}>${id}`] = edge;
    return id;
  }

  tone(id: string, t?: Tone): void {
    this.nodes[id].tone = t;
  }

  badge(id: string, b?: string): void {
    this.nodes[id].badge = b;
  }

  panel(title: string): GraphPanel {
    return nTreePanel(this.nodes, this.root, { title, edgeLabels: this.edges });
  }
}
