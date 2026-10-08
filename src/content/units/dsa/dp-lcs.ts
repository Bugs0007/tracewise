import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertString, dpGrid, tk, type Arrow, type DpCell } from '@/content/lib/dp';

const code = `
def lcs(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]        #@init
    for i in range(1, m + 1):                         #@rows
        for j in range(1, n + 1):                     #@cols
            if a[i - 1] == b[j - 1]:                  #@cmp
                dp[i][j] = dp[i - 1][j - 1] + 1       #@match
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])   #@skip
    out = []
    i, j = m, n                                       #@trace
    while i > 0 and j > 0:                            #@tloop
        if a[i - 1] == b[j - 1]:                      #@tmatch
            out.append(a[i - 1])
            i, j = i - 1, j - 1
        elif dp[i - 1][j] >= dp[i][j - 1]:            #@tup
            i -= 1
        else:
            j -= 1                                    #@tleft
    return ''.join(reversed(out))                     #@done
`;

interface In {
  a: string;
  b: string;
}

/** Independent reference: memoised recursion on suffix-free prefixes, same tie-break as the trace (up before left). */
function lcsRef(a: string, b: string): string {
  const memo = new Map<string, string>();
  const f = (i: number, j: number): string => {
    if (i === 0 || j === 0) return '';
    const k = `${i},${j}`;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let res: string;
    if (a[i - 1] === b[j - 1]) res = f(i - 1, j - 1) + a[i - 1];
    else {
      const up = f(i - 1, j);
      const left = f(i, j - 1);
      res = up.length >= left.length ? up : left;
    }
    memo.set(k, res);
    return res;
  };
  return f(a.length, b.length);
}

