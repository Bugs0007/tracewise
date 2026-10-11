import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'Two pointers replaces a nested loop with a single sweep. Two indices move over the data, and every move discards options that can no longer matter, so the work stays linear.',
    'It comes in two main shapes. Converging pointers start at the two ends of a sorted or symmetric input and move inward (pairs that sum to a target, palindromes, containers). Same-direction pointers move together at different speeds (covered later with sliding windows and linked lists).',
    'The skill is the argument for the move: "if this pair is too small, this element can never be part of the answer, so drop it". If you can state that sentence, the pointers are safe.',
  ],
  checklist: [
    'The input is sorted, or order gives you a comparison to act on.',
    'You are looking for a pair or a triple that meets a condition (sum, area, equality).',
    'The structure is symmetric around its middle (palindromes, mirrored checks).',
    'A brute force that tries all pairs is O(n²), and each comparison tells you which side to give up.',
    'You need O(1) extra space and the input can be read in place.',
    'After fixing one element, the rest of the problem is "find a pair", which is a two-pointer sweep.',
  ],
  template: [
    {
      title: 'Converging pointers (sorted input, pair with a target)',
      code: `lo, hi = 0, len(a) - 1
while lo < hi:
    s = a[lo] + a[hi]
    if s == target:
        return [lo, hi]
    if s < target:
        lo += 1        # the smaller value cannot reach the target with anything left
    else:
        hi -= 1        # the larger value is too big for every remaining partner
return []`,
    },
    {
      title: 'Fix one, sweep two (3Sum style)',
      code: `a.sort()
for i in range(len(a) - 2):
    if i > 0 and a[i] == a[i - 1]:
        continue                    # same first value as before: skip
    lo, hi = i + 1, len(a) - 1
    while lo < hi:
        ...                         # converging sweep for the rest`,
    },
  ],
  boss: {
    seconds: 240,
    problem: 'container-with-most-water',
    note: 'The boss problem is Container With Most Water. The whole trick is which pointer you move, so say that out loud before you type.',
    quiz: [
      {
        prompt: 'For a **sorted** list and a target sum, two pointers starting at the ends find a pair in O(n). Why is it safe to move the left pointer when the current sum is too small?',
        options: ['The left value can never reach the target with any remaining right value', 'The list is short', 'Moving the right pointer is not allowed', 'It makes the loop shorter'],
        answer: 0,
        explain: 'The right value is the largest remaining one. If even that is too small a partner, every other partner is smaller still, so the left value is useless.',
      },
      {
        prompt: 'Which problem is a poor fit for converging two pointers?',
        options: ['Palindrome check', 'Pair summing to a target in a sorted list', 'Finding two equal values in an unsorted list', 'Container with most water'],
        answer: 2,
        explain: 'Without sorted order or symmetry, a comparison does not tell you which pointer to move. A hash set is the right tool for unsorted duplicates.',
      },
      {
        prompt: 'In Container With Most Water you always move the pointer at the **shorter** wall. Why?',
        options: ['Moving the taller wall can only shrink the width without raising the limit', 'Shorter walls are cheaper to move', 'It keeps the loop running longer', 'The taller wall is always the answer'],
        answer: 0,
        explain: 'The shorter wall caps the water. Any container keeping it and getting narrower cannot beat the current one, so the shorter wall can be discarded.',
      },
      {
        prompt: '3Sum is solved in O(n²). Where does that bound come from?',
        options: ['Sort once, then a linear two-pointer sweep for each first number', 'A hash map of all triples', 'Binary searching every pair', 'Trying every triple with early exits'],
        answer: 0,
        explain: 'Sorting costs O(n log n). Each of the n first numbers then needs one O(n) sweep, giving O(n²) overall.',
      },
      {
        prompt: 'In 3Sum, why do you skip a first number equal to the previous one?',
        options: ['Every triple that starts with that value was already found', 'Equal numbers cannot be summed', 'It makes the sort stable', 'To save memory'],
        answer: 0,
        explain: 'Triples are reported by value. Starting from the same value again would just reproduce triples already recorded.',
      },
      {
        prompt: 'Trapping Rain Water with two pointers handles the side with the **lower** end first. Why is its water level already known?',
        options: ['The other side is at least as tall, so its own running max is the limit', 'Lower bars hold more water', 'The higher side is always empty', 'The pointers cannot cross'],
        answer: 0,
        explain: 'If the left end is lower, a bar at least that tall exists on the right, so the water over the left bar is capped by the left running max alone.',
      },
      {
        prompt: 'Valid Palindrome skips characters that are not letters or digits. What is the loop condition that ends the sweep?',
        options: ['l < r', 'l == len(s)', 'r == 0', 'l + r == len(s)'],
        answer: 0,
        explain: 'When the pointers meet or cross, every pair has been checked. A single middle character needs no partner.',
      },
    ],
  },
};

export default topic;
