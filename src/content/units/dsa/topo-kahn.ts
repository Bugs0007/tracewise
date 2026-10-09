import { Recorder } from '@/engine/recorder';
import { graphPanel, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { dagLayout, nodeIds, outAdj } from '@/content/lib/graphs';

const code = `
from collections import deque

def topo_sort(graph):
    indeg = {node: 0 for node in graph}                  #@init
    for node in graph:                                   #@countLoop
        for nb in graph[node]:
            indeg[nb] += 1                               #@count
    queue = deque(n for n in graph if indeg[n] == 0)     #@seed
    order = []
    while queue:                                         #@loop
        node = queue.popleft()                           #@pop
        order.append(node)                               #@emit
        for nb in graph[node]:                           #@scan
            indeg[nb] -= 1                               #@dec
            if indeg[nb] == 0:                           #@zero
                queue.append(nb)                         #@push
    return order if len(order) == len(graph) else []     #@done
`;

interface In {
  edges: EdgeSpec[];
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)$/)!;
    return { from: m[1], to: m[2] };
  });

const viz: VizDef<In> = {
  id: 'topo-kahn',
  title: 'Topological sort (Kahn)',
  code,
  language: 'python',
  inputs: [{ key: 'edges', label: 'Directed edges (A-B means A must come before B)', kind: 'edges', default: E('A-C, B-C, C-D, B-E, D-F, E-F'), maxItems: 12 }],
  presets: [
    { label: 'Dependencies', input: { edges: E('A-C, B-C, C-D, B-E, D-F, E-F') } },
    { label: 'Cycle (B ⇄ C)', input: { edges: E('A-B, B-C, C-B, A-D') } },
    { label: 'Many sources', input: { edges: E('A-D, B-D, C-D') } },
    { label: 'Straight chain', input: { edges: E('A-B, B-C, C-D') } },
  ],
  run({ edges }) {
    if (!edges.length) throw new Error('Add at least one directed edge, like A-B');
    if (edges.some((e) => e.from === e.to)) throw new Error('A self-loop (like A-A) is a cycle by itself and cannot be drawn; use two or more nodes');
    const r = new Recorder(code);
    const ids = nodeIds(edges);
    const adj = outAdj(ids, edges);
    const pos = dagLayout(ids, edges, 460, 270);
    const indeg: Record<string, number> = {};
    const queue: string[] = [];
    const order: string[] = [];
    const edgeTone: Record<string, Tone> = {};
    const out = new Set<string>();
    let showQueue = false;

    const view = (cur?: string, nb?: string): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) {
        tones[id] = out.has(id) ? 'done' : queue.includes(id) ? 'frontier' : 'default';
        if (id in indeg) badges[id] = out.has(id) ? 'out' : `in ${indeg[id]}`;
      }
      if (cur) tones[cur] = 'active';
      if (nb) tones[nb] = 'compare';
      const g = graphPanel(ids, edges, pos, true, { tones, badges, title: 'Dependencies  (badge = unmet prerequisites; removed edges fade)' }, { width: 460, height: 270 });
      const has = new Set(edges.map((e) => `${e.from}>${e.to}`));
      for (const e of g.edges) {
        e.tone = edgeTone[`${e.from}>${e.to}`];
        if (has.has(`${e.to}>${e.from}`)) e.curve = 26;
      }
      const panels: Panel[] = [g];
      if (showQueue) panels.push({ type: 'list', title: 'Queue (in-degree 0, ready to output)', orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: 'empty', items: queue.map((q) => ({ id: q, label: q, tone: 'frontier' as Tone })) });
      panels.push({ type: 'array', title: 'order', values: order, hideIndex: true });
      return panels;
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ queue: `[${queue.join(', ')}]`, out: `${order.length}/${ids.length}`, ...extra });

    for (const id of ids) indeg[id] = 0;
    r.step('init', 'Every node starts with in-degree 0', view(), vars());
    for (const node of ids) {
      for (const nb of adj[node]) {
        r.op();
        indeg[nb]++;
        r.step('count', `Edge ${node}→${nb}: ${nb} gains a prerequisite (in-degree ${indeg[nb]})`, view(node, nb), vars({ node, nb }));
      }
    }
    showQueue = true;
    for (const id of ids) if (indeg[id] === 0) queue.push(id);
    r.step('seed', `Nodes with in-degree 0 are ready: queue = [${queue.join(', ')}]`, view(), vars());
    while (queue.length) {
      const node = queue.shift()!;
      r.step('pop', `Dequeue ${node}: nothing is left that must precede it`, view(node), vars({ node }));
      order.push(node);
      out.add(node);
      r.step('emit', `Output ${node} (position ${order.length})`, view(node), vars({ node }));
      for (const nb of adj[node]) {
        r.op();
        indeg[nb]--;
        edgeTone[`${node}>${nb}`] = 'muted';
        r.step('dec', `Remove edge ${node}→${nb}: ${nb} now has in-degree ${indeg[nb]}`, view(node, nb), vars({ node, nb }));
        if (indeg[nb] === 0) {
          queue.push(nb);
          r.step('push', `${nb} has no prerequisites left → enqueue`, view(node, nb), vars({ node, nb }));
        }
      }
    }
    if (order.length === ids.length) {
      r.step('done', `All ${ids.length} nodes output: ${order.join(' → ')}`, view(), vars({ result: order.join(',') }));
      return { frames: r.frames, result: order };
    }
    const stuck = ids.filter((i) => !out.has(i));
    const g = view();
    const gp = g[0];
    if (gp.type === 'graph') for (const n of gp.nodes) if (stuck.includes(n.id)) n.tone = 'error';
    r.step('done', `Only ${order.length} of ${ids.length} output → a cycle blocks ${stuck.join(', ')}`, g, vars({ result: '[]' }));
    return { frames: r.frames, result: [] };
  },
  reference({ edges }) {
    const ids = nodeIds(edges);
    const inCount = new Map<string, number>(ids.map((i) => [i, 0]));
    const outs = new Map<string, string[]>(ids.map((i) => [i, []]));
    for (const e of [...new Map(edges.map((x) => [`${x.from}>${x.to}`, x])).values()]) {
      outs.get(e.from)!.push(e.to);
      inCount.set(e.to, inCount.get(e.to)! + 1);
    }
    for (const v of outs.values()) v.sort();
    const q = ids.filter((i) => inCount.get(i) === 0);
    for (let h = 0; h < q.length; h++) {
      for (const nb of outs.get(q[h])!) {
        inCount.set(nb, inCount.get(nb)! - 1);
        if (inCount.get(nb) === 0) q.push(nb);
      }
    }
    return q.length === ids.length ? q : [];
  },
};

