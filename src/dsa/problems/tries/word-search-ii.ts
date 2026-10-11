import type { Tone } from '@/engine/types';
import { chipsView, gridView, trieView } from '@/dsa/viz/prims';
import { trieInsert, trieRoot, type TNode } from '@/dsa/viz/trie';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './word-search-ii.py?raw';
import cases from './word-search-ii.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ board: string[][]; words: string[] }>({
  id: 'word-search-ii',
  title: 'Word Search II',
  solution,
  inputs: [
    { key: 'board', label: 'board (one lowercase letter per cell, rows on separate lines)', kind: 'grid', default: [['o', 'a', 't'], ['e', 't', 'h'], ['r', 'a', 'i']], maxItems: 16 },
    { key: 'words', label: 'words to find (comma separated)', kind: 'strings', default: ['oath', 'oat', 'rain', 'tar'], maxItems: 6 },
  ],
  presets: [
    { label: 'Two of four found', input: { board: [['o', 'a', 't'], ['e', 't', 'h'], ['r', 'a', 'i']], words: ['oath', 'oat', 'rain', 'tar'] } },
    { label: 'No cell reuse', input: { board: [['a', 'b'], ['c', 'd']], words: ['abcb', 'abdc'] } },
    { label: 'Single row', input: { board: [['c', 'a', 't']], words: ['cat', 'tac', 'act', 'ca'] } },
  ],
  validate: ({ board, words }) => {
    if (board.some((row) => row.some((c) => !/^[a-z]$/.test(String(c))))) return 'Every cell must be a single lowercase letter';
    if (words.some((w) => !/^[a-z]+$/.test(w))) return 'Words must be lowercase letters';
    if (new Set(words).size !== words.length) return 'Each word should appear once';
    return null;
  },
  run({ board: input, words }) {
    const r = new TraceRecorder(solution);
    const board = input.map((row) => [...row]);
    const rows = board.length;
    const cols = board[0].length;
    const root = trieRoot();
    for (const w of words) trieInsert(root, w);
    const found: string[] = [];
    const remaining = new Set(words);
    const path: [number, number][] = [];
    let current = '';
    let cell: [number, number] | null = null;
    let askedPrune = false;
    let askedHit = false;
    let askedRestore = false;
    const view = () => {
      const gt: Record<string, Tone> = {};
      path.forEach(([a, b]) => (gt[`${a},${b}`] = 'visited'));
      if (cell) gt[`${cell[0]},${cell[1]}`] = 'active';
      const tt: Record<string, Tone> = {};
      for (let i = 0; i <= current.length; i++) tt[current.slice(0, i)] = 'active';
      for (const w of found) tt[w] = 'found';
      return [
        gridView(board.map((row) => row.map((c) => String(c))), { title: 'board (# = on the current path)', tones: gt, compact: false }),
        trieView(words, { title: 'trie of the words', tones: tt }),
        chipsView(found, { title: 'found so far' }),
      ];
    };
    r.step('build', `Put all ${words.length} words into a trie so one walk over the board can follow every word's prefix at once.`, view(), {});
    r.step('init', 'found collects the words located on the board.', view(), {});
    const dfs = (rr: number, cc: number, node: TNode) => {
      r.op();
      const ch = board[rr][cc];
      cell = [rr, cc];
      const nxt = node.kids.get(ch);
      r.step('ch', `Visit (${rr}, ${cc}) = "${ch}". Does the trie node "${node.id || 'root'}" have a child "${ch}"?`, view(), { cell: `${rr},${cc}` });
      if (!nxt) {
        if (!askedPrune) {
          askedPrune = true;
          r.predict('prune', `No word continues "${node.id}${ch}". What does the search do at this cell?`, ['Stop here: no word can start this way (prune)', 'Keep exploring its neighbours anyway', 'Mark the cell as found'], 0, 'The trie tells us instantly that no word has this prefix, so exploring further is wasted work.');
        }
        r.step('pruneRet', `No child "${ch}": prune. Nothing below this path can match a word.`, view(), {});
        return;
      }
      const prevCurrent = current;
      current = nxt.id;
      if (nxt.end && remaining.has(nxt.id)) {
        if (!askedHit) {
          askedHit = true;
          r.predict('hit', `The path spells "${nxt.id}", and a word ends here. What do we do?`, ['Record it, and keep searching: a longer word may continue', 'Stop the whole search', 'Ignore it'], 0, 'Words can be prefixes of other words, so we record the hit and continue exploring.');
        }
        found.push(nxt.id);
        remaining.delete(nxt.id);
        r.step('add', `"${nxt.id}" is a word! Add it to found (and remove its end marker so it is not added twice).`, view(), { word: nxt.id });
      }
      board[rr][cc] = '#';
      path.push([rr, cc]);
      cell = [rr, cc];
      r.step('visit', `Mark (${rr}, ${cc}) as used ("#") so this path cannot reuse it.`, view(), {});
      for (const [dr, dc] of DIRS) {
        const nr = rr + dr;
        const nc = cc + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] !== '#') dfs(nr, nc, nxt);
      }
      board[rr][cc] = ch;
      path.pop();
      current = prevCurrent;
      cell = [rr, cc];
      if (!askedRestore) {
        askedRestore = true;
        r.predict('restore', `All neighbours of (${rr}, ${cc}) are explored. Why do we put "${ch}" back?`, ['Other paths starting elsewhere may need this cell', 'To save memory', 'To record the word'], 0, 'The "#" only blocks reuse within one path. After leaving, the cell must be available to every other path.');
      }
      r.step('restore', `Restore (${rr}, ${cc}) to "${ch}" and backtrack.`, view(), {});
    };
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        current = '';
        dfs(rr, cc, root);
      }
    }
    cell = null;
    current = '';
    r.step('done', `Every cell has been tried as a starting point. Found ${found.length}: ${found.join(', ') || 'nothing'}.`, view(), { result: found.join(',') });
    return { frames: r.frames, result: found };
  },
  reference({ board: input, words }) {
    const board = input.map((row) => [...row]);
    const root = trieRoot();
    for (const w of words) trieInsert(root, w);
    const left = new Set(words);
    const out: string[] = [];
    const go = (r: number, c: number, node: TNode) => {
      const ch = board[r][c];
      const nxt = node.kids.get(ch);
      if (!nxt) return;
      if (nxt.end && left.delete(nxt.id)) out.push(nxt.id);
      board[r][c] = '#';
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length && board[nr][nc] !== '#') go(nr, nc, nxt);
      }
      board[r][c] = ch;
    };
    for (let r = 0; r < board.length; r++) for (let c = 0; c < board[0].length; c++) go(r, c, root);
    return out;
  },
});

