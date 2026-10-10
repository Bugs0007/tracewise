import type { Panel, Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { gridView, hashSetView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './valid-sudoku.py?raw';
import cases from './valid-sudoku.cases.json';

interface In {
  board: (string | number)[][];
}

// Editable boards: digits become numbers in the input box, "." stays a dot.
const fromBoard = (b: string[][]): (string | number)[][] => b.map((row) => row.map((c) => (c === '.' ? '.' : Number(c))));
const sample = (i: number): (string | number)[][] => fromBoard((cases as unknown as { cases: { args: string[][][] }[] }).cases[i].args[0]);

const boxOf = (r: number, c: number): number => Math.floor(r / 3) * 3 + Math.floor(c / 3);

const viz: VizDef<In> = {
  id: 'valid-sudoku',
  title: 'Valid Sudoku',
  code: solution,
  language: 'python',
  inputs: [{ key: 'board', label: 'board (9 rows, 9 cells each, "." for empty)', kind: 'grid', default: sample(0), maxItems: 81 }],
  presets: [
    { label: 'Valid', input: { board: sample(0) } },
    { label: 'Repeat in a row', input: { board: sample(3) } },
    { label: 'Repeat in a column', input: { board: sample(4) } },
    { label: 'Repeat in a box', input: { board: sample(5) } },
  ],
  run({ board: raw }) {
    if (raw.length !== 9 || raw.some((row) => row.length !== 9)) throw new Error('The board needs 9 rows with 9 cells each');
    const board = raw.map((row) => row.map((c) => String(c)));
    for (const row of board) for (const c of row) if (c !== '.' && !/^[1-9]$/.test(c)) throw new Error(`Cells must be 1-9 or "." (found "${c}")`);
    const r = new TraceRecorder(solution);
    const rows = Array.from({ length: 9 }, () => new Set<string>());
    const cols = Array.from({ length: 9 }, () => new Set<string>());
    const boxes = Array.from({ length: 9 }, () => new Set<string>());
    const cells = board.map((row) => row.map((c) => (c === '.' ? null : Number(c))));
    const view = (cur: [number, number] | null, o: { clash?: boolean; clashWith?: string; show?: boolean } = {}) => {
      const tones: Record<string, Tone> = {};
      if (cur) {
        const [cr, cc] = cur;
        const b = boxOf(cr, cc);
        for (let k = 0; k < 9; k++) {
          for (const [rr, c2] of [
            [cr, k],
            [k, cc],
          ]) tones[`${rr},${c2}`] = 'visited';
          tones[`${Math.floor(b / 3) * 3 + Math.floor(k / 3)},${(b % 3) * 3 + (k % 3)}`] = 'visited';
        }
        if (o.clash) {
          // mark every peer holding the same digit as the clash
          const d = board[cr][cc];
          for (let rr = 0; rr < 9; rr++) for (let c2 = 0; c2 < 9; c2++) if ((rr === cr || c2 === cc || boxOf(rr, c2) === b) && board[rr][c2] === d && !(rr === cr && c2 === cc)) tones[`${rr},${c2}`] = 'error';
        }
        tones[`${cr},${cc}`] = o.clash ? 'error' : 'active';
      }
      const panels: Panel[] = [gridView(cells, { title: 'board', tones, rowLabels: Array.from({ length: 9 }, (_, i) => String(i)), colLabels: Array.from({ length: 9 }, (_, i) => String(i)) })];
      if (cur && o.show !== false) {
        const [cr, cc] = cur;
        panels.push(hashSetView(rows[cr], { title: `rows[${cr}]` }), hashSetView(cols[cc], { title: `cols[${cc}]` }), hashSetView(boxes[boxOf(cr, cc)], { title: `boxes[${boxOf(cr, cc)}]` }));
      }
      return panels;
    };
    r.step('init', 'Three families of sets: one per row, one per column, one per 3×3 box. Each remembers the digits already placed there.', view(null), { rows: 9, cols: 9, boxes: 9 });
    r.step('initCols', 'All 27 sets start empty.', view(null), {});
    r.step('initBoxes', 'Boxes are numbered 0 to 8, left to right and top to bottom.', view(null), {});
    let firstClean = true;
    for (let rr = 0; rr < 9; rr++) {
      for (let c = 0; c < 9; c++) {
        const d = board[rr][c];
        if (d === '.') continue; // empty cells do nothing, so they get no frame
        const b = boxOf(rr, c);
        const clash = rows[rr].has(d) || cols[c].has(d) || boxes[b].has(d);
        r.op();
        const where = [rows[rr].has(d) && `row ${rr}`, cols[c].has(d) && `column ${c}`, boxes[b].has(d) && `box ${b}`].filter(Boolean).join(' and ');
        r.step('check', `Cell (${rr}, ${c}) holds ${d} and lies in box ${b}. Is ${d} already in rows[${rr}], cols[${c}] or boxes[${b}]?`, view([rr, c]), { r: rr, c, d, b });
        const nonTrivial = rows[rr].size + cols[c].size + boxes[b].size > 0;
        if (clash || (nonTrivial && firstClean)) {
          r.predict(clash ? 'clash' : 'clean', `Is ${d} already in the row, column or box of this cell?`, ['Yes: the board is invalid', 'No: record it and continue'], clash ? 0 : 1, clash ? `${d} is already in ${where}, so this board breaks the rules.` : 'None of the three sets contains it, so the placement is fine so far.');
          if (!clash) firstClean = false;
        }
        if (clash) {
          r.step('clash', `${d} already appears in ${where}: return False.`, view([rr, c], { clash: true }), { r: rr, c, d, result: false });
          return { frames: r.frames, result: false };
        }
        rows[rr].add(d);
        cols[c].add(d);
        boxes[b].add(d);
        r.step('addBox', `No clash. Add ${d} to rows[${rr}], cols[${c}] and boxes[${b}].`, view([rr, c]), { r: rr, c, d, b });
      }
    }
    r.predict('end', 'All cells have been checked and none clashed. What is returned?', ['True', 'False'], 0, 'A board is valid when no digit repeats in any row, column or box, which is what we just verified.');
    r.step('done', 'Every filled cell passed all three checks: return True.', view(null), { result: true });
    return { frames: r.frames, result: true };
  },
  reference({ board }) {
    const b = board.map((row) => row.map((c) => String(c)));
    const units: string[][] = [];
    for (let i = 0; i < 9; i++) {
      units.push(b[i], b.map((row) => row[i]));
      units.push([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => b[Math.floor(i / 3) * 3 + Math.floor(k / 3)][(i % 3) * 3 + (k % 3)]));
    }
    return units.every((u) => {
      const f = u.filter((c) => c !== '.');
      return new Set(f).size === f.length;
    });
  },
};

const content: ProblemContent = {
  summary: 'You are given a partly filled 9×9 Sudoku board. Without solving it, check that what is on the board so far breaks no rule: no digit may repeat within a row, within a column, or within any of the nine 3×3 boxes. Empty cells are written as ".".',
  example: { input: 'a board where the digit 4 appears in two cells of the same row', output: 'false', note: 'The same digit twice in a row, column or box makes the board invalid. A board with empty cells is fine as long as nothing repeats.' },
  pattern: {
    answer: 'constraint-sets',
    options: ['constraint-sets', 'backtracking', 'dfs', 'two-pointers'],
    why: 'Each row, column and box is a constraint: "no repeats". Keep one set of seen digits per constraint; a cell is legal only if its digit is in none of its three sets.',
    notes: {
      backtracking: 'Backtracking is how you would solve the puzzle. Here we only check the digits already on the board, which needs no search.',
      dfs: 'Nothing is explored or traversed; every cell is read exactly once.',
      'two-pointers': 'No two positions are being compared against each other in order. Set membership answers "seen before?" directly.',
    },
  },
  hints: [
    'You never need to fill in blanks, only to detect a repeated digit. Which three groups of cells must hold distinct digits?',
    'Keep a set of digits for each row, for each column and for each box. When you read a cell, which of those sets does it belong to?',
    'To find the box number of cell (r, c), use integer division: (r // 3) * 3 + c // 3 gives 0 to 8.',
  ],
  explanation: {
    insight: 'One set per row, per column and per box. Scan every filled cell once: if its digit is already in any of its three sets, fail; otherwise add it to all three.',
    brute: 'For each cell, rescan its row, column and box for a repeat: about O(81 · 27) steps, all constant for a fixed 9×9 board.',
    optimal: 'One scan with 27 sets: 81 cell visits, each O(1). The board has a fixed size, so this is O(1) overall (O(n²) for an n×n generalisation).',
    walkthrough: [
      'Create nine empty sets for rows, nine for columns and nine for boxes.',
      'Visit every cell in reading order. Skip the empty ones.',
      'Compute the box index b = (r // 3) * 3 + c // 3. If the digit is already in rows[r], cols[c] or boxes[b], two equal digits share a unit, so return False.',
      'Otherwise add the digit to all three sets and continue. If the scan finishes, nothing repeated and the answer is True.',
    ],
    edgeCases: ['An empty board is valid.', 'A completely filled valid board is valid.', 'The same digit may appear in different rows, columns and boxes at once; only sharing a unit is illegal.', 'A repeat that is only inside a box (different rows and columns) still makes the board invalid, so the box check is not redundant.'],
    whyItWorks: [
      'The rules say exactly three things: rows have no repeats, columns have no repeats, boxes have no repeats. Each set records the digits seen so far in one such unit, so "digit already in the set" is precisely "this unit would contain a repeat".',
      'The board is valid if and only if no cell triggers that check, and every cell is checked once, so the scan decides validity completely.',
    ],
  },
  complexity: {
    time: { big: 'O(1)', why: 'The board is always 9×9 = 81 cells, and each cell does a constant number of set operations. In general it is O(n²) for an n×n board.' },
    space: { big: 'O(1)', why: 'At most 27 sets with at most 9 digits each. In general O(n²).' },
  },
  solution,
  task: taskFrom(cases, 'def is_valid_sudoku(board):\n    # board is a 9x9 list of lists of one-character strings ("1"-"9" or ".")\n    # return True if no digit repeats in any row, column or 3x3 box\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([board]) => ({ board }),
};

export default content;
