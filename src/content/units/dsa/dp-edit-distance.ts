import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertString, dpGrid, tk, type Arrow, type DpCell } from '@/content/lib/dp';

const code = `
def edit_distance(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i                                 #@col0
    for j in range(n + 1):
        dp[0][j] = j                                 #@row0
    for i in range(1, m + 1):                        #@rows
        for j in range(1, n + 1):                    #@cols
            if a[i - 1] == b[j - 1]:                 #@cmp
                dp[i][j] = dp[i - 1][j - 1]          #@same
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])   #@edit
    ops = []
    i, j = m, n                                      #@trace
    while i > 0 or j > 0:                            #@tloop
        if i > 0 and j > 0 and a[i - 1] == b[j - 1]:     #@tsame
            i, j = i - 1, j - 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:   #@trep
            ops.append('replace ' + a[i - 1] + ' with ' + b[j - 1])
            i, j = i - 1, j - 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:     #@tdel
            ops.append('delete ' + a[i - 1])
            i -= 1
        else:
            ops.append('insert ' + b[j - 1])             #@tins
            j -= 1
    return dp[m][n], ops[::-1]                       #@done
`;

interface In {
  a: string;
  b: string;
}

/** Independent reference: memoised top-down recursion that also rebuilds the operation list (replace, then delete, then insert on ties). */
function reference({ a, b }: In): [number, string[]] {
  const memo = new Map<string, number>();
  const d = (i: number, j: number): number => {
    if (i === 0) return j;
    if (j === 0) return i;
    const k = `${i},${j}`;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    const v = a[i - 1] === b[j - 1] ? d(i - 1, j - 1) : 1 + Math.min(d(i - 1, j), d(i, j - 1), d(i - 1, j - 1));
    memo.set(k, v);
    return v;
  };
  const ops = (i: number, j: number): string[] => {
    if (i === 0 && j === 0) return [];
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) return ops(i - 1, j - 1);
    if (i > 0 && j > 0 && d(i, j) === d(i - 1, j - 1) + 1) return [...ops(i - 1, j - 1), `replace ${a[i - 1]} with ${b[j - 1]}`];
    if (i > 0 && d(i, j) === d(i - 1, j) + 1) return [...ops(i - 1, j), `delete ${a[i - 1]}`];
    return [...ops(i, j - 1), `insert ${b[j - 1]}`];
  };
  return [d(a.length, b.length), ops(a.length, b.length)];
}

