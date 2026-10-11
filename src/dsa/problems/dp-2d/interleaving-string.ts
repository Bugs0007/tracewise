import type { Tone } from '@/engine/types';
import { dpTable2D, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './interleaving-string.py?raw';
import cases from './interleaving-string.cases.json';

const viz = vizOf<{ s1: string; s2: string; s3: string }>({
  id: 'interleaving-string',
  title: 'Interleaving String',
  solution,
  inputs: [
    { key: 's1', label: 's1', kind: 'string', default: 'abc', maxItems: 6 },
    { key: 's2', label: 's2', kind: 'string', default: 'xy', maxItems: 6 },
    { key: 's3', label: 's3 (the merged string to check)', kind: 'string', default: 'axbyc', maxItems: 12 },
  ],
  presets: [
    { label: 'Interleaved', input: { s1: 'abc', s2: 'xy', s3: 'axbyc' } },
    { label: 'Wrong order', input: { s1: 'abc', s2: 'xy', s3: 'yaxbc' } },
    { label: 'Ambiguous start', input: { s1: 'aab', s2: 'aac', s3: 'aaaabc' } },
    { label: 'Length mismatch', input: { s1: 'a', s2: 'b', s3: 'abc' } },
  ],
  validate: ({ s1, s2, s3 }) => ([s1, s2, s3].every((s) => /^[a-z]+$/.test(s)) ? null : 'Use lowercase letters (not empty)'),
  run({ s1, s2, s3 }) {
    const r = new TraceRecorder(solution);
    if (s1.length + s2.length !== s3.length) {
      r.step('length', `len(s1) + len(s2) = ${s1.length + s2.length}, but len(s3) = ${s3.length}: the lengths cannot match.`, [stringView(s3, { title: 's3' })], {});
      r.step('lengthRet', 'Return False.', [stringView(s3, { title: 's3' })], { result: false });
      return { frames: r.frames, result: false };
    }
    const dp = Array.from({ length: s1.length + 1 }, () => Array(s2.length + 1).fill(false) as boolean[]);
    const t = () => dp.map((row) => row.map((v) => (v ? 'T' : 'F')));
    const done = new Set<string>();
    const tones = (): Record<string, Tone> => ({ ...Object.fromEntries([...done].map((k) => [k, (dp[Number(k.split(',')[0])][Number(k.split(',')[1])] ? 'found' : 'done') as Tone])) });
    const labels = { rowLabels: ['·', ...s1], colLabels: ['·', ...s2] };
    let askedBase = false;
    let askedSet = false;
    r.step('init', `dp[i][j] = True if the first i letters of "${s1}" and the first j letters of "${s2}" can be interleaved to form the first i + j letters of "${s3}".`, [stringView(s3, { title: 's3' }), dpTable2D(t(), { title: 'dp (T/F)', ...labels })], {});
    dp[0][0] = true;
    done.add('0,0');
    if (!askedBase) {
      askedBase = true;
      r.step('base', 'dp[0][0] = True: using no letters from either string forms the empty prefix.', [stringView(s3, { title: 's3' }), dpTable2D(t(), { title: 'dp (T/F)', ...labels, tones: tones() })], {});
      r.predict('base', 'Why is dp[0][0] True?', ['Two empty prefixes interleave into the empty prefix of s3', 'It is a default', 'It is False in the code'], 0, 'It is the starting point every other True cell is reached from.');
    }
    for (let i = 0; i <= s1.length; i++) {
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0 && j === 0) continue;
        r.op();
        const k = i + j - 1;
        const top = i > 0 && dp[i - 1][j] && s1[i - 1] === s3[k];
        const left = j > 0 && dp[i][j - 1] && s2[j - 1] === s3[k];
        const deps: [number, number][] = [];
        if (i > 0) deps.push([i - 1, j]);
        if (j > 0) deps.push([i, j - 1]);
        r.step('cols', `Cell (${i}, ${j}): the letter s3[${k}] = "${s3[k]}" came from ${i > 0 ? `s1[${i - 1}] = "${s1[i - 1]}"` : ''}${i > 0 && j > 0 ? ' or ' : ''}${j > 0 ? `s2[${j - 1}] = "${s2[j - 1]}"` : ''}.`, [stringView(s3, { title: 's3', window: { from: k, to: k, label: 'this letter', tone: 'active' } }), dpTable2D(t(), { title: 'dp (T/F)', ...labels, filling: [i, j], deps, tones: tones() })], {});
        if (!askedSet && (top || left)) {
          askedSet = true;
          r.predict('set', `Is dp[${i}][${j}] True?`, ['Yes: a True neighbour plus a matching letter', 'No'], 0, top ? `The cell above is True and s1[${i - 1}] = s3[${k}].` : `The cell to the left is True and s2[${j - 1}] = s3[${k}].`);
        }
        if (top || left) dp[i][j] = true;
        done.add(`${i},${j}`);
        r.step(top ? 'setTop' : left ? 'setLeft' : 'cols', dp[i][j] ? `dp[${i}][${j}] = True (${top ? 'took the letter from s1' : 'took the letter from s2'}).` : `dp[${i}][${j}] stays False.`, [stringView(s3, { title: 's3' }), dpTable2D(t(), { title: 'dp (T/F)', ...labels, tones: tones() })], {});
      }
    }
    const res = dp[s1.length][s2.length];
    r.step('done', res ? 'The bottom-right cell is True: s3 is an interleaving of s1 and s2.' : 'The bottom-right cell is False: s3 is not an interleaving.', [stringView(s3, { title: 's3' }), dpTable2D(t(), { title: 'dp (T/F)', ...labels, tones: { ...tones(), [`${s1.length},${s2.length}`]: res ? 'found' : 'compare' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ s1, s2, s3 }) {
    const go = (i: number, j: number): boolean => {
      const k = i + j;
      if (k === s3.length) return i === s1.length && j === s2.length;
      return (i < s1.length && s1[i] === s3[k] && go(i + 1, j)) || (j < s2.length && s2[j] === s3[k] && go(i, j + 1));
    };
    return s1.length + s2.length === s3.length && go(0, 0);
  },
});

export default problem({
  summary: 'Given three strings, decide whether the third can be formed by weaving the first two together: take letters from either string one at a time, always keeping the original order inside each string, until both are used up.',
  example: ['s1 = "ab", s2 = "cd", s3 = "acbd"', 'true', 'a (s1), c (s2), b (s1), d (s2).'],
  pattern: ['dp-2d', ['dp-2d', 'backtracking', 'dfs', 'two-pointers'], 'The state is how many letters of each string have been used (i, j); the next letter of s3 is then s3[i + j]. A table over (i, j) records whether that state is reachable.', {
    backtracking: 'Trying both choices at every letter repeats states exponentially often.',
    dfs: 'Recursion over (i, j) with memory is the same table top-down.',
    'two-pointers': 'A greedy pointer fails when both strings offer the same next letter.',
  }],
  hints: [
    'After using i letters of s1 and j of s2, which letter of s3 must come next?',
    'In how many ways can the state (i, j) be reached from an earlier state?',
    'dp[i][j] is True if (dp[i−1][j] and s1[i−1] == s3[i+j−1]) or (dp[i][j−1] and s2[j−1] == s3[i+j−1]). Check the lengths first.',
  ],
  insight: 'The last letter of s3[:i+j] came from s1 or from s2, giving two predecessor cells.',
  brute: 'Recursion trying both choices: O(2^(n+m)).',
  optimal: 'DP table: O(n · m) time and space (O(m) with a rolling row).',
  walk: ['If the lengths do not add up return False.', 'dp[0][0] = True.', 'For every (i, j): set dp[i][j] if the cell above is True and s1[i−1] matches s3[i+j−1], or the cell to the left is True and s2[j−1] matches.', 'Return dp[len(s1)][len(s2)].'],
  edge: ['Lengths that do not add up.', 'One of the strings empty.', 'Both strings offering the same next letter.', 'Repeated letters.'],
  works: ['A state (i, j) is reachable exactly when one of its two predecessor states is reachable and the letter used matches s3.', 'The final state is the only one that uses all letters.'],
  time: ['O(n · m)', 'One cell per pair (i, j).'],
  space: ['O(n · m)', 'The table.'],
  solution,
  cases,
  sig: 'def is_interleave(s1, s2, s3):\n    # True if s3 can be formed by interleaving s1 and s2 (keeping the order within each)\n    pass\n',
  viz,
  fromArgs: ([s1, s2, s3]) => ({ s1, s2, s3 }),
});
