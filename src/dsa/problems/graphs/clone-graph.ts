import type { Tone } from '@/engine/types';
import type { EdgeSpec } from '@/engine/layout';
import { graphView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './clone-graph.py?raw';
import harness from './clone-graph.harness.py?raw';
import cases from './clone-graph.cases.json';

const toAdj = (edges: EdgeSpec[]): number[][] => {
  const n = Math.max(1, ...edges.flatMap((e) => [Number(e.from), Number(e.to)]));
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    adj[Number(e.from) - 1].push(Number(e.to));
    adj[Number(e.to) - 1].push(Number(e.from));
  }
  return adj.map((l) => [...new Set(l)].sort((a, b) => a - b));
};

const viz = vizOf<{ edges: EdgeSpec[] }>({
  id: 'clone-graph',
  title: 'Clone Graph',
  solution,
  inputs: [{ key: 'edges', label: 'edges between nodes numbered 1…n (leave empty for a single node)', kind: 'edges', default: [{ from: '1', to: '2' }, { from: '2', to: '3' }, { from: '3', to: '1' }, { from: '3', to: '4' }], maxItems: 10 }],
  presets: [
    { label: 'Triangle with a tail', input: { edges: [{ from: '1', to: '2' }, { from: '2', to: '3' }, { from: '3', to: '1' }, { from: '3', to: '4' }] } },
    { label: 'Square', input: { edges: [{ from: '1', to: '2' }, { from: '2', to: '3' }, { from: '3', to: '4' }, { from: '4', to: '1' }] } },
    { label: 'Path', input: { edges: [{ from: '1', to: '2' }, { from: '2', to: '3' }] } },
    { label: 'Single node', input: { edges: [] } },
  ],
  validate: ({ edges }) => {
    const labels = edges.flatMap((e) => [e.from, e.to]);
    if (labels.some((l) => !/^[1-9]\d*$/.test(l))) return 'Nodes must be numbered 1, 2, 3, …';
    const n = Math.max(1, ...labels.map(Number));
    if (n > 8) return 'Use at most 8 nodes';
    if (edges.some((e) => e.from === e.to)) return 'No self-loops';
    const adj = toAdj(edges);
    const seen = new Set([1]);
    const stack = [1];
    while (stack.length) for (const m of adj[stack.pop()! - 1]) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    return seen.size === n ? null : 'Every node 1…n must be reachable from node 1 (connected graph)';
  },
  run({ edges }) {
    const r = new TraceRecorder(solution);
    const adj = toAdj(edges);
    const n = adj.length;
    const ids = adj.map((_, i) => String(i + 1));
    const orig: EdgeSpec[] = [];
    adj.forEach((l, i) => l.forEach((j) => j > i + 1 && orig.push({ from: String(i + 1), to: String(j) })));
    const copies = new Map<number, number[]>();
    const cloneEdges: EdgeSpec[] = [];
    const tones: Record<string, Tone> = {};
    const view = () => [
      graphView(ids, orig, { title: 'original graph', layout: 'circle', tones, size: { width: 360, height: 260 } }),
      ...(copies.size ? [graphView([...copies.keys()].sort((a, b) => a - b).map(String), cloneEdges, { title: 'clone built so far', layout: 'circle', size: { width: 360, height: 260 }, tones: Object.fromEntries([...copies.keys()].map((k) => [String(k), 'found' as Tone])) })] : []),
      hashMapView(Object.fromEntries([...copies.entries()].map(([k, v]) => [`copy of ${k}`, `neighbours so far: [${v.join(', ')}]`])), { title: 'copies (original → its copy)' }),
    ];
    let askedSeen = false;
    let askedStore = false;
    r.step('init', 'copies maps each original node to its copy, so a node reached twice (through a cycle) is never copied twice.', view(), {});
    const dfs = (cur: number): void => {
      r.op();
      tones[String(cur)] = 'active';
      r.step('def', `dfs(${cur}): get the copy of node ${cur}.`, view(), { node: cur });
      if (copies.has(cur)) {
        r.step('seenRet', `Node ${cur} already has a copy: return it instead of copying again.`, view(), {});
        if (!askedSeen) {
          askedSeen = true;
          r.predict('seen', `Node ${cur} was reached again through a cycle. What does dfs(${cur}) do?`, ['Return the existing copy', 'Create a second copy', 'Raise an error'], 0, 'The copies map breaks the cycle: each original node has exactly one copy.');
        }
        tones[String(cur)] = 'visited';
        return;
      }
      copies.set(cur, []);
      r.step('make', `Create a copy of ${cur} and store it in copies BEFORE visiting its neighbours.`, view(), {});
      if (!askedStore) {
        askedStore = true;
        r.predict('store', 'Why is the copy stored before the neighbours are explored?', ['A neighbour may lead back here; the stored copy stops infinite recursion', 'It makes the code shorter', 'Neighbours need to be sorted first'], 0, 'On a cycle the recursion returns to this node; finding the copy already in the map ends it.');
      }
      for (const nb of adj[cur - 1]) {
        tones[String(cur)] = 'active';
        r.step('link', `Next neighbour of ${cur}: ${nb}. Get its copy, then append it to the copy of ${cur}.`, view(), { nb });
        dfs(nb);
        copies.get(cur)!.push(nb);
        if (!cloneEdges.some((e) => (e.from === String(cur) && e.to === String(nb)) || (e.from === String(nb) && e.to === String(cur)))) cloneEdges.push({ from: String(Math.min(cur, nb)), to: String(Math.max(cur, nb)) });
        tones[String(cur)] = 'active';
        r.step('link', `Copy of ${cur} now lists the copy of ${nb} as a neighbour.`, view(), {});
      }
      tones[String(cur)] = 'done';
      r.step('ret', `All neighbours of ${cur} are linked. Return its copy.`, view(), {});
    };
    dfs(1);
    const result = ids.map((_, i) => copies.get(i + 1) ?? []);
    r.step('start', `The clone is complete: it has ${n} nodes, none shared with the original.`, view(), { result: JSON.stringify(result) });
    return { frames: r.frames, result };
  },
  reference({ edges }) {
    return toAdj(edges);
  },
});

