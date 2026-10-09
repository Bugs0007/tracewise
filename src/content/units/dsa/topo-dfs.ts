import { Recorder } from '@/engine/recorder';
import { graphPanel, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { dagLayout, list, nodeIds, outAdj, setStr } from '@/content/lib/graphs';

const code = `
def topo_sort(graph):
    visited = set()                        #@init
    finish = []

    def dfs(node):
        visited.add(node)                  #@mark
        for nb in graph[node]:             #@scan
            if nb not in visited:          #@check
                dfs(nb)                    #@recurse
        finish.append(node)                #@post

    for node in graph:                     #@outer
        if node not in visited:
            dfs(node)                      #@start
    return finish[::-1]                    #@done
`;

interface In {
  edges: EdgeSpec[];
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)$/)!;
    return { from: m[1], to: m[2] };
  });

function hasCycle(ids: string[], adj: Record<string, string[]>): boolean {
  const state: Record<string, number> = {};
  const go = (u: string): boolean => {
    state[u] = 1;
    for (const v of adj[u]) {
      if (state[v] === 1) return true;
      if (!state[v] && go(v)) return true;
    }
    state[u] = 2;
    return false;
  };
  return ids.some((i) => !state[i] && go(i));
}

const viz: VizDef<In> = {
  id: 'topo-dfs',
  title: 'Topological sort (DFS post-order)',
  code,
  language: 'python',
  inputs: [{ key: 'edges', label: 'Directed edges, no cycles (A-B means A before B)', kind: 'edges', default: E('A-B, A-C, B-D, C-D, D-E, F-C'), maxItems: 12 }],
  presets: [
    { label: 'Dependencies', input: { edges: E('A-B, A-C, B-D, C-D, D-E, F-C') } },
    { label: 'Order matters', input: { edges: E('A-B, A-C, C-B') } },
    { label: 'Two separate parts', input: { edges: E('A-B, C-D') } },
    { label: 'Straight chain', input: { edges: E('A-B, B-C, C-D') } },
  ],
  run({ edges }) {
    if (!edges.length) throw new Error('Add at least one directed edge, like A-B');
    const ids = nodeIds(edges);
    const adj = outAdj(ids, edges);
    if (hasCycle(ids, adj)) throw new Error('This graph has a cycle, so no topological order exists. Remove an edge (see the Cycle detection unit).');
    const r = new Recorder(code);
    const pos = dagLayout(ids, edges, 460, 270);
    const visited = new Set<string>();
    const finished = new Set<string>();
    const stack: string[] = [];
    const finish: string[] = [];
    const edgeTone: Record<string, Tone> = {};
    let reversed: string[] | null = null;

    const view = (cur?: string, nb?: string): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (const id of ids) tones[id] = finished.has(id) ? 'done' : visited.has(id) ? 'frontier' : 'default';
      finish.forEach((id, i) => (badges[id] = `done #${i + 1}`));
      if (cur) tones[cur] = 'active';
      if (nb) tones[nb] = visited.has(nb) ? 'muted' : 'compare';
      const g = graphPanel(ids, edges, pos, true, { tones, badges, title: 'Dependencies  (badge = finishing order)' }, { width: 460, height: 270 });
      for (const e of g.edges) e.tone = edgeTone[`${e.from}>${e.to}`];
      const panels: Panel[] = [
        g,
        { type: 'list', title: 'Call stack', orientation: 'vertical', endLabel: 'top', emptyText: 'empty', items: stack.map((s, i) => ({ id: `${i}:${s}`, label: `dfs(${s})`, tone: (i === stack.length - 1 ? 'active' : 'frontier') as Tone })) },
        { type: 'array', title: 'finish (appended when a node is completely done)', values: finish, hideIndex: true, tones: Object.fromEntries(finish.map((_, i) => [i, reversed ? 'muted' : i === finish.length - 1 ? 'new' : 'done'])) as Record<number, Tone> },
      ];
      if (reversed) panels.push({ type: 'array', title: 'finish[::-1]  = topological order', values: reversed, hideIndex: true, tones: Object.fromEntries(reversed.map((_, i) => [i, 'found'])) as Record<number, Tone> });
      return panels;
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ visited: setStr(visited), finish: list(finish), ...extra });

    r.step('init', 'Empty visited set and an empty finish list', view(), vars());
    const dfs = (node: string) => {
      r.op();
      visited.add(node);
      stack.push(node);
      r.step('mark', `Enter ${node}: mark it visited`, view(node), vars({ node }));
      for (const nb of adj[node]) {
        if (visited.has(nb)) {
          edgeTone[`${node}>${nb}`] = 'muted';
          r.step('check', `${nb} is already visited → skip edge ${node}→${nb}`, view(node, nb), vars({ node, nb }));
          continue;
        }
        r.step('check', `${nb} is new → dive into it before finishing ${node}`, view(node, nb), vars({ node, nb }));
        edgeTone[`${node}>${nb}`] = 'active';
        r.step('recurse', `dfs(${nb}) from ${node}`, view(node, nb), vars({ node, nb }));
        dfs(nb);
        edgeTone[`${node}>${nb}`] = 'visited';
      }
      finished.add(node);
      finish.push(node);
      r.step('post', `${node}'s descendants are all done → append it to finish (position ${finish.length})`, view(node), vars({ node }));
      stack.pop();
    };
    for (const node of ids) {
      if (visited.has(node)) continue;
      r.step('outer', `${node} is not visited yet → start a DFS here`, view(node), vars({ node }));
      dfs(node);
    }
    reversed = [...finish].reverse();
    r.step('done', `Reverse the finish list: ${reversed.join(' → ')}`, view(), vars({ result: reversed.join(',') }));
    return { frames: r.frames, result: reversed };
  },
  reference({ edges }) {
    const ids = nodeIds(edges);
    const adj = outAdj(ids, edges);
    const seen = new Set<string>();
    const post: string[] = [];
    for (const s of ids) {
      if (seen.has(s)) continue;
      seen.add(s);
      const st: [string, number][] = [[s, 0]];
      while (st.length) {
        const top = st[st.length - 1];
        if (top[1] < adj[top[0]].length) {
          const nb = adj[top[0]][top[1]++];
          if (!seen.has(nb)) {
            seen.add(nb);
            st.push([nb, 0]);
          }
        } else {
          post.push(top[0]);
          st.pop();
        }
      }
    }
    return post.reverse();
  },
};

