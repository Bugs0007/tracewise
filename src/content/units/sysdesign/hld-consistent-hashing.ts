import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { gedge, gnode, graph, kvPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';
import { barChart, fnvHash, ringXY } from '@/content/lib/sysdesign-hld-3';

const code = `
def h(s):
    v = 2166136261
    for c in s:
        v = (v ^ ord(c)) * 16777619 % 2**32                 #@hash
    return (v ^ (v >> 16)) % 360

def build_ring(nodes, vnodes):
    return sorted((h(n + "#" + str(i)), n)                  #@build
                  for n in nodes for i in range(vnodes))

def lookup(ring, key):
    pos = h(key)
    for p, node in ring:
        if p >= pos:                                        #@clockwise
            return node
    return ring[0][1]                                       #@wrap

def mod_owner(nodes, key):
    return nodes[h(key) % len(nodes)]                       #@mod

def moved(keys, before, after):
    return sum(lookup(before, k) != lookup(after, k) for k in keys)   #@moved
`;

const RING = 360;
const TONES: Tone[] = ['active', 'swap', 'found', 'compare', 'frontier'];

interface In {
  nodes: string[];
  vnodes: number;
  keys: string[];
  change: string;
  target: string;
}

type Pt = [number, string];

const buildRing = (nodes: string[], vnodes: number): Pt[] =>
  nodes
    .flatMap((n) => Array.from({ length: vnodes }, (_, i) => [fnvHash(`${n}#${i}`, RING), n] as Pt))
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

function lookup(ring: Pt[], key: string): { node: string; idx: number; wrapped: boolean } {
  const pos = fnvHash(key, RING);
  const idx = ring.findIndex((p) => p[0] >= pos);
  return idx === -1 ? { node: ring[0][1], idx: 0, wrapped: true } : { node: ring[idx][1], idx, wrapped: false };
}

function parse(input: In) {
  const change = needOneOf('change', input.change, ['add node', 'remove node'] as const);
  const vnodes = needInt('vnodes', input.vnodes, 1, 4);
  const nodes = input.nodes.map((s) => s.trim());
  if (nodes.length < 2 || nodes.length > 4) throw new Error('Give 2 to 4 nodes');
  if (nodes.some((n) => !n || n.includes('#') || n.length > 8) || new Set(nodes).size !== nodes.length) throw new Error('Node names must be unique, non-empty, up to 8 characters, without "#"');
  const keys = input.keys.map((s) => s.trim());
  if (!keys.length || keys.length > 12 || keys.some((k) => !k)) throw new Error('Give 1 to 12 keys');
  const target = String(input.target).trim();
  if (change === 'add node' && (!target || target.includes('#') || nodes.includes(target))) throw new Error('The node to add must be a new name');
  if (change === 'remove node' && (!nodes.includes(target) || nodes.length < 2)) throw new Error('The node to remove must be one of the nodes');
  const after = change === 'add node' ? [...nodes, target] : nodes.filter((n) => n !== target);
  return { nodes, vnodes, keys, change, target, after };
}

const viz: VizDef<In> = {
  id: 'hld-consistent-hashing',
  title: 'Consistent hashing ring vs hash % N',
  code,
  language: 'python',
  inputs: [
    { key: 'nodes', label: 'Cache nodes', kind: 'strings', default: ['A', 'B', 'C'], maxItems: 4 },
    { key: 'vnodes', label: 'Virtual nodes per server', kind: 'number', default: 3 },
    { key: 'keys', label: 'Keys', kind: 'strings', default: ['user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8'], maxItems: 12 },
    { key: 'change', label: 'Change', kind: 'select', options: ['add node', 'remove node'], default: 'add node' },
    { key: 'target', label: 'Node to add / remove', kind: 'string', default: 'D' },
  ],
  presets: [
    { label: 'Add D (3 vnodes)', input: { change: 'add node', target: 'D', vnodes: 3 } },
    { label: 'Remove B', input: { change: 'remove node', target: 'B', vnodes: 3 } },
    { label: 'One point per server', input: { change: 'add node', target: 'D', vnodes: 1 } },
    { label: 'Many virtual nodes', input: { change: 'add node', target: 'D', vnodes: 4 } },
  ],
  run(input) {
    const { nodes, vnodes, keys, change, target, after } = parse(input);
    const colour = (n: string) => TONES[[...new Set([...nodes, ...after])].indexOf(n) % TONES.length];
    const r = new Recorder(code);
    const owners: Record<string, string> = {};
    let ring: Pt[] = [];
    let pendingKey: { key: string; idx: number; node: string } | null = null;
    const view = (): Panel => {
      const gn: GraphNode[] = [];
      const ge: GraphEdge[] = [];
      ring.forEach(([pos, node], i) => {
        const p = ringXY(pos, RING, 160, 120, 96);
        gn.push(gnode('P' + i, node, p.x, p.y, { tone: colour(node), shape: 'circle', badge: String(pos) }));
      });
      for (const k of keys) {
        if (!(k in owners)) continue;
        const p = ringXY(fnvHash(k, RING), RING, 160, 120, 52);
        gn.push(gnode('K' + k, k, p.x, p.y, { shape: 'pill', tone: pendingKey?.key === k ? 'active' : 'visited', w: 56 }));
      }
      if (pendingKey) ge.push(gedge('K' + pendingKey.key, 'P' + pendingKey.idx, { tone: 'active', flow: true }));
      return graph(gn, ge, 320, 240, `Ring (0-${RING - 1}, clockwise)`);
    };

    r.step(undefined, `Ring has ${RING} slots. Servers ${nodes.join(', ')} get ${vnodes} point(s) each`, [view()], { vnodes, nodes: nodes.join(',') });
    for (const n of nodes) {
      ring = buildRing(nodes.slice(0, nodes.indexOf(n) + 1), vnodes);
      r.op(vnodes);
      r.step('build', `${n} hashes to ${ring.filter((p) => p[1] === n).map((p) => p[0]).join(', ')}`, [view()], { node: n, points: ring.length });
    }
    const before = buildRing(nodes, vnodes);
    ring = before;
    for (const k of keys) {
      const lk = lookup(ring, k);
      owners[k] = lk.node;
      pendingKey = { key: k, idx: lk.idx, node: lk.node };
      r.op();
      const pos = fnvHash(k, RING);
      r.step(lk.wrapped ? 'wrap' : 'clockwise', lk.wrapped ? `${k} at ${pos}: past the last point, wraps to ${ring[0][0]} → ${lk.node}` : `${k} at ${pos}: first point clockwise is ${ring[lk.idx][0]} → ${lk.node}`, [view()], { key: k, pos, owner: lk.node });
    }
    pendingKey = null;
    const ownersBefore = { ...owners };
    const modBefore = Object.fromEntries(keys.map((k) => [k, nodes[fnvHash(k, 4294967296) % nodes.length]]));
    const modAfter = Object.fromEntries(keys.map((k) => [k, after[fnvHash(k, 4294967296) % after.length]]));
    ring = buildRing(after, vnodes);
    r.step('build', change === 'add node' ? `${target} joins: ${vnodes} new point(s) on the ring` : `${target} leaves: its ${vnodes} point(s) vanish`, [view()], { change, target });
    const ownersAfter: Record<string, string> = {};
    const movedKeys: string[] = [];
    for (const k of keys) {
      const lk = lookup(ring, k);
      ownersAfter[k] = lk.node;
      if (lk.node !== ownersBefore[k]) {
        movedKeys.push(k);
        owners[k] = lk.node;
        pendingKey = { key: k, idx: lk.idx, node: lk.node };
        r.op();
        r.step('moved', `${k} moves ${ownersBefore[k]} → ${lk.node}`, [view()], { key: k, from: ownersBefore[k], to: lk.node });
      }
    }
    pendingKey = null;
    const modMoved = keys.filter((k) => modBefore[k] !== modAfter[k]).length;
    const moved = movedKeys.length;
    if (!moved) r.step('moved', 'No key changed owner on the ring', [view()], { moved });
    r.step('mod', `Ring moved ${moved} of ${keys.length} keys; hash % N would move ${modMoved}`, [barChart('Keys that change server', ['ring', 'hash % N'], [moved, modMoved], { yLabel: 'keys', tone: 'swap' }), kvPanel('Outcome', { ringMoved: moved, modMoved, keys: keys.length }, { modMoved: modMoved > moved ? 'error' : 'found', ringMoved: 'found' })], { ringMoved: moved, modMoved });
    return { frames: r.frames, result: { before: ownersBefore, after: ownersAfter, moved, modMoved } };
  },
  reference(input) {
    const { nodes, vnodes, keys, after } = parse(input);
    const owner = (set: string[], k: string) => {
      const pts = set.flatMap((n) => Array.from({ length: vnodes }, (_, i) => ({ p: fnvHash(`${n}#${i}`, RING), n }))).sort((a, b) => a.p - b.p || a.n.localeCompare(b.n));
      const pos = fnvHash(k, RING);
      let lo = 0;
      let hi = pts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].p < pos) lo = mid + 1;
        else hi = mid;
      }
      return pts[lo % pts.length].n;
    };
    const b = Object.fromEntries(keys.map((k) => [k, owner(nodes, k)]));
    const a = Object.fromEntries(keys.map((k) => [k, owner(after, k)]));
    return {
      before: b,
      after: a,
      moved: keys.filter((k) => a[k] !== b[k]).length,
      modMoved: keys.filter((k) => nodes[fnvHash(k, 4294967296) % nodes.length] !== after[fnvHash(k, 4294967296) % after.length]).length,
    };
  },
};

