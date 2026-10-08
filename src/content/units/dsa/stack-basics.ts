import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}    #@init
    stack = []                                #@stack
    for ch in s:                              #@loop
        if ch in pairs:                       #@isClose
            if not stack or stack[-1] != pairs[ch]:   #@check
                return False                  #@fail
            stack.pop()                       #@pop
        else:
            stack.append(ch)                  #@push
    return not stack                          #@done
`;

interface In {
  s: string;
}

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const viz: VizDef<In> = {
  id: 'stack-basics',
  title: 'Stack: valid parentheses',
  code,
  language: 'python',
  inputs: [{ key: 's', label: 'Brackets', kind: 'string', default: '{[()()]}', maxItems: 14 }],
  presets: [
    { label: 'Wrong closer', input: { s: '([)]' } },
    { label: 'Unclosed opener', input: { s: '((' } },
    { label: 'Closer first', input: { s: ')(' } },
    { label: 'Empty string', input: { s: '' } },
  ],
  run({ s }) {
    for (const ch of s) if (!'()[]{}'.includes(ch)) throw new Error(`Use only ( ) [ ] { } characters (found "${ch}")`);
    const chars = [...s];
    const r = new Recorder(code);
    const stack: string[] = [];

    const panels = (i: number, tones: Record<number, Tone> = {}, stackTones: Record<number, Tone> = {}): Panel[] => {
      const t: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) t[k] = 'done';
      Object.assign(t, tones);
      const items: ListItem[] = stack.map((c, k) => ({ id: `${k}:${c}`, label: c, tone: stackTones[k] ?? 'frontier' }));
      return [
        { type: 'array', title: 'Input', values: chars, tones: t, pointers: i >= 0 && i < chars.length ? { i } : undefined, hideIndex: false },
        { type: 'list', title: 'Stack', items, orientation: 'vertical', endLabel: 'top', emptyText: 'empty' },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ stack: `[${stack.join(' ')}]`, ...extra });

    r.step('init', 'pairs maps each closing bracket to the opener it needs', panels(-1), vars());
    r.step('stack', 'The stack starts empty: it will hold openers still waiting for a match', panels(-1), vars());
    if (!chars.length) {
      r.step('done', 'Nothing to match: the stack is empty, so return True', panels(0), vars());
      return { frames: r.frames, result: true };
    }
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      r.op();
      r.step('loop', `Read "${ch}" at index ${i}`, panels(i, { [i]: 'active' }), vars({ ch }));
      if (ch in PAIRS) {
        const need = PAIRS[ch];
        const top = stack.length ? stack[stack.length - 1] : null;
        r.op();
        if (top === null || top !== need) {
          r.step('check', top === null ? `"${ch}" needs "${need}" but the stack is empty` : `"${ch}" needs "${need}" but the top is "${top}"`, panels(i, { [i]: 'error' }, top === null ? {} : { [stack.length - 1]: 'error' }), vars({ ch }));
          r.step('fail', 'Mismatch: return False', panels(i, { [i]: 'error' }, top === null ? {} : { [stack.length - 1]: 'error' }), vars({ ch }));
          return { frames: r.frames, result: false };
        }
        r.step('check', `"${ch}" needs "${need}" and the top is "${top}": a match`, panels(i, { [i]: 'compare' }, { [stack.length - 1]: 'compare' }), vars({ ch }));
        const popped = stack.pop() as string;
        r.step('pop', `Pop "${popped}": that pair is closed`, panels(i + 1), vars({ ch }));
      } else {
        stack.push(ch);
        r.step('push', `"${ch}" is an opener: push it`, panels(i, { [i]: 'active' }, { [stack.length - 1]: 'new' }), vars({ ch }));
      }
    }
    const ok = stack.length === 0;
    r.step('done', ok ? 'End of input and the stack is empty: return True' : `End of input but ${stack.length} opener(s) never closed: return False`, panels(chars.length, {}, ok ? {} : Object.fromEntries(stack.map((_, k) => [k, 'error' as Tone]))), vars());
    return { frames: r.frames, result: ok };
  },
  reference({ s }) {
    let t = s;
    while (/\(\)|\[\]|\{\}/.test(t)) t = t.replace(/\(\)|\[\]|\{\}/g, '');
    return t.length === 0;
  },
};

const tests = [
  { args: ['()'], expected: true },
  { args: ['()[]{}'], expected: true },
  { args: ['(]'], expected: false, name: 'wrong closer' },
  { args: ['([)]'], expected: false, name: 'interleaved' },
  { args: ['{[]}'], expected: true, name: 'nested' },
  { args: [''], expected: true, name: 'empty string' },
  { args: ['('], expected: false, name: 'unclosed opener' },
  { args: [')'], expected: false, name: 'closer on empty stack' },
  { args: ['())'], expected: false, name: 'extra closer' },
];

const unit: Unit = {
  id: 'stack-basics',
  hook: 'A stack is last-in, first-out, and "most recent unfinished thing" is exactly what parsers, undo and call stacks need. Valid parentheses is the standard first stack question, and the empty-stack cases are where it is won or lost.',
  predict: {
    prompt: 'Every bracket type in "([)]" appears the same number of times as its partner. What does the stack algorithm say?',
    options: ['Valid: the counts match', 'Invalid at the ")": the top of the stack is "[", not "("', 'Invalid at the end: the stack is not empty', 'Invalid at the first character'],
    answer: 1,
    explain: 'After pushing ( and [, the top is "[". The ")" needs "(" but finds "[" on top, so the pairs interleave and the answer is False. Counting alone cannot see the nesting order; a stack can.',
  },
  viz,
  deeper: {
    points: [
      'Push every opener. For a closer, the most recent unmatched opener (the top) must be its partner.',
      'Pop only after you checked that the stack is non-empty and the top matches.',
      'At the end the stack must be empty: leftover openers were never closed.',
      'In Python a list is a stack: `append` pushes, `pop()` pops, `stack[-1]` peeks, all O(1).',
      'The same idea evaluates expressions, handles undo, and replaces recursion with an explicit call stack.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    pitfalls: ['Calling `pop()` on an empty stack (closer first, like ")")', 'Returning True without checking that the stack is empty at the end', 'Comparing the closer with the wrong end of the list (`stack[0]` instead of `stack[-1]`)'],
  },
  practice: {
    language: 'python',
    fnName: 'is_valid',
    statement: 'Given a string of ( ) [ ] { } characters, return True if every bracket is closed by the same type in the correct order.',
    signature: 'def is_valid(s):',
    solution: `def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack[-1] != @@pairs[ch]@@:
                return False
            @@stack.pop()@@
        else:
            @@stack.append(ch)@@
    return @@not stack@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'is_valid',
    statement: 'Strings that start with a closing bracket crash instead of returning False. Fix it.',
    buggy: `def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in pairs:
            if stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack`,
    fixed: `def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack`,
    tests,
    bugType: 'pop from empty stack',
    hint: 'What does `stack.pop()` do when nothing was pushed yet, for example on ")"?',
    explanation: 'Popping an empty list raises IndexError. A closer with nothing to match is simply invalid, so check `not stack` first; `or` short-circuits and the pop never happens.',
  },
  boss: {
    title: 'Evaluate a reverse Polish expression',
    statement: 'Evaluate an arithmetic expression given in postfix form as a list of string tokens: integers and the operators + - * /. Division truncates toward zero (7 / -2 = -3). The expression is always valid. Return the integer result.',
    language: 'python',
    fnName: 'eval_rpn',
    starter: `def eval_rpn(tokens):
    # your code here
    pass
`,
    solution: `def eval_rpn(tokens):
    stack = []
    for t in tokens:
        if t in ('+', '-', '*', '/'):
            b = stack.pop()
            a = stack.pop()
            if t == '+':
                stack.append(a + b)
            elif t == '-':
                stack.append(a - b)
            elif t == '*':
                stack.append(a * b)
            else:
                stack.append(int(a / b))
        else:
            stack.append(int(t))
    return stack[0]`,
    tests: [
      { args: [['2', '1', '+', '3', '*']], expected: 9 },
      { args: [['4', '13', '5', '/', '+']], expected: 6 },
      { args: [['10', '6', '9', '3', '+', '-11', '*', '/', '*', '17', '+', '5', '+']], expected: 22, name: 'longer expression' },
      { args: [['7', '-2', '/']], expected: -3, name: 'truncates toward zero' },
      { args: [['5']], expected: 5, name: 'single number' },
      { args: [['3', '4', '-']], expected: -1, name: 'operand order' },
    ],
    hints: ['Numbers go on the stack. An operator pops the two most recent numbers and pushes the result back.', 'The first pop is the RIGHT operand: b = pop(), a = pop(), then compute a op b. For division use int(a / b), which truncates toward zero.'],
    combines: ['stack-basics'],
  },
};

export default unit;
