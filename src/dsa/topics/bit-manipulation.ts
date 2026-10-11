import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Numbers are stored as bits, and a handful of bit operations let you answer questions about them directly: AND (&) keeps bits that are 1 in both, OR (|) keeps bits that are 1 in either, XOR (^) keeps bits that differ, and shifts (<< and >>) slide the bits left or right, which doubles or halves the number.',
    'The problems here lean on a few identities. x ^ x = 0 and x ^ 0 = x, so pairs cancel. n & (n − 1) clears the lowest 1 bit. n >> 1 drops the last bit, so the answer for n can be built from the answer for n >> 1. Adding without + splits into a XOR (sum without carries) and an AND shifted left (the carries).',
    'Remember two practical points in Python: integers have no fixed width, so a 32-bit problem needs an explicit mask (& 0xFFFFFFFF) or an explicit 32-round loop, and negative numbers behave as an infinite string of leading 1 bits.',
  ],
  checklist: [
    'Everything appears an even number of times except one: XOR cancels the pairs.',
    'You need to count or clear 1 bits: n & (n − 1).',
    'A value for n depends on n >> 1: fill an array with bits[i] = bits[i >> 1] + (i & 1).',
    'The task involves a fixed width (32 bits): loop exactly 32 times or mask with 0xFFFFFFFF.',
    'You must add or compare without arithmetic operators: use XOR and AND-shift for carries.',
    'A digit-by-digit transformation (reverse, sum): extract with % 10 and // 10 and rebuild with · 10 + digit.',
  ],
  template: [
    {
      title: 'XOR cancels pairs',
      code: `result = 0
for x in nums:
    result ^= x          # pairs vanish; the odd one out remains`,
    },
    {
      title: 'Count / clear the lowest set bit',
      code: `count = 0
while n:
    n &= n - 1           # clear the lowest 1 bit
    count += 1`,
    },
    {
      title: 'Add without +',
      code: `mask = 0xFFFFFFFF
while b:
    a, b = (a ^ b) & mask, ((a & b) << 1) & mask
return a if a <= 0x7FFFFFFF else ~(a ^ mask)`,
    },
  ],
  boss: {
    seconds: 360,
    problem: 'sum-of-two-integers',
    note: 'The boss problem is Sum of Two Integers. Say what XOR and AND-shift each compute, why the loop ends, and why Python needs a mask.',
    quiz: [
      {
        prompt: 'What is x ^ x, and why does that solve Single Number?',
        options: ['0, so the pairs cancel and only the single number remains', 'x, so everything stays', '1, so everything is counted', 'x² so the numbers grow'],
        answer: 0,
        explain: 'XOR-ing a value with itself gives 0, and 0 ^ y = y.',
      },
      {
        prompt: 'What does n & (n − 1) do to the binary form of n?',
        options: ['Clears the lowest 1 bit', 'Sets the lowest 0 bit', 'Shifts n right', 'Inverts all bits'],
        answer: 0,
        explain: 'Subtracting 1 flips the lowest 1 bit and the zeros below it; ANDing keeps the higher bits and removes that 1.',
      },
      {
        prompt: 'In Counting Bits, why is bits[i] = bits[i >> 1] + (i & 1) correct?',
        options: ['i is i >> 1 with one more bit on the right, which is 1 exactly when i is odd', 'Because bits is sorted', 'Because shifting doubles the count', 'It is only valid for powers of two'],
        answer: 0,
        explain: 'Dropping the last bit of i gives i >> 1, so the only difference in the count is that last bit.',
      },
      {
        prompt: 'Why does the Sum of Two Integers loop terminate?',
        options: ['Each round the carry moves one place left until it falls off the top (or becomes 0)', 'Because XOR is commutative', 'Because Python stops', 'It does not terminate for positives'],
        answer: 0,
        explain: 'Carries are pushed to higher positions each round and eventually vanish (with a mask for negatives).',
      },
      {
        prompt: 'Why must Reverse Bits do exactly 32 rounds instead of looping until n is 0?',
        options: ['Leading zeros of n become trailing zeros of the result and must be counted', 'Because 32 is faster', 'Because n is never 0', 'To avoid overflow'],
        answer: 0,
        explain: 'The width is fixed, so the high zero bits matter in the reversal.',
      },
    ],
  },
};

export default topic;