const assignClass = `import bisect

def assign_keys(points, positions):
    ring = [p for p, _ in points]
    out = []
    for pos in positions:
        i = bisect.bisect_left(ring, pos)
        out.append(points[i % len(points)][1])
    return out`;

const unit: Unit = {
  id: 'hld-consistent-hashing',
  hook: 'Sharded caches and databases must survive adding a node without remapping everything. "Use consistent hashing" is the expected answer, and explaining virtual nodes is what separates good from great.',
  predict: {
    prompt: 'Four cache servers pick a key\'s server with hash(key) % 4. You add a fifth and switch to % 5. Roughly what share of keys now maps to a different server?',
    options: ['About 20%', 'About 50%', 'About 80%', 'None, hashes do not change'],
    answer: 2,
    explain: 'Only keys whose hash gives the same remainder mod 4 and mod 5 stay put, which is about one in five. So roughly 80% of keys move and the cache goes cold. A ring moves only about 1/5 of them.',
  },
  viz,
  deeper: {
    points: [
      'Hash both servers and keys onto the same circle. A key belongs to the first server point found moving clockwise from its position.',
      'Adding a node only steals the keys between it and its predecessor; removing one hands its keys to the next node clockwise. On average K/N keys move instead of nearly all of them.',
      'With one point per server the arcs are uneven, so loads are uneven. Virtual nodes (many points per server) average this out and let bigger machines own more points.',
      'The ring is a sorted array of positions: lookup is a binary search (bisect) with wrap-around from the last point to the first.',
      'Used by Dynamo-style stores, cache clients and CDNs; replication copies each key to the next few distinct nodes on the ring.',
    ],
    complexity: { time: 'Lookup O(log (N * vnodes)); add or remove O(vnodes * log)', space: 'O(N * vnodes) ring points' },
    pitfalls: ['No wrap-around past the last point on the ring', 'A hash that mixes poorly, so virtual nodes of one server cluster together', 'Replicating onto virtual nodes of the same physical machine'],
  },
  practice: {
    language: 'python',
    fnName: 'ring_lookup',
    statement: 'The ring is a sorted list of `[position, node]` points. `ring_lookup(points, pos)` returns the node of the first point at or after `pos`, wrapping around to the first point when `pos` is past the last one.',
    signature: 'def ring_lookup(points, pos):',
    solution: `def ring_lookup(points, pos):
    for p, node in points:
        if @@p >= pos@@:
            return @@node@@
    return @@points[0][1]@@`,
    tests: [
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], 5], expected: 'A', name: 'before the first point' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], 120], expected: 'B', name: 'exactly on a point' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], 121], expected: 'C', name: 'between points' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], 300], expected: 'A', name: 'wraps past the last point' },
      { args: [[[100, 'X']], 350], expected: 'X', name: 'single point' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'assign_keys',
    statement: 'Most keys are placed correctly, but a few near the top of the ring crash the lookup. Find the bug.',
    buggy: assignClass.replace('points[i % len(points)]', 'points[i]'),
    fixed: assignClass,
    tests: [
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], [5, 50, 130]], expected: ['A', 'B', 'C'], name: 'positions inside the ring' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], [250, 359]], expected: ['A', 'A'], name: 'past the last point wraps to the first' },
      { args: [[[100, 'X']], [0, 100, 101]], expected: ['X', 'X', 'X'], name: 'single server' },
      { args: [[[10, 'A'], [120, 'B']], []], expected: [], name: 'no keys' },
    ],
    bugType: 'missing wrap-around',
    hint: 'What does bisect_left return when pos is larger than every point on the ring?',
    explanation: 'bisect_left returns len(points) for positions past the last point, which is not a valid index. A ring is circular, so the index must wrap with `% len(points)`, sending those keys to the first point.',
  },
  boss: {
    title: 'Ring vs modulo remapping',
    statement:
      'You are given the ring before and after a change (sorted lists of `[position, node]`) and a list of key positions. Return `[ring_moved, mod_moved]`: how many keys change owner on the ring (first point at or after the key position, wrapping around), and how many would change server under `position % n` when the server count goes from `n_before` to `n_after`.',
    language: 'python',
    fnName: 'remap_counts',
    starter: `def remap_counts(before, after, positions, n_before, n_after):
    # your code here
    pass
`,
    solution: `def remap_counts(before, after, positions, n_before, n_after):
    def owner(points, pos):
        for p, node in points:
            if p >= pos:
                return node
        return points[0][1]
    ring = sum(1 for x in positions if owner(before, x) != owner(after, x))
    mod = sum(1 for x in positions if x % n_before != x % n_after)
    return [ring, mod]`,
    tests: [
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], [[10, 'A'], [120, 'B'], [180, 'D'], [240, 'C']], [5, 50, 130, 170, 200, 250, 359], 3, 4], expected: [2, 5], name: 'add a node' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], [[10, 'A'], [240, 'C']], [5, 50, 130, 170, 200, 250, 359], 3, 2], expected: [1, 7], name: 'remove a node' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], [[10, 'A'], [120, 'B'], [240, 'C']], [1, 2, 3], 3, 3], expected: [0, 0], name: 'no change' },
      { args: [[[100, 'A']], [[100, 'A'], [300, 'B']], [50, 150, 250, 350], 1, 2], expected: [2, 0], name: 'wrap-around keys' },
      { args: [[[10, 'A'], [120, 'B'], [240, 'C']], [[10, 'A'], [120, 'B'], [180, 'D'], [240, 'C']], [181, 239, 241, 5], 3, 4], expected: [0, 2], name: 'keys the new node does not own' },
    ],
    hints: ['Write a small helper that finds the owner of one position on a given ring, then compare the owner before and after for each position.', 'Do not forget the wrap: when no point is at or after the position, the owner is `points[0][1]`. The modulo part is simply `x % n_before != x % n_after`.'],
    combines: ['hld-sharding'],
  },
  quiz: [
    {
      prompt: 'Why do production rings give each server many virtual nodes?',
      options: ['To make lookups O(1)', 'To even out the share of the ring each server owns and spread a failed node\'s keys over many peers', 'To avoid hashing the keys', 'To store more replicas per key'],
      answer: 1,
      explain: 'A few random points make arcs of very different sizes. Many virtual points per server average out the load, and when a server dies its arcs are scattered, so its keys land on many different neighbours instead of one.',
    },
  ],
};

export default unit;
