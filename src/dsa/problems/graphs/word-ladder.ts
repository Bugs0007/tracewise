import type { EdgeSpec } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, graphView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './word-ladder.py?raw';
import cases from './word-ladder.cases.json';

const differByOne = (a: string, b: string) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;

const viz = vizOf<{ begin: string; end: string; words: string[] }>({
  id: 'word-ladder',
  title: 'Word Ladder',
  solution,
  inputs: [
    { key: 'begin', label: 'begin word', kind: 'string', default: 'cat', maxItems: 5 },
    { key: 'end', label: 'end word', kind: 'string', default: 'dog', maxItems: 5 },
    { key: 'words', label: 'allowed words (comma separated)', kind: 'strings', default: ['cot', 'cog', 'dog', 'bog'], maxItems: 8 },
  ],
  presets: [
    { label: 'Three changes', input: { begin: 'cat', end: 'dog', words: ['cot', 'cog', 'dog', 'bog'] } },
    { label: 'Two routes', input: { begin: 'ham', end: 'sky', words: ['hat', 'sat', 'sky', 'ham', 'sam', 'say', 'sly'] } },
    { label: 'End word missing', input: { begin: 'cat', end: 'dog', words: ['cot', 'cog', 'bog'] } },
    { label: 'No route', input: { begin: 'aaa', end: 'bbb', words: ['aab', 'bbb'] } },
  ],
  validate: ({ begin, end, words }) => {
    const all = [begin, end, ...words];
    if (all.some((w) => !/^[a-z]+$/.test(w))) return 'Use lowercase words';
    return new Set(all.map((w) => w.length)).size === 1 ? null : 'All words need the same length';
  },
  run({ begin, end, words }) {
    const r = new TraceRecorder(solution);
    const allowed = new Set(words);
    const nodes = [...new Set([...allowed, begin])].sort();
    const edges: EdgeSpec[] = [];
    nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => differByOne(a, b) && edges.push({ from: a, to: b })));
    const tones: Record<string, Tone> = {};
    const queue: [string, number][] = [];
    const seen = new Set<string>();
    let focus: Record<string, string> = {};
    const view = () => [
      graphView(nodes, edges, { title: 'words (an edge joins words that differ in exactly one letter)', layout: 'circle', size: { width: 400, height: 300 }, tones: { ...tones, [end]: tones[end] ?? 'frontier' }, badges: Object.fromEntries(queue.map(([w, s]) => [w, String(s)])) }),
      chipsView(queue.map(([w, s]) => `${w} (${s})`), { title: 'queue (word, words in the chain so far)', startLabel: 'front', endLabel: 'back' }),
      ...(Object.keys(focus).length ? [hashMapView(focus, { title: 'patterns of the current word → words that share them' })] : []),
    ];
    if (!allowed.has(end)) {
      r.step(undefined, `The end word "${end}" is not in the allowed list, so no ladder can ever finish: return 0.`, view(), { result: 0 });
      r.step('fail', 'Nothing to search.', view(), { result: 0 });
      return { frames: r.frames, result: 0 };
    }
    const buckets = new Map<string, string[]>();
    for (const w of nodes) {
      for (let i = 0; i < w.length; i++) {
        const p = w.slice(0, i) + '*' + w.slice(i + 1);
        buckets.set(p, [...(buckets.get(p) ?? []), w]);
      }
    }
    r.step('buckets', `Group words by patterns with one letter replaced by *. Words sharing a pattern differ in exactly that one position. ${[...buckets.values()].filter((v) => v.length > 1).length} patterns are shared by 2 or more words.`, view(), {});
    r.predict('wild', 'Why group words by patterns like c*t?', ['Words sharing a pattern differ by one letter, so neighbours are found without comparing all pairs', 'To sort the words', 'To remove duplicates'], 0, 'Each word has only L patterns; the words in the same pattern bucket are exactly its one-letter neighbours.');
    queue.push([begin, 1]);
    seen.add(begin);
    tones[begin] = 'frontier';
    r.step('queue', `Start BFS at "${begin}" with a chain length of 1.`, view(), {});
    let askedPush = false;
    let result = 0;
    while (queue.length) {
      r.op();
      const [word, steps] = queue.shift() as [string, number];
      tones[word] = 'active';
      focus = {};
      for (let i = 0; i < word.length; i++) {
        const p = word.slice(0, i) + '*' + word.slice(i + 1);
        focus[p] = (buckets.get(p) ?? []).join(', ');
      }
      r.step('pop', `Pop "${word}" (chain of ${steps}).`, view(), { word, steps });
      if (word === end) {
        tones[word] = 'found';
        r.predictChoice('goal', `The end word was reached with ${steps} words in the chain. What is returned?`, String(steps), [String(steps - 1), String(steps + 1), String(steps * 2)], steps, 'The length counts the words in the chain, including the begin and end words.');
        r.step('goalRet', `"${word}" is the end word: the shortest chain has ${steps} words.`, view(), { result: steps });
        result = steps;
        return { frames: r.frames, result };
      }
      for (let i = 0; i < word.length; i++) {
        const p = word.slice(0, i) + '*' + word.slice(i + 1);
        for (const nxt of buckets.get(p) ?? []) {
          if (seen.has(nxt)) continue;
          if (!askedPush) {
            askedPush = true;
            r.predictChoice('push', `"${nxt}" shares the pattern ${p} and is new. What chain length is queued with it?`, String(steps + 1), [String(steps), String(steps + 2), '1'], steps, 'One more word than the chain that led to the current word.');
          }
          seen.add(nxt);
          queue.push([nxt, steps + 1]);
          tones[nxt] = 'frontier';
          r.step('push', `"${nxt}" (pattern ${p}) is new: queue it with chain length ${steps + 1}.`, view(), {});
        }
      }
      tones[word] = 'done';
    }
    r.step('fail', 'The queue is empty and the end word was never reached: no ladder exists. Return 0.', view(), { result: 0 });
    return { frames: r.frames, result: 0 };
  },
  reference({ begin, end, words }) {
    const ws = new Set(words);
    if (!ws.has(end)) return 0;
    let layer = [begin];
    const seen = new Set([begin]);
    let d = 1;
    while (layer.length) {
      if (layer.includes(end)) return d;
      const next: string[] = [];
      for (const w of layer) for (const o of ws) if (!seen.has(o) && differByOne(w, o)) { seen.add(o); next.push(o); }
      layer = next;
      d++;
    }
    return 0;
  },
});

