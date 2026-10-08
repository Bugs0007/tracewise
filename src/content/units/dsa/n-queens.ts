import { Recorder } from '@/engine/recorder';
import type { Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def count_n_queens(n):
    cols, diag1, diag2 = set(), set(), set()
    count = 0

    def place(r):
        nonlocal count
        if r == n:                                              #@full
            count += 1                                          #@count
            return
        for c in range(n):                                      #@loop
            if c in cols or r - c in diag1 or r + c in diag2:   #@conflict
                continue
            cols.add(c)                                         #@place
            diag1.add(r - c)
            diag2.add(r + c)
            place(r + 1)                                        #@explore
            cols.remove(c)                                      #@remove
            diag1.remove(r - c)
            diag2.remove(r + c)

    place(0)
    return count                                                #@done
`;

interface In {
  n: number;
}

/** Independent solution counter (bitmask backtracking). */
function countRef(n: number): number {
  const all = (1 << n) - 1;
  const go = (cols: number, d1: number, d2: number): number => {
    if (cols === all) return 1;
    let free = all & ~(cols | d1 | d2);
    let total = 0;
    while (free) {
      const bit = free & -free;
      free -= bit;
      total += go(cols | bit, ((d1 | bit) << 1) & all, (d2 | bit) >> 1);
    }
    return total;
  };
  return go(0, 0, 0);
}

const viz: VizDef<In> = {
  id: 'n-queens',
  title: 'Backtracking: N-Queens',
  code,
  language: 'python',
  inputs: [{ key: 'n', label: 'Board size n', kind: 'number', default: 4, help: 'Integer from 1 to 5 (n = 5 is a long run)' }],
  presets: [
    { label: '1×1', input: { n: 1 } },
    { label: '3×3 (no solution)', input: { n: 3 } },
    { label: '5×5', input: { n: 5 } },
  ],
  run({ n }) {
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Choose an integer board size between 1 and 5');
    const r = new Recorder(code);
    const cols = new Set<number>();
    const diag1 = new Set<number>();
    const diag2 = new Set<number>();
    const queens: number[] = []; // queens[row] = column
    const solutions: number[][] = [];
    let count = 0;
    const setStr = (s: Set<number>) => `{${[...s].sort((a, b) => a - b).join(',')}}`;
    const attacked = (row: number, col: number) => cols.has(col) || diag1.has(row - col) || diag2.has(row + col);

    const emit = (at: string, caption: string, focus?: { r: number; c: number; tone: Tone; by?: [number, number] }, solved = false) => {
      const cells: Scalar[][] = Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => (queens[row] === col ? '♛' : '')));
      const tones: Record<string, Tone> = {};
      // squares already ruled out by the queens on the board (pruning)
      for (let row = queens.length; row < n; row++) for (let col = 0; col < n; col++) if (attacked(row, col)) tones[`${row},${col}`] = 'muted';
      queens.forEach((col, row) => (tones[`${row},${col}`] = solved ? 'found' : 'active'));
      if (focus) {
        tones[`${focus.r},${focus.c}`] = focus.tone;
        if (focus.by) tones[`${focus.by[0]},${focus.by[1]}`] = 'compare';
      }
      r.step(
        at,
        caption,
        [
          { type: 'grid', title: `${n}×${n} board`, cells, tones, rowLabels: Array.from({ length: n }, (_, i) => String(i)), colLabels: Array.from({ length: n }, (_, i) => String(i)) },
          { type: 'log', title: `solutions found (${count})`, lines: solutions.map((s) => ({ text: `columns by row: [${s.join(', ')}]`, tone: 'found' as const })) },
        ],
        { row: focus?.r ?? queens.length, col: focus?.c ?? null, cols: setStr(cols), 'r-c': setStr(diag1), 'r+c': setStr(diag2), count },
      );
    };

    const whoAttacks = (row: number, col: number): { by: [number, number]; why: string } => {
      for (let q = 0; q < queens.length; q++) {
        if (queens[q] === col) return { by: [q, col], why: `same column as queen (${q},${col})` };
        if (q - queens[q] === row - col) return { by: [q, queens[q]], why: `same diagonal as queen (${q},${queens[q]})` };
        if (q + queens[q] === row + col) return { by: [q, queens[q]], why: `same anti-diagonal as queen (${q},${queens[q]})` };
      }
      return { by: [0, 0], why: 'attacked' };
    };

    const place = (row: number): void => {
      r.op();
      if (row === n) {
        count++;
        solutions.push([...queens]);
        emit('count', `Row ${n} reached: all ${n} queens are safe → solution #${count}`, undefined, true);
        return;
      }
      let placed = false;
      for (let c = 0; c < n; c++) {
        r.op();
        if (attacked(row, c)) {
          const { by, why } = whoAttacks(row, c);
          const last = c === n - 1 && !placed;
          emit('conflict', `(${row},${c}) is attacked: ${why}${last ? ' — row dead end' : ''}`, { r: row, c, tone: 'error', by });
          continue;
        }
        placed = true;
        cols.add(c);
        diag1.add(row - c);
        diag2.add(row + c);
        queens.push(c);
        emit('place', `(${row},${c}) is safe → place a queen, mark col ${c}, r-c = ${row - c}, r+c = ${row + c}`, { r: row, c, tone: 'active' });
        place(row + 1);
        queens.pop();
        cols.delete(c);
        diag1.delete(row - c);
        diag2.delete(row + c);
        emit('remove', `Backtrack: lift the queen from (${row},${c}) and unmark its lines`, { r: row, c, tone: 'swap' });
      }
    };
    place(0);
    emit('done', `${count} solution${count === 1 ? '' : 's'} for ${n} queens`);
    return { frames: r.frames, result: count };
  },
  reference({ n }) {
    return countRef(n);
  },
};

