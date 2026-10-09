import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { linkedListPanel } from '@/engine/layout';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';
import { ops } from '@/content/lib/sysdesign-hld-1';

const code = `
class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity                          #@init
        self.map = {}
        self.head, self.tail = Node(), Node()
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, n):
        n.prev.next, n.next.prev = n.next, n.prev    #@unlink

    def _push_front(self, n):
        n.prev, n.next = self.head, self.head.next   #@front
        self.head.next.prev = n
        self.head.next = n

    def get(self, key):
        if key not in self.map:                      #@lookup
            return -1                                #@miss
        n = self.map[key]
        self._unlink(n)
        self._push_front(n)                          #@touch
        return n.val                                 #@hit

    def put(self, key, val):
        if key in self.map:                          #@exists
            self._unlink(self.map[key])
        elif len(self.map) == self.cap:              #@full
            lru = self.tail.prev                     #@victim
            self._unlink(lru)
            del self.map[lru.key]                    #@evict
        node = Node(key, val)
        self.map[key] = node
        self._push_front(node)                       #@insert
`;

interface In {
  capacity: number;
  ops: string[];
}
type Op = { kind: 'get'; key: number } | { kind: 'put'; key: number; val: number };

function parseOps(list: string[]): Op[] {
  return list.map((raw) => {
    const [k, a, b] = raw.split(':').map((x) => x.trim().toLowerCase());
    if (k === 'get' && a !== undefined && a !== '' && Number.isInteger(Number(a))) return { kind: 'get', key: Number(a) };
    if (k === 'put' && a !== undefined && a !== '' && b !== undefined && b !== '' && Number.isInteger(Number(a)) && Number.isInteger(Number(b))) return { kind: 'put', key: Number(a), val: Number(b) };
    throw new Error(`Cannot read "${raw}". Use put:key:value or get:key (whole numbers)`);
  });
}

const cap = (n: number) => Math.max(1, Math.min(5, Math.round(n) || 1));

