import { chipsView, stringView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './palindrome-partitioning.py?raw';
import cases from './palindrome-partitioning.cases.json';

const show = (p: readonly (number | string)[]) => `[${p.join(', ')}]`;

const viz = vizOf<{ s: string }>({
  id: 'palindrome-partitioning',
  title: 'Palindrome Partitioning',
  solution,
  inputs: [{ key: 's', label: 's (lowercase)', kind: 'string', default: 'aab', maxItems: 6 }],
  presets: [
    { label: 'aab', input: { s: 'aab' } },
    { label: 'All the same', input: { s: 'aaa' } },
    { label: 'No repeats', input: { s: 'abc' } },
    { label: 'Whole palindrome', input: { s: 'abba' } },
  ],
  validate: ({ s }) => (/^[a-z]+$/.test(s) ? null : 'Use 1 to 6 lowercase letters'),
  run({ s }) {
    const r = new TraceRecorder(solution);
    const tree = new CallTree(s);
    const path: string[] = [];
    const res: string[][] = [];
    let cut = 0;
    let to = 0;
    const view = () => [tree.panel('each branch cuts one piece off the front of what remains'), stringView(s, { title: 'string (bracket = piece being tested)', window: to > cut ? { from: cut, to: to - 1, label: 'piece', tone: 'active' } : undefined }), chipsView(path, { title: 'path: pieces chosen so far' }), chipsView(res.map(show), { title: 'partitions found' })];
    r.step('init', 'We cut the string into pieces from left to right. A piece is kept only if it reads the same backwards.', view(), {});
    let askedCheck = false;
    let askedEnd = false;
    let askedBad = false;
    const dfs = (start: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      cut = start;
      to = start;
      r.step('def', `dfs(${start}): the remaining text is "${s.slice(start) || '(nothing)'}".`, view(), { start });
      if (start === s.length) {
        if (!askedEnd) {
          askedEnd = true;
          r.predict('end', 'Nothing remains. What does that tell us about the path?', ['Every piece is a palindrome: record it', 'Something went wrong', 'We need to cut more'], 0, 'Only palindrome pieces were ever added, and together they cover the whole string.');
        }
        res.push([...path]);
        tree.tone(id, 'found');
        r.step('endRet', `The whole string is used: record ${show(path)}.`, view(), {});
        return;
      }
      for (let end = start + 1; end <= s.length; end++) {
        const piece = s.slice(start, end);
        cut = start;
        to = end;
        const ok = piece === [...piece].reverse().join('');
        r.step('piece', `Try the piece "${piece}".`, view(), {});
        if (!askedCheck) {
          askedCheck = true;
          r.predict('check', `Is "${piece}" a palindrome?`, ['Yes', 'No'], ok ? 0 : 1, ok ? 'It reads the same in both directions.' : 'Reversed it differs.');
        }
        if (!ok) {
          r.step('check', `"${piece}" reversed is "${[...piece].reverse().join('')}": not a palindrome, so skip this piece.`, view(), {});
          if (!askedBad) askedBad = true;
          continue;
        }
        path.push(piece);
        const child = tree.add(id, s.slice(end) || '∅', piece);
        r.step('choose', `"${piece}" is a palindrome: keep it and continue with "${s.slice(end) || 'nothing'}".`, view(), {});
        dfs(end, child);
        path.pop();
        tree.tone(id, 'active');
        r.step('undo', `Undo: remove "${piece}" and try a longer piece.`, view(), {});
      }
      if (tree.nodes[id].tone !== 'found') tree.tone(id, 'done');
    };
    dfs(0, tree.root);
    cut = 0;
    to = 0;
    r.step('done', `${res.length} partition${res.length === 1 ? '' : 's'}: ${res.map(show).join(' ')}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ s }) {
    const out: string[][] = [];
    const path: string[] = [];
    const go = (start: number) => {
      if (start === s.length) return void out.push([...path]);
      for (let end = start + 1; end <= s.length; end++) {
        const p = s.slice(start, end);
        if (p === [...p].reverse().join('')) {
          path.push(p);
          go(end);
          path.pop();
        }
      }
    };
    go(0);
    return out;
  },
});

export default problem({
  summary: 'Split a string into consecutive pieces so that every piece is a palindrome (reads the same forwards and backwards). Return every possible way to split it.',
  example: ['"aba"', '[["a","b","a"], ["aba"]]', 'Every piece is a palindrome in both splits.'],
  pattern: ['backtracking', ['backtracking', 'dp-1d', 'dfs', 'two-pointers'], 'At each position you choose where the next piece ends, keep it only if it is a palindrome, recurse on the rest and undo. Listing every split is backtracking.', {
    'dp-1d': 'DP can precompute which substrings are palindromes, but listing all splits still needs backtracking.',
    dfs: 'It is a DFS, with the undo of each cut that defines backtracking.',
    'two-pointers': 'Two pointers test each piece, but they do not enumerate the splits.',
  }],
  hints: [
    'If you fix the first piece, what remains?',
    'Which first pieces are allowed?',
    'dfs(start): if start == n record the path. For end from start + 1 to n: if s[start:end] is a palindrome, push it, dfs(end), pop.',
  ],
  insight: 'The choices at each step are the lengths of the next piece; only palindromic ones lead anywhere.',
  brute: 'Try all 2^(n−1) ways to cut the string and test every piece.',
  optimal: 'Backtracking prunes non-palindromic pieces early: O(n · 2ⁿ) worst case.',
  walk: ['dfs(start): if start == len(s), copy the path into the result.', 'For end in start + 1 … n: piece = s[start:end].', 'If the piece equals its reverse: path.append(piece), dfs(end), path.pop().', 'Start with dfs(0).'],
  edge: ['A single letter.', 'All the same letters (2^(n−1) results).', 'No repeated letters (only single-letter pieces).', 'The whole string is a palindrome.'],
  works: ['Every result is built from palindromic pieces covering the string exactly once.', 'Every valid partition is generated because all piece lengths are tried at each position.'],
  time: ['O(n · 2ⁿ)', 'Up to 2^(n−1) splits, each with palindrome checks and copying.'],
  space: ['O(n)', 'Recursion and path.'],
  solution,
  cases,
  sig: 'def partition(s):\n    # return every way to split s into palindromic pieces\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
