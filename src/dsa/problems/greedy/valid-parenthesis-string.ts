import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './valid-parenthesis-string.py?raw';
import cases from './valid-parenthesis-string.cases.json';

const viz = vizOf<{ s: string }>({
  id: 'valid-parenthesis-string',
  title: 'Valid Parenthesis String',
  solution,
  inputs: [{ key: 's', label: 's (using ( ) and * only; * can be (, ) or empty)', kind: 'string', default: '(*))', maxItems: 14 }],
  presets: [
    { label: 'Star saves it', input: { s: '(*))' } },
    { label: 'Star as opener', input: { s: '*)' } },
    { label: 'Leading closer', input: { s: ')*' } },
    { label: 'Too many openers', input: { s: '(**((' } },
  ],
  validate: ({ s }) => (/^[()*]*$/.test(s) ? null : 'Use only ( ) and *'),
  run({ s }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = 0;
    let askedStar = false;
    let askedDead = false;
    let askedClamp = false;
    const view = (i: number) => [stringView(s, { title: 'string', pointers: i >= 0 && i < s.length ? { i } : {} }), hashMapView({ 'lo (fewest unmatched "(")': lo, 'hi (most unmatched "(")': hi })];
    r.step('init', 'Track the RANGE of possible numbers of unmatched "(": lo if every * helps by closing, hi if every * helps by opening.', view(-1), {});
    for (let i = 0; i < s.length; i++) {
      r.op();
      const ch = s[i];
      if (ch === '*' && !askedStar) {
        askedStar = true;
        r.step('loop', `Next character: "*".`, view(i), {});
        r.predict('star', `A "*" can be "(", ")" or nothing. What does it do to the range [lo, hi] = [${lo}, ${hi}]?`, ['lo goes down by 1 (as ")"), hi goes up by 1 (as "(")', 'Both go up', 'Nothing changes'], 0, 'As ")" it removes one open; as "(" it adds one. The range widens in both directions.');
      }
      if (ch === '(') {
        lo++;
        hi++;
      } else if (ch === ')') {
        lo--;
        hi--;
      } else {
        lo--;
        hi++;
      }
      r.step(ch === '(' ? 'open' : ch === ')' ? 'close' : 'star', `"${ch}": lo = ${lo}, hi = ${hi}.`, view(i), { lo, hi });
      if (hi < 0) {
        if (!askedDead) {
          askedDead = true;
          r.predict('dead', `hi = ${hi} is negative: even the most generous choice leaves a ")" without a "(". Result?`, ['False: there is no way to balance this', 'True', 'Keep going'], 0, 'hi is the best case; if the best case already has too many closers, the string cannot be valid.');
        }
        r.step('deadRet', 'hi < 0: return False.', view(i), { result: false });
        return { frames: r.frames, result: false };
      }
      if (lo < 0) {
        if (!askedClamp) {
          askedClamp = true;
          r.predict('clamp', `lo = ${lo} is negative. What do we do?`, ['Reset lo to 0: we can simply not use a * as a closer', 'Return False', 'Leave it negative'], 0, 'A negative lo would mean a negative number of open brackets. A star can instead stay empty or open, so 0 is achievable.');
        }
        lo = 0;
        r.step('clamp', 'lo cannot be negative: clamp it to 0.', view(i), { lo });
      }
    }
    const res = lo === 0;
    r.step('done', res ? 'lo = 0: some choice of the stars balances the string. Return True.' : `lo = ${lo} > 0: even with every * as ")" some "(" stays open. Return False.`, view(s.length), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ s }) {
    let lo = 0;
    let hi = 0;
    for (const ch of s) {
      if (ch === '(') { lo++; hi++; } else if (ch === ')') { lo--; hi--; } else { lo--; hi++; }
      if (hi < 0) return false;
      lo = Math.max(lo, 0);
    }
    return lo === 0;
  },
});

export default problem({
  summary: 'A string contains only "(", ")" and "*". Each "*" may be treated as "(", as ")", or as nothing. Decide whether some choice makes the string a valid set of brackets: every "(" matched by a later ")", and no ")" left unmatched.',
  example: ['"(*))"', 'true', 'Treat the star as "(": the string becomes "(())", which is balanced.'],
  pattern: ['greedy', ['greedy', 'stack', 'dp-2d', 'backtracking'], 'Track the lowest and highest possible number of unmatched "(" after each character. The string is valid when the highest never goes negative and the lowest can end at 0.', {
    stack: 'Two stacks (for "(" and "*") also work, but the interval of possible counts needs only two numbers.',
    'dp-2d': 'A table over (position, open count) works and is slower.',
    backtracking: 'Trying 3 options per star is exponential.',
  }],
  hints: [
    'With no stars, one counter is enough. What changes when a star can be three different things?',
    'Instead of guessing, track the smallest and largest possible number of open brackets.',
    '"(" adds 1 to both, ")" subtracts 1 from both, "*" does lo −= 1 and hi += 1. If hi < 0 return False; clamp lo at 0. At the end, lo must be 0.',
  ],
  insight: 'The set of reachable open-bracket counts is always a contiguous range, so two numbers describe it.',
  brute: 'Try all 3^k star choices: exponential.',
  optimal: 'Range tracking: O(n) time, O(1) space.',
  walk: ['lo = hi = 0.', 'For each character update lo and hi as above.', 'If hi < 0 return False.', 'lo = max(lo, 0). At the end return lo == 0.'],
  edge: ['Empty string (valid).', 'A leading ")" that cannot be fixed.', 'Only stars.', 'More "(" than ")" plus stars that are not enough.'],
  works: ['After each prefix, lo and hi are the minimum and maximum possible open counts, and every value between them is possible, so checking hi ≥ 0 at each step and 0 ∈ [lo, hi] at the end is exact.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Two counters.'],
  solution,
  cases,
  sig: 'def check_valid_string(s):\n    # s contains ( ) and * where * may be (, ) or empty; True if some choice is a valid bracket string\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