const viz: VizDef<In> = {
  id: 'lld-lru-cache',
  title: 'LRU cache: hash map + doubly linked list',
  code,
  language: 'python',
  inputs: [
    { key: 'capacity', label: 'Capacity (1-5)', kind: 'number', default: 2 },
    { key: 'ops', label: 'Operations', kind: 'strings', default: ['put:1:10', 'put:2:20', 'get:1', 'put:3:30', 'get:2', 'get:3'], maxItems: 12, help: 'put:1:10, get:1, ...' },
  ],
  presets: [
    { label: 'Classic eviction', input: { capacity: 2, ops: ['put:1:10', 'put:2:20', 'get:1', 'put:3:30', 'get:2', 'get:3'] } },
    { label: 'Update refreshes', input: { capacity: 2, ops: ['put:1:1', 'put:2:2', 'put:1:9', 'put:3:3', 'get:2', 'get:1'] } },
    { label: 'Capacity 1', input: { capacity: 1, ops: ['put:1:1', 'put:2:2', 'get:1', 'get:2'] } },
  ],
  run(input) {
    const capacity = cap(input.capacity);
    const list = parseOps(input.ops);
    const r = new Recorder(code);
    // order[0] is the most recently used key; the last element is the eviction candidate
    let order: { key: number; val: number }[] = [];
    const log: { text: string; tone?: Tone }[] = [];
    const results: number[] = [];
    const nid = (k: number) => `k${k}`;
    const view = (tones: Record<number, Tone> = {}, extra: { skip?: number } = {}): Panel[] => {
      const shown = order.filter((e) => e.key !== extra.skip);
      const seq = ['H', ...shown.map((e) => nid(e.key)), 'T'];
      const next: Record<string, string | null> = {};
      const prev: Record<string, string | null> = {};
      seq.forEach((id, i) => {
        next[id] = i < seq.length - 1 ? seq[i + 1] : null;
        prev[id] = i > 0 ? seq[i - 1] : null;
      });
      const nodes = [
        { id: 'H', label: 'HEAD', tone: 'muted' as Tone, tags: ['MRU side'] },
        ...shown.map((e, i) => ({ id: nid(e.key), label: `${e.key}:${e.val}`, tone: tones[e.key], tags: i === shown.length - 1 ? ['LRU'] : undefined })),
        { id: 'T', label: 'TAIL', tone: 'muted' as Tone },
      ];
      const entries: Record<string, number | string> = {};
      order.forEach((e) => (entries[`key ${e.key}`] = e.val));
      return [
        linkedListPanel(nodes, next, { prev, title: 'Doubly linked list (most recent first)', showNull: false }),
        kvPanel(`Hash map (${order.length}/${capacity})`, order.length ? entries : { '(empty)': '' }),
        logPanel('Results', log),
      ];
    };
    r.step('init', `Empty cache, capacity ${capacity}: HEAD and TAIL sentinels point at each other`, view(), { capacity, size: 0 });
    for (const op of list) {
      r.op();
      const at = order.findIndex((e) => e.key === op.key);
      if (op.kind === 'get') {
        r.step('lookup', `get(${op.key}): O(1) dict lookup`, view(at >= 0 ? { [op.key]: 'compare' } : {}), { key: op.key });
        if (at < 0) {
          results.push(-1);
          log.push({ text: `get(${op.key}) -> -1`, tone: 'error' });
          r.step('miss', `${op.key} is not in the map: return -1`, view(), { key: op.key, result: -1 });
          continue;
        }
        const e = order[at];
        r.step('touch', `Unlink ${op.key}:${e.val} (neighbours point at each other)`, view({ [op.key]: 'swap' }, { skip: op.key }), { key: op.key });
        order = [e, ...order.filter((x) => x.key !== op.key)];
        r.step('touch', `Re-insert ${op.key}:${e.val} right after HEAD: now most recent`, view({ [op.key]: 'new' }), { key: op.key });
        results.push(e.val);
        log.push({ text: `get(${op.key}) -> ${e.val}`, tone: 'found' });
        r.step('hit', `Return ${e.val}`, view({ [op.key]: 'found' }), { key: op.key, result: e.val });
        continue;
      }
      if (at >= 0) {
        r.step('exists', `put(${op.key}, ${op.val}): key exists, unlink the old node`, view({ [op.key]: 'swap' }, { skip: op.key }), { key: op.key });
        order = order.filter((x) => x.key !== op.key);
      } else if (order.length === capacity) {
        const victim = order[order.length - 1];
        r.step('victim', `Full: victim is tail.prev = ${victim.key}:${victim.val}`, view({ [victim.key]: 'error' }), { size: order.length, victim: victim.key });
        order = order.slice(0, -1);
        r.step('evict', `Unlink ${victim.key} and delete it from the map`, view(), { size: order.length });
        log.push({ text: `evicted key ${victim.key}`, tone: 'error' });
      } else {
        r.step('full', `put(${op.key}, ${op.val}): ${order.length} < ${capacity}, room to spare`, view(), { size: order.length });
      }
      order = [{ key: op.key, val: op.val }, ...order];
      log.push({ text: `put(${op.key}, ${op.val})`, tone: 'default' });
      r.step('insert', `Insert ${op.key}:${op.val} after HEAD and add it to the map`, view({ [op.key]: 'new' }), { size: order.length });
    }
    r.step('init', `Done: ${order.length} entries, most recent first: ${order.map((e) => e.key).join(', ') || '(none)'}`, view(), { size: order.length });
    return { frames: r.frames, result: results };
  },
  reference(input) {
    const capacity = cap(input.capacity);
    // A JS Map keeps insertion order: delete + set moves a key to the "recent" end.
    const m = new Map<number, number>();
    const out: number[] = [];
    for (const op of parseOps(input.ops)) {
      if (op.kind === 'get') {
        if (!m.has(op.key)) {
          out.push(-1);
          continue;
        }
        const v = m.get(op.key)!;
        m.delete(op.key);
        m.set(op.key, v);
        out.push(v);
      } else {
        if (m.has(op.key)) m.delete(op.key);
        else if (m.size >= capacity) m.delete(m.keys().next().value as number);
        m.set(op.key, op.val);
      }
    }
    return out;
  },
};

