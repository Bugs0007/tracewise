import type { Tone } from '@/engine/types';
import { chipsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './lru-cache.py?raw';
import harness from './lru-cache.harness.py?raw';
import cases from './lru-cache.cases.json';

const parse = (line: string): { op: string; a: number[] } => {
  const [op, ...a] = line.trim().split(/\s+/);
  return { op, a: a.map(Number) };
};

const viz = vizOf<{ cap: number; ops: string[] }>({
  id: 'lru-cache',
  title: 'LRU Cache',
  solution,
  inputs: [
    { key: 'cap', label: 'capacity', kind: 'number', default: 2 },
    { key: 'ops', label: 'operations: put key value / get key', kind: 'strings', default: ['put 1 10', 'put 2 20', 'get 1', 'put 3 30', 'get 2', 'get 3'], maxItems: 12 },
  ],
  presets: [
    { label: 'Evicts the oldest', input: { cap: 2, ops: ['put 1 10', 'put 2 20', 'get 1', 'put 3 30', 'get 2', 'get 3'] } },
    { label: 'Update refreshes', input: { cap: 2, ops: ['put 1 1', 'put 2 2', 'put 1 5', 'put 3 3', 'get 2', 'get 1'] } },
    { label: 'Capacity one', input: { cap: 1, ops: ['put 1 1', 'put 2 2', 'get 1', 'get 2'] } },
  ],
  validate: ({ cap, ops }) => {
    if (!Number.isInteger(cap) || cap < 1 || cap > 4) return 'Capacity must be a whole number from 1 to 4';
    for (const line of ops) {
      const { op, a } = parse(line);
      if (op === 'put' ? a.length !== 2 || a.some((x) => !Number.isFinite(x)) : op === 'get' ? a.length !== 1 || !Number.isFinite(a[0]) : true) return 'Use "put key value" or "get key" (numbers only)';
    }
    return null;
  },
  run({ cap, ops }) {
    const r = new TraceRecorder(solution);
    const order: number[] = []; // keys, most recently used first
    const data = new Map<number, number>();
    const out: (number | null)[] = [null];
    let askedRefresh = false;
    let askedEvict = false;
    const view = (hot: Record<number, Tone> = {}) => [
      chipsView(order.map((k) => `${k}: ${data.get(k)}`), { title: `recency order (capacity ${cap})`, startLabel: 'most recent', endLabel: 'least recent', tones: Object.fromEntries(order.map((k, i) => [i, hot[k] ?? 'default'])) as Record<number, Tone>, emptyText: 'empty' }),
      hashMapView([...data].map(([k, v]) => [k, v] as [number, number]), { title: 'map: key → node' }),
      chipsView(out.map((o) => (o === null ? 'None' : o)), { title: 'results of each call', tones: Object.fromEntries(out.map((o, i) => [i, o === null ? 'default' : 'found'])) as Record<number, Tone>, emptyText: 'none' }),
    ];
    r.step('init', `capacity = ${cap}. A doubly linked list keeps keys in recency order (head side = most recent); a map finds any node in O(1).`, view(), { cap });
    r.step('sentinels', 'Two sentinel nodes (head and tail) mean inserting and removing never has to special-case the ends.', view(), {});
    for (const line of ops) {
      const { op, a } = parse(line);
      r.op();
      if (op === 'get') {
        const key = a[0];
        if (!data.has(key)) {
          out.push(-1);
          r.step('getMiss', `get(${key}): the key is not in the map. Return −1. The recency order does not change.`, view(), { key });
          continue;
        }
        r.step('getNode', `get(${key}): found in the map: value ${data.get(key)}.`, view({ [key]: 'active' }), { key });
        if (!askedRefresh) {
          askedRefresh = true;
          r.predict('refresh', `After get(${key}), where does ${key} sit in the recency order?`, ['Moved to the most recent end', 'Stays where it is', 'Moved to the least recent end'], 0, 'Reading a key counts as using it, so it becomes the most recently used.');
        }
        order.splice(order.indexOf(key), 1);
        r.step('getRemove', `Unlink ${key}'s node from where it is (_remove).`, view(), { key });
        order.unshift(key);
        r.step('getFront', `Insert it right after the head: it is now the most recently used (_add_front).`, view({ [key]: 'found' }), { key });
        out.push(data.get(key)!);
        r.step('getVal', `Return ${data.get(key)}.`, view({ [key]: 'found' }), { value: data.get(key)! });
      } else {
        const [key, value] = a;
        const had = data.has(key);
        r.step('putHas', `put(${key}, ${value}): ${had ? `${key} already exists, so its old node is removed first` : `${key} is new`}.`, view(had ? { [key]: 'compare' } : {}), { key, value });
        if (had) {
          order.splice(order.indexOf(key), 1);
          r.step('putRemove', `Unlink the old node for ${key}.`, view(), { key });
        }
        data.set(key, value);
        r.step('putNode', `Create a node (${key}, ${value}) and store it in the map.`, view(), { key });
        order.unshift(key);
        r.step('putFront', `Insert it at the front: ${key} is the most recently used.`, view({ [key]: 'new' }), { key });
        const over = data.size > cap;
        r.step('evictCheck', `${data.size} item${data.size === 1 ? '' : 's'} versus capacity ${cap}: ${over ? 'too many, evict one' : 'within the limit'}.`, view(), { size: data.size });
        if (over) {
          const lru = order[order.length - 1];
          if (!askedEvict) {
            askedEvict = true;
            r.predictChoice('evict', `The cache is over capacity. Which key is evicted?`, String(lru), order.slice(0, -1).map(String), key, 'The least recently used key sits at the far end, just before the tail sentinel.');
          }
          r.step('evictPick', `The least recently used node is the one before the tail: key ${lru}.`, view({ [lru]: 'error' }), { lru });
          order.pop();
          r.step('evictRemove', `Unlink key ${lru}'s node.`, view(), { lru });
          data.delete(lru);
          r.step('evictDel', `Delete ${lru} from the map as well.`, view(), { lru });
        }
        out.push(null);
      }
    }
    r.step(undefined, 'All operations done.', view(), { results: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ cap, ops }) {
    const m = new Map<number, number>();
    const out: (number | null)[] = [null];
    for (const line of ops) {
      const { op, a } = parse(line);
      if (op === 'get') {
        if (!m.has(a[0])) out.push(-1);
        else {
          const v = m.get(a[0])!;
          m.delete(a[0]);
          m.set(a[0], v);
          out.push(v);
        }
      } else {
        m.delete(a[0]);
        m.set(a[0], a[1]);
        if (m.size > cap) m.delete(m.keys().next().value as number);
        out.push(null);
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Design a cache with a fixed capacity. get(key) returns the stored value or −1. put(key, value) stores a value, and if the cache would exceed its capacity it throws away the entry that was used least recently. Both operations must run in constant time.',
  example: ['capacity 2: put(1,A), put(2,B), get(1), put(3,C), get(2)', 'after get(1), key 2 is the least recent, so put(3,C) evicts it; get(2) returns −1', 'Reading a key also counts as using it.'],
  pattern: ['design', ['design', 'linked-list', 'hash-lookup', 'heap'], 'You need O(1) lookup (a hash map) and O(1) "move this to the front" and "drop the oldest" (a doubly linked list). Combining the two structures gives every operation in constant time.', {
    'linked-list': 'The doubly linked list is half of the design; the map that finds nodes in O(1) is the other half.',
    'hash-lookup': 'The map gives lookup, but it keeps no recency order; the linked list supplies that.',
    heap: 'A heap would give O(log n) eviction, not O(1), and cannot reorder cheaply when a key is used.',
  }],
  hints: [
    'You need to find any key instantly, and also know which key was used least recently. Which structure is good at each?',
    'A hash map finds a node in O(1). A doubly linked list can remove any node and insert at the front in O(1) if you hold the node. How do you tie them together?',
    'Keep a map key → node, and a list ordered by recency with sentinel head and tail nodes. On every get or put, move the node to the front; when over capacity, remove the node before the tail.',
  ],
  insight: 'A hash map for O(1) lookup plus a doubly linked list for O(1) recency order: move touched nodes to the front, evict from the back.',
  brute: 'Keep a list and scan it on every operation: O(n).',
  optimal: 'Map + doubly linked list: O(1) for get and put.',
  walk: ['Create head and tail sentinels linked to each other, and an empty map.', 'get(key): if missing return −1. Otherwise unlink the node, insert it right after head, return its value.', 'put(key, value): if the key exists, unlink its old node. Create the new node, store it in the map and insert it after head.', 'If the map now exceeds capacity, take lru = tail.prev, unlink it and delete its key from the map.'],
  edge: ['Capacity 1.', 'Updating an existing key refreshes it (and must not grow the cache).', 'get on a missing key leaves the order unchanged.', 'Many operations in a row.'],
  works: ['The list order always equals recency order: every access moves its node to the front, so the node before the tail is the least recently used.', 'Unlinking and inserting touch a constant number of pointers, and the map reaches the node directly, so everything is O(1).'],
  time: ['O(1)', 'Each operation does a map lookup and a constant number of pointer changes.'],
  space: ['O(capacity)', 'At most capacity nodes and map entries.'],
  solution,
  cases,
  sig: 'class LRUCache:\n    def __init__(self, capacity):\n        pass\n\n    def get(self, key):\n        pass\n\n    def put(self, key, value):\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ cap: (args as number[][])[0][0], ops: (ops as string[]).slice(1).map((o, i) => `${o} ${(args as number[][])[i + 1].join(' ')}`) }),
});