const viz: VizDef<In> = {
  id: 'dp-edit-distance',
  title: 'Edit distance',
  code,
  language: 'python',
  inputs: [
    { key: 'a', label: 'From (rows)', kind: 'string', default: 'HORSE', maxItems: 6 },
    { key: 'b', label: 'To (columns)', kind: 'string', default: 'ROS', maxItems: 6 },
  ],
  presets: [
    { label: 'HORSE → ROS', input: { a: 'HORSE', b: 'ROS' } },
    { label: 'Same word', input: { a: 'CAT', b: 'CAT' } },
    { label: 'Empty → word', input: { a: '', b: 'ABC' } },
    { label: 'CAT → CUT', input: { a: 'CAT', b: 'CUT' } },
  ],
  run({ a, b }) {
    assertString('From', a, 6);
    assertString('To', b, 6);
    const r = new Recorder(code);
    const m = a.length;
    const n = b.length;
    const dp: (number | null)[][] = Array.from({ length: m + 1 }, () => Array<number | null>(n + 1).fill(null));
    const rowLabels = ['∅', ...a];
    const colLabels = ['∅', ...b];
    const table = (tones: Record<string, Tone>, arrows: Arrow[] = [], title = 'dp[i][j] = edits to turn a[:i] into b[:j]') => dpGrid(dp as DpCell[][], { title, tones, arrows, rowLabels, colLabels });
    const filled = (): Record<string, Tone> => {
      const t: Record<string, Tone> = {};
      dp.forEach((row, i) => row.forEach((v, j) => v !== null && (t[tk(i, j)] = i === 0 || j === 0 ? 'muted' : 'default')));
      return t;
    };

    r.step('col0', `Column 0: turning a[:i] into "" costs i deletions`, [table({})], { m, n });
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    r.op(m + 1);
    r.step('col0', `dp[i][0] = i for i = 0..${m}: delete every character`, [table(filled())], { m, n });
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    r.op(n + 1);
    r.step('row0', `dp[0][j] = j for j = 0..${n}: insert every character`, [table(filled())], { m, n });

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        r.op();
        const tones = filled();
        tones[tk(i, j)] = 'active';
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]!;
          tones[tk(i - 1, j - 1)] = 'compare';
          r.step('same', `${a[i - 1]} == ${b[j - 1]} → free: dp[${i}][${j}] = dp[${i - 1}][${j - 1}] = ${dp[i][j]}`, [table(tones, [{ from: [i - 1, j - 1], to: [i, j], tone: 'found' }])], { i, j });
        } else {
          const del = dp[i - 1][j]!;
          const ins = dp[i][j - 1]!;
          const rep = dp[i - 1][j - 1]!;
          const best = Math.min(del, ins, rep);
          dp[i][j] = 1 + best;
          tones[tk(i - 1, j)] = 'compare';
          tones[tk(i, j - 1)] = 'compare';
          tones[tk(i - 1, j - 1)] = 'compare';
          const pick = (v: number): Tone => (v === best ? 'found' : 'muted');
          r.step('edit', `${a[i - 1]} ≠ ${b[j - 1]} → 1 + min(delete ${del}, insert ${ins}, replace ${rep}) = ${dp[i][j]}`, [table(tones, [{ from: [i - 1, j], to: [i, j], tone: pick(del) }, { from: [i, j - 1], to: [i, j], tone: pick(ins) }, { from: [i - 1, j - 1], to: [i, j], tone: pick(rep) }])], { i, j });
        }
      }
    }

    // Trace back the operations
    let i = m;
    let j = n;
    const ops: string[] = [];
    const path: [number, number][] = [[i, j]];
    const matched = new Set<string>();
    const logPanel = () => ({ type: 'log' as const, title: 'Edits (from the end)', lines: ops.map((t) => ({ text: t, tone: 'swap' as Tone })) });
    const trTones = (cur: [number, number]): Record<string, Tone> => {
      const t = filled();
      for (const [pi, pj] of path) t[tk(pi, pj)] = matched.has(tk(pi, pj)) ? 'found' : 'path';
      t[tk(cur[0], cur[1])] = 'active';
      return t;
    };
    const trArrows = (): Arrow[] => path.slice(1).map((p, k) => ({ from: path[k], to: p, tone: 'path' as Tone }));
    const T = 'Trace back from the bottom-right corner';
    r.step('trace', `Trace back from dp[${m}][${n}] = ${dp[m][n]}: which move produced each cell?`, [table(trTones([i, j]), [], T), logPanel()], { i, j });
    while (i > 0 || j > 0) {
      r.op();
      let at: string;
      let caption: string;
      let next: [number, number];
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        matched.add(tk(i, j));
        at = 'tsame';
        caption = `${a[i - 1]} == ${b[j - 1]}: no edit, go diagonally`;
        next = [i - 1, j - 1];
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1]! + 1) {
        at = 'trep';
        caption = `dp[${i}][${j}] = diagonal + 1 → replace ${a[i - 1]} with ${b[j - 1]}`;
        ops.push(`replace ${a[i - 1]} with ${b[j - 1]}`);
        next = [i - 1, j - 1];
      } else if (i > 0 && dp[i][j] === dp[i - 1][j]! + 1) {
        at = 'tdel';
        caption = `dp[${i}][${j}] = up + 1 → delete ${a[i - 1]}`;
        ops.push(`delete ${a[i - 1]}`);
        next = [i - 1, j];
      } else {
        at = 'tins';
        caption = `dp[${i}][${j}] = left + 1 → insert ${b[j - 1]}`;
        ops.push(`insert ${b[j - 1]}`);
        next = [i, j - 1];
      }
      path.push(next);
      r.step(at, caption, [table(trTones(next), trArrows(), T), logPanel()], { i, j, edits: ops.length });
      [i, j] = next;
    }
    ops.reverse();
    const finalLog = { type: 'log' as const, title: 'Edit script (in order)', lines: ops.length ? ops.map((t) => ({ text: t, tone: 'swap' as Tone })) : [{ text: 'no edits needed', tone: 'found' as Tone }] };
    r.step('done', ops.length ? `Distance ${dp[m][n]}: ${ops.join(', ')}` : `Distance ${dp[m][n]}: the strings are already equal`, [table(trTones([0, 0]), trArrows(), T), finalLog], { distance: dp[m][n] });
    return { frames: r.frames, result: [dp[m][n], ops] };
  },
  reference,
};