export default problem({
  summary: 'You are given one node of a connected undirected graph; each node has a value and a list of neighbour nodes. Build a deep copy of the whole graph (new nodes, same connections) and return the copy of the given node.',
  example: ['nodes 1, 2, 3 where 1-2, 2-3 and 3-1 are connected', 'a new triangle of three new nodes with the same values', 'Changing a neighbour list in the copy must never change the original.'],
  pattern: ['dfs', ['dfs', 'bfs', 'hash-lookup', 'union-find'], 'Walk the graph and make one copy per original node. A dictionary from original node to copy tells you whether a node has already been copied, which also stops infinite loops on cycles.', {
    bfs: 'A BFS copy works too. The dictionary from original to copy is the crucial part in both.',
    'hash-lookup': 'The dictionary is essential, but it is used inside a graph traversal.',
    'union-find': 'There is nothing to merge.',
  }],
  hints: [
    'If the graph had no cycles, how would you copy it recursively?',
    'With cycles, what would happen to that recursion? What do you need to remember?',
    'Keep a dict original → copy. dfs(node): if it is in the dict return its copy; otherwise create the copy, store it, then append dfs(neighbour) for each neighbour.',
  ],
  insight: 'Register each copy in the dictionary before recursing into neighbours, so cycles reuse the copy instead of looping forever.',
  brute: 'Copy node values first, then make a second pass to connect them: also O(V + E).',
  optimal: 'DFS with a map: O(V + E) time and O(V) space.',
  walk: ['If the input node is None return None.', 'copies = {} maps originals to copies.', 'dfs(cur): if cur is in copies return copies[cur]; otherwise create Node(cur.val) and store it.', 'For each neighbour append dfs(neighbour) to the copy’s neighbour list; return the copy.'],
  edge: ['A single node with no neighbours.', 'A cycle (the stored copy ends the recursion).', 'A node connected to itself.', 'Deep chains (recursion depth).'],
  works: ['Every original node gets exactly one copy because the map is checked first.', 'Each edge is reproduced when the copy of the node is linked to the copy of the neighbour.'],
  time: ['O(V + E)', 'Each node and edge is processed once.'],
  space: ['O(V)', 'The map and the recursion stack.'],
  solution,
  cases,
  sig: 'def clone_graph(node):\n    # Node(val, neighbors) is provided; return the copy of node (all new nodes)\n    pass\n',
  harness,
  viz,
  fromArgs: ([adj]) => ({ edges: (adj as number[][]).flatMap((l, i) => l.filter((j) => j > i + 1).map((j) => ({ from: String(i + 1), to: String(j) }))) }),
});