const tests = [
  { args: [4], expected: 2 },
  { args: [1], expected: 1, name: 'single square' },
  { args: [2], expected: 0, name: 'n = 2 has none' },
  { args: [3], expected: 0, name: 'n = 3 has none' },
  { args: [5], expected: 10 },
  { args: [6], expected: 4 },
];

const unit: Unit = {
  id: 'n-queens',
  hook: 'N-Queens is the classic test of pruning: you only survive by rejecting bad placements early. Constant-time conflict checks with sets and a clean undo are what interviewers look for.',
  predict: {
    prompt: 'On a 4×4 board, you place a queen at row 0, column 1. Which squares in row 1 are still safe for the next queen?',
    options: ['Columns 0 and 2 and 3', 'Only column 3', 'Only columns 0 and 2', 'None — the board is already stuck'],
    answer: 1,
    explain: 'Queen at (0,1) attacks column 1 and the diagonals through (1,0) and (1,2). Only (1,3) in row 1 is safe, so the search has a single branch here.',
  },
  viz,
  deeper: {
    points: [
      'Place one queen per row. That alone removes every row conflict, so only columns and the two diagonal directions remain to check.',
      'Squares on one diagonal share r - c, squares on one anti-diagonal share r + c. Three sets (cols, diag1, diag2) answer "is this square attacked?" in O(1).',
      'Pruning is the point: as soon as a square is attacked we skip it, and when a row has no safe square the whole subtree is abandoned (a dead end) without exploring deeper.',
      'Every placement adds to three sets, so every backtrack must remove from all three. Missing one leaves a ghost queen blocking later branches.',
    ],
    complexity: { time: 'O(n!) worst case, far less with pruning', space: 'O(n) — the sets and recursion depth' },
    pitfalls: ['Checking only columns, or only one diagonal direction', 'Not removing from all three sets when backtracking', 'Scanning the whole board for conflicts at every step (O(n) each) instead of using sets'],
  },
  practice: {
    language: 'python',
    fnName: 'count_n_queens',
    statement: 'Return the number of ways to place n queens on an n×n board so that no two attack each other (same row, column or diagonal).',
    signature: 'def count_n_queens(n):',
    solution: `def count_n_queens(n):
    cols, diag1, diag2 = set(), set(), set()
    count = 0

    def place(r):
        nonlocal count
        if r == n:
            count += 1
            return
        for c in range(n):
            if @@c in cols or r - c in diag1 or r + c in diag2@@:
                continue
            cols.add(c)
            diag1.add(@@r - c@@)
            diag2.add(@@r + c@@)
            place(@@r + 1@@)
            cols.remove(c)
            diag1.remove(@@r - c@@)
            diag2.remove(@@r + c@@)

    place(0)
    return count`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'count_n_queens',
    statement: 'For n = 4 this returns 4 instead of 2 (some boards have queens attacking each other). Find and fix the bug.',
    buggy: `def count_n_queens(n):
    cols, diag1, diag2 = set(), set(), set()
    count = 0

    def place(r):
        nonlocal count
        if r == n:
            count += 1
            return
        for c in range(n):
            if c in cols or r - c in diag1 or r - c in diag2:
                continue
            cols.add(c)
            diag1.add(r - c)
            diag2.add(r - c)
            place(r + 1)
            cols.remove(c)
            diag1.remove(r - c)
            diag2.remove(r - c)

    place(0)
    return count`,
    fixed: `def count_n_queens(n):
    cols, diag1, diag2 = set(), set(), set()
    count = 0

    def place(r):
        nonlocal count
        if r == n:
            count += 1
            return
        for c in range(n):
            if c in cols or r - c in diag1 or r + c in diag2:
                continue
            cols.add(c)
            diag1.add(r - c)
            diag2.add(r + c)
            place(r + 1)
            cols.remove(c)
            diag1.remove(r - c)
            diag2.remove(r + c)

    place(0)
    return count`,
    tests,
    bugType: 'wrong diagonal key',
    hint: 'There are two diagonal directions. Which expression identifies squares on the "/" diagonal, and does the code ever use it?',
    explanation: 'Both diagonal sets were keyed by r - c, so the anti-diagonal (squares that share r + c) was never checked. Queens on a "/" diagonal slipped through. diag2 must use r + c in the check, the add and the remove.',
  },
  boss: {
    title: 'Generate parentheses',
    statement: 'Given n pairs of parentheses, return every well-formed combination as a string (for example n = 2 gives "(())" and "()()"). The order of the results does not matter.',
    language: 'python',
    fnName: 'generate_parentheses',
    compare: 'unordered',
    starter: `def generate_parentheses(n):
    # your code here
    pass
`,
    solution: `def generate_parentheses(n):
    result = []

    def go(cur, opened, closed):
        if len(cur) == 2 * n:
            result.append(cur)
            return
        if opened < n:
            go(cur + '(', opened + 1, closed)
        if closed < opened:
            go(cur + ')', opened, closed + 1)

    go('', 0, 0)
    return result`,
    tests: [
      { args: [1], expected: ['()'] },
      { args: [2], expected: ['(())', '()()'] },
      { args: [3], expected: ['((()))', '(()())', '(())()', '()(())', '()()()'] },
      { args: [0], expected: [''], name: 'zero pairs → one empty string' },
      { args: [4], expected: ['(((())))', '((()()))', '((())())', '((()))()', '(()(()))', '(()()())', '(()())()', '(())(())', '(())()()', '()((()))', '()(()())', '()(())()', '()()(())', '()()()()'], name: 'n = 4 (14 results)' },
    ],
    hints: ['Think of it as N-Queens: never build an invalid string and then filter, reject the bad choice right away. When is adding "(" or ")" allowed?', 'You may add "(" while opened < n, and ")" only while closed < opened. Both conditions together guarantee every string you finish is balanced. Done when the length is 2n.'],
    combines: ['n-queens', 'subsets'],
  },
  quiz: [
    {
      prompt: 'Two squares (r1, c1) and (r2, c2) are on the same "/" diagonal when…',
      options: ['r1 + c1 == r2 + c2', 'r1 - c1 == r2 - c2', 'r1 == r2', 'c1 + r2 == c2 + r1 + 1'],
      answer: 1,
      explain: 'Moving down-right changes row and column by the same amount, so r - c stays constant. Anti-diagonals keep r + c constant.',
    },
  ],
};

export default unit;
