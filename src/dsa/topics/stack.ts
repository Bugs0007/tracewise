import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A stack gives you last-in, first-out: the thing you handle next is always the most recent thing you remembered. Any problem about nesting, undoing, or "the nearest earlier element that…" is a stack problem in disguise.',
    'Three shapes cover this topic. Matching and nesting (brackets, expressions): push openers or operands, pop when the partner arrives. Design (Min Stack): store extra information with each entry. And the monotonic stack: keep entries in sorted order so that each new element settles everything it beats, which solves "next greater/smaller" and histogram problems in one pass.',
    'In a monotonic stack every element is pushed once and popped once, so even though there is a loop inside a loop the total work is linear.',
  ],
  checklist: [
    'The most recent unmatched thing is what you need next (brackets, nested structure, undo).',
    'You are evaluating an expression where operands wait for an operator.',
    'You need the next (or previous) greater or smaller element for every position.',
    'A new element resolves a whole run of earlier ones at once (daily temperatures, histogram bars).',
    'You must support a stack operation plus an extra query such as min or max in O(1).',
    'A recursion could do it, but an explicit stack avoids depth limits and shows the state.',
  ],
  template: [
    {
      title: 'Matching with a stack',
      code: `stack = []
for ch in s:
    if ch is an opener:
        stack.append(ch)
    else:
        if not stack or stack[-1] != partner[ch]:
            return False
        stack.pop()
return not stack`,
    },
    {
      title: 'Monotonic stack: next greater element',
      code: `res = [0] * len(a)
stack = []                        # indices whose answer is still unknown
for i, x in enumerate(a):
    while stack and a[stack[-1]] < x:
        j = stack.pop()
        res[j] = i - j            # x is the next greater for j
    stack.append(i)`,
    },
    {
      title: 'Extra information on every entry (Min Stack)',
      code: `self.stack = []                   # (value, minimum at or below)
def push(self, v):
    low = min(v, self.stack[-1][1]) if self.stack else v
    self.stack.append((v, low))`,
    },
  ],
  boss: {
    seconds: 240,
    problem: 'daily-temperatures',
    note: 'The boss problem is Daily Temperatures. Decide what the stack holds and when you pop before you type.',
    quiz: [
      {
        prompt: 'Which problem is a natural fit for a stack?',
        options: ['Checking that brackets are balanced', 'Finding two numbers that sum to a target in a sorted list', 'Counting letters in a string', 'Finding the median of a stream'],
        answer: 0,
        explain: 'The most recently opened bracket must be closed first: last in, first out.',
      },
      {
        prompt: 'Min Stack must return the minimum in O(1). What is the standard trick?',
        options: ['Store (value, minimum so far) with every entry', 'Scan the stack on each call', 'Keep the stack sorted', 'Use a hash map of counts'],
        answer: 0,
        explain: 'Each entry remembers the minimum at or below it, so the top entry always knows the minimum, and popping restores the previous one.',
      },
      {
        prompt: 'In Evaluate Reverse Polish Notation, for `a b -` which value is subtracted from which?',
        options: ['a − b, where b was pushed last', 'b − a', 'a + b', 'It does not matter'],
        answer: 0,
        explain: 'The top of the stack is the right operand (b); the element below it is the left operand (a). Order matters for - and /.',
      },
      {
        prompt: 'A monotonic stack processes each element with a `while` loop inside the `for` loop. Why is the total still O(n)?',
        options: ['Every element is pushed once and popped at most once', 'The while loop never runs', 'The input is sorted', 'Python optimises it'],
        answer: 0,
        explain: 'Total pops cannot exceed total pushes, so across the whole run the inner loop does at most n iterations.',
      },
      {
        prompt: 'For Daily Temperatures, what does the stack contain?',
        options: ['Indices of days still waiting for a warmer day', 'All temperatures seen so far', 'The answer array', 'Only the warmest day'],
        answer: 0,
        explain: 'A warmer day pops every colder waiting day and records how long each waited.',
      },
      {
        prompt: 'In Largest Rectangle in Histogram, why does a shorter bar force the stack to pop taller bars?',
        options: ['A shorter bar ends the rectangles of taller bars before it', 'Shorter bars must be on top', 'It reduces memory', 'Popping sorts the bars'],
        answer: 0,
        explain: 'A taller bar cannot extend its rectangle past a shorter bar, so its width is fixed at that moment.',
      },
      {
        prompt: 'Generate Parentheses uses which two conditions to stay valid?',
        options: ['Add "(" if opened < n; add ")" if closed < opened', 'Add ")" whenever possible', 'Alternate "(" and ")"', 'Sort the results'],
        answer: 0,
        explain: 'Those two rules keep every prefix valid, so every completed string is balanced and none are wasted.',
      },
    ],
  },
};

export default topic;
