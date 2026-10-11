import { chipsView, hashMapView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './letter-combinations-of-a-phone-number.py?raw';
import cases from './letter-combinations-of-a-phone-number.cases.json';

const PHONE: Record<string, string> = { '2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl', '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz' };

const viz = vizOf<{ digits: string }>({
  id: 'letter-combinations-of-a-phone-number',
  title: 'Letter Combinations of a Phone Number',
  solution,
  inputs: [{ key: 'digits', label: 'digits 2-9', kind: 'string', default: '23', maxItems: 3 }],
  presets: [
    { label: '23', input: { digits: '23' } },
    { label: 'One digit', input: { digits: '7' } },
    { label: 'Repeated', input: { digits: '22' } },
    { label: 'Empty', input: { digits: '' } },
  ],
  validate: ({ digits }) => (/^[2-9]*$/.test(digits) ? null : 'Use only the digits 2 to 9'),
  run({ digits }) {
    const r = new TraceRecorder(solution);
    if (!digits) {
      r.step('empty', 'No digits means no combinations at all (not even an empty string).', [chipsView([], { title: 'result' })], {});
      r.step('emptyRet', 'Return [].', [chipsView([], { title: 'result' })], { result: '[]' });
      return { frames: r.frames, result: [] };
    }
    const tree = new CallTree('');
    const path: string[] = [];
    const res: string[] = [];
    const view = () => [
      hashMapView(Object.fromEntries([...digits].map((d) => [d, PHONE[d]])), { title: 'keypad letters' }),
      tree.panel('each level picks a letter for the next digit'),
      chipsView(path, { title: 'path: letters chosen' }),
      chipsView(res, { title: 'combinations' }),
    ];
    const total = [...digits].reduce((a, d) => a * PHONE[d].length, 1);
    r.step('init', `Digits "${digits}". Each digit maps to 3 or 4 letters, so there will be ${total} combinations.`, view(), {});
    r.predictChoice('count', `How many combinations will there be for "${digits}"?`, String(total), [String(total + 1), String([...digits].reduce((a, d) => a + PHONE[d].length, 0)), String(digits.length * 3)], digits.length, 'Multiply the number of letters of each digit: one independent choice per digit.');
    let askedLoop = false;
    const dfs = (i: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      r.step('def', i < digits.length ? `dfs(${i}): choose a letter for digit ${digits[i]} (${PHONE[digits[i]]}).` : `dfs(${i}): every digit has a letter.`, view(), { i });
      if (i === digits.length) {
        res.push(path.join(''));
        tree.tone(id, 'found');
        r.step('record', `Record "${path.join('')}".`, view(), {});
        return;
      }
      if (!askedLoop) {
        askedLoop = true;
        r.predict('loop', `Digit ${digits[i]} has ${PHONE[digits[i]].length} letters. How many branches does this call create?`, [`${PHONE[digits[i]].length}, one per letter`, '1', `${digits.length + 1}`], 0, 'Each letter of the digit is a separate choice to explore.');
      }
      for (const ch of PHONE[digits[i]]) {
        path.push(ch);
        const child = tree.add(id, path.join(''), ch);
        r.step('choose', `Choose "${ch}".`, view(), {});
        dfs(i + 1, child);
        path.pop();
        tree.tone(id, 'active');
        r.step('undo', `Undo "${ch}" and try the next letter.`, view(), {});
      }
      tree.tone(id, 'done');
    };
    dfs(0, tree.root);
    r.step('done', `${res.length} combinations.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ digits }) {
    if (!digits) return [];
    return [...digits].reduce<string[]>((acc, d) => acc.flatMap((p) => [...PHONE[d]].map((c) => p + c)), ['']);
  },
});

export default problem({
  summary: 'On an old phone keypad each digit from 2 to 9 stands for several letters (2 = abc, 3 = def, and so on). Given a string of digits, return every letter string those digits could spell. An empty input gives an empty list.',
  example: ['"23"', '[ad, ae, af, bd, be, bf, cd, ce, cf]', 'Pick one letter for 2 and one for 3.'],
  pattern: ['backtracking', ['backtracking', 'bfs', 'dfs', 'hash-lookup'], 'Each digit is one decision with several options. Building the string one letter at a time, recursing, and undoing is backtracking.', {
    bfs: 'Growing the list of strings digit by digit also works, but it copies strings at every level.',
    dfs: 'It is a DFS; backtracking names the choose / undo discipline.',
    'hash-lookup': 'The digit-to-letters map is just data.',
  }],
  hints: [
    'How many choices do you have for the first digit? For the second?',
    'What is the base case when every digit has been handled?',
    'dfs(i): if i == len(digits) join the path and record it. Otherwise loop over the letters of digits[i]: push, dfs(i + 1), pop.',
  ],
  insight: 'The recursion depth equals the number of digits; each level loops over that digit’s letters.',
  brute: 'Iteratively build the product of all letter sets: the same output.',
  optimal: 'Backtracking: O(4ⁿ · n) time (n digits, up to 4 letters each).',
  walk: ['If digits is empty return [].', 'Map each digit to its letters.', 'dfs(i): when i == len(digits) record "".join(path).', 'Otherwise for each letter of digits[i]: append, recurse, pop.'],
  edge: ['Empty string.', 'Digits 7 and 9 have four letters.', 'Repeated digits.', 'A single digit.'],
  works: ['The decision tree has one level per digit and one branch per letter, so each leaf is a unique combination.', 'Popping resets the path for the next sibling.'],
  time: ['O(4ⁿ · n)', 'Up to 4ⁿ combinations of length n.'],
  space: ['O(n)', 'Recursion and path (not counting output).'],
  solution,
  cases,
  sig: 'def letter_combinations(digits):\n    # digits is a string of 2-9; return every letter combination\n    pass\n',
  viz,
  fromArgs: ([digits]) => ({ digits }),
});