const tests = [
  { args: ['horse', 'ros'], expected: 3 },
  { args: ['intention', 'execution'], expected: 5 },
  { args: ['', 'abc'], expected: 3, name: 'empty source' },
  { args: ['abc', ''], expected: 3, name: 'empty target' },
  { args: ['same', 'same'], expected: 0, name: 'identical' },
  { args: ['cat', 'cut'], expected: 1, name: 'one replace' },
  { args: ['', ''], expected: 0, name: 'both empty' },
];

const unit: Unit = {
  id: 'dp-edit-distance',
  hook: 'Edit distance is LCS with costs: three moves, each a neighbouring cell. It shows up in spell-checkers, diffs and fuzzy search, and interviewers love that the table can also tell you which edits to make.',
  predict: {
    prompt: 'Minimum insert / delete / replace operations to turn "CAT" into "CUT"?',
    options: ['0', '1', '2', '3'],
    answer: 1,
    explain: 'Replace A with U. In the table, dp[2][2] = 1 + min(delete 1, insert 1, replace 0) because "CA" → "CU" costs one replace on top of dp[1][1] = 0.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[i][j]` = fewest edits to turn the first i characters of a into the first j of b.',
      'Base: `dp[i][0] = i` (delete everything) and `dp[0][j] = j` (insert everything).',
      'Equal last chars: `dp[i][j] = dp[i-1][j-1]` (no cost). Otherwise `1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])`: up = delete, left = insert, diagonal = replace.',
      'Order: row by row so up, left and diagonal are ready.',
      'Trace back from the corner: whichever neighbour explains the value tells you the operation; reverse the list at the end.',
    ],
    complexity: { time: 'O(m × n)', space: 'O(m × n), or O(n) for just the distance' },
    pitfalls: ['Forgetting the base row and column (they are not zeros)', 'Mixing which neighbour means insert and which means delete', 'Adding 1 when the characters already match'],
  },
  practice: {
    language: 'python',
    fnName: 'edit_distance',
    statement: 'Return the minimum number of single-character insertions, deletions and replacements needed to turn string `a` into string `b`.',
    signature: 'def edit_distance(a, b):',
    solution: `def edit_distance(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = @@i@@
    for j in range(n + 1):
        dp[0][j] = @@j@@
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = @@dp[i - 1][j - 1]@@
            else:
                dp[i][j] = @@1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])@@
    return @@dp[m][n]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'edit_distance',
    statement: 'This gives the wrong distance whenever one string is empty or the words differ at the start. Find the bug.',
    buggy: `def edit_distance(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]`,
    fixed: `def edit_distance(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]`,
    tests,
    bugType: 'missing base case',
    hint: 'Look at dp[0][j]. What should "" → b[:j] cost, and what does the code leave there?',
    explanation: 'Turning an empty prefix into b[:j] needs j insertions, so the first row must be 0, 1, 2, ... The buggy code only initialised the first column; the first row stays 0 and every cell that depends on it is too small.',
  },
  boss: {
    title: 'Delete Operation for Two Strings',
    statement: 'Given two strings `a` and `b`, return the minimum number of single-character deletions (from either string) needed to make them identical. Example: "sea" and "eat" need 2 deletions.',
    language: 'python',
    fnName: 'min_deletions',
    starter: `def min_deletions(a, b):
    # your code here
    pass
`,
    solution: `def min_deletions(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]`,
    tests: [
      { args: ['sea', 'eat'], expected: 2 },
      { args: ['leetcode', 'etco'], expected: 4 },
      { args: ['abc', 'abc'], expected: 0, name: 'already equal' },
      { args: ['', 'abc'], expected: 3, name: 'empty' },
      { args: ['abc', 'xyz'], expected: 6, name: 'nothing shared' },
    ],
    hints: ['It is edit distance with only two of the three moves allowed. Which neighbour (replace) is no longer available?', 'Drop the diagonal option on mismatch: dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1]). Equivalent: len(a) + len(b) - 2 * LCS.'],
    combines: ['dp-edit-distance', 'dp-lcs'],
  },
  quiz: [
    {
      prompt: 'In dp[i][j], which neighbour represents INSERTING b[j-1] into a?',
      options: ['dp[i-1][j] (up)', 'dp[i][j-1] (left)', 'dp[i-1][j-1] (diagonal)', 'dp[i+1][j]'],
      answer: 1,
      explain: 'Inserting the last char of b[:j] consumes one char of b but none of a, so you come from dp[i][j-1] (left). Up (consume a, not b) is a delete.',
    },
  ],
};

export default unit;
