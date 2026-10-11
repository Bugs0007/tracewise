import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, graphView } from '@/dsa/viz/prims';
import { MinHeap } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './alien-dictionary.py?raw';
import cases from './alien-dictionary.cases.json';

/** the real algorithm, used by reference() */
function alienOrder(words: string[]): string {
  const letters = [...new Set(words.join(''))].sort();
  const after = new Map<string, Set<string>>(letters.map((c) => [c, new Set()]));
  const indeg = new Map<string, number>(letters.map((c) => [c, 0]));
  for (let i = 0; i + 1 < words.length; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (a.length > b.length && a.startsWith(b)) return '';
    for (let j = 0; j < Math.min(a.length, b.length); j++) {
      if (a[j] !== b[j]) {
        if (!after.get(a[j])!.has(b[j])) { after.get(a[j])!.add(b[j]); indeg.set(b[j], indeg.get(b[j])! + 1); }
        break;
      }
    }
  }
  const heap = new MinHeap<string>(letters.filter((c) => indeg.get(c) === 0));
  heap.heapify();
  let out = '';
  while (heap.size) {
    const c = heap.pop();
    out += c;
    for (const m of after.get(c)!) {
      indeg.set(m, indeg.get(m)! - 1);
      if (indeg.get(m) === 0) heap.push(m);
    }
  }
  return out.length === letters.length ? out : '';
}

const viz = vizOf<{ words: string[] }>({
  id: 'alien-dictionary',
  title: 'Alien Dictionary',
  solution,
  inputs: [{ key: 'words', label: 'words in the alien dictionary order (comma separated, lowercase)', kind: 'strings', default: ['cab', 'cba', 'ba', 'bb'], maxItems: 7 }],
  presets: [
    { label: 'Partial order', input: { words: ['cab', 'cba', 'ba', 'bb'] } },
    { label: 'Chain', input: { words: ['ab', 'ac', 'bc'] } },
    { label: 'Contradiction', input: { words: ['ab', 'ba', 'ab'] } },
    { label: 'Prefix after word', input: { words: ['abc', 'ab'] } },
  ],
  validate: ({ words }) => (words.some((w) => !/^[a-z]+$/.test(w)) ? 'Words must be lowercase letters' : null),
  run({ words }) {
    const r = new TraceRecorder(solution);
    const letters = [...new Set(words.join(''))].sort();
    const after = new Map<string, Set<string>>(letters.map((c) => [c, new Set()]));
    const indeg = new Map<string, number>(letters.map((c) => [c, 0]));
    const edges: EdgeSpec[] = [];
    const tones: Record<string, Tone> = {};
    const heap = new MinHeap<string>([]);
    const order: string[] = [];
    let askedEdge = false;
    let askedHeap = false;
    let askedEnd = false;
    const view = () => [
      graphView(letters, edges, { title: 'letter order learned so far (x → y: x comes before y; badge = letters that must come first)', directed: true, layout: 'circle', size: { width: 380, height: 280 }, tones, badges: Object.fromEntries(letters.map((c) => [c, String(indeg.get(c))])) }),
      chipsView(heap.items, { title: 'heap: letters with nothing left before them (smallest first)' }),
      chipsView(order, { title: 'order so far' }),
    ];
    r.step('letters', `The alphabet has these letters: ${letters.join(' ')}. Words are listed in dictionary order, so neighbouring words reveal the order of some letters.`, view(), {});
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i];
      const b = words[i + 1];
      r.op();
      if (a.length > b.length && a.startsWith(b)) {
        r.step('prefix', `"${a}" comes before "${b}", but "${b}" is a prefix of "${a}": a longer word cannot precede its own prefix. The input is invalid.`, view(), {});
        r.step('prefixRet', 'Return "".', view(), { result: '' });
        return { frames: r.frames, result: '' };
      }
      let found = false;
      for (let j = 0; j < Math.min(a.length, b.length); j++) {
        if (a[j] !== b[j]) {
          found = true;
          if (!askedEdge) {
            askedEdge = true;
            r.step('diff', `Compare "${a}" and "${b}": the first different letters are ${a[j]} and ${b[j]}.`, view(), {});
            r.predict('edge', `"${a}" is before "${b}" and they first differ at ${a[j]} vs ${b[j]}. What do we learn?`, [`${a[j]} comes before ${b[j]} in the alphabet`, `${b[j]} comes before ${a[j]}`, 'Nothing'], 0, 'Dictionary order is decided by the first differing letter, so that pair tells us the order of those two letters. Later letters say nothing.');
          }
          if (!after.get(a[j])!.has(b[j])) {
            after.get(a[j])!.add(b[j]);
            indeg.set(b[j], indeg.get(b[j])! + 1);
            edges.push({ from: a[j], to: b[j] });
            r.step('edge', `New rule: ${a[j]} → ${b[j]} (from "${a}" before "${b}").`, view(), {});
          }
          break;
        }
      }
      if (!found) r.step('diff', `"${a}" and "${b}" share all letters of the shorter word: no new rule.`, view(), {});
    }
    for (const c of letters) if (indeg.get(c) === 0) { heap.items.push(c); tones[c] = 'frontier'; }
    heap.heapify();
    r.step('seed', `Letters with no incoming rule can come first: ${heap.items.join(', ') || 'none'}.`, view(), {});
    if (!askedHeap) {
      askedHeap = true;
      r.predict('heap', 'Several letters could come next. How does this solution choose between them?', ['It takes the alphabetically smallest (a min-heap), so the answer is deterministic', 'It picks randomly', 'It takes the largest'], 0, 'Any valid order is acceptable; using a min-heap just makes the result reproducible.');
    }
    while (heap.size) {
      r.op();
      const ch = heap.pop();
      order.push(ch);
      tones[ch] = 'done';
      r.step('pop', `Take ${ch} next.`, view(), { ch });
      for (const nxt of after.get(ch)!) {
        indeg.set(nxt, indeg.get(nxt)! - 1);
        r.step('dec', `${nxt} now waits for ${indeg.get(nxt)} letter${indeg.get(nxt) === 1 ? '' : 's'}.`, view(), {});
        if (indeg.get(nxt) === 0) {
          heap.push(nxt);
          tones[nxt] = 'frontier';
          r.step('push', `${nxt} is ready.`, view(), {});
        }
      }
    }
    const res = order.length === letters.length ? order.join('') : '';
    if (!askedEnd) {
      askedEnd = true;
      r.predict('end', order.length === letters.length ? 'All letters were placed. What is returned?' : 'Some letters were never placed. What is returned?', order.length === letters.length ? ['The order string', 'An empty string'] : ['An empty string', 'The partial order'], 0, order.length === letters.length ? 'Every letter has a position, so the joined order is the answer.' : 'Letters on a cycle can never be placed, so the rules contradict each other: return "".');
    }
    r.step('done', res ? `The alphabet order is "${res}".` : 'The rules contradict each other (a cycle): return "".', view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ words }) {
    return alienOrder(words);
  },
});

