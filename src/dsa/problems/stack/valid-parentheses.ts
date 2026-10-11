import type { Tone } from '@/engine/types';
import { stackView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './valid-parentheses.py?raw';
import cases from './valid-parentheses.cases.json';

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const viz = vizOf<{ s: string }>({
  id: 'valid-parentheses',
  title: 'Valid Parentheses',
  solution,
  inputs: [{ key: 's', label: 'brackets', kind: 'string', default: '{[()()]}', maxItems: 20 }],
  presets: [
    { label: 'Valid', input: { s: '{[()()]}' } },
    { label: 'Wrong closer', input: { s: '([)]' } },
    { label: 'Unclosed', input: { s: '((' } },
    { label: 'Closer first', input: { s: ')(' } },
    { label: 'Empty', input: { s: '' } },
  ],
  validate: ({ s }) => ([...s].find((c) => !'()[]{}'.includes(c)) ? 'Use only ( ) [ ] { } characters' : null),
  run({ s }) {
    const r = new TraceRecorder(solution);
    const ch = [...s];
    const stack: string[] = [];
    const view = (i: number, hot: Tone | null = null, stackTone: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'done';
      if (hot && i < ch.length) tones[i] = hot;
      return [stringView(s, { title: 'brackets', tones, pointers: i < ch.length ? { i } : undefined }), stackView(stack, { title: 'stack of openers waiting for a match', tones: stackTone })];
    };
    r.step('init', 'pairs maps each closing bracket to the opener it needs.', view(0), {});
    r.step('stack', 'The stack holds openers that are still waiting for their closer.', view(0), {});
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      r.op();
      r.step('loop', `Read ${c}.`, view(i, 'active'), { i, c });
      if (c in PAIRS) {
        r.step('isClose', `${c} is a closer: the top of the stack must be ${PAIRS[c]}.`, view(i, 'compare', stack.length ? { [stack.length - 1]: 'compare' } : {}), { stack: stack.join('') || 'empty' });
        const ok = stack.length > 0 && stack[stack.length - 1] === PAIRS[c];
        r.predict(ok ? 'ok' : 'bad', `The closer is ${c} and the top of the stack is ${stack.length ? stack[stack.length - 1] : '(empty)'}. Does it match?`, ['Yes: pop the opener', 'No: the string is invalid'], ok ? 0 : 1, ok ? 'The most recent unmatched opener is exactly the one this closer needs.' : stack.length ? 'The most recent opener is a different kind, so the nesting is broken.' : 'There is no opener waiting for this closer.');
        if (!ok) {
          r.step('fail', stack.length ? `${c} needs ${PAIRS[c]} but the top is ${stack[stack.length - 1]}: return False.` : `There is nothing to match ${c}: return False.`, view(i, 'error', stack.length ? { [stack.length - 1]: 'error' } : {}), { result: false });
          return { frames: r.frames, result: false };
        }
        stack.pop();
        r.step('pop', `Matched: pop ${PAIRS[c]}.`, view(i + 1), { stack: stack.join('') || 'empty' });
      } else {
        stack.push(c);
        r.step('push', `${c} is an opener: push it and wait for its closer.`, view(i + 1, null, { [stack.length - 1]: 'new' }), { stack: stack.join('') });
      }
    }
    r.predict('end', `The text is finished and the stack holds ${stack.length ? stack.join(' ') : 'nothing'}. What is returned?`, ['True', 'False'], stack.length === 0 ? 0 : 1, stack.length ? 'Openers are left without a closer.' : 'Every opener found its closer.');
    r.step('done', stack.length ? `${stack.length} opener${stack.length === 1 ? ' is' : 's are'} still unmatched: return False.` : 'Every opener was matched: return True.', view(ch.length), { result: stack.length === 0 });
    return { frames: r.frames, result: stack.length === 0 };
  },
  reference({ s }) {
    let t = s;
    let prev = '';
    while (prev !== t) {
      prev = t;
      t = t.replace('()', '').replace('[]', '').replace('{}', '');
    }
    return t === '';
  },
});

export default problem({
  summary: 'A string contains only the brackets ( ) [ ] { }. Decide whether it is well formed: every opener is closed by the same kind of bracket, and pairs nest properly (a bracket opened later is closed first).',
  example: ['s = "[({})]"', 'true', '"[(])" would be false: the round bracket is still open when the square one closes.'],
  pattern: ['stack', ['stack', 'two-pointers', 'sliding-window', 'dfs'], 'The most recently opened bracket must be closed first. That last-in, first-out behaviour is exactly a stack.', {
    'two-pointers': 'Matching brackets can be far apart and nested, so comparing from the two ends does not work.',
    'sliding-window': 'There is no contiguous range to maintain.',
    dfs: 'Recursion could mirror the nesting, but an explicit stack is simpler and handles deep input safely.',
  }],
  hints: [
    'When you see a closing bracket, which opener must it pair with? Is it the first one you saw or the latest unmatched one?',
    'Keep the unmatched openers somewhere you can look at the newest one quickly and remove it.',
    'Push openers on a stack. On a closer, the top of the stack must be its partner: pop it. If not (or the stack is empty), the string is invalid.',
  ],
  insight: 'Push every opener; each closer must match the newest unmatched opener, which is the top of the stack.',
  brute: 'Repeatedly delete adjacent "()", "[]", "{}" until nothing changes: O(n²).',
  optimal: 'One pass with a stack: O(n) time, O(n) space.',
  walk: ['Create a map from each closer to its opener and an empty stack.', 'For an opener, push it.', 'For a closer, if the stack is empty or its top is not the matching opener, return False; otherwise pop.', 'After the loop the string is valid only if the stack is empty (no opener was left unmatched).'],
  edge: ['Empty string is valid.', 'A closer first: the stack is empty when it arrives.', 'Right kinds but wrong order, like "([)]".', 'Openers left over at the end, like "((".'],
  works: ['Invariant: the stack holds exactly the openers that have not been closed yet, newest on top. A closer can only legally close the newest one.', 'If the string is valid every closer finds its opener and the stack ends empty; any violation is caught at the moment it happens.'],
  time: ['O(n)', 'Each character is pushed or popped once.'],
  space: ['O(n)', 'In the worst case (all openers) the stack holds every character.'],
  solution,
  cases,
  sig: 'def is_valid(s):\n    # True if every bracket is closed by the right kind, in the right order\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
