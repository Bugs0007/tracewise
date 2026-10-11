import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Once edges have different costs, breadth-first search is no longer enough: the path with the fewest edges is not the cheapest one. This topic covers the standard tools for weighted graphs: Dijkstra for cheapest routes, Bellman-Ford when the number of edges is limited, and minimum spanning trees (Prim or Kruskal) when the goal is to connect everything as cheaply as possible.',
    'Dijkstra is BFS with a heap: always settle the unsettled node with the smallest known distance, push the distances through it to its neighbours, and ignore stale heap entries. It needs non-negative weights. The same idea works with other "costs": a maximum instead of a sum for the highest point on a route, or a time instead of a price.',
    'Whenever the problem hides a constraint such as "at most k stops", make it part of the state or run one round per allowed step. And remember that ordering problems on a directed graph (a dictionary of unknown letters) are still topological sorts.',
  ],
  checklist: [
    'Edges have different costs and you need the cheapest route: Dijkstra with a heap.',
    'The route length is limited (at most k flights): Bellman-Ford with k + 1 rounds, writing to a copy.',
    'You must connect all nodes with the least total cost: minimum spanning tree (Prim with a heap, or Kruskal with union-find).',
    'The cost of a route is its worst edge or highest cell rather than a sum: Dijkstra with max in place of +.',
    'You must use every edge exactly once: Hierholzer’s algorithm (an Eulerian path), recording a node when it is stuck.',
    'Rules come from comparing neighbours (the order of letters, tasks): build the graph, then topologically sort.',
  ],
  template: [
    {
      title: 'Dijkstra with a heap',
      code: `import heapq
heap, dist = [(0, start)], {}
while heap:
    d, node = heapq.heappop(heap)
    if node in dist:
        continue                      # stale entry
    dist[node] = d
    for nxt, w in graph[node]:
        if nxt not in dist:
            heapq.heappush(heap, (d + w, nxt))`,
    },
    {
      title: 'Prim’s minimum spanning tree',
      code: `heap, in_tree, total = [(0, 0)], set(), 0
while len(in_tree) < n:
    cost, i = heapq.heappop(heap)
    if i in in_tree:
        continue
    in_tree.add(i); total += cost
    for cost2, j in edges_from(i):
        if j not in in_tree:
            heapq.heappush(heap, (cost2, j))`,
    },
    {
      title: 'Bellman-Ford limited to k + 1 edges',
      code: `prices = [INF] * n; prices[src] = 0
for _ in range(k + 1):
    nxt = prices[:]                   # read old, write new
    for u, v, w in flights:
        if prices[u] + w < nxt[v]:
            nxt[v] = prices[u] + w
    prices = nxt`,
    },
  ],
  boss: {
    seconds: 420,
    problem: 'cheapest-flights-within-k-stops',
    note: 'The boss problem is Cheapest Flights Within K Stops. Say why plain Dijkstra is not enough, what each round of Bellman-Ford means, and why you write into a copy.',
    quiz: [
      {
        prompt: 'Why does Dijkstra need non-negative edge weights?',
        options: ['A settled node’s distance must never be improved by a longer-looking path later', 'Heaps cannot store negatives', 'Python forbids it', 'It makes the code shorter'],
        answer: 0,
        explain: 'With a negative edge a later path could beat a distance that was already declared final.',
      },
      {
        prompt: 'In Dijkstra with a heap, what is a "stale" entry and what do you do with it?',
        options: ['An entry for a node that is already settled; skip it', 'An entry with a negative distance; delete it', 'The newest entry; keep it', 'A duplicate edge; merge it'],
        answer: 0,
        explain: 'A node can be pushed several times with different distances; only the first pop is final.',
      },
      {
        prompt: 'What does Prim’s algorithm always add next?',
        options: ['The cheapest edge from the connected group to a point outside it', 'The globally cheapest edge', 'The longest edge', 'A random edge'],
        answer: 0,
        explain: 'The cheapest edge crossing the cut between the group and the rest is always part of a minimum spanning tree.',
      },
      {
        prompt: 'In Bellman-Ford with a stop limit, why write into a copy of the prices?',
        options: ['So each round adds exactly one flight', 'To save memory', 'To keep the input unchanged', 'Python lists are immutable'],
        answer: 0,
        explain: 'Updating in place could chain several flights within a single round and exceed the stop limit.',
      },
      {
        prompt: 'In Reconstruct Itinerary, when is a city added to the route?',
        options: ['When it has no unused tickets left (it is stuck)', 'When it is first visited', 'When a ticket is used', 'Alphabetically'],
        answer: 0,
        explain: 'Adding cities on the way back out and reversing at the end splices every loop into the trip.',
      },
    ],
  },
};

export default topic;
