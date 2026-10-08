import { Recorder } from '@/engine/recorder';
import { graphPanel, layeredLayout, edgeKey, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { adjacency } from '@/content/lib/graph';
import { assertNode, list, setStr } from '@/content/lib/graphs';

const code = `
def dfs(graph, start):
    visited = set()                       #@init
    order = []

    def visit(node):                      #@def
        visited.add(node)                 #@mark
        order.append(node)                #@visit
        for nb in graph[node]:            #@scan
            if nb not in visited:         #@check
                visit(nb)                 #@recurse
        # no neighbours left: return to the caller   #@back

    visit(start)                          #@call
    return order                          #@done
`;

interface In {
  edges: EdgeSpec[];
  start: string;
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)$/)!;
    return { from: m[1], to: m[2] };
  });

const viz: VizDef<In> = {
  id: 'dfs',
  title: 'Depth-first search',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Edges (undirected)', kind: 'edges', default: E('A-B, A-C, B-D, B-E, C-F, E-F, F-G'), maxItems: 12 },
    { key: 'start', label: 'Start', kind: 'string', default: 'A', maxItems: 3 },
  ],
  presets: [
    { label: 'Tree', input: { edges: E('A-B, A-C, B-D, B-E, C-F'), start: 'A' } },
    { label: 'Diamond (revisit)', input: { edges: E('A-B, A-C, B-D, C-D'), start: 'A' } },
    { label: 'Disconnected', input: { edges: E('A-B, B-C, X-Y'), start: 'A' } },
    { label: 'Long path', input: { edges: E('A-B, B-C, C-D, D-E'), start: 'A' } },
  ],
  run({ edges, start }) {
    const r = new Recorder(code);
    const { ids, adj } = adjacency(edges);
    assertNode(ids, start);
    const pos = layeredLayout([start, ...ids.filter((i) => i !== start)], edges, 460, 280);
    const visited = new Set<string>();
    const finished = new Set<string>();
    const disc: Record<string, number> = {};
    const fin: Record<string, number> = {};
    const stack: string[] = [];
    const order: string[] = [];
    const tree: [string, string][] = [];
    let clock = 0;

    const view = (cur?: string, nb?: string, edgeTone?: Tone): Panel[] => {
      const tones: Record<string, Tone> = {};
      for (const id of ids) tones[id] = finished.has(id) ? 'done' : visited.has(id) ? 'frontier' : 'default';
      if (cur) tones[cur] = 'active';
      if (nb) tones[nb] = visited.has(nb) ? 'muted' : 'compare';
      const edgeTones: Record<string, Tone> = {};
      for (const [a, b] of tree) edgeTones[edgeKey(a, b, false)] = 'path';
      if (cur && nb) edgeTones[edgeKey(cur, nb, false)] = edgeTone ?? 'compare';
      const badges: Record<string, string> = {};
      for (const id of order) badges[id] = fin[id] !== undefined ? `${disc[id]}/${fin[id]}` : `#${disc[id]}`;
      return [
        graphPanel(ids, edges, pos, false, { tones, badges, edgeTones, title: 'Graph  (badge = discovered #, or discovered/finished)' }, { width: 460, height: 280 }),
        { type: 'list', title: 'Call stack', orientation: 'vertical', endLabel: 'top', items: stack.map((s, i) => ({ id: `${i}:${s}`, label: `visit(${s})`, tone: (i === stack.length - 1 ? 'active' : 'frontier') as Tone })), emptyText: 'empty' },
        { type: 'array', title: 'order', values: order, hideIndex: true },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ visited: setStr(visited), stack: list(stack), ...extra });

    r.step('init', 'Nothing visited yet — an empty set will guard against cycles', view(), vars());
    const visit = (node: string, from?: string) => {
      stack.push(node);
      r.step('def', from ? `Call visit(${node}) — push a frame on the call stack` : `Call visit(${node}) to begin`, view(node), vars({ node }));
      visited.add(node);
      clock++;
      r.step('mark', `Mark ${node} visited so no deeper call re-enters it`, view(node), vars({ node }));
      order.push(node);
      disc[node] = clock;
      r.step('visit', `${node} is discovered #${disc[node]} — record it in the order`, view(node), vars({ node }));
      for (const nb of adj[node]) {
        r.op();
        if (visited.has(nb)) {
          r.step('check', `${nb} already visited → skip${nb === from ? ' (the way we came)' : ' (a loop back)'}`, view(node, nb, 'muted'), vars({ node, nb }));
          continue;
        }
        r.step('check', `${nb} is new → go deeper`, view(node, nb), vars({ node, nb }));
        tree.push([node, nb]);
        r.step('recurse', `visit(${nb}) from ${node}: dive in before looking at ${node}'s other neighbours`, view(node, nb, 'active'), vars({ node, nb }));
        visit(nb, node);
        r.step('scan', `Back in ${node}: continue with its next neighbour`, view(node), vars({ node }));
      }
      finished.add(node);
      clock++;
      fin[node] = clock;
      r.step('back', from ? `${node} has no new neighbours → backtrack to ${from}` : `${node} is fully explored → the whole search is done`, view(node), vars({ node }));
      stack.pop();
    };
    visit(start);
    r.step('call', `visit(${start}) returned — the stack is empty`, view(), vars());
    r.step('done', `DFS order: ${order.join(' → ')}`, view(), vars({ order: order.join(',') }));
    return { frames: r.frames, result: order };
  },
  reference({ edges, start }) {
    const { adj } = adjacency(edges);
    const seen = new Set([start]);
    const out = [start];
    const st: [string, number][] = [[start, 0]];
    while (st.length) {
      const top = st[st.length - 1];
      const nbs = adj[top[0]];
      if (top[1] >= nbs.length) {
        st.pop();
        continue;
      }
      const nb = nbs[top[1]++];
      if (!seen.has(nb)) {
        seen.add(nb);
        out.push(nb);
        st.push([nb, 0]);
      }
    }
    return out;
  },
};

