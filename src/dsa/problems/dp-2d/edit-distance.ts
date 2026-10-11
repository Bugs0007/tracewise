import type { Tone } from '@/engine/types';
import { dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './edit-distance.py?raw';
import cases from './edit-distance.cases.json';

const viz = vizOf<{ a: string; b: string }>({
  id: 'edit-distance',
  title: 'Edit Distance',
  solution,
  inputs: [
    { key: 'a', label: 'from', kind: 'string', default: 'cat', maxItems: 7 },
    { key: 'b', label: 'to', kind: 'string', default: 'cart', maxItems: 7 },
  ],
  presets: [
    { label: 'cat → cart', input: { a: 'cat', b: 'cart' } },
    { label: 'monday → money', input: { a: 'monday', b: 'money' } },
    { label: 'Delete in the middle', input: { a: 'abxc', b: 'abc' } },
    { label: 'Completely different', input: { a: 'abc', b: 'xyz' } },
  ],
  validate: ({ a, b }) => (/^[a-z]+$/.test(a) && /^[a-z]+$/.test(b) ? null : 'Use lowercase letters (not empty)'),
  run({ a, b }) {
    const r = new TraceRecorder(solution);
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0) as number[]);
    const done = new Set<string>();
    const tones = (): Record<string, Tone> => Object.fromEntries([...done].map((k) => [k, 'done' as Tone]));
    const labels = { rowLabels: ['·', ...a], colLabels: ['·', ...b] };
    let askedBase = false;
    let askedSame = false;
    let askedEdit = false;
    r.step('init', `dp[i][j] = fewest edits (insert, delete, replace) to turn the first i letters of "${a}" into the first j letters of "${b}".`, [dpTable2D(dp, { title: 'dp', ...labels })], {});
    for (let i = 0; i <= a.length; i++) { dp[i][0] = i; done.add(`${i},0`); }
    for (let j = 0; j <= b.length; j++) { dp[0][j] = j; done.add(`0,${j}`); }
    r.step('baseRow', 'First column: deleting i letters turns a prefix into the empty string (i edits). First row: inserting j letters builds a prefix from nothing (j edits).', [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], {});
    if (!askedBase) {
      askedBase = true;
      r.predict('base', 'What does dp[3][0] mean?', ['Three deletions turn the first 3 letters into nothing', 'Three letters match', 'Three replacements'], 0, 'To reach the empty string every letter must be deleted.');
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        r.op();
        const same = a[i - 1] === b[j - 1];
        const opts = [dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]];
        r.step('rows', same ? `"${a[i - 1]}" = "${b[j - 1]}": no edit needed here, copy the diagonal.` : `"${a[i - 1]}" ≠ "${b[j - 1]}": one edit is needed. Options: delete (up ${opts[0]}), insert (left ${opts[1]}), replace (diagonal ${opts[2]}).`, [dpTable2D(dp, { title: 'dp', ...labels, filling: [i, j], deps: same ? [[i - 1, j - 1]] : [[i - 1, j], [i, j - 1], [i - 1, j - 1]], tones: tones() })], {});
        if (same && !askedSame) {
          askedSame = true;
          r.predictChoice('same', `The letters are equal. The diagonal cell holds ${dp[i - 1][j - 1]}. What goes in dp[${i}][${j}]?`, String(dp[i - 1][j - 1]), [String(dp[i - 1][j - 1] + 1), String(Math.min(...opts) + 1), String(dp[i - 1][j])], i + j, 'Equal letters need no edit: the cost is the same as without them.');
        } else if (!same && !askedEdit) {
          askedEdit = true;
          r.predictChoice('edit', `Up = ${opts[0]}, left = ${opts[1]}, diagonal = ${opts[2]}. What goes in dp[${i}][${j}]?`, String(1 + Math.min(...opts)), [String(Math.min(...opts)), String(1 + Math.max(...opts)), String(opts[0] + opts[1] + opts[2])], i * j, 'Pay one edit on top of the cheapest of the three sub-problems.');
        }
        dp[i][j] = same ? dp[i - 1][j - 1] : 1 + Math.min(...opts);
        done.add(`${i},${j}`);
        r.step(same ? 'same' : 'edit', same ? `dp[${i}][${j}] = dp[${i - 1}][${j - 1}] = ${dp[i][j]}.` : `dp[${i}][${j}] = 1 + min(${opts.join(', ')}) = ${dp[i][j]}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], { value: dp[i][j] });
      }
    }
    const res = dp[a.length][b.length];
    r.step('done', `${res} edit${res === 1 ? '' : 's'} turn "${a}" into "${b}".`, [dpTable2D(dp, { title: 'dp', ...labels, tones: { ...tones(), [`${a.length},${b.length}`]: 'found' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ a, b }) {
    const memo = new Map<string, number>();
    const go = (i: number, j: number): number => {
      const k = `${i},${j}`;
      if (memo.has(k)) return memo.get(k) as number;
      const v = i === a.length ? b.length - j : j === b.length ? a.length - i : a[i] === b[j] ? go(i + 1, j + 1) : 1 + Math.min(go(i + 1, j), go(i, j + 1), go(i + 1, j + 1));
      memo.set(k, v);
      return v;
    };
    return go(0, 0);
  },
});

export default problem({
  summary: 'Given two words, find the minimum number of single-letter operations needed to turn the first into the second. The operations are: insert a letter, delete a letter, replace a letter.',
  example: ['"cat" → "cut"', '1', 'Replace the "a" by a "u".'],
  pattern: ['dp-2d', ['dp-2d', 'two-pointers', 'dfs', 'bfs'], 'Compare the last letters of the two prefixes. If they are equal nothing is needed; otherwise one of three edits is paid on top of a smaller sub-problem. The table over (i, j) holds all those answers.', {
    'two-pointers': 'A pointer walk cannot decide whether to insert, delete or replace.',
    dfs: 'Recursion without memory is exponential.',
    bfs: 'BFS over words is correct but explodes; the table is far smaller.',
  }],
  hints: [
    'Look at the last letter of each prefix. What if they are equal?',
    'If they differ, you can delete, insert or replace. Which smaller sub-problems does each leave?',
    'dp[i][j] = dp[i−1][j−1] if the letters match, else 1 + min(dp[i−1][j], dp[i][j−1], dp[i−1][j−1]). Row 0 is j and column 0 is i.',
  ],
  insight: 'Delete = move up, insert = move left, replace = move diagonally: pay 1 for any of them.',
  brute: 'Recursion trying all three edits: O(3^n).',
  optimal: 'DP table: O(n · m) time and space.',
  walk: ['dp[i][0] = i and dp[0][j] = j.', 'For i, j ≥ 1: if a[i−1] == b[j−1], dp[i][j] = dp[i−1][j−1].', 'Otherwise dp[i][j] = 1 + min(dp[i−1][j], dp[i][j−1], dp[i−1][j−1]).', 'Return dp[len(a)][len(b)].'],
  edge: ['One or both words empty.', 'Equal words (0).', 'Words of very different lengths.', 'Nothing in common (max(len(a), len(b)) edits).'],
  works: ['Any edit script ends with a match, a replace, a delete or an insert at the end, each reducing to one smaller prefix pair; the minimum over those is optimal.'],
  time: ['O(n · m)', 'One cell per pair of prefixes.'],
  space: ['O(n · m)', 'The table (O(m) with a rolling row).'],
  solution,
  cases,
  sig: 'def min_distance(a, b):\n    # minimum number of insert / delete / replace operations to turn a into b\n    pass\n',
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