const tests = [
  { args: [4, [[0, 1], [0, 2], [1, 3], [2, 3]]], expected: [0, 1, 2, 3], name: 'diamond' },
  { args: [3, [[0, 1], [1, 2], [2, 0]]], expected: [], name: 'cycle → empty' },
  { args: [1, []], expected: [0], name: 'single node' },
  { args: [4, [[3, 0], [3, 1], [1, 2]]], expected: [3, 0, 1, 2] },
  { args: [3, []], expected: [0, 1, 2], name: 'no edges' },
  { args: [5, [[4, 0], [4, 1], [0, 2], [1, 2], [2, 3]]], expected: [4, 0, 1, 2, 3] },
  { args: [4, [[0, 1], [1, 2], [2, 1]]], expected: [], name: 'cycle in part of the graph' },
];

const unit: Unit = {
  id: 'topo-kahn',
  hook: 'Build orders, course plans, task schedulers: "do things in an order that respects dependencies" is topological sorting. Kahn\'s version is the friendliest — repeatedly output what has no prerequisites left — and it detects cycles for free.',
  predict: {
    prompt: 'Edges: A→B, B→C, C→D, D→B, D→E. You run Kahn\'s algorithm. How many nodes does it output before the queue runs dry?',
    options: ['5', '4', '1', '0'],
    answer: 2,
    explain: 'Only A starts with in-degree 0. Removing A drops B from 2 to 1 — still blocked by D. B, C, D wait on each other, and E waits for D, so the queue empties after 1 node. Output length 1 < 5 reveals the cycle.',
  },
  viz,
  deeper: {
    points: [
      'In-degree = how many prerequisites are still unmet. A node with in-degree 0 is safe to output right now.',
      'Outputting a node "removes" its outgoing edges: decrement each neighbour\'s in-degree and enqueue it the moment it reaches 0.',
      'If the output has fewer nodes than the graph, the leftover nodes sit on or behind a cycle: no valid order exists.',
      'There can be many valid orders; the queue discipline and neighbour order decide which one you get. Tests and interviewers usually accept any valid one.',
      'Level by level (process the queue in batches) gives the minimum number of parallel rounds — the "semesters" question.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V + E)' },
    pitfalls: ['Reading the in-degree before decrementing it', 'Forgetting nodes that only appear as prerequisites', 'Not checking len(order) == number of nodes', 'Building edges in the wrong direction (prerequisite → course)'],
  },
  practice: {
    language: 'python',
    fnName: 'kahn_order',
    statement: 'Nodes are 0..n-1 and each [a, b] means a must come before b. Run Kahn\'s algorithm: start the queue with all in-degree-0 nodes in increasing order, visit neighbours in edge-list order, FIFO queue. Return the order, or [] if the graph has a cycle.',
    signature: 'def kahn_order(n, edges):',
    solution: `from collections import deque

def kahn_order(n, edges):
    graph = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in edges:
        graph[a].append(b)
        @@indeg[b] += 1@@
    queue = deque(@@i for i in range(n) if indeg[i] == 0@@)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nb in graph[node]:
            indeg[nb] -= 1
            if @@indeg[nb] == 0@@:
                queue.append(nb)
    return order if @@len(order) == n@@ else []`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'kahn_order',
    statement: 'Any graph with dependencies comes back as an empty list, as if it had a cycle. Find and fix the bug.',
    buggy: `from collections import deque

def kahn_order(n, edges):
    graph = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in edges:
        graph[a].append(b)
        indeg[b] += 1
    queue = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nb in graph[node]:
            if indeg[nb] == 0:
                queue.append(nb)
            indeg[nb] -= 1
    return order if len(order) == n else []`,
    fixed: `from collections import deque

def kahn_order(n, edges):
    graph = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in edges:
        graph[a].append(b)
        indeg[b] += 1
    queue = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nb in graph[node]:
            indeg[nb] -= 1
            if indeg[nb] == 0:
                queue.append(nb)
    return order if len(order) == n else []`,
    tests,
    bugType: 'check before update',
    hint: 'For the edge 0→1 with in-degree[1] = 1, what is the value when `if indeg[nb] == 0` runs?',
    explanation: 'The zero check ran before the decrement, so a neighbour whose last prerequisite was just removed still looked blocked and was never queued. Decrement first, then test for 0.',
  },
  boss: {
    title: 'Fewest semesters',
    statement: 'Courses are numbered 1..n. Each pair [a, b] in `relations` means course a must be finished in an EARLIER semester than course b. In one semester you may take any number of courses whose prerequisites are all done. Return the minimum number of semesters needed to finish every course, or -1 if the requirements contain a cycle.',
    language: 'python',
    fnName: 'min_semesters',
    starter: `def min_semesters(n, relations):
    # your code here
    pass
`,
    solution: `from collections import deque

def min_semesters(n, relations):
    graph = {i: [] for i in range(1, n + 1)}
    indeg = {i: 0 for i in range(1, n + 1)}
    for a, b in relations:
        graph[a].append(b)
        indeg[b] += 1
    ready = [c for c in graph if indeg[c] == 0]
    done = 0
    semesters = 0
    while ready:
        semesters += 1
        nxt = []
        for course in ready:
            done += 1
            for nb in graph[course]:
                indeg[nb] -= 1
                if indeg[nb] == 0:
                    nxt.append(nb)
        ready = nxt
    return semesters if done == n else -1`,
    tests: [
      { args: [3, [[1, 3], [2, 3]]], expected: 2 },
      { args: [3, [[1, 2], [2, 3], [3, 1]]], expected: -1, name: 'circular requirements' },
      { args: [4, [[1, 2], [2, 3], [3, 4]]], expected: 4, name: 'one after another' },
      { args: [5, []], expected: 1, name: 'everything in parallel' },
      { args: [6, [[1, 2], [1, 3], [3, 4], [2, 4], [4, 5], [5, 6]]], expected: 5 },
      { args: [1, []], expected: 1, name: 'one course' },
    ],
    hints: ['This is Kahn\'s algorithm, but you count rounds: everything with in-degree 0 right now can be taken in the same semester.', 'Process the ready list as a batch, collect newly-freed courses into the next batch, and add 1 to the semester count per batch. If fewer than n courses were taken, return -1.'],
    combines: ['topo-kahn', 'bfs', 'graph-adj-list'],
  },
};

export default unit;
