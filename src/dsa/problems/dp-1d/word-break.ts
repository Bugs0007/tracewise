import type { Tone } from '@/engine/types';
import { chipsView, dpTable1D, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './word-break.py?raw';
import cases from './word-break.cases.json';

const viz = vizOf<{ s: string; words: string[] }>({
  id: 'word-break',
  title: 'Word Break',
  solution,
  inputs: [
    { key: 's', label: 's (lowercase)', kind: 'string', default: 'catsup', maxItems: 12 },
    { key: 'words', label: 'dictionary (comma separated)', kind: 'strings', default: ['cat', 'sup', 'up', 'cats'], maxItems: 6 },
  ],
  presets: [
    { label: 'Splits into two', input: { s: 'catsup', words: ['cat', 'sup', 'up', 'cats'] } },
    { label: 'Greedy prefix trap', input: { s: 'aaab', words: ['a', 'aa', 'aab'] } },
    { label: 'No split', input: { s: 'abcd', words: ['a', 'bd'] } },
    { label: 'Reuse a word', input: { s: 'abab', words: ['ab'] } },
  ],
  validate: ({ s, words }) => (!/^[a-z]+$/.test(s) ? 'Use lowercase letters' : words.some((w) => !/^[a-z]+$/.test(w)) ? 'Dictionary words must be lowercase' : null),
  run({ s, words }) {
    const r = new TraceRecorder(solution);
    const set = new Set(words);
    const n = s.length;
    const dp = [true, ...Array(n).fill(false)] as boolean[];
    const t = (a: boolean[]) => a.map((v) => (v ? 'T' : 'F'));
    const done = (upTo: number): Record<number, Tone> => Object.fromEntries(Array.from({ length: upTo + 1 }, (_, i) => [i, (dp[i] ? 'found' : 'done') as Tone]));
    let askedBase = false;
    let askedCheck = false;
    let askedBreak = false;
    r.step('set', `Put the dictionary in a set for fast lookup: ${[...set].join(', ')}.`, [chipsView([...set], { title: 'dictionary' }), stringView(s, { title: 's' })], {});
    r.step('init', 'dp[i] is True if the first i letters can be split into dictionary words. dp[0] is True: the empty prefix is trivially fine.', [stringView(s, { title: 's' }), dpTable1D(t(dp), { title: 'dp (T = this prefix can be split)', tones: { 0: 'found' } })], {});
    if (!askedBase) {
      askedBase = true;
      r.predict('base', 'Why is dp[0] True?', ['It lets a word that starts at the very beginning be accepted', 'The string is empty', 'It is arbitrary'], 0, 'A word s[0:end] is accepted only if the part before it (the empty prefix) is splittable, so dp[0] must be True.');
    }
    for (let end = 1; end <= n; end++) {
      r.op();
      r.step('loop', `Can the prefix of length ${end} ("${s.slice(0, end)}") be split? Try every last word s[start:${end}].`, [stringView(s, { title: 's', window: { from: 0, to: end - 1, label: 'prefix', tone: 'active' } }), dpTable1D(t(dp), { title: 'dp', filling: end, tones: done(end - 1) })], { end });
      let hit = -1;
      for (let start = 0; start < end; start++) {
        const word = s.slice(start, end);
        if (dp[start] && set.has(word)) {
          hit = start;
          if (!askedCheck) {
            askedCheck = true;
            r.step('check', `dp[${start}] is True and "${word}" is in the dictionary.`, [stringView(s, { title: 's', window: { from: start, to: end - 1, label: 'last word', tone: 'found' } }), dpTable1D(t(dp), { title: 'dp', filling: end, deps: [start], tones: done(end - 1) })], {});
            r.predict('check', `dp[${start}] is True and "${word}" is a dictionary word. What is dp[${end}]?`, ['True', 'False'], 0, 'The prefix up to the start splits, and the last piece is a word, so the whole prefix splits.');
          }
          break;
        }
      }
      if (hit >= 0) {
        dp[end] = true;
        if (!askedBreak) {
          askedBreak = true;
          r.step('mark', `dp[${end}] = True (last word "${s.slice(hit, end)}").`, [stringView(s, { title: 's' }), dpTable1D(t(dp), { title: 'dp', tones: done(end) })], {});
          r.predict('break', 'One split is enough to make dp[end] True. What does the inner loop do next?', ['Stop (break): no need to try other starts', 'Keep trying every start', 'Return immediately'], 0, 'We only need to know whether some split exists; the first one found settles it.');
        } else {
          r.step('mark', `dp[${end}] = True (last word "${s.slice(hit, end)}").`, [stringView(s, { title: 's' }), dpTable1D(t(dp), { title: 'dp', tones: done(end) })], {});
        }
      } else {
        r.step('loop', `No start works: dp[${end}] stays False.`, [stringView(s, { title: 's' }), dpTable1D(t(dp), { title: 'dp', tones: done(end) })], {});
      }
    }
    r.step('done', dp[n] ? `dp[${n}] is True: "${s}" can be split into dictionary words.` : `dp[${n}] is False: no split exists.`, [stringView(s, { title: 's' }), dpTable1D(t(dp), { title: 'dp', tones: { ...done(n - 1), [n]: dp[n] ? 'found' : 'compare' } })], { result: dp[n] });
    return { frames: r.frames, result: dp[n] };
  },
  reference({ s, words }) {
    const set = new Set(words);
    const go = (i: number): boolean => i === s.length || [...Array(s.length - i).keys()].some((k) => set.has(s.slice(i, i + k + 1)) && go(i + k + 1));
    return go(0);
  },
});

export default problem({
  summary: 'Given a string and a dictionary of words, decide whether the string can be cut into pieces that are all in the dictionary. Dictionary words may be used as many times as you like.',
  example: ['"dogcat" with words ["dog", "cat"]', 'true', '"dog" + "cat". If "dog" were missing from the dictionary the answer would be false.'],
  pattern: ['dp-1d', ['dp-1d', 'backtracking', 'trie', 'bfs'], 'Whether a prefix can be split depends on shorter prefixes: it works if some shorter splittable prefix is followed by one dictionary word. Fill a line of booleans left to right.', {
    backtracking: 'Trying every split without memory repeats work exponentially.',
    trie: 'A trie speeds up word lookup, but the DP over prefixes is the main idea.',
    bfs: 'BFS over end positions is equivalent to the DP.',
  }],
  hints: [
    'If you cut off the last word, what must be true about what is left?',
    'Define dp[i] for the first i letters. What does dp[0] mean?',
    'dp[end] is True if there is a start < end with dp[start] True and s[start:end] in the dictionary. Return dp[n].',
  ],
  insight: 'A prefix is splittable if a shorter splittable prefix is followed by one dictionary word.',
  brute: 'Recursively try every first word: O(2ⁿ) without memory.',
  optimal: 'DP over prefixes: O(n²) substring checks (times word length for hashing).',
  walk: ['Put the words in a set.', 'dp[0] = True, others False.', 'For end in 1…n: for start in 0…end−1: if dp[start] and s[start:end] is in the set, set dp[end] = True and break.', 'Return dp[n].'],
  edge: ['A word that is a prefix of another (greedy cuts fail).', 'A repeated word.', 'No split at all.', 'A single-letter dictionary.'],
  works: ['The last word of any valid split starts at some index where the prefix is itself splittable.', 'Checking all starts for every end covers every possible last word.'],
  time: ['O(n²)', 'Two nested loops over positions (plus hashing a substring).'],
  space: ['O(n)', 'The table and the set.'],
  solution,
  cases,
  sig: 'def word_break(s, words):\n    # True if s can be split into dictionary words (words may repeat)\n    pass\n',
  viz,
  fromArgs: ([s, words]) => ({ s, words }),
});