const viz: VizDef<In> = {
  id: 'dp-lcs',
  title: 'Longest common subsequence',
  code,
  language: 'python',
  inputs: [
    { key: 'a', label: 'String A (rows)', kind: 'string', default: 'ABCBD', maxItems: 6 },
    { key: 'b', label: 'String B (columns)', kind: 'string', default: 'BDCB', maxItems: 6 },
  ],
  presets: [
    { label: 'Classic', input: { a: 'ABCBD', b: 'BDCB' } },
    { label: 'No overlap', input: { a: 'ABC', b: 'XYZ' } },
    { label: 'Identical', input: { a: 'CODE', b: 'CODE' } },
    { label: 'Empty string', input: { a: '', b: 'ABC' } },
  ],
  run({ a, b }) {
    assertString('String A', a, 6);
    assertString('String B', b, 6);
    const r = new Recorder(code);
    const m = a.length;
    const n = b.length;
    const dp: (number | null)[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)));
    const rowLabels = ['∅', ...a];
    const colLabels = ['∅', ...b];
    const baseTones = (): Record<string, Tone> => {
      const t: Record<string, Tone> = {};
      for (let i = 0; i <= m; i++) t[tk(i, 0)] = 'muted';
      for (let j = 0; j <= n; j++) t[tk(0, j)] = 'muted';
      return t;
    };
    const table = (tones: Record<string, Tone>, arrows: Arrow[] = [], title = 'dp[i][j] = LCS length of a[:i] and b[:j]') => dpGrid(dp as DpCell[][], { title, tones, arrows, rowLabels, colLabels });

    r.step('init', `Table is (${m}+1) × (${n}+1): row 0 and column 0 are the empty prefix, so LCS = 0`, [table(baseTones())], { m, n });
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        r.op();
        const tones = baseTones();
        tones[tk(i, j)] = 'active';
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]! + 1;
          tones[tk(i - 1, j - 1)] = 'compare';
          r.step('match', `${a[i - 1]} == ${b[j - 1]} → dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i][j]}`, [table(tones, [{ from: [i - 1, j - 1], to: [i, j], tone: 'found' }])], { i, j });
        } else {
          const up = dp[i - 1][j]!;
          const left = dp[i][j - 1]!;
          dp[i][j] = Math.max(up, left);
          tones[tk(i - 1, j)] = 'compare';
          tones[tk(i, j - 1)] = 'compare';
          r.step('skip', `${a[i - 1]} ≠ ${b[j - 1]} → dp[${i}][${j}] = max(up ${up}, left ${left}) = ${dp[i][j]}`, [table(tones, [{ from: [i - 1, j], to: [i, j] }, { from: [i, j - 1], to: [i, j] }])], { i, j });
        }
      }
    }
    // Trace back
    let i = m;
    let j = n;
    const out: string[] = [];
    const path: [number, number][] = [[i, j]];
    const trTones = (cur: [number, number], taken: Set<string>): Record<string, Tone> => {
      const t = baseTones();
      for (const [pi, pj] of path) t[tk(pi, pj)] = taken.has(tk(pi, pj)) ? 'found' : 'path';
      t[tk(cur[0], cur[1])] = 'active';
      return t;
    };
    const trArrows = (): Arrow[] => path.slice(1).map((p, k) => ({ from: path[k], to: p, tone: 'path' as Tone }));
    const taken = new Set<string>();
    const seq = () => ({ type: 'array' as const, title: 'Subsequence (built from the end)', values: [...out].reverse(), hideIndex: true });
    r.step('trace', `Trace back from dp[${m}][${n}] = ${dp[m][n]} to rebuild one longest subsequence`, [table(trTones([i, j], taken), [], 'Trace back from the bottom-right corner'), seq()], { i, j });
    while (i > 0 && j > 0) {
      r.op();
      let move: string;
      let next: [number, number];
      let at: string;
      if (a[i - 1] === b[j - 1]) {
        out.push(a[i - 1]);
        taken.add(tk(i, j));
        move = `${a[i - 1]} == ${b[j - 1]}: keep "${a[i - 1]}", go diagonally`;
        next = [i - 1, j - 1];
        at = 'tmatch';
      } else if (dp[i - 1][j]! >= dp[i][j - 1]!) {
        move = `${a[i - 1]} ≠ ${b[j - 1]}, up (${dp[i - 1][j]}) ≥ left (${dp[i][j - 1]}): go up`;
        next = [i - 1, j];
        at = 'tup';
      } else {
        move = `${a[i - 1]} ≠ ${b[j - 1]}, left (${dp[i][j - 1]}) > up (${dp[i - 1][j]}): go left`;
        next = [i, j - 1];
        at = 'tleft';
      }
      path.push(next);
      r.step(at, move, [table(trTones(next, taken), trArrows(), 'Trace back from the bottom-right corner'), seq()], { i, j, 'LCS so far': [...out].reverse().join('') });
      [i, j] = next;
    }
    const result = out.reverse().join('');
    r.step('tloop', i === 0 || j === 0 ? 'Reached an empty prefix: the walk is over' : 'Walk finished', [table(trTones([i, j], taken), trArrows(), 'Trace back from the bottom-right corner'), { type: 'array', title: 'Subsequence', values: [...result], hideIndex: true }], { i, j });
    r.step('done', result ? `LCS = "${result}" (length ${result.length})` : 'No characters in common → empty string', [table(trTones([i, j], taken), trArrows(), 'Trace back from the bottom-right corner'), { type: 'array', title: 'Subsequence', values: [...result], tones: Object.fromEntries([...result].map((_, k) => [k, 'found' as Tone])), hideIndex: true }], { result });
    return { frames: r.frames, result };
  },
  reference({ a, b }) {
    return lcsRef(a, b);
  },
};

const tests = [
  { args: ['abcde', 'ace'], expected: 3 },
  { args: ['abc', 'abc'], expected: 3, name: 'identical' },
  { args: ['abc', 'def'], expected: 0, name: 'no overlap' },
  { args: ['', 'abc'], expected: 0, name: 'empty string' },
  { args: ['AGGTAB', 'GXTXAYB'], expected: 4 },
  { args: ['bl', 'yby'], expected: 1 },
];