const g1 = { A: ['B', 'C'], B: ['A', 'D', 'E'], C: ['A', 'F'], D: ['B'], E: ['B', 'F'], F: ['C', 'E'] };
const diamond = { A: ['B', 'C'], B: ['D'], C: ['D'], D: [] };
const tests = [
  { args: [g1, 'A'], expected: ['A', 'B', 'D', 'E', 'F', 'C'] },
  { args: [diamond, 'A'], expected: ['A', 'B', 'D', 'C'], name: 'diamond: dives before widening' },
  { args: [{ A: ['B'], B: ['A'], C: [] }, 'A'], expected: ['A', 'B'], name: 'unreachable node' },
  { args: [{ X: [] }, 'X'], expected: ['X'], name: 'single node' },
  { args: [{ 1: ['2', '3'], 2: ['4'], 3: ['4'], 4: ['1'] }, '1'], expected: ['1', '2', '4', '3'], name: 'directed cycle' },
];

const grid = (rows: string[]) => rows;

const unit: Unit = {
  id: 'dfs',
  hook: 'DFS goes as deep as it can, then backs up. It is the shape behind recursion, backtracking, flood fill, cycle checks and topological sorting — if you can trace DFS by hand, half of graph interviews open up.',
  predict: {
    prompt: 'Edges: A–B, A–C, B–D, C–D. DFS starts at A and always tries neighbours alphabetically. In what order are nodes visited?',
    options: ['A, B, C, D', 'A, B, D, C', 'A, C, B, D', 'A, C, D, B'],
    answer: 1,
    explain: 'DFS dives: A → B → D, and only then looks at the other neighbours. From D the unvisited neighbour C is found, so the order is A, B, D, C. BFS would give A, B, C, D.',
  },
  viz,
  deeper: {
    points: [
      'Recursive DFS lets the call stack remember where to resume; iterative DFS uses an explicit stack. Both visit every node once.',
      'The visited set is what stops infinite loops on cycles — add to it as soon as you enter a node.',
      'Discovery/finish times (the badges) are the raw material of topological sort, cycle detection and bridge finding.',
      'DFS does not find shortest paths — the first path it reaches a node by can be long and winding.',
      'Python\'s default recursion limit is about 1000 frames; a 10,000-node path graph needs an explicit stack.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V) for the visited set + recursion depth up to O(V)' },
    pitfalls: ['Marking visited after the recursive calls (infinite recursion on cycles)', 'Using DFS when the question wants the fewest steps (that is BFS)', 'Recursion depth on very long paths', 'Forgetting to start a new DFS from unvisited nodes when the graph is disconnected'],
  },
  practice: {
    language: 'python',
    fnName: 'dfs_order',
    statement: '`graph` maps each node to a list of neighbours. Return the nodes in the order a recursive DFS first visits them from `start`, trying neighbours in list order.',
    signature: 'def dfs_order(graph, start):',
    solution: `def dfs_order(graph, start):
    visited = set()
    order = []

    def visit(node):
        @@visited.add(node)@@
        @@order.append(node)@@
        for nb in graph[node]:
            if @@nb not in visited@@:
                @@visit(nb)@@

    @@visit(start)@@
    return order`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'dfs_order',
    statement: 'This DFS crashes with a recursion error on graphs that contain a cycle. Find and fix the bug.',
    buggy: `def dfs_order(graph, start):
    visited = set()
    order = []

    def visit(node):
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                visit(nb)
        visited.add(node)

    visit(start)
    return order`,
    fixed: `def dfs_order(graph, start):
    visited = set()
    order = []

    def visit(node):
        visited.add(node)
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                visit(nb)

    visit(start)
    return order`,
    tests,
    bugType: 'visited marked too late',
    hint: 'Trace A ↔ B. While visit(A) is still looping over its neighbours, is A already in `visited`?',
    explanation: 'The node was only marked after its whole subtree finished, so any path leading back to it saw it as unvisited and recursed forever. Mark a node the moment you enter it.',
  },
  boss: {
    title: 'Count the islands',
    statement: 'The map is a list of equal-length strings of "1" (land) and "0" (water). Land cells touching up, down, left or right belong to the same island (diagonals do not count). Return how many islands there are.',
    language: 'python',
    fnName: 'count_islands',
    starter: `def count_islands(grid):
    # your code here
    pass
`,
    solution: `def count_islands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = set()

    def sink(r, c):
        stack = [(r, c)]
        seen.add((r, c))
        while stack:
            cr, cc = stack.pop()
            for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1" and (nr, nc) not in seen:
                    seen.add((nr, nc))
                    stack.append((nr, nc))

    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "1" and (r, c) not in seen:
                count += 1
                sink(r, c)
    return count`,
    tests: [
      { args: [grid(['11000', '11000', '00100', '00011'])], expected: 3 },
      { args: [grid(['111', '010', '111'])], expected: 1, name: 'one big connected island' },
      { args: [grid(['000'])], expected: 0, name: 'all water' },
      { args: [grid(['1'])], expected: 1, name: 'single cell' },
      { args: [grid(['101', '010', '101'])], expected: 5, name: 'diagonals do not connect' },
    ],
    hints: ['Scan every cell. When you meet unvisited land, that is a new island — flood it with DFS so you never count it again.', 'Keep a `seen` set (or overwrite land with "0"). In the flood, check 0 <= r < rows and 0 <= c < cols BEFORE reading grid[r][c].'],
    combines: ['dfs', 'recursion-call-stack'],
  },
};

export default unit;