const tests = [
  { args: [{ A: ['B', 'C'], B: ['D'], C: ['D'], D: [] }], expected: ['A', 'C', 'B', 'D'], name: 'diamond' },
  { args: [{ A: ['B'], B: ['C'], C: [] }], expected: ['A', 'B', 'C'], name: 'chain' },
  { args: [{ X: [] }], expected: ['X'], name: 'single node' },
  { args: [{ A: [], B: [], C: [] }], expected: ['C', 'B', 'A'], name: 'no edges: every node finishes alone' },
  { args: [{ A: ['C'], B: ['C'], C: ['D'], D: [] }], expected: ['B', 'A', 'C', 'D'], name: 'two sources' },
];

const unit: Unit = {
  id: 'topo-dfs',
  hook: 'The second way to topologically sort is a beautiful trick: run a normal DFS, record each node when it FINISHES, then reverse. Interviewers use it to see whether you understand what post-order really means.',
  predict: {
    prompt: 'Edges: A→B, A→C, C→B (so C must come before B). DFS starts at A and tries B before C. Appending nodes as they finish and reversing, which order do you get?',
    options: ['A, B, C', 'A, C, B', 'B, C, A', 'C, A, B'],
    answer: 1,
    explain: 'DFS finishes B first (it has no neighbours), then C (its only neighbour B is already done), then A. finish = [B, C, A]; reversed it is A, C, B — and C does come before B. The tempting "A, B, C" visits in the wrong order.',
  },
  viz,
  deeper: {
    points: [
      'A node finishes only after everything it points to has finished. So every node finishes AFTER all its dependants — reversing the finish list puts it BEFORE them.',
      'Appending on entry (pre-order) does not work: it records when you first see a node, not when its dependants are settled.',
      'Run the outer loop over every node so separate parts of the graph are also included.',
      'This version assumes a DAG. With a cycle there is no valid order; add white/gray/black colouring to detect it (the visualizer rejects cyclic input).',
      'Recursion depth can reach V; for long chains use an explicit stack or raise the recursion limit.',
    ],
    complexity: { time: 'O(V + E)', space: 'O(V)' },
    pitfalls: ['Appending before the recursive calls (pre-order)', 'Forgetting to reverse the list', 'Starting only from node 0 and missing other components', 'Not detecting cycles when the input is not guaranteed to be a DAG'],
  },
  practice: {
    language: 'python',
    fnName: 'topo_dfs',
    statement: '`graph` maps each node to the nodes that must come AFTER it (a DAG). Run a DFS from every unvisited node (dict order, neighbours in list order), record nodes as they finish, and return the reversed finishing order.',
    signature: 'def topo_dfs(graph):',
    solution: `def topo_dfs(graph):
    visited = set()
    finish = []

    def dfs(node):
        @@visited.add(node)@@
        for nb in graph[node]:
            if @@nb not in visited@@:
                dfs(nb)
        @@finish.append(node)@@

    for node in graph:
        if node not in visited:
            dfs(node)
    return @@finish[::-1]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'topo_dfs',
    statement: 'The order sometimes puts a task before something it depends on. Find and fix the bug.',
    buggy: `def topo_dfs(graph):
    visited = set()
    finish = []

    def dfs(node):
        visited.add(node)
        finish.append(node)
        for nb in graph[node]:
            if nb not in visited:
                dfs(nb)

    for node in graph:
        if node not in visited:
            dfs(node)
    return finish[::-1]`,
    fixed: `def topo_dfs(graph):
    visited = set()
    finish = []

    def dfs(node):
        visited.add(node)
        for nb in graph[node]:
            if nb not in visited:
                dfs(nb)
        finish.append(node)

    for node in graph:
        if node not in visited:
            dfs(node)
    return finish[::-1]`,
    tests,
    bugType: 'pre-order instead of post-order',
    hint: 'On the diamond A→B, A→C, B→D, C→D, when does D get appended compared with C?',
    explanation: 'The node was appended when DFS entered it, not when it finished. Reversing a pre-order list does not respect dependencies. Move the append after the loop over neighbours so it happens in post-order.',
  },
  boss: {
    title: 'Alien alphabet',
    statement: 'A list of words is sorted according to an unknown alphabet. Compare each pair of neighbouring words: the first position where they differ tells you that the letter from the first word comes before the letter from the second. Return a string of every letter that occurs, in an order consistent with those facts. Return "" if the facts contradict each other (a cycle, or a longer word that comes before its own prefix). Test inputs have exactly one valid answer.',
    language: 'python',
    fnName: 'alien_order',
    starter: `def alien_order(words):
    # your code here
    pass
`,
    solution: `def alien_order(words):
    graph = {ch: [] for w in words for ch in w}
    for w1, w2 in zip(words, words[1:]):
        if len(w1) > len(w2) and w1.startswith(w2):
            return ""
        for a, b in zip(w1, w2):
            if a != b:
                graph[a].append(b)
                break
    state = {}
    out = []

    def dfs(ch):
        state[ch] = 1
        for nb in graph[ch]:
            if state.get(nb) == 1:
                return False
            if nb not in state and not dfs(nb):
                return False
        state[ch] = 2
        out.append(ch)
        return True

    for ch in graph:
        if ch not in state and not dfs(ch):
            return ""
    return "".join(reversed(out))`,
    tests: [
      { args: [['wrt', 'wrf', 'er', 'ett', 'rftt']], expected: 'wertf' },
      { args: [['z', 'x']], expected: 'zx' },
      { args: [['z', 'x', 'z']], expected: '', name: 'contradiction (z<x and x<z)' },
      { args: [['abc', 'ab']], expected: '', name: 'longer word before its own prefix' },
      { args: [['a']], expected: 'a', name: 'a single word' },
      { args: [['ba', 'bc', 'ac', 'ab']], expected: '', name: 'three-letter loop' },
    ],
    hints: ['Each adjacent pair of words gives at most one rule "x before y": an edge x→y between the first differing letters. Then it is a topological sort of letters.', 'Create a node for every letter first. Return "" for the prefix case, DFS with a colour state to catch cycles, append letters on finish, and join the reversed list.'],
    combines: ['topo-dfs', 'dfs', 'cycle-detection', 'graph-adj-list'],
  },
};

export default unit;