export default problem({
  summary: 'You get a grid of letters and a list of words. A word is on the board if you can spell it by moving between neighbouring cells (up, down, left, right) without using any cell twice in the same word. Return all listed words that are on the board.',
  example: ['board [[a, b], [c, d]], words [abd, acd, abcd]', '[abd, acd]', 'abd: a→b→d. acd: a→c→d. abcd would need b and c to touch, but they are diagonal.'],
  pattern: ['trie', ['trie', 'backtracking', 'dfs', 'hash-lookup'], 'Searching the board once per word repeats work. A trie of all the words lets a single backtracking walk follow every word at the same time and stop the moment no word shares the current prefix.', {
    backtracking: 'The walk is backtracking, but without the trie you would repeat it for every word.',
    dfs: 'It is a depth-first search over the grid, guided by the trie.',
    'hash-lookup': 'A set of words cannot tell you whether a prefix is worth extending; a trie can.',
  }],
  hints: [
    'Finding one word on the board is a standard backtracking search. What goes wrong when you repeat it for every word?',
    'Many words share beginnings. Can one structure let you extend all of them in a single walk?',
    'Build a trie of the words. DFS from every cell, moving down the trie as you move across the board; prune when the trie has no such child; record a word when you reach its end marker.',
  ],
  insight: 'The trie answers "can any word still start with this path?" in O(1), so dead branches are cut immediately.',
  brute: 'Run a full word-search for every word: roughly words × cells × 4^length.',
  optimal: 'One DFS per starting cell, pruned by the trie: bounded by cells × 4^(longest word) in the worst case but far less in practice.',
  walk: ['Build a trie; store the word itself at the end node.', 'For every cell, dfs(r, c, node).', 'If the trie node has no child for this cell’s letter, return.', 'If that child holds a word, add it to the answer (and remove it to avoid duplicates).', 'Mark the cell used, recurse into the four neighbours, then restore the cell.'],
  edge: ['A word that is a prefix of another word.', 'The same word reachable by two different paths (report once).', 'Words longer than the number of cells.', 'A 1×1 board.'],
  works: ['The trie node always stands for the exact path taken so far, so reaching an end marker proves the path spells a word.', 'Marking cells ensures no cell is reused within one path, and restoring them lets other paths use them.'],
  time: ['O(cells · 4^L)', 'L = longest word; the trie prunes most branches.'],
  space: ['O(total letters + L)', 'The trie plus the recursion stack.'],
  solution,
  cases,
  sig: 'def find_words(board, words):\n    # board: list of rows of single letters; return the listed words that can be traced on it\n    pass\n',
  viz,
  fromArgs: ([board, words]) => ({ board, words }),
});
