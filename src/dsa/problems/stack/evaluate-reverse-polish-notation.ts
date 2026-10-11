import type { Tone } from '@/engine/types';
import { arrayView, stackView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './evaluate-reverse-polish-notation.py?raw';
import cases from './evaluate-reverse-polish-notation.cases.json';

const OPS = ['+', '-', '*', '/'];
const apply = (op: string, a: number, b: number): number => (op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : Math.trunc(a / b) + 0);

const viz = vizOf<{ tokens: string[] }>({
  id: 'evaluate-reverse-polish-notation',
  title: 'Evaluate Reverse Polish Notation',
  solution,
  inputs: [{ key: 'tokens', label: 'tokens (comma separated)', kind: 'strings', default: ['2', '1', '+', '3', '*', '9', '6', '/', '-'], maxItems: 15 }],
  presets: [
    { label: 'Mixed', input: { tokens: ['2', '1', '+', '3', '*', '9', '6', '/', '-'] } },
    { label: 'Subtraction order', input: { tokens: ['10', '4', '-'] } },
    { label: 'Truncating division', input: { tokens: ['-7', '2', '/'] } },
  ],
  validate: ({ tokens }) => {
    let size = 0;
    for (const t of tokens) {
      if (OPS.includes(t)) {
        if (size < 2) return `"${t}" needs two numbers before it`;
        size--;
      } else if (!/^-?\d+$/.test(t)) return `"${t}" is not a whole number or one of + - * /`;
      else size++;
    }
    if (size !== 1) return 'The expression must leave exactly one value';
    for (let i = 0, st: number[] = []; i < tokens.length; i++) {
      const t = tokens[i];
      if (OPS.includes(t)) {
        const b = st.pop()!;
        const a = st.pop()!;
        if (t === '/' && b === 0) return 'Division by zero';
        st.push(apply(t, a, b));
      } else st.push(Number(t));
    }
    return null;
  },
  run({ tokens }) {
    const r = new TraceRecorder(solution);
    const stack: number[] = [];
    let askedOrder = false;
    let askedFirst = false;
    const view = (i: number, hot: Tone | null = null, stackTones: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'done';
      if (hot && i < tokens.length) tones[i] = hot;
      return [arrayView(tokens, { title: 'tokens', tones, pointers: i < tokens.length ? { i } : undefined }), stackView(stack, { title: 'stack of numbers', tones: stackTones })];
    };
    r.step('init', 'The stack holds numbers waiting for an operator.', view(0), {});
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      r.op();
      r.step('loop', `Read token ${tok}.`, view(i, 'active'), { i, tok });
      if (OPS.includes(tok)) {
        const b = stack[stack.length - 1];
        const a = stack[stack.length - 2];
        r.step('isOp', `${tok} is an operator: take the top two numbers. The one pushed second is b = ${b}, the one before it is a = ${a}.`, view(i, 'compare', { [stack.length - 1]: 'compare', [stack.length - 2]: 'compare' }), { a, b });
        const res = apply(tok, a, b);
        if (!askedFirst) {
          askedFirst = true;
          r.predictChoice('first', `a = ${a}, b = ${b}. What is a ${tok} b?`, String(res), [String(a + b + 1), String(a * b + 1), String(a - b - 1)], i, 'Apply the operator to the two newest numbers, a on the left and b on the right.');
        } else if ((tok === '-' || tok === '/') && !askedOrder) {
          askedOrder = true;
          r.predictChoice('order', `a = ${a}, b = ${b}. What is a ${tok} b?`, String(res), [String(tok === '-' ? b - a : a === 0 ? 0 : Math.trunc(b / a) + 0), String(a + b), String(a * b)], i, 'The operand pushed first (a) is on the left of the operator, so the order matters for - and /.');
        } else if (tok === '/' && !(a >= 0 && b > 0) && Math.trunc(a / b) !== Math.floor(a / b)) {
          r.predictChoice('div', `${a} / ${b} must round toward zero. What is the result?`, String(res), [String(Math.floor(a / b) + 0), String(res + 1), String(Math.round(a / b) + 0)], i, 'int(a / b) cuts off the fraction, which rounds toward zero for negatives too.');
        }
        stack.pop();
        stack.pop();
        stack.push(res);
        r.step(tok === '+' ? 'add' : tok === '-' ? 'sub' : tok === '*' ? 'mul' : 'div', `${a} ${tok} ${b} = ${res}. Push the result.`, view(i + 1, null, { [stack.length - 1]: 'new' }), { result: res });
      } else {
        stack.push(Number(tok));
        r.step('push', `${tok} is a number: push it.`, view(i + 1, null, { [stack.length - 1]: 'new' }), { top: Number(tok) });
      }
    }
    r.step('done', `One value is left: the answer is ${stack[0]}.`, view(tokens.length, null, { 0: 'found' }), { result: stack[0] });
    return { frames: r.frames, result: stack[0] };
  },
  reference({ tokens }) {
    const toks = [...tokens];
    const go = (): number => {
      const t = toks.pop()!;
      if (OPS.includes(t)) {
        const b = go();
        const a = go();
        return apply(t, a, b);
      }
      return Number(t);
    };
    return go();
  },
});

export default problem({
  summary: 'An arithmetic expression is written in reverse Polish form: operands first, then the operator that applies to them (so "3 4 +" means 3 + 4). Evaluate it. Division throws away the fraction, rounding toward zero.',
  example: ['tokens = ["6", "2", "/", "5", "+"]', '8', '6 / 2 = 3, then 3 + 5 = 8. No parentheses are ever needed in this notation.'],
  pattern: ['stack', ['stack', 'two-pointers', 'dfs', 'monotonic-stack'], 'An operator applies to the two most recent results. Push numbers, and on an operator pop two, compute, and push the answer back.', {
    'two-pointers': 'There is no symmetry or sorted order to exploit.',
    dfs: 'Recursing from the end also works, but a stack processes tokens left to right with no recursion.',
    'monotonic-stack': 'The stack here is plain; nothing is kept in sorted order.',
  }],
  hints: [
    'When you meet an operator, which two numbers does it apply to?',
    'They are the two most recent values that have not been used yet. What structure gives you the most recent ones first?',
    'Push numbers. On an operator pop b, then a, compute a op b and push it. Mind the order for subtraction and division.',
  ],
  insight: 'Numbers go on a stack; an operator pops two, applies itself (older operand on the left), and pushes the result.',
  brute: 'Repeatedly find the first operator preceded by two numbers and replace the three tokens with the result: O(n²).',
  optimal: 'Single left-to-right pass with a stack: O(n) time and space.',
  walk: ['Create an empty stack.', 'If a token is a number, push it.', 'If it is an operator, pop b (the top), then a, compute a op b, and push the result.', 'At the end the stack holds exactly one number: the answer. For division use int(a / b) to round toward zero.'],
  edge: ['A single number.', 'Subtraction and division need a − b, not b − a.', 'Negative numbers, including negative results of division (round toward zero).', 'Division that does not divide evenly.'],
  works: ['Every operator in a valid expression has exactly two operands available as the two most recent unused results, so popping two is always possible and correct.', 'Each token is handled once, and each operator reduces the stack by one, ending with a single value.'],
  time: ['O(n)', 'Each token is processed once with constant stack work.'],
  space: ['O(n)', 'The stack can hold up to about n/2 numbers.'],
  solution,
  cases,
  sig: 'def eval_rpn(tokens):\n    # evaluate the reverse Polish expression; division rounds toward zero\n    pass\n',
  viz,
  fromArgs: ([tokens]) => ({ tokens }),
});