export default problem({
  summary: 'You start at a begin word and want to reach an end word by changing one letter at a time. Every word you step to must be in the allowed list (the begin word itself need not be). Return the number of words in the shortest such chain, counting both ends, or 0 if it is impossible.',
  example: ['begin "ham", end "hat", allowed ["hat", "hot"]', '2', 'ham → hat: one letter changes, so the chain has two words.'],
  pattern: ['bfs', ['bfs', 'dfs', 'dijkstra', 'backtracking'], 'Words are nodes, and two words are connected when they differ by one letter. The shortest chain in an unweighted graph is found by BFS.', {
    dfs: 'DFS may find a long chain first and must explore everything to find the shortest.',
    dijkstra: 'All steps cost 1, so plain BFS is enough.',
    backtracking: 'Exploring all chains is exponential; BFS finds the shortest directly.',
  }],
  hints: [
    'What are the nodes and edges of the graph hiding in this problem?',
    'Comparing every pair of words is slow. Is there a quick way to find all one-letter neighbours of a word?',
    'Replace each letter by * to make patterns (c*t). Words sharing a pattern are neighbours. BFS from the begin word, counting chain length.',
  ],
  insight: 'Patterns with one wildcard group the one-letter neighbours, turning each BFS step into L dictionary lookups.',
  brute: 'BFS comparing every pair of words: O(N² · L).',
  optimal: 'BFS with wildcard buckets: O(N · L²).',
  walk: ['If end_word is not allowed return 0.', 'Build buckets: pattern → words, for every word (including the begin word).', 'BFS from (begin_word, 1); mark words as seen when queued.', 'On popping the end word return its length; if the queue empties return 0.'],
  edge: ['End word missing from the list.', 'Begin word equal to a word in the list.', 'One-letter words.', 'No route between the two.'],
  works: ['BFS explores words in order of chain length, so the first time the end word is popped its length is minimal.', 'Marking words seen when they are queued keeps each word in the queue at most once.'],
  time: ['O(N · L²)', 'N words of length L; building patterns copies strings of length L.'],
  space: ['O(N · L²)', 'The buckets.'],
  solution,
  cases,
  sig: 'def ladder_length(begin_word, end_word, word_list):\n    # return the number of words in the shortest chain, or 0\n    pass\n',
  viz,
  fromArgs: ([begin, end, words]) => ({ begin, end, words }),
});
