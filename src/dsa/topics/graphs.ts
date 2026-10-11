import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A graph is a set of nodes joined by edges. Grids, maps, dependency lists, networks of friends and word ladders are all graphs in disguise. Almost every graph problem is one of four things: explore everything reachable (DFS or BFS), find the shortest path with equal costs (BFS), order things by dependencies (topological sort), or track which nodes are connected (union-find).',
    'On a grid the neighbours of (r, c) are the four cells around it; check bounds before using them. Keep a "seen" set so you never visit a cell twice, and mark a node as seen when you queue it so it is queued once. For BFS the queue gives levels, and a level is one step of distance.',
    'To count groups, scan every node and start a fill each time you meet an unseen one. To go outwards from many sources at once (every gate, every rotten orange, every border cell) push all of them into the queue (or stack) before you begin.',
  ],
  checklist: [
    'The input is a grid, a list of edges, a list of dependencies, or words related by small changes.',
    'You must visit everything connected to a start: DFS or BFS flood fill.',
    'You want the shortest path where every move costs the same: BFS (use many sources if there are many starts).',
    'Items depend on each other and you need an order or a cycle check: topological sort (Kahn) or DFS with colours.',
    'You must group nodes or detect a cycle in an undirected graph while edges arrive: union-find.',
    'You need a copy of a structure with cycles: a map from original to copy, filled before recursing.',
    'Working backwards from the targets (borders, oceans) is easier than from every start.',
  ],
  template: [
    {
      title: 'Flood fill on a grid (DFS)',
      code: `def dfs(r, c):
    if not (0 <= r < rows and 0 <= c < cols) or grid[r][c] == 0 or (r, c) in seen:
        return
    seen.add((r, c))
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        dfs(r + dr, c + dc)`,
    },
    {
      title: 'BFS, levels = distance (multi-source)',
      code: `from collections import deque
queue = deque(all_sources)
seen = set(all_sources)
dist = 0
while queue:
    for _ in range(len(queue)):       # one level
        cur = queue.popleft()
        for nxt in neighbours(cur):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    dist += 1`,
    },
    {
      title: 'Kahn’s topological sort',
      code: `indegree = [0] * n
for a, b in edges: graph[a].append(b); indegree[b] += 1
queue = deque(i for i in range(n) if indegree[i] == 0)
order = []
while queue:
    cur = queue.popleft(); order.append(cur)
    for nxt in graph[cur]:
        indegree[nxt] -= 1
        if indegree[nxt] == 0: queue.append(nxt)
# len(order) < n  →  a cycle exists`,
    },
    {
      title: 'Union-find with path halving',
      code: `parent = list(range(n))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
# edge (a, b): ra, rb = find(a), find(b)
# ra == rb → a cycle / already connected;  else parent[ra] = rb`,
    },
  ],
  boss: {
    seconds: 420,
    problem: 'word-ladder',
    note: 'The boss problem is Word Ladder. Name the nodes and the edges, say why BFS gives the shortest chain, and explain how the wildcard buckets find neighbours quickly.',
    quiz: [
      {
        prompt: 'Why does BFS find the shortest path in an unweighted graph?',
        options: ['It visits nodes in order of their distance from the start', 'It tries every path', 'It uses a stack', 'It sorts the edges'],
        answer: 0,
        explain: 'The queue holds all nodes at distance d before any at d + 1, so the first time a node is reached is by a shortest path.',
      },
      {
        prompt: 'In Number of Islands, when is the count increased?',
        options: ['When a scan meets land that has not been seen, before flooding it', 'For every land cell', 'For every flood fill step', 'Once at the end'],
        answer: 0,
        explain: 'Each unvisited land cell found by the scan starts a new island; the flood marks its whole island so none of its cells count again.',
      },
      {
        prompt: 'What does a non-empty queue at the end of Kahn’s algorithm\'s counting tell you if fewer than n courses were taken?',
        options: ['There is a cycle among the remaining courses', 'The graph is a tree', 'The input is invalid', 'A course is missing'],
        answer: 0,
        explain: 'Courses on a cycle each wait for another course on the cycle, so their indegree never reaches zero.',
      },
      {
        prompt: 'When two nodes have the same root in union-find, what does that mean?',
        options: ['They are already connected, so an edge between them would form a cycle', 'They are far apart', 'The edge is directed', 'The parent array is broken'],
        answer: 0,
        explain: 'The same root means a path of earlier edges already connects them.',
      },
      {
        prompt: 'Why is the copy stored in the map before the neighbours are cloned (Clone Graph)?',
        options: ['A neighbour may lead back to this node, and the stored copy stops the recursion', 'To save memory', 'To keep neighbours sorted', 'Because Python requires it'],
        answer: 0,
        explain: 'With a cycle, the recursion returns to a node already being copied; finding its copy in the map ends it.',
      },
      {
        prompt: 'In Walls and Gates, why put all gates in the queue at the start instead of running a BFS from each room?',
        options: ['One multi-source BFS gives every room its nearest gate in a single pass', 'It makes the grid smaller', 'DFS needs it', 'It avoids walls'],
        answer: 0,
        explain: 'BFS from all gates at once reaches each room first from the closest gate.',
      },
    ],
  },
};

export default topic;
