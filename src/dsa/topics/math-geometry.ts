import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'These problems are about getting the arithmetic and the indices exactly right rather than about a famous algorithm. Grids are rotated, peeled, or cleared; digits are added and multiplied by hand; powers are computed with few multiplications; a few points on a plane have to be matched into squares.',
    'The habit that pays off: simulate a tiny example on paper first, write down the index formula (where does cell (i, j) go? which position does digit i times digit j land in?), and only then code. Most bugs are off-by-one indices or forgetting to separate "look" from "change".',
    'A few ideas recur. Split a geometric move into simpler ones (rotation = transpose + reverse). Keep boundaries that shrink (spiral). Collect first, change second (set zeroes). Do arithmetic from the least significant end with a carry (plus one, multiply). Square to halve the work (power). Detect a cycle with two speeds (happy number).',
  ],
  checklist: [
    'The input is a matrix and the output is a transformed matrix or a path through it: write the index formula for one cell.',
    'You must visit a grid in a pattern (spiral, layers): keep four shrinking boundaries.',
    'A change in one cell must not influence decisions about other cells: record first, apply second.',
    'Numbers are given as strings or digit arrays: process from the right with a carry.',
    'A value repeats a process until it settles or loops: slow and fast pointers, or a set of seen values.',
    'A repeated operation (x * x * … ) can be halved each round: look at the bits of the exponent.',
    'Counting shapes from points: fix one corner or one diagonal and look the rest up in a hash map.',
  ],
  template: [
    {
      title: 'Rotate a square matrix 90° clockwise in place',
      code: `n = len(m)
for i in range(n):
    for j in range(i + 1, n):
        m[i][j], m[j][i] = m[j][i], m[i][j]   # transpose
for row in m:
    row.reverse()                            # mirror`,
    },
    {
      title: 'Add with carry from the right',
      code: `for i in range(len(digits) - 1, -1, -1):
    if digits[i] < 9:
        digits[i] += 1
        return digits
    digits[i] = 0
return [1] + digits`,
    },
    {
      title: 'Exponentiation by squaring',
      code: `result = 1.0
while n:
    if n & 1:
        result *= x
    x *= x
    n >>= 1`,
    },
  ],
  boss: {
    seconds: 420,
    problem: 'detect-squares',
    note: 'The boss problem is Detect Squares. Say what is stored, how a query picks the diagonal point, and why the counts are multiplied.',
    quiz: [
      {
        prompt: 'A 90° clockwise rotation of a square matrix equals…',
        options: ['A transpose followed by reversing each row', 'Reversing each row only', 'Swapping the first and last rows', 'Sorting each column'],
        answer: 0,
        explain: 'Transposing sends (i, j) to (j, i); reversing a row then sends column j to n − 1 − j.',
      },
      {
        prompt: 'In Set Matrix Zeroes, why do we record the zero rows and columns before changing anything?',
        options: ['Zeros we write ourselves would be mistaken for original zeros', 'It saves memory', 'Python lists are immutable', 'To sort the zeros'],
        answer: 0,
        explain: 'Deciding from the original grid keeps the result correct; changing as you go would spread zeros too far.',
      },
      {
        prompt: 'In Plus One, when can the loop stop early?',
        options: ['At the first digit from the right that is less than 9', 'At the first 9', 'After one step always', 'Never'],
        answer: 0,
        explain: 'That digit absorbs the +1 without producing a carry.',
      },
      {
        prompt: 'In exponentiation by squaring, what does each 1-bit of the exponent mean?',
        options: ['The current power x^(2^k) is multiplied into the result', 'The result is squared', 'x is halved', 'The loop ends'],
        answer: 0,
        explain: 'x^n is the product of x^(2^k) for each bit k that is set in n.',
      },
      {
        prompt: 'In Multiply Strings, digit i of num1 times digit j of num2 contributes to which positions?',
        options: ['i + j + 1 (the digit) and i + j (the carry)', 'i × j', 'i and j', 'Only the last position'],
        answer: 0,
        explain: 'Place values add: the weights of the two digits multiply to the weight of position i + j + 1.',
      },
    ],
  },
};

export default topic;
