// Shared helpers for the "Linked Lists" and "Stacks & Queues" units.
import { linkedListPanel, type LLNodeView } from '@/engine/layout';
import type { GraphPanel, Tone } from '@/engine/types';
import { LIST_HARNESS } from '@/content/lib/harness';

/**
 * LIST_HARNESS plus adapters for lists that need extra arguments, cycles, or a circular shape.
 *
 *   run_list_args(fn, vals, *rest)   fn(head, *rest) -> returned list as an array
 *   run_cycle_index(fn, vals, pos)   list whose tail points back to index pos (-1 = no cycle);
 *                                    fn(head) returns a node -> its index (or -1 for None)
 *   run_cycle_value(fn, vals, pos)   same list, but returns fn's raw value (e.g. a bool)
 *   run_circ(fn, vals, start, x)     circular list of vals, head = node `start`; fn(head, x) returns a
 *                                    node, and the circle is read once starting from it
 */
export const LISTS_HARNESS =
  LIST_HARNESS +
  `
def run_list_args(fn, vals, *rest):
    return _to_list(fn(_build(vals), *rest), 60)

def _build_cycle(vals, pos):
    nodes = [ListNode(v) for v in vals]
    for i in range(len(nodes) - 1):
        nodes[i].next = nodes[i + 1]
    if nodes and 0 <= pos < len(nodes):
        nodes[-1].next = nodes[pos]
    return nodes

def run_cycle_index(fn, vals, pos):
    nodes = _build_cycle(vals, pos)
    res = fn(nodes[0] if nodes else None)
    if res is None:
        return -1
    for i, n in enumerate(nodes):
        if n is res:
            return i
    return -2

def run_cycle_value(fn, vals, pos):
    nodes = _build_cycle(vals, pos)
    return fn(nodes[0] if nodes else None)

def run_circ(fn, vals, start, x):
    nodes = [ListNode(v) for v in vals]
    for i in range(len(nodes)):
        nodes[i].next = nodes[(i + 1) % len(nodes)]
    res = fn(nodes[start] if nodes else None, x)
    if res is None:
        return None
    out = [res.val]
    cur = res.next
    while cur is not res and len(out) < 60:
        out.append(cur.val)
        cur = cur.next
    return out
`;

export interface ChainOpts {
  title?: string;
  /** node ids in list order */
  ids: string[];
  labels: Record<string, string>;
  tones?: Record<string, Tone>;
  tags?: Record<string, string[]>;
  /** pointer names parked on the trailing None node */
  nullTags?: string[];
  edgeTones?: Record<string, Tone>;
  /** optional dummy node drawn before the first node */
  dummy?: { id: string; label?: string; tone?: Tone; tags?: string[] };
  /** tone of the trailing None node */
  nullTone?: Tone;
}

/** A plain chain a → b → c → None, with an explicit trailing None node so pointers can sit on it. */
export function chainPanel(o: ChainOpts): GraphPanel {
  const nullId = `${o.title ?? 'L'}-none`;
  const order: LLNodeView[] = [];
  const next: Record<string, string | null> = {};
  if (o.dummy) order.push({ id: o.dummy.id, label: o.dummy.label ?? 'D', tone: o.dummy.tone ?? 'muted', tags: o.dummy.tags });
  for (const id of o.ids) order.push({ id, label: o.labels[id], tone: o.tones?.[id], tags: o.tags?.[id] });
  order.push({ id: nullId, label: 'None', tone: o.nullTone ?? 'muted', tags: o.nullTags?.length ? o.nullTags : undefined });
  const seq = [...(o.dummy ? [o.dummy.id] : []), ...o.ids, nullId];
  for (let i = 0; i < seq.length - 1; i++) next[seq[i]] = seq[i + 1];
  return linkedListPanel(order, next, { title: o.title, edgeTones: o.edgeTones, showNull: false });
}

/** Add `tag` to the list of tags for `id` (creating the entry). */
export function addTag(tags: Record<string, string[]>, id: string | null | undefined, tag: string, fallback?: string): void {
  const key = id ?? fallback;
  if (!key) return;
  (tags[key] ??= []).push(tag);
}

/** Throws a friendly error unless every value is an integer. */
export function requireInts(values: number[], what: string): void {
  for (const v of values) if (!Number.isInteger(v)) throw new Error(`${what} must contain whole numbers`);
}

/** Throws unless the array is sorted ascending. */
export function requireSorted(values: number[], what: string): void {
  for (let i = 1; i < values.length; i++) if (values[i] < values[i - 1]) throw new Error(`${what} must be sorted in ascending order`);
}