const unit: Unit = {
  id: 'dp-lcs',
  hook: 'LCS is the template for every two-string DP: diff tools, edit distance, DNA alignment. Once you can fill this table and walk it backwards, you can read most string-DP questions.',
  predict: {
    prompt: 'a = "ABCBD", b = "BDCB". When the last characters differ (D vs B), what do you do to get dp[i][j]?',
    options: ['Reset to 0', 'Take the max of the cell above and the cell to the left', 'Add 1 to the diagonal anyway', 'Take the min of above and left'],
    answer: 1,
    explain: 'If the last characters differ, at least one of them is not in the best subsequence: either drop the last char of a (cell above) or of b (cell to the left). Keep the better. Matching characters are the only case that extends the diagonal.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[i][j]` = LCS length of the first i characters of a and the first j of b. Size (m+1) × (n+1) so row 0 and column 0 mean the empty prefix.',
      'Match: `a[i-1] == b[j-1]` → `dp[i][j] = dp[i-1][j-1] + 1` (extend the diagonal).',
      'Mismatch: `dp[i][j] = max(dp[i-1][j], dp[i][j-1])` (drop a char from either string).',
      'Order: row by row, left to right, so up, left and diagonal are already filled.',
      'To get the subsequence itself, walk from dp[m][n]: match → take the char and go diagonal; otherwise move to the larger neighbour.',
      'Space: only the previous row is needed if you want just the length.',
    ],
    complexity: { time: 'O(m × n)', space: 'O(m × n), or O(min(m, n)) for length only' },
    pitfalls: ['Indexing a[i] instead of a[i-1] (the table is shifted by one)', 'Confusing subsequence (gaps allowed) with substring (must be contiguous)', 'Table sized m × n, with no empty-prefix row and column'],
  },
  practice: {
    language: 'python',
    fnName: 'lcs_length',
    statement: 'Return the length of the longest common subsequence of strings `a` and `b` (characters in order, gaps allowed).',
    signature: 'def lcs_length(a, b):',
    solution: `def lcs_length(a, b):
    m, n = len(a), len(b)
    dp = [[0] * @@(n + 1)@@ for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if @@a[i - 1] == b[j - 1]@@:
                dp[i][j] = @@dp[i - 1][j - 1] + 1@@
            else:
                dp[i][j] = @@max(dp[i - 1][j], dp[i][j - 1])@@
    return @@dp[m][n]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'lcs_length',
    statement: 'This returns a length that is too small on some inputs. Find the bug.',
    buggy: `def lcs_length(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = dp[i - 1][j]
    return dp[m][n]`,
    fixed: `def lcs_length(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]`,
    tests,
    bugType: 'incomplete recurrence',
    hint: 'Try a = "abcde", b = "ace". On a mismatch, only one neighbour is looked at. Which one is missing?',
    explanation: 'When the characters differ, the best answer might come from dropping a character of a (the cell above) OR of b (the cell to the left). Using only the cell above ignores half of the options, so results can be too small whenever the match lies in a later column.',
  },
  boss: {
    title: 'Longest Palindromic Subsequence',
    statement: 'Given a string `s`, return the length of the longest subsequence of `s` that reads the same forwards and backwards. Characters need not be contiguous: in "bbbab" the answer is 4 ("bbbb").',
    language: 'python',
    fnName: 'longest_palindrome_subseq',
    starter: `def longest_palindrome_subseq(s):
    # your code here
    pass
`,
    solution: `def longest_palindrome_subseq(s):
    t = s[::-1]
    m = len(s)
    dp = [[0] * (m + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, m + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][m]`,
    tests: [
      { args: ['bbbab'], expected: 4 },
      { args: ['cbbd'], expected: 2 },
      { args: ['a'], expected: 1, name: 'single char' },
      { args: [''], expected: 0, name: 'empty' },
      { args: ['abcde'], expected: 1, name: 'no repeats' },
      { args: ['agbdba'], expected: 5 },
    ],
    hints: ['A palindrome equals its own reverse. What do the subsequences common to s and reverse(s) look like?', 'Answer = LCS(s, s[::-1]). Reuse the LCS table exactly as written.'],
    combines: ['dp-lcs'],
  },
  quiz: [
    {
      prompt: 'What is the difference between a subsequence and a substring?',
      options: ['No difference', 'A subsequence keeps order but may skip characters; a substring must be contiguous', 'A substring may skip characters', 'A subsequence must be sorted'],
      answer: 1,
      explain: '"ace" is a subsequence of "abcde" but not a substring. LCS allows gaps.',
    },
  ],
};

export default unit;