const unit: Unit = {
  id: 'lld-lru-cache',
  hook: 'The LRU cache is the most repeated low-level design question. It tests whether you can combine two structures so that **both** `get` and `put` are O(1).',
  predict: {
    prompt: 'A hash map alone gives O(1) lookup. Why do we also need a doubly linked list?',
    options: ['To keep keys sorted', 'To know the oldest entry and move any entry to "most recent" in O(1)', 'To make the hash map thread-safe', 'To store the values compactly'],
    answer: 1,
    explain: 'The map finds a node in O(1); the list remembers recency order. Because the list is doubly linked, a node can unlink itself without searching for its predecessor.',
  },
  viz,
  deeper: {
    points: [
      'The map stores `key -> node`; the list orders nodes from most to least recently used. Both are updated together on every operation.',
      'Sentinel HEAD and TAIL nodes remove all the "is this the first/last node?" special cases.',
      '`get` is a **write** to the structure: it must move the node to the front, or the policy silently degrades to FIFO.',
      'Nodes store their key so eviction can delete the right entry from the map after unlinking the tail neighbour.',
      'In Python `OrderedDict` (with `move_to_end` and `popitem(last=False)`) is the same idea in a few lines; interviewers still often ask for the manual version.',
    ],
    complexity: { time: 'O(1) get and put', space: 'O(capacity)' },
    pitfalls: ['Not refreshing recency on `get`', 'Updating an existing key without moving it to the front', 'Evicting before checking whether `put` is only an update', 'Forgetting to delete the evicted key from the map'],
  },
  practice: {
    language: 'python',
    fnName: 'LRUCache',
    statement: 'Implement `LRUCache(capacity)` with `get(key)` (value or -1) and `put(key, value)`. Both must be O(1); when full, `put` of a new key evicts the least recently used key. Both `get` and `put` count as a use.',
    signature: 'class LRUCache:',
    solution: `class Node:
    def __init__(self, key=0, val=0):
        self.key = key
        self.val = val
        self.prev = None
        self.next = None

class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.map = {}
        self.head = Node()
        self.tail = Node()
        self.head.next = self.tail
        self.tail.prev = self.head

    def _unlink(self, n):
        n.prev.next = @@n.next@@
        n.next.prev = @@n.prev@@

    def _push_front(self, n):
        n.prev = self.head
        n.next = self.head.next
        self.head.next.prev = n
        self.head.next = @@n@@

    def get(self, key):
        if key not in self.map:
            return -1
        n = self.map[key]
        self._unlink(n)
        self._push_front(@@n@@)
        return n.val

    def put(self, key, val):
        if key in self.map:
            self._unlink(self.map[key])
        elif len(self.map) == self.cap:
            lru = @@self.tail.prev@@
            self._unlink(lru)
            del self.map[@@lru.key@@]
        node = Node(key, val)
        self.map[key] = node
        self._push_front(node)`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('LRUCache', 'put', 'put', 'get', 'put', 'get', 'put', 'get', 'get', 'get'), [[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]], expected: [null, null, null, 1, null, -1, null, -1, 3, 4], name: 'classic sequence' },
      { args: [ops('LRUCache', 'put', 'put', 'put', 'put', 'get', 'get', 'get'), [[2], [1, 1], [2, 2], [1, 10], [3, 3], [2], [1], [3]]], expected: [null, null, null, null, null, -1, 10, 3], name: 'update refreshes recency' },
      { args: [ops('LRUCache', 'put', 'put', 'get', 'get'), [[1], [1, 1], [2, 2], [1], [2]]], expected: [null, null, null, -1, 2], name: 'capacity one' },
      { args: [ops('LRUCache', 'put', 'put', 'get', 'put', 'get', 'get', 'get'), [[2], [1, 1], [2, 2], [1], [3, 3], [2], [1], [3]]], expected: [null, null, null, 1, null, -1, 1, 3], name: 'get refreshes recency' },
      { args: [ops('LRUCache', 'get'), [[3], [5]]], expected: [null, -1], name: 'empty cache' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'LRUCache',
    statement: 'Users complain that the hottest profile keeps disappearing from the cache even though it is read constantly. The cache behaves like FIFO. Fix it.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.data = OrderedDict()

    def get(self, key):
        if key not in self.data:
            return -1
        return self.data[key]

    def put(self, key, val):
        if key in self.data:
            self.data.move_to_end(key)
        self.data[key] = val
        if len(self.data) > self.cap:
            self.data.popitem(last=False)`,
    fixed: `from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.data = OrderedDict()

    def get(self, key):
        if key not in self.data:
            return -1
        self.data.move_to_end(key)
        return self.data[key]

    def put(self, key, val):
        if key in self.data:
            self.data.move_to_end(key)
        self.data[key] = val
        if len(self.data) > self.cap:
            self.data.popitem(last=False)`,
    tests: [
      { args: [ops('LRUCache', 'put', 'put', 'get', 'put', 'get', 'get'), [[2], [1, 1], [2, 2], [1], [3, 3], [2], [1]]], expected: [null, null, null, 1, null, -1, 1], name: 'reading protects a key' },
      { args: [ops('LRUCache', 'put', 'put', 'put', 'get', 'get'), [[2], [1, 1], [2, 2], [3, 3], [1], [3]]], expected: [null, null, null, null, -1, 3], name: 'plain eviction' },
      { args: [ops('LRUCache', 'put', 'put', 'put', 'get'), [[2], [1, 1], [2, 2], [1, 5], [1]]], expected: [null, null, null, null, 5], name: 'update value' },
    ],
    bugType: 'recency not updated on read',
    hint: 'Which operation is supposed to mark a key as recently used, and which of them does it?',
    explanation: '`get` returns the value without calling `move_to_end`, so reads never change the order and the oldest-inserted key is evicted. Moving the key to the most-recent end on every hit restores LRU behaviour.',
  },
  boss: {
    title: 'LRU cache with expiry',
    statement:
      'Implement `TTLCache(capacity, ttl)` with `put(key, value, now)` and `get(key, now)` (value or -1). An entry stored at time `t` is valid while `now - t < ttl`. `get` on an expired key deletes it and returns -1; a valid `get` makes the key most recent (it does not extend the expiry). `put` stores `now` as the timestamp and makes the key most recent. When `put` adds a NEW key to a full cache, first remove every expired entry; only if it is still full evict the least recently used one.',
    language: 'python',
    fnName: 'TTLCache',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class TTLCache:
    # your code here
    pass
`,
    solution: `from collections import OrderedDict

class TTLCache:
    def __init__(self, capacity, ttl):
        self.cap = capacity
        self.ttl = ttl
        self.data = OrderedDict()

    def get(self, key, now):
        if key not in self.data:
            return -1
        value, at = self.data[key]
        if now - at >= self.ttl:
            del self.data[key]
            return -1
        self.data.move_to_end(key)
        return value

    def put(self, key, value, now):
        if key in self.data:
            del self.data[key]
        elif len(self.data) >= self.cap:
            for k in [k for k, (_, at) in self.data.items() if now - at >= self.ttl]:
                del self.data[k]
            if len(self.data) >= self.cap:
                self.data.popitem(last=False)
        self.data[key] = (value, now)`,
    tests: [
      { args: [ops('TTLCache', 'put', 'get', 'get'), [[2, 5], ['a', 10, 0], ['a', 3], ['a', 5]]], expected: [null, null, 10, -1], name: 'expires at exactly ttl' },
      { args: [ops('TTLCache', 'put', 'put', 'get', 'put', 'get', 'get'), [[2, 5], ['a', 1, 0], ['b', 2, 3], ['a', 4], ['c', 3, 6], ['b', 6], ['c', 6]]], expected: [null, null, null, 1, null, 2, 3], name: 'sweep expired before evicting' },
      { args: [ops('TTLCache', 'put', 'put', 'get'), [[1, 3], ['k', 1, 0], ['k', 2, 2], ['k', 4]]], expected: [null, null, null, 2], name: 'put refreshes the timestamp' },
      { args: [ops('TTLCache', 'put', 'put', 'get', 'put', 'get', 'get'), [[2, 100], [1, 1, 0], [2, 2, 1], [1, 2], [3, 3, 2], [2, 3], [1, 3]]], expected: [null, null, null, 1, null, -1, 1], name: 'LRU eviction when nothing expired' },
      { args: [ops('TTLCache', 'put', 'get', 'get'), [[2, 4], ['x', 1, 0], ['x', 3], ['x', 4]]], expected: [null, null, 1, -1], name: 'get does not extend expiry' },
    ],
    hints: ['Keep an OrderedDict of key -> (value, stored_at). The order is the recency order.', 'In put for a new key at capacity: delete all expired keys first, then `popitem(last=False)` only if still full.'],
    combines: ['be-caching', 'hld-eviction'],
  },
};

export default unit;