export default problem({
  summary: 'An alien language uses the lowercase letters, but in an unknown order. You are given a list of words that is sorted according to that alphabet. Work out one valid letter order and return it as a string containing every letter that appears in the words. If the list is contradictory (no order can produce it), return an empty string.',
  example: ['["ab", "ac", "bc"]', '"abc"', '"ab" before "ac" gives b before c; "ac" before "bc" gives a before b. So the order is a, b, c.'],
  pattern: ['topo-sort', ['topo-sort', 'dfs', 'bfs', 'sorting'], 'Each pair of neighbouring words gives at most one rule about two letters: the first position where they differ. The rules form a directed graph over letters, and a valid alphabet is a topological order of it.', {
    dfs: 'DFS-based topological sort works too.',
    bfs: 'The queue/heap loop is Kahn’s algorithm, i.e. topological sort.',
    sorting: 'You cannot sort letters directly: the order is exactly what is unknown.',
  }],
  hints: [
    'What does the order of two neighbouring words tell you about the alphabet?',
    'Only the first differing letter matters. What if one word is a prefix of the other?',
    'Build edges x → y from the first differing letters. Run Kahn’s algorithm; if you cannot place every letter, or a longer word precedes its prefix, return "".',
  ],
  insight: 'Neighbouring words give edges between letters; the alphabet is a topological sort of those edges.',
  brute: 'Try every permutation of the letters and check the word list: factorial.',
  optimal: 'Edge extraction O(total letters) plus topological sort O(V + E).',
  walk: ['Collect the letters; prepare after[x] and indegree.', 'For each adjacent pair, return "" if a longer word precedes its prefix; otherwise add the edge for the first differing letters.', 'Run Kahn’s algorithm (a min-heap makes the choice deterministic).', 'Return the joined order if it contains all letters, else "".'],
  edge: ['Words that are prefixes of each other.', 'A single word (no constraints).', 'Contradictory rules.', 'Duplicate words.'],
  works: ['Every rule is forced by the input, and Kahn’s algorithm outputs an order consistent with all rules whenever one exists.', 'A cycle means no consistent alphabet exists, and Kahn’s algorithm cannot place those letters.'],
  time: ['O(C + E)', 'C = total characters, E ≤ 25 · 25 rules.'],
  space: ['O(1)', 'At most 26 letters and 26 × 26 edges.'],
  solution,
  cases,
  sig: 'def alien_order(words):\n    # words are sorted in the alien alphabet; return one valid letter order as a string, or ""\n    pass\n',
  viz,
  fromArgs: ([words]) => ({ words }),
});
