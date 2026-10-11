import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, graphView, hashMapView, stackView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './reconstruct-itinerary.py?raw';
import cases from './reconstruct-itinerary.cases.json';

const START = 'SFO';
const parse = (t: string): [string, string] => {
  const [a, b] = t.split('-');
  return [a, b];
};

/** the real algorithm without any tracing, to check that the tickets form one trip */
function itinerary(tickets: [string, string][]): string[] {
  const g = new Map<string, string[]>();
  for (const [a, b] of tickets) g.set(a, [...(g.get(a) ?? []), b]);
  for (const v of g.values()) v.sort().reverse();
  const route: string[] = [];
  const visit = (c: string) => {
    while (g.get(c)?.length) visit(g.get(c)!.pop() as string);
    route.push(c);
  };
  visit(START);
  return route.reverse();
}

const viz = vizOf<{ tickets: string[] }>({
  id: 'reconstruct-itinerary',
  title: 'Reconstruct Itinerary',
  solution,
  inputs: [{ key: 'tickets', label: 'tickets FROM-TO (comma separated, three capital letters each; the trip starts at SFO)', kind: 'strings', default: ['SFO-LAX', 'LAX-SEA', 'SEA-SFO', 'SFO-ATL', 'ATL-SFO'], maxItems: 8 }],
  presets: [
    { label: 'Hub with two trips', input: { tickets: ['SFO-LAX', 'LAX-SEA', 'SEA-SFO', 'SFO-ATL', 'ATL-SFO'] } },
    { label: 'Dead end last', input: { tickets: ['SFO-AAA', 'SFO-BBB', 'BBB-SFO'] } },
    { label: 'Straight line', input: { tickets: ['SFO-LAX', 'LAX-SEA'] } },
    { label: 'Duplicate tickets', input: { tickets: ['SFO-AAA', 'AAA-SFO', 'SFO-AAA'] } },
  ],
  validate: ({ tickets }) => {
    if (!tickets.length) return 'Enter at least one ticket';
    if (tickets.some((t) => !/^[A-Z]{3}-[A-Z]{3}$/.test(t))) return 'Tickets look like SFO-LAX (three capital letters, a dash, three capital letters)';
    return itinerary(tickets.map(parse)).length === tickets.length + 1 ? null : 'These tickets cannot all be used in one trip starting from SFO';
  },
  run({ tickets: raw }) {
    const r = new TraceRecorder(solution);
    const tickets = raw.map(parse);
    const cities = [...new Set(tickets.flat().concat(START))].sort();
    const edges: EdgeSpec[] = tickets.map(([a, b]) => ({ from: a, to: b }));
    const graph = new Map<string, string[]>();
    const route: string[] = [];
    const stack: string[] = [];
    const tones: Record<string, Tone> = {};
    const used = new Set<string>();
    let askedSmall = false;
    let askedAppend = false;
    let askedRev = false;
    const view = () => [
      graphView(cities, edges, { title: 'tickets (green = used)', directed: true, layout: 'circle', size: { width: 380, height: 280 }, tones, edgeTones: Object.fromEntries([...used].map((k) => [k, 'found' as Tone])) }),
      hashMapView(Object.fromEntries([...graph.entries()].map(([c, v]) => [c, v.length ? `${[...v].reverse().join(', ')}  (next = last in list)` : '—'])), { title: 'unused tickets per city, smallest destination is popped first' }),
      stackView(stack, { title: 'recursion: cities being visited' }),
      chipsView(route, { title: 'route built so far (it comes out backwards)' }),
    ];
    for (const [a, b] of tickets) graph.set(a, [...(graph.get(a) ?? []), b]);
    r.step('graph', 'Group the tickets by departure city: city → list of destinations.', view(), {});
    for (const v of graph.values()) v.sort().reverse();
    r.step('sort', 'Sort each list in REVERSE alphabetical order. Then pop() from the end gives the smallest destination first.', view(), {});
    const visit = (city: string) => {
      r.op();
      stack.push(city);
      tones[city] = 'active';
      r.step('def', `visit(${city}).`, view(), { city });
      while (graph.get(city)?.length) {
        const next = graph.get(city)![graph.get(city)!.length - 1];
        if (!askedSmall) {
          askedSmall = true;
          r.predict('smallest', `From ${city} the unused destinations are ${[...graph.get(city)!].reverse().join(', ')}. Which ticket is used next?`, [`${next}, the alphabetically smallest`, `${graph.get(city)![0]}, the largest`, 'The first one that appeared in the input'], 0, 'The list is sorted in reverse, so pop() removes the smallest name: this builds the lexically smallest trip.');
        }
        graph.get(city)!.pop();
        used.add(`${city}>${next}`);
        r.step('recurse', `Use the ticket ${city} → ${next} and visit ${next}.`, view(), {});
        visit(next);
      }
      stack.pop();
      if (!askedAppend) {
        askedAppend = true;
        r.predict('append', `${city} has no unused tickets left. What do we do?`, ['Append it to the route and return to the caller', 'Throw the ticket back', 'Stop everything'], 0, 'A city is added only when it is stuck. Cities that are visited later in the trip are therefore added first, which is why the route is reversed at the end.');
      }
      route.push(city);
      tones[city] = 'done';
      r.step('append', `Stuck at ${city}: add it to the route.`, view(), { route: route.join(' ') });
    };
    visit(START);
    const res = [...route].reverse();
    if (!askedRev) {
      askedRev = true;
      r.predict('rev', 'The route was built from the end of the trip backwards. What is returned?', ['The route reversed', 'The route as built', 'The route sorted'], 0, 'Reversing puts the cities in the order they are flown.');
    }
    r.step('done', `Reverse the route: ${res.join(' → ')}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ tickets }) {
    return itinerary(tickets.map(parse));
  },
});

export default problem({
  summary: 'You have a list of one-way plane tickets [from, to]. Use every ticket exactly once to make one trip that starts at the airport "SFO". If several trips are possible, return the one that is smallest in alphabetical order, comparing airport names from left to right. It is guaranteed that at least one trip exists.',
  example: ['[SFO→BBB, SFO→AAA, AAA→SFO]', '[SFO, AAA, SFO, BBB]', 'From SFO the smaller name AAA is tried first and flies back to SFO, so BBB is the final stop.'],
  pattern: ['dfs', ['dfs', 'backtracking', 'heap', 'topo-sort'], 'Using every ticket exactly once is an Eulerian path. Hierholzer’s algorithm: keep walking along unused tickets (smallest destination first); a city that is stuck is added to the route, and the route is read backwards.', {
    backtracking: 'Trying every order of tickets with undo works but is exponential; Hierholzer finds the path in linear time.',
    heap: 'A heap per city can supply the smallest destination, but a sorted list with pop() is enough.',
    'topo-sort': 'The graph has cycles; this is not a dependency order.',
  }],
  hints: [
    'You must use every ticket exactly once. What is that kind of path called?',
    'A greedy walk can get stuck at a dead end before every ticket is used. In which order should the stuck cities be recorded?',
    'Sort destinations in reverse and pop() the smallest. dfs(city): while it has tickets, dfs(next); then append the city. Return the route reversed.',
  ],
  insight: 'Add a city to the route only when it has no tickets left; the finished route, reversed, is a valid trip that uses everything, and smallest-first gives the lexically smallest one.',
  brute: 'Backtracking over ticket orders: exponential.',
  optimal: 'Hierholzer’s algorithm: O(E log E) because of the sorting.',
  walk: ['Group tickets into graph[src] = [dst, …] and sort each list in reverse.', 'visit(city): while graph[city] is non-empty, visit(graph[city].pop()).', 'After the loop append city to route.', 'Call visit("SFO") and return route reversed.'],
  edge: ['A trip that must return to the start and leave again.', 'A dead end that has to be visited last.', 'Duplicate tickets.', 'A single ticket.'],
  works: ['Following unused tickets until stuck, then splicing the remaining loops in while backing out, uses every ticket once.', 'The dead end (the final destination) is appended first and so ends up last after the reversal.'],
  time: ['O(E log E)', 'Sorting dominates; the walk is linear.'],
  space: ['O(E)', 'The graph and the route.'],
  solution,
  cases,
  sig: 'def find_itinerary(tickets):\n    # tickets is a list of [from, to]; the trip starts at "SFO"; return the list of airports in order (smallest alphabetical trip)\n    pass\n',
  viz,
  fromArgs: ([tickets]) => ({ tickets: (tickets as string[][]).map(([a, b]) => `${a}-${b}`) }),
});
